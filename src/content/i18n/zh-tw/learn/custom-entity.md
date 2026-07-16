---
title: '建立自訂實體'
description: '學習如何繼承 Entity 來建立你自己的畫布元件：變換、渲染、命中測試、動畫、批次處理和無障礙。'
order: 9
---

# 建立自訂實體

VectoJS 中的每個物件都是一個 `Entity`——虛擬數學樹中的一個節點。像 `Button` 和 `Toggle` 這類內建元件只是你可以直接使用的 Entity 子類別。本指南將展示如何建立你自己的 Entity。

## 即時試玩

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · @vectojs/core</span></div>
  <iframe src="/sandbox/custom-entity.html" class="sandbox-frame" loading="lazy" title="自訂 Entity 互動範例" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>三個帶有動畫弧形填充的 <code>GaugeWidget</code> 自訂實體。點擊 Randomize 查看 <code>animate()</code> 補間系統的運作。</figcaption>
</figure>

## 本地座標系統

這是在撰寫你的第一個 `render()` 方法之前，最重要、必須內化的事情：

> **你的實體在 `(0, 0)` 繪製。畫布在呼叫 `render()` 之前，已經被變換到你的實體的位置、縮放和旋轉。**

`Scene` 在沿樹向下走訪時，以 **T · S · R** 的順序（平移 → 縮放 → 旋轉）應用變換。到你的 `render(renderer)` 被呼叫時，原點是實體的左上角，你的縮放已生效，旋轉已被應用。你永遠不需要在 `render()` 內部讀取 `this.x` 或 `this.y`。

<figure>
  <img src="/images/local-coordinate-system.svg" alt="圖表顯示左側的世界空間，實體位於 (80, 90)；右側的本地空間，原點為 (0,0) 且 render() 在此繪製；中間由一個標示為「Scene 套用 T·S·R 變換」的箭頭連接" class="diagram" />
  <figcaption>Scene 在呼叫 <code>render()</code> 之前，會將畫布平移到你實體的世界位置。你始終在 <code>(0, 0)</code> 繪製。</figcaption>
</figure>

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class Banner extends Entity {
  color = '#6366f1';

  isPointInside(_gx: number, _gy: number) {
    return false;
  }

  render(renderer: IRenderer) {
    // 相對於 (0, 0) 繪製——而不是 (this.x, this.y)
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 12);
    renderer.fill(this.color);
  }
}

const banner = new Banner();
banner.width = 300;
banner.height = 60;
banner.setPosition(80, 120); // 控制它在螢幕上出現的位置
scene.add(banner);
```

## 最小實作合約

需要兩個方法：

```typescript
abstract class Entity {
  // 如果全局指標座標 (gx, gy) 命中此實體，返回 true。
  abstract isPointInside(gx: number, gy: number): boolean;

  // 繪製實體。渲染器已在本地空間——原點為 (0,0)。
  abstract render(renderer: IRenderer): void;
}
```

如果你的實體沒有互動區域，從 `isPointInside` 返回 `false`。對於矩形命中區域，使用 `worldToLocal()` 轉換世界點，以便巢狀旋轉和非均勻縮放能被精確處理：

```typescript
isPointInside(gx: number, gy: number): boolean {
  const local = this.worldToLocal(gx, gy);
  return !!local && local.x >= 0 && local.x <= this.width
      && local.y >= 0 && local.y <= this.height;
}
```

> [!NOTE] > `UIComponent` 已經為你實作了這個 AABB 測試。當你的元件具有矩形命中框時，從 `@vectojs/ui` 繼承 `UIComponent` 而不是直接繼承 `Entity`——你會免費獲得 `isPointInside`、`getBounds` 和 `padding`。

## IRenderer API

傳遞給 `render()` 的渲染器物號提供了一個類似 Canvas2D 的繪圖表面（但與後端無關——它可能是 Canvas2D、WebGL 或 SVG）。

```typescript
// 路徑
renderer.beginPath()
renderer.moveTo(x, y)
renderer.lineTo(x, y)
renderer.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y)
renderer.arc(cx, cy, radius, startAngle, endAngle, counterclockwise?)
renderer.roundRect(x, y, w, h, radii)
renderer.closePath()

