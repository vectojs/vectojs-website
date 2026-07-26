---
title: '构建自定义实体'
description: '学习如何继承Entity来构建自己的canvas组件：变换、渲染、命中测试、动画、批处理和无障碍。'
order: 9
---

# 构建自定义实体

VectoJS中的每个对象都是一个`Entity` —— 虚拟数学树中的一个节点。像`Button`和`Toggle`这样的内置组件是你可以直接使用的Entity子类。本指南展示如何构建你自己的实体。

## 实时体验

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">实时 · @vectojs/core</span></div>
  <iframe src="/sandbox/custom-entity.html" class="sandbox-frame" loading="lazy" title="自定义实体交互示例" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>三个<code>GaugeWidget</code>自定义实体，带动画圆弧填充。点击Randomize查看<code>animate()</code>补间系统的运作。</figcaption>
</figure>

## 局部坐标系

在编写第一个`render()`方法之前，这是最重要的内化概念：

> **你的实体在`(0, 0)`处绘制。在`render()`被调用之前，canvas已经转换到实体的位置、缩放和旋转。**

`Scene`在遍历树时以**T · S · R**顺序（平移 → 缩放 → 旋转）应用变换。当你的`render(renderer)`被调用时，原点就是实体的左上角，缩放已生效，旋转已应用。你永远不需要在`render()`内部读取`this.x`或`this.y`。

<figure>
  <img src="/images/local-coordinate-system.svg" alt="图显示左侧世界空间，实体定位在(80, 90)，右侧局部空间原点为(0,0)，render()在此绘制，由标有"Scene应用T·S·R变换"的箭头连接" class="diagram" />
  <figcaption>Scene在调用<code>render()</code>之前将canvas平移到实体的世界位置。你总是在<code>(0, 0)</code>处绘制。</figcaption>
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
    // 相对于(0, 0)绘制 —— 而不是(this.x, this.y)
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 12);
    renderer.fill(this.color);
  }
}

const banner = new Banner();
banner.width = 300;
banner.height = 60;
banner.setPosition(80, 120); // 控制它在屏幕上的位置
scene.add(banner);
```

## 最小实现契约

需要两个方法：

```typescript
abstract class Entity {
  // 如果全局指针坐标(gx, gy)击中此实体则返回true。
  abstract isPointInside(gx: number, gy: number): boolean;

  // 绘制实体。渲染器已在局部空间 —— 原点在(0,0)。
  abstract render(renderer: IRenderer): void;
}
```

如果你的实体没有交互区域，从`isPointInside`返回`false`。对于矩形命中区域，使用`worldToLocal()`转换世界点，以便嵌套旋转和非均匀缩放被精确处理：

```typescript
isPointInside(gx: number, gy: number): boolean {
  const local = this.worldToLocal(gx, gy);
  return !!local && local.x >= 0 && local.x <= this.width
      && local.y >= 0 && local.y <= this.height;
}
```

> [!NOTE] > `UIComponent`已经为你实现了这个AABB测试。当你的组件有矩形命中框时，从`@vectojs/ui`扩展`UIComponent`而不是直接扩展`Entity` —— 你可以免费获得`isPointInside`、`getBounds`和`padding`。

## IRenderer API

传递给`render()`的渲染器对象提供了一个类似Canvas2D的绘制表面（但后端无关 —— 可能是Canvas2D、WebGL或SVG）。

```typescript
// 路径
renderer.beginPath()
renderer.moveTo(x, y)
renderer.lineTo(x, y)
renderer.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y)
renderer.arc(cx, cy, radius, startAngle, endAngle, counterclockwise?)
renderer.roundRect(x, y, w, h, radii)
renderer.closePath()

// 填充和描边
renderer.fill(colorOrGradient)       // 例如 '#ff0' 或渐变描述符
renderer.stroke(colorOrGradient, lineWidth?)

// 文本（原生浏览器canvas文本 —— 无LayoutEngine）
renderer.fillText(text, x, y, font, color)  // font = CSS简写

// 图像
renderer.drawImage(source, dx, dy, dw, dh)

// 快速圆形批处理（合并相同颜色的运行）
renderer.fillCircle(cx, cy, radius, color, alpha?)

// 状态
renderer.save()
renderer.restore()
renderer.translate(x, y)
renderer.scale(x, y)
renderer.rotate(angle)        // 弧度
renderer.setGlobalAlpha(a)
renderer.clip(x, y, w, h)    // 在save/restore内部

// 渐变
renderer.createLinearGradient(x0, y0, x1, y1, colorStops)
```

**示例 —— 渐变卡片：**

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

## 使用`getBounds()`进行视口剔除

默认情况下，实体从不被剔除。重写`getBounds()`以返回局部空间边界框，Scene将在变换后的框超出视口时跳过`render()`。`update()`仍然运行，因此状态和动画在实体重新出现在屏幕上时保持最新：

```typescript
getBounds() {
  return { x: 0, y: 0, width: this.width, height: this.height };
}
```

`UIComponent`已经实现了这一点。对于大型场景，原始`Entity`子类应该实现它。

## 使用`update(dt, time)`的逐帧逻辑

重写`update()`以每帧运行代码。首先调用`super.update(dt, time)`以推进排队的`animate()`补间。

> [!CAUTION] > `dt`以**毫秒**为单位，而非秒。在60 fps时，`dt ≈ 16.7`。除以1000得到秒。

```typescript
class Spinner extends Entity {
  speed = 1.5; // rad/s

