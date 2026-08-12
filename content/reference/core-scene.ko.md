+++
title = "Scene"
description = "최상위 VectoJS 오케스트레이터: 생성자 옵션, 렌더 루프, renderMode/maxFPS 및 유휴 자동 스로틀, 생명주기 메서드, 플러그형 WebGL/WebGPU 백엔드 레지스트리."
weight = 2
+++

# `Scene`

[`@vectojs/core`](/reference/core-api/)의 일부입니다.

```ts
new Scene(canvas: HTMLCanvasElement, options?: SceneOptions)
```

최상위 오케스트레이터. `<canvas>`당 하나의 `Scene`. `add()`로 `Entity` 객체를 추가한 후
`start()`로 루프를 시작합니다.

```ts
const scene = new Scene(document.querySelector('canvas')!);
scene.add(new Circle({ radius: 24, fill: '#38bdf8' }).setPosition(100, 100));
scene.start();
```

Scene은 캔버스의 **부모** 엘리먼트에 두 개의 투명한 형제 `<div>`를 추가합니다
(a11y 섀도우 레이어용 `z-index:10`, DOM-포털 레이어용
`z-index:9`), 그리고 부모가 `static`이면 `position:relative`로 강제 설정합니다.
SSR/Node(`document` 없음)에서는 a11y/포털 투영이
no-op으로 저하되어 헤드리스 레이아웃 / `toSVG()`가 여전히 작동합니다.

## SceneOptions

