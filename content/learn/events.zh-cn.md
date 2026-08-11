+++
title = "事件与命中测试"
description = "指针和键盘事件如何流经VectoJS实体树：捕获、冒泡、VectoJSEvent、表单变更负载和findEntityAt。"
weight = 10

[extra]
order = 10
+++

# 事件与命中测试

VectoJS使用类似DOM的**捕获 + 冒泡**事件模型。如果你使用过浏览器的`addEventListener`，机制是相同的 —— 但树遍历在虚拟数学树上运行，而不是DOM。

## 实时体验

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">实时 · @vectojs/core</span></div>
  <iframe src="/sandbox/events.html" class="sandbox-frame" loading="lazy" title="事件与命中测试交互示例" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>三个自定义Entity子类 —— 悬停缩放，点击计数。每个都连接了<code>on('hover')</code>、<code>on('pointerleave')</code>和<code>on('click')</code>。</figcaption>
</figure>

## 事件生命周期

当用户点击（或触摸、悬停）canvas时，Scene：

1. 调用`findEntityAt(x, y)`找到**目标** —— 最上层的实体，其`isPointInside()`返回`true`。
2. 构建**事件路径**：`[target, parent, grandparent, …, root]`。
3. 运行**捕获阶段**：从根向下到目标，触发使用`{ capture: true }`注册的监听器。
4. 运行**冒泡阶段**：从目标向上回到根，触发监听器（默认阶段）。

<figure>
  <iframe src="/sandbox/diagram-events.html" class="diagram-frame" loading="lazy" title="事件捕获和冒泡阶段，由VectoJS实时渲染" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>捕获从根 → 目标触发；冒泡从目标 → 根触发。目标接收两次。<em>（由VectoJS实时渲染。）</em></figcaption>
</figure>

## 监听事件

```typescript
entity.on(event, callback, options?)
entity.off(event, callback, options?)
```

默认阶段是**冒泡**。传递`{ capture: true }`在捕获阶段拦截：

```typescript
// 冒泡阶段（默认）—— 在子元素之后触发
btn.on('click', (e) => console.log('按钮被点击'));

// 捕获阶段 —— 在子元素之前触发（拦截器模式）
card.on(
  'click',
  (e) => {
    console.log('卡片首先看到点击');
    e.stopPropagation(); // 防止冒泡再次到达卡片
  },
  { capture: true },
);
```

可用事件类型：

| 事件              | 触发条件                     |
| ----------------- | ---------------------------- |
| `'click'`         | 指针在同一实体上按下并释放   |
| `'hover'`         | 指针进入实体                 |
| `'pointerdown'`   | 指针按下                     |
| `'pointerup'`     | 指针释放                     |
| `'pointercancel'` | 浏览器取消活动指针流         |
| `'pointermove'`   | 指针移动（当在实体上方时）   |
| `'pointerleave'`  | 指针离开实体                 |
| `'wheel'`         | 鼠标滚轮 / 触控板滚动        |
| `'keydown'`       | 按键按下（当实体持有焦点时） |
| `'keyup'`         | 按键释放                     |
| `'change'`        | 表单控件值改变               |
| `'focus'`         | 影子DOM节点获得焦点          |
| `'blur'`          | 影子DOM节点失去焦点          |

## VectoJSEvent

回调接收一个`VectoJSEvent`，包含以下成员：

```typescript
interface VectoJSEvent {
  type: string; // 事件名称
  target: Entity; // 事件起源的实体
  currentTarget: Entity; // 当前正在运行监听器的实体

  bubbles: boolean;

  // 传播控制
  stopPropagation(): void; // 在当前节点后停止
  stopImmediatePropagation(): void; // 也跳过此节点上的剩余监听器
  preventDefault(): void;

  defaultPrevented: boolean;

  // 来自原生事件的浏览器视口坐标
  clientX?: number;
  clientY?: number;

  // 场景逻辑坐标，然后坐标相对于currentTarget
  sceneX?: number;
  sceneY?: number;
  localX?: number;
  localY?: number;

  // 滚轮事件
  deltaX?: number;
  deltaY?: number;

  // 键盘事件
  key?: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;

  // 原始原生DOM事件
  nativeEvent?: Event;
}
```

`localX`/`localY`为每个监听器的`currentTarget`重新计算，包括嵌套旋转和非均匀缩放。在控件内部使用它们。当与另一个实体比较或存储场景空间指针时，使用`sceneX`/`sceneY`。`clientX`/`clientY`保持原始浏览器视口值。

## `emit()` vs `dispatchEvent()`

VectoJS有两个分发路径：

| 方法                                 | 功能                                             |
| ------------------------------------ | ------------------------------------------------ |
| `entity.emit(event, payload)`        | 仅触发**此实体自身的冒泡阶段监听器**。无树遍历。 |
| `entity.dispatchEvent(vectoJSEvent)` | 完整的类DOM**捕获 + 冒泡**遍历树。               |

`emit()`是内置组件在内部发出自身状态变化信号的方式（例如，`Toggle`发出自身的`'change'`）。你几乎从不直接调用`dispatchEvent()` —— `Scene`为来自浏览器的指针和键盘事件调用它。

```typescript
// 正确：在冒泡阶段监听按钮的点击
btn.on('click', (e) => {
  /* ... */
});

// 正确：在子元素处理之前拦截子树的点击
container.on(
  'click',
  (e) => {
    if (isLocked) e.stopPropagation();
  },
  { capture: true },
);

// 正确：组件发出自身状态变化（内部使用）
this.emit('change', { value: this._value });
```

