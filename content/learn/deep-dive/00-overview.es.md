+++
title = "00 — Visión general: Los dieciséis desafíos de VectoJS"
description = "Una guía de navegación por los dieciséis desafíos de profundización de VectoJS: el mapa de desafíos, las invariantes de arquitectura, las dependencias entre paquetes y las rutas de lectura para cada recién llegado."
weight = 20
+++

# 00 — Visión general: Los dieciséis desafíos de VectoJS

## El mapa de desafíos

VectoJS reimplementa responsabilidades del navegador sobre un único `<canvas>`: layout, hit-testing, despacho de eventos, conformado de texto, clipping, scroll, accesibilidad y renderizado — todo a partir de aritmética explícita sobre un árbol de entidades retenido. Esta serie de dieciséis partes traza los desafíos más difíciles del framework; cada uno cubre un subsistema que el DOM antes te daba gratis y que VectoJS ahora debe clavar con precisión. No necesitas abordarlos en orden, pero sí conocer el mapa antes de elegir por dónde empezar.

Este documento es ese mapa.

- **Qué aprenderás aquí**: la arquitectura del runtime en una sola imagen, el esqueleto de dependencias entre paquetes, qué invariante pone a prueba cada desafío, cómo elegir un orden de lectura y dónde se sitúan estos deep-dives respecto a los docs existentes en `content/learn/*` y `content/reference/*`.
- **Qué no aprenderás**: la mecánica de ningún desafío en particular. Cada deep-dive especializado se ocupa de un desafío. Esta visión general te enlaza hasta allí y te da lo justo para llegar orientado.

## Arquitectura de un vistazo

```text
            Application state
                   │
                   ▼
         ┌─────────────────────┐
         │  Virtual Math Tree  │   Entity tree: transforms, bounds, events,
         │  (Scene + Entities) │   dirty/invalidation, worldMatrix. packages/core/tree/Scene.ts:1107
         └─────────┬───────────┘
                   │  dirty, transforms, culling
         ┌─────────▼───────────┐
         │  Layout  / HitTest  │   LayoutEngine (@vectojs/layout), HitTester (@vectojs/core),
         │  / Animation        │   Tween/Spring drivers (@vectojs/animation), physics (@vectojs/math)
         └─────────┬───────────┘
                   │  draw calls / glyph quads / animation frames
         ┌─────────▼───────────┐         ┌──────────────────────────┐
         │   Canvas + GPU      │         │   Thin DOM projection    │
         │  Canvas2D (default) │         │  a11y shadow elements:   │
         │  WebGL  / WebGPU    │◄───────►│  getA11yAttributes(),    │
         │  SVG / Three.js     │  sync   │  a11yProjection modes,   │
         └─────────────────────┘         │  syncA11y walk           │
                                         └──────────────────────────┘
                   │                              │
                   ▼                              ▼
              Visible pixels              Screen readers, IME, Playwright,
                                         copy/find, AT automation
```

La fuente de píxeles es siempre el canvas. El DOM aporta **solo semántica e input nativo**; no renderiza la escena visible. Los dos mundos se mantienen sincronizados mediante un recorrido en profundidad (`Scene.syncA11y` / `ContentProjectionManager`, ver `packages/core/src/tree/scene/A11yProjectionManager.ts:30`) que se ejecuta tras el layout y antes de presentar un frame.

Ya existen representaciones de referencia de imágenes cercanas en la documentación: [Arquitectura del runtime](/learn/runtime-architecture/) y [Conceptos del motor](/learn/engine-concepts/) (diagrama central del VMT). Este diagrama de texto es intencionadamente referenciable desde código e imprimible.

## Esqueleto de dependencias entre paquetes

Motores hoja primero, composición hacia arriba. El grafo es acíclico; las flechas significan "importa de en tiempo de compilación":

```text
  @vectojs/text ─┐
                 ├─► @vectojs/layout ─┐
  @vectojs/math ─┤                    │
                 └─► @vectojs/animation├─► @vectojs/core ─┬─► @vectojs/ui ─┬─► @vectojs/markdown
                                                          │                  └─► @vectojs/markdown-app
                                                          ├─► @vectojs/styles
                                                          ├─► @vectojs/table / @vectojs/node-editor
                                                          │
                                   @vectojs/tex ──────────┤  (consumed by markdown; public API)
                                                          │
           @vectojs/graph-layout ─► @vectojs/graph3d ─────┤  (@vectojs/knowledge-graph above graph3d)
           @vectojs/three / @vectojs/devtools /            │
           @vectojs/video-exporter / @vectojs/desktop      ┘  (host apps atop core+ui)

  crates/vectojs-core-rs (Rust → wasm32)  — invisible accelerator behind @vectojs/core
```

