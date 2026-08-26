+++
title = "Entity"
description = "La base abstracta de cada nodo del Virtual Math Tree: transformaciones, el sistema de animación, eventos de captura/burbuja y los hooks de a11y/agrupación que una Entity personalizada puede sobrescribir."
weight = 3
+++

# `Entity` (abstracta)

Parte de [`@vectojs/core`](/reference/core-api/).

Clase base para cada nodo en el Virtual Math Tree. Crea una subclase e implementa
`isPointInside` y `render`.

```ts
abstract class Entity {
  abstract isPointInside(globalX: number, globalY: number): boolean; // DEBE implementar
  abstract render(renderer: IRenderer): void; // DEBE implementar
}
```

## Propiedades públicas

| Propiedad                    | Tipo             | Por defecto     | Notas                                                                                                                                                                                                    |
| ---------------------------- | ---------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                         | `string`         | `entity_<rand>` | Se usa como el id del nodo sombra / `data-vecto-id`.                                                                                                                                                     |
| `children`                   | `Entity[]`       | `[]`            |                                                                                                                                                                                                          |
| `parent`                     | `Entity \| null` | `null`          |                                                                                                                                                                                                          |
| `scene`                      | getter           | —               | Recorre la cadena de padres hasta la `Scene` propietaria (o `null`).                                                                                                                                     |
| `x`, `y`                     | `number`         | `0`             | Posición local.                                                                                                                                                                                          |
| `scaleX`, `scaleY`           | `number`         | `1`             | Escala local.                                                                                                                                                                                            |
| `rotation`                   | `number`         | `0`             | Rotación local, en radianes.                                                                                                                                                                             |
| `opacity`                    | `number`         | `1`             | Multiplicada por cada opacidad ancestra, luego aplicada a la salida normal, agrupada, WebGPU y DOM-portal.                                                                                               |
| `interactive`                | `boolean`        | `false`         | Efecto secundario del asignador: marca `a11yNeedsReorder` + `markDirty()`. Activa la proyección a11y (con `width`).                                                                                      |
| `width`, `height`            | `number`         | `0`             | Tamaño de la caja de impacto / caja sombra a11y (× escala).                                                                                                                                              |
| `clipChildren`               | `boolean`        | `false`         | Recorta los dibujos hijos normales a `[0,0]–[width,height]`; Canvas/SVG son exactos. Three usa una tijera world-AABB para clips rotados/inclinados. Las rutas WebGL point/WebGPU overlay no se recortan. |
| `a11yOffsetX`, `a11yOffsetY` | `number`         | `0`             | Desplaza el nodo sombra respecto a la posición global de la entidad.                                                                                                                                     |
| `a11yFullViewport`           | `boolean`        | `false`         | Proyecta un nodo sombra que llena el viewport incluso con `width === 0`; montado **detrás** de todos los demás para que los componentes superpuestos sigan siendo cliqueables.                           |
| `isDOMPortal`                | `boolean`        | `false`         | Marca `DOMPortalEntity`; los portales son omitidos por la sincronización a11y.                                                                                                                           |

> **La proyección a11y requiere una caja.** Un nodo sombra solo se crea cuando
> `interactive && (width > 0 || a11yFullViewport)`. Una entidad interactiva con
> `width: 0` y sin `a11yFullViewport` **no** recibe nodo sombra — establece `width`/
> `height`.

## Métodos de árbol y transformación

```ts
add(...children: Entity[]): this             // adjunta uno o más hijos en orden; también marca a11yNeedsReorder + markDirty
remove(child: Entity): this
set(props: Partial<this>): this              // asigna varias propiedades propias a través de sus asignadores normales; devuelve this
setPosition(x: number, y: number): this
getGlobalPosition(): Point                   // posición mundial; acumula translate→scale→rotate hasta (excluyendo) la raíz
getWorldTransform(): AffineTransform         // matriz T·S·R acumulada exacta del Canvas { a,b,c,d,e,f }
localToWorld(localX: number, localY: number): Point
worldToLocal(worldX: number, worldY: number): Point | null // null para una transformación singular
getWorldBounds(): Bounds                     // getBounds() local (o width/height) transformado a un AABB mundial
getWorldScale(): { x: number; y: number }    // producto de la escala propia + ancestros (excl. raíz)
getWorldRotation(): number                   // suma de la rotación propia + ancestros (excl. raíz), radianes
getBounds(): Bounds | null                   // AABB local para recorte; null (default) = nunca recortado
destroy(): void                              // limpia animaciones + listeners, se desconecta del padre
```

