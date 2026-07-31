---
title: 'Recetario'
description: 'Patrones y recetas comunes para VectoJS: modales, tooltips, listas virtualizadas, drag-and-drop, gráficos animados y más.'
order: 17
---

# Recetario

Patrones autocontenidos para los problemas más comunes de VectoJS. Cada receta es completa y se puede copiar y pegar.

---

## Diálogo Modal

Renderiza un overlay bloqueante por encima de todo el contenido de la escena. Se cierra al hacer clic en el fondo o con la tecla Escape, y proyecta un landmark `role="dialog"` para los lectores de pantalla.

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

  const modal = new Card({
    width: MW,
    height: MH,
    radius: 16,
    label: opts.title,
  });
  modal.setPosition((VW - MW) / 2, (VH - MH) / 2 + 32);
  modal.opacity = 0;

  const titleText = new Text(opts.title, {
    font: '700 20px Inter',
    color: '#f8fafc',
  });
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

  // Animate in: fade backdrop, slide+fade modal up from slightly below center
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

  // Returns an imperative close handle for programmatic dismissal
  return close;
}

// ── Usage ────────────────────────────────────────────────────────────────────
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
> El modal comienza en `y + 32` y se anima hasta el centro vertical, dando una sutil entrada de deslizamiento hacia arriba sin un salto de disposición. La entidad del fondo usa `isPointInside(): true` para que cualquier clic en el velo (no en la tarjeta del modal encima de él) vaya a `close()`. El listener de keydown del `document` se elimina inmediatamente en `close()` para prevenir manejadores duplicados si `openModal` se llama rápidamente.

---

## Tooltip al pasar el cursor

Adjunta un popup de tooltip con retardo de 400 ms a cualquier entidad. El tooltip rastrea la posición del puntero reportada por el evento `hover` y aparece/desaparece con fundido en la capa de overlay.