// 填充與描邊
renderer.fill(colorOrGradient)       // 例如 '#ff0' 或漸層描述
renderer.stroke(colorOrGradient, lineWidth?)

// 文字（原生瀏覽器畫布文字——無 LayoutEngine）
renderer.fillText(text, x, y, font, color)  // font = CSS 縮寫

// 圖片
renderer.drawImage(source, dx, dy, dw, dh)

// 快速圓形批次（合併相同顏色的繪製）
renderer.fillCircle(cx, cy, radius, color, alpha?)

// 狀態
renderer.save()
renderer.restore()
renderer.translate(x, y)
renderer.scale(x, y)
renderer.rotate(angle)        // 弧度
renderer.setGlobalAlpha(a)
renderer.clip(x, y, w, h)    // 在 save/restore 內部

// 漸層
renderer.createLinearGradient(x0, y0, x1, y1, colorStops)
```

**範例——漸層卡片：**

```typescript
render(renderer: IRenderer) {
  const gradient = renderer.createLinearGradient(0, 0, this.width, 0, [
    { stop: 0, color: '#6366f1' },
    { stop: 1, color: '#38bdf8' },
  ]);
  renderer.beginPath();
  renderer.roundRect(0, 0, this.width, this.height, 16);
  renderer.fill(gradient);

  renderer.fillText('Hello canvas', 20, this.height / 2 - 8, '600 18px Inter', '#fff');
}
```

## 使用 `getBounds()` 進行視窗剔除

預設情況下，實體永遠不會被剔除。覆寫 `getBounds()` 以返回一個本地空間的邊界框，當變換後的框在視窗外時，Scene 將跳過 `render()`。`update()` 仍會執行，因此當實體回到畫面時，狀態和動畫仍保持最新：

```typescript
getBounds() {
  return { x: 0, y: 0, width: this.width, height: this.height };
}
```

`UIComponent` 已經這樣做了。對於大型場景，原始 `Entity` 子類別應實作此方法。

## 使用 `update(dt, time)` 的每幀邏輯

覆寫 `update()` 以在每幀執行程式碼。首先呼叫 `super.update(dt, time)` 以推進佇列中的 `animate()` 補間動畫。

> [!CAUTION] > `dt` 的單位是**毫秒**，而非秒。在 60 fps 時，`dt ≈ 16.7`。除以 1000 得到秒數。

```typescript
class Spinner extends Entity {
  speed = 1.5; // rad/s

  update(dt: number, time: number) {
    super.update(dt, time);
    this.rotation += this.speed * (dt / 1000); // dt/1000 → 秒
  }

  // 從 update() 驅動的運動對 Scene 的空閒檢查是不可見的，除非你報告它。
  // 這可以防止空閒節流將旋轉器降至 2 fps，並比每幀的髒標誌更清楚地表明動畫意圖。
  hasPendingAnimations() {
    return true; // 旋轉器總是在動畫中
  }

  isPointInside() {
    return false;
  }

  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.arc(this.width / 2, this.height / 2, 30, 0, Math.PI * 2);
    renderer.stroke('#00f0ff', 3);
  }
}
```

`time` 是 `performance.now()`，對於不應漂移的振盪非常有用：

```typescript
this.y = Math.sin(time * 0.002) * 20; // 穩定的浮點數，無累積誤差
```

## 使用 `animate()` 的平滑動畫

對於一次性過渡，`animate()` 通常比自訂 `update()` 更好：

```typescript
entity
  .animate({ x: 300, opacity: 0 }, 400) // 緩出，400 毫秒
  .animate({ opacity: 1 }, 200); // 鏈接：在第一個完成時開始
