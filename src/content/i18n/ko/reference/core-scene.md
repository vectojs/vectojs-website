---
title: 'Scene'
description: '최상위 VectoJS 오케스트레이터: 생성자 옵션, 렌더 루프, renderMode/maxFPS 및 유휴 자동 스로틀, 생명주기 메서드, 플러그형 WebGL/WebGPU 백엔드 레지스트리.'
order: 2
---

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
| `respectReducedMotion` | `boolean`                     | `true`           | OS가 `prefers-reduced-motion`을 요청하면 `REDUCED*MOTION*FPS`(30)로 제한 — 또는 그 값과 `maxFPS` 중 낮은 값. `false`는 OS 설정을 무시.                                                                                                                                  |
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

`effectiveMaxFPS` = `maxFPS`, OS가 reduced motion을 요청하고
`respectReducedMotion`이 켜져 있으면 30(`REDUCED*MOTION*FPS`)으로 더 낮춰집니다.
`0`은 무제한을 의미합니다.

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

## 플러그형 백엔드 레지스트리 (정적)

```ts
Scene.registerWebGLPointRendererCreator(creator: WebGLPointRendererCreator): void
Scene.registerWebGPUParticleSystemManager(managerClass: any): void
```

`.` 진입점이 자동으로 호출합니다. 관련 인터페이스
(`IWebGLPointRenderer`, `IWebGPUParticleSystemManager`,
`WebGLPointRendererCreator`)는 커스텀 백엔드를 위해 내보내집니다. WebGPU 디바이스 손실은
영구적으로 WebGPU를 비활성화하기 전에 지수 백오프(3회 재시도)로 자동 복구됩니다.

## 관련 항목

[`Entity`](/reference/core-entity/) (Scene이 소유한 트리) ·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/) ·
[`ComputeParticleEntity`](/reference/core-particles/) ·
[a11yRoot & the agent contract](/reference/core-a11y/) ·
[`@vectojs/core` 개요](/reference/core-api/)