```typescript
import { Scene, Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class TooltipPopup extends Entity {
  constructor(private readonly text: string) {
    super();
    // Rough width estimate — replace with measured text width if your font metrics are available.
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
    if (timer !== null) return; // already scheduled
    timer = setTimeout(() => {
      if (!visible) {
        overlay.add(tooltip);
        visible = true;
      }
      // Position above and to the right of the cursor
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

// ── Usage ────────────────────────────────────────────────────────────────────
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
> El retardo de 400 ms evita que los tooltips parpadeen cuando el puntero pasa rápidamente sobre una entidad. Volver a entrar en la misma entidad antes de que se dispare el temporizador es una operación nula porque el retorno anticipado en `timer !== null` previene la doble programación. Reinicia `timer` a `null` dentro de `setTimeout` si quieres permitir volver a disparar mientras el tooltip ya está visible.

---

## Drag and Drop

Una entidad `DraggableCard` captura los eventos de puntero directamente en el canvas (ya que `pointermove` debe dispararse incluso cuando el puntero sale de los límites de la entidad). Las zonas de destino se resaltan mientras el arrastrable pasa sobre ellas y lo ajustan al centro al soltarlo.

```typescript
import { Scene, Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

// ── Drop zone ────────────────────────────────────────────────────────────────
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

// ── Draggable card ───────────────────────────────────────────────────────────
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
          {
            x: hp.x + (hit.width - this.width) / 2,
            y: hp.y + (hit.height - this.height) / 2,
          },
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

// ── Usage ────────────────────────────────────────────────────────────────────
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

const zoneA = new DropZone('Zone A');
zoneA.setPosition(60, 180);
scene.add(zoneA);

const zoneB = new DropZone('Zone B');
zoneB.setPosition(260, 180);
scene.add(zoneB);

// Add draggable last so it renders above the zones
const card = new DraggableCard('Drag me', canvas, [zoneA, zoneB], scene);
card.setPosition(150, 60);
scene.add(card);

scene.start();
```

> [!NOTE] > `canvas.setPointerCapture(e.pointerId)` mantiene el enrutamiento de `pointermove`, `pointerup` y `pointercancel` hacia el canvas incluso cuando el puntero sale de su límite a mitad del arrastre. Trata `pointercancel` como una reversión en lugar de una confirmación, para que la interrupción del navegador no pueda dejar la tarjeta atascada en el estado de arrastre.

---

## Clic fuera para cerrar

Intercepta cada clic en la fase de captura en la raíz de la escena antes de que llegue a los hijos. Se usa para cerrar menús, dropdowns y popups cuando el usuario hace clic en cualquier lugar fuera de ellos.

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
  // Close any previously open menu before opening a new one
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

  // Capture phase: fires before any entity receives the event.
  // Use findEntityAt to decide if the click landed inside the menu tree.
  scene.getRoot().on(
    'click',
    (e: { x: number; y: number }) => {
      if (menuDismissed) return;
      const hit = scene.findEntityAt(e.x, e.y);
      // Allow clicks on the menu card itself and its children (row items)
      const inMenu = hit === menu || (hit !== null && hit.parent === menu);
      if (!inMenu) close();
    },
    { capture: true },
  );
}

// ── Usage ────────────────────────────────────────────────────────────────────
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
> La opción `{ capture: true }` en `scene.getRoot().on()` es crítica — sin ella, el evento de clic se despacha en la fase de propagación después de que ya ha sido consumido por los hijos. En la fase de captura se dispara primero, por lo que puedes descartar el popup antes de que el clic llegue a cualquier entidad debajo de él.

---

## Gráfico de barras animado

Cada barra es una entidad independiente con una propiedad `displayHeight` que `animate()` impulsa de 0 a la altura objetivo de la barra. Las barras se escalonan con `setTimeout` para aparecer en cascada de izquierda a derecha.

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

    // Bar fill (grows upward from baseline)
    if (this.displayHeight > 1) {
      renderer.beginPath();
      renderer.roundRect(0, barTop, this.width, this.displayHeight, 4);
      renderer.fill(this.datum.color);
    }

    // Value label above the bar (only once bar has grown enough to not overlap)
    if (this.displayHeight > 22) {
      renderer.fillText(
        String(this.datum.value),
        Math.floor(this.width / 2) - 8,
        barTop - 18,
        '600 12px Inter',
        '#f8fafc',
      );
    }

    // X-axis label
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

  // Cascade bars in with a 100 ms stagger
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    setTimeout(() => {
      bar.animate({ displayHeight: bar.targetHeight }, 700);
    }, i * 100);
  }
}

// ── Usage ────────────────────────────────────────────────────────────────────
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

> [!NOTE] > `displayHeight` debe ser una propiedad numérica directa de la entidad — no anidada dentro de un array u objeto — para que `animate()` la interpole. El easing es ease-out cuadrático, que da una desaceleración natural que funciona bien para barras que crecen.

---

## Cola de notificaciones Toast

`ToastManager` mantiene una cola FIFO. Mostrar un toast mientras otro está visible lo pone en cola. Cada toast aparece con fundido, permanece durante 3 segundos, luego se desvanece antes de que se muestre el siguiente.

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
    // Background
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 10);
    renderer.fill(VARIANT_COLOR[this.variant]);
    renderer.stroke('rgba(255,255,255,0.08)', 1);

    // Accent bar on left edge
    renderer.beginPath();
    renderer.roundRect(0, 8, 3, this.height - 16, 2);
    renderer.fill(VARIANT_ACCENT[this.variant]);

    // Message text
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

// ── Usage ────────────────────────────────────────────────────────────────────
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
> La bandera `busy` controla `next()` para que solo se ejecute un toast a la vez. Llamar a `show()` mientras un toast se muestra pone el mensaje en cola — aparecerá después de que el toast actual y todos los toasts previamente en cola terminen. Si quieres toasts paralelos apilados verticalmente, rastrea un `yOffset` que se incremente por cada toast activo.

---

## Formulario con validación

Compone `Input`, `Slider`, `Toggle` y `Button` en un formulario validado. Los errores son entidades `Text` renderizadas en rojo y establecidas al enviar; se limpian tan pronto como el usuario edita el campo correspondiente.

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

  // ── Username ──────────────────────────────────────────────────────────────
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

  // ── Volume slider ─────────────────────────────────────────────────────────
  const volumeDisplay = new Text('Volume: 50', {
    font: '14px Inter',
    color: '#94a3b8',
  });
  const volumeSlider = new Slider({ min: 0, max: 100, value: 50, width: 300 });
  const volumeError = new Text('', { font: '13px Inter', color: '#f87171' });

  volumeSlider.on('change', (e: { value: number }) => {
    state.volume = e.value;
    volumeDisplay.setText(`Volume: ${e.value}`);
    volumeError.setText('');
    scene.markDirty();
  });

  // ── Newsletter toggle ─────────────────────────────────────────────────────
  const newsletterToggle = new Toggle({ label: 'Subscribe to release notes' });

  newsletterToggle.on('change', (e: { checked: boolean }) => {
    state.newsletter = e.checked;
  });

  // ── Validation ────────────────────────────────────────────────────────────
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

  // ── Submit button ─────────────────────────────────────────────────────────
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

  // ── Layout ────────────────────────────────────────────────────────────────
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
  const card = new Card({
    width: CARD_W,
    height: CARD_H,
    radius: 16,
    label: 'Account settings',
  });
  stack.setPosition(28, 28);
  card.add(stack);
  card.setPosition((window.innerWidth - CARD_W) / 2, (window.innerHeight - CARD_H) / 2);
  scene.add(card);
}

// ── Usage ────────────────────────────────────────────────────────────────────
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });
buildForm(scene);
scene.start();

window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
});
```

> [!NOTE]
> Las entidades `Text` de error siempre están en el árbol de disposición — simplemente muestran una cadena vacía cuando no hay error. Esto mantiene estable la disposición del `Stack`: sin desplazamientos cuando aparecen los errores. Si prefieres ocultar el espacio por completo, cambia a `entity.opacity = 0` y `entity.height = 0` cuando no haya error, luego restaura ambos cuando se establezca un error.

---

## Impresión nítida mediante exportación SVG

Imprimir un `<canvas>` directamente lo rasteriza: el navegador escala el mapa de bits a la resolución de la impresora, por lo que el texto y las formas vectoriales salen borrosos. `scene.toSVG()` captura el estado actual de la escena a través del `SVGRenderer` en un documento `<svg>` independiente de la resolución — el motor de impresión lo renderiza entonces como vectores reales, nítidos en cualquier DPI. Sin dependencia adicional; el exportador SVG ya está incluido en `@vectojs/core`.

```typescript
import { Scene } from '@vectojs/core';

/**
 * Imprime la escena actual como SVG vectorial (nítido en cualquier DPI) en
 * lugar de un mapa de bits rasterizado del canvas. Abre el diálogo de
 * impresión y limpia después.
 */
function printScene(scene: Scene): void {
  // toSVG() devuelve una cadena completa y autocontenida <svg> con un viewBox
  // que coincide con el ancho/alto de la escena — una instantánea de solo lectura del estado actual.
  const svg = scene.toSVG();

  // Aísla el trabajo de impresión en un iframe oculto de origen compartido para que no
  // interfiera con el canvas activo ni herede la hoja de estilos de pantalla de la página.
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);

  const doc = frame.contentDocument!;
  doc.open();
  // @page elimina los márgenes predeterminados del navegador; width:100% permite que el
  // vector se escale a la hoja. El SVG lleva su propio viewBox, por lo que se
  // conserva la relación de aspecto.
  doc.write(
    `<!doctype html><html><head><style>` +
      `@page { margin: 0; } ` +
      `html, body { margin: 0; } ` +
      `svg { width: 100%; height: auto; display: block; }` +
      `</style></head><body>${svg}</body></html>`,
  );
  doc.close();

  const win = frame.contentWindow!;
  // Imprime una vez que el documento del iframe se ha estabilizado, luego elimina
  // el iframe ya sea que el usuario imprima o cancele (afterprint se dispara en ambos casos).
  win.addEventListener('afterprint', () => frame.remove(), { once: true });
  win.focus();
  win.print();
}

// ── Uso ──────────────────────────────────────────────────────────────────────
// const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
// const scene = new Scene(canvas, { maxFPS: 60 });
// buildYourScene(scene);
// scene.start();
//
// printButton.addEventListener('click', () => printScene(scene));
```

> [!NOTE]
> `toSVG()` es una instantánea del estado _actual_ de la escena, por lo que debes llamarla en el momento en que deseas imprimir (por ejemplo, dentro del manejador del clic), no una vez al inicio. Cubre geometría vectorial, texto e imágenes dibujadas a través de la ruta del renderizador estándar; las capas solo de GPU (`WebGLPointRenderer` partículas, `WebGPUParticleSystemManager`) no forman parte de la serialización SVG — para ellas, compón un respaldo rasterizado. Dado que la salida es XML SVG plano, la misma cadena también funciona para guardar en un archivo `.svg` (`new Blob([svg], { type: 'image/svg+xml' })`) o renderizado del lado del servidor.
