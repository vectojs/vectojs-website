---
title: '食譜'
description: 'VectoJS 的常見模式和食譜：模態框、工具提示、虛擬化列表、拖放、動畫圖表等。'
order: 17
---

# 食譜

自包含的常見 VectoJS 問題模式。每個食譜都是完整的，可複製貼上。

---

## 模態對話框

在所有場景內容上方渲染一個封鎖覆蓋層。在背景點擊或按 Escape 鍵時關閉，並為螢幕閱讀器投射一個 `role="dialog"` 地標。

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

  const closeBtn = new Button('關閉', { width: 100, height: 40 });
  closeBtn.setPosition(MW - 124, MH - 58);
  modal.add(closeBtn);

  overlay.add(backdrop);
  overlay.add(modal);

  // 進入動畫：淡入背景，從略低於中心的位置滑入+淡入模態框
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

  // 返回一個命令式關閉控制代碼，用於程式化關閉
  return close;
}

// ── 使用方式 ────────────────────────────────────────────────────────────────────
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

const triggerBtn = new Button('開啟模態框', { width: 160, height: 44 });
triggerBtn.setPosition(40, 40);
triggerBtn.on('click', () =>
  openModal(scene, {
    title: '確認刪除',
    body: '這將永久移除 3 個項目。此動作無法復原。',
    onClose: () => console.log('已關閉'),
  }),
);
scene.add(triggerBtn);
scene.start();
```

> [!NOTE]
> 模態框從 `y + 32` 開始，並動畫到垂直中心，產生微妙的向上滑入效果，沒有布局跳動。背景實體使用 `isPointInside(): true`，因此遮罩上的任何點擊（不在其上方模態卡上）都會進入 `close()`。在 `close()` 中立即移除 `document` 鍵盤監聽器，以防止在快速呼叫 `openModal` 時出現重複的處理常式。

---

## 懸浮工具提示

為任何實體附加一個 400 毫秒延遲的工具提示彈出視窗。工具提示追蹤 `hover` 事件報告的指標位置，並在覆蓋層上淡入/淡出。

```typescript
import { Scene, Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class TooltipPopup extends Entity {
  constructor(private readonly text: string) {
    super();
    // 粗略寬度估計——如果你的字型度量可用，請替換為測量的文字寬度。
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
    if (timer !== null) return; // 已排程
    timer = setTimeout(() => {
      if (!visible) {
        overlay.add(tooltip);
        visible = true;
      }
      // 定位在游標的右上方
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

// ── 使用方式 ────────────────────────────────────────────────────────────────────
import { Card } from '@vectojs/ui';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

const card = new Card({ width: 200, height: 80, label: '懸浮目標' });
card.setPosition(60, 60);
scene.add(card);

attachTooltip(scene, card, '快捷鍵：⌘K');

scene.start();
```

> [!NOTE]
> 400 毫秒延遲可防止指標快速經過實體時工具提示閃爍。在計時器觸發前重新進入同一實體是空操作，因為 `timer !== null` 的早期返回防止了雙重排程。如果你希望在工具提示已可見時允許重新觸發，請在 `setTimeout` 內部將 `timer` 重置為 `null`。

---

## 拖放

一個 `DraggableCard` 實體直接在畫布上捕獲指標事件（因為 `pointermove` 必須在指標離開實體邊界時仍然觸發）。當可拖曳項目懸浮在投放區域上時，投放區域會高亮顯示，並在釋放時將其置中對齊。

```typescript
import { Scene, Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

// ── 投放區域 ────────────────────────────────────────────────────────────────
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

// ── 可拖曳卡片 ───────────────────────────────────────────────────────────
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

// ── 使用方式 ────────────────────────────────────────────────────────────────────
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

const zoneA = new DropZone('區域 A');
zoneA.setPosition(60, 180);
scene.add(zoneA);

const zoneB = new DropZone('區域 B');
zoneB.setPosition(260, 180);
scene.add(zoneB);

// 最後加入可拖曳項目，使其渲染在區域之上
const card = new DraggableCard('拖曳我', canvas, [zoneA, zoneB], scene);
card.setPosition(150, 60);
scene.add(card);

scene.start();
```

> [!NOTE] > `canvas.setPointerCapture(e.pointerId)` 使 `pointermove`、`pointerup` 和 `pointercancel` 即使在指標離開其邊界時仍能路由到畫布。將 `pointercancel` 視為回滾而非提交，以免瀏覽器中斷導致卡片卡在拖曳狀態。

---

## 點擊外部關閉

在捕獲階段攔截場景根上的每次點擊，在它到達子元素之前。用於在使用者點擊選單、下拉式選單和彈出視窗外部時關閉它們。

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
  // 在開啟新選單之前關閉任何先前開啟的選單
  if (activeMenu) {
    scene.getOverlayRoot().remove(activeMenu);
    activeMenu = null;
  }

  const ITEM_H = 36;
  const menu = new Card({
    width: 180,
    height: items.length * ITEM_H + 12,
    radius: 10,
    label: '上下文選單',
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

  // 捕獲階段：在任何實體收到事件之前觸發。
  // 使用 findEntityAt 來判斷點擊是否落在選單樹內部。
  scene.getRoot().on(
    'click',
    (e: { x: number; y: number }) => {
      if (menuDismissed) return;
      const hit = scene.findEntityAt(e.x, e.y);
      // 允許點擊選單卡片本身及其子項目（行項目）
      const inMenu = hit === menu || (hit !== null && hit.parent === menu);
      if (!inMenu) close();
    },
    { capture: true },
  );
}

// ── 使用方式 ────────────────────────────────────────────────────────────────────
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  openContextMenu(scene, e.clientX - rect.left, e.clientY - rect.top, [
    { label: '複製', onSelect: () => console.log('複製') },
    { label: '貼上', onSelect: () => console.log('貼上') },
    { label: '刪除', onSelect: () => console.log('刪除') },
  ]);
});

scene.start();
```

> [!NOTE]
> `{ capture: true }` 選項在 `scene.getRoot().on()` 上至關重要——沒有它，點擊事件會在冒泡階段分派，此時已經被子元素消費。在捕獲階段它會先觸發，因此你可以在點擊到達其下方的任何實體之前關閉彈出視窗。

---

## 動畫長條圖

每個長條都是一個獨立的實體，具有一個 `displayHeight` 屬性，`animate()` 將其從 0 驅動到長條的目標高度。長條使用 `setTimeout` 錯開，以從左到右級聯進入。

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

    // 長條填充（從基線向上增長）
    if (this.displayHeight > 1) {
      renderer.beginPath();
      renderer.roundRect(0, barTop, this.width, this.displayHeight, 4);
      renderer.fill(this.datum.color);
    }

    // 長條上方的數值標籤（僅在長條足夠高時顯示）
    if (this.displayHeight > 22) {
      renderer.fillText(
        String(this.datum.value),
        Math.floor(this.width / 2) - 8,
        barTop - 18,
        '600 12px Inter',
        '#f8fafc',
      );
    }

    // X 軸標籤
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

  // 以 100 毫秒間隔級聯長條
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    setTimeout(() => {
      bar.animate({ displayHeight: bar.targetHeight }, 700);
    }, i * 100);
  }
}

// ── 使用方式 ────────────────────────────────────────────────────────────────────
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

> [!NOTE] > `displayHeight` 必須是實體上的直接數值屬性——而不是巢狀在陣列或物件內部——`animate()` 才能對其進行插值。緩動為二次緩出，它提供自然的減速效果，非常適合增長中的長條。

---

## 通知訊息佇列

`ToastManager` 維護一個 FIFO 佇列。在另一個訊息可見時顯示訊息會將其排隊。每個訊息淡入，停留 3 秒，然後淡出，再顯示下一個。

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

    // 左邊緣的強調條
    renderer.beginPath();
    renderer.roundRect(0, 8, 3, this.height - 16, 2);
    renderer.fill(VARIANT_ACCENT[this.variant]);

    // 訊息文字
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

// ── 使用方式 ────────────────────────────────────────────────────────────────────
import { Button } from '@vectojs/ui';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

const toasts = new ToastManager(scene);

const saveBtn = new Button('儲存', { width: 120, height: 44 });
saveBtn.setPosition(40, 40);
saveBtn.on('click', () => {
  toasts.show('設定已儲存。', 'success');
});
scene.add(saveBtn);

const errBtn = new Button('觸發錯誤', { width: 160, height: 44 });
errBtn.setPosition(180, 40);
errBtn.on('click', () => {
  toasts.show('上傳失敗 — 請檢查您的連線。', 'error');
});
scene.add(errBtn);

scene.start();
```

> [!NOTE]
> `busy` 標誌閘控 `next()`，因此一次只運行一個通知訊息。在通知訊息顯示時呼叫 `show()` 會將訊息排隊——它將在當前通知訊息和所有先前排隊的通知訊息完成後出現。如果你希望並行通知訊息垂直堆疊，請追蹤一個每次活動通知遞增的 `yOffset`。

---

## 含驗證的表單

將 `Input`、`Slider`、`Toggle` 和 `Button` 組合成一個經過驗證的表單。錯誤是渲染為紅色並在提交時設定的 `Text` 實體；它們會在使用者編輯對應欄位時立即清除。

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

  // ── 使用者名稱 ──────────────────────────────────────────────────────────────
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

  // ── 音量滑桿 ─────────────────────────────────────────────────────────
  const volumeDisplay = new Text('音量：50', { font: '14px Inter', color: '#94a3b8' });
  const volumeSlider = new Slider({ min: 0, max: 100, value: 50, width: 300 });
  const volumeError = new Text('', { font: '13px Inter', color: '#f87171' });

  volumeSlider.on('change', (e: { value: number }) => {
    state.volume = e.value;
    volumeDisplay.setText(`音量：${e.value}`);
    volumeError.setText('');
    scene.markDirty();
  });

  // ── 電子報切換 ─────────────────────────────────────────────────────
  const newsletterToggle = new Toggle({ label: '訂閱版本發布通知' });

  newsletterToggle.on('change', (e: { checked: boolean }) => {
    state.newsletter = e.checked;
  });

  // ── 驗證 ────────────────────────────────────────────────────────────
  const USERNAME_RE = /^[a-z0-9_-]{3,24}$/;

  function validate(): boolean {
    let valid = true;

    if (!USERNAME_RE.test(state.username)) {
      usernameError.setText('3–24 個字元：小寫字母、數字、_ 或 -');
      valid = false;
    }

    if (state.volume < 10) {
      volumeError.setText('音量必須至少為 10。');
      valid = false;
    }

    scene.markDirty();
    return valid;
  }

  // ── 提交按鈕 ─────────────────────────────────────────────────────────
  const statusText = new Text('', { font: '14px Inter', color: '#22c55e' });

  const submitBtn = new Button('儲存設定', {
    width: 160,
    height: 44,
    bg: '#6366f1',
    hoverBg: '#818cf8',
  });

  submitBtn.on('click', () => {
    if (!validate()) return;
    statusText.setText('已儲存！');
    setTimeout(() => {
      statusText.setText('');
      scene.markDirty();
    }, 2_000);
    submitBtn.animate({ scaleX: 0.95, scaleY: 0.95 }, 80).animate({ scaleX: 1, scaleY: 1 }, 80);
    console.log('已提交：', state);
  });

  // ── 布局 ────────────────────────────────────────────────────────────────
  const stack = new Stack({ direction: 'vertical', gap: 10 });
  stack.add(new Text('帳號設定', { font: '700 22px Inter', color: '#f8fafc' }));
  stack.add(new Text('使用者名稱', { font: '600 11px Inter', color: '#64748b' }));
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
  const card = new Card({ width: CARD_W, height: CARD_H, radius: 16, label: '帳號設定' });
  stack.setPosition(28, 28);
  card.add(stack);
  card.setPosition((window.innerWidth - CARD_W) / 2, (window.innerHeight - CARD_H) / 2);
  scene.add(card);
}

// ── 使用方式 ────────────────────────────────────────────────────────────────────
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });
buildForm(scene);
scene.start();

window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
});
```

> [!NOTE]
> 錯誤 `Text` 實體始終存在於布局樹中——它們只是在不報錯時顯示空字串。這使得 `Stack` 布局保持穩定：錯誤出現時不會發生偏移。如果你希望完全隱藏空間，在無錯誤時切換為 `entity.opacity = 0` 和 `entity.height = 0`，然後在設定錯誤時恢復兩者。

---

## 透過 SVG 匯出實現清晰列印

直接列印 `<canvas>` 會將其點陣化：瀏覽器會依印表機的 DPI 縮放點陣圖，因此文字和向量圖形會變得模糊。`scene.toSVG()` 透過 `SVGRenderer` 將目前場景狀態快照為與解析度無關的 `<svg>` 文件——列印管線隨後將其作為真正的向量圖形渲染，在任何 DPI 下都清晰銳利。無需額外依賴；SVG 匯出器已內含於 `@vectojs/core` 中。

```typescript
import { Scene } from '@vectojs/core';

/**
 * 將目前場景列印為向量 SVG（在任何 DPI 下都清晰），而非點陣化的
 * 畫布點陣圖。開啟列印對話框並在完成後清理。
 */
function printScene(scene: Scene): void {
  // toSVG() 回傳一個完整的、自包含的 <svg> 字串，其 viewBox
  // 與場景的寬高相符——目前狀態的唯讀快照。
  const svg = scene.toSVG();

  // 將列印工作隔離在隱藏的同源 iframe 中，使其既不會干擾
  // 活動畫布，也不會繼承頁面的螢幕樣式表。
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);

  const doc = frame.contentDocument!;
  doc.open();
  // @page 移除預設的瀏覽器邊距；width:100% 讓向量圖形縮放
  // 以適應紙張。SVG 自帶 viewBox，因此縱橫比得以保留。
  doc.write(
    `<!doctype html><html><head><style>` +
      `@page { margin: 0; } ` +
      `html, body { margin: 0; } ` +
      `svg { width: 100%; height: auto; display: block; }` +
      `</style></head><body>${svg}</body></html>`,
  );
  doc.close();

  const win = frame.contentWindow!;
  // 在 iframe 文件穩定後列印，然後無論使用者列印或取消
  // 都移除該框架（afterprint 在兩種情況下都會觸發）。
  win.addEventListener('afterprint', () => frame.remove(), { once: true });
  win.focus();
  win.print();
}

// ── 使用方式 ────────────────────────────────────────────────────────────────────
// const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
// const scene = new Scene(canvas, { maxFPS: 60 });
// buildYourScene(scene);
// scene.start();
//
// printButton.addEventListener('click', () => printScene(scene));
```

> [!NOTE]
> `toSVG()` 是場景_目前_狀態的快照，因此應在你想列印的時刻呼叫它（例如在點擊處理函式內部），而不是在啟動時呼叫一次。它涵蓋了透過標準渲染器路徑繪製的向量幾何、文字和影像；僅限 GPU 的圖層（`WebGLPointRenderer` 粒子、`WebGPUParticleSystemManager`）不在 SVG 序列化範圍內——對於這些內容，需要合成一個點陣化的回退。由於輸出是純 SVG XML，同一字串也可用於儲存為 `.svg` 檔案（`new Blob([svg], { type: 'image/svg+xml' })`）或伺服器端渲染。
