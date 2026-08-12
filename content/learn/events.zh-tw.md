+++
title = "事件與命中測試"
description = "指標和鍵盤事件如何在 VectoJS 實體樹中流動：捕獲、冒泡、VectoJSEvent、表單變更負載和 findEntityAt。"
weight = 10
+++

# 事件與命中測試

VectoJS 使用類似 DOM 的**捕獲 + 冒泡**事件模型。如果你用過瀏覽器 `addEventListener`，其機制是相同的——但樹遍歷是在虛擬數學樹上而不是 DOM 上運行的。

## 即時試玩

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · @vectojs/core</span></div>
  <iframe src="/sandbox/events.html" class="sandbox-frame" loading="lazy" title="事件與命中測試互動範例" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>三個自訂 Entity 子類別——懸停時縮放，點擊時計數。每個都接入了 <code>on('hover')</code>、<code>on('pointerleave')</code> 和 <code>on('click')</code>。</figcaption>
</figure>

## 事件生命週期

當使用者在畫布上點擊（或觸碰、懸停）時，Scene：

1. 呼叫 `findEntityAt(x, y)` 來找到**目標**——`isPointInside()` 返回 `true` 的最上層實體。
2. 建立**事件路徑**：`[target, parent, grandparent, …, root]`。
3. 運行**捕獲階段**：觸發以 `{ capture: true }` 註冊的監聽器，從根向下到目標。
4. 運行**冒泡階段**：觸發監聽器（預設階段），從目標向上回到根。

<figure>
  <iframe src="/sandbox/diagram-events.html" class="diagram-frame" loading="lazy" title="事件捕獲和冒泡階段，由 VectoJS 即時渲染" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>捕獲階段從根觸發到目標；冒泡階段從目標觸發到根。目標會收到兩者。*（由 VectoJS 即時渲染。）*</figcaption>
</figure>

## 監聽事件

```typescript
entity.on(event, callback, options?)
entity.off(event, callback, options?)
```

預設階段是**冒泡**。傳遞 `{ capture: true }` 以在捕獲階段攔截：

```typescript
// 冒泡階段（預設）——在子元素之後觸發
btn.on('click', (e) => console.log('按鈕被點擊'));

// 捕獲階段——在子元素之前觸發（攔截器模式）
card.on(
  'click',
  (e) => {
    console.log('卡片先看到點擊');
    e.stopPropagation(); // 防止冒泡再次到達卡片
  },
  { capture: true },
);
```

可用的事件類型：

| 事件              | 觸發時機                     |
| ----------------- | ---------------------------- |
| `'click'`         | 在同一實體上按下並釋放指標   |
| `'hover'`         | 指標進入實體                 |
| `'pointerdown'`   | 指標按下                     |
| `'pointerup'`     | 指標釋放                     |
| `'pointercancel'` | 瀏覽器取消活動中的指標串流   |
| `'pointermove'`   | 指標移動（當在實體上方時）   |
| `'pointerleave'`  | 指標離開實體                 |
| `'wheel'`         | 滑鼠滾輪 / 觸控板滾動        |
| `'keydown'`       | 按鍵按下（當實體持有焦點時） |
| `'keyup'`         | 按鍵釋放                     |
| `'change'`        | 表單控制項值已變更           |
| `'focus'`         | 陰影 DOM 節點獲得焦點        |
| `'blur'`          | 陰影 DOM 節點失去焦點        |

## VectoJSEvent

回呼會收到一個 `VectoJSEvent`，包含以下成員：

```typescript
interface VectoJSEvent {
  type: string; // 事件名稱
  target: Entity; // 事件起源的實體
  currentTarget: Entity; // 監聽器正在執行的實體

  bubbles: boolean;

  // 傳播控制
  stopPropagation(): void; // 在當前節點後停止
  stopImmediatePropagation(): void; // 也跳過此節點上其餘的監聽器
  preventDefault(): void;

  defaultPrevented: boolean;

  // 來自原生事件的瀏覽器視窗座標
  clientX?: number;
  clientY?: number;

  // Scene 邏輯座標，然後是相對於 currentTarget 的本地座標
  sceneX?: number;
  sceneY?: number;
  localX?: number;
  localY?: number;

  // 滾輪事件
  deltaX?: number;
  deltaY?: number;

  // 鍵盤事件
  key?: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;

  // 原始原生 DOM 事件
  nativeEvent?: Event;
}
```

