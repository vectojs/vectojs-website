+++
title = "Scene"
description = "El orquestador de nivel superior de VectoJS: opciones del constructor, el bucle de renderizado, renderMode/maxFPS y la aceleración automática por inactividad, métodos del ciclo de vida y el registro de backends conectables WebGL/WebGPU."
weight = 2
+++

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

| Opción                 | Tipo                          | Por defecto      | Efecto                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | ----------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pointBackend`         | `'canvas' \| 'webgl'`         | `'canvas'`       | Backend para hojas `getBatchCircle()`/`getBatchRect()` representables. `'webgl'` apila un canvas WebGL2 (`z-index:5`) y agrupa esas primitivas; si WebGL2 no está disponible, recurre a Canvas. La capa GL compone sobre el contenido 2D, por lo que el orden de pintura entre capas no se intercala.                                                                               |
| `particleBackend`      | `'auto' \| 'webgpu' \| 'cpu'` | `'auto'`         | Backend de [`ComputeParticleEntity`](/reference/core-particles/). `'auto'` intenta WebGPU y advierte antes de recurrir a CPU. `'webgpu'` solicita explícitamente WebGPU pero actualmente registra un error y aún recurre si la inicialización falla. `'cpu'` fuerza la simulación CPU (establece `webgpuDisabled`).                                                                 |
| `maxFPS`               | `number`                      | `60`             | Límite de fotogramas por segundo. `0` = sin límite (refresco nativo). Las animaciones continuas siguen ejecutándose, solo que con menos frecuencia. (Internamente `0` bajo `NODE_ENV=test`/`VITEST`.) También se puede establecer en vivo mediante `scene.maxFPS`.                                                                                                                  |
| `respectReducedMotion` | `boolean`                     | `true`           | Cuando el SO solicita `prefers-reduced-motion`, limitar a `REDUCED_MOTION_FPS` (30) — o el menor entre ese y `maxFPS`. `false` ignora la configuración del SO.                                                                                                                                                                                                                      |
| `readingDirection`     | `'ltr' \| 'rtl'`              | `'ltr'`          | Dirección de lectura para el árbol sombra de a11y/automatización, de modo que el **orden de tabulación** del teclado y el recorrido del lector de pantalla sigan el orden de lectura _visual_ en lugar del orden de inserción en el grafo de escena. `'rtl'` invierte el orden en línea dentro de cada fila. También se puede establecer en vivo mediante `scene.readingDirection`. |
| `a11ySyncInterval`     | `number`                      | `0`              | Limita la sincronización del DOM sombra a11y a como máximo una vez cada N ms. `0` = sincronizar cada fotograma renderizado. Un valor pequeño (ej. `100`) mantiene la capa a11y eventualmente consistente durante animaciones pesadas mientras evita escrituras DOM por fotograma. También en vivo mediante `scene.a11ySyncInterval`.                                                |
| `debugA11y`            | `boolean`                     | `false`          | Renderiza nodos sombra con un contorno punteado azul (ayuda de desarrollo) en lugar de `opacity:0`. Siguen siendo cliqueables por automatización de cualquier forma.                                                                                                                                                                                                                |
| `renderer`             | `IRenderer`                   | `CanvasRenderer` | Renderizador personalizado (ej. `ThreeRenderer` de [`@vectojs/three`](/reference/three-renderer/)).                                                                                                                                                                                                                                                                                 |
| `disableWindowResize`  | `boolean`                     | `false`          | Omite el listener automático de `window` resize. Úsalo dentro de un contenedor de diseño personalizado / canvas fuera de pantalla, luego controla el tamaño con `resize(w, h)`.                                                                                                                                                                                                     |
| `maxDPR`               | `number`                      | `undefined`      | Limita la relación de píxeles del dispositivo utilizada para dimensionar los almacenes de respaldo de Canvas2D y `pointBackend: 'webgl'`. `undefined` lee el `devicePixelRatio` real sin límite. Se reaplica en cada llamada `resize()`, no solo en la construcción. Ver "Limitación del DPR de renderizado" más abajo.                                                             |

Nota: `renderMode` es un **campo público** (por defecto `'always'`), no una opción
del constructor — establece `scene.renderMode = 'onDemand'` después de la construcción.

### Limitación del DPR de renderizado (`maxDPR`)

El costo de renderizado del almacén de respaldo escala con `tamaño lógico × dpr²`, no linealmente —
una escena a pantalla completa que funciona sin problemas a DPR 1 (la mayoría de los portátiles de desarrollo) puede exceder su
presupuesto de fotograma de 16ms en una pantalla DPR-3, invisible hasta que alguien realmente pruebe
en una. Esto afecta más a `pointBackend: 'webgl'`, ya que renderiza un
canvas apilado separado cuyo costo de fragmento/overdraw es exactamente esta curva DPR² —
un campo de 1200 partículas a pantalla completa midió **116ms** de fotograma máximo a
DPR 3 frente a 60fps impecables a DPR 1.

```ts
const scene = new Scene(canvas, { pointBackend: 'webgl', maxDPR: 2 });
```

`maxDPR: 2` mantiene la pantalla nítida (2× ya supera lo que la mayoría de los
ojos resuelven a distancia de visualización normal) mientras limita la cantidad de píxeles
del almacén de respaldo — aproximadamente la mitad a DPR 3, ya que `2² / 3² ≈ 0.44×` los
píxeles. Antes de que existiera esta opción, la única solución era monkey-patching
`window.devicePixelRatio` antes de construir la Scene; prefiere `maxDPR`
ahora — se reaplica correctamente en cada resize, cosa que un
`Object.defineProperty` puntual no hace.

### Dos márgenes de proyección

La proyección de contenido tiene dos niveles independientes y, desde `1.31.0`,
cada uno tiene su propio margen:

- **semántico** (`contentSemanticMargin`) — ¿este bloque tiene _algún_ DOM? Un
  bloque con DOM aporta su texto a la búsqueda nativa en la página, a la copia y
  a la lectura anticipada de los lectores de pantalla.
- **interacción** (`contentProjectionMargin`) — ¿se construyen los _portadores
  por línea_ de ese bloque? Los portadores dan al navegador la geometría línea a
  línea necesaria para la selección.

Antes de la división, un único escalar armaba ambos, por lo que solo existían dos
configuraciones: un margen finito liberaba por completo los bloques fuera de
pantalla, dejando el texto fuera de pantalla imposible de encontrar, mientras que
`Infinity` también materializaba todos los portadores del documento.

Separarlos ofrece el punto medio útil:

```ts
const scene = new Scene(canvas, {
  // Every block keeps its text, so find-in-page sees the whole document.
  contentSemanticMargin: Infinity,
  // Carriers stay bounded by the viewport, so cost scales with what is visible.
  contentProjectionMargin: scene.height,
});
```

> [!IMPORTANT]
> `Infinity` es seguro para `contentSemanticMargin` y **no** lo es para
> `contentProjectionMargin`. El coste que lo hace no admitido proviene de una
> banda de portadores sin ventana, no del texto residente.

Un bloque fuera del margen de interacción pero dentro del margen semántico
proyecta su texto completo como un único nodo, **sin** portadores hijos. Es
localizable y copiable; solo falta la geometría de selección por línea, y esa es
inalcanzable de todos modos sin desplazarlo a la vista.

Vale la pena conocer el coste único: un nivel residente materializa un elemento
por bloque en la primera sincronización, medido en torno a 13 µs por nodo creado
— unos 47 ms con 1000 bloques. El estado estable es barato, porque una entidad
que estampa su propio contenido permite a Scene omitir por completo la
reproyección de un bloque sin cambios. Por tanto, este es un coste de apertura del
documento, no un coste por fotograma.

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
scene.readingDirection: 'ltr' | 'rtl'   // tab/traversal order; setting it re-flows
scene.forcedColors: boolean             // getter — OS is in a forced-colors mode
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

`effectiveMaxFPS` = `maxFPS`, reducido además a 30 (`REDUCED_MOTION_FPS`) cuando el SO solicita movimiento reducido y `respectReducedMotion` está activado. `0` significa sin límite.

### Pausa fuera de pantalla y el límite de dt

Dos comportamientos del bucle que son fáciles de pasar por alto:

- **Las escenas fuera de pantalla dejan de renderizar.** Un `IntersectionObserver` en el canvas
  pausa el bucle rAF cuando el canvas se desplaza completamente fuera de la vista (una pestaña de panel,
  un gráfico debajo del pliegue) y se reanuda al reingresar — en lugar de ejecutar la
  actualización/renderizado completo para una escena que nadie puede ver. Donde `IntersectionObserver` no está
  disponible (SSR/jsdom) la escena se trata como siempre en pantalla, por lo que el comportamiento es
  allí invariable.
- **`dt` se limita a 100ms** (`MAX_FRAME_DT`). Después de una pestaña en segundo plano, un
  punto de interrupción, o una pausa larga de GC el tiempo real transcurrido puede ser de segundos; introducir
  ese valor crudo en la integración física/tween hace que todo se teletransporte. Si
  integras `dt` tú mismo en `update(dt)`, ten en cuenta que nunca superará los 100ms.

## Accesibilidad y apariencia

| Miembro                | Tipo               | Notas                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readingDirection`     | `'ltr' \| 'rtl'`   | Ordena el árbol sombra a11y para que el **orden de tabulación** coincida con el orden de lectura visual (filas de arriba a abajo, luego en línea). Establecerlo activa una reordenación en la próxima sincronización. También es opción del constructor. |
| `forcedColors`         | `boolean` (getter) | `true` cuando el SO está en modo de colores forzados (Alto contraste de Windows). Detectado por `(forced-colors: active)`; la escena **se repinta automáticamente** cuando se alterna.                                                                   |
| `prefersReducedMotion` | `boolean` (getter) | `true` cuando el SO solicita movimiento reducido y `respectReducedMotion` está activo. Leído por los controladores de animación, que hacen snap de propiedades que no son opacity en lugar de hacerles tween.                                            |

