+++
title = "07 — Renderer — Coordenadas / Clipping / Paridad DPR"
description = "Paridad multi-backend entre Canvas2D, WebGL, WebGPU, SVG y Three: el contrato IRenderer, espacios de coordenadas, semántica de clipping, topes de DPR/backing-store, culling del viewport y batching de draw calls — y cada trampa que hace que la misma escena se vea diferente en otro backend."
weight = 27
+++

# 07 — Renderer — Coordenadas / Clipping / Paridad DPR

> **Boss 07** custodia el último tramo: convertir la geometría del Virtual Math Tree en píxeles que se vean idénticos tanto si el backend es `CanvasRenderingContext2D`, una capa de puntos WebGL, un pase de cómputo WebGPU, una exportación SVG o una malla instanciada de Three.js — a cualquier DPR, cualquier zoom y cualquier viewport.

- **Qué aprenderás**: el contrato `IRenderer` y por qué él —y no `CanvasRenderingContext2D`— es la autoridad; los cinco espacios de coordenadas que atraviesa un draw call; cómo clipping, DPR, culling y batching rompen cada uno la paridad; y las trampas archivadas, corregidas y aún abiertas con `file:line` que puedes verificar.
- **Qué no aprenderás**: conformado de texto y layout (boss 02), dirty y ciclo de vida del VMT (boss 06), aceleración WASM (boss 08) o el mapeo de dos mundos del puente Three/XR (boss 09). Este documento es la mitad de renderizado de cada uno.

## Por qué la paridad multi-backend es difícil

VectoJS promete "misma escena, misma imagen" en cinco backends:

| backend                     | módulo                                                        | ¿retenido?           | dónde van los píxeles                                |
| --------------------------- | ------------------------------------------------------------- | -------------------- | ---------------------------------------------------- |
| Canvas2D                    | `packages/core/src/renderer/CanvasRenderer.ts:1`              | inmediato            | un único contexto 2D de `<canvas>`, escalado por DPR |
| WebGL puntos/sprites/glifos | `packages/core/src/renderer/WebGLPointRenderer.ts:1`          | en lote              | canvas apilado de ventana completa, quads NDC        |
| Partículas WebGPU           | `packages/core/src/renderer/WebGPUParticleSystemManager.ts:1` | cómputo              | mismo canvas apilado, cómputo→render                 |
| Exportación SVG             | `packages/core/src/renderer/SVGRenderer.ts:1`                 | cadenas retenidas    | serialización sin DOM `toXMLString()`                |
| Three.js                    | `packages/three/src/ThreeRenderer.ts:216`                     | scene graph retenido | cámara orto de `THREE.WebGLRenderer`                 |

Cada backend recibe las **mismas llamadas `Entity.render(r: IRenderer)`** en el mismo orden, bajo la misma pila `save`/`restore`/`translate`. La paridad no falla donde el recorrido está mal sino donde los backends _interpretan_ la misma llamada de forma distinta — un clip que es una operación de path en uno y un rect scissor en otro, un backing store dimensionado a `window.devicePixelRatio` en uno y limitado por `maxDPR` en otro, un trazo que es una propiedad `lineWidth` en uno y geometría de cinta en otro. Cada divergencia es invisible hasta que una pantalla HiDPI, un zoom, un borde de clip o una grilla de 40k celdas la golpea.

El contrato que absorbe estas divergencias es `IRenderer` (`packages/core/src/renderer/IRenderer.ts:1`). Las entidades no deben importar un renderer concreto. La interfaz es basada en métodos por diseño: el estilo viaja _con_ el dibujo (`stroke(color, lineWidth)`, `fillText(text, x, y, font, color)`) para que un backend en lotes pueda coalescer ejecuciones y un backend GPU tenga un límite definido. Las propiedades de estilo mutables (`ctx.fillStyle = …`) están deliberadamente ausentes — trampas de desarrollo advierten sobre ellas (`IRenderer.ts:159`, `IRenderer.ts:301`) porque en JS sin transpilar se adjuntan como expandos y dibujan silenciosamente con el valor por defecto del contexto.

