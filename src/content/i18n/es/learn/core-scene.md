---
title: 'Arquitectura del Core Scene'
description: 'Análisis profundo del Virtual Math Tree, el ciclo de vida del Scene, el sistema de Entity, el hit-testing y el pipeline de renderizado.'
order: 8
---

# Arquitectura del Core Scene

VectoJS descarta el DOM tradicional del navegador. En su lugar, implementa un **Virtual Math Tree (VMT)** dentro de `@vectojs/core`.

<figure>
  <img src="/images/vmt-architecture.svg" alt="Diagrama de la arquitectura VMT que muestra el árbol de entidades, el renderizado en canvas y la capa shadow de A11y" class="diagram" />
  <figcaption>El árbol de entidades del VMT impulsa tanto el renderizado en canvas como un shadow DOM de A11y invisible por encima del canvas.</figcaption>
</figure>

## El Scene

La clase `Scene` es el orquestador raíz. Gestiona tres pipelines críticos:

1. **El Bucle de Renderizado** — Un bucle de `requestAnimationFrame` que ejecuta secuencialmente física/animaciones y luego renderiza mediante un `IRenderer`.
2. **Hit-Testing** — Raycasting matemático puro O(N) para detectar el hover y los clics del puntero sin `document.elementFromPoint`.
3. **Proxy de Accesibilidad** — Sincronización bidireccional del foco, la disposición y los valores hacia un shadow DOM de A11y invisible por encima del canvas.

### Inicialización

```typescript
import { Scene } from '@vectojs/core';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, {
  pointBackend: 'webgl', // Opt compatible batch circles/rects into the WebGL2 layer
  maxFPS: 60,
});
scene.start();
```

El `Scene` inserta dos `<div>`s transparentes en el elemento **padre** del canvas: uno para la capa shadow de A11y (`z-index: 10`) y otro para la capa del portal DOM (`z-index: 9`). El padre se fuerza a `position: relative` en cada frame si era `static`.

### Modos de Renderizado

| Modo                     | Comportamiento                                                                                                    | Úsalo cuando                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `'always'` (por defecto) | Re-renderiza cada frame, limitado por `maxFPS`.                                                                   | Animación continua, simulaciones de partículas. |
| `'onDemand'`             | Solo dibuja cuando está sucio o hay movimiento pendiente; los ticks estáticos de rAF siguen comprobando el árbol. | UIs estáticas/dirigidas por eventos.            |

```typescript
scene.renderMode = 'onDemand';
// Then call scene.markDirty() from event handlers to request a repaint.
```

**El truco de la limitación automática por inactividad.** En modo `'always'`, una escena sin tweens pendientes ni bandera de sucio se limita a ~2 fps para ahorrar batería. Si animas a mano mutando `entity.x` en un `update()` personalizado, llama a `scene.markDirty()` **entre frames** (desde un manejador de eventos o un `rAF` aparte) — no dentro del propio `update()`, porque el reseteo posterior al renderizado borra la bandera antes de la siguiente comprobación.

## El Sistema de Entity

Cada objeto en VectoJS extiende la clase abstracta `Entity`.

<figure>
  <img src="/images/entity-hierarchy.svg" alt="Jerarquía de la clase Entity que muestra Entity → UIComponent → todos los componentes" class="diagram" />
  <figcaption>Todos los componentes de UI extienden UIComponent, que a su vez extiende Entity. Los tipos personalizados pueden crear una subclase de Entity directamente.</figcaption>
</figure>

Un `Entity` posee:

- Una **posición** (`x`, `y`), **escala** (`scaleX`, `scaleY`), **rotación** (radianes) y **opacidad**.
- Un array **children** — el VMT es un árbol.
- Una **caja de impacto** (`width`, `height`) usada por el hit-test AABB de UIComponent.
- Banderas opcionales: `interactive`, `clipChildren`, `a11yFullViewport`.

### Referencia completa de propiedades

| Propiedad          | Tipo      | Por defecto | Notas                                                                                                                                                                                                                                      |
| ------------------ | --------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `x`, `y`           | `number`  | `0`         | Posición local                                                                                                                                                                                                                             |
| `scaleX`, `scaleY` | `number`  | `1`         | Escala local                                                                                                                                                                                                                               |
| `rotation`         | `number`  | `0`         | Radianes                                                                                                                                                                                                                                   |
| `opacity`          | `number`  | `1`         | `[0,1]`; multiplicada por la opacidad de los ancestros a través de las rutas normal, batch, WebGPU y portal.                                                                                                                               |
| `width`, `height`  | `number`  | `0`         | Tamaño de la caja de impacto                                                                                                                                                                                                               |
| `interactive`      | `boolean` | `false`     | Habilita el nodo del shadow DOM + eventos                                                                                                                                                                                                  |
| `clipChildren`     | `boolean` | `false`     | Recorta los dibujos normales de los hijos a `[0,0]–[width,height]`; Canvas/SVG son exactos, mientras que Three usa un scissor de AABB en el mundo para recortes rotados/inclinados. Las rutas de puntos GPU/overlay WebGPU no se recortan. |
| `a11yFullViewport` | `boolean` | `false`     | Crea un nodo shadow que llena el viewport (para superficies sin límites)                                                                                                                                                                   |
| `a11yOffsetX/Y`    | `number`  | `0`         | Ajuste fino de la ubicación del nodo shadow                                                                                                                                                                                                |

### Crear una subclase de Entity

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class GlowRect extends Entity {
  color = '#6366f1';

  isPointInside(gx: number, gy: number): boolean {
    const local = this.worldToLocal(gx, gy);
    return (
      !!local && local.x >= 0 && local.x <= this.width && local.y >= 0 && local.y <= this.height
    );
  }

  render(renderer: IRenderer): void {
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 8);
    renderer.fill(this.color);
  }
}

