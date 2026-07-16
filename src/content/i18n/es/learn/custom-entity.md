---
title: 'Construyendo Entidades Personalizadas'
description: 'Aprende a crear subclases de Entity para construir tus propios componentes de canvas: transformaciones, renderizado, hit-testing, animación, agrupación por lotes y accesibilidad.'
order: 9
---

# Construyendo Entidades Personalizadas

Cada objeto en VectoJS es un `Entity` — un nodo del Virtual Math Tree. Los componentes integrados como `Button` y `Toggle` son solo subclases de Entity que puedes usar tal cual. Esta guía te muestra cómo construir las tuyas.

## Pruébalo en vivo

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">en vivo · @vectojs/core</span></div>
  <iframe src="/sandbox/custom-entity.html" class="sandbox-frame" loading="lazy" title="Custom Entity interactive example" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Tres entidades personalizadas <code>GaugeWidget</code> con rellenos de arco animados. Haz clic en Randomize para ver el sistema de tweens de <code>animate()</code> en acción.</figcaption>
</figure>

## El sistema de coordenadas local

Esto es lo más importante que debes interiorizar antes de escribir tu primer método `render()`:

> **Tu entidad dibuja en `(0, 0)`. El canvas ya está transformado a la posición, escala y rotación de tu entidad antes de que se llame a `render()`.**

El `Scene` aplica las transformaciones en orden **T · S · R** (Trasladar → Escalar → Rotar) a medida que recorre el árbol. Para cuando se invoca tu `render(renderer)`, el origen es la esquina superior izquierda de tu entidad, tu escala está en efecto y tu rotación está aplicada. Nunca necesitas leer `this.x` o `this.y` dentro de `render()`.

<figure>
  <img src="/images/local-coordinate-system.svg" alt="Diagrama que muestra el espacio del mundo a la izquierda con la entidad posicionada en (80, 90), y el espacio local a la derecha donde el origen es (0,0) y dibuja render(), conectados por una flecha etiquetada como el Scene aplica la transformación T·S·R" class="diagram" />
  <figcaption>El Scene traslada el canvas a la posición del mundo de tu entidad antes de llamar a <code>render()</code>. Siempre dibujas en <code>(0, 0)</code>.</figcaption>
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
    // Draw relative to (0, 0) — not (this.x, this.y)
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 12);
    renderer.fill(this.color);
  }
}

const banner = new Banner();
banner.width = 300;
banner.height = 60;
banner.setPosition(80, 120); // controls where it appears on screen
scene.add(banner);
```

## Contrato de implementación mínimo

Se requieren dos métodos:

```typescript
abstract class Entity {
  // Return true if the global pointer coordinates (gx, gy) hit this entity.
  abstract isPointInside(gx: number, gy: number): boolean;

  // Draw the entity. The renderer is already in local space — origin is (0,0).
  abstract render(renderer: IRenderer): void;
}
```

Si tu entidad no tiene área interactiva, devuelve `false` desde `isPointInside`. Para un área de impacto rectangular, convierte el punto del mundo con `worldToLocal()` para que la rotación anidada y la escala no uniforme se manejen con exactitud:

```typescript
isPointInside(gx: number, gy: number): boolean {
  const local = this.worldToLocal(gx, gy);
  return !!local && local.x >= 0 && local.x <= this.width
      && local.y >= 0 && local.y <= this.height;
}
```

> [!NOTE] > `UIComponent` ya implementa esta prueba AABB por ti. Extiende `UIComponent` de `@vectojs/ui` en lugar de `Entity` directamente cuando tu componente tenga una caja de impacto rectangular — obtienes `isPointInside`, `getBounds` y `padding` gratis.

## La API IRenderer

El objeto renderer pasado a `render()` proporciona una superficie de dibujo tipo Canvas2D (pero agnóstica del backend — podría ser Canvas2D, WebGL o SVG).

```typescript
// Paths
renderer.beginPath()
renderer.moveTo(x, y)
renderer.lineTo(x, y)
renderer.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y)
renderer.arc(cx, cy, radius, startAngle, endAngle, counterclockwise?)
renderer.roundRect(x, y, w, h, radii)
renderer.closePath()

