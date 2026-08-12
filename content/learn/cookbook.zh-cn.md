+++
title = "实用手册"
description = "VectoJS的常见模式和配方：模态框、工具提示、虚拟化列表、拖放、动画图表等。"
weight = 17
+++

# 实用手册

针对最常见的VectoJS问题的独立模式。每个配方都是完整且可复制粘贴的。

---

## 模态对话框

渲染一个覆盖在所有场景内容之上的阻塞遮罩层。点击背景或按Escape键关闭，并为屏幕阅读器投影一个`role="dialog"`地标。

```typescript
import { Scene, Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';
import { Card, Text, Button } from '@vectojs/ui';

class ModalBackdrop extends Entity {
  constructor(w: number, h: number) {
    super();
    this.interactive = true;
    this.width = w;
    this.height = h;
  }

  isPointInside(): boolean {
    return true;
  }

  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 0);
    renderer.fill('rgba(0,0,0,0.65)');
  }
}

export function openModal(
  scene: Scene,
  opts: { title: string; body: string; onClose?: () => void },
): () => void {
  const VW = window.innerWidth;
  const VH = window.innerHeight;
  const MW = 480;
  const MH = 240;
  const overlay = scene.getOverlayRoot();

  const backdrop = new ModalBackdrop(VW, VH);
  backdrop.opacity = 0;

  const modal = new Card({ width: MW, height: MH, radius: 16, label: opts.title });
  modal.setPosition((VW - MW) / 2, (VH - MH) / 2 + 32);
  modal.opacity = 0;

  const titleText = new Text(opts.title, { font: '700 20px Inter', color: '#f8fafc' });
  titleText.setPosition(24, 24);
  modal.add(titleText);

  const bodyText = new Text(opts.body, {
    font: '15px Inter',
    color: '#94a3b8',
    maxWidth: MW - 48,
  });
  bodyText.setPosition(24, 62);
  modal.add(bodyText);

  const closeBtn = new Button('Close', { width: 100, height: 40 });
  closeBtn.setPosition(MW - 124, MH - 58);
  modal.add(closeBtn);

  overlay.add(backdrop);
  overlay.add(modal);

  // 入场动画：背景淡入，模态框从中心稍下方上滑并淡入
  backdrop.animate({ opacity: 1 }, 180);
  modal.animate({ y: (VH - MH) / 2, opacity: 1 }, 220);

  const close = () => {
    document.removeEventListener('keydown', onKey);
    backdrop.animate({ opacity: 0 }, 140);
    modal.animate({ opacity: 0 }, 140);
    setTimeout(() => {
      overlay.remove(backdrop);
      overlay.remove(modal);
      opts.onClose?.();
    }, 150);
  };

  backdrop.on('click', close);
  closeBtn.on('click', close);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);

  // 返回一个命令式关闭句柄，用于程序化关闭
  return close;
}

// ── 使用 ────────────────────────────────────────────────────────────────────
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

const triggerBtn = new Button('Open modal', { width: 160, height: 44 });
triggerBtn.setPosition(40, 40);
triggerBtn.on('click', () =>
  openModal(scene, {
    title: '确认删除',
    body: '这将永久移除3个项目。此操作无法撤销。',
    onClose: () => console.log('已关闭'),
  }),
);
scene.add(triggerBtn);
scene.start();
```

> [!NOTE]
> 模态框从`y + 32`开始，动画到垂直中心，产生微妙的滑入效果，没有布局跳跃。背景实体使用`isPointInside(): true`，因此打在遮罩层（不是上面模态卡片）上的任何点击都会进入`close()`。`document`上的按键监听器在`close()`中立即移除，以防止在快速调用`openModal`时出现重复处理器。

---

## 悬停工具提示

为任何实体附加一个400毫秒延迟的工具提示弹窗。工具提示跟踪`hover`事件报告的指针位置，并在覆盖层上淡入/淡出。