## El contrato IRenderer (lee esto primero)

```text
IRenderer.ts:41  — kind, pixelRatio, setDrawCounters / getDrawCounters
IRenderer.ts:134 — clip(x,y,w,h, radii?)
IRenderer.ts:149 — path: beginPath / moveTo / lineTo / bezierCurveTo / closePath / arc / roundRect
IRenderer.ts:193 — drawImage / drawImageRect? (optional)
IRenderer.ts:287 — fill / stroke / fillText / fillCircle / flush
IRenderer.ts:350 — createLinearGradient
IRenderer.ts:404 — present? / dispose? / isContextLost? / onContextRestored?
```

Decisiones clave de diseño:

- **`kind`** (`IRenderer.ts:76`) es un discriminador de cadena estable (`'canvas2d' | 'svg' | 'three'`) — `constructor.name` se minifica.
- **`pixelRatio`** (`IRenderer.ts:88`) es opcional y un valor _vivo aplicado_, no una instantánea de `window.devicePixelRatio`. Quien rasterice una fuente de blit debe leer esto, no la ventana.
- **`drawImageRect?`** (`IRenderer.ts:232`) es opcional. `SVGRenderer` lo omite a propósito: un blit SVG incrusta su fuente como data URL, así que un sub-rect por celda haría inline de todo el atlas miles de veces. Los llamantes deben detectar la capacidad y mantener un fallback `fillText`.
- **`fillCircle` + `flush`** (`IRenderer.ts:328`, `:364`) es el lote que preserva el orden. Círculos consecutivos del mismo color y mismo alpha se coalescen en un único path y un único `fill()` en `flush()`. `Scene` hace flush en cada límite entre hermanos y al final del frame.
- **`present?`** (`IRenderer.ts:404`) es solo para backends retenidos. `CanvasRenderer` pinta de inmediato; `ThreeRenderer` difiere su único render GL real a `present()` (`ThreeRenderer.ts:957`) para que un frame cueste `O(N)` adds + `1` draw, no `O(N²)` re-renders.

## Espacios de coordenadas (cinco, no uno)

Un punto escrito como `fillCircle(cx, cy, …)` atraviesa:

1. **Local** — la caja `(x, y)` propia de la entidad. `Entity.getBounds()` y `worldToLocal` viven aquí.
2. **Mundo** — local transformado por cada `translate` / `scale` / `rotate` ancestro y la escala DPR de la escena. `HitTester` y el culling prueban aquí.
3. **Viewport / CSS px** — mundo recortado al viewport de la escena y a cualquier ancestro `clipChildren`. `Scene.ts:4335` `projectionBoxVisible`.
4. **Backing store / device px** — viewport × `appliedDPR` (`CanvasRenderer.ts:244` `pixelRatio`). Donde la GPU muestrea realmente.
5. **Clip / NDC** — solo WebGL/WebGPU: `(pos / resolution)*2-1`, con y invertida (`WebGLPointRenderer.ts:320`), orto y-down de Three (`ThreeRenderer.ts:250`).

La trampa es asumir que un espacio es otro. La ruta GPU de `ComputeParticleEntity` consume `scene.mouseX/Y` en espacio de **ventana** y dibuja en un canvas apilado de ventana completa que ignora las transformaciones de entidad; su fallback CPU consume `entity.worldToLocal(mouse)` en espacio **local** y dibuja dentro de `renderer.translate(node.x, node.y)` — un buffer, dos contratos (`vectojs-docs/forge/findings/renderer-and-gpu.md:299`). El pase de registro de `WebGPUParticleSystemManager` pasa `screen_size` como `width / height` (`WebGPUParticleSystemManager.ts:310`) mientras la ruta CPU dibuja con la transformación de entidad ya aplicada.

