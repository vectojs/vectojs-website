+++
title = "@vectojs/video-exporter"
description = "VectoJS Scene을 프레임별로 진행하고 Chromium과 FFmpeg로 캔버스 출력을 H.264 MP4로 인코딩하는 CLI 및 라이브러리."
weight = 47
+++

# `@vectojs/video-exporter`

문서 버전: **0.2.4**

`@vectojs/video-exporter`는 헤드리스 Chromium에서 VectoJS 씬을 한 번에 하나의 고정 시간 단계로 구동하고, 캔버스를 PNG 프레임으로 캡처하며, 해당 프레임을 FFmpeg로 파이프하여 H.264 MP4로 인코딩합니다.

## 특징

- **고정 단계 씬 제어**: 일반 Scene 루프를 중지하고 각 캡처 전에 `scene.step(1000 / fps)`를 호출합니다. 이렇게 하면 요청된 시뮬레이션 시간이 결정적이게 됩니다; 관련 없는 클록, 네트워크 입력 또는 무작위성을 사용하는 애플리케이션 코드가 결정적이라는 것을 보장하지는 않습니다.
- **PNG 이미지 파이프**: Chromium에서 `canvas.toDataURL('image/png')`를 호출하고, Node에서 base64 결과를 디코딩하며, 각 PNG를 FFmpeg의 stdin에 씁니다.
- **표준 MP4 출력**: FFmpeg의 `libx264` 인코더와 `yuv420p` 픽셀 포맷을 사용합니다.
- **선택적 오디오 믹싱(0.3.0+)**: 외부 오디오 파일을 AAC 트랙으로 내보내기에 믹싱하고 비디오 길이로 자릅니다. 제공하지 않으면 내보내기는 무음으로 유지됩니다.
- **로컬 소스 헬퍼**: 로컬 모듈 경로의 경우 내장 Vite 서버를 시작하고 소스 디렉토리를 수정하지 않고 메모리 내 HTML 엔트리를 제공합니다. 호스팅된 HTTP(S) 페이지도 허용됩니다.
- **원자적 출력**: 대상 옆의 고유한 파일로 인코딩하고 FFmpeg가 성공적으로 종료된 후에만 요청된 MP4를 대체합니다. 실패하거나 중단된 내보내기는 기존 대상을 보존합니다.
- **결정적 정리**: 성공, 실패 또는 중단 시 진행 출력을 중지하고, FFmpeg를 종료하고, Chromium과 Vite를 닫고, 스테이징된 파일을 제거합니다.

---

## 설치

```bash
bun add @vectojs/video-exporter
```

내보내기는 `PATH`에 `ffmpeg`가 필요합니다. Chromium은 `PUPPETEER_EXECUTABLE_PATH`에서 확인된 후, 있는 경우 `/usr/bin/chromium`, 그 다음 Puppeteer의 구성된 또는 번들 브라우저에서 확인됩니다.

```bash
ffmpeg -version
PUPPETEER_EXECUTABLE_PATH=/opt/chrome/chrome bunx vecto-export ./scene.ts
```

Vite는 런타임 의존성이며 로컬 JavaScript 및 TypeScript 엔트리에 대해 자동으로 설치됩니다.

## 사용법 (CLI)

로컬 JavaScript/TypeScript 모듈을 직접 전달하세요:

```bash
bunx vecto-export ./my-animation.ts -o output.mp4 -f 60 -d 5
```

또는 사전 호스팅된 URL을 전달하세요:

```bash
bunx vecto-export http://localhost:5173 -o output.mp4 -f 60 -d 5
```

### 옵션

- `-o, --output` : 출력 파일 (기본값: out.mp4)
- `-w, --width` : 픽셀 단위 너비 (기본값: 1280)
- `-h, --height` : 픽셀 단위 높이 (기본값: 720)
- `-f, --fps` : 초당 프레임 수 (기본값: 60)
- `-d, --duration`: 시간(초) (기본값: 5)
- `-a, --audio`(0.3.0+): 내보내기에 믹싱할 오디오 파일(AAC로 인코딩)

## 내부 API 사용법

