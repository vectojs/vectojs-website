---
title: '쿡북'
description: 'VectoJS를 위한 일반적인 패턴과 레시피: 모달, 툴팁, 가상화 목록, 드래그 앤 드롭, 애니메이션 차트 등'
order: 17
---

# 쿡북

가장 일반적인 VectoJS 문제를 위한 독립형 패턴입니다. 각 레시피는 완전하며 복사-붙여넣기로 사용할 수 있습니다.

---

## 모달 대화상자

모든 Scene 콘텐츠 위에 차단 오버레이를 렌더링합니다. 배경 클릭 또는 Escape 키로 닫히며, 스크린 리더를 위해 `role="dialog"` 랜드마크를 프로젝션합니다.

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

  // 애니메이션 인: 배경 페이드 인, 모달을 중앙보다 약간 아래에서 슬라이드 + 페이드
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

  // 프로그래밍 방식 닫기를 위한 명령형 핸들 반환
  return close;
}

// ── 사용법 ────────────────────────────────────────────────────────────────────
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
> 모달은 `y + 32`에서 시작하여 세로 중앙으로 애니메이션되어, 레이아웃 점프 없이 미묘한 슬라이드업 인트로를 제공합니다. 배경 엔티티는 `isPointInside(): true`를 사용하므로 스크림(모달 카드 위가 아닌 부분)의 모든 클릭이 `close()`로 전달됩니다. `close()`에서 문서 키다운 리스너가 즉시 제거되어 `openModal`이 빠르게 반복 호출되어도 중복 핸들러가 생성되지 않습니다.

---

## 호버 시 툴팁

400ms 지연된 툴팁 팝업을 모든 엔티티에 연결합니다. 툴팁은 `hover` 이벤트가 보고하는 포인터 위치를 추적하며 오버레이 레이어에서 페이드 인/아웃됩니다.