  update(dt: number, time: number) {
    super.update(dt, time);
    this.rotation += this.speed * (dt / 1000); // dt/1000 → 秒
  }

  // 从update()驱动的运动对Scene的空闲检查不可见，除非
  // 你报告它。这可以防止空闲节流将旋转器降低到
  // 2 fps，并且比每帧的脏标记更清晰地表达了动画意图。
  hasPendingAnimations() {
    return true; // 旋转器总是在动画
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

`time`是`performance.now()`，对于不能漂移的振荡很有用：

```typescript
this.y = Math.sin(time * 0.002) * 20; // 稳定的浮动，无累积误差
```

## 使用`animate()`的平滑动画

对于一次性过渡，`animate()`通常比自定义`update()`更好：

```typescript
entity
  .animate({ x: 300, opacity: 0 }, 400) // ease-out，400毫秒
  .animate({ opacity: 1 }, 200); // 链式：第一个完成后开始
```

只有**数值属性**会被插值。缓动是ease-out二次方（`t * (2 - t)`）。运行中的补间使场景保持非静态状态，并自动调用`markDirty()`。

## 使实体可交互

设置`interactive = true`并实现`isPointInside`。然后使用`on()`附加监听器：

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

## 使用`getA11yAttributes()`的无障碍投影

当你的实体是`interactive`时，VectoJS在其上投影一个透明的真实DOM节点。默认情况下这是一个普通的`<div>` —— 对辅助技术来说不太有用。重写`getA11yAttributes()`以告诉框架要投影什么节点：

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

现在Playwright的`page.getByRole('button', { name: 'OK' })`可以找到你的chip，屏幕阅读器会播报它，键盘用户可以Tab到它并按Enter。常用字段（参见[a11y参考](/reference/core-a11y/)获取完整列表，包括实时区域、验证状态和`aria-labelledby`/`describedby`）：

```typescript
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // 默认 'div'
  role?: string;
  label?: string; // aria-label
  href?: string; // 用于tag='a'
  src?: string;
  alt?: string; // 用于tag='img'
  inputType?: string; // 'text'、'checkbox'等
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

## 使用`getBatchCircle()`和`getBatchRect()`的WebGL批处理

对于运行数量达数千的粒子类实体（点、圆点），逐实体的`save/translate/render/restore`路径太慢。请改用批处理快速路径：

```typescript
class Particle extends Entity {
  radius = 4;
  color = '#00f0ff';

  // 当累加变换可表示时，送入WebGL批处理。
  getBatchCircle() {
    return { radius: this.radius, color: this.color };
  }

  isPointInside() {
    return false;
  }
  // Canvas模式或非均匀/剪切祖先所需的回退。
  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.arc(0, 0, this.radius, 0, Math.PI * 2);
    renderer.fill(this.color);
  }
}
```

约束：

- 实体必须是**叶子**（没有子元素）。
- 实体自身的缩放必须是**均匀的**（`scaleX === scaleY`）才能走快速路径。
- 需要在`Scene`上设置`pointBackend: 'webgl'`。
- 如果累加的祖先变换是非均匀的、剪切的，或者不能用一个半径/旋转表示，Scene会调用正常的`render()`回退。

Scene每帧读取`getBatchCircle()`，因此动画的`radius`/`color`也会被处理。点图层在一个缓冲区/绘制序列中上传许多圆形。对于矩形，改用`getBatchRect()`：

```typescript
getBatchRect() {
  return { width: this.width, height: this.height, color: this.color };
}
```

## 完整示例：动画仪表盘微件

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
    // 平滑视觉过渡
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

    // 轨道
    renderer.beginPath();
    renderer.arc(cx, cy, r, startAngle, endAngle);
    renderer.stroke('rgba(255,255,255,0.12)', 10);

    // 进度弧
    if (progress > 0) {
      renderer.beginPath();
      renderer.arc(cx, cy, r, startAngle, sweepAngle);
      renderer.stroke(this.accentColor, 10);
    }

    // 值标签
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

// 使用：
const gauge = new GaugeWidget('CPU', { accent: '#6366f1' });
gauge.setPosition(60, 60);
scene.add(gauge);
gauge.setValue(72);
```

## 总结

| 方法                                | 何时重写                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `render(renderer)`                  | 始终 —— 在局部空间(0,0)处绘制实体                                             |
| `isPointInside(gx, gy)`             | 始终 —— 对于装饰性实体返回false                                               |
| `update(dt, time)`                  | 逐帧逻辑；首先调用`super.update`；`dt`以毫秒为单位                            |
| `hasPendingAnimations()`            | 当`update()`驱动自身运动时 —— 报告"仍在移动"以使空闲节流/onDemand跳过继续渲染 |
| `getBounds()`                       | 用于视口剔除（强烈推荐）                                                      |
| `getA11yAttributes()`               | 当可交互时 —— 控制影子DOM节点                                                 |
| `getBatchCircle() / getBatchRect()` | 粒子类叶子实体，数量达数千                                                    |

## 故障排除

### 实体已添加但屏幕上什么都没有

按顺序检查：

1. **未调用`scene.start()`** —— 没有它，渲染循环永远不会触发。
2. **`render()`没有调用任何绘制方法** —— 空的`render()`是静默的。验证`renderer.fill()`或`renderer.stroke()`是否被执行。
3. **`width`或`height`为`0`** —— 实体可能在屏幕外或被剔除。设置`entity.width = 200; entity.height = 80`并检查它是否出现。
4. **`opacity`为`0`** —— 检查`entity.opacity`。
5. **实体未添加到场景** —— `new MyEntity()`构造但不添加。调用`scene.add(entity)`。

### `isPointInside`从不返回`true` / 点击事件不触发

`isPointInside`接收**全局（世界空间）**坐标。将其与`this.x` / `this.y`比较对于嵌套变换会失败，而减去`getGlobalPosition()`对于旋转和非均匀缩放仍然会失败。使用`worldToLocal()`反转完整变换：

```typescript
// 错误 —— 仅在实体位于场景根且无父变换时有效
isPointInside(gx, gy) {
  return gx >= this.x && gx <= this.x + this.width; // ← 在嵌套树中失效
}

// 正确 —— 处理嵌套平移、旋转和非均匀缩放
isPointInside(gx, gy) {
  const p = this.worldToLocal(gx, gy);
  return !!p && p.x >= 0 && p.x <= this.width
      && p.y >= 0 && p.y <= this.height;
}
```

同时确保设置了`entity.interactive = true` —— 没有它，指针事件不会分派给实体。

### `getBatchCircle()` / `getBatchRect()`未被使用

两个容易忽略的要求：

- Scene必须在其构造函数选项中设置`pointBackend: 'webgl'`。
- 实体必须是**叶子**（没有`children`）。如果你对批处理实体`add()`了一个子元素，它会静默回退到正常的`render()`路径。

检查`console.log(scene.getRenderer())` —— 如果渲染器是`CanvasRenderer`且没有WebGL层，则未设置`pointBackend: 'webgl'`或WebGL2不可用。

### DevTools中缺少影子DOM节点

a11y影子节点仅在**两个**条件都成立时创建：

1. `entity.interactive === true`
2. `entity.width > 0`（或`entity.a11yFullViewport === true`）

具有`interactive = true`但`width = 0`的实体不会有影子节点。设置`entity.width`和`entity.height`以匹配视觉大小。

## 挑战

### 进度条实体

构建一个`ProgressBar`实体，显示动画填充条，并被屏幕阅读器正确播报为进度指示器。

- 属性：`min: number`、`max: number`、`value: number`、`barColor: string`、`trackColor: string`以及`width`/`height`。
- 实现`setValue(n: number)`，将`n`限制在`[min, max]`之间，并调用`this.animate({ displayValue: n }, 400)`，其中`displayValue`驱动渲染的填充宽度。
- 重写`getA11yAttributes()`以返回`{ role: 'progressbar', valuemin, valuemax, value }`作为字符串，以便辅助技术播报当前百分比。

### 甜甜圈图

扩展`GaugeWidget`（本页底部的完整示例），渲染一个在轨道弧和进度弧之间有可见间隙的甜甜圈形状，并在值下方添加类别图例标签。

- 将轨道弧半径减少6像素，并增加进度弧半径6像素（反之亦然），以在两个同心圆环之间创建可见间隙。
- 添加`legendLabel: string`属性，并使用`renderer.fillText`以更小、更柔和的颜色在数值下方渲染它。
- 更新`getA11yAttributes()`以将`legendLabel`附加到返回的`label`字段，以便屏幕阅读器播报完整描述。

### 点击计数器chip

扩展本页交互部分的`Chip`实体，使每次点击递增计数器，并在右上角显示一个小圆形徽章，显示计数。

- 添加`clickCount = 0`属性，并在`'click'`处理器中递增它，同时保留现有的切换和缩放动画。
- 在`render()`中，仅当`clickCount > 0`时绘制徽章（一个小的填充圆，内含计数文本）；将其定位在chip局部坐标空间的`(this.width - 10, -6)`处。
- 重写`getA11yAttributes()`以在`label`字段中包含当前计数，例如`'OK — 3次点击'`，以便可访问名称随计数变化保持最新。

> **下一步：** [事件与命中测试](/learn/events/) —— 指针事件如何通过带有捕获和冒泡的实体树传播。
