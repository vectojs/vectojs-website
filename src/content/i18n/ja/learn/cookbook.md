---
title: 'クックブック'
description: 'VectoJSの一般的なパターンとレシピ：モーダル、ツールチップ、仮想化リスト、ドラッグ＆ドロップ、アニメーションチャートなど。'
order: 17
---

# クックブック

最も一般的なVectoJSの問題に対する自己完結型のパターン集です。各レシピは完全でコピーペースト可能です。

---

## モーダルダイアログ

シーンコンテンツ全体の上にブロッキングオーバーレイを表示します。背景クリックまたはEscapeキーで閉じ、スクリーンリーダー向けに`role="dialog"`ランドマークを投影します。

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

  // アニメーションイン：背景をフェードイン、モーダルを中央より少し下からスライド＋フェードイン
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

  // プログラムによる閉じるための命令型クローズハンドルを返す
  return close;
}

// ── 使用例 ────────────────────────────────────────────────────────────────────
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

const triggerBtn = new Button('Open modal', { width: 160, height: 44 });
triggerBtn.setPosition(40, 40);
triggerBtn.on('click', () =>
  openModal(scene, {
    title: 'Confirm deletion',
    body: 'This will permanently remove 3 items. This action cannot be undone.',
    onClose: () => console.log('dismissed'),
  }),
);
scene.add(triggerBtn);
scene.start();
```

> [!NOTE]
> モーダルは`y + 32`から開始し、垂直中央にアニメーションするため、レイアウトジャンプなしで微妙なスライドアップ入場効果が得られます。背景エンティティは`isPointInside(): true`を使用するため、スクリム上（上のモーダルカードではない）の任意のクリックが`close()`に送られます。`document`のkeydownリスナーは`close()`内で即座に削除され、`openModal`が急速に呼び出された場合の重複ハンドラーを防ぎます。

---

## ホバーツールチップ

任意のエンティティに400ms遅延のツールチップポップアップをアタッチします。ツールチップは`hover`イベントが報告するポインター位置を追跡し、オーバーレイレイヤーでフェードイン/アウトします。

```typescript
import { Scene, Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class TooltipPopup extends Entity {
  constructor(private readonly text: string) {
    super();
    // 概算の幅 — フォントメトリクスが利用可能な場合は測定テキスト幅に置き換えてください。
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
    if (timer !== null) return; // すでにスケジュール済み
    timer = setTimeout(() => {
      if (!visible) {
        overlay.add(tooltip);
        visible = true;
      }
      // カーソルの右上に配置
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

// ── 使用例 ────────────────────────────────────────────────────────────────────
import { Card } from '@vectojs/ui';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

const card = new Card({ width: 200, height: 80, label: 'Hover target' });
card.setPosition(60, 60);
scene.add(card);

attachTooltip(scene, card, 'Shortcut: ⌘K');

scene.start();
```

> [!NOTE]
> 400msの遅延により、ポインターがエンティティ上を素早く通過する際のツールチップの点滅を防ぎます。タイマー発火前に同じエンティティに再進入しても、`timer !== null`による早期リターンで二重スケジュールが防止されます。ツールチップが既に表示されている状態での再トリガーを許可したい場合は、`timer`を`null`にリセットしてください。

---

## ドラッグ＆ドロップ

`DraggableCard`エンティティはキャンバス上で直接ポインターイベントをキャプチャします（`pointermove`はポインターがエンティティ境界を離れても発火する必要があるため）。ドロップゾーンはドラッグ可能要素が上にホバーされている間ハイライト表示され、リリース時に中央にスナップされます。

```typescript
import { Scene, Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

// ── ドロップゾーン ────────────────────────────────────────────────────────────
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

// ── ドラッグ可能カード ─────────────────────────────────────────────────────────
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

// ── 使用例 ────────────────────────────────────────────────────────────────────
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

const zoneA = new DropZone('Zone A');
zoneA.setPosition(60, 180);
scene.add(zoneA);

const zoneB = new DropZone('Zone B');
zoneB.setPosition(260, 180);
scene.add(zoneB);

// ドラッグ可能要素は最後に追加し、ゾーンより上にレンダリングされるようにする
const card = new DraggableCard('Drag me', canvas, [zoneA, zoneB], scene);
card.setPosition(150, 60);
scene.add(card);

scene.start();
```

> [!NOTE] > `canvas.setPointerCapture(e.pointerId)`により、ポインターがドラッグ中に境界を離れても`pointermove`、`pointerup`、`pointercancel`がキャンバスにルーティングされ続けます。`pointercancel`はコミットではなくロールバックとして扱い、ブラウザの割り込みでカードがドラッグ状態のままにならないようにします。

---

## クリック外部で閉じる

シーンルートで子に到達する前にキャプチャフェーズですべてのクリックをインターセプトします。ユーザーがメニュー、ドロップダウン、ポップアップの外部をクリックしたときにそれらを閉じるために使用します。

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
  // 新しいメニューを開く前に以前開いたメニューを閉じる
  if (activeMenu) {
    scene.getOverlayRoot().remove(activeMenu);
    activeMenu = null;
  }

  const ITEM_H = 36;
  const menu = new Card({
    width: 180,
    height: items.length * ITEM_H + 12,
    radius: 10,
    label: 'Context menu',
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

  // キャプチャフェーズ：どのエンティティよりも先にイベントを受信
  // findEntityAtを使用してクリックがメニューツリー内にあるか判断
  scene.getRoot().on(
    'click',
    (e: { x: number; y: number }) => {
      if (menuDismissed) return;
      const hit = scene.findEntityAt(e.x, e.y);
      // メニューカード自体とその子（行アイテム）へのクリックを許可
      const inMenu = hit === menu || (hit !== null && hit.parent === menu);
      if (!inMenu) close();
    },
    { capture: true },
  );
}

// ── 使用例 ────────────────────────────────────────────────────────────────────
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  openContextMenu(scene, e.clientX - rect.left, e.clientY - rect.top, [
    { label: 'Copy', onSelect: () => console.log('copy') },
    { label: 'Paste', onSelect: () => console.log('paste') },
    { label: 'Delete', onSelect: () => console.log('delete') },
  ]);
});

scene.start();
```

> [!NOTE]
> `scene.getRoot().on()` の `{ capture: true }` オプションは重要です — これがないと、クリックイベントは子によって既に消費された後のバブルフェーズでディスパッチされます。キャプチャフェーズでは最初に発火するため、クリックが下のエンティティに到達する前にポップアップを閉じることができます。

---

## アニメーションバーチャート

各バーは独立したエンティティで、`animate()`が`displayHeight`プロパティを0からバーの目標高さまで駆動します。バーは`setTimeout`で左から右へ連続的に表示されます。

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

    // バーの塗りつぶし（ベースラインから上に成長）
    if (this.displayHeight > 1) {
      renderer.beginPath();
      renderer.roundRect(0, barTop, this.width, this.displayHeight, 4);
      renderer.fill(this.datum.color);
    }

    // バーの上の値ラベル（バーが重ならない程度に成長した場合のみ）
    if (this.displayHeight > 22) {
      renderer.fillText(
        String(this.datum.value),
        Math.floor(this.width / 2) - 8,
        barTop - 18,
        '600 12px Inter',
        '#f8fafc',
      );
    }

    // X軸ラベル
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

  // 100ms間隔でバーを連続表示
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    setTimeout(() => {
      bar.animate({ displayHeight: bar.targetHeight }, 700);
    }, i * 100);
  }
}

// ── 使用例 ────────────────────────────────────────────────────────────────────
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

buildBarChart(
  scene,
  [
    { label: 'Jan', value: 42, color: '#6366f1' },
    { label: 'Feb', value: 78, color: '#6366f1' },
    { label: 'Mar', value: 55, color: '#6366f1' },
    { label: 'Apr', value: 91, color: '#6366f1' },
    { label: 'May', value: 63, color: '#6366f1' },
    { label: 'Jun', value: 84, color: '#6366f1' },
  ],
  { x: 60, y: 40, chartHeight: 220 },
);

scene.start();
```

> [!NOTE] > `displayHeight`はエンティティの直接の数値プロパティである必要があります（配列やオブジェクト内にネストされていない） — `animate()`が補間するためです。イージングはイーズアウト二次関数で、成長するバーに適した自然な減速を提供します。

---

## トースト通知キュー

`ToastManager`はFIFOキューを維持します。別のトーストが表示中に`show()`を呼び出すとキューに入ります。各トーストはフェードインし、3秒間表示された後、次が表示される前にフェードアウトします。

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

    // 左端のアクセントバー
    renderer.beginPath();
    renderer.roundRect(0, 8, 3, this.height - 16, 2);
    renderer.fill(VARIANT_ACCENT[this.variant]);

    // メッセージテキスト
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

// ── 使用例 ────────────────────────────────────────────────────────────────────
import { Button } from '@vectojs/ui';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

const toasts = new ToastManager(scene);

const saveBtn = new Button('Save', { width: 120, height: 44 });
saveBtn.setPosition(40, 40);
saveBtn.on('click', () => {
  toasts.show('Settings saved.', 'success');
});
scene.add(saveBtn);

const errBtn = new Button('Trigger error', { width: 160, height: 44 });
errBtn.setPosition(180, 40);
errBtn.on('click', () => {
  toasts.show('Upload failed — check your connection.', 'error');
});
scene.add(errBtn);

scene.start();
```

> [!NOTE]
> `busy`フラグが`next()`をガードし、一度に1つのトーストのみが実行されるようにします。トースト表示中に`show()`を呼び出すとメッセージがキューに入れられ、現在のトーストと以前にキューイングされたすべてのトーストが完了した後に表示されます。トーストを垂直に積み重ねて並行表示する場合は、アクティブなトーストごとに増加する`yOffset`を追跡してください。

---

## バリデーション付きフォーム

`Input`、`Slider`、`Toggle`、`Button`を組み合わせてバリデーション付きフォームを構成します。エラーは赤で表示される`Text`エンティティで、送信時に設定され、ユーザーが対応するフィールドを編集するとすぐにクリアされます。

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

  // ── ユーザー名 ────────────────────────────────────────────────────────────
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

  // ── ボリュームスライダー ──────────────────────────────────────────────────
  const volumeDisplay = new Text('Volume: 50', { font: '14px Inter', color: '#94a3b8' });
  const volumeSlider = new Slider({ min: 0, max: 100, value: 50, width: 300 });
  const volumeError = new Text('', { font: '13px Inter', color: '#f87171' });

  volumeSlider.on('change', (e: { value: number }) => {
    state.volume = e.value;
    volumeDisplay.setText(`Volume: ${e.value}`);
    volumeError.setText('');
    scene.markDirty();
  });

  // ── ニュースレタートグル ──────────────────────────────────────────────────
  const newsletterToggle = new Toggle({ label: 'Subscribe to release notes' });

  newsletterToggle.on('change', (e: { checked: boolean }) => {
    state.newsletter = e.checked;
  });

  // ── バリデーション ────────────────────────────────────────────────────────
  const USERNAME_RE = /^[a-z0-9_-]{3,24}$/;

  function validate(): boolean {
    let valid = true;

    if (!USERNAME_RE.test(state.username)) {
      usernameError.setText('3–24 chars: lowercase letters, numbers, _ or -');
      valid = false;
    }

    if (state.volume < 10) {
      volumeError.setText('Volume must be at least 10.');
      valid = false;
    }

    scene.markDirty();
    return valid;
  }

  // ── 送信ボタン ───────────────────────────────────────────────────────────
  const statusText = new Text('', { font: '14px Inter', color: '#22c55e' });

  const submitBtn = new Button('Save settings', {
    width: 160,
    height: 44,
    bg: '#6366f1',
    hoverBg: '#818cf8',
  });

  submitBtn.on('click', () => {
    if (!validate()) return;
    statusText.setText('Saved!');
    setTimeout(() => {
      statusText.setText('');
      scene.markDirty();
    }, 2_000);
    submitBtn.animate({ scaleX: 0.95, scaleY: 0.95 }, 80).animate({ scaleX: 1, scaleY: 1 }, 80);
    console.log('Submitted:', state);
  });

  // ── レイアウト ────────────────────────────────────────────────────────────
  const stack = new Stack({ direction: 'vertical', gap: 10 });
  stack.add(new Text('Account settings', { font: '700 22px Inter', color: '#f8fafc' }));
  stack.add(new Text('USERNAME', { font: '600 11px Inter', color: '#64748b' }));
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
  const card = new Card({ width: CARD_W, height: CARD_H, radius: 16, label: 'Account settings' });
  stack.setPosition(28, 28);
  card.add(stack);
  card.setPosition((window.innerWidth - CARD_W) / 2, (window.innerHeight - CARD_H) / 2);
  scene.add(card);
}

// ── 使用例 ────────────────────────────────────────────────────────────────────
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });
buildForm(scene);
scene.start();

window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
});
```

> [!NOTE]
> エラー`Text`エンティティは常にレイアウトツリー内に存在します — エラーがないときは単に空文字列を表示します。これにより`Stack`レイアウトが安定し、エラー出現時のシフトが発生しません。スペースを完全に非表示にする場合は、エラーがないときに`entity.opacity = 0`と`entity.height = 0`に切り替え、エラー設定時に両方を復元します。

---

## Crisp Printing via SVG Export

`<canvas>`を直接印刷するとラスタライズされます — ブラウザがビットマップをプリンターのDPIにスケーリングするため、テキストやベクトル形状がぼやけます。`scene.toSVG()`は現在のシーン状態を`SVGRenderer`を通じて解像度に依存しない`<svg>`ドキュメントにスナップショットします — 印刷パイプラインがそれを真のベクトルとしてレンダリングするため、任意のDPIでシャープです。追加の依存関係は不要です。SVGエクスポーターは`@vectojs/core`に同梱されています。

```typescript
import { Scene } from '@vectojs/core';