`getWorldScale()` y `getWorldRotation()` son acumulaciones de conveniencia. Bajo
rotación anidada más escala no uniforme, la matriz compuesta puede contener cizallamiento;
usa `getWorldTransform()`, `localToWorld()`, `worldToLocal()` o
`getWorldBounds()` cuando la geometría exacta sea importante.

Desde 1.9.0, `add()` es **variádico** — `parent.add(a, b, c)` adjunta cada hijo
en orden de argumentos (el camino de un solo hijo sigue siendo O(1)). `set(props)` es una
función ergonómica de tiempo de construcción que asigna varias propiedades propias en una sola llamada,
cada una a través de su asignador normal (por lo que una propiedad con un
`setTransition` configurado todavía anima, e `interactive` todavía marca el reordenamiento a11y):
`rect.set({ x: 40, y: 40, width: 120, fill: '#38bdf8' })`. Es un simple
`for…in` sobre el objeto dado y no toca ninguna ruta por fotograma. Ambos se combinan
naturalmente con las primitivas [`Rect`/`Circle`/`Group`](/reference/core-entities/).

## Animación

```ts
// Tween legacy (preservado)
animate(targetProps: Partial<this>, durationMs: number): this
hasPendingAnimations(): boolean

// Sistema de animación (0.2.0)
setTransition(config: Partial<Record<AnimatableProp, MotionConfig>>): this
animateTo(props: Partial<Record<AnimatableProp, number>>, cfg: TweenConfig): Promise<void>
springTo(props: Partial<Record<AnimatableProp, number>>, cfg?: SpringConfig): Promise<void>
```