`ThreeRenderer` vive en la misma trampa en el límite NDC: su cámara orto es y-down (`ThreeRenderer.ts:250`), así que cada malla `FrontSide` queda de espaldas y es descartada — la corrección es `side: DoubleSide` en cada primitiva rellena, no solo texto (`ThreeRenderer.ts:596`, forge 2026-08-13).

## Clipping

`IRenderer.clip(x, y, w, h, radii?)` (`IRenderer.ts:134`) intersecta el clip actual. El `radii` es una _mejora progresiva_: una ruta GPU de scissor-test puede ignorarlo.

- **Canvas2D** — `ctx.roundRect` + `ctx.clip()` dentro de `save`/`restore` (`CanvasRenderer.ts:373`). Con alcance, correcto.
- **SVG** — sintético: un `<clipPath id="clip-N"><rect|path …/>` fresco más `<g clip-path="url(#clip-N)">`, cerrado al desapilar `clipDepth` en `restore()` y al cerrar etiquetas en `toXMLString()` (`SVGRenderer.ts:510`, `:543`). El coste es tamaño del DOM, no fill rate.
- **Three** — rect scissor en píxeles de backing-store, transformado por la matriz actual y volteado a origen bottom-left, intersectado con cualquier scissor envolvente (`ThreeRenderer.ts:449`). Scissor es solo rectangular; los clips redondeados degradan a su AABB.
- **`clipChildren`** — un flag a nivel de `Scene`/entidad, _no_ la llamada `clip()` del renderer, que virtualiza hit, a11y y proyección de contenido. Tanto `Scene.ts:254` (hit) como `Scene.ts:4305` (culling) intersectan la caja mundial de cada ancestro `clipChildren`; `isHitEligible` re-verifica con el rect local exacto consciente de rotación.

Brecha conocida de clip: `IRenderer.fill` no puede expresar `fillRule: 'evenodd'` (`forge/findings/renderer-and-gpu.md:38`). `Canvas2D` y `SVG` pueden hacer even-odd (`ctx.fill('evenodd')`, `<path fill-rule="evenodd">`), pero la interfaz expone solo `fill(colorOrGradient)`. Un path compuesto con más de un componente cerrado por tanto rellena `nonzero` en cada backend. La forma prescrita es un argumento opcional `fillRule` retrocompatible en `fill`, a implementar consistentemente antes de que los consumidores retiren su guarda diagnóstica.

## Escalado DPR y topes de backing-store

```text
CanvasRenderer.ts:219  effectiveDPR()  = min(real DPR, maxDPR)
CanvasRenderer.ts:244  pixelRatio      = appliedDPR (recorded, not live)
CanvasRenderer.ts:119  constructor / resize apply scale(dpr, dpr)
WebGLPointRenderer.ts:972  same clamp for the point layer
ThreeRenderer.ts:307   effectiveDPR() / pixelRatio via getPixelRatio()
Scene.ts:286           SceneOptions.maxDPR — syncs to every renderer on resize
```

Tres invariantes:

1. **Limita, no confíes.** `maxDPR` (`SceneOptions.maxDPR`, `CanvasRenderer.ts:66`) topa el crecimiento del backing-store. `maxDPR: 2` es un valor por defecto sensato, _no_ una garantía — un pase de trazo por frame con miles de segmentos finos midió `16.7 ms` a DPR1 vs `140 ms` a DPR2 en el mismo contenido (`forge 2026-07-18` tope de backing-store). Los pases costosos pueden necesitar `maxDPR: 1` incluso cuando el valor por defecto del motor es 2.

2. **Aplicado, no vivo.** `pixelRatio` reporta la razón por la que el contexto _está actualmente escalado_ (`appliedDPR`), no `effectiveDPR()` releído al acceder (`CanvasRenderer.ts:234`). Un getter vivo reportaría el DPR _futuro_ durante la ventana entre un cambio de zoom/DPR y el siguiente `resize`, y quien rasterice desde él produciría una textura que el contexto aún viejo remuestrea. Las cachés claveadas en `pixelRatio` (p. ej. `GlyphRasterAtlas`, pool de atlas de código de `Markdown`) por tanto re-clavean solo tras el resize que realmente reasigna.

