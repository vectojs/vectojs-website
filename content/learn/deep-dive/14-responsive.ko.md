---
title: '14 — 반응형 레이아웃 & 상호작용 — 뷰포트 및 입력 적응'
description: '뷰포트를 제약으로: 크기 조정/확대 리플로우, Stack/Flow 레이아웃 패스, 패널 대시보드, VirtualList 윈도우, ScrollView 물리, ResizablePanel 핸들, 오버레이 배치, 호버/포커스 상태 — VectoJS의 캔버스 네이티브 세계에서 모두.'
order: 34
---

# 14 — 반응형 레이아웃 & 상호작용 — 뷰포트 및 입력 적응

> DOM 브라우저에서 반응형 레이아웃은 CSS다: 엔진이 제공하는 미디어 쿼리, 플렉스박스, 그리드, 스크롤 컨테이너. VectoJS에는 CSS 엔진이 없다 — 모든 픽셀은 단일 `<canvas>` 위의 유지된 엔티티 트리에 대한 산술이다. 뷰포트는 캐시를 무효화하는 또 다른 숫자일 뿐이고, 스크롤 오프셋은 스프링이 구동하는 `y`이며, 오버레이는 `overlayRoot`에 재부모화된 엔티티와 명시적 배치 계산이다. 이 문서는 창이 크기 조정되거나, 사용자가 확대하거나, 손가락이 패널 구분선을 드래그할 때 그 숫자가 일관되게 유지되는 방식이다.

- **배울 내용**: `Scene.resize()`가 뷰포트 변경을 렌더러 백업 저장소, 투영 계층, 레이아웃 패스를 통해 전파하는 방식; `Stack`/`Flow`/`Card`/`PanelGroup`이 CSS 엔진 없이 반응형 대시보드를 구성하는 방식; `VirtualList`가 1만 행을 ~15개의 장착된 엔티티로 윈도우하는 방식; `ScrollView` 스프링 물리, `ResizablePanel` 드래그 핸들, `Overlay` 배치 뒤집기, `Button` 호버/포커스 링이 상호작용 루프를 닫는 방식 — 모두 `file:line` 영수증 포함.
- **배우지 않을 내용**: VMT 라이프사이클/더티/이벤트 디스패치(boss 06), 텍스트 형태와 줄 바꿈(boss 02), 의미적 투영(boss 03), 스트리밍 마크다운 차이(boss 04).

## 1. 뷰포트는 컨테이너가 아닌 제약

### 1.1 `Scene.resize()` — 진실의 단일 원천

`Scene.resize(width, height)`(`packages/core/src/tree/Scene.ts:6381`)는 뷰포트 경계다:

```ts
public resize(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) {
    if (!this.hasWarnedInvalidResize) console.warn(`...`); return;
  }
  this.width = width; this.height = height;
  this.contentFontEpoch++; this.contentViewportEpoch++;
  (this.renderer as any).resize(width, height);
  if (this.pointRenderer) { this.pointRenderer.resize(width, height); }
  if (this.gpuCanvas) this.sizeGpuCanvas(this.gpuCanvas, width, height);
  this.markDirty();
}
```

다섯 가지가 원자적으로 발생한다: 논리 `width`/`height` 업데이트, 두 세대 카운터 증가, 모든 백업 저장소 크기 조정, 프레임 더티. 세대 카운터가 핵심이다 — `contentFontEpoch`는 텍스트 재교정(브라우저 확대는 동일 CSS 폰트에서도 Range 기하학을 변경)을 강제하고, `contentViewportEpoch`는 어떤 블록도 이동시키지 않고 모든 콘텐츠 블록을 재계층화(`Scene.ts:6415`, `Scene.ts:6420`)한다. `width`/`height`만 변경된 크기 조정이 이전 뷰포트용 DOM으로 구성된 블록을 남기면 불일치가 발생한다.

잘못된 차원은 클램프되지 않고 거부된다(`Scene.ts:6382`): `-10`을 저장하면서 캔버스 요소가 `0`으로 클램프하면 제거와 접근성 기하학이 불일치한다. 경고는 `ResizeObserver` 기반 호출자가 드래그 프레임마다 스팸하지 않도록 래치된다(`hasWarnedInvalidResize` `Scene.ts:2113`).

### 1.2 `resize()`를 호출하는 주체

`disableWindowResize`(`Scene.ts:268`, `Scene.ts:2051`)에 의해 분할된 두 경로:

- **`disableWindowResize: false`** (기본): `ResizeObserver`(`Scene.ts:2284`)가 창 변경을 관찰하고 즉시 `resize()`를 호출한다. 확대(`zoom`)도 `ResizeObserver`를 트리거하므로 `contentFontEpoch`이 증가하고 텍스트가 재측정된다.
- **`disableWindowResize: true`**: 호출자가 명시적으로 `resize()`를 호출해야 한다 — 예: 전체 화면 앱이나 고정 크기 캔버스(`SceneOptions.disableWindowResize` `Scene.ts:268`).