```

只有**數值屬性**會進行插值。緩動為二次緩出（`t * (2 - t)`）。執行中的補間動畫會保持場景非靜態，並自動呼叫 `markDirty()`。

## 使實體具有互動性

設定 `interactive = true` 並實作 `isPointInside`。然後使用 `on()` 附加監聽器：

```typescript
class Chip extends Entity {
  selected = false;
  label: string;

  constructor(label: string) {
    super();
    this.label = label;
    this.interactive = true;
    this.width = 80;
    this.height = 32;

    this.on('click', () => {
      this.selected = !this.selected;
      this.animate({ scaleX: 0.92, scaleY: 0.92 }, 80).animate({ scaleX: 1, scaleY: 1 }, 80);
      this.scene?.markDirty();
    });
  }

  isPointInside(gx: number, gy: number): boolean {
    const p = this.worldToLocal(gx, gy);
    return !!p && p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height;
  }

  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 16);
    renderer.fill(this.selected ? '#6366f1' : 'rgba(99,102,241,0.2)');
    renderer.fillText(this.label, 12, 9, '500 14px Inter', '#fff');
  }
}
```

## 使用 `getA11yAttributes()` 的無障礙投射

當你的實體是 `interactive` 時，VectoJS 會在它上方投射一個透明的真實 DOM 節點。預設情況下這是一個普通的 `<div>`——對輔助技術來說不太有用。覆寫 `getA11yAttributes()` 來告訴框架要投射什麼節點：

```typescript
import type { A11yAttributes } from '@vectojs/core';

class Chip extends Entity {
  getA11yAttributes(): A11yAttributes {
    return {
      tag: 'button',
      role: 'button',
      label: this.label,
    };
  }
}
```

現在 Playwright 的 `page.getByRole('button', { name: 'OK' })` 可以找到你的 chip，螢幕閱讀器會朗讀它，鍵盤使用者可以 Tab 到它並按 Enter。完整的欄位集：

```typescript
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // 預設 'div'
  role?: string;
  label?: string; // aria-label
  href?: string; // 用於 tag='a'
  src?: string;
  alt?: string; // 用於 tag='img'
  inputType?: string; // 'text', 'checkbox' 等
  placeholder?: string;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  controls?: string;
  haspopup?: string;
  selected?: boolean;
  activedescendant?: string;
  valuemin?: string;
  valuemax?: string;
}
```

## 使用 `getBatchCircle()` 和 `getBatchRect()` 的 WebGL 批次處理

對於運行數以千計的粒子狀實體（點、圓點），每個實體的 `save/translate/render/restore` 路徑太慢了。請改用批次快速路徑：

```typescript
class Particle extends Entity {
  radius = 4;
  color = '#00f0ff';

  // 當累積變換可表示時，送入 WebGL 批次。
  getBatchCircle() {
    return { radius: this.radius, color: this.color };
  }