3. **El resize invalida cachés de estilo.** Asignar `canvas.width/height` resetea todo el contexto 2D a `10px sans-serif / #000` según spec. `CanvasRenderer.resize` descarta `_cachedFont/_cachedFill/_cachedStroke` y estado de lote (`CanvasRenderer.ts:258`) y registra el nuevo `appliedDPR`. `contextrestored` hace lo mismo (`CanvasRenderer.ts:164`); omitir el descarte es un repintado de caché obsoleta con la fuente por defecto. El bucle correspondiente `WatchDevicePixelRatio` con media-query se rearma en cada cambio (`ThreeRenderer.ts:338`, equivalente en `Scene`) para que arrastrar entre pantallas o un zoom dispare un `resize` real.

Los bitmaps pre-rasterizados deben asentarse sobre esto:

- `GlyphRasterAtlas` y `TextRasterCache` rasterizan a un `dpr` de tiempo de construcción (`GlyphRasterAtlas.ts:174`, `TextRasterCache.ts:88`) pero sus claves de búsqueda históricamente lo omitían (`forge 2026-08-25`): reutilizar un atlas a través de un cambio de DPR servía bitmaps de densidad obsoleta bajo claves idénticas y los hacía blit remuestreados (borrosos). El contrato de la doc dice "un atlas está claveado por DPR y se reemplaza al cambiar" — la seguridad depende de la disciplina del llamante a menos que la clave pliegue el DPR.
- `SplineEntity.bake` una vez leyó `window.devicePixelRatio` crudo (`SplineEntity.ts:433` pre-corrección) mientras su blit iba a un contexto limitado por `maxDPR` — un bitmap sobre-resuelto reducido cada frame. Corregido para leer `renderer.pixelRatio` en tiempo de render y re-hornear al cambiar (`SplineEntity.ts:504`).

## Culling del viewport

`Scene` descarta estrictamente contra el viewport: una entidad cuya _caja de relleno_ está completamente fuera del viewport se omite (`Scene.ts:7254` traza de cull). Dos refinamientos:

- **Inflado por trazo.** `Circle.getBounds()` / `Rect.getBounds()` ahora inflan por `strokeWidth/2` cuando hay trazo (`Circle.ts:67`, `Rect.ts:54`, corregido en `@vectojs/core@2.18.3` CTX-0261). Antes, un trazo grueso en el borde del viewport perdía hasta la mitad de su ancho. El seguimiento `-0` (`-inflation` negando `0`) necesitó una negación solo-positiva (`forge 2026-08-08` entrada `-0`).
- **Culling consciente de clip** (`Scene.ts:4335`). `projectionBoxVisible` intersecta el viewport con el AABB de cada ancestro `clipChildren`; contenido fuera de viewport pero clippeado dentro se virtualiza (boss 03). Un overlay sin límites de viewport completo intencionalmente nunca se clippea (`Scene.ts:4238`).

## Batching y economía de draw calls

