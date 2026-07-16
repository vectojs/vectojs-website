---
title: 'Entity'
description: '每個 Virtual Math Tree 節點的抽象基礎：變換、動畫系統、捕獲/冒泡事件，以及自訂 Entity 可覆寫的 a11y/批次處理掛鉤。'
order: 3
---

# `Entity`（抽象類別）

屬於 [`@vectojs/core`](/reference/core-api/)。

Virtual Math Tree 中每個節點的基礎類別。建立子類別並實作
`isPointInside` 和 `render`。

```ts
abstract class Entity {
  abstract isPointInside(globalX: number, globalY: number): boolean; // MUST implement
  abstract render(renderer: IRenderer): void; // MUST implement
}
```

## 公開屬性

| 屬性                         | 類型             | 預設值          | 說明                                                                                                                                                         |
| ---------------------------- | ---------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                         | `string`         | `entity_<rand>` | 用作陰影節點 id / `data-vecto-id`。                                                                                                                          |
| `children`                   | `Entity[]`       | `[]`            |                                                                                                                                                              |
| `parent`                     | `Entity \| null` | `null`          |                                                                                                                                                              |
| `scene`                      | getter           | —               | 沿父節點鏈走訪至所屬的 `Scene`（或 `null`）。                                                                                                                |
| `x`, `y`                     | `number`         | `0`             | 本地位置。                                                                                                                                                   |
| `scaleX`, `scaleY`           | `number`         | `1`             | 本地縮放。                                                                                                                                                   |
| `rotation`                   | `number`         | `0`             | 本地旋轉，弧度。                                                                                                                                             |
| `opacity`                    | `number`         | `1`             | 與每個祖先的不透明度相乘，然後套用至一般、批次、WebGPU 和 DOM-portal 輸出。                                                                                  |
| `interactive`                | `boolean`        | `false`         | 設定器副作用：標記 `a11yNeedsReorder` + `markDirty()`。開啟 a11y 投射（需搭配 `width`）。                                                                    |
| `width`, `height`            | `number`         | `0`             | 點擊方塊 / a11y 陰影方塊尺寸（× 縮放）。                                                                                                                     |
| `clipChildren`               | `boolean`        | `false`         | 將一般子實體繪製裁剪至 `[0,0]–[width,height]`；Canvas/SVG 為精確裁剪。三維會使用世界 AABB 裁剪器處理旋轉/切變裁剪。WebGL point/WebGPU overlay 路徑不受裁剪。 |
| `a11yOffsetX`, `a11yOffsetY` | `number`         | `0`             | 相對於實體全域位置的陰影節點偏移。                                                                                                                           |
| `a11yFullViewport`           | `boolean`        | `false`         | 即使 `width === 0` 也投射一個填滿視口的陰影節點；掛載在**所有**其他節點**之後**，使上層元件保持可點擊。                                                      |
| `isDOMPortal`                | `boolean`        | `false`         | 標記 `DOMPortalEntity`；portal 會被 a11y 同步跳過。                                                                                                          |

> **A11y 投射需要一個方塊。** 僅當
> `interactive && (width > 0 || a11yFullViewport)` 時才會建立陰影節點。
> `width: 0` 且無 `a11yFullViewport` 的互動實體**不會**獲得
> 陰影節點 — 請設定 `width`/`height`。

## 樹與變換方法

```ts
add(...children: Entity[]): this             // 依序附加一個或多個子實體；同時標記 a11yNeedsReorder + markDirty
remove(child: Entity): this
set(props: Partial<this>): this              // 透過正常設定器一次賦予多個自身屬性；回傳 this
setPosition(x: number, y: number): this
getGlobalPosition(): Point                   // 世界位置；累積 translate→scale→rotate 直到（不含）根節點
getWorldTransform(): AffineTransform         // 精確累積的 Canvas T·S·R 矩陣 { a,b,c,d,e,f }
localToWorld(localX: number, localY: number): Point
worldToLocal(worldX: number, worldY: number): Point | null // 若變換為奇異則回傳 null
getWorldBounds(): Bounds                    // 本地 getBounds()（或 width/height）轉換為世界 AABB
getWorldScale(): { x: number; y: number }    // 自身 + 祖先縮放的乘積（不含根節點）
getWorldRotation(): number                   // 自身 + 祖先旋轉的總和（不含根節點），弧度
getBounds(): Bounds | null                   // 用於裁剪的本地 AABB；null（預設）= 永不裁剪
destroy(): void                              // 清除動畫 + 監聽器，從父節點分離
```

`getWorldScale()` 和 `getWorldRotation()` 是便利累積方法。在
巢狀旋轉加上非均勻縮放下，組合矩陣可能包含剪切；
當需要精確幾何時，請使用 `getWorldTransform()`、`localToWorld()`、`worldToLocal()` 或
`getWorldBounds()`。

自 1.9.0 起，`add()` 是**可變參數**的 — `parent.add(a, b, c)` 依引數
順序附加每個子實體（單一子實體路徑仍為 O(1)）。`set(props)` 是一個
建構時的人體工學輔助方法，一次賦予多個自身屬性，
每個都透過其正常設定器（因此具有已設定 `setTransition` 的屬性
仍會產生動畫，而 `interactive` 仍會標記 a11y 重新排序）：
`rect.set({ x: 40, y: 40, width: 120, fill: '#38bdf8' })`。它只是對
給定物件進行簡單的 `for…in` 迴圈，不會影響每幀路徑。兩者自然
與 [`Rect`/`Circle`/`Group`](/reference/core-entities/)
原始物件搭配使用。

## 動畫

