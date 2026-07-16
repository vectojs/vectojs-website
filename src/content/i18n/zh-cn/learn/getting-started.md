---
title: '快速开始'
description: '安装VectoJS，创建Scene，并使用Input、Toggle、Slider、Button和ScrollView构建一个完整设置面板。'
order: 7
---

# 快速开始

本指南将引导你安装VectoJS并构建一个完整的交互式设置面板 —— 一个实用的示例，涵盖了表单、布局、滚动和无障碍。

## 安装

```bash
bun add @vectojs/core @vectojs/ui
```

VectoJS分为核心数学引擎和高级组件库。大多数应用需要同时从两者导入。

## HTML设置

VectoJS需要一个带定位父元素的`<canvas>`元素：

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>我的 VectoJS 应用</title>
    <style>
      body {
        margin: 0;
        overflow: hidden;
        background: #0a0a0f;
      }
      #app {
        position: relative;
        width: 100vw;
        height: 100vh;
      }
      #canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
    </style>
  </head>
  <body>
    <div id="app">
      <canvas id="canvas"></canvas>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

父`<div id="app">`必须是`position: relative` —— VectoJS将其无障碍影子层作为canvas的绝对定位兄弟元素插入。`Scene`会自动强制执行此操作，但显式设置可以防止视觉跳动。

## 创建Scene

```typescript
// src/main.ts
import { Scene } from '@vectojs/core';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, {
  maxFPS: 60,
  pointBackend: 'canvas', // 大型点云使用'webgl'
});

scene.start();
```

> [!NOTE]
> 构造函数是`new Scene(canvas: HTMLCanvasElement, options?)`。它接收DOM元素，而不是`{ canvasId }`字符串。

## 实时体验

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">实时 · @vectojs/core</span></div>
  <iframe src="/sandbox/getting-started.html" class="sandbox-frame" loading="lazy" title="快速开始交互示例" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>计数器 + 开关 + 滑块 —— 全部在canvas上运行，没有DOM组件。点击并交互。</figcaption>
</figure>

## 第一个组件

添加一个`Toggle`以验证一切已连接：

```typescript
import { Toggle } from '@vectojs/ui';

const toggle = new Toggle({
  label: '暗色模式',
  checked: true,
  onChange: (checked) => console.log('暗色模式：', checked),
});

toggle.setPosition(40, 40);
scene.add(toggle);
```

打开浏览器并检查DOM —— 你会发现在canvas上方有一个真实的`<div role="switch" aria-checked="true" aria-label="Dark mode">`。Playwright测试调用`page.getByRole('switch', { name: 'Dark mode' }).click()`将会正常工作。

---

## 构建设置面板

让我们构建一个更完整的示例：一个可滚动的设置面板，包含文本输入、开关、滑块和提交按钮。所有状态都存储在一个普通对象中；组件从中读取并写入。

```typescript
import { Scene } from '@vectojs/core';
import { Stack, Card, Text, Input, Toggle, Slider, Button, ScrollView } from '@vectojs/ui';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

// ── 状态 ────────────────────────────────────────────────────────────────────
const state = {
  username: '',
  notifications: true,
  highPerformance: false,
  particleCount: 5000,
};

// ── 辅助：分区标题 ───────────────────────────────────────────────────
function heading(text: string): Text {
  return new Text(text, { font: '600 13px Inter', color: '#64748b' });
}

// ── 用户名字段 ────────────────────────────────────────────────────────────
const usernameLabel = heading('用户名');

const usernameInput = new Input({
  width: 320,
  height: 40,
  placeholder: 'your-username',
  value: state.username,
  font: '16px Inter',
  onChange: (value) => {
    state.username = value;
  },
});

// ── 开关：通知 ─────────────────────────────────────────────────────
const notifLabel = heading('通知');

const notifToggle = new Toggle({
  label: '邮件通知',
  checked: state.notifications,
  accent: '#6366f1',
  onChange: (checked) => {
    state.notifications = checked;
  },
});

// ── 开关：高性能 ──────────────────────────────────────────────────
const perfToggle = new Toggle({
  label: '高性能模式',
  checked: state.highPerformance,
  accent: '#6366f1',
  onChange: (checked) => {
    state.highPerformance = checked;
  },
});

// ── 滑块：粒子数量 ────────────────────────────────────────────────────
const particleLabel = heading('最大粒子数');

const particleCountDisplay = new Text(`${state.particleCount.toLocaleString()}`, {
  font: '600 14px Inter',
  color: '#00f0ff',
});

const particleSlider = new Slider({
  min: 1000,
  max: 50000,
  value: state.particleCount,
  width: 280,
  progressColor: '#6366f1',
});

particleSlider.on('change', (e) => {
  state.particleCount = e.value;
  particleCountDisplay.setText(e.value.toLocaleString());
});

// 将标签和显示并排布局
const particleRow = new Stack({ direction: 'horizontal', gap: 12, align: 'center' });
particleRow.add(particleLabel);
particleRow.add(particleCountDisplay);

// ── 保存按钮 ───────────────────────────────────────────────────────────────
const saveBtn = new Button('保存设置', {
  bg: '#6366f1',
  hoverBg: '#818cf8',
  padding: 14,
  onClick: () => {
    console.log('已保存：', state);
    saveBtn.animate({ scaleX: 0.95, scaleY: 0.95 }, 80).animate({ scaleX: 1, scaleY: 1 }, 80);
  },
});

// ── 主布局堆栈 ─────────────────────────────────────────────────────────
const content = new Stack({ direction: 'vertical', gap: 20 });
content.add(usernameLabel);
content.add(usernameInput);
content.add(notifLabel);
content.add(notifToggle);
content.add(perfToggle);
content.add(particleRow);
content.add(particleSlider);
content.add(saveBtn);

// ── 可滚动卡片 ───────────────────────────────────────────────────────────
const PANEL_W = 400;
const PANEL_H = 480;
const PADDING = 24;

const scroll = new ScrollView({ width: PANEL_W - PADDING * 2, height: PANEL_H - PADDING * 2 });
content.setPosition(0, 0);
scroll.add(content);

const card = new Card({
  width: PANEL_W,
  height: PANEL_H,
  radius: 16,
  border: 'rgba(255,255,255,0.08)',
  label: '设置面板', // 使卡片成为role="group"地标
});

const titleText = new Text('设置', { font: '700 22px Inter', color: '#f8fafc' });
titleText.setPosition(PADDING, PADDING);
card.add(titleText);

scroll.setPosition(PADDING, PADDING + 40);
card.add(scroll);

// 将卡片居中在屏幕上
const cx = (window.innerWidth - PANEL_W) / 2;
const cy = (window.innerHeight - PANEL_H) / 2;
card.setPosition(cx, cy);
scene.add(card);

scene.start();

// ── 响应式调整大小 ─────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
  card.setPosition((window.innerWidth - PANEL_W) / 2, (window.innerHeight - PANEL_H) / 2);
});
```