// Fills and strokes
renderer.fill(colorOrGradient)       // e.g. '#ff0' or a gradient descriptor
renderer.stroke(colorOrGradient, lineWidth?)

// Text (native browser canvas text — no LayoutEngine)
renderer.fillText(text, x, y, font, color)  // font = CSS shorthand

// Images
renderer.drawImage(source, dx, dy, dw, dh)

// Fast circle batch (coalesces same-color runs)
renderer.fillCircle(cx, cy, radius, color, alpha?)

// State
renderer.save()
renderer.restore()
renderer.translate(x, y)
renderer.scale(x, y)
renderer.rotate(angle)        // radians
renderer.setGlobalAlpha(a)
renderer.clip(x, y, w, h)    // inside save/restore

// Gradients
renderer.createLinearGradient(x0, y0, x1, y1, colorStops)
```

**Ejemplo — tarjeta con gradiente:**

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

## Descarte por viewport con `getBounds()`

Por defecto, las entidades nunca se descartan. Sobrescribe `getBounds()` para devolver una caja delimitadora en el espacio local y el Scene se saltará `render()` cuando la caja transformada esté fuera del viewport. `update()` sigue ejecutándose para que el estado y las animaciones permanezcan al día cuando la entidad vuelva a estar en pantalla:

```typescript
getBounds() {
  return { x: 0, y: 0, width: this.width, height: this.height };
}
```

`UIComponent` ya hace esto. Las subclases crudas de `Entity` deberían implementarlo para escenas grandes.

## Lógica por frame con `update(dt, time)`

Sobrescribe `update()` para ejecutar código en cada frame. Llama a `super.update(dt, time)` primero para avanzar los tweens de `animate()` encolados.

> [!CAUTION] > `dt` está en **milisegundos**, no en segundos. A 60 fps, `dt ≈ 16.7`. Divide entre 1000 para obtener segundos.

```typescript
class Spinner extends Entity {
  speed = 1.5; // rad/s

  update(dt: number, time: number) {
    super.update(dt, time);
    this.rotation += this.speed * (dt / 1000); // dt/1000 → seconds
  }

