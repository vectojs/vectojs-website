---
title: 'Scene'
description: 'El orquestador de nivel superior de VectoJS: opciones del constructor, el bucle de renderizado, renderMode/maxFPS y la aceleración automática por inactividad, métodos del ciclo de vida y el registro de backends conectables WebGL/WebGPU.'
order: 2
---

# `Scene`

Parte de [`@vectojs/core`](/reference/core-api/).

```ts
new Scene(canvas: HTMLCanvasElement, options?: SceneOptions)
```

Orquestador de nivel superior. Una `Scene` por `<canvas>`. Añade objetos `Entity` con
`add()`, luego `start()` el bucle.

```ts
const scene = new Scene(document.querySelector('canvas')!);
scene.add(new Circle({ radius: 24, fill: '#38bdf8' }).setPosition(100, 100));
scene.start();
```

La Scene añade dos `<div>`s hermanos transparentes al elemento **padre** del canvas
(para la capa sombra a11y en `z-index:10` y la capa DOM-portal
en `z-index:9`), y fuerza al padre a `position:relative` si está
`static`. En SSR/Node (sin `document`) la proyección a11y/portal se degrada a una
no-op para que la disposición sin interfaz gráfica / `toSVG()` sigan funcionando.

## SceneOptions

| Opción                 | Tipo                          | Por defecto      | Efecto                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | ----------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pointBackend`         | `'canvas' \| 'webgl'`         | `'canvas'`       | Backend para hojas `getBatchCircle()`/`getBatchRect()` representables. `'webgl'` apila un canvas WebGL2 (`z-index:5`) y agrupa esas primitivas; si WebGL2 no está disponible, recurre a Canvas. La capa GL compone sobre el contenido 2D, por lo que el orden de pintura entre capas no se intercala.                                |
| `particleBackend`      | `'auto' \| 'webgpu' \| 'cpu'` | `'auto'`         | Backend de [`ComputeParticleEntity`](/reference/core-particles/). `'auto'` intenta WebGPU y advierte antes de recurrir a CPU. `'webgpu'` solicita explícitamente WebGPU pero actualmente registra un error y aún recurre si la inicialización falla. `'cpu'` fuerza la simulación CPU (establece `webgpuDisabled`).                  |
| `maxFPS`               | `number`                      | `60`             | Límite de fotogramas por segundo. `0` = sin límite (refresco nativo). Las animaciones continuas siguen ejecutándose, solo que con menos frecuencia. (Internamente `0` bajo `NODE_ENV=test`/`VITEST`.) También se puede establecer en vivo mediante `scene.maxFPS`.                                                                   |
| `respectReducedMotion` | `boolean`                     | `true`           | Cuando el SO solicita `prefers-reduced-motion`, limitar a `REDUCED_MOTION_FPS` (30) — o el menor entre ese y `maxFPS`. `false` ignora la configuración del SO.                                                                                                                                                                       |
| `a11ySyncInterval`     | `number`                      | `0`              | Limita la sincronización del DOM sombra a11y a como máximo una vez cada N ms. `0` = sincronizar cada fotograma renderizado. Un valor pequeño (ej. `100`) mantiene la capa a11y eventualmente consistente durante animaciones pesadas mientras evita escrituras DOM por fotograma. También en vivo mediante `scene.a11ySyncInterval`. |
| `debugA11y`            | `boolean`                     | `false`          | Renderiza nodos sombra con un contorno punteado azul (ayuda de desarrollo) en lugar de `opacity:0`. Siguen siendo cliqueables por automatización de cualquier forma.                                                                                                                                                                 |
| `renderer`             | `IRenderer`                   | `CanvasRenderer` | Renderizador personalizado (ej. `ThreeRenderer` de [`@vectojs/three`](/reference/three-renderer/)).                                                                                                                                                                                                                                  |
| `disableWindowResize`  | `boolean`                     | `false`          | Omite el listener automático de `window` resize. Úsalo dentro de un contenedor de diseño personalizado / canvas fuera de pantalla, luego controla el tamaño con `resize(w, h)`.                                                                                                                                                      |

Nota: `renderMode` es un **campo público** (por defecto `'always'`), no una opción
del constructor — establece `scene.renderMode = 'onDemand'` después de la construcción.

## Campos públicos

```ts
scene.canvas: HTMLCanvasElement
scene.width: number
scene.height: number
scene.overlayRoot: Entity          // hijos dibujados sobre el árbol principal, omitiendo los límites de clip
scene.renderMode: 'always' | 'onDemand'   // default 'always'
scene.maxFPS: number               // default 60
scene.respectReducedMotion: boolean
scene.a11ySyncInterval: number
scene.particleBackend: 'auto' | 'webgpu' | 'cpu'
scene.webgpuDisabled: boolean      // getter true cuando _disabled O particleBackend === 'cpu'
scene.a11yNeedsReorder: boolean
```

## renderMode, maxFPS y el acelerador automático por inactividad

- **`renderMode: 'always'` (por defecto)** — re-renderizar cada fotograma, limitado por el
  FPS efectivo.
- **`renderMode: 'onDemand'`** — dibujar solo cuando la escena está _sucia_ (ver
  `markDirty()`) o un controlador de animación/transición está pendiente. Los ticks rAF
  estáticos aún inspeccionan el árbol en busca de movimiento pendiente, pero omiten la actualización/renderizado de entidad y
  el envío a GPU. Ideal para UIs estáticas / impulsadas por eventos.

**Acelerador automático por inactividad (el problema clave).** Una escena se considera **estática** cuando
no está sucia Y ningún nodo en el árbol principal/de superposición tiene un tween `animate()` pendiente.
En modo `'always'` con `maxFPS > 0`, una escena estática se acelera a
**~2 fps** para ahorrar batería/GPU. La bandera `dirty` se restablece a `false` al final
de cada fotograma renderizado (post-renderizado), por lo tanto:

> Si animas manualmente mutando `entity.x` etc. dentro de un `update()` personalizado,
> llamar a `markDirty()` **dentro** de `update()` no ayuda — el restablecimiento post-renderizado
> lo limpia, y el chequeo estático del siguiente fotograma ve `dirty === false` y
> te acelera a 2 fps. O impulsas el movimiento a través de [`entity.animate()`](/reference/core-entity/#animación)
> (que mantiene la escena no estática mientras el tween se ejecuta), o llamas a `scene.markDirty()`
> **entre** fotogramas (desde un manejador de eventos, un `rAF` separado o un temporizador) para que la
> bandera sobreviva hasta la siguiente iteración del bucle.

`effectiveMaxFPS` = `maxFPS`, reducido aún más a 30 (`REDUCED_MOTION_FPS`) cuando
el SO solicita movimiento reducido y `respectReducedMotion` está activo. `0` significa
sin límite.

## Métodos del ciclo de vida

```ts
scene.add(entity: Entity): this              // adjunta a la raíz de la escena
scene.remove(entity: Entity): this           // desconecta + destruye recursivamente sus nodos sombra a11y
scene.start(): void                          // inicia el bucle rAF; idempotente; advierte una vez si width/height es 0
scene.stop(): void                           // detiene después del fotograma actual; start() reanuda
scene.destroy(): void                        // destruye idempotentemente subárboles/recursos de entidad, bucle, listeners, capas DOM, gestores GPU, y renderizador
scene.markDirty(): void                      // solicita un redibujado en el siguiente fotograma (significativo en onDemand + escapa del acelerador por inactividad)
scene.resize(width: number, height: number): void   // establece el viewport; redimensiona renderizador + capa GL; marca sucio
scene.showOverlay(overlay: Entity): void     // añade a overlayRoot (dibujado encima, sin clip)
scene.hideOverlay(overlay: Entity): void
scene.detachA11y(entity: Entity): void       // elimina nodos sombra para un subárbol SIN eliminarlo del árbol
```

> **`resize(w, h)` debe ejecutarse antes de las simulaciones de partículas.** El ancho/alto provienen de
> `window.innerWidth/innerHeight` a menos que `disableWindowResize` esté establecido, en cuyo
> caso se recurre a `canvas.width || canvas.clientWidth || 0`. Un viewport `0×0`
> significa que las partículas simulan en una caja de tamaño cero y pueden no renderizarse.
> `start()` registra una advertencia única cuando el ancho o el alto es 0.
>
> `resize()` es también el límite métrico de la proyección de texto. Llámalo después de un
> contenedor personalizado o un cambio de zoom CSS de aplicación incluso cuando el ancho lógico
> y el alto no hayan cambiado; Core 1.8 entonces reconstruye la clave de calibración en frío y
> espera la nueva geometría Range de Firefox/Chromium antes de marcar las
> cuadrículas preparadas como listas.
>
> **`syncA11y` solo crea/actualiza, nunca poda** dentro de un fotograma. Si un
> componente intercambia entidades _hijas_ interactivas cada fotograma, llama a
> `detachA11y(child)` antes de descartarlas o sus nodos sombra `<a>`/de control
> se filtrarán. (`remove()` ya poda recursivamente.)

## Otros métodos de Scene

```ts
scene.getRenderer(): IRenderer
scene.getRoot(): Entity
scene.clientToScene(clientX: number, clientY: number): Point // viewport → coordenadas lógicas de Scene
scene.render(renderer: IRenderer, dt = 0, time = 0): void   // el renderizador principal avanza el estado; los renderizadores secundarios dibujan una instantánea de solo lectura
scene.toSVG(): string                        // instantánea de solo lectura del estado actual a través de SVGRenderer → SVG XML plano
scene.findEntityAt(x, y): Entity | null      // entidad superior cuya isPointInside() devuelve true (profundidad primero, frontal a posterior; sin filtro interactivo)
scene.getA11yElement(entityId: string): HTMLElement | undefined
scene.getA11yTree(): A11yTreeNode[]          // instantánea anidada de los nodos sombra proyectados (id/tag/role/label/value/...)
```

## Registro de backends conectables (estático)

```ts
Scene.registerWebGLPointRendererCreator(creator: WebGLPointRendererCreator): void
Scene.registerWebGPUParticleSystemManager(managerClass: any): void
```

Llamado automáticamente por el punto de entrada `.`. Las interfaces relevantes
(`IWebGLPointRenderer`, `IWebGPUParticleSystemManager`,
`WebGLPointRendererCreator`) se exportan para backends personalizados. La pérdida de dispositivo WebGPU
se recupera automáticamente con retroceso exponencial (3 reintentos) antes de deshabilitar
permanentemente WebGPU.

## Relacionados

[`Entity`](/reference/core-entity/) (el árbol que Scene posee) ·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/) ·
[`ComputeParticleEntity`](/reference/core-particles/) ·
[a11yRoot y el contrato del agente](/reference/core-a11y/) ·
[Visión general de `@vectojs/core`](/reference/core-api/)