`localX`/`localY` 會為每個監聽器的 `currentTarget` 重新計算，包括巢狀旋轉和非均勻縮放。在控制項內部使用它們。當需要與另一個實體比較或儲存場景空間的指標時，使用 `sceneX`/`sceneY`。`clientX`/`clientY` 保持為原始的瀏覽器視窗值。

## `emit()` 與 `dispatchEvent()` 的比較

VectoJS 有兩個分派路徑：

| 方法                                 | 作用                                             |
| ------------------------------------ | ------------------------------------------------ |
| `entity.emit(event, payload)`        | 僅觸發**此實體自身的冒泡階段監聽器**。無樹遍歷。 |
| `entity.dispatchEvent(vectoJSEvent)` | 在樹中進行完整的 DOM 風格**捕獲 + 冒泡**遍歷。   |

`emit()` 是內建元件在內部通知自身狀態變更的方式（例如，`Toggle` 觸發自身的 `'change'` 事件）。你幾乎從不直接呼叫 `dispatchEvent()`——`Scene` 會為來自瀏覽器的指標和鍵盤事件呼叫它。

```typescript
// 正確：在冒泡階段監聽按鈕的點擊
btn.on('click', (e) => {
  /* ... */
});

// 正確：在子元素處理之前攔截子樹的點擊
container.on(
  'click',
  (e) => {
    if (isLocked) e.stopPropagation();
  },
  { capture: true },
);

// 正確：元件觸發自身的狀態變更（內部使用）
this.emit('change', { value: this._value });
```

## 表單變更事件負載

表單控制項（`Input`、`TextArea`、`Checkbox`、`Toggle`、`Slider`、`Dropdown`）會觸發帶有類型化負載的 `'change'` 事件：

**`Input` 和 `TextArea`：**

```typescript
{
  value: string;
  selectionStart?: number;   // 游標 / 選取起始偏移
  selectionEnd?: number;     // 游標 / 選取結束偏移
  composition?: {
    start: number;
    length: number;
  } | null;                  // 活動中的 IME 預編輯範圍，或 null
}
```

**`Checkbox` 和 `Toggle`：**

```typescript
{
  checked: boolean;
}
```

**`Slider`：**

```typescript
{
  value: number;
}
```

**`Dropdown`：**

```typescript
{
  value: string;
}
```

範例——讀取文字輸入值：

```typescript
const input = new Input({ width: 300, placeholder: '搜尋…' });
input.on('change', (e) => {
  const { value, selectionStart } = e;
  console.log(`"${value}" — 游標在 ${selectionStart}`);
});
```

## 命中測試：Scene 如何找到目標

`scene.findEntityAt(x, y)` 以**深度優先、反向子順序**（最後繪製的子元素最先測試）遍歷樹：

1. 覆蓋層根在主根之前被檢查，因此覆蓋層（下拉選單、模態框）總是優先。
2. 子元素以**反向**順序遍歷——最後加入的子元素（渲染在最上層）最先被命中測試。
3. **沒有互動過濾器**：即使 `isPointInside()` 返回 `true`，非互動實體仍可能被返回。互動過濾僅影響陰影 DOM 投射，不影響命中測試。
4. 遍歷返回第一個 `isPointInside()` 返回 `true` 的實體，無論它是否有任何監聽器。

```typescript
// 這樣可行——返回游標下的實體
const hit = scene.findEntityAt(pointerX, pointerY);
if (hit) console.log('命中', hit.id);
```

## 停止傳播

```typescript
child.on('click', (e) => {
  e.stopPropagation(); // 父元素在冒泡階段將看不到此點擊
});

// stopImmediatePropagation 也會停止同一節點上的其他監聽器
child.on('click', (e) => {
  e.stopImmediatePropagation();
});
child.on('click', () => {
  // 如果第一個監聽器停止了即時傳播，則此第二個 'child' 上的監聽器不會被呼叫
});
```

## 滾輪事件與 `preventDefault()`

`Scene` 從畫布轉發 `wheel` 事件。呼叫 `e.preventDefault()` 以阻止頁面滾動：

```typescript
myScroller.on('wheel', (e) => {
  this.scrollY += e.deltaY;
  e.preventDefault(); // 停止瀏覽器滾動
  this.scene?.markDirty();
});
```

> [!NOTE] > `ScrollView` 會自動在滾輪事件上呼叫 `e.preventDefault()`，除非按住 `Ctrl`（允許瀏覽器縮放）。如果你建立自訂滾動容器，請遵循相同的模式。

