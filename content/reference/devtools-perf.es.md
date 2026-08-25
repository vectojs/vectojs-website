+++
title = "Devtools: rendimiento"
description = "Atribuye el coste de fotograma de VectoJS — contadores de dibujo GPU y Canvas2D, estado de aceleradores WASM, atribución de repintado sucio y métricas de reutilización del streaming de Markdown."
weight = 51
+++

# Devtools: rendimiento

Cuatro lecturas independientes, cada una respondiendo a una pregunta distinta de "¿por qué va lento esto?":

| Lectura                 | Pregunta                                                                        |
| ----------------------- | ------------------------------------------------------------------------------- |
| `inspectGpu`            | ¿En qué gasta realmente el fotograma las llamadas de dibujo?                    |
| `inspectAccelerators`   | ¿Se están ejecutando los kernels WASM y, si no, por qué no?                     |
| `diagnoseDirty`         | ¿Por qué se repinta esta escena cuando nada cambió visiblemente?                |
| `inspectMarkdownStream` | ¿Está el streaming de Markdown reutilizando trabajo o re-analizando cada chunk? |

Las cuatro son lecturas puras. Ninguna habilita instrumentación como efecto secundario, lo que significa que una escena no medida reporta no-medida en lugar de mentir — y dos de ellas necesitan que la instrumentación esté activada antes.

---

## Contadores de GPU y de dibujo

```typescript
function inspectGpu(scene: Scene): GpuInspection;
function formatGpuInspection(info: GpuInspection): PluginRow[];
function auditGpu(scene: Scene): PluginFinding[];

interface GpuInspection {
  rendererKind: string;
  canvas: DrawCounters | null;
  webgl: {
    drawCalls: number;
    totalDrawCalls: number;
    atlasSwitches: number;
    programs: number;
    textures: number;
    circleQuadFallbacks: number;
    circlePoints: number;
  } | null;
  webgpu: {
    active: boolean;
    pipelines: number;
    bindGroups: number;
    particleEntities: number;
  };
  phases: Array<{
    phase: string;
    totalMs: number;
    calls: number;
    avgMs: number;
    maxMs: number;
  }>;
  frame: {
    fps: number;
    frameTimeMs: number;
    renderedFrames: number;
    skippedFrames: number;
  };
  unavailable: Array<{ capability: string; reason: string }>;
}
```

`frame` está siempre disponible. Todo lo demás es opt-in, y el array `unavailable` nombra cada cosa que no pudo reportar y por qué:

```typescript
import { inspectGpu } from '@vectojs/devtools/headless';

// Canvas2D counters are off by default — turn them on first.
scene.getRenderer().setDrawCounters?.(true);
scene.setPhaseTiming(true);

scene.step(16.67);

const gpu = inspectGpu(scene);
gpu.canvas?.fills; // draw calls by category
gpu.phases; // per-phase timing
```

> [!IMPORTANT]
> Las tres comprobaciones Canvas2D de `auditGpu` **dependen todas de que el conteo de dibujo esté habilitado**. En una escena donde nunca llamaste a `setDrawCounters(true)`, devuelve `[]` — que se lee exactamente como un resultado limpio. Habilita el conteo primero, o una auditoría en verde no significa nada.

Hallazgos que puede emitir: `batch-not-amortising` (flushes por círculo por encima de 0.5), `high-overdraw` (ratio por encima de 4), `unbalanced-save-restore` (un bug real — un `restore()` ausente filtra estado a dibujos posteriores) y `circle-quad-fallback` (más fallbacks de quad que círculos point-sprite).

