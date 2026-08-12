+++
title = "Referencia de la API de @vectojs/core"
description = "Descripción general y mapa de puntos de entrada para el motor de renderizado zero-DOM detrás de Vecto — Scene, Entity, renderizadores, partículas y a11y en core, más los motores independientes @vectojs/text, @vectojs/layout, @vectojs/math y @vectojs/animation que core reexporta."
weight = 1
+++

# Referencia de la API de `@vectojs/core`

El motor de renderizado zero-DOM detrás de Vecto. Una `Scene` posee un árbol de nodos `Entity`
(el **Virtual Math Tree**), impulsa un bucle `requestAnimationFrame`, pinta
a través de un `IRenderer` agnóstico al backend (Canvas 2D por defecto) y proyecta una
capa sombra ARIA/automatización transparente para que el canvas siga siendo accesible y
manejable por agentes.

> Esta página y sus subpáginas se generan a partir del `.d.ts` publicado (superficie
> pública) y del código fuente de `packages/core/src` (comportamiento). Las firmas aquí
> anulan cualquier cosa en las guías narrativas `docs/usage/*` — en particular el
> constructor real es `new Scene(canvasElement, options)`, **no** la
> forma `{ canvasId }` que muestra algo de prosa anterior.

## Páginas de referencia

Cada área a continuación tiene su propia página enfocada — firmas, problemas, y un
pie de página "Relacionados" que enlaza lateralmente con las demás:

| Área                                                       | Cubre                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`Scene`](/reference/core-scene/)                          | Constructor, `SceneOptions`, campos públicos, `renderMode`/`maxFPS`/aceleración por inactividad, métodos del ciclo de vida, registro de backends. |
| [`Entity`](/reference/core-entity/)                        | El nodo abstracto del VMT: transformaciones, sistema de animación, eventos de captura/burbuja, hooks de a11y/agrupación.                          |
| [Motor de disposición](/reference/core-layout/)            | La división frío/caliente de `LayoutEngine`, memoización en streaming, texto enriquecido, formas de exclusión.                                    |
| [Renderizadores](/reference/core-renderer/)                | `IRenderer`, `CanvasRenderer`, `SVGRenderer`, la capa WebGL de puntos/rects/sprites/MSDF, proyección de contenido, `parseColorToRGBA`.            |
| [`ComputeParticleEntity`](/reference/core-particles/)      | La capa de partículas de alto rendimiento: diseño de memoria, simulación en CPU, WebGPU vs CPU.                                                   |
| [Texto y Bidi](/reference/core-text/)                      | `MSDFFont`, `MSDFTextEntity`, `TextEntity`/`GridTextEntity`, conformado árabe + resolvedor bidi.                                                  |
| [Otras entidades](/reference/core-entities/)               | `SplineEntity`, `DOMPortalEntity`, `SVGEntity`.                                                                                                   |
| [Utilidades matemáticas](/reference/core-math/)            | `SpatialHashGrid`, `SpringPhysics`.                                                                                                               |
| [Animación](/reference/animation/)                         | El motor independiente `@vectojs/animation`: `TweenDriver`/`SpringDriver`, `MotionConfig`, curvas de easing.                                      |
| [Estilos](/reference/styles/)                              | La capa independiente `@vectojs/styles`: objetos de estilo con nombres CSS, temas de tokens `var()`, cambio con `setTheme`, fusión con `css()`.   |
| [a11yRoot y el contrato del agente](/reference/core-a11y/) | La proyección sombra-DOM, `A11yAttributes`, problemas de sincronización.                                                                          |

## Puntos de entrada y mapa de módulos

Los motores de disposición, shaping de texto, matemática y animación se publican
como sus propios paquetes independientes. `@vectojs/core` **depende de y reexporta**
todos ellos, así que cada importación de abajo aún se resuelve desde `@vectojs/core`
(y desde las subrutas compatibles con tree-shaking). Importa directamente de los
paquetes independientes cuando quieras una superficie de dependencias más pequeña
sin el runtime del grafo de escena.

`@vectojs/core` envía un punto de entrada principal con efectos secundarios más tres
subrutas compatibles con tree-shaking, junto a los cuatro paquetes independientes:

| Importación              | Contenidos                                                                                                                                                                                            | Efecto secundario                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `@vectojs/core` (`.`)    | Todo: `Scene`, `Entity`, todas las entidades, renderizadores, más los motores reexportados de disposición, texto, matemática y animación.                                                             | Al importar, registra automáticamente **ambos** backends conectables (renderizador de puntos WebGL + gestor de partículas WebGPU). |
| `@vectojs/core/layout`   | Reexporta `@vectojs/layout`: `LayoutEngine`, `PreparedText`, `createCanvasMeasurer`, `LayoutResultBuffer`, `LayoutWorkerManager`, `computeLineSegments`, tipos de disposición.                        | Ninguno.                                                                                                                           |
| `@vectojs/core/renderer` | `IRenderer`, `CanvasRenderer`, `SVGRenderer`, `PointRenderer`, `createWebGLPointRenderer`, `WebGPUParticleSystemManager`, `parseColorToRGBA`, `RGBA`.                                                 | Ninguno.                                                                                                                           |
| `@vectojs/core/text`     | Reexporta `@vectojs/text` más los residentes en core `MSDFTextEntity`/`SVGEntity`: `MSDFFont`, `ArabicShaper`, `BidiResolver`, `Typography`, `prepareContentGrid`, `PreparedContentGrid`, tipos MSDF. | Ninguno.                                                                                                                           |
| `@vectojs/text`          | Primitivas independientes de shaping de texto: `BidiResolver`, `ArabicShaper`, `Typography`, `MSDFFont`, `prepareContentGrid`, `PreparedContentGrid`. Paquete hoja (solo `bidi-js`).                  | Ninguno.                                                                                                                           |
| `@vectojs/layout`        | Motor de disposición independiente: `LayoutEngine`, `LayoutWorkerManager`, `createCanvasMeasurer`, auxiliares de medición. Depende de `@vectojs/text`.                                                | Ninguno.                                                                                                                           |
| `@vectojs/math`          | Matemática espacial/física independiente: `SpatialHashGrid`, `SpringPhysics`. Paquete hoja.                                                                                                           | Ninguno.                                                                                                                           |
| `@vectojs/animation`     | Easing + drivers independientes: `Easing`, `TweenDriver`, `SpringDriver`. Depende de `@vectojs/math`.                                                                                                 | Ninguno.                                                                                                                           |

**Problema:** el registro automático de backends solo vive en el punto de entrada `.`
(`Scene.registerWebGLPointRendererCreator(createWebGLPointRenderer)` y
`Scene.registerWebGPUParticleSystemManager(WebGPUParticleSystemManager)` se ejecutan al
importar). Si construyes una `Scene` después de importar solo subrutas, registra los
backends tú mismo o `pointBackend: 'webgl'` / las partículas WebGPU caerán
silenciosamente en modo degradado. Ver [`Scene`](/reference/core-scene/) para la API de registro.

## Páginas recomendadas del sitio de documentación (core)

- **Aprender / Conceptos básicos** — Scene, el Virtual Math Tree, el bucle de renderizado,
  `IRenderer`, modelo zero-DOM.
- **Aprender / Modos de renderizado y rendimiento** — `always` vs `onDemand`, `maxFPS`, el
  acelerador por inactividad a 2 fps y la regla de `markDirty()` entre fotogramas, movimiento reducido.
- **Aprender / Construir una Entity personalizada** — `isPointInside`/`render`, transformaciones,
  recorte por `getBounds`, los caminos rápidos `getBatchCircle`/`getBatchRect`.
- **Aprender / Eventos y hit-testing** — captura/burbuja, `VectoJSEvent`,
  `findEntityAt`, `change`/IME de controles de formulario.
- **Aprender / Accesibilidad y automatización** — el contrato sombra-DOM,
  agentes basados en `getByRole`, `debugA11y`, limitación.
- **Aprender / Texto y tipografía** — la división frío/caliente de `LayoutEngine`, memoización
  en streaming, texto MSDF, exclusiones/ajuste de línea, bidi.
- **Aprender / Partículas** — `ComputeParticleEntity`, WebGPU vs CPU, el diseño
  de 8 flotantes, `resize()` primero.
- **Referencia / API** — las subpáginas anteriores (Scene, Entity, motor de disposición,
  renderizadores, partículas, texto, utilidades matemáticas, contrato a11y).
- **Referencia / Registro de backends** — backends conectables WebGL/WebGPU, cubiertos
  bajo [`Scene`](/reference/core-scene/#registro-de-backends-conectables-estático).