const rect = new GlowRect();
rect.width = 200;
rect.height = 80;
rect.setPosition(100, 100);
scene.add(rect);
```

> **Nota:** `render()` se llama con el renderer ya trasladado a la posición global de la entidad, escalado y rotado. Dibuja desde `(0, 0)`.

### Hit-Testing y Eventos

Establece `entity.interactive = true` para proyectar un nodo de accesibilidad con capacidad de entrada en una escena de canvas normal. Cuando se solicita el hit-testing, `findEntityAt(x, y)` devuelve la primera entidad (en profundidad, de adelante hacia atrás) cuyo `isPointInside()` devuelve `true`. No hay filtro de interactividad durante el recorrido: los hit tests programáticos y los adaptadores aún pueden devolver una entidad no interactiva.

```typescript
rect.interactive = true;

rect.on('click', (e) => {
  rect.animate({ color: '#38bdf8' }, 300);
});

rect.on('hover', (e) => {
  document.body.style.cursor = 'pointer';
});
rect.on('pointerleave', () => {
  document.body.style.cursor = 'default';
});
```

Eventos disponibles: `click`, `hover`, `pointerdown`, `pointerup`, `pointercancel`, `pointermove`, `pointerleave`, `change`, `focus`, `blur`, `wheel`, `keydown`, `keyup`.

Los eventos se propagan al estilo del DOM: **captura** (raíz → objetivo) y luego **propagación (burbujeo)** (objetivo → raíz). Pasa `{ capture: true }` para escuchar en la fase de captura. Usa `e.stopPropagation()` para detener el recorrido, o `e.stopImmediatePropagation()` para saltarte también los listeners restantes en el nodo actual.

### Animación

`entity.animate()` encola un tween suave de tipo ease-out para cualquier propiedad numérica:

```typescript
// Chain two tweens: slide right, then fade out.
rect.animate({ x: 400 }, 400).animate({ opacity: 0 }, 200);
```

La función de easing es ease-out cuadrática: `t * (2 - t)`. Un tween en ejecución mantiene la escena viva (mediante `hasPendingAnimations()`) incluso en modo `onDemand`.

### update() personalizado

Sobrescribe `Entity.update(dt, time)` para implementar lógica por frame.

> [!WARNING] > `dt` está en **milisegundos**, no en segundos. Un error común es escribir `this.rotation += dt * 3` esperando 3 rad/s — eso en realidad rota a 3000 rad/s. Multiplica por `0.001` (o divide las velocidades entre 1000) para convertir.

`time` es `performance.now()`:

```typescript
class Spinner extends Entity {
  update(dt: number, _time: number): void {
    super.update(dt, _time); // advances queued tweens
    this.rotation += dt * 0.003; // dt is ms, so this is 3 rad/s
    this.scene?.markDirty();
  }
}
```

## El Pipeline de Renderizado

<figure>
  <iframe src="/sandbox/diagram-pipeline.html" class="diagram-frame" loading="lazy" title="The VectoJS render pipeline: the six stages of one dirty frame, rendered live by VectoJS" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Cada frame sucio recorre el árbol de entidades — actualizar, descartar y luego renderizar — antes de sincronizar el shadow DOM de A11y. <em>(Renderizado en vivo por VectoJS.)</em></figcaption>
</figure>

Cada frame:

1. **Limpiar** — `renderer.clear()`
2. **Actualizar** — Recorrer el árbol llamando a `entity.update(dt, time)` (`dt` en ms, `time` de `performance.now()`).
3. **Descartar** — Omitir las entidades cuyo `getBounds()` esté fuera del viewport.
4. **Renderizar** — Trasladar/escalar/rotar el renderer a la transformación global de cada entidad, luego llamar a `entity.render(renderer)`.
5. **Vaciar** — Confirmar cualquier dibujo por lotes pendiente (círculos, puntos de WebGL).
6. **Sincronizar A11y** — Actualizar el shadow DOM (limitado por `a11ySyncInterval`).

Como todo ocurre en la memoria de JS y se vuelca directamente al Canvas, no hay ningún thrashing de disposición del navegador. El número de nodos DOM se mantiene plano mientras se animan miles de entidades.

## Consejos de Rendimiento

### Dibujo por lotes

Sobrescribe `getBatchCircle()` o `getBatchRect()` para incluir una entidad hoja en la capa de puntos de WebGL (requiere `pointBackend: 'webgl'`):

```typescript
getBatchCircle() {
  return { radius: this.radius, color: this.color };
}
```

Las hojas representables por lotes se saltan la ruta completa de `save/translate/render/restore` y entran en el búfer de WebGL. El modo Canvas o las transformaciones acumuladas no soportadas usan la alternativa normal `render()` de la entidad.

### Descarte por viewport

Sobrescribe `getBounds()` para devolver un AABB local. Las entidades fuera del viewport se saltan su llamada a `render()`, mientras que el recorrido y `update()` continúan:

```typescript
getBounds() {
  return { x: 0, y: 0, width: this.width, height: this.height };
}
```

`UIComponent` ya implementa `getBounds()` — las subclases personalizadas de Entity crudas que tengan un tamaño fijo también deberían hacerlo.

### Renderizado bajo demanda

Cambia a `scene.renderMode = 'onDemand'` para UIs mayormente estáticas. Los ticks estáticos se saltan el update/render y el trabajo de GPU mientras siguen sondeando rAF en busca del estado de sucio/animación. Llama a `scene.markDirty()` desde los manejadores de eventos.