```typescript
import { Scene, Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class TooltipPopup extends Entity {
  constructor(private readonly text: string) {
    super();
    // 대략적인 너비 추정치 — 글꼴 메트릭을 사용할 수 있으면 측정된 텍스트 너비로 대체하세요.
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
    if (timer !== null) return; // 이미 예약됨
    timer = setTimeout(() => {
      if (!visible) {
        overlay.add(tooltip);
        visible = true;
      }
      // 커서의 오른쪽 위에 배치
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

// ── 사용법 ────────────────────────────────────────────────────────────────────
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
> 400ms 지연은 포인터가 엔티티 위를 빠르게 지나갈 때 툴팁이 깜빡이는 것을 방지합니다. 타이머가 실행되기 전에 동일한 엔티티에 다시 진입하면 `timer !== null`의 조기 반환으로 인해 아무 일도 일어나지 않아 이중 예약이 방지됩니다. 툴팁이 이미 보이는 중에도 재트리거를 허용하려면 `setTimeout` 내부에서 `timer`를 `null`로 재설정하세요.

---

## 드래그 앤 드롭

`DraggableCard` 엔티티는 캔버스에서 직접 포인터 이벤트를 캡처합니다(`pointermove`가 포인터가 엔티티 경계를 벗어나도 실행되어야 하므로). 드롭 영역은 드래그 가능 항목이 위에 호버되는 동안 하이라이트되고, 놓을 때 중앙에 스냅됩니다.

```typescript
import { Scene, Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

// ── 드롭 영역 ────────────────────────────────────────────────────────────────
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

// ── 드래그 가능 카드 ───────────────────────────────────────────────────────────
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

// ── 사용법 ────────────────────────────────────────────────────────────────────
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

const zoneA = new DropZone('Zone A');
zoneA.setPosition(60, 180);
scene.add(zoneA);

const zoneB = new DropZone('Zone B');
zoneB.setPosition(260, 180);
scene.add(zoneB);

// 드래그 가능 항목을 마지막에 추가하여 영역 위에 렌더링되도록 함
const card = new DraggableCard('Drag me', canvas, [zoneA, zoneB], scene);
card.setPosition(150, 60);
scene.add(card);

scene.start();
```

> [!NOTE] > `canvas.setPointerCapture(e.pointerId)`는 포인터가 드래그 중에 경계를 벗어나도 `pointermove`, `pointerup`, `pointercancel`이 캔버스로 라우팅되도록 유지합니다. `pointercancel`은 커밋이 아닌 롤백으로 처리하여 브라우저 중단이 카드를 드래깅 상태에 갇히게 하지 않도록 하세요.

---

## 외부 클릭으로 닫기

자식에게 도달하기 전에 Scene 루트의 캡처 단계에서 모든 클릭을 가로챕니다. 사용자가 메뉴, 드롭다운, 팝업 외부를 클릭할 때 이를 닫는 데 사용됩니다.

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
  // 새 메뉴를 열기 전에 이전에 열린 메뉴 닫기
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

  // 캡처 단계: 엔티티가 이벤트를 수신하기 전에 실행됩니다.
  // findEntityAt을 사용하여 클릭이 메뉴 트리 내부에 있는지 확인합니다.
  scene.getRoot().on(
    'click',
    (e: { x: number; y: number }) => {
      if (menuDismissed) return;
      const hit = scene.findEntityAt(e.x, e.y);
      // 메뉴 카드 자체와 그 자식(행 항목)에 대한 클릭 허용
      const inMenu = hit === menu || (hit !== null && hit.parent === menu);
      if (!inMenu) close();
    },
    { capture: true },
  );
}

// ── 사용법 ────────────────────────────────────────────────────────────────────
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
> `scene.getRoot().on()`의 `{ capture: true }` 옵션은 중요합니다 — 이것이 없으면 클릭 이벤트가 자식에 의해 이미 소비된 후 버블 단계에서 발송됩니다. 캡처 단계에서는 먼저 실행되므로, 클릭이 그 아래의 엔티티에 도달하기 전에 팝업을 닫을 수 있습니다.

---

## 애니메이션 막대 차트

각 막대는 `displayHeight` 속성을 가진 독립적인 엔티티이며, `animate()`가 0에서 막대의 대상 높이로 구동합니다. 막대는 `setTimeout`으로 지연(stagger)되어 왼쪽에서 오른쪽으로 순차적으로 나타납니다.

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

    // 막대 채움 (기준선에서 위로 성장)
    if (this.displayHeight > 1) {
      renderer.beginPath();
      renderer.roundRect(0, barTop, this.width, this.displayHeight, 4);
      renderer.fill(this.datum.color);
    }

    // 막대 위의 값 레이블 (막대가 겹치지 않을 만큼 충분히 성장했을 때만)
    if (this.displayHeight > 22) {
      renderer.fillText(
        String(this.datum.value),
        Math.floor(this.width / 2) - 8,
        barTop - 18,
        '600 12px Inter',
        '#f8fafc',
      );
    }

    // X축 레이블
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

  // 100ms 지연으로 막대를 순차적으로 나타냄
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    setTimeout(() => {
      bar.animate({ displayHeight: bar.targetHeight }, 700);
    }, i * 100);
  }
}

// ── 사용법 ────────────────────────────────────────────────────────────────────
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

> [!NOTE] > `displayHeight`는 `animate()`가 보간할 수 있도록 엔티티의 직접 숫자 속성이어야 합니다 — 배열이나 객체 내부에 중첩되지 않아야 합니다. 이징은 이즈아웃 쿼드(ease-out quadratic)로, 막대 성장에 잘 맞는 자연스러운 감속을 제공합니다.

---

## 토스트 알림 대기열

`ToastManager`는 FIFO 대기열을 유지합니다. 다른 토스트가 보이는 동안 토스트를 표시하면 대기열에 추가됩니다. 각 토스트는 페이드 인되어 3초 동안 유지된 후 페이드 아웃되고 다음 토스트가 표시됩니다.

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
    // 배경
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 10);
    renderer.fill(VARIANT_COLOR[this.variant]);
    renderer.stroke('rgba(255,255,255,0.08)', 1);

    // 왼쪽 가장자리의 강조 막대
    renderer.beginPath();
    renderer.roundRect(0, 8, 3, this.height - 16, 2);
    renderer.fill(VARIANT_ACCENT[this.variant]);

    // 메시지 텍스트
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

// ── 사용법 ────────────────────────────────────────────────────────────────────
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
> `busy` 플래그는 `next()`를 제어하여 한 번에 하나의 토스트만 실행되도록 합니다. 토스트가 표시되는 동안 `show()`를 호출하면 메시지가 대기열에 추가됩니다 — 현재 토스트와 이전에 대기열에 추가된 모든 토스트가 완료된 후에 나타납니다. 토스트를 세로로 쌓아 병렬로 표시하려면 활성 토스트당 증가하는 `yOffset`을 추적하세요.

---

## 유효성 검사가 있는 폼

`Input`, `Slider`, `Toggle`, `Button`을 유효성 검사가 있는 폼으로 구성합니다. 오류는 빨간색으로 렌더링되는 `Text` 엔티티이며 제출 시 설정됩니다. 사용자가 해당 필드를 편집하는 즉시 오류가 지워집니다.

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

  // ── 사용자 이름 ──────────────────────────────────────────────────────────────
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

  // ── 볼륨 슬라이더 ─────────────────────────────────────────────────────────
  const volumeDisplay = new Text('Volume: 50', { font: '14px Inter', color: '#94a3b8' });
  const volumeSlider = new Slider({ min: 0, max: 100, value: 50, width: 300 });
  const volumeError = new Text('', { font: '13px Inter', color: '#f87171' });

  volumeSlider.on('change', (e: { value: number }) => {
    state.volume = e.value;
    volumeDisplay.setText(`Volume: ${e.value}`);
    volumeError.setText('');
    scene.markDirty();
  });

  // ── 뉴스레터 토글 ─────────────────────────────────────────────────────
  const newsletterToggle = new Toggle({ label: 'Subscribe to release notes' });

  newsletterToggle.on('change', (e: { checked: boolean }) => {
    state.newsletter = e.checked;
  });

  // ── 유효성 검사 ────────────────────────────────────────────────────────────
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

  // ── 제출 버튼 ─────────────────────────────────────────────────────────
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

  // ── 레이아웃 ────────────────────────────────────────────────────────────────
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

// ── 사용법 ────────────────────────────────────────────────────────────────────
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });
buildForm(scene);
scene.start();

window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
});
```

> [!NOTE]
> 오류 `Text` 엔티티는 항상 레이아웃 트리에 있습니다 — 오류가 없을 때는 빈 문자열만 표시합니다. 이렇게 하면 `Stack` 레이아웃이 안정적으로 유지됩니다: 오류가 나타나도 위치가 이동하지 않습니다. 공간을 완전히 숨기려면 오류가 없을 때 `entity.opacity = 0` 및 `entity.height = 0`으로 전환하고, 오류가 설정되면 둘 다 복원하세요.