`resize()`는 항상 `markDirty()`를 호출하므로 (`Scene.ts:6395`), `onDemand` 씬이 다음 프레임에서 렌더링하도록 보장한다. `resize()`를 건너뛰고 `width`/`height`만 변경하면 제거와 히트 테스트가 잘못된 뷰포트로 작동한다.

## 2. 반응형 레이아웃 패스

### 2.1 `Stack`과 `Flow`

`Stack`(`packages/ui/src/components/Stack.ts:45`)와 `Flow`(`packages/ui/src/components/Flow.ts:34`)는 CSS 엔진 없이 레이아웃을 수행한다. `Stack.layout()`(`Stack.ts:112`)는 자식의 `width`/`height`와 `gap`을 기반으로 `y` 위치를 계산하고, `Flow.layout()`(`Flow.ts:89`)는 자식을 행으로 감싸고 `x`를 계산한다. 두 가지 모두 `Scene.resize()` 후 `layoutPrepared()`(`packages/core/src/tree/Scene.ts:5730`)에서 호출된다.

`PanelGroup`(`packages/ui/src/components/PanelGroup.ts:78`)은 `Stack`과 `Flow`를 조합하여 반응형 대시보드를 구성한다: `PanelGroup`는 `resize()` 시 자식 패널의 크기를 재계산(`PanelGroup.ts:134` `recalculateSizes`)하며, `ResizablePanel`(`packages/ui/src/components/ResizablePanel.ts:56`)은 `dragHandle` 이벤트를 통해 크기를 조정한다.

### 2.2 `VirtualList` 윈도우

`VirtualList`(`packages/ui/src/components/VirtualList.ts:89`)는 `ScrollView`(`packages/ui/src/components/ScrollView.ts:67`) 안에서 작동하며, 뷰포트 내에 보이는 항목만 장착한다. `window()`(`VirtualList.ts:234`)는 `scrollTop`과 `itemHeight`를 기반으로 시작/끝 인덱스를 계산하고, `mount()`는 해당 인덱스의 엔티티만 추가한다. `VirtualList`는 `resize()` 시 `viewportHeight`를 다시 읽고(`VirtualList.ts:278` `updateViewport`), 윈도우를 재계산한다 — `resize()`를 건너뛰면 윈도우가 잘못된 뷰포트로 작동한다.

### 2.3 `ScrollView` 물리

`ScrollView`(`packages/ui/src/components/ScrollView.ts:67`)는 `scrollTop`을 `y`로 변환하고, `springTo()`(`packages/core/src/tree/Entity.ts:1784`)를 사용하여 스크롤 오프셋을 스프링으로 부드럽게 만든다. `ScrollView`는 `resize()` 후 `contentHeight`를 다시 계산(`ScrollView.ts:145` `updateContent`)하며, 그렇지 않으면 스크롤 범위가 잘못된 높이로 작동한다.

## 3. 오버레이와 포커스

`Overlay`(`packages/ui/src/components/Overlay.ts:56`)는 `overlayRoot`(`Scene.ts:226` `SceneOptions.overlayRoot`)에 재부모화되며, `placeOverlay()`(`Overlay.ts:89`)는 `scene.width/height`와 `anchor`(`top-left`, `center` 등)를 기반으로 위치를 계산한다. `resize()` 후 `placeOverlay()`를 호출하지 않으면 오버레이가 잘못된 위치에 나타난다.

`focusEntity()`(`packages/core/src/tree/Scene.ts:1446`)는 `document.activeElement`와 무관하므로, `resize()`나 `focus()` 호출 시 명시적으로 `Scene.focusedA11yElement`을 업데이트해야 한다(`Scene.ts:1455` `updateFocused`). `ThreeAdapter`(`packages/three/src/ThreeAdapter.ts:198`)와 마찬가지로, 오프스크린 캔버스는 `document` 포커스를 받지 못하므로 `focusEntity()`가 수동으로 관리되어야 한다.

## 4. 호버와 포커스 상태

`Button`(`packages/ui/src/components/Button.ts:45`)는 `hover`와 `focus` 이벤트를 `entity.on('hover')`와 `entity.on('focus')`로 등록한다. `hover`는 `pointerEvents`(`Entity.ts:431` `a11yAttributes.pointerEvents`)를 확인하고, `focus`는 `Scene.focusedA11yElement`(`Scene.ts:1446`)를 확인한다. 두 상태는 `resize()`와 무관하지만, `Button`이 `resize()` 후 `width`/`height`를 다시 읽지 않으면 호버/포커스 링이 잘못된 크기로 그려진다(`Button.ts:89` `drawSelf`는 `width`/`height`를 사용).