```typescript
import { Scene, Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class TooltipPopup extends Entity {
  constructor(private readonly text: string) {
    super();
    // 粗略宽度估算 — 如果字体度量可用，可替换为测量文本宽度
    this.width = Math.max(80, text.length * 7.6 + 20);
    this.height = 32;
    this.opacity = 0;
  }

  isPointInside(): boolean {
    return false;
  }

  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 6);
    renderer.fill('rgba(10,14,24,0.97)');
    renderer.stroke('rgba(255,255,255,0.1)', 1);
    renderer.fillText(this.text, 10, 9, '13px Inter', '#e2e8f0');
  }
}

export function attachTooltip(scene: Scene, target: Entity, text: string): void {
  const tooltip = new TooltipPopup(text);
  const overlay = scene.getOverlayRoot();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let visible = false;

  target.on('hover', (e: { x: number; y: number }) => {
    if (timer !== null) return; // 已安排
    timer = setTimeout(() => {
      if (!visible) {
        overlay.add(tooltip);
        visible = true;
      }
      // 定位在光标上方偏右
      tooltip.setPosition(e.x + 14, e.y - 44);
      tooltip.opacity = 0;
      tooltip.animate({ opacity: 1 }, 120);
    }, 400);
  });

  target.on('pointerleave', () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (!visible) return;
    tooltip.animate({ opacity: 0 }, 100);
    setTimeout(() => {
      if (visible) {
        overlay.remove(tooltip);
        visible = false;
      }
    }, 110);
  });
}

// ── 使用 ────────────────────────────────────────────────────────────────────
import { Card } from '@vectojs/ui';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

const card = new Card({ width: 200, height: 80, label: '悬停目标' });
card.setPosition(60, 60);
scene.add(card);

attachTooltip(scene, card, '快捷键：⌘K');

scene.start();
```

> [!NOTE]
> 400毫秒延迟防止指针快速经过实体时工具提示闪烁。在计时器触发前重新进入同一实体是无操作的，因为`timer !== null`的提前返回防止了重复调度。如果希望在工具提示已可见时允许重新触发，在`setTimeout`内部将`timer`重置为`null`。

---

## 拖放

`DraggableCard`实体直接在canvas上捕获指针事件（因为`pointermove`必须在指针离开实体边界时也能触发）。放置区在可拖动元素悬停其上时高亮显示，释放时将其吸附到中心。