Verificado contra las dependencias de `packages/*/package.json` (`text`/`math`/`graph-layout`/`tex` tienen cero dependencias `@vectojs/*`; `layout→text`, `animation→math`, `core→{layout,text,math,animation}`, `markdown→{ui,tex,core}`). La compilación respeta este orden (`package.json:14`). Los tests crean alias de los paquetes hermanos hacia `src/` vía `vitest.config.ts`, por lo que el orden gobierna la emisión de `.d.ts`, no la ejecución de los tests.

Dos trampas para consumidores a vigilar al trazar dependencias: rutas espurias bajo `references/` están hardcodeadas en `packages/tex/scripts/vendor-katex.ts` (`--source`) y `scripts/compare-pretext.ts` (`VECTO_PRETEXT_PATH`) — mover ese árbol las rompe silenciosamente (según `AGENTS.md`).

## Los dieciséis desafíos de un vistazo

16 documentos en total: esta visión general (00) más 15 desafíos especializados (01–15). La dificultad mide el esfuerzo necesario para equivocarse, no el volumen de código. "Primera lectura" es la ruta más rápida hacia trabajo _útil_ con VectoJS; "prerrequisito profundo" señala los otros desafíos que deberías leer antes de abordar este.

| #   | Desafío (deep-dive)                                                          | Paquete(s)                                                                    | Dificultad | Quién debería leer esto                                     | Prerrequisito profundo | Primera lectura para…                               |
| --- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------- | ---------------------- | --------------------------------------------------- |
| 00  | **Visión general y navegación** (este doc)                                   | — (meta)                                                                      | ☆          | Todos, primera parada                                       | —                      | orientación                                         |
| 01  | **Selección nativa en canvas** — sincronización de dos mundos                | `core` (`ContentGridProjector`, `ContentProjectionManager`), `text`, `layout` | ★★★★       | Texto/selección/IME, copiar/buscar/traducción               | 02                     | texto seleccionable, terminales, editores de código |
| 02  | **Texto y Layout** — Unicode/BiDi/conformado/排版                            | `text`, `layout`, `core/text`                                                 | ★★★★       | Motor de layout, i18n, tipografía                           | —                      | cualquier texto más allá de ASCII                   |
| 03  | **Proyección semántica + virtualización** — ciclo de vida de materialización | `core/a11y`, `ui`, `markdown`, `table`                                        | ★★★        | a11y, virtualización, docs densos                           | 06                     | docs extensos, listas, dashboards                   |
| 04  | **Markdown en streaming** — reconciliación incremental                       | `markdown`, `ui`, `layout`                                                    | ★★★        | UI de streaming/LLM                                         | 02                     | lectores de chat/streaming                          |
| 05  | **TeX sin DOM** — layout y emisión SVG                                       | `tex`                                                                         | ★★★        | Renderizado de matemáticas                                  | 02                     | fórmulas en Markdown                                |
| 06  | **Runtime del VMT** — dirty/invalidación/ciclo de vida/eventos               | `core/tree`, `core/layout`, `core`                                            | ★★★★       | Ciclo de vida de Scene/Entity, despacho de hit, rendimiento | —                      | entidades personalizadas, depuración de rendimiento |
| 07  | **Renderizador** — consistencia de coordenadas/clipping/DPR                  | `core/renderer`, `core/performance`                                           | ★★★        | Multi-backend, HiDPI, culling                               | 06                     | trabajo con canvas/WebGL/WebGPU                     |
| 08  | **Triple WASM — G1/G2/G3** — aceleración bit-idéntica                        | `crates/vectojs-core-rs`, `math`, `animation`, `graph-layout`, `core/wasm`    | ★★★        | Rendimiento, paridad Rust↔JS                                | 06, 07                 | presupuestos de frame a escala                      |
| 09  | **Puente Three.js / XR** — dos mundos de coordenadas                         | `three`, `graph3d`                                                            | ★★         | Paneles 3D, XR                                              | 06, 07                 | VectoJS dentro de Three.js                          |
| 10  | **Exportación de vídeo determinista** — reloj de paso fijo                   | `video-exporter`                                                              | ★★         | Captura offline, replay                                     | 06                     | grabación de pantalla, exportación de simulación    |
| 11  | **Layout de grafos** — force-directed + WASM                                 | `graph-layout`, `graph3d`, `knowledge-graph`                                  | ★★         | Visualización de grafos, ajuste de layout                   | 06, 08                 | grafos de red/conocimiento                          |
| 12  | **DevTools** — introspección y auditoría en runtime                          | `devtools`, `core` (`frameStats`, `syncA11y`)                                 | ★          | Depuración, auditoría CI                                    | 06                     | "por qué esta entidad está aquí"                    |
| 13  | **Estilos y temas** — paridad CSS en el VMT numérico                         | `styles`, `core`                                                              | ★★         | Estilos, temas y migración desde CSS                        | 06                     | tokens y cambio de tema                             |
| 14  | **Layout responsive e interacción** — adaptación al viewport y la entrada    | `core`, `ui`, `layout`                                                        | ★★★        | Autores de apps y layouts responsive                        | 03, 06                 | UI Canvas adaptativa                                |
| 15  | **Apps verticales** — composición de grafos, editor, escritorio y tabla      | `knowledge-graph`, `node-editor`, `desktop`, `table`                          | ★★★        | Autores de producto e integraciones                         | 06                     | composición de primitivas del motor                 |

