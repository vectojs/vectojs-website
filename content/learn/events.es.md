+++
title = "Eventos y Hit-Testing"
description = "Cómo fluyen los eventos de puntero y teclado a través del árbol de entidades de VectoJS: captura, propagación, VectoJSEvent, payloads de cambio de formularios y findEntityAt."
weight = 10
+++

# Eventos y Hit-Testing

VectoJS usa un modelo de eventos de **captura + propagación (burbujeo)** tipo DOM. Si has usado `addEventListener` del navegador, la mecánica es idéntica — pero el recorrido del árbol se ejecuta sobre el Virtual Math Tree en lugar del DOM.

## Pruébalo en vivo

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">en vivo · @vectojs/core</span></div>
  <iframe src="/sandbox/events.html" class="sandbox-frame" loading="lazy" title="Events & Hit-Testing interactive example" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Tres subclases personalizadas de Entity — pasa el cursor para escalar, haz clic para contar. Cada una conecta <code>on('hover')</code>, <code>on('pointerleave')</code> y <code>on('click')</code>.</figcaption>
</figure>

## El ciclo de vida del evento

Cuando el usuario hace clic (o toca, o pasa el cursor) sobre el canvas, el Scene:

1. Llama a `findEntityAt(x, y)` para encontrar el **objetivo** — la entidad más superior cuyo `isPointInside()` devuelve `true`.
2. Construye la **ruta del evento**: `[target, parent, grandparent, …, root]`.
3. Ejecuta la **fase de captura**: dispara los listeners registrados con `{ capture: true }` empezando desde la raíz hacia abajo hasta el objetivo.
4. Ejecuta la **fase de propagación (burbujeo)**: dispara los listeners (fase por defecto) desde el objetivo de vuelta hacia arriba hasta la raíz.

<figure>
  <iframe src="/sandbox/diagram-events.html" class="diagram-frame" loading="lazy" title="Event capture and bubble phases, rendered live by VectoJS" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>La captura dispara de raíz → objetivo; la propagación dispara de objetivo → raíz. El objetivo recibe ambas. <em>(Renderizado en vivo por VectoJS.)</em></figcaption>
</figure>

## Escuchar eventos

```typescript
entity.on(event, callback, options?)
entity.off(event, callback, options?)
```

La fase por defecto es **propagación (burbujeo)**. Pasa `{ capture: true }` para interceptar durante la fase de captura:

```typescript
// Bubble phase (default) — fires after children
btn.on('click', (e) => console.log('button clicked'));

// Capture phase — fires before children (interceptor pattern)
card.on(
  'click',
  (e) => {
    console.log('card sees click first');
    e.stopPropagation(); // prevents bubble reaching card again
  },
  { capture: true },
);
```

Tipos de eventos disponibles:

| Evento            | Disparador                                              |
| ----------------- | ------------------------------------------------------- |
| `'click'`         | Presión + liberación del puntero sobre la misma entidad |
| `'hover'`         | El puntero entra en la entidad                          |
| `'pointerdown'`   | Puntero presionado                                      |
| `'pointerup'`     | Puntero liberado                                        |
| `'pointercancel'` | Flujo de puntero activo cancelado por el navegador      |
| `'pointermove'`   | El puntero se movió (mientras está sobre la entidad)    |
| `'pointerleave'`  | El puntero salió de la entidad                          |
| `'wheel'`         | Rueda del ratón / scroll del trackpad                   |
| `'keydown'`       | Tecla presionada (mientras la entidad tiene el foco)    |
| `'keyup'`         | Tecla liberada                                          |
| `'change'`        | Cambió el valor del control de formulario               |
| `'focus'`         | El nodo del shadow DOM ganó el foco                     |
| `'blur'`          | El nodo del shadow DOM perdió el foco                   |

## VectoJSEvent

El callback recibe un `VectoJSEvent` con estos miembros:

```typescript
interface VectoJSEvent {
  type: string; // event name
  target: Entity; // entity where the event originated
  currentTarget: Entity; // entity whose listener is currently running

  bubbles: boolean;

  // Propagation control
  stopPropagation(): void; // stop after current node
  stopImmediatePropagation(): void; // also skip remaining listeners on this node
  preventDefault(): void;

  defaultPrevented: boolean;

  // Browser viewport coordinates from the native event
  clientX?: number;
  clientY?: number;

  // Scene logical coordinates, then coordinates local to currentTarget
  sceneX?: number;
  sceneY?: number;
  localX?: number;
  localY?: number;

  // Wheel events
  deltaX?: number;
  deltaY?: number;

  // Keyboard events
  key?: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;

  // The original native DOM event
  nativeEvent?: Event;
}
```

`localX`/`localY` se recalculan para el `currentTarget` de cada listener, incluyendo la rotación anidada y la escala no uniforme. Úsalos dentro de los controles. Usa `sceneX`/`sceneY` cuando compares contra otra entidad o almacenes un puntero en el espacio de la escena. `clientX`/`clientY` permanecen como valores crudos del viewport del navegador.

## `emit()` vs `dispatchEvent()`

VectoJS tiene dos rutas de despacho:

| Método                               | Qué hace                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `entity.emit(event, payload)`        | Dispara **únicamente los listeners de fase de propagación de esta propia entidad**. Sin recorrido del árbol. |
| `entity.dispatchEvent(vectoJSEvent)` | Recorrido completo tipo DOM de **captura + propagación** a través del árbol.                                 |

`emit()` es como los componentes integrados señalan sus propios cambios de estado internamente (p. ej., un `Toggle` que emite su propio `'change'`). Casi nunca llamas a `dispatchEvent()` directamente — el `Scene` lo llama para los eventos de puntero y teclado que provienen del navegador.

```typescript
// Correct: listen to a button's click in bubble phase
btn.on('click', (e) => {
  /* ... */
});

// Correct: intercept a subtree's clicks before children handle them
container.on(
  'click',
  (e) => {
    if (isLocked) e.stopPropagation();
  },
  { capture: true },
);

// Correct: a component emitting its own state change (internal use)
this.emit('change', { value: this._value });
```

## Payloads del evento de cambio de formularios

Los controles de formulario (`Input`, `TextArea`, `Checkbox`, `Toggle`, `Slider`, `Dropdown`) emiten un evento `'change'` con payloads tipados:

**`Input` y `TextArea`:**

```typescript
{
  value: string;
  selectionStart?: number;   // caret / selection start offset
  selectionEnd?: number;     // caret / selection end offset
  composition?: {
    start: number;
    length: number;
  } | null;                  // active IME pre-edit range, or null
}
```

**`Checkbox` y `Toggle`:**

```typescript
{
  checked: boolean;
}
```

**`Slider`:**

```typescript
{
  value: number;
}
```

**`Dropdown`:**

```typescript
{
  value: string;
}
```

Ejemplo — leer el valor de una entrada de texto:

```typescript
const input = new Input({ width: 300, placeholder: 'Search…' });
input.on('change', (e) => {
  const { value, selectionStart } = e;
  console.log(`"${value}" — caret at ${selectionStart}`);
});
```

## Hit-testing: cómo el Scene encuentra el objetivo

`scene.findEntityAt(x, y)` recorre el árbol **en profundidad en orden inverso de hijos** (los hijos dibujados más arriba se prueban primero):

1. La raíz del overlay se comprueba antes que la raíz principal, por lo que los overlays (dropdowns, modales) siempre ganan.
2. Los hijos se recorren en orden **inverso** — el último hijo añadido (renderizado encima) se somete a hit-test primero.
3. **No hay filtro de interactividad**: una entidad no interactiva aún puede devolverse si `isPointInside()` devuelve `true`. El filtrado por interactividad solo afecta a la proyección del shadow DOM, no al hit-testing.
4. El recorrido devuelve la primera entidad cuyo `isPointInside()` devuelve `true`, independientemente de si tiene listeners.

```typescript
// This works — returns the entity under the cursor
const hit = scene.findEntityAt(pointerX, pointerY);
if (hit) console.log('hit', hit.id);
```

## Detener la propagación