| 옵션                   | 타입                          | 기본값           | 효과                                                                                                                                                                                                                                                                    |
| ---------------------- | ----------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pointBackend`         | `'canvas' \| 'webgl'`         | `'canvas'`       | 표현 가능한 `getBatchCircle()`/`getBatchRect()` 잎의 백엔드. `'webgl'`은 WebGL2 캔버스(`z-index:5`)를 쌓고 해당 기본 요소를 배치; WebGL2를 사용할 수 없으면 Canvas로 폴백. GL 레이어는 2D 콘텐츠 위에 합성되므로, 교차-레이어 페인터 순서는 인터리브되지 않습니다.      |
| `particleBackend`      | `'auto' \| 'webgpu' \| 'cpu'` | `'auto'`         | [`ComputeParticleEntity`](/reference/core-particles/) 백엔드. `'auto'`는 WebGPU를 시도하고 CPU로 폴백하기 전에 경고. `'webgpu'`는 명시적으로 WebGPU를 요청하지만 현재 오류를 기록하고 초기화 실패 시 여전히 폴백. `'cpu'`는 CPU 시뮬레이션 강제(`webgpuDisabled` 설정). |
| `maxFPS`               | `number`                      | `60`             | 프레임률 캡. `0` = 무제한(네이티브 리프레시). 연속 애니메이션은 여전히 실행되지만 덜 자주. (내부적으로 `NODE_ENV=test`/`VITEST`에서 `0`). 라이브로도 설정 가능(`scene.maxFPS`).                                                                                         |
| `respectReducedMotion` | `boolean`                     | `true`           | OS가 `prefers-reduced-motion`을 요청하면 `REDUCED_MOTION_FPS`(30)로 제한 — 또는 그 값과 `maxFPS` 중 낮은 값. `false`는 OS 설정을 무시.                                                                                                                                  |
| `readingDirection`     | `'ltr' \| 'rtl'`              | `'ltr'`          | a11y/자동화 섀도우 트리의 읽기 방향. 키보드 **탭 순서**와 스크린 리더 순회가 씬 그래프 삽입 순서가 아닌 _시각적_ 읽기 순서를 따르도록 합니다. `'rtl'`은 각 행 내의 인라인 순서를 반전합니다. 라이브로도 설정 가능(`scene.readingDirection`).                            |
| `a11ySyncInterval`     | `number`                      | `0`              | a11y 섀도우-DOM 동기화를 최대 N ms당 한 번으로 스로틀. `0` = 렌더링된 모든 프레임 동기화. 작은 값(예: `100`)은 무거운 애니메이션 중 a11y 레이어를 최종적으로 일관되게 유지하면서 프레임별 DOM 쓰기를 절약. `scene.a11ySyncInterval`로 라이브 설정 가능.                 |
| `debugA11y`            | `boolean`                     | `false`          | 섀도우 노드를 `opacity:0` 대신 파란색 점선 외곽선(개발 보조)으로 렌더링. 어느 쪽이든 자동화로 클릭 가능한 상태 유지.                                                                                                                                                    |
| `renderer`             | `IRenderer`                   | `CanvasRenderer` | 커스텀 렌더러(예: [`@vectojs/three`](/reference/three-renderer/)의 `ThreeRenderer`).                                                                                                                                                                                    |
| `disableWindowResize`  | `boolean`                     | `false`          | 자동 `window` 리사이즈 리스너 건너뜀. 커스텀 레이아웃 컨테이너 / 오프스크린 캔버스 내부에서 사용한 후 `resize(w, h)`로 크기 제어.                                                                                                                                       |
| `maxDPR`               | `number`                      | `undefined`      | Canvas2D 및 `pointBackend: 'webgl'` 백킹 스토어의 크기 조정에 사용되는 디바이스 픽셀 비율 상한. `undefined`는 실제 상한 없는 `devicePixelRatio`를 읽음. 모든 `resize()` 호출 시 재적용됨(구축 시에만이 아님). 아래 \"렌더 DPR 상한 설정\" 참조.                         |

참고: `renderMode`는 **공개 필드**(기본값 `'always'`)이며 생성자 옵션이
아닙니다 — 생성 후 `scene.renderMode = 'onDemand'`로 설정하세요.

### 렌더 DPR 상한 설정 (`maxDPR`)

백킹 스토어 렌더 비용은 `논리적 크기 × dpr²`로 확장되며, 선형이 아닙니다 — DPR 1(대부분의 개발 노트북)에서 부드러운 전체 화면 Scene이 DPR 3 디스플레이에서 16ms 프레임 예산을 초과할 수 있으며, 실제로 그 디스플레이에서 테스트되기 전까지는 보이지 않습니다. 이는 `pointBackend: 'webgl'`에서 가장 심각합니다. 별도의 스택 캔버스를 렌더링하므로 프래그먼트/오버드로 비용이 정확히 이 DPR² 곡선을 따르기 때문입니다 — 전체 화면 1200-파티클 필드는 DPR 3에서 **116ms** 최대 프레임, DPR 1에서는 완벽한 60fps였습니다.

```ts
const scene = new Scene(canvas, { pointBackend: 'webgl', maxDPR: 2 });
```

`maxDPR: 2`는 디스플레이를 레티나 선명도로 유지하면서(2배는 일반 시청 거리에서 대부분의 눈이 해결할 수 있는 한계를 초과), 백킹 스토어 픽셀 수를 제한합니다 — DPR 3에서 `2² / 3² ≈ 0.44×`의 픽셀로 약 절반입니다. 이 옵션이 존재하기 전에는 Scene 구축 전에 `window.devicePixelRatio`를 몽키패치하는 것만이 해결책이었습니다. 이제는 `maxDPR`를 사용하세요 — 모든 리사이즈에서 올바르게 재적용되며, 일회성 `Object.defineProperty` 패치로는 불가능합니다.

### 두 개의 투영 마진

콘텐츠 투영에는 두 개의 독립적인 계층이 있으며, `1.31.0` 이후 각 계층은 자체 마진을 가집니다:

- **시맨틱**(`contentSemanticMargin`) — 이 블록에 _어떤_ DOM이라도 있는가? DOM을 가진 블록은 네이티브 페이지 내 검색, 복사, 스크린 리더의 미리 읽기에 자신의 텍스트를 제공합니다.
- **인터랙션**(`contentProjectionMargin`) — 해당 블록의 _행 단위 캐리어_를 구축하는가? 캐리어는 브라우저에 선택을 위한 행 단위 기하 정보를 제공합니다.

분할 전에는 하나의 스칼라가 둘 다를 제어했기 때문에 두 가지 구성만 존재했습니다. 유한한 마진은 화면 밖 블록을 완전히 해제하여 화면 밖 텍스트를 검색할 수 없게 만들었고, `Infinity`는 문서의 모든 캐리어까지 실체화했습니다.

둘을 분리하면 유용한 중간 지점이 생깁니다:

```ts
const scene = new Scene(canvas, {
  // Every block keeps its text, so find-in-page sees the whole document.
  contentSemanticMargin: Infinity,
  // Carriers stay bounded by the viewport, so cost scales with what is visible.
  contentProjectionMargin: scene.height,
});
```

> [!IMPORTANT]
> `Infinity`는 `contentSemanticMargin`에서는 안전하지만 `contentProjectionMargin`에서는 **안전하지 않습니다**. 지원되지 않는 이유가 되는 비용은 상주 텍스트가 아니라 윈도우 처리되지 않은 캐리어 대역에서 발생합니다.

인터랙션 마진 밖이지만 시맨틱 마진 안에 있는 블록은 전체 텍스트를 단일 노드로 투영하며 캐리어 자식을 **가지지 않습니다**. 검색과 복사가 가능하고, 없는 것은 행 단위 선택 기하 정보뿐인데 그것은 뷰포트로 스크롤하지 않으면 어차피 접근할 수 없습니다.

일회성 비용은 알아둘 만합니다. 상주 계층은 첫 동기화에서 블록당 하나의 요소를 실체화하며, 생성된 노드당 약 13 µs로 측정되었습니다 — 1000개 블록에서 약 47 ms입니다. 정상 상태는 저렴합니다. 자신의 콘텐츠를 스탬프할 수 있는 엔티티 덕분에 Scene이 변경되지 않은 블록의 재투영을 완전히 건너뛸 수 있기 때문입니다. 따라서 이것은 문서를 열 때의 비용이며 프레임당 비용이 아닙니다.

## 공개 필드

```ts
scene.canvas: HTMLCanvasElement
scene.width: number
scene.height: number
scene.overlayRoot: Entity          // 메인 트리 위에 그려지는 자식, 클립 경계 우회
scene.renderMode: 'always' | 'onDemand'   // 기본값 'always'
scene.maxFPS: number               // 기본값 60
scene.respectReducedMotion: boolean
scene.a11ySyncInterval: number
scene.particleBackend: 'auto' | 'webgpu' | 'cpu'
scene.webgpuDisabled: boolean      // getter — _disabled이거나 particleBackend === 'cpu'이면 true
scene.a11yNeedsReorder: boolean
scene.readingDirection: 'ltr' | 'rtl'   // tab/traversal order; setting it re-flows
scene.forcedColors: boolean             // getter — OS is in a forced-colors mode
```

## renderMode, maxFPS 및 유휴 자동 스로틀

- **`renderMode: 'always'` (기본값)** — 모든 프레임 다시 렌더링, 유효 FPS로 제한.
- **`renderMode: 'onDemand'`** — Scene이 _더티_(`markDirty()` 참조)이거나
  애니메이션/트랜지션 드라이버가 대기 중일 때만 그리기. 정적 rAF 틱은
  여전히 트리에서 보류 중인 모션을 검사하지만, 엔터티 업데이트/렌더 및
  GPU 제출을 건너뜁니다. 정적 / 이벤트-구동 UI에 이상적.

**유휴 자동 스로틀 (핵심 주의사항).** Scene은 더티가 아니고
메인/오버레이 트리의 노드에 보류 중인 `animate()` 트윈이 없을 때
**정적**으로 간주됩니다. `'always'` 모드에서 `maxFPS > 0`인 경우, 정적 Scene은
배터리/GPU 절약을 위해 **~2 fps**로 스로틀됩니다. `dirty` 플래그는 렌더링된
모든 프레임의 끝(포스트-렌더)에서 `false`로 리셋되므로:

> 커스텀 `update()` 내부에서 `entity.x` 등을 변경하여 수동 애니메이션을 하는 경우,
> `update()` **내부**에서 `markDirty()`를 호출해도 소용없습니다 — 포스트-렌더
> 리셋이 이를 지우고, 다음 프레임의 정적 검사는 `dirty === false`를 보고
> 2fps로 스로틀합니다. [`entity.animate()`](/reference/core-entity/#애니메이션)(트윈이 실행되는 동안
> Scene을 비-정적으로 유지)를 통해 모션을 구동하거나, 프레임 **사이**에서
> (이벤트 핸들러, 별도의 `rAF` 또는 타이머에서) `scene.markDirty()`를 호출하여
> 플래그가 다음 루프 반복까지 살아남도록 하세요.

`effectiveMaxFPS` = `maxFPS`, OS가 감소된 모션을 요청하고 `respectReducedMotion`이 켜져 있으면 30(`REDUCED_MOTION_FPS`)으로 더 낮아집니다. `0`은 무제한을 의미합니다.

### 오프스크린 일시정지 및 dt 클램프

놓치기 쉬운 두 가지 루프 동작:

- **오프스크린 Scene은 렌더링을 중지합니다.** 캔버스의 `IntersectionObserver`가 캔버스가 완전히 뷰포트 밖으로 스크롤되면 rAF 루프를 일시정지하고 다시 진입할 때 재개합니다 — 아무도 보지 않는 Scene에 대한 완전한 업데이트/렌더링을 실행하는 대신. `IntersectionObserver`를 사용할 수 없는 곳(SSR/jsdom)에서는 Scene이 항상 화면에 있는 것으로 간주되므로 동작이 변경되지 않습니다.
- **`dt`는 100ms로 클램프됩니다** (`MAX_FRAME_DT`). 백그라운드 탭, 중단점 또는 긴 GC 일시정지 후 실제 경과 시간은 초 단위가 될 수 있습니다. 해당 원시 값을 물리/트윈 적분에 전달하면 모든 것이 순간이동합니다. `update(dt)`에서 `dt`를 직접 적분하는 경우 100ms를 초과하지 않는다는 점에 유의하세요.

## 접근성 및 외관

| 멤버                   | 타입               | 설명                                                                                                                                                                                         |
| ---------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readingDirection`     | `'ltr' \| 'rtl'`   | a11y 섀도우 트리를 정렬하여 **탭 순서**가 시각적 읽기 순서와 일치하도록 합니다(행은 위에서 아래로, 그 다음 인라인). 설정하면 다음 동기화 시 재정렬이 트리거됩니다. 생성자 옵션이기도 합니다. |
| `forcedColors`         | `boolean` (getter) | OS가 강제 색상 모드(Windows 고대비)일 때 `true`. `(forced-colors: active)`로 감지; 토글 시 Scene이 **자동으로 다시 그려집니다**.                                                             |
| `prefersReducedMotion` | `boolean` (getter) | OS가 감소된 모션을 요청하고 `respectReducedMotion`이 켜져 있을 때 `true`. 애니메이션 드라이버가 읽으며, 트윈하는 대신 opacity가 아닌 속성을 스냅합니다.                                      |