  isPointInside() {
    return false;
  }
  // Canvas 模式或非均勻/剪切祖先所需的路徑。
  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.arc(0, 0, this.radius, 0, Math.PI * 2);
    renderer.fill(this.color);
  }
}
```

限制條件：

- 實體必須是**葉子**（無子元素）。
- 實體自身的縮放必須是**均勻的**（`scaleX === scaleY`）才能使用快速路徑。
- 需要在 `Scene` 上設定 `pointBackend: 'webgl'`。
- 如果累積的祖先變換是非均勻的、經過剪切的，或無法由一個半徑/旋轉表示，Scene 會呼叫一般的 `render()` 路徑。

Scene 每幀都會讀取 `getBatchCircle()`，因此動畫的 `radius`/`color` 都會被遵守。點層在一次緩衝區/繪製序列中上傳許多圓形。對於矩形，請改用 `getBatchRect()`：

```typescript
getBatchRect() {
  return { width: this.width, height: this.height, color: this.color };
}
```

## 完整範例：動畫儀表小工具

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';
import type { A11yAttributes } from '@vectojs/core';

class GaugeWidget extends Entity {
  private _value = 0;
  private _displayValue = 0; // 插值

  label: string;
  min: number;
  max: number;
  accentColor: string;

  constructor(label: string, opts: { min?: number; max?: number; accent?: string } = {}) {
    super();
    this.label = label;
    this.min = opts.min ?? 0;
    this.max = opts.max ?? 100;
    this.accentColor = opts.accent ?? '#00f0ff';
    this.width = 180;
    this.height = 180;
    this.interactive = true;
  }

  get value() {
    return this._value;
  }

  setValue(v: number) {
    this._value = Math.max(this.min, Math.min(this.max, v));
    // 平滑視覺過渡
    this.animate({ _displayValue: this._value } as any, 600);
  }

  update(dt: number, time: number) {
    super.update(dt, time);
  }

  getBounds() {
    return { x: 0, y: 0, width: this.width, height: this.height };
  }

  isPointInside(gx: number, gy: number): boolean {
    const p = this.worldToLocal(gx, gy);
    return !!p && p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height;
  }

  getA11yAttributes(): A11yAttributes {
    return {
      role: 'meter',
      label: this.label,
      value: String(this._value),
      valuemin: String(this.min),
      valuemax: String(this.max),
    };
  }

  render(renderer: IRenderer) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const r = 70;
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const progress = (this._displayValue - this.min) / (this.max - this.min);
    const sweepAngle = startAngle + (endAngle - startAngle) * progress;

    // 軌道
    renderer.beginPath();
    renderer.arc(cx, cy, r, startAngle, endAngle);
    renderer.stroke('rgba(255,255,255,0.12)', 10);

    // 進度弧
    if (progress > 0) {
      renderer.beginPath();
      renderer.arc(cx, cy, r, startAngle, sweepAngle);
      renderer.stroke(this.accentColor, 10);
    }

    // 數值標籤
    renderer.fillText(
      `${Math.round(this._displayValue)}`,
      cx - 20,
      cy - 14,
      'bold 36px Inter',
      '#f8fafc',
    );
    renderer.fillText(this.label, cx - 30, cy + 20, '14px Inter', '#94a3b8');
  }
}

// 使用方式：
const gauge = new GaugeWidget('CPU', { accent: '#6366f1' });
gauge.setPosition(60, 60);
scene.add(gauge);
gauge.setValue(72);
```

## 總結

| 方法                                | 何時覆寫                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `render(renderer)`                  | 總是——在本地空間的 (0,0) 繪製實體                                                      |
| `isPointInside(gx, gy)`             | 總是——對裝飾性實體返回 false                                                           |
| `update(dt, time)`                  | 每幀邏輯；先呼叫 `super.update`；`dt` 單位為毫秒                                       |
| `hasPendingAnimations()`            | 每當 `update()` 驅動其自身運動時——報告「仍在移動」以讓空閒節流 / onDemand 跳過保持渲染 |
| `getBounds()`                       | 用於視窗剔除（強烈建議）                                                               |
| `getA11yAttributes()`               | 當為互動時——控制陰影 DOM 節點                                                          |
| `getBatchCircle() / getBatchRect()` | 數以千計的粒子狀葉子實體                                                               |

## 疑難排解

### 實體已加入但螢幕上未顯示

按順序檢查：

1. **`scene.start()` 未呼叫**——沒有它，渲染迴圈就不會啟動。
2. **`render()` 沒有呼叫任何繪製方法**——空的 `render()` 是無聲的。確認已到達 `renderer.fill()` 或 `renderer.stroke()`。
3. **`width` 或 `height` 為 `0`**——實體可能在畫面外或被剔除。設定 `entity.width = 200; entity.height = 80` 並檢查它是否出現。
4. **`opacity` 為 `0`**——檢查 `entity.opacity`。
5. **實體未加入場景**——`new MyEntity()` 會建構但不會加入。呼叫 `scene.add(entity)`。

### `isPointInside` 從未返回 `true` / 點擊事件未觸發