## 表单变更事件负载

表单控件（`Input`、`TextArea`、`Checkbox`、`Toggle`、`Slider`、`Dropdown`）发出带类型负载的`'change'`事件：

**`Input`和`TextArea`：**

```typescript
{
  value: string;
  selectionStart?: number;   // 光标 / 选择起始偏移
  selectionEnd?: number;     // 光标 / 选择结束偏移
  composition?: {
    start: number;
    length: number;
  } | null;                  // 活动的IME预编辑范围，或null
}
```

**`Checkbox`和`Toggle`：**

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

示例 —— 读取文本输入值：

```typescript
const input = new Input({ width: 300, placeholder: '搜索…' });
input.on('change', (e) => {
  const { value, selectionStart } = e;
  console.log(`"${value}" — 光标在 ${selectionStart}`);
});
```

## 命中测试：Scene如何找到目标

`scene.findEntityAt(x, y)`以**深度优先、反向子顺序**遍历树（最上层绘制的子元素首先被测试）：

1. 覆盖层根在主根之前检查，因此覆盖层（下拉框、模态框）总是获胜。
2. 子元素按**反向**顺序遍历 —— 最后添加的子元素（渲染在最上层）首先被命中测试。
3. **没有交互过滤器**：非交互实体如果`isPointInside()`返回`true`仍然可以被返回。交互过滤只影响影子DOM投影，不影响命中测试。
4. 遍历返回第一个其`isPointInside()`返回`true`的实体，无论它是否有任何监听器。

```typescript
// 这样可行 —— 返回光标下的实体
const hit = scene.findEntityAt(pointerX, pointerY);
if (hit) console.log('命中', hit.id);
```

## 停止传播

```typescript
child.on('click', (e) => {
  e.stopPropagation(); // 父元素在冒泡阶段看不到此点击
});

// stopImmediatePropagation也会停止同一节点上的其他监听器
child.on('click', (e) => {
  e.stopImmediatePropagation();
});
child.on('click', () => {
  // 'child'上的第二个监听器如果第一个停止了立即传播则不会被调用
});
```

## 滚轮事件和`preventDefault()`

`Scene`从canvas转发`wheel`事件。调用`e.preventDefault()`停止页面滚动：

```typescript
myScroller.on('wheel', (e) => {
  this.scrollY += e.deltaY;
  e.preventDefault(); // 停止浏览器滚动
  this.scene?.markDirty();
});
```

> [!NOTE] > `ScrollView`在滚轮事件上自动调用`e.preventDefault()`，除非按住`Ctrl`（允许浏览器缩放）。如果你构建自定义滚动容器，遵循相同模式。

## 键盘事件

键盘事件被传递到持有焦点的实体（通过其影子DOM节点）。它们通过正常的捕获/冒泡向上传播树：

```typescript
inputEntity.on('keydown', (e) => {
  if (e.key === 'Enter') submitForm();
  if (e.key === 'Escape') cancelForm();
});
```

对于全局快捷键（不绑定到聚焦元素），在Scene的根上监听或使用原生的`document.addEventListener`：

```typescript
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});
```

## 捕获阶段模式

### 点击外部关闭

```typescript
scene.add(overlay); // 下拉框、模态背景等

// 根捕获：在任何实体处理点击之前触发
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

### 锁定子树

```typescript
panel.on(
  'click',
  (e) => {
    if (disabled) e.stopPropagation(); // 所有子元素被阻塞
  },
  { capture: true },
);
```

## 完整示例：悬停卡片

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
      console.log(`${this.label} 被点击`);
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

## 故障排除

### 点击触发了但错误的实体是目标

`findEntityAt`以**反向**顺序遍历子元素（最后添加的 = 首先测试）。如果两个实体重叠，后来添加的获胜。要使实体始终获胜，在其它元素之后`add()`它。要使它始终失败，在其它元素之前`add()`它。

如果错误的实体在**捕获阶段**拦截，检查祖先上的`stopPropagation()`调用 —— 停止传播的捕获监听器将阻止事件到达预期的目标。

### 事件监听器触发一次然后停止

使用`on()`添加的事件监听器是永久的，直到调用`off()`。如果监听器似乎停止了，检查：

1. 实体已从场景中移除。`scene.remove(entity)`分离它但不擦除其监听器，因此它可以稍后再次添加。
2. 父监听器在事件到达你的实体之前调用`e.stopPropagation()`。
3. 你意外调用了`off()` —— 有时通过比预期更早运行的清理函数。

### 滚轮事件触发了但页面仍然滚动

来自canvas的`wheel`事件即使你在实体上监听它们也会冒泡到浏览器。你必须显式调用`e.preventDefault()`来停止页面滚动：

```typescript
myEntity.on('wheel', (e) => {
  // ... 处理滚动 ...
  e.preventDefault(); // ← 需要停止浏览器滚动
});
```

注意：`ScrollView`会自动为其自身的滚轮事件执行此操作（除非按住`Ctrl`）。

### 键盘事件缺少`e.clientX` / `e.clientY`

`clientX`/`clientY`是指针事件字段，当原生事件不提供它们时为`undefined`。对于键盘事件，使用`e.key`、`e.shiftKey`、`e.ctrlKey`、`e.altKey`和`e.metaKey`。

> **下一步：** [物理与动画](/learn/physics-engine/) —— 弹簧、空间哈希和`update()`循环。