```typescript
import { Scene, Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

// ── 放置区 ────────────────────────────────────────────────────────────────
class DropZone extends Entity {
  highlighted = false;

  constructor(public readonly label: string) {
    super();
    this.interactive = true;
    this.width = 160;
    this.height = 100;
  }

  isPointInside(gx: number, gy: number): boolean {
    const p = this.getGlobalPosition();
    return gx >= p.x && gx <= p.x + this.width && gy >= p.y && gy <= p.y + this.height;
  }

  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 12);
    renderer.fill(this.highlighted ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)');
    renderer.stroke(this.highlighted ? '#6366f1' : 'rgba(255,255,255,0.12)', 2);
    renderer.fillText(this.label, 12, this.height / 2 - 8, '500 14px Inter', '#94a3b8');
  }
}

// ── 可拖拽卡片 ───────────────────────────────────────────────────────────
class DraggableCard extends Entity {
  private dragging = false;
  private offsetX = 0;
  private offsetY = 0;

  constructor(
    public readonly label: string,
    canvas: HTMLCanvasElement,
    private readonly zones: DropZone[],
    private readonly scene: Scene,
  ) {
    super();
    this.interactive = true;
    this.width = 120;
    this.height = 50;

    canvas.addEventListener('pointerdown', (e) => {
      const { x, y } = this.toSceneCoords(e, canvas);
      if (!this.isPointInside(x, y)) return;
      this.dragging = true;
      this.offsetX = x - this.x;
      this.offsetY = y - this.y;
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const { x, y } = this.toSceneCoords(e, canvas);
      this.setPosition(x - this.offsetX, y - this.offsetY);
      for (const zone of this.zones) {
        zone.highlighted = zone.isPointInside(x, y);
      }
      this.scene.markDirty();
    });

    canvas.addEventListener('pointerup', (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      const { x, y } = this.toSceneCoords(e, canvas);
      const hit = this.zones.find((z) => z.isPointInside(x, y));
      if (hit) {
        const hp = hit.getGlobalPosition();
        this.animate(
          { x: hp.x + (hit.width - this.width) / 2, y: hp.y + (hit.height - this.height) / 2 },
          200,
        );
      }
      for (const zone of this.zones) zone.highlighted = false;
      this.scene.markDirty();
    });

    canvas.addEventListener('pointercancel', () => {
      if (!this.dragging) return;
      this.dragging = false;
      for (const zone of this.zones) zone.highlighted = false;
      this.scene.markDirty();
    });
  }

  private toSceneCoords(e: PointerEvent, canvas: HTMLCanvasElement): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  isPointInside(gx: number, gy: number): boolean {
    const p = this.getGlobalPosition();
    return gx >= p.x && gx <= p.x + this.width && gy >= p.y && gy <= p.y + this.height;
  }

  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 10);
    renderer.fill('#6366f1');
    renderer.fillText(this.label, 14, 17, '500 14px Inter', '#fff');
  }
}

// ── 使用 ────────────────────────────────────────────────────────────────────
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

const zoneA = new DropZone('区域 A');
zoneA.setPosition(60, 180);
scene.add(zoneA);

const zoneB = new DropZone('区域 B');
zoneB.setPosition(260, 180);
scene.add(zoneB);

// 最后添加可拖拽元素，使其渲染在区域上方
const card = new DraggableCard('拖我', canvas, [zoneA, zoneB], scene);
card.setPosition(150, 60);
scene.add(card);

scene.start();
```

> [!NOTE] > `canvas.setPointerCapture(e.pointerId)`使`pointermove`、`pointerup`和`pointercancel`在指针离开canvas边界时仍能路由到canvas。将`pointercancel`视为回滚而非提交，这样浏览器中断不会使卡片卡在拖拽状态。

---

## 点击外部关闭

在捕获阶段拦截场景根上的每个点击，在到达子元素之前触发。用于当用户点击菜单、下拉框和弹窗外部时关闭它们。

```typescript
import { Scene, Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';
import { Card, Text } from '@vectojs/ui';

interface MenuItem {
  label: string;
  onSelect: () => void;
}

let activeMenu: Card | null = null;
let menuDismissed = false;

export function openContextMenu(scene: Scene, x: number, y: number, items: MenuItem[]): void {
  // 在打开新菜单前关闭任何之前打开的菜单
  if (activeMenu) {
    scene.getOverlayRoot().remove(activeMenu);
    activeMenu = null;
  }

  const ITEM_H = 36;
  const menu = new Card({
    width: 180,
    height: items.length * ITEM_H + 12,
    radius: 10,
    label: '上下文菜单',
  });
  menu.setPosition(x, y);
  menu.opacity = 0;
  menu.animate({ opacity: 1 }, 100);

  for (let i = 0; i < items.length; i++) {
    const { label, onSelect } = items[i];
    const row = new Text(label, { font: '14px Inter', color: '#e2e8f0' });
    row.setPosition(14, 8 + i * ITEM_H + 10);
    row.interactive = true;
    row.on('click', () => {
      onSelect();
      close();
    });
    menu.add(row);
  }

  activeMenu = menu;
  menuDismissed = false;
  scene.getOverlayRoot().add(menu);

  const close = () => {
    if (menuDismissed) return;
    menuDismissed = true;
    menu.animate({ opacity: 0 }, 80);
    setTimeout(() => {
      scene.getOverlayRoot().remove(menu);
      if (activeMenu === menu) activeMenu = null;
    }, 90);
  };

  // 捕获阶段：在任何实体收到事件之前触发。
  // 使用findEntityAt判断点击是否落在菜单树内部。
  scene.getRoot().on(
    'click',
    (e: { x: number; y: number }) => {
      if (menuDismissed) return;
      const hit = scene.findEntityAt(e.x, e.y);
      // 允许点击菜单卡片本身及其子元素（行项）
      const inMenu = hit === menu || (hit !== null && hit.parent === menu);
      if (!inMenu) close();
    },
    { capture: true },
  );
}

// ── 使用 ────────────────────────────────────────────────────────────────────
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  openContextMenu(scene, e.clientX - rect.left, e.clientY - rect.top, [
    { label: '复制', onSelect: () => console.log('复制') },
    { label: '粘贴', onSelect: () => console.log('粘贴') },
    { label: '删除', onSelect: () => console.log('删除') },
  ]);
});

scene.start();
```