```ts
// 舊版補間（保留）
animate(targetProps: Partial<this>, durationMs: number): this
hasPendingAnimations(): boolean

// 動畫系統（0.2.0）
setTransition(config: Partial<Record<AnimatableProp, MotionConfig>>): this
animateTo(props: Partial<Record<AnimatableProp, number>>, cfg: TweenConfig): Promise<void>
springTo(props: Partial<Record<AnimatableProp, number>>, cfg?: SpringConfig): Promise<void>
```

`animate()` 將補間排入佇列；多次呼叫**依序鏈接**。僅
數值屬性會進行插值；緩動為固定的 ease-out（`p * (2 - p)`）。執行中的
`animate()` 會保持場景非靜態（脫離閒置節流，請參閱
[`Scene`](/reference/core-scene/#rendermode-maxfps-and-the-idle-auto-throttle)）
並凍結 a11y 同步直到動畫穩定。

`hasPendingAnimations()` 是**可覆寫的**，也是 Scene 了解自訂
動畫的唯一窗口：如果子類別在 `update()` 內整合了自己的移動
（手動實作的彈簧或速度），請在該運動
進行期間覆寫它並回傳 `true` — 從 `update()` 內部呼叫 `markDirty()` 會在
同一幀結束時再次被清除，因此若無此覆寫，閒置節流會將
動畫降至 2 fps，而 `onDemand` 模式會將其凍結。

**0.2.0 動畫系統** — 彈簧優先，統一補間與彈簧：

- `setTransition` 宣告六個可動畫屬性（`x`、`y`、`scaleX`、
  `scaleY`、`rotation`、`opacity`）的動畫方式；之後直接賦值
  （`entity.x = 400`）會對它們產生動畫，並重新定位進行中的運動以實現連續動畫。
  這些屬性是存取器，當未設定轉場時具有零開銷的快速路徑 —
  直接賦值維持為純欄位寫入。
- `animateTo` / `springTo` 以命令式驅動屬性，並在運動
  穩定時解析；與 `animate()` 不同，它們並行執行並可與 `await` 組合。
- `MotionConfig = 'spring' | SpringConfig | TweenConfig`（存在 `duration`
  時選擇補間）。`TweenConfig.easing` 接受來自 `Easing` 匯出的 `EasingName`
  或自訂的 `(t) => number`。
- 遵循 `prefers-reduced-motion`（移動瞬間定位，透明度淡入淡出）。相關：
  `onMounted()` 在實體附加到活動場景時觸發 — UI 存在感
  輔助方法使用它來播放進入動畫。

用法請參閱 [Physics & Animation](/learn/physics-engine/)。

## 事件（`VectoEvent` / 捕獲 + 冒泡）

```ts
type VectoEvent =
  | 'click' | 'hover' | 'pointerdown' | 'pointerup' | 'pointercancel' | 'pointermove' | 'pointerleave'
  | 'change' | 'focus' | 'blur' | 'wheel' | 'keydown' | 'keyup';

on(event: VectoEvent, cb: (e: any) => void, options?: { capture?: boolean }): this
off(event: VectoEvent, cb: (e: any) => void, options?: { capture?: boolean }): this
emit(event: VectoEvent, payload: any): void          // 僅自身，冒泡階段監聽器（舊版/元件內部）
dispatchEvent(event: VectoJSEvent): void             // DOM 風格捕獲（根→目標）然後冒泡（目標→根）
```

- `on`/`off` 預設為**冒泡**階段；傳入 `{ capture: true }` 用於
  捕獲階段。冒泡監聽器也會在舊版 `emit()` 路徑上觸發。
- `VectoJSEvent<N>` 包裝了 `nativeEvent` 並添加了 `target`、`currentTarget`、
  `bubbles`、`stopPropagation()`、`stopImmediatePropagation()`、
  `preventDefault()`、視口 `clientX/Y`、邏輯 `sceneX/Y`、當前目標
  `localX/Y`、修飾鍵以及直通屬性（`deltaX/Y`、`key`、
  `defaultPrevented`）。本地座標反轉了完整的巢狀仿射變換。
  不冒泡的事件仍會執行捕獲階段，但在冒泡階段
  僅觸發其目標。
- 來自表單控制項陰影 `<input>` 的 `'change'` 帶有
  `{ value, checked, selectionStart, selectionEnd, composition }`，其中
  `composition` 為 `{ start, length } | null`，表示活躍的 IME 預編輯狀態。
  `'wheel'` 帶有原生 `WheelEvent`（呼叫 `preventDefault()` 可停止頁面
  滾動）。

用法請參閱 [Events & Hit-Testing](/learn/events/)。

## A11y / 批次處理掛鉤（覆寫以啟用）

```ts
getA11yAttributes(): A11yAttributes          // 預設 {} → 純透明 <div>
getBatchCircle(): BatchCircle | null         // { radius, color } → renderer fillCircle 快速路徑（均勻縮放葉節點）
getBatchRect(): BatchRect | null             // { width, height, color } → GPU 實例化矩形（僅 WebGL pointBackend）
update(dt: number, time: number): void       // 可選覆寫；dt 為毫秒，time 為 performance.now()；預設推進排隊中的補間
```

`getBatchCircle`/`getBatchRect` **每幀**讀取（動態顏色/半徑
也會生效）。可表示的批次葉節點會跳過其自身的
`save/translate/scale/rotate/render/restore`；Canvas 模式或不支援的
累積仿射變換則使用實體的一般 `render()` 回退。

完整的 `A11yAttributes` 結構以及陰影 DOM 同步的運作方式，
請參閱 [a11yRoot & the agent contract](/reference/core-a11y/)。

## 相關

[`Scene`](/reference/core-scene/)（擁有樹）·
[Renderers](/reference/core-renderer/)（`Entity.getContentProjection()`）·
[a11yRoot & the agent contract](/reference/core-a11y/)·
[`@vectojs/core` 概覽](/reference/core-api/)