  // Motion driven from update() is invisible to the Scene's idle checks unless
  // you report it. This keeps the idle throttle from dropping the spinner to
  // 2 fps and states the animation intent more clearly than a per-frame dirty flag.
  hasPendingAnimations() {
    return true; // a spinner is always animating
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

`time` es `performance.now()` y es útil para oscilaciones que no deben derivar:

```typescript
this.y = Math.sin(time * 0.002) * 20; // stable float, not accumulated error
```

## Animación suave con `animate()`

Para transiciones de un solo disparo, `animate()` suele ser mejor que un `update()` personalizado:

```typescript
entity
  .animate({ x: 300, opacity: 0 }, 400) // ease-out, 400 ms
  .animate({ opacity: 1 }, 200); // chained: starts when the first finishes
```

Solo las **propiedades numéricas** interpolan. El easing es ease-out cuadrático (`t * (2 - t)`). Un tween en ejecución mantiene la escena no estática y llama a `markDirty()` automáticamente.

## Hacer una entidad interactiva

Establece `interactive = true` e implementa `isPointInside`. Luego adjunta listeners con `on()`:

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

## Proyección de a11y con `getA11yAttributes()`

Cuando tu entidad es `interactive`, VectoJS proyecta un nodo DOM real transparente sobre ella. Por defecto esto es un simple `<div>` — no muy útil para la tecnología de asistencia. Sobrescribe `getA11yAttributes()` para decirle al framework qué nodo proyectar:

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

Ahora `page.getByRole('button', { name: 'OK' })` de Playwright encuentra tu chip, los lectores de pantalla lo anuncian y los usuarios de teclado pueden tabular hasta él y pulsar Enter. El conjunto completo de campos:

```typescript
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // default 'div'
  role?: string;
  label?: string; // aria-label
  href?: string; // for tag='a'
  src?: string;
  alt?: string; // for tag='img'
  inputType?: string; // 'text', 'checkbox', etc.
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

## Agrupación por lotes con WebGL usando `getBatchCircle()` y `getBatchRect()`

Para entidades de tipo partícula (puntos, dots) que se ejecutan por miles, la ruta por entidad `save/translate/render/restore` es demasiado lenta. Usa la ruta rápida por lotes en su lugar:

```typescript
class Particle extends Entity {
  radius = 4;
  color = '#00f0ff';

  // Feed the WebGL batch when the accumulated transform is representable.
  getBatchCircle() {
    return { radius: this.radius, color: this.color };
  }

  isPointInside() {
    return false;
  }
  // Required fallback for Canvas mode or non-uniform/sheared ancestors.
  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.arc(0, 0, this.radius, 0, Math.PI * 2);
    renderer.fill(this.color);
  }
}
```

Restricciones:

- La entidad debe ser una **hoja** (sin hijos).
- La propia escala de la entidad debe ser **uniforme** (`scaleX === scaleY`) para la ruta rápida.
- Requiere `pointBackend: 'webgl'` en el `Scene`.
- Si la transformación acumulada del ancestro es no uniforme, inclinada, o no puede representarse por un radio/rotación, el Scene llama a la alternativa normal `render()`.

El Scene lee `getBatchCircle()` en cada frame, por lo que el `radius`/`color` animado se respeta. La capa de puntos sube muchos círculos en una secuencia de búfer/dibujo. Para rectángulos, usa `getBatchRect()` en su lugar:

```typescript
getBatchRect() {
  return { width: this.width, height: this.height, color: this.color };
}
```

## Ejemplo completo: widget de medidor animado

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';
import type { A11yAttributes } from '@vectojs/core';

class GaugeWidget extends Entity {
  private _value = 0;
  private _displayValue = 0; // interpolated

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
    // Smooth visual transition
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

    // Track
    renderer.beginPath();
    renderer.arc(cx, cy, r, startAngle, endAngle);
    renderer.stroke('rgba(255,255,255,0.12)', 10);

    // Progress arc
    if (progress > 0) {
      renderer.beginPath();
      renderer.arc(cx, cy, r, startAngle, sweepAngle);
      renderer.stroke(this.accentColor, 10);
    }

    // Value label
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

// Usage:
const gauge = new GaugeWidget('CPU', { accent: '#6366f1' });
gauge.setPosition(60, 60);
scene.add(gauge);
gauge.setValue(72);
```

## Resumen

| Método                              | Cuándo sobrescribir                                                                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `render(renderer)`                  | Siempre — dibuja la entidad en el espacio local en (0,0)                                                                                                         |
| `isPointInside(gx, gy)`             | Siempre — devuelve false para entidades decorativas                                                                                                              |
| `update(dt, time)`                  | Lógica por frame; llama a `super.update` primero; `dt` en ms                                                                                                     |
| `hasPendingAnimations()`            | Siempre que `update()` impulse su propio movimiento — reporta "aún en movimiento" para que la limitación por inactividad / omisión de onDemand siga renderizando |
| `getBounds()`                       | Para el descarte por viewport (recomendación fuerte)                                                                                                             |
| `getA11yAttributes()`               | Cuando es interactiva — controla el nodo del shadow DOM                                                                                                          |
| `getBatchCircle() / getBatchRect()` | Entidades hoja de tipo partícula por miles                                                                                                                       |

## Resolución de problemas

### La entidad se añade pero no aparece nada en pantalla

Comprueba en orden:

1. **No se llamó a `scene.start()`** — el bucle de renderizado nunca se dispara sin ello.
2. **`render()` no llama a ningún método de dibujo** — un `render()` vacío es silencioso. Verifica que se alcanza `renderer.fill()` o `renderer.stroke()`.
3. **`width` o `height` es `0`** — la entidad puede estar fuera de pantalla o descartada. Establece `entity.width = 200; entity.height = 80` y comprueba si aparece.
4. **`opacity` es `0`** — comprueba `entity.opacity`.
5. **La entidad no se añadió a la escena** — `new MyEntity()` la construye pero no la añade. Llama a `scene.add(entity)`.

### `isPointInside` nunca devuelve `true` / los eventos de clic no se disparan

`isPointInside` recibe coordenadas **globales (del espacio del mundo)**. Probarlas contra `this.x` / `this.y` falla para las transformaciones anidadas, mientras que restar `getGlobalPosition()` aún falla para la rotación y la escala no uniforme. Invierte la transformación completa con `worldToLocal()`:

```typescript
// Wrong — only works when entity is at scene root with no parent transforms
isPointInside(gx, gy) {
  return gx >= this.x && gx <= this.x + this.width; // ← breaks in a nested tree
}

// Correct — handles nested translation, rotation, and non-uniform scale
isPointInside(gx, gy) {
  const p = this.worldToLocal(gx, gy);
  return !!p && p.x >= 0 && p.x <= this.width
      && p.y >= 0 && p.y <= this.height;
}
```

Asegúrate también de que `entity.interactive = true` está establecido — sin ello, no se despachan eventos de puntero a la entidad.

### `getBatchCircle()` / `getBatchRect()` no se está usando

Dos requisitos que es fácil pasar por alto:

- El Scene debe tener `pointBackend: 'webgl'` establecido en sus opciones de constructor.
- La entidad debe ser una **hoja** (sin `children`). Si haces `add()` de un hijo a una entidad por lotes, silenciosamente recurre a la ruta normal `render()`.

Comprueba `console.log(scene.getRenderer())` — si el renderer es `CanvasRenderer` y no hay capa WebGL, `pointBackend: 'webgl'` no se estableció o WebGL2 no está disponible.

### Falta el nodo del shadow DOM en las DevTools

El nodo shadow de a11y solo se crea cuando **ambas** condiciones son verdaderas:

1. `entity.interactive === true`
2. `entity.width > 0` (o `entity.a11yFullViewport === true`)

Una entidad con `interactive = true` pero `width = 0` no obtiene ningún nodo shadow. Establece `entity.width` y `entity.height` para que coincidan con el tamaño visual.

## Desafíos

### Entidad de barra de progreso

Construye una entidad `ProgressBar` que muestre una barra de relleno animada y que los lectores de pantalla anuncien correctamente como un indicador de progreso.

- Propiedades: `min: number`, `max: number`, `value: number`, `barColor: string`, `trackColor: string` y `width`/`height`.
- Implementa `setValue(n: number)` que acote `n` a `[min, max]` y llame a `this.animate({ displayValue: n }, 400)` donde `displayValue` impulsa el ancho del relleno renderizado.
- Sobrescribe `getA11yAttributes()` para devolver `{ role: 'progressbar', valuemin, valuemax, value }` como cadenas para que la tecnología de asistencia anuncie el porcentaje actual.

### Gráfico de dona

Extiende `GaugeWidget` (el ejemplo completo al final de esta página) para renderizar una forma de dona con un hueco visible entre el arco de la pista y el arco de progreso, y añade una etiqueta de leyenda de categoría debajo del valor.

- Reduce el radio del arco de la pista en 6 px y aumenta el radio del arco de progreso en 6 px (o viceversa) para crear un hueco visible entre los dos anillos concéntricos.
- Añade una propiedad `legendLabel: string` y renderízala debajo del valor numérico en un color más pequeño y apagado usando `renderer.fillText`.
- Actualiza `getA11yAttributes()` para añadir `legendLabel` al campo `label` devuelto de modo que la descripción completa sea anunciada por los lectores de pantalla.

### Chip contador de clics

Extiende la entidad `Chip` de la sección interactiva de esta página para que cada clic incremente un contador y muestre una pequeña insignia circular en la esquina superior derecha que muestre el conteo.

- Añade una propiedad `clickCount = 0` e increméntala dentro del manejador `'click'` junto con la alternancia y la animación de escala existentes.
- En `render()`, dibuja la insignia (un pequeño círculo relleno con el conteo como texto dentro) solo cuando `clickCount > 0`; posiciónala en `(this.width - 10, -6)` en el espacio de coordenadas local del chip.
- Sobrescribe `getA11yAttributes()` para incluir el conteo actual en el campo `label`, p. ej. `'OK — 3 clicks'`, de modo que el nombre accesible se mantenga al día a medida que cambia el conteo.

> **Siguiente:** [Eventos y Hit-Testing](/learn/events/) — cómo se propagan los eventos de puntero a través del árbol de entidades con captura y propagación.