> [!NOTE]
> `scene.getRoot().on()`上的`{ capture: true }`选项至关重要 —— 没有它，点击事件在冒泡阶段分发，此时已被子元素消费。在捕获阶段它首先触发，因此你可以在点击到达其下方的任何实体之前关闭弹窗。

---

## 动画条形图

每个条形是一个独立的实体，具有`displayHeight`属性，`animate()`将其从0驱动到目标高度。条形使用`setTimeout`从左到右交错级联。

```typescript
import { Scene, Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

interface BarDatum {
  label: string;
  value: number;
  color: string;
}

class AnimatedBar extends Entity {
  displayHeight = 0;
  readonly targetHeight: number;

  private static readonly BAR_W = 44;
  private static readonly LABEL_H = 36;

  constructor(
    private readonly datum: BarDatum,
    maxValue: number,
    chartHeight: number,
  ) {
    super();
    this.targetHeight = (datum.value / maxValue) * chartHeight;
    this.width = AnimatedBar.BAR_W;
    this.height = chartHeight + AnimatedBar.LABEL_H;
  }

  getBounds() {
    return { x: 0, y: 0, width: this.width, height: this.height };
  }

  isPointInside(): boolean {
    return false;
  }

  render(renderer: IRenderer) {
    const chartH = this.height - AnimatedBar.LABEL_H;
    const barTop = chartH - this.displayHeight;

    // 条形填充（从基线向上增长）
    if (this.displayHeight > 1) {
      renderer.beginPath();
      renderer.roundRect(0, barTop, this.width, this.displayHeight, 4);
      renderer.fill(this.datum.color);
    }

    // 条形上方值标签（仅在条形长得足够高不至于重叠时）
    if (this.displayHeight > 22) {
      renderer.fillText(
        String(this.datum.value),
        Math.floor(this.width / 2) - 8,
        barTop - 18,
        '600 12px Inter',
        '#f8fafc',
      );
    }

    // X轴标签
    renderer.fillText(this.datum.label, 8, chartH + 14, '12px Inter', '#64748b');
  }
}

export function buildBarChart(
  scene: Scene,
  data: BarDatum[],
  opts: { x: number; y: number; chartHeight?: number; gap?: number },
): void {
  const chartHeight = opts.chartHeight ?? 200;
  const gap = opts.gap ?? 20;
  const maxValue = Math.max(...data.map((d) => d.value));
  const bars: AnimatedBar[] = [];

  let offsetX = 0;
  for (const datum of data) {
    const bar = new AnimatedBar(datum, maxValue, chartHeight);
    bar.setPosition(opts.x + offsetX, opts.y);
    scene.add(bar);
    bars.push(bar);
    offsetX += bar.width + gap;
  }

  // 条形以100毫秒交错级联进入
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    setTimeout(() => {
      bar.animate({ displayHeight: bar.targetHeight }, 700);
    }, i * 100);
  }
}

// ── 使用 ────────────────────────────────────────────────────────────────────
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

buildBarChart(
  scene,
  [
    { label: '一月', value: 42, color: '#6366f1' },
    { label: '二月', value: 78, color: '#6366f1' },
    { label: '三月', value: 55, color: '#6366f1' },
    { label: '四月', value: 91, color: '#6366f1' },
    { label: '五月', value: 63, color: '#6366f1' },
    { label: '六月', value: 84, color: '#6366f1' },
  ],
  { x: 60, y: 40, chartHeight: 220 },
);

scene.start();
```