| ruta                          | mecanismo                                                              | tope / coste                                                                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fillCircle` (Canvas2D)       | ejecución mismo color, mismo alpha → un path, un `fill()` en `flush()` | `MAX_BATCH = 64` (`CanvasRenderer.ts:88`) — superlineal más allá                                                                                                                 |
| `fillCircle` (SVG)            | un `<path d="… A … A …">` por flush                                    | sin coste GPU, tamaño DOM                                                                                                                                                        |
| `fillCircle` (WebGL/Three)    | quads instanciados / `CircleGeometry`                                  | casi constante; solo importa el flush                                                                                                                                            |
| `drawImage` / `drawImageRect` | ninguno — `drawImage` / `<image>` inmediato                            | atlas (`GlyphRasterAtlas`) mantiene una textura fuente; fuentes por canvas de `TextRasterCache` midieron **0,87×** (línea base `fillText`) a 40k celdas vs **~2×** para el atlas |

`CanvasRenderer.flush` (`CanvasRenderer.ts:414`) restaura `globalAlpha` desde su valor previo al lote (no `1`) y actualiza `_cachedFill` al color del lote — de lo contrario el siguiente `fill('red')` con caché obsoleta omite la asignación y pinta el color del lote. Un lote pendiente se consolida antes de `drawImage`, `beginPath`, `save`/`restore`, `clip`, `fill`, `stroke` y `fillText`.

`ThreeRenderer.flush` (`ThreeRenderer.ts:957`) _solo_ marca `frameDirty`. El render GL real es `present()` (`ThreeRenderer.ts:968`), llamado una vez por `Scene` al final del frame; sin esto, `O(N)` flushes costarían `O(N²)` renders. Builds antiguos de `Scene` que nunca llaman a `present()` están cubiertos por un fallback de microtarea.

Específico de WebGL: `setTexture` ahora consolida el lote de sprites antes de `texImage2D` cuando la fuente cambia (`WebGLPointRenderer.ts:974`, corregido en `@vectojs/core@2.18.3`), reflejando `setMSDFTexture`. El coste de `ctx.filter = 'blur()'` se difiere a la _siguiente_ lectura de píxeles (`forge 2026-07-18` entrada `ctx.filter`) — aplica blur a mitad de resolución cuando sea posible.

## Rutas de rasterización de texto

`fillText` es conformado CPU + parseo de color + rasterización a hasta 5 000 llamadas/frame; la GPU queda ociosa (`(program)` domina). Dos cachés opt-in convierten conformado en blits:

- `GlyphRasterAtlas` (`GlyphRasterAtlas.ts:1`) — un canvas, slots empaquetados en estante, sub-rects `drawImageRect`. Para conjuntos monoespaciados acotados (grilla de código, terminal). Necesita `drawImageRect`; `SVGRenderer` no es objetivo.
- `TextRasterCache` (`TextRasterCache.ts:1`) — un canvas pequeño por ejecución `(font, color, text)`, blit `drawImage`. Para conjuntos de frases acotados (danmaku 395 codepoints → un atlas MSDF `≤1024²`). Ambos acotan memoria (estante del atlas + contador de reset, `maxEntries` de la caché con desalojo 10% en orden de inserción) y retroceden a `fillText` sin cabeza. El muro de 5 000 danmaku _no_ era conformado sino conteo de draws + overdraw: intercambiar `fillText→drawImage` no cambió nada; agrupar glifos en ~1 draw WebGL vía `MSDFTextEntity` / `pointRenderer.addGlyph` lo movió de `~28 fps` → `~130 fps` (`forge 2026-07-20` corrección, `bakudan` v0.5).

La ruta de texto de Three rasteriza a `dpr` (`ThreeRenderer.ts:747`) y clavea la caché de texturas en `dpr|font|color|text|gradient-definition` más, para degradados, la fase `x,y` redondeada (`ThreeRenderer.ts:806`). El tamaño de fuente se parsea con `parseFontSize` (`ThreeRenderer.ts:274`), _no_ `parseInt` — el shorthand de estilos pone el peso primero (`'700 16px Inter'`) así que `parseInt` ingenuo leyó `700`. Línea base: la línea base alfabética aterriza en `y`; el centro de `PlaneGeometry` de Three se desplaza por `-fontSize + h/2` (`ThreeRenderer.ts:831`).

## Cableado de Scene (dónde se configuran los controles del renderer)

```text
Scene.ts:226  SceneOptions.pointBackend: 'canvas' | 'webgl'   (glyphs/sprites)
Scene.ts:233  SceneOptions.particleBackend: 'auto'|'webgpu'|'cpu' (compute particles)
Scene.ts:286  SceneOptions.maxDPR               → syncs to pr.maxDPR on every resize
Scene.ts:398  SceneOptions.renderMode: 'always' | 'onDemand'
Scene.ts:1142 Scene.renderMode + DirtyTracker + RenderScheduler (maxFPS / autoThrottle)
Scene.ts:2284 full-window viewport adoption (once) + disableWindowResize
Scene.ts:2781 clientToScene viewport mapping
```

- **`pointBackend` vs `particleBackend` son funcionalidades distintas** (`forge 2026-08-26`). `pointBackend: 'webgl'` agrupa quads de glifos/sprites; `particleBackend: 'webgpu'` acciona `WebGPUParticleSystemManager` para `ComputeParticleEntity`. No existe ruta de glifos/MSDF WebGPU; cambiar `particleBackend` no hace nada para danmaku.
- **`WebGPUParticleSystemManager` es opt-in vía un static** (`forge 2026-08-02`): `Scene.registerWebGPUParticleSystemManager(...)`. En `'auto'` por defecto sin registro no hay throw ni `console.warn` — el fallback CPU corre mientras `initWebGPUContext` aún asigna un canvas apilado sin uso.
- **`renderMode: 'always'`** (por defecto) acciona un bucle rAF continuo; `autoThrottle` lo baja a `idleFPS` cuando está estático. **`'onDemand'`** pinta solo tras `markDirty()` o un tick de animación/física activo. `render()` en sí renderiza incondicionalmente — `renderMode` solo afecta al planificador del bucle (`Scene.ts:3405`).

## Trampas conocidas (con file:line)

| trampa                                                                                                                          | dónde                                                                                          | estado                                               |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Relleno even-odd no expresable (`IRenderer.fill` no tiene `fillRule`)                                                           | `IRenderer.ts:287`, forge 2026-07-18                                                           | abierto                                              |
| Sin primitiva de sombra/brillo (`shadowBlur` ausente; coste `ctx.filter` blur diferido)                                         | `IRenderer.ts:159` pistas, forge 2026-07-18 / 2026-08-25                                       | abierto                                              |
| Sin blur/material de fondo para muestreo de wallpaper                                                                           | forge 2026-08-25                                                                               | abierto (stretch)                                    |
| Claves de raster de Glyph/Text omiten DPR — bitmaps de densidad obsoleta tras cambio de DPR                                     | `GlyphRasterAtlas.ts:174`, `TextRasterCache.ts:88`, forge 2026-08-25                           | abierto (contrato=el llamante debe reemplazar atlas) |
| `WebGPUParticleSystemManager` requiere static `Scene.register…`; fallback CPU silencioso en `'auto'`                            | `Scene.ts:256` puerta de registro, forge 2026-08-02                                            | abierto                                              |
| Espacios de coordenadas de partículas CPU vs GPU discrepan (ventana vs local)                                                   | `WebGPUParticleSystemManager.ts:310`, `ComputeParticleEntity.ts`, forge 2026-08-02 relacionado | compensado a nivel de app                            |
| Backing-store dimensionado a DPR de ventana en lugar de `appliedDPR` limitado                                                   | `CanvasRenderer.ts:244`, `ThreeRenderer.ts:318`, `SplineEntity.ts:504`                         | corregido                                            |
| `resize` dejó cachés de fuente/relleno obsoletas tras reset de contexto                                                         | `CanvasRenderer.ts:258`, forge 2026-08-13 `CanvasRenderer.resize`                              | corregido #463                                       |
| `flush` mutó `fillStyle`/`globalAlpha` sin actualizar cachés                                                                    | `CanvasRenderer.ts:414`, forge 2026-08-13                                                      | corregido #469                                       |
| `parseColorToRGBA` retornó parseo previo con entrada inválida                                                                   | `renderer/colorParse.ts:60`, forge 2026-08-13                                                  | corregido #492                                       |
| `SplineEntity.bake` usó `window.devicePixelRatio` crudo                                                                         | `SplineEntity.ts:433` pre-corrección, forge 2026-08-13                                         | corregido #492                                       |
| `WebGLPointRenderer.setTexture` omitió flush de lote                                                                            | `WebGLPointRenderer.ts:974`, forge 2026-08-13                                                  | corregido #520                                       |
| `ThreeRenderer.fillText` parseó peso como tamaño; línea base desplazada `fontSize/2`                                            | `ThreeRenderer.ts:274`, `:831`, forge 2026-08-13 / #486                                        | corregido #511                                       |
| Ortho espejado descartó rellenos/círculos/degradados `FrontSide`                                                                | `ThreeRenderer.ts:250`, forge 2026-08-13                                                       | corregido #519                                       |
| `drawImage` volteado verticalmente (`flipY = true`) en cámara y-down                                                            | `ThreeRenderer.ts:478`, forge 2026-08-23 #603                                                  | corregido #613                                       |
| Trazos hairline (`LineBasicMaterial.linewidth` ignorado); DPR ignorado; contexto GL fugado; degradados >8 paradas remuestreados | `ThreeRenderer.ts:110` ribbon, `:307`, `ThreeRenderer.ts:1044` dispose, forge 2026-08-23 #604  | corregido #623                                       |
| `getBounds()` excluyó trazo → culling recortó `strokeWidth/2`                                                                   | `Circle.ts:67`, `Rect.ts:54`, forge 2026-08-08                                                 | corregido 2.18.3                                     |
| Artefacto `-0` de `getBounds()` consagrado en tests                                                                             | forge 2026-08-08 entrada `-0`                                                                  | corregido 2.18.3                                     |

## Checklist antes de enviar un cambio de renderer

1. **Lee `pixelRatio`, no `window.devicePixelRatio`.** Si rasterizas una textura que se hará blit, clavea la caché en `renderer.pixelRatio` y re-rasteriza tras `resize`.
2. **DoubleSide y unflip.** Bajo el orto y-down, cada `Mesh`/`PlaneGeometry` necesita `side: DoubleSide` y `texture.flipY = false` (`ThreeRenderer.ts:596`, `:478`).
3. **Cachés conscientes de flush.** Cualquier ruta que mute `fillStyle` o `globalAlpha` debe actualizar la caché correspondiente; cualquier cosa que resetee el contexto debe descartarla (`CanvasRenderer.ts:258`).
4. **Respeta el lote.** No intercale un draw no loteado entre `fillCircle`s del mismo estilo si quieres que coalescan; haz `flush()` antes de cambios de scissor/textura/alpha.
5. **Clip tiene tres lugares.** `clip()` del renderer para pintados, `clipChildren` para hit/A11y/contenido (`Scene.ts:254`, `:4335`), y banda de viewport para virtualización. Cambiar uno sin auditar los otros dos es un bug.
6. **Perfila a DPR real.** `maxDPR: 2` no es garantía de rendimiento para pases con mucho trazo — mide a DPR nativo en hardware real con `benchmarks/run-browsers.sh` (ambos motores, con cabeza).

## Relaciones

- **Boss 03 (proyección y virtualización)** posee `clipChildren` y la política `projectionBoxVisible` / nivel de contenido que el culling de este boss refleja.
- **Boss 06 (runtime del VMT)** posee `Scene.render`, la política `RenderScheduler` / `DirtyTracker` y el `worldMatrix` que cada renderer consume.
- **Boss 02 (texto/layout)** posee las métricas que este boss rasteriza. **Boss 09 (Three/XR)** reutiliza cada trampa de este doc — trazos en cinta, clips scissor, DPR y DoubleSide son su kit inicial. **Boss 08 (WASM)** reutiliza los mismos valores de viewport y DPR de `Scene`; una vista de typed-array obsoleta tras crecimiento de memoria es la versión de este boss de una caché de raster obsoleta.

---

_Serie: 00 Overview → 01 Selection → 02 Text+Layout → 03 Projection+Virtualization → 04 Streaming Markdown → 05 TeX → 06 Runtime del VMT → **07 Renderer** → 08 WASM G1/G2/G3 → 09 Three/XR → 10 Video Export → 11 Graph Layout → 12 DevTools → 99 Synthesis._