### 你得到什么

- **`Stack`** 以20像素间距垂直定位子元素 —— 无需手动`x`/`y`计算。
- **`ScrollView`** 在内容溢出面板高度时裁剪和滚动内容。
- **`Card`** 绘制圆角矩形背景；设置`label`后，它会投影一个`role="group"`地标，以便屏幕阅读器播报该区域。
- **`Input`** 由真实的`<input>`影子元素支持 —— IME、剪贴板、撤销和自动填充都能工作。
- **`Button`** 自动适应标签大小，并通过canvas点击和影子`<button>`触发`onClick`。
- 所有组件直接连接到你`state`对象。

---

## 框架集成

VectoJS挂载在一个`<canvas>`上，因此它像WebGL库一样以相同方式与任何框架集成。

### React

```typescript
import { useEffect, useRef } from 'react';
import { Scene } from '@vectojs/core';
import { Button } from '@vectojs/ui';

export function VectoCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const scene = new Scene(ref.current!, { maxFPS: 60 });
    const btn = new Button('点我');
    btn.setPosition(40, 40);
    scene.add(btn);
    scene.start();

    return () => scene.destroy();
  }, []);

  return <canvas ref={ref} style={{ width: '100%', height: '100%' }} />;
}
```

### Vue 3

```typescript
<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { Scene } from '@vectojs/core';

const canvasRef = ref(null);
let scene;

onMounted(() => {
  scene = new Scene(canvasRef.value, { maxFPS: 60 });
  scene.start();
});

onUnmounted(() => scene?.destroy());
</script>

<template>
  <canvas ref="canvasRef" style="width:100%;height:100%" />
</template>
```

---

## 挑战

### 添加计数器

扩展设置面板，使其跟踪保存按钮被点击的次数，并在按钮旁边显示运行总数。

- 在状态对象中添加一个初始化为`0`的`clickCount`变量。
- 创建一个显示`'已保存 0 次'`的`Text`实体，并使用水平`Stack`将其放置在`saveBtn`旁边。
- 每次点击使用`entity.setText(...)`更新文本，并验证每次按下后计数是否正确递增。

### 响应式布局

使面板在视口窄于480像素时优雅地重排。卡片永远不应溢出窗口边缘。

- 在`resize`事件处理器中，比较`window.innerWidth`和`PANEL_W`，计算一个限制面板宽度，每侧减去至少16像素的最小边距。
- 每次调整大小时更新`card.width`、`ScrollView`宽度和`usernameInput`宽度以匹配新的面板宽度。
- 测试：将浏览器窗口调整到320像素宽，确认所有内容保持可见且没有内容裁剪到卡片边界之外。

### 主题切换

在面板头部添加一个深色/浅色主题切换，可以立即更新所有组件的视觉样式。

- 定义两个主题对象 —— 一个深色（当前颜色）和一个浅色 —— 每个指定卡片边框颜色、标题文本颜色、标签文本颜色和按钮背景的值。
- 在`ScrollView`上方添加一个标签为`'浅色模式'`的`Toggle`，并将其`change`事件连接到将活动主题的颜色值应用于每个相关实体。
- 确保卡片的`border`属性和`titleText`颜色在主题更改时都更新，并在每次属性更新后调用`scene.markDirty()`以便canvas重绘。

## 下一步

- [核心场景](/learn/core-scene/) —— 深入了解渲染循环、变换系统和空闲节流。
- [自定义实体](/learn/custom-entity/) —— 构建你自己的canvas组件。
- [事件与命中测试](/learn/events/) —— 指针和键盘事件如何在树中流动。
- [核心API参考](/reference/core-api/) —— 完整的`Scene`、`Entity`和`IRenderer`签名。
