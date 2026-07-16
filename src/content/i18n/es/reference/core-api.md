---
title: 'Referencia de la API de @vectojs/core'
description: 'Descripción general y mapa de puntos de entrada para el motor de renderizado zero-DOM detrás de Vecto — Scene, Entity, disposición, renderizadores, partículas, texto y utilidades matemáticas, cada uno con su propia página de referencia enfocada.'
order: 1
---

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
| [a11yRoot y el contrato del agente](/reference/core-a11y/) | La proyección sombra-DOM, `A11yAttributes`, problemas de sincronización.                                                                          |

## Puntos de entrada y mapa de módulos

`@vectojs/core` envía un punto de entrada principal con efectos secundarios más tres
subrutas compatibles con tree-shaking:

| Importación              | Contenidos                                                                                                                                            | Efecto secundario                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `@vectojs/core` (`.`)    | Todo: `Scene`, `Entity`, todas las entidades, renderizadores, disposición, texto.                                                                     | Al importar, registra automáticamente **ambos** backends conectables (renderizador de puntos WebGL + gestor de partículas WebGPU). |
| `@vectojs/core/layout`   | `LayoutEngine`, `PreparedText`, `createCanvasMeasurer`, `LayoutResultBuffer`, `LayoutWorkerManager`, `computeLineSegments`, tipos de disposición.     | Ninguno.                                                                                                                           |
| `@vectojs/core/renderer` | `IRenderer`, `CanvasRenderer`, `SVGRenderer`, `PointRenderer`, `createWebGLPointRenderer`, `WebGPUParticleSystemManager`, `parseColorToRGBA`, `RGBA`. | Ninguno.                                                                                                                           |
| `@vectojs/core/text`     | `MSDFFont`, `MSDFTextEntity`, `SVGEntity`, `ArabicShaper`, `BidiResolver`, `prepareContentGrid`, `PreparedContentGrid`, tipos MSDF.                   | Ninguno.                                                                                                                           |

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
  bajo [`Scene`](/reference/core-scene/#pluggable-backend-registry-static).