`animate()` encola un tween; las múltiples llamadas **se encadenan secuencialmente**. Solo las propiedades
numéricas se interpolan; la easing es un ease-out fijo (`p * (2 - p)`). Un
`animate()` en ejecución mantiene la escena no estática (escapa del acelerador por inactividad, ver
[`Scene`](/reference/core-scene/#rendermode-maxfps-y-el-acelerador-automatico-por-inactividad))
y congela la sincronización a11y hasta que se estabiliza.

`hasPendingAnimations()` es **sobrescribible** y es la única ventana de la Scene hacia
movimiento personalizado: si una subclase integra su propio movimiento dentro de `update()`
(un resorte o velocidad hecho a mano), sobrescríbelo para que devuelva `true` mientras ese
movimiento esté en vuelo — `markDirty()` desde dentro de `update()` se limpia de nuevo al
final del mismo tick, por lo que sin la sobrescritura el acelerador por inactividad reduce la
animación a 2 fps y el modo `onDemand` la congela.

**Sistema de animación 0.2.0** — basado en resortes primero, unificando tweens y resortes:

- `setTransition` declara cómo animan las seis propiedades animables (`x`, `y`, `scaleX`,
  `scaleY`, `rotation`, `opacity`); después, la asignación simple
  (`entity.x = 400`) las anima, reorientando en vuelo para movimiento continuo.
  Estas propiedades son accessors con una ruta rápida de sobrecarga cero cuando no hay transición
  configurada — una asignación simple sigue siendo una escritura de campo plana.
- `animateTo` / `springTo` impulsan propiedades imperativamente y se resuelven cuando el movimiento
  se estabiliza; a diferencia de `animate()`, se ejecutan concurrentemente y se componen con `await`.
- `MotionConfig = 'spring' | SpringConfig | TweenConfig` (la presencia de `duration`
  selecciona un tween). `TweenConfig.easing` toma un `EasingName` de la exportación `Easing`
  o un `(t) => number` personalizado.
- Respeta `prefers-reduced-motion` (el movimiento se ajusta instantáneamente, la opacidad se desvanece). Relacionado:
  `onMounted()` se dispara cuando una entidad se adjunta a una escena viva — el helper de presencia
  en UI lo usa para reproducir animaciones de entrada.

Ver [Física y Animación](/learn/physics-engine/) para uso.

## Eventos (`VectoEvent` / captura + burbuja)

```ts
type VectoEvent =
  | 'click' | 'dblclick' | 'hover' | 'pointerdown' | 'pointerup' | 'pointercancel' | 'pointermove' | 'pointerleave'
  | 'change' | 'focus' | 'blur' | 'wheel' | 'keydown' | 'keyup' | 'scroll';

on(event: VectoEvent, cb: (e: any) => void, options?: { capture?: boolean }): this
off(event: VectoEvent, cb: (e: any) => void, options?: { capture?: boolean }): this
emit(event: VectoEvent, payload: any): void          // solo propio, listeners de fase burbuja (legacy/interno de componentes)
dispatchEvent(event: VectoJSEvent): void             // estilo DOM captura (raíz→objetivo) luego burbuja (objetivo→raíz)
```

- `on`/`off` usan por defecto la fase de **burbuja**; pasa `{ capture: true }` para la
  fase de captura. Los listeners de burbuja también se disparan para la ruta `emit()` legacy.
- `VectoJSEvent<N>` envuelve un `nativeEvent` y añade `target`, `currentTarget`,
  `bubbles`, `stopPropagation()`, `stopImmediatePropagation()`,
  `preventDefault()`, viewport `clientX/Y`, `sceneX/Y` lógicas, `localX/Y` del
  objetivo actual, teclas modificadoras y transferencias (`deltaX/Y`, `key`,
  `defaultPrevented`). Las coordenadas locales invierten la transformación afín anidada completa.
  Un evento que no burbujea aún ejecuta la fase de captura pero solo
  dispara su objetivo en la fase de burbuja.
- `'change'` de un `<input>` sombra de control de formulario lleva
  `{ value, checked, selectionStart, selectionEnd, composition }` donde
  `composition` es `{ start, length } | null` para la pre-edición IME activa.
  `'wheel'` lleva el `WheelEvent` nativo (llama a `preventDefault()` para detener el
  desplazamiento de página).
- `'dblclick'` se dispara en un doble clic (`detail === 2` nativo).
- `'scroll'` lleva un `ScrollEventPayload` — la única forma en que una entidad observa
  el desplazamiento de su espejo sombra: `{ scrollTop, scrollLeft, deltaY,
deltaX, maxScrollTop }`. Se dispara desde espejos de contenido desplazables (p. ej.
  un nodo sombra `ScrollView`) conforme el navegador los desplaza.

Ver [Eventos y Hit-Testing](/learn/events/) para uso.

## Hooks de a11y / agrupación (sobrescribir para optar)

```ts
getA11yAttributes(): A11yAttributes          // default {} → un <div> transparente simple
getBatchCircle(): BatchCircle | null         // { radius, color } → camino rápido fillCircle del renderizador (hojas de escala uniforme)
getBatchRect(): BatchRect | null             // { width, height, color } → GPU indexed-quad batch (solo pointBackend WebGL)
update(dt: number, time: number): void       // sobrescritura opcional; dt en MILISEGUNDOS, time es performance.now(); el default avanza los tweens encolados
```

`entity.a11yRegion: boolean` (por defecto `false`) marca la entidad como una
**región de agrupación** a11y: los descendientes se proyectan en un contenedor compartido
en lugar de anidarse independientemente, por lo que un contenedor de agrupación puro
(p. ej. `width: 0`) sigue agrupando — gana la región contenedora más cercana y las
regiones se anidan. Declarativo, nunca consultado por la geometría.

`getBatchCircle`/`getBatchRect` se leen **cada fotograma** (color/radio animados
se respetan). Una hoja agrupada representable salta su propio
`save/translate/scale/rotate/render/restore`; Canvas mode o una transformación afín
acumulada no soportada usa la `render()` normal de la entidad como respaldo.

Ver [a11yRoot y el contrato del agente](/reference/core-a11y/) para la forma completa
de `A11yAttributes` y cómo funciona la sincronización sombra-DOM.

## Relacionados

[`Scene`](/reference/core-scene/) (dueña del árbol) ·
[Renderizadores](/reference/core-renderer/) (`Entity.getContentProjection()`) ·
[a11yRoot y el contrato del agente](/reference/core-a11y/) ·
[Visión general de `@vectojs/core`](/reference/core-api/)