## 鍵盤事件

鍵盤事件會傳遞給持有焦點的實體（透過其陰影 DOM 節點）。它們以正常的捕獲/冒泡方式沿樹向上傳播：

```typescript
inputEntity.on('keydown', (e) => {
  if (e.key === 'Enter') submitForm();
  if (e.key === 'Escape') cancelForm();
});
```

對於全局快捷鍵（不與特定焦點元素綁定），請在 `Scene` 的根上監聽，或使用原生的 `document.addEventListener`：

```typescript
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});
```

## 捕獲階段模式

### 點擊外部關閉

```typescript
scene.add(overlay); // 下拉選單、模態背景等

// 根捕獲：在任何實體處理點擊之前觸發
scene.getRoot().on(
  'click',
  (e) => {
    if (
      e.sceneX !== undefined &&
      e.sceneY !== undefined &&
      !overlay.isPointInside(e.sceneX, e.sceneY)
    ) {
      closeOverlay();
    }
  },
  { capture: true },
);
```

### 鎖定子樹

```typescript
panel.on(
  'click',
  (e) => {
    if (disabled) e.stopPropagation(); // 所有子元素都被封鎖
  },
  { capture: true },
);
```

## 完整範例：懸浮卡片

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class HoverCard extends Entity {
  private hovered = false;

  constructor(private label: string) {
    super();
    this.width = 200;
    this.height = 80;
    this.interactive = true;

    this.on('hover', () => {
      this.hovered = true;
      this.animate({ scaleX: 1.04, scaleY: 1.04 }, 120);
    });

    this.on('pointerleave', () => {
      this.hovered = false;
      this.animate({ scaleX: 1, scaleY: 1 }, 120);
    });

    this.on('click', () => {
      console.log(`${this.label} 被點擊`);
    });
  }

  isPointInside(gx: number, gy: number): boolean {
    const p = this.worldToLocal(gx, gy);
    return !!p && p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height;
  }

  getA11yAttributes() {
    return { tag: 'button' as const, role: 'button', label: this.label };
  }

  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 12);
    renderer.fill(this.hovered ? '#1e293b' : '#0f172a');
    renderer.stroke('rgba(255,255,255,0.12)', 1);
    renderer.fillText(this.label, 16, 28, '600 18px Inter', '#f8fafc');
  }
}
```

## 疑難排解

### 點擊觸發了錯誤的實體

`findEntityAt` 以**反向**順序遍歷子元素（最後加入的 = 最先測試的）。如果兩個實體重疊，後加入的那個會獲勝。要讓某個實體總是獲勝，在其他實體之後 `add()` 它。要讓它總是失敗，在其他實體之前 `add()` 它。

如果在**捕獲階段**錯誤的實體攔截了事件，請檢查祖先上的 `stopPropagation()` 呼叫——一個在捕獲階段停止傳播的監聽器將阻止事件到達預期的目標。

### 事件監聽器觸發一次後就停止

使用 `on()` 新增的事件監聽器是永久性的，直到呼叫 `off()`。如果監聽器似乎停止了，請檢查：

1. 實體已從場景中移除。`scene.remove(entity)` 會分離它，但不會清除其監聽器，因此之後可以再次加入。
2. 父監聽器在事件到達你的實體之前呼叫了 `e.stopPropagation()`。
3. 你不小心呼叫了 `off()`——有時是透過比預期更早執行的清理函式。

### 滾輪事件觸發但頁面仍然滾動

即使你在實體上監聽來自畫布的 `wheel` 事件，它們也會冒泡到瀏覽器。你必須明確呼叫 `e.preventDefault()` 來停止頁面滾動：

```typescript
myEntity.on('wheel', (e) => {
  // ... 處理滾動 ...
  e.preventDefault(); // ← 需要停止瀏覽器滾動
});
```

注意：`ScrollView` 會自動對其自身的滾輪事件執行此操作（但按住 `Ctrl` 時除外）。

### 鍵盤事件的 `e.clientX` / `e.clientY` 遺失

`clientX`/`clientY` 是指標事件的欄位，當原生事件不提供它們時為 `undefined`。對於鍵盤事件，請使用 `e.key`、`e.shiftKey`、`e.ctrlKey`、`e.altKey` 和 `e.metaKey`。

> **下一步：** [物理與動畫](/learn/physics-engine/) — 彈簧、空間哈希和 `update()` 迴圈。