/**
 * 現在のシーンをベクトルSVG（任意のDPIでシャープ）として印刷する。
 * ラスタライズされたキャンバスビットマップではなく、SVGとして印刷ダイアログを開き、
 * 後片付けを行う。
 */
function printScene(scene: Scene): void {
  // toSVG()はシーンの幅/高さに一致するviewBoxを持つ完全な自己完結型の<svg>文字列を返す。
  // 現在の状態の読み取り専用スナップショット。
  const svg = scene.toSVG();

  // 非表示の同一オリジンiframeに印刷ジョブを隔離する。これにより、
  // ライブキャンバスを乱さず、ページの画面スタイルシートを継承しない。
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);

  const doc = frame.contentDocument!;
  doc.open();
  // @pageでブラウザのデフォルトマージンを削除。width:100%でベクトルを
  // 用紙にスケーリング。SVG自体がviewBoxを持つため、アスペクト比が保持される。
  doc.write(
    `<!doctype html><html><head><style>` +
      `@page { margin: 0; } ` +
      `html, body { margin: 0; } ` +
      `svg { width: 100%; height: auto; display: block; }` +
      `</style></head><body>${svg}</body></html>`,
  );
  doc.close();

  const win = frame.contentWindow!;
  // iframeドキュメントが安定したら印刷し、ユーザーが印刷またはキャンセル
  // してもフレームを削除する（afterprintは両方で発火する）。
  win.addEventListener('afterprint', () => frame.remove(), { once: true });
  win.focus();
  win.print();
}

// ── 使用例 ────────────────────────────────────────────────────────────────────
// const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
// const scene = new Scene(canvas, { maxFPS: 60 });
// buildYourScene(scene);
// scene.start();
//
// printButton.addEventListener('click', () => printScene(scene));
```

> [!NOTE]
> `toSVG()`はシーンの_現在の_状態のスナップショットなので、印刷したいタイミング（例：クリックハンドラ内）で呼び出してください。起動時に1回呼び出すのではありません。標準レンダラーパスで描画されたベクトルジオメトリ、テキスト、画像をカバーします。GPU専用レイヤー（`WebGLPointRenderer`パーティクル、`WebGPUParticleSystemManager`）はSVGシリアライズには含まれません。それらについては、ラスタライズされたフォールバックを合成してください。出力はプレーンSVG XMLであるため、同じ文字列は`.svg`ファイルへの保存（`new Blob([svg], { type: 'image/svg+xml' })`）やサーバーサイドレンダリングにも使用できます。