`<canvas>`는 불투명 픽셀이므로 브라우저의 강제 색상 리매핑이 그리는 내용에 영향을 미치지 않습니다. 컴포넌트가 직접 반응해야 합니다:

```ts
render(r: IRenderer) {
  const forced = this.scene?.forcedColors ?? false;
  r.fill(forced ? 'ButtonFace' : this.bg);
  r.fillText(this.label, x, y, this.font, forced ? 'ButtonText' : this.color);
}
```

[a11yRoot & 에이전트 계약](/reference/core-a11y/#강제-색상-고대비)를 참조하세요.

## 생명주기 메서드

```ts
scene.add(entity: Entity): this              // Scene 루트에 첨부
scene.remove(entity: Entity): this           // 분리 + 해당 a11y 섀도우 노드 재귀적 정리
scene.start(): void                          // rAF 루프 시작; 멱등성; width/height가 0이면 한 번 경고
scene.stop(): void                           // 현재 프레임 후 중단; start()가 재개
scene.destroy(): void                        // 소유한 엔터티 하위 트리/리소스, 루프, 리스너, DOM 레이어, GPU 관리자, 렌더러를 멱등적으로 파괴
scene.markDirty(): void                      // 다음 프레임에 다시 그리기 요청 (onDemand에서 의미 있음 + 유휴 스로틀 탈출)
scene.resize(width: number, height: number): void   // 뷰포트 설정; 렌더러 + GL 레이어 리사이즈; 더티 표시
scene.showOverlay(overlay: Entity): void     // overlayRoot에 추가 (위에 그려짐, 클립 없음)
scene.hideOverlay(overlay: Entity): void
scene.detachA11y(entity: Entity): void       // 트리에서 제거하지 않고 하위 트리의 섀도우 노드 제거
```

> **`resize(w, h)`는 파티클 시뮬레이션 전에 실행되어야 합니다.** Width/height는
> `disableWindowResize`가 설정되지 않은 경우 `window.innerWidth/innerHeight`에서 가져오며,
> 그렇지 않으면 `canvas.width || canvas.clientWidth || 0`으로 폴백됩니다. `0×0`
> 뷰포트는 파티클이 0 박스에서 시뮬레이션되어 렌더링되지 않을 수 있습니다.
> `start()`는 width 또는 height가 0일 때 일회성 경고를 기록합니다.
>
> `resize()`는 또한 텍스트-투영 메트릭 경계입니다. 논리적 width와 height가
> 변경되지 않았더라도 커스텀 컨테이너 또는 애플리케이션 CSS 줌 변경 후에 호출하세요;
> Core 1.8은 콜드 보정 키를 재구축하고 새로운 Firefox/Chromium Range 지오메트리를
> 기다린 후 준비된 그리드를 준비된 것으로 표시합니다.
>
> **`syncA11y`는 프레임 내에서 생성/업데이트만 하고 정리하지 않습니다.** 컴포넌트가
> 매 프레임 대화형 _자식_ 엔터티를 교체하는 경우, 버리기 전에
> `detachA11y(child)`를 호출하거나 해당 `<a>`/컨트롤 섀도우 노드가
> 누출됩니다. (`remove()`는 이미 재귀적으로 정리합니다.)

## 기타 Scene 메서드

```ts
scene.getRenderer(): IRenderer
scene.getRoot(): Entity
scene.clientToScene(clientX: number, clientY: number): Point // 뷰포트 → 논리적 Scene 좌표
scene.render(renderer: IRenderer, dt = 0, time = 0): void   // 메인 렌더러가 상태 진행; 보조 렌더러는 읽기 전용 스냅샷 그림
scene.toSVG(): string                        // SVGRenderer를 통한 읽기 전용 현재-상태 스냅샷 → 평면 SVG XML
scene.findEntityAt(x, y): Entity | null      // isPointInside()가 true를 반환하는 최상위 엔터티 (깊이-우선, 앞-에서-뒤; 대화형 필터 없음)
scene.getA11yElement(entityId: string): HTMLElement | undefined
scene.getA11yTree(): A11yTreeNode[]          // 투영된 섀도우 노드의 중첩 스냅샷 (id/tag/role/label/value/...)
```

## User Timing 계측

Scene은 렌더 페이즈 주변에서 [`User Timing`](https://developer.mozilla.org/en-US/docs/Web/API/User_Timing_API) 마크/측정을 발생시킬 수 있으므로, 프로파일러 캡처가 프레임이 시간을 보내는 위치를 정확히 보여줍니다. 기본적으로 꺼져 있습니다. `userTiming` 옵션으로 활성화하거나 `scene.setUserTiming(true)`로 라이브 활성화합니다:

```ts
const scene = new Scene(canvas, { userTiming: true });
// or
scene.setUserTiming(true); // runtime toggle
scene.userTiming; // read the current state
```

안정적인 측정 이름은 `VECTO_USER_TIMING`으로 내보내집니다:

```ts
VECTO_USER_TIMING.scene; // { transform, drawWalk, entityPaint, flush, a11ySync }
VECTO_USER_TIMING.markdown; // { parse }
// e.g. 'vecto:scene:transform', 'vecto:markdown:parse'
```

`@vectojs/core`는 엔진이 내부적으로 사용하는 저수준 헬퍼도 내보냅니다(커스텀 렌더러나 계측된 컴포넌트가 자체 페이즈를 추가하는 데 사용할 수 있음):

```ts
beginVectoUserTiming(name: string): VectoUserTimingSpan | null
endVectoUserTiming(span: VectoUserTimingSpan | null): void
measureVectoUserTiming(name: string, durationMs: number): void
```

호스트가 마크/측정을 구현하지 않으면 `beginVectoUserTiming`은 `null`을 반환하고(`measureVectoUserTiming`은 no-op) 선택적 프로파일링은 결코 런타임 요구사항이 아닙니다. 스팬은 고유하게 명명된 시작/끝 마크를 사용하며 `endVectoUserTiming`에서 해제됩니다. `measureVectoUserTiming`은 분리된 호출에서 누적된 지속 시간에 대해 현재 시간에 고정된 하나의 측정을 발생시킵니다 — 모든 엔터티를 계측하지 않고 프레임당 엔터티 페인트 합계를 보고하는 경로입니다.

## 플러그형 백엔드 레지스트리 (정적)

```ts
Scene.registerWebGLPointRendererCreator(creator: WebGLPointRendererCreator): void
Scene.registerWebGPUParticleSystemManager(managerClass: any): void
```

`.` 진입점이 자동으로 호출합니다. 관련 인터페이스
(`IWebGLPointRenderer`, `IWebGPUParticleSystemManager`,
`WebGLPointRendererCreator`)는 커스텀 백엔드를 위해 내보내집니다. WebGPU 디바이스 손실은
영구적으로 WebGPU를 비활성화하기 전에 지수 백오프(3회 재시도)로 자동 복구됩니다.

## 프레임 텔레메트리 (`frameStats`, 1.13.0)

```ts
scene.frameStats: FrameStats; // 라이브 루프 텔레메트리 (읽기 전용)

interface FrameStats {
  fps: number; // 렌더링된 프레임 리듬, maxFPS로 클램프; 첫 프레임 쌍까지 0
  frameTimeMs: number; // 마지막 render() 패스의 벽시계 시간 (a11y/콘텐츠 동기화 제외)
  frameIntervalMs: number; // 렌더링된 프레임 간의 평활화된 간격 (EMA)
  dt: number; // 마지막 렌더링된 프레임에 전달된 dt
  renderedFrames: number; // start() 이후 렌더링된 총 프레임
  skippedFrames: number; // start() 이후 건너뛴 rAF 틱 총합 (idle/onDemand/capped)
  renderMode: 'always' | 'onDemand';
  dirty: boolean; // 다시 그리기가 현재 대기 중인지 여부
}
```

`fps`는 _실제로 렌더링된_ 프레임 간의 간격에서 파생되므로, 유휴 `onDemand` 씬과 `maxFPS` 캡 또는 정적 자동 스로틀링에 의해 드롭된 프레임은 그것을 낮추지 않습니다 — 원시 rAF 속도가 아닌 실제 다시 그리기의 리듬을 보고합니다. 타이밍은 `requestAnimationFrame` 루프에서 측정됩니다. `step()`(결정적 내보내기)에 의해서만 구동되는 씬은 제로로 둡니다. 렌더러는 항상 전체 캔버스를 다시 그리므로 부분 더티 사각형은 없습니다 — `dirty`는 불리언 다시 그리기 대기 플래그입니다. [`@vectojs/devtools`](/reference/devtools/) 성능 HUD를 구동합니다.

## 관련 항목

[`Entity`](/reference/core-entity/) (Scene이 소유한 트리) ·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/) ·
[`ComputeParticleEntity`](/reference/core-particles/) ·
[a11yRoot & the agent contract](/reference/core-a11y/) ·
[`@vectojs/core` 개요](/reference/core-api/)