`isPointInside` 接收**全局（世界空間）**座標。針對 `this.x` / `this.y` 進行測試在巢狀變換中會失敗，而減去 `getGlobalPosition()` 在旋轉和非均勻縮放時仍然會失敗。使用 `worldToLocal()` 反轉完整的變換：

```typescript
// 錯誤——僅在實體位於場景根且無父變換時有效
isPointInside(gx, gy) {
  return gx >= this.x && gx <= this.x + this.width; // ← 在巢狀樹中會失效
}

// 正確——處理巢狀平移、旋轉和非均勻縮放
isPointInside(gx, gy) {
  const p = this.worldToLocal(gx, gy);
  return !!p && p.x >= 0 && p.x <= this.width
      && p.y >= 0 && p.y <= this.height;
}
```

同時確保已設定 `entity.interactive = true`——沒有它，指標事件就不會被分派到實體。

### `getBatchCircle()` / `getBatchRect()` 未被使用

兩個容易被忽略的要求：

- Scene 必須在其建構選項中設定 `pointBackend: 'webgl'`。
- 實體必須是**葉子**（無 `children`）。如果你對批次實體 `add()` 一個子元素，它會靜默地回退到一般的 `render()` 路徑。

檢查 `console.log(scene.getRenderer())`——如果渲染器是 `CanvasRenderer` 且沒有 WebGL 層，則表示 `pointBackend: 'webgl'` 未設定或 WebGL2 不可用。

### DevTools 中缺少陰影 DOM 節點

無障礙陰影節點僅在**兩個**條件都為 true 時才會建立：

1. `entity.interactive === true`
2. `entity.width > 0`（或 `entity.a11yFullViewport === true`）

一個具有 `interactive = true` 但 `width = 0` 的實體不會獲得陰影節點。設定 `entity.width` 和 `entity.height` 以匹配視覺大小。

## 挑戰

### 進度條實體

建立一個 `ProgressBar` 實體，顯示動畫填充條，並能被螢幕閱讀器正確識別為進度指示器。

- 屬性：`min: number`、`max: number`、`value: number`、`barColor: string`、`trackColor: string` 和 `width`/`height`。
- 實作 `setValue(n: number)`，將 `n` 夾在 `[min, max]` 範圍內，並呼叫 `this.animate({ displayValue: n }, 400)`，其中 `displayValue` 驅動渲染的填充寬度。
- 覆寫 `getA11yAttributes()` 以返回 `{ role: 'progressbar', valuemin, valuemax, value }` 字串，以便輔助技術宣布當前百分比。

### 甜甜圈圖

擴展 `GaugeWidget`（本頁底部的完整範例）以渲染一個甜甜圈形狀，在軌道弧和進度弧之間有一個可見的間隙，並在數值下方添加一個類別圖例標籤。

- 將軌道弧半徑減少 6 像素，並將進度弧半徑增加 6 像素（或反之），以在兩個同心環之間建立可見間隙。
- 添加一個 `legendLabel: string` 屬性，並使用 `renderer.fillText` 以較小、較柔和的顏色將其渲染在數值下方。
- 更新 `getA11yAttributes()` 以將 `legendLabel` 附加到返回的 `label` 欄位，以便螢幕閱讀器能宣布完整的描述。

### 點擊計數器 Chip

擴展本頁互動章節中的 `Chip` 實體，使每次點擊增加一個計數器，並在右上角顯示一個帶有計數數字的小圓形徽章。

- 添加一個 `clickCount = 0` 屬性，並在 `'click'` 處理常式中與現有的切換和縮放動畫一起遞增它。
- 在 `render()` 中，僅在 `clickCount > 0` 時繪製徽章（一個帶有計數文字的小填充圓形）；將它定位在 chip 本地座標空間中的 `(this.width - 10, -6)` 位置。
- 覆寫 `getA11yAttributes()` 以在 `label` 欄位中包含當前計數，例如 `'OK — 3 次點擊'`，以便在計數變更時可存取的名稱保持最新。

> **下一步：** [事件與命中測試](/learn/events/) — 指標事件如何透過捕獲和冒泡在實體樹中傳播。