> [!NOTE] > `displayHeight`必须是实体上的直接数值属性 —— 而不是嵌套在数组或对象内部 —— 以便`animate()`能够对其进行插值。缓动方式是ease-out二次方，这提供了适合条形增长的自然减速度。

---

## Toast通知队列

`ToastManager`维护一个FIFO队列。在另一个Toast可见时显示一个Toast会将其排队。每个Toast淡入，停留3秒，然后淡出，之后显示下一个。

```typescript
import { Scene, Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

type ToastVariant = 'info' | 'success' | 'error';

const VARIANT_COLOR: Record<ToastVariant, string> = {
  info: 'rgba(15,23,42,0.97)',
  success: 'rgba(6,30,20,0.97)',
  error: 'rgba(40,8,8,0.97)',
};

const VARIANT_ACCENT: Record<ToastVariant, string> = {
  info: '#6366f1',
  success: '#22c55e',
  error: '#f87171',
};

class ToastEntity extends Entity {
  constructor(
    private readonly message: string,
    private readonly variant: ToastVariant,
  ) {
    super();
    this.width = 340;
    this.height = 54;
    this.opacity = 0;
  }

  isPointInside(): boolean {
    return false;
  }

  render(renderer: IRenderer) {
    // 背景
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 10);
    renderer.fill(VARIANT_COLOR[this.variant]);
    renderer.stroke('rgba(255,255,255,0.08)', 1);

    // 左侧强调条
    renderer.beginPath();
    renderer.roundRect(0, 8, 3, this.height - 16, 2);
    renderer.fill(VARIANT_ACCENT[this.variant]);

    // 消息文本
    renderer.fillText(this.message, 18, 18, '14px Inter', '#f1f5f9');
  }
}

export class ToastManager {
  private queue: Array<{ message: string; variant: ToastVariant }> = [];
  private busy = false;
  private readonly overlay: ReturnType<Scene['getOverlayRoot']>;

  constructor(private readonly scene: Scene) {
    this.overlay = scene.getOverlayRoot();
  }

  show(message: string, variant: ToastVariant = 'info'): void {
    this.queue.push({ message, variant });
    if (!this.busy) this.next();
  }

  private next(): void {
    const item = this.queue.shift();
    if (!item) {
      this.busy = false;
      return;
    }
    this.busy = true;

    const toast = new ToastEntity(item.message, item.variant);
    const x = (window.innerWidth - toast.width) / 2;
    const y = window.innerHeight - 88;
    toast.setPosition(x, y);

    this.overlay.add(toast);
    toast.animate({ opacity: 1 }, 200);

    setTimeout(() => {
      toast.animate({ opacity: 0 }, 300);
      setTimeout(() => {
        this.overlay.remove(toast);
        this.next();
      }, 320);
    }, 3_000);
  }
}

// ── 使用 ────────────────────────────────────────────────────────────────────
import { Button } from '@vectojs/ui';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

const toasts = new ToastManager(scene);

const saveBtn = new Button('保存', { width: 120, height: 44 });
saveBtn.setPosition(40, 40);
saveBtn.on('click', () => {
  toasts.show('设置已保存。', 'success');
});
scene.add(saveBtn);

const errBtn = new Button('触发错误', { width: 160, height: 44 });
errBtn.setPosition(180, 40);
errBtn.on('click', () => {
  toasts.show('上传失败 — 请检查您的连接。', 'error');
});
scene.add(errBtn);

scene.start();
```

