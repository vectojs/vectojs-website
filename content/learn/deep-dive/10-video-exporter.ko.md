+++
title = "10 — 결정적 비디오 내보내기 — 고정 단계 캡처"
description = "@vectojs/video-exporter가 벽 시계 시간을 고정 단계 씬 시계로 대체하고, 헤드리스 Chromium을 통해 캡처하며, PNG 프레임을 FFmpeg에 파이핑하여 H.264 MP4를 생성하는 방식 — 단계별 출력, 중단, 안전한 대상 유지를 위한 정리된 정리 포함."
weight = 30
+++

# 10 — 결정적 비디오 내보내기 — 고정 단계 캡처

> **Boss 10**은 애니메이션 시간을 재현 가능하게 만든다. 동일한 모듈, 동일한 `fps × duration`, 동일한 `seed` — 호스트 속도, 합성기 지터, 배경 탭과 무관하게 모든 내보내기가 동일한 프레임을 생성한다. 두 시계가 작용한다: **벽 시계**(`requestAnimationFrame`, `performance.now()` — 캡처 시작 전 브라우저가 한 것)와 **고정 단계 시계**(`Scene.step(dt)`, 정확히 `dt = 1000/fps` 프레임당). 내보내기는 첫 번째를 죽이고 두 번째를 프레임 0 전에 설치한다.

- **배울 내용**: 프레임-0 결정성이 어려운 부분인 이유; 씬 계약(`stop + step + 선택적 재설정`); Chromium → 캔버스 PNG → FFmpeg `image2pipe` 파이프라인; 단계별 출력, 중단 전파, 순서 있는 정리; CLI/API 표면과 각각을 선호하는 시점; 씬 작성자가 여전히 제거해야 하는 잔여 비결정성.
- **배우지 않을 내용**: VMT 라이프사이클/변환(boss 06), 렌더러 내부(boss 07), WASM 가속(boss 08). 이 문서는 캡처 시계와 인코드를 소유한다.

## 1. 결정적 내보내기가 어려운 이유 — 두 시계 문제

활성 VectoJS 씬은 `requestAnimationFrame` 틱(`packages/core/src/tree/Scene.ts:5569` `loop`)에서 진행된다. 각 틱은:

1. 벽 시계(`Scene.ts:5609`)에서 `dt = time - lastTime`을 계산한다;
2. ±30% 내에서 `1000/cap`으로 `dt`를 맞춘다(합성기 지터 숨기기, `Scene.ts:5625`);
3. 배경 탭이 물리학을 초 단위로 앞으로 밀지 않도록 `dt`를 `MAX_FRAME_DT = 100ms` (`Scene.ts:1114`, `:5636`)로 제한한다;
4. 드라이버를 업데이트하고, 변환을 합성하고, 레이아웃한 후 그린다.

이것은 활성 페이지에는 정확하지만 내보내기에는 치명적이다: 내보내기 시간은 **프레임 인덱스의 순수 함수**여야 한다.

- 같은 호스트의 두 실행이 호스트가 지터, 제한, 배경이 될 때마다 달라진다.
- 같은 씬을 공유하더라도 벤치마크와 내보내기는 속도가 다르다.
- `Math.random()`, 벽 시계 `Date.now()`, 비고정 프레임에서 해결되는 비동기 리소스는 프레임 0을 임의로 만들고, 이후 모든 프레임이 그 기반을 상속한다 (`packages/video-exporter/src/export-session.ts:78` 주석은 `#646` 참조).

해결책은 **첫 캡처 프레임 전에 벽 시계 루프를 멈추고 일정한 단계로 진행** (`packages/core/src/tree/Scene.ts:3423` `step(dt)`)하는 것이다. 결정성은 씬 작성자 규율이 된다: 모든 애니메이션, 스프링, 트윈은 주어진 `dt`만 통합해야 하고, 모든 무작위는 시드되어야 한다. 내보내기가 시계를 강제하고, 씬이 결정적 역학을 제공해야 한다.

## 2. 씬 계약 — `stop + step + 선택적 재설정`

내보내기 세션(`packages/video-exporter/src/export-session.ts:45`)은 다음을 수행한다:

1. `scene.loop()`를 중지(`Scene.stop()`);
2. `scene.step(1000/fps)`를 프레임 인덱스 `0`부터 `fps × duration - 1`까지 반복;
3. 각 단계 후 `canvas.toDataURL('image/png')`로 PNG를 캡처;
4. 마지막 단계 후 `ffmpeg` `image2pipe`로 파이프.

`step()`은 `renderMode`/`dirty`/`maxFPS`를 무시하고 무조건 렌더링하므로 (`Scene.ts:3420` 문서), 내보내기는 `onDemand` 건너뜀을 관찰할 수 없다. 씬이 `step()`에서 결정적으로 작동하도록 보장해야 한다 — `update()`는 `dt`만 사용해야 하고, `markDirty()`는 매 프레임 발화하지 않아야 한다(발화하면 `step()`이 여전히 렌더링하지만, `dirty` 플래그는 내보내기에서는 의미가 없다).

## 3. Chromium → PNG → FFmpeg 파이프라인

내보내기 세션은 헤드리스 Chromium(`packages/video-exporter/src/chromium.ts:78`)을 시작하고, `page.setViewport({ width, height, deviceScaleFactor: 1 })`을 설정한 후, `canvas` 요소를 PNG로 캡처한다. `ffmpeg`는 `-f image2pipe -i - -c:v libx264 -pix_fmt yuv420p`로 입력을 받는다 (`packages/video-exporter/src/ffmpeg.ts:112`).

단계별 출력은 `staged` 디렉토리(`tmp/export-staged/` 기본)에 프레임 PNG를 저장하며, `abort`는 `SIGINT`를 Chromium 프로세스와 `ffmpeg` 파이프에 전파한다 (`packages/video-exporter/src/export-session.ts:234`). 정리는 `staged` 디렉토리를 삭제하고 Chromium 컨텍스트를 닫으며, `SIGTERM`이 `catch` 블록에서 처리되지 않으면 `kill -9`로 강제 종료한다.

## 4. CLI/API 표면

CLI (`packages/video-exporter/bin/export-cli.ts:45`):

```bash
vecto-export --scene ./demo.ts --fps 30 --duration 5 --output out.mp4
```

API (`packages/video-exporter/src/export-session.ts:67`):

```typescript
const session = new ExportSession(scene, {
  fps: 30,
  duration: 5,
  stagedDir: 'tmp/',
});
await session.run();
```

`run()`은 `Promise<StagedOutput>`를 반환하며, `abort()`는 `SIGINT` 핸들러를 등록하고 `session.aborted`를 `true`로 설정한다. `StagedOutput`는 `frames` 배열과 `ffmpeg` 명령 로그를 포함한다.

## 5. 잔여 비결정성 — 씬 작성자가 제거해야 할 것

- `Math.random()`이 `step()` 내에서 사용되면 매 실행이 달라진다 — 시드를 설정하라.
- `requestAnimationFrame`이나 `setTimeout`이 `step()` 외부에서 사용되면 내보내기에서 무시된다 — `update()`는 `dt`만 사용하라.
- `image.load()`가 비동기로 해결되면 `step()`이 이미지 없이 렌더링할 수 있다 — `load`가 완료된 후에만 `start()`를 호출하라.
- `font.load()`가 비동기로 해결되면 텍스트 렌더링이 달라진다 — 폰트가 로드된 후에만 내보내기하라.
- `DPR`이 `window.devicePixelRatio`로 직접 읽히면 내보내기와 라이브 렌더링이 달라진다 — `renderer.pixelRatio`를 사용하라.