> [!NOTE]
> `webgl` mezcla un contador por fotograma con cuatro acumulativos desde la creación. `drawCalls` es el último fotograma completado; `totalDrawCalls`, `atlasSwitches`, `circleQuadFallbacks` y `circlePoints` solo crecen. Dividir un contador acumulativo por un fotograma es el error fácil aquí.
>
> Un `webgl` `null` significa que la capa de puntos no se está ejecutando en absoluto, lo cual es distinto de un `webgl` todo-ceros que significa que se ejecutó y no dibujó nada. `webgpu.pipelines` y `bindGroups` se derivan de la bandera activa y del recuento de entidades de partículas, no se consultan del dispositivo. `particleEntities` se determina por duck-typing sobre un `maxParticles` numérico y cuenta solo el árbol principal.

Se exportan tres comandos para alternar la instrumentación desde un panel o un agente, como [comandos de plugin](/reference/devtools-extend/#protocolo-de-plugin):

```typescript
const enableDrawCountersCommand: PluginCommand; // 'enable-draw-counters'
const resetDrawCountersCommand: PluginCommand; // 'reset-draw-counters'
const enablePhaseTimingCommand: PluginCommand; // 'enable-phase-timing'
```

Devuelven un **string** de estado en lugar de lanzar cuando un backend no puede contar — los caminos SVG y solo-WebGL reportan `'this backend cannot count draws'`. Deliberadamente no hay comando de desactivación para ninguno de los dos, así que recuerda que una sesión de devtools deja el conteo y el timing de fases activados durante la vida del renderer, lo que cambia el coste de cada fotograma posterior.

---

## Estado de aceleradores WASM

```typescript
function inspectAccelerators(scene: Scene): AcceleratorInspection;
function formatAcceleratorInspection(info: AcceleratorInspection): PluginRow[];
function auditAccelerators(scene: Scene): PluginFinding[];

interface AcceleratorFinding {
  accelerator: string; // 'transform' | 'animation' | 'hitTest' | 'particle'
  available: boolean; // a backend is installed and could run
  activeThisFrame: boolean; // it ran on the most recent frame
  reason: AcceleratorReason;
  path: string; // which implementation did the work
  faulted: boolean;
  explanation: string; // why, with what to do about it
}

interface AcceleratorInspection {
  accelerators: AcceleratorFinding[]; // always 4, in a stable order
  activeCount: number;
  availableCount: number;
  faulted: AcceleratorFinding[];
  summary: string;
}
```

Los kernels WASM de VectoJS son un backend invisible — JS es el fallback permanente, así que un kernel que deja de ejecutarse silenciosamente cuesta rendimiento sin romper nada. Así es como lo detectas. `reason` distingue los cinco estados:

| `reason`         | Significado                                                              | ¿Un problema? |
| ---------------- | ------------------------------------------------------------------------ | ------------- |
| `active`         | Ejecutándose en el camino nombrado en `path`.                            | no            |
| `not-installed`  | No se cargó ningún backend WASM.                                         | no            |
| `below-gate`     | Demasiado poco trabajo este fotograma como para merecer la llamada.      | no            |
| `not-applicable` | No hay nada de este tipo que hacer.                                      | no            |
| `rejected`       | Instalado, pasado el gate, y luego el kernel **rechazó sus argumentos**. | **sí**        |

Para el acelerador de animación, un veredicto por tipo nombra qué familia de
drivers rechazó: cuando un kernel de animación rechaza un fotograma mientras el
otro todavía avanzó vía WASM, `reason` reporta `springs-rejected` o
`tweens-rejected` (con `activeThisFrame: true`, ya que la mitad del trabajo se
ejecutó). El simple `rejected` queda reservado para cuando ambos tipos rechazan.

`faulted` es exactamente `reason === 'rejected'` (veredictos por tipo
incluidos), y `auditAccelerators` reporta solo esos. Esto es deliberado: un gate que permanece cerrado es el sistema funcionando como se pretende, y reportarlo te entrenaría para ignorar la auditoría. Una escena sana, y una escena enteramente-JS, ambas auditan limpio.

`rejected` significa que el kernel estaba instalado, pasó su gate, luego no escribió nada y el fotograma cayó a JS — un bug de dimensionado o capacidad aguas arriba, no un resultado de ajuste.

> [!NOTE]
> No confundas `accelerators.particle` con `Scene.particleBackend`. Los tres getters de estado `transformBackend`, `animBackend` y `hitTestBackend` son de solo lectura y reportan `'js' | 'wasm'`. `Scene.particleBackend` es una **solicitud escribible** (`'auto' | 'webgpu' | 'cpu'`) que cambia lo que intenta el runtime — no es un estado, y no es lo que lee esta inspección. `inspectAccelerators` lee exclusivamente el informe `scene.accelerators`.

---

## Atribución de repintado sucio

```typescript
function diagnoseDirty(scene: Scene, options?: DirtyDiagnosisOptions): DirtyDiagnosis;

interface DirtyDiagnosisOptions {
  frames?: number; // sample window; defaults to the observed frame span
  limit?: number; // how many causes to return. Default 10
}

interface DirtyCause {
  entity?: string;
  reason: string;
  property?: string;
  count: number;
  perFrame: number;
  firstFrame: number;
  lastFrame: number;
}

interface DirtyDiagnosis {
  renderMode: 'always' | 'onDemand';
  frames: number;
  causes: DirtyCause[];
  everyFrame: DirtyCause[];
  summary: string;
}
```

Una escena `onDemand` que se repinta cada fotograma ha perdido todo el beneficio de ser `onDemand`. Esto atribuye los repintados:

```typescript
scene.setDirtyTracking(true);
// … run the scene …
const diag = diagnoseDirty(scene);
diag.summary; // one-line verdict
diag.everyFrame; // causes firing on ~every frame — the ones that matter
```

`everyFrame` contiene las causas cuyo `perFrame` está en o por encima de 0.9. Esas son las que mantienen despierta una escena.

> [!IMPORTANT]
> Dos cosas hacen que esta lectura aparezca vacía cuando esperas datos, y ambas son normales.
>
> Primero, `scene.setDirtyTracking(true)` debe llamarse **antes** de los fotogramas que quieres medir — el `summary` lo dice explícitamente cuando el tracking está desactivado.
>
> Segundo, la atribución solo existe para llamadas `markDirty(source)` que realmente pasan una fuente, y la mayoría de los puntos de llamada en core y ui no lo hacen. Así que "tracking activado, nada registrado" es el caso común en lugar de un caso límite, y no significa que la escena esté inactiva. Trata un resultado poblado como una señal fuerte y uno vacío como ausencia de información.

Tres detalles de la forma del resultado:

> [!NOTE]
> `reason` es una cadena de forma libre, no una unión fija — las cadenas usadas actualmente incluyen `driver-tick`, `child-added`, `child-removed`, `animation-start` y `a11y-reorder`, pero cualquier llamador puede acuñar la suya. Además, `causes` se trunca a `limit` mientras que `everyFrame` se calcula a partir de la lista sin truncar, así que `everyFrame` puede contener causas ausentes de `causes`. Con `renderMode: 'always'` el resumen reporta la cuestión como discutible, porque una escena de renderizado siempre se repinta sin importar qué.

---

## Métricas del streaming de Markdown

```typescript
function inspectMarkdownStream(entity: Entity): MarkdownStreamInfo | null;
function formatMarkdownStream(info: MarkdownStreamInfo): PluginRow[];
function auditMarkdownStreaming(scene: Scene): PluginFinding[];
function isMarkdownEntity(entity: Entity): boolean;
```

El streaming de Markdown solo es rápido si cada chunk anexado reutiliza el parseo anterior. Estos contadores dicen si lo hace:

```typescript
interface MarkdownStreamInfo {
  entityId: string;
  sourceLength: number;
  topLevelTokens: number;
  childEntities: number;
  appends: number;
  workerResponses: number;
  coalesced: number;
  tokensPrefixMatched: number;
  tokensReturned: number;
  tokenPrefixReuseRatio: number;
  lexerMs: number;
  sourceCharsLexed: number;
  workerMsAvg: number;
  workerMsMax: number;
  stablePrefixChars: number;
  changedTailChars: number;
  entitiesReused: number;
  entitiesRebuilt: number;
  inPlaceUpdates: number;
  tailFraction: number;
  notes: string[];
}
```

> [!IMPORTANT]
> Tres campos se **renombraron en 0.11.0 y los nombres antiguos no se mantuvieron como alias**. El código escrito contra una referencia más antigua lee `undefined`, que silenciosamente parece un cero:
>
> | Eliminado       | Actual                  |
> | --------------- | ----------------------- |
> | `tokensReused`  | `tokensPrefixMatched`   |
> | `tokensRelexed` | `tokensReturned`        |
> | `reuseRatio`    | `tokenPrefixReuseRatio` |
>
> Los nombres antiguos nombraban lo equivocado — implicaban que se reciclaban tokens enteros, cuando lo que se mide es cuánto del prefijo de tokens coincidió. `lexerMs` y `sourceCharsLexed` son nuevos en 0.11.0.

`auditMarkdownStreaming` emite cinco kinds:

- `tail-not-a-delta` — la cola cambiada es más de la mitad de la fuente, así que una anexión re-analiza la mayor parte del documento en lugar de un delta.
- `low-token-reuse` — reutilización del prefijo por debajo del 50%.
- `slow-worker-roundtrip` — una respuesta del worker por encima de 8.3ms, es decir, dos fotogramas a 240Hz.
- `no-worker` — parseo en el hilo principal.
- `entities-mostly-rebuilt` — más entidades reconstruidas que reutilizadas, así que el reconciler de hijos no está encontrando sus coincidencias.

> [!NOTE]
> La auditoría depende de `appends > 0` — una entidad Markdown que nunca transmitió no produce hallazgos. `low-token-reuse` también requiere un ratio por encima de cero, así que un 0% de reutilización genuino no se reporta. Los umbrales son fijos y no configurables. Recorre solo `scene.rootEntity`, así que una entidad Markdown dentro de un modal no se audita.

`isMarkdownEntity` se determina por duck-typing sobre el descriptor de devtools de la entidad que reporta `kind: 'Markdown'` — no importa `@vectojs/markdown` y no usa `instanceof`, así que la capa de modelo permanece libre de esa dependencia.

---

## Registrarlos como pestañas del panel

Cada subsistema trae un [plugin](/reference/devtools-extend/#protocolo-de-plugin) descriptor a juego para que el panel pueda mostrarlo como pestaña. **Nada se registra automáticamente** — un build que nunca inspecciona la GPU no lleva el código:

```typescript
import {
  acceleratorAudit,
  acceleratorInspector,
  enableDrawCountersCommand,
  enablePhaseTimingCommand,
  gpuAudit,
  gpuInspector,
  markdownStreamAudit,
  markdownStreamInspector,
  registerDevtoolsPlugin,
  resetDrawCountersCommand,
  textInspector,
} from '@vectojs/devtools/headless';

registerDevtoolsPlugin({
  id: 'perf',
  inspectors: [gpuInspector, acceleratorInspector, markdownStreamInspector, textInspector],
  audits: [gpuAudit, acceleratorAudit, markdownStreamAudit],
  commands: [enableDrawCountersCommand, resetDrawCountersCommand, enablePhaseTimingCommand],
});
```

> [!NOTE]
> `gpuInspector` y `acceleratorInspector` reportan sobre toda la escena e ignoran la selección, pero tanto el panel como el puente hacen un cortocircuito hacia una fila de "no selection" antes de llamar a un inspector. Selecciona cualquier entidad para ver sus filas. Las auditorías no tienen esa restricción.

---

[Descripción general](/reference/devtools/) · [Inspeccionar](/reference/devtools-inspect/) · [Auditar](/reference/devtools-audit/) · [Puente y plugins](/reference/devtools-extend/)