> [!NOTE]
> `busy`标志门控`next()`，因此一次只运行一个toast。在toast显示时调用`show()`会将消息入队 —— 它将在当前toast和所有先前排队的toast完成后出现。如果你希望并行toast垂直堆叠，跟踪一个随每次活动toast递增的`yOffset`。

---

## 带验证的表单

组合`Input`、`Slider`、`Toggle`和`Button`成为一个经过验证的表单。错误是渲染为红色并在提交时设置的`Text`实体；一旦用户编辑相应字段，它们就会清除。

```typescript
import { Scene } from '@vectojs/core';
import { Stack, Card, Text, Input, Toggle, Slider, Button } from '@vectojs/ui';

interface FormState {
  username: string;
  volume: number;
  newsletter: boolean;
}

export function buildForm(scene: Scene): void {
  const state: FormState = { username: '', volume: 50, newsletter: false };

  // ── 用户名 ──────────────────────────────────────────────────────────────
  const usernameInput = new Input({
    width: 300,
    height: 40,
    placeholder: 'your-username',
    font: '15px Inter',
  });
  const usernameError = new Text('', { font: '13px Inter', color: '#f87171' });

  usernameInput.on('change', (e: { value: string }) => {
    state.username = e.value;
    usernameError.setText('');
    scene.markDirty();
  });

  // ── 音量滑块 ─────────────────────────────────────────────────────────
  const volumeDisplay = new Text('音量：50', { font: '14px Inter', color: '#94a3b8' });
  const volumeSlider = new Slider({ min: 0, max: 100, value: 50, width: 300 });
  const volumeError = new Text('', { font: '13px Inter', color: '#f87171' });

  volumeSlider.on('change', (e: { value: number }) => {
    state.volume = e.value;
    volumeDisplay.setText(`音量：${e.value}`);
    volumeError.setText('');
    scene.markDirty();
  });

  // ── 新闻简报开关 ─────────────────────────────────────────────────────
  const newsletterToggle = new Toggle({ label: '订阅发布说明' });

  newsletterToggle.on('change', (e: { checked: boolean }) => {
    state.newsletter = e.checked;
  });

  // ── 验证 ────────────────────────────────────────────────────────────
  const USERNAME_RE = /^[a-z0-9_-]{3,24}$/;

  function validate(): boolean {
    let valid = true;

    if (!USERNAME_RE.test(state.username)) {
      usernameError.setText('3–24个字符：小写字母、数字、_ 或 -');
      valid = false;
    }

    if (state.volume < 10) {
      volumeError.setText('音量必须至少为10。');
      valid = false;
    }

    scene.markDirty();
    return valid;
  }

  // ── 提交按钮 ─────────────────────────────────────────────────────────
  const statusText = new Text('', { font: '14px Inter', color: '#22c55e' });

  const submitBtn = new Button('保存设置', {
    width: 160,
    height: 44,
    bg: '#6366f1',
    hoverBg: '#818cf8',
  });

  submitBtn.on('click', () => {
    if (!validate()) return;
    statusText.setText('已保存！');
    setTimeout(() => {
      statusText.setText('');
      scene.markDirty();
    }, 2_000);
    submitBtn.animate({ scaleX: 0.95, scaleY: 0.95 }, 80).animate({ scaleX: 1, scaleY: 1 }, 80);
    console.log('已提交：', state);
  });

  // ── 布局 ────────────────────────────────────────────────────────────────
  const stack = new Stack({ direction: 'vertical', gap: 10 });
  stack.add(new Text('账户设置', { font: '700 22px Inter', color: '#f8fafc' }));
  stack.add(new Text('用户名', { font: '600 11px Inter', color: '#64748b' }));
  stack.add(usernameInput);
  stack.add(usernameError);
  stack.add(volumeDisplay);
  stack.add(volumeSlider);
  stack.add(volumeError);
  stack.add(newsletterToggle);
  stack.add(submitBtn);
  stack.add(statusText);

  const CARD_W = 360;
  const CARD_H = 460;
  const card = new Card({ width: CARD_W, height: CARD_H, radius: 16, label: '账户设置' });
  stack.setPosition(28, 28);
  card.add(stack);
  card.setPosition((window.innerWidth - CARD_W) / 2, (window.innerHeight - CARD_H) / 2);
  scene.add(card);
}

// ── 使用 ────────────────────────────────────────────────────────────────────
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });
buildForm(scene);
scene.start();

window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
});
```