```typescript
import { exportVideo } from '@vectojs/video-exporter';

await exportVideo({
  url: 'my-animation.ts', // 또는 http URL
  outputPath: 'out.mp4',
  width: 1920,
  height: 1080,
  fps: 60,
  duration: 10,
});
```

렌더링된 페이지는 시작되었거나 시작 가능한 VectoJS Scene을 `window.vectoScene`으로 노출해야 합니다. 내보내기는 최대 10초 동안 이를 기다리며, 호출 가능한 `stop()` 및 `step(dt)` 메서드가 필요하며, 그런 다음 고정 단계로 진행합니다. 첫 번째 `<canvas>`는 요청된 출력 차원으로 크기가 조정되고 캡처됩니다.

**씬 리셋 계약(`0.2.4+`).** 페이지 로드와 `stop()` 사이에는 페이지 자체의 rAF 루프가
자유롭게 실행되므로, 벽시계 상태(인트로 트윈, 이징된 등장)는 캡처가 시작될 때 임의적이었고,
이후의 모든 프레임은 그 비결정론적 기준에서 출발해야만 결정적이었습니다. 내보내기는 이제
`stop()` 직후, 프레임 0이 스텝되거나 캡처되기 전에 `window.vectoScene`의 선택적
`reset()`을 한 번 호출합니다. 첫 `step(dt)`까지 정적으로 렌더링하는 씬은 영향을 받지
않으며 `reset()`이 필요 없습니다; 로드 시점 상태를 지닌 씬이 t=0 표현으로 돌아가려면
그것을 노출하는 것이 **필수**입니다. `reset()`이 없는 씬은 있는 그대로 내보내집니다.

```typescript
const scene = new Scene(document.querySelector('canvas')!);
// 엔티티 추가...
(window as Window & { vectoScene?: Scene }).vectoScene = scene;
scene.start();
```

프레임 수는 `Math.ceil(fps × duration)`입니다. FFmpeg가 0이 아닌 코드로 종료되면 Promise는 제한된 stderr 꼬리와 함께 거부됩니다. 오류는 유효성 검사, Vite, Chromium/페이지 계약, 캡처, FFmpeg, 출력 커밋 및 정리 단계를 구분합니다.

## 오디오(0.3.0+)

API에서 `audioPath`를(CLI에서는 `-a, --audio <file>`을) 전달하면 오디오 트랙을 내보내기에 믹싱할 수 있습니다:

```typescript
await exportVideo({
  url: 'my-animation.ts',
  outputPath: 'out.mp4',
  width: 1280,
  height: 720,
  fps: 60,
  duration: 6,
  audioPath: 'voice.wav', // encoded as AAC, trimmed to the video length
});
```

트랙은 192 kbps AAC로 인코딩되며 `-shortest`가 비디오 길이로 자르므로, 지나치게 긴 오디오 파일이 내보내기를 연장하지 않습니다. 존재하지 않거나 파일이 아닌 경로는 Chromium이 시작되기 전의 옵션 검증에서 거부됩니다. 캔버스 캡처 파이프라인 자체는 소리를 생성하지 않으므로 `audioPath`를 제공하지 않는 한 내보내기는 무음으로 유지됩니다.

## 취소 및 프로세스 신호

`AbortController`로 API 내보내기를 중단하세요. CLI는 `SIGINT`와 `SIGTERM`을 동일한 정리 경로에 매핑하고, 리소스가 닫힐 때까지 기다린 후 종료 코드 130 또는 143을 반환합니다.

```typescript
const controller = new AbortController();
const exportPromise = exportVideo({
  url: './my-animation.ts',
  outputPath: './out.mp4',
  width: 1920,
  height: 1080,
  signal: controller.signal,
});

controller.abort();
await exportPromise;
```

## Chromium 샌드박스 정책

샌드박스는 일반 사용자에 대해 활성화 상태를 유지합니다. 루트 또는 `VECTO_CHROMIUM_NO_SANDBOX=1`이 명시적으로 설정된 경우에만 비활성화되며, 내보내기는 두 경우 모두 경고합니다. 환경 플래그는 제한된 CI 실행기를 위한 것입니다; 다른 곳에서는 일반 비루트 프로세스를 선호하세요.