Un `<canvas>` son píxeles opacos, por lo que el remapeo de colores forzados del navegador nunca
tocca lo que dibujas. Los componentes deben reaccionar por sí mismos:

```ts
render(r: IRenderer) {
  const forced = this.scene?.forcedColors ?? false;
  r.fill(forced ? 'ButtonFace' : this.bg);
  r.fillText(this.label, x, y, this.font, forced ? 'ButtonText' : this.color);
}
```

Ver [a11yRoot y el contrato del agente](/reference/core-a11y/#colores-forzados-alto-contraste).

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

## Instrumentación de User Timing

La Scene puede emitir [`User Timing`](https://developer.mozilla.org/en-US/docs/Web/API/User_Timing_API)
marcas/medidas alrededor de las fases de renderizado, por lo que una captura del
profiler muestra exactamente dónde pasa el tiempo un fotograma. Desactivada por defecto;
actívala con la opción `userTiming` o en vivo mediante `scene.setUserTiming(true)`:

```ts
const scene = new Scene(canvas, { userTiming: true });
// or
scene.setUserTiming(true); // runtime toggle
scene.userTiming; // read the current state
```

Los nombres estables de las medidas se exportan como `VECTO_USER_TIMING`:

```ts
VECTO_USER_TIMING.scene; // { transform, drawWalk, entityPaint, flush, a11ySync }
VECTO_USER_TIMING.markdown; // { parse }
// e.g. 'vecto:scene:transform', 'vecto:markdown:parse'
```

`@vectojs/core` también exporta los ayudantes de bajo nivel que el motor usa
internamente (y que un renderizador personalizado o un componente instrumentado
puede usar para añadir sus propias fases):

```ts
beginVectoUserTiming(name: string): VectoUserTimingSpan | null
endVectoUserTiming(span: VectoUserTimingSpan | null): void
measureVectoUserTiming(name: string, durationMs: number): void
```

`beginVectoUserTiming` devuelve `null` (y `measureVectoUserTiming` no hace nada)
cuando el host no implementa marcas/medidas, por lo que la creación de perfiles
opcional nunca es un requisito de tiempo de ejecución. Los intervalos usan marcas
de inicio/fin con nombres únicos que se liberan en `endVectoUserTiming`.
`measureVectoUserTiming` emite una medida anclada en el tiempo actual para una
duración acumulada a partir de llamadas no solapadas — la vía que reporta los
totales de pintado de entidad por fotograma sin instrumentar cada entidad.

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

## Telemetría de fotogramas (`frameStats`, 1.13.0)

```ts
scene.frameStats: FrameStats; // telemetría de bucle de renderizado en vivo (solo lectura)

interface FrameStats {
  fps: number; // cadencia de fotogramas renderizados, limitada por maxFPS; 0 antes del primer par de fotogramas
  frameTimeMs: number; // reloj de pared del último pase render() (excluye sincronización a11y/contenido)
  frameIntervalMs: number; // intervalo suavizado entre fotogramas renderizados (EMA)
  dt: number; // dt entregado al último fotograma renderizado
  renderedFrames: number; // total de fotogramas renderizados desde start()
  skippedFrames: number; // total de ticks rAF omitidos (idle/onDemand/capped) desde start()
  renderMode: 'always' | 'onDemand';
  dirty: boolean; // si hay un redibujado pendiente actualmente
}
```

`fps` se deriva del intervalo entre fotogramas _realmente renderizados_, por lo que los fotogramas en escenas `onDemand` inactivas y los fotogramas descartados por el límite `maxFPS` o el auto-throttle estático no lo reducen — reporta la cadencia de los redibujados reales, no la tasa rAF bruta. Los tiempos se miden en el bucle `requestAnimationFrame`; una escena impulsada solo por `step()` (exportación determinista) los deja en cero. El renderizador siempre repinta todo el lienzo, por lo que no hay rectángulo parcial sucio — `dirty` es la bandera booleana de redibujado pendiente. Impulsa el HUD de rendimiento [`@vectojs/devtools`](/reference/devtools/).

## Relacionados

[`Entity`](/reference/core-entity/) (el árbol que Scene posee) ·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/) ·
[`ComputeParticleEntity`](/reference/core-particles/) ·
[a11yRoot y el contrato del agente](/reference/core-a11y/) ·
[Visión general de `@vectojs/core`](/reference/core-api/)