> [!NOTE]
> 错误`Text`实体始终在布局树中 —— 它们只是在没有错误时显示空字符串。这保持了`Stack`布局稳定：错误出现时不会发生位移。如果你希望完全隐藏空间，在没有错误时切换到`entity.opacity = 0`和`entity.height = 0`，然后在设置错误时恢复两者。

---

## 通过 SVG 导出实现清晰打印

直接打印 `<canvas>` 会将其栅格化：浏览器会按打印机的 DPI 缩放位图，因此文本和矢量图形会变得模糊。`scene.toSVG()` 通过 `SVGRenderer` 将当前场景状态快照为与分辨率无关的 `<svg>` 文档——打印管线随后将其作为真正的矢量图形渲染，在任何 DPI 下都清晰锐利。无需额外依赖；SVG 导出器已包含在 `@vectojs/core` 中。

```typescript
import { Scene } from '@vectojs/core';

/**
 * 将当前场景打印为矢量 SVG（在任何 DPI 下都清晰），而非栅格化的
 * 画布位图。打开打印对话框并在完成后清理。
 */
function printScene(scene: Scene): void {
  // toSVG() 返回一个完整的、自包含的 <svg> 字符串，其 viewBox
  // 与场景的宽高匹配——当前状态的只读快照。
  const svg = scene.toSVG();

  // 将打印任务隔离在隐藏的同源 iframe 中，使其既不会干扰
  // 活动画布，也不会继承页面的屏幕样式表。
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);

  const doc = frame.contentDocument!;
  doc.open();
  // @page 移除默认的浏览器边距；width:100% 让矢量图形缩放
  // 以适应纸张。SVG 自带 viewBox，因此纵横比得以保留。
  doc.write(
    `<!doctype html><html><head><style>` +
      `@page { margin: 0; } ` +
      `html, body { margin: 0; } ` +
      `svg { width: 100%; height: auto; display: block; }` +
      `</style></head><body>${svg}</body></html>`,
  );
  doc.close();

  const win = frame.contentWindow!;
  // 在 iframe 文档稳定后打印，然后无论用户打印还是取消
  // 都移除该框架（afterprint 在两种情况下都会触发）。
  win.addEventListener('afterprint', () => frame.remove(), { once: true });
  win.focus();
  win.print();
}

// ── 使用 ────────────────────────────────────────────────────────────────────
// const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
// const scene = new Scene(canvas, { maxFPS: 60 });
// buildYourScene(scene);
// scene.start();
//
// printButton.addEventListener('click', () => printScene(scene));
```

> [!NOTE]
> `toSVG()` 是场景_当前_状态的快照，因此应在你想打印的时刻调用它（例如在点击处理函数内部），而不是在启动时调用一次。它涵盖了通过标准渲染器路径绘制的矢量几何、文本和图像；仅限 GPU 的图层（`WebGLPointRenderer` 粒子、`WebGPUParticleSystemManager`）不在 SVG 序列化范围内——对于这些内容，需要合成一个栅格化的回退。由于输出是纯 SVG XML，同一字符串也可用于保存为 `.svg` 文件（`new Blob([svg], { type: 'image/svg+xml' })`）或服务端渲染。