Notas de ordenación:

- 02 y 06 son las dos mejores "segundas lecturas" tras 00 si debes elegir dos — la mayoría de los otros desafíos asumen uno de ellos.
- 03 se apoya en la maquinaria de dirty/ciclo de vida de 06; 04 se apoya en el conformado/layout de 02; 07 y 08 se apoyan ambos en 06 y por tanto se agrupan de forma natural después de él.
- La dificultad de 08 no es la sintaxis de Rust sino el **contrato de fallback bit-idéntico** y su trampa de compilación (`RUSTFLAGS` en `crates/vectojs-core-rs/build.sh`).
- El tracker del equipo ya secuencia `CTX-0566→…→CTX-0578→CTX-0579`; la tabla de arriba es el orden de lectura, que puede diferir del orden de compilación/lanzamiento.

## Tres invariantes que gobiernan cada desafío

Cada desafío puede romper una de ellas. Si no recuerdas nada más, recuerda las invariantes.

### 1. Invariante del ciclo de vida del VMT

> El **flag dirty, worldMatrix y la lista de hijos** de una entidad coinciden tras cada paso de `Scene`.

Síntoma al romperse: bounds obsoletos tras `remove(child)` sin desregistro del driver (`Entity:1582`), hit targets fantasma tras un `markDirty` parcial, transformaciones que divergen entre JS y el almacén SoA de WASM (`crates/vectojs-core-rs/src/*.rs`, G1). Guarda: contrato `Scene.ts:532` `renderMode` / `DirtyTracker.ts:33`, recorrido `DriverTicker.ts:40`, contrato de subclase `Entity.ts:782`. El 90 % de los "glitches de renderizado misteriosos" vienen de aquí.

### 2. Invariante de paridad de dos mundos

> Cada entidad **interactiva visible** tiene una **contraparte a11y sincronizada** cuya geometría, rol/nombre/estado y enrutamiento de foco/puntero coinciden con la verdad del canvas.

Síntoma al romperse: Playwright `getByRole` no encuentra nada, los lectores de pantalla anuncian texto obsoleto, los clics golpean la entidad equivocada, el IME aterriza en la caja equivocada. Guarda: `Entity.ts:295` `A11yAttributes`, modos `Entity.ts:968` `a11yProjection` (`eager`/`onDemand`/`never`), `Entity.ts:1937` `getA11yAttributes()` por defecto, el recorrido compartido `syncA11y` (`A11yProjectionManager.ts:30`, `ContentProjectionManager.ts:26`), e invalidación de memo obsoleto en `A11yProjectionManager.ts:227`. La materialización `onDemand` y la virtualización del viewport son las partes difíciles (desafío 03) — ahí es donde viven la mayoría de los bloqueos reales de VectoJS.

### 3. Invariante de métricas de texto

> **Medir una vez, componer muchas** — y medir con la fuente **real**, en el contexto **correcto**, al **DPR adecuado**.

Síntoma al romperse: el texto se desplaza respecto a su hit box, las bandas de selección se desalinean una línea, los huecos subpíxel CJK se pintan como líneas blancas, el fallback de web-font cambia silenciosamente los avances, el zoom por DPR desenfoca un subsistema pero no el otro. Guarda: `packages/text/src/fontMetrics.ts:82` `registerFontMetrics`, `packages/text/src/Typography.ts:111` `ctx.measureText('Mg')` con fallback DOM-free a 0.5em, calibración del contexto de medida `packages/text/src/measureContext.ts:12`, división frío/caliente de `LayoutEngine` en `packages/layout/src/LayoutEngine.ts:808` y memoización de párrafos. Cada desafío que toca texto (01, 02, 04, 05) reentra en esta invariante desde un ángulo distinto.

Mantén estas tres como checklist durante la revisión: antes de aprobar cualquier cambio, pregunta "¿qué invariante podría romper esto y dónde se manifestaría primero?".

## Cómo se relacionan estos deep-dives con la documentación existente