```typescript
child.on('click', (e) => {
  e.stopPropagation(); // parent won't see this click in bubble phase
});

// stopImmediatePropagation also stops other listeners on the same node
child.on('click', (e) => {
  e.stopImmediatePropagation();
});
child.on('click', () => {
  // This second listener on 'child' is NOT called if the first stops immediate propagation
});
```

## Eventos de rueda y `preventDefault()`

El `Scene` reenvía los eventos `wheel` del canvas. Llama a `e.preventDefault()` para impedir que la página se desplace:

```typescript
myScroller.on('wheel', (e) => {
  this.scrollY += e.deltaY;
  e.preventDefault(); // stops the browser scroll
  this.scene?.markDirty();
});
```

> [!NOTE] > `ScrollView` llama a `e.preventDefault()` automáticamente en los eventos de rueda, excepto cuando se mantiene `Ctrl` presionado (permitiendo el zoom del navegador). Si construyes un contenedor de scroll personalizado, sigue el mismo patrón.

## Eventos de teclado

Los eventos de teclado se entregan a la entidad que tiene el foco (a través de su nodo del shadow DOM). Se propagan hacia arriba del árbol con captura/propagación normales:

```typescript
inputEntity.on('keydown', (e) => {
  if (e.key === 'Enter') submitForm();
  if (e.key === 'Escape') cancelForm();
});
```

Para atajos globales (no ligados a un elemento enfocado), escucha en la raíz del `Scene` o usa un `document.addEventListener` nativo:

```typescript
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});
```

## Patrones de la fase de captura

### Clic fuera para cerrar

```typescript
scene.add(overlay); // a dropdown, modal backdrop, etc.

// Root capture: fires before any entity handles the click
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

### Bloquear un subárbol

```typescript
panel.on(
  'click',
  (e) => {
    if (disabled) e.stopPropagation(); // all children are blocked
  },
  { capture: true },
);
```

## Ejemplo completo: tarjeta con hover

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
      console.log(`${this.label} clicked`);
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

## Resolución de problemas

### Un clic se dispara pero el objetivo es la entidad equivocada

`findEntityAt` recorre los hijos en orden **inverso** (último añadido = probado primero). Si dos entidades se solapan, la añadida más tarde gana. Para hacer que una entidad siempre gane, hazle `add()` después de las demás. Para que siempre pierda, hazle `add()` antes.

Si la entidad equivocada intercepta durante la **fase de captura**, comprueba si hay llamadas a `stopPropagation()` en los ancestros — un listener de captura que detiene la propagación impedirá que el evento llegue alguna vez al objetivo previsto.

### Los listeners de eventos se disparan una vez pero luego dejan de funcionar

Los listeners de eventos añadidos con `on()` son permanentes hasta que se llama a `off()`. Si los listeners parecen detenerse, comprueba:

1. La entidad fue eliminada de la escena. `scene.remove(entity)` la desvincula pero no borra sus listeners, por lo que puede volver a añadirse más tarde.
2. Un listener del padre llama a `e.stopPropagation()` antes de que el evento llegue a tu entidad.
3. Llamaste accidentalmente a `off()` — a veces mediante una función de limpieza que se ejecuta antes de lo esperado.

### Los eventos de rueda se disparan pero la página sigue desplazándose

Los eventos `wheel` del canvas se propagan al navegador aunque los escuches en una entidad. Debes llamar explícitamente a `e.preventDefault()` para detener el scroll de la página:

```typescript
myEntity.on('wheel', (e) => {
  // ... handle scroll ...
  e.preventDefault(); // ← required to stop the browser scroll
});
```

Nota: `ScrollView` hace esto automáticamente para sus propios eventos de rueda (excepto con `Ctrl` presionado).

### `e.clientX` / `e.clientY` faltan en los eventos de teclado

`clientX`/`clientY` son campos de eventos de puntero y son `undefined` cuando el evento nativo no los proporciona. Para los eventos de teclado, usa `e.key`, `e.shiftKey`, `e.ctrlKey`, `e.altKey` y `e.metaKey`.

> **Siguiente:** [Física y Animación](/learn/physics-engine/) — resortes, hashing espacial y el bucle `update()`.