| Documentación existente                                                                                                              | Deep-dives (esta serie)    | Relación                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content/learn/*` (introduction, runtime-architecture, engine-concepts, text-typography, core-scene, accessibility, streaming, etc.) | 00–15                      | **Learn enseña a _usar_ VectoJS**; los deep-dives enseñan **cómo _funciona por dentro_ VectoJS** en ese uso. Leer primero un capítulo de learn abarata el desafío correspondiente. Pares sugeridos: `text-typography` → desafío 02; `core-scene` + `events` → desafío 06; `accessibility` → desafío 03; `streaming` → desafío 04. |
| `content/reference/*` (core-a11y, core-entities, core-layout, core-text, ui-markdown, three-adapter, graph-layout, etc.)             | 00–15                      | **Reference es la verdad de la API** (props, tipos, sub-rutas). Los deep-dives citan páginas de referencia pero no las repiten. En caso de duda, gana la firma de referencia.                                                                                                                                                     |
| `forge/findings/*` + `forge/baselines/*`                                                                                             | apéndice de cada deep-dive | Los findings son las **notas de campo**; los baselines son la **evidencia medida**. Los deep-dives sintetizan findings en una única narrativa por desafío y enlazan de vuelta a las entradas `file:line` que sustentan cada afirmación.                                                                                           |
| `vectojs/AGENTS.md` + `vectojs/README.md`                                                                                            | 00 (este doc)              | El mapa de paquetes, el orden de compilación y el modelo de renderizado/interacción están **copiados de AGENTS.md y README.md verbatim en significado** y verificados contra `package.json` — no inventados.                                                                                                                      |

Regla: **lado autoritativo primero**. Si un hecho aparece tanto en una página learn/reference como en un deep-dive, la página learn/reference es el objetivo de corrección. Nunca hagas `cp -r` entre `vectojs-docs/content` y `vectojs-website/src/content` (según `AGENTS.md` — deriva de formateo + 408 ficheros i18n).

## Rutas de lectura — elige la tuya

**"Acabo de llegar"** — 00 → 02 (texto/layout) → 06 (ciclo de vida del VMT) → 07 (renderizador) → el desafío más cercano a tu primera tarea. Dos tardes, suficiente para aterrizar una PR real.

**"Soy dueño de una feature"** — 00 → tu desafío → su fila de prerrequisito profundo → el capítulo correspondiente en `content/learn/*` → `forge/findings/<area>.md` para ese desafío. Repasa de nuevo la sección de invariantes antes de la revisión.

**"Soy dueño del rendimiento"** — 00 → 06 → 07 → 08 (WASM G1/G2/G3) → 11 (grafo) — luego `benchmarks/run-browsers.sh` y `forge/baselines/*.json`. Solo los números de `run-browsers.sh` son citables.

**"Soy dueño de a11y / docs densos / tablas"** — 00 → 06 → 03 → (01 si la selección/copia importa para tu superficie).

**"Soy dueño de 3D / XR / visualización de grafos"** — 00 → 06 → 09 → 11 → (08 si el cómputo de layout es tu presupuesto).

Cada frontmatter de deep-dive declara su `order`, conjunto de `package` y lista de `prereq` para que Zola y la barra lateral se mantengan ordenados aunque el lector entre a mitad de serie.

## Convenciones y estándar de verificación

- Todas las refs de código están verificadas `file:line` vía `ctxctl outline` → `grep -rn` → `read` antes de escribir (nunca de memoria). Las refs ambiguas incluyen el nombre de función/clase.
- El frontmatter de Zola es obligatorio en cada doc (`title`, `description`, `order`). Los encabezados usan H2/H3 + bloques de código cercados (según AGENTS.md global).
- Puerta de tokens/lint: ejecuta los equivalentes a `just fmt` / `just check` sobre cambios de docs cuando aplique antes de la PR; en el lado `vectojs-docs`, comprobación de deriva con `scripts/sync-content.py` antes del push.
- Mantén cada deep-dive por debajo de ~600 líneas; esta visión general por debajo de ~400. Denso sobre verboso; enlaza, no dupliques.

## Siguiente paso

Elige tu ruta arriba. Una siguiente lectura convencional es **Desafío 01 — Selección nativa en canvas** si tocas texto, o **Desafío 06 — Runtime del VMT** si tocas ciclo de vida/eventos — ambos son rampas cortas hacia el par más difícil (02, 08).

---

_Serie: 00 Visión general → 01 Selección → 02 Texto+Layout → 03 Proyección+Virtualización → 04 Markdown en streaming → 05 TeX → 06 Runtime del VMT → 07 Renderizador → 08 WASM G1/G2/G3 → 09 Three/XR → 10 Exportación de vídeo → 11 Layout de grafos → 12 DevTools → 13 Estilos → 14 Responsive → 15 Apps verticales → 99 Síntesis._
