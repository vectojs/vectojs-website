+++
title = "Devtools: inspección"
description = "Lee una escena de VectoJS como datos — el modelo de árbol, la selección de entidades, el estado de entidad/a11y/texto, la geometría de resaltado, la explicación de hit-test y la traza de enrutamiento de eventos."
weight = 49
+++

# Devtools: inspección

Todo lo que hay aquí es una lectura pura desde `@vectojs/devtools/headless`. Nada monta un panel y, con la única excepción de `EventTrace`, que adjunta listeners de documento, nada necesita desmontarse.

```ts
import { inspectEntity, pickInScene } from '@vectojs/devtools/headless';
```

---

## Modelo de árbol y selección

```typescript
function buildTreeModel(root: Entity): {
  nodes: DevtoolsTreeNode[];
  index: Map<string, Entity>;
};
function findEntityAt(root: Entity, x: number, y: number): Entity | null;
function pickInScene(scene: Scene, sceneX: number, sceneY: number): Entity | null;
function describeEntity(entity: Entity): string[];

interface DevtoolsTreeNode {
  id: string;
  label: string;
  children?: DevtoolsTreeNode[];
}
```

`buildTreeModel` devuelve los **hijos** de la raíz, no la raíz misma — `nodes` tiene una entrada por cada hijo directo, cada una con su propio subárbol. El mapa `index`, en cambio, contiene a todo descendiente en cada profundidad, indexado por id de entidad, que es lo que hace que un id vuelva a resolverse hasta una entidad viva. En una hoja, `children` es `undefined` en lugar de `[]`.

`label` es `` `${type} (${x},${y}) ${W}×${H} ⚡ ▶` `` — el tamaño se omite cuando ambas dimensiones son 0, y los dos badges aparecen solo cuando `interactive` y `hasPendingAnimations()`, respectivamente.

`pickInScene` es la función que quieres para "qué entidad es dueña de este píxel". Comprueba **primero el árbol de overlay** y después el árbol principal, de modo que un modal abierto gana correctamente sobre el contenido que hay detrás. `findEntityAt` es la primitiva de un solo árbol que hay debajo: recorre los hijos en orden inverso, de más profundo a menos, así que devuelve el acierto pintado en la parte superior, y — coincidiendo con el `HitTester` del motor, sin reserva propia — una entidad gana solo donde su propio `isPointInside` acepta el punto. Las entidades decorativas o recortadas se resuelven por tanto a lo que hay detrás de ellas, exactamente como lo haría un clic real.

> [!IMPORTANT]
> `findEntityAt` prueba la entidad que le pasas además de sus descendientes, así que pasarle una raíz de escena puede devolver esa raíz. `pickInScene` es el valor por defecto más seguro.

`describeEntity` devuelve líneas legibles por humanos: seis líneas fijas de estado genérico de la entidad y luego cualquier salida `getDevtoolsDescriptor()` que publique la entidad, limitada a 12 líneas de descriptor. Los valores de los campos se truncan a 32 caracteres y las notas a 60. Un descriptor que lanza contribuye con la línea `— descriptor threw —` en lugar de abortar la lectura.

> [!NOTE]
> En toda la capa de modelo de devtools, `type` es `entity.constructor.name`, que un minificador renombrará. Trátalo como una etiqueta de depuración, nunca como una clave estable — y nunca como una condición de rama en producción.

---

## Estado de la entidad

```typescript
function inspectEntity(entity: Entity): EntityInfo;
function entityPath(entity: Entity): string;
function textPreviewOf(entity: Entity): string | undefined;

interface EntityInfo {
  id: string;
  type: string;
  path: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  worldTransform: {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
  };
  worldBounds: Bounds;
  interactive: boolean;
  animating: boolean;
  clipChildren: boolean;
  childCount: number;
  text?: string;
  a11y?: { tag?: string; role?: string; label?: string };
  descriptor?: DevtoolsDescriptor;
  layoutControlled?: ReadonlyArray<LayoutControlledProperty>;
}
```

`inspectEntity` es el hermano estructurado y seguro para JSON de `describeEntity`. Todos los números se redondean a 2 decimales. Los cuatro campos opcionales se **omiten, no se establecen a `undefined`**, de modo que `'text' in info` distingue "sin texto" de "texto vacío" — una entidad cuyo texto es realmente `''` reporta `text: ''`.

`layoutControlled` nombra las propiedades que posee un contenedor de layout padre. Escribir en una de ellas desde código de aplicación es un bug: el siguiente paso de layout la sobrescribe. Si un nudge o una animación sobre `x` sigue volviendo a su sitio, este campo es el motivo.

`entityPath` renderiza la cadena de ancestros como `Scene > Card#a1b2c3d4 > Text#e5f6a7b8`, con ids truncados a 8 caracteres. Es el identificador que hay que citar en un informe de bug, porque sobrevive entre ejecuciones donde `id` no lo hace.

> [!IMPORTANT]
> `entityPath` etiqueta cualquier entidad sin padre como `Scene`, así que una entidad **desacoplada** es indistinguible de la raíz real. Si un path parece sospechosamente corto, comprueba si la entidad sigue en el árbol.

`textPreviewOf` aplica duck-typing a `.text` y luego a `.value`, y trunca a 80 caracteres más unos puntos suspensivos. Es lo que suministra `EntityInfo.text` y el respaldo del nombre a11y, de modo que una cadena larga llega a ellos como vista previa en lugar de completa.

---

## Estado de accesibilidad

```typescript
function inspectA11y(scene: Scene, entity: Entity): A11yInfo;
function a11yReadingOrder(scene: Scene): A11yInfo[];

interface A11yInfo {
  entityId: string;
  entityPath: string;
  projected: boolean;
  tag?: string;
  role?: string;
  accessibleName?: string;
  nameSource?: 'label' | 'text' | 'none';
  tabIndex?: number;
  disabled?: boolean;
  focused?: boolean;
  readingOrder?: number;
  canvasBounds: Bounds;
  domBounds?: Bounds;
}
```

`inspectA11y` siempre devuelve un registro, nunca `null` — una entidad no proyectada reporta `projected: false` y poco más. Esta es la función que responde a "¿por qué el lector de pantalla no anuncia esto?", y los dos campos que suelen responderlo son `accessibleName` y `nameSource`.

`nameSource` está siempre presente, incluso como `'none'`. El orden de resolución es `label`, luego una vista previa del texto y luego nada. Como el camino del texto pasa por `textPreviewOf`, un nombre derivado de texto largo llega **truncado a 80 caracteres** — la cadena anunciada es el texto completo, así que no leas `accessibleName` como verdad absoluta para contenido largo.

`readingOrder` es un índice basado en 1 a lo largo de toda la capa proyectada en orden DOM, no un índice de hermanos. `a11yReadingOrder` devuelve todas las entidades proyectadas ordenadas por él, que es la secuencia que recorrerá un lector de pantalla. Las entidades que están proyectadas pero ausentes de la consulta DOM se ordenan al final.

`canvasBounds` es donde el canvas dibuja la entidad; `domBounds` es donde realmente se asienta su espejo proyectado. **Una brecha entre ambos es el defecto** — significa que el anillo de foco del lector de pantalla, o un objetivo de clic, está en un sitio distinto de los píxeles. `domBounds` se omite cuando no hay elemento o el rect es todo ceros.

---

## Texto y shaping

```typescript
function inspectText(entity: Entity): TextInspection | null;
function shapeProbe(
  text: string,
  options?: {
    font?: string;
    cellWidth?: number;
    lineHeight?: number;
    baseline?: number;
  },
): TextInspection;
function formatTextInspection(inspection: TextInspection): PluginRow[];
function isTextEntity(entity: Entity): boolean;
```

`inspectText` devuelve `null` solo cuando la entidad no lleva ni `.text` ni `.value`. De lo contrario obtienes los niveles bidi resueltos, las corridas de nivel, los segmentos de reversión, el orden visual, los clústeres de grafemas y el detalle por glifo — los datos detrás de "¿por qué esta cadena árabe está en el orden equivocado?" o "¿por qué este glifo es una caja en blanco?".

El detalle por glifo llega en uno de tres niveles, y el nivel determina qué campos existen:

| Nivel                             | `glyphs[].x` | `metrics` / `lines` | `atlasMiss`        |
| --------------------------------- | ------------ | ------------------- | ------------------ |
| Cuadrícula de contenido preparada | sí           | sí                  | nunca se establece |
| Texto preparado                   | no           | no                  | sí                 |
| Ninguno                           | sin glifos   | no                  | no                 |

El array `unavailable` nombra cada capacidad que no pudo reportarse y por qué, así que un campo ausente siempre se explica en lugar de estar silenciosamente ausente. Siempre contiene al menos tres entradas — los ids de glifo, las corridas de script y los tramos de fallback de fuente no los expone el motor en absoluto.

`shapeProbe` ejecuta una cadena arbitraria por el mismo pipeline sin entidad y sin escena, lo que lo convierte en la forma más rápida de comprobar una cuestión de shaping en un test unitario. Siempre devuelve una inspección completa con posiciones.

> [!NOTE]
> Los límites de clúster los re-segmenta devtools usando `Intl.Segmenter`, no se toman del motor, así que en un runtime sin `Intl.Segmenter` caen a una iteración por code point y son incorrectos para marcas combinantes y emojis de bandera. Compáralos con la salida del motor antes de confiar en un recuento de clústeres.

---

## Geometría de resaltado

```typescript
function highlightGeometry(
  scene: Scene,
  entity: Entity,
  options?: HighlightGeometryOptions,
): HighlightLayer[];
function sampleHitRegion(
  entity: Entity,
  options?: { step?: number; budget?: number },
): HighlightLayer;
function formatHighlightGeometry(layers: ReadonlyArray<HighlightLayer>): string[];

type HighlightLayerKind = 'aabb' | 'layout' | 'render' | 'clip' | 'content' | 'a11y' | 'hit';

interface HighlightLayer {
  kind: HighlightLayerKind;
  polygons: ReadonlyArray<HighlightPolygon>;
  divergesFromLayout?: boolean;
  unavailable?: string;
}

interface HighlightGeometryOptions {
  layers?: ReadonlyArray<HighlightLayerKind>;
  hitSampleStep?: number;
  hitSampleBudget?: number;
}
```

Una entidad tiene hasta siete cajas distintas, y los bugs de layout viven en las brechas entre ellas:

| Tipo      | Qué es                                                                         |
| --------- | ------------------------------------------------------------------------------ |
| `aabb`    | Caja delimitadora alineada a los ejes del cuadrilátero de layout transformado. |
| `layout`  | El cuadrilátero real, con rotación y skew incluidos. La referencia.            |
| `render`  | `getBounds()` — donde la entidad pinta de verdad.                              |
| `clip`    | La caja del ancestro `clipChildren` más cercano.                               |
| `content` | La caja del espejo de contenido DOM seleccionable.                             |
| `a11y`    | La caja del elemento de proyección a11y.                                       |
| `hit`     | La región de hit real, muestreada probando `isPointInside`.                    |

`divergesFromLayout` en cualquier capa es la señal — significa que esa caja discrepa del cuadrilátero de layout en más de un píxel, que es exactamente la condición que hace que un clic aterrice en un sitio al que el usuario no apuntaba. Una capa `render` que diverge es contenido pintando fuera de su caja; una divergencia en `content` o `a11y` es un objetivo de selección o de foco mal colocado.

`highlightGeometry` nunca lanza. Una capa que no puede computarse vuelve con `unavailable` ajustado al motivo y sin polígonos, así que `render` en una entidad típica lee `getBounds() returned null, so the layout box is the render box`. La salida está siempre en el orden fijo anterior independientemente del orden que solicites.

`'hit'` **no** está en el conjunto de capas por defecto, porque es la única cara. Muestrea `isPointInside` sobre una cuadrícula — paso predeterminado de 8 unidades de escena, presupuesto predeterminado de 4096 pruebas — y devuelve un rectángulo por cada corrida horizontal contigua. Superar el presupuesto se niega a muestrear y lo dice en lugar de colgarse:

```ts
// An inscribed circle: same extent as its box, ~79% of its area.
const hit = sampleHitRegion(circle, { step: 4 });
hit.divergesFromLayout; // true — coverage is below 90% of the box
```

La divergencia para `'hit'` se decide por **cobertura de área, no por extensión**, precisamente para que se registre un círculo dentro de un cuadrado. El coste es cuadrático en el tamaño de la entidad para un paso fijo: reducir a la mitad `step` cuadruplica el recuento de pruebas, así que un paso de 2px sobre una entidad de 200×100 necesita ~5100 pruebas y debe recibir un `hitSampleBudget` elevado antes de ejecutarse.

---

## Explicar un hit test

```typescript
function explainHitTest(scene: Scene, x: number, y: number): HitExplanation;
function formatHitExplanation(explanation: HitExplanation): string[];

type HitVerdict =
  'accepted' | 'invisible' | 'clipped' | 'pointer-transparent' | 'outside-shape' | 'occluded';

interface HitCandidate {
  entityId: string;
  entityPath: string;
  type: string;
  verdict: HitVerdict;
  reason: string;
  depth: number;
  worldBounds: Bounds;
  clipperId?: string;
  clipperPath?: string;
}

interface HitExplanation {
  x: number;
  y: number;
  hitId: string | null;
  hitPath?: string;
  candidates: HitCandidate[];
  root: 'overlay' | 'main' | 'none';
}
```

`pickInScene` te dice qué entidad ganó. `explainHitTest` te dice **por qué perdió todas las demás**, que es lo que necesitas cuando la respuesta es incorrecta. Cada candidato lleva un veredicto y una razón de una frase:

```ts
const why = explainHitTest(scene, 50, 50);
console.log(formatHitExplanation(why).join('\n'));
// hit test (50, 50) → Scene > Box#entity_d > Box#entity_k [main]
// ✗ OverlayRoot — point (50, 50) is outside its shape
//   ✗ Box — point (50, 50) is outside its shape
//     ✓ Box — inside its shape, unclipped, and accepts pointer input
//     · Box — would have been hit, but Box is drawn on top
```

Los glifos son `✓` aceptado, `·` ocluido, `✗` todo lo demás, y la sangría es la profundidad del candidato — limitada a 6 niveles, así que los árboles más profundos se aplastan visualmente. Las líneas llevan `type` (el nombre del constructor), no el path, y las entidades hermanas suelen compartir un tipo: lee `explanation.candidates[i].entityPath` cuando necesites identificar una con precisión.

Los candidatos se ordenan de más superior a más inferior, el mismo orden en que el motor los considera. Ten en cuenta que `occluded` se asigna en un post-pase: una entidad que habría aceptado el punto pero que está debajo del ganador se reescribe de `accepted` a `occluded`. Así que "cuántas cosas hay bajo este píxel" se responde contándolas.

Un veredicto `invisible` (`opacity <= 0`) **podas el subárbol** — la razón nombra cuántos descendientes se omitieron, así que toda una rama invisible se reporta como un único candidato en lugar de docenas.

> [!IMPORTANT]
> Esto es un diagnóstico, no una llamada por fotograma. Donde el motor devuelve en el primer acierto, `explainHitTest` recorre todo el árbol para enumerar a los perdedores. También refleja siempre el recorrido JS, de modo que en una escena que usa la cuadrícula de hit WASM los dos pueden discrepar en un caso límite: un ancestro `clipChildren` de tamaño cero se explica como `clipped` mientras que el camino WASM registra el acierto.

---

## Traza de enrutamiento de eventos

```typescript
function createEventTrace(scene: Scene, options?: EventTraceOptions): EventTrace;

class EventTrace {
  get entries(): readonly EventTraceEntry[];
  subscribe(listener: (entry: EventTraceEntry) => void): () => void;
  clear(): void;
  destroy(): void;
}

interface EventTraceOptions {
  capacity?: number; // retained records, default 50
  includeGlobalKeyboard?: boolean; // default true
}

type EventTraceType =
  'pointerdown' | 'pointerup' | 'pointercancel' | 'pointermove' | 'wheel' | 'keydown' | 'keyup';

type EventTraceSource = 'a11y' | 'content' | 'canvas' | 'document';
```

```ts
const trace = createEventTrace(scene, { capacity: 100 });
trace.subscribe((entry) => {
  console.log(entry.source, entry.targetPath, entry.defaultPrevented);
});
```

Cada entrada registra la entidad objetivo resuelta, las coordenadas de escena y locales, las teclas modificadoras y el `defaultPrevented` final. `source` dice en qué superficie llegó el evento del navegador: `canvas`, la proyección `a11y`, un espejo `content` seleccionable, o `document` para el teclado global.

Los registros **se finalizan en una microtarea**, así que `defaultPrevented` refleja la decisión final de atajo o selección de la aplicación en lugar de su valor a mitad de la distribución. La consecuencia práctica es que `entries` está vacío inmediatamente después de distribuir un evento — un test debe esperar una macrotarea antes de hacer una aserción.

Las trazas de puntero incluyen `pointercancel`, lo que hace visibles las transacciones de arrastre y selección interrumpidas en lugar de dejar una brecha de diagnóstico después de `pointerdown`. Espera `pointerdown` → movimientos → exactamente un `pointerup` (confirmación) **o** `pointercancel` (rollback); una entrada terminal ausente significa que la entidad nunca se proyectó o que el capture se eludió.

> [!IMPORTANT]
> `EventTrace` adjunta 14 listeners de documento y es el único objeto de la capa de modelo que **debe** destruirse. Llama a `trace.destroy()` cuando la superficie de diagnóstico se desmonte. Ten en cuenta también que `entries` devuelve el array interno vivo, no una copia — muta bajo tus pies a medida que llegan registros y son desalojados a plena capacidad, así que cópialo si necesitas una vista estable.

Fuera de un navegador el constructor no adjunta nada y la instancia es inerte, de modo que un helper de test compartido puede construir una incondicionalmente.

---

## Flujos de trabajo de depuración

| Síntoma                                                               | Flujo de trabajo                                                                                                                                     |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| "¿Qué entidad es dueña de este píxel?"                                | `pickInScene(scene, x, y)` → `inspectEntity(hit)`                                                                                                    |
| "La entidad equivocada es dueña de este píxel"                        | `explainHitTest(scene, x, y)` — cada perdedor con el motivo por el que perdió                                                                        |
| "¿Por qué esta entidad está mal posicionada/dimensionada?"            | `inspectEntity` para bounds mundiales + transform, y luego sube con `entityPath` — el primer ancestro cuyos bounds están mal es dueño del bug        |
| "Mis escrituras sobre `x` siguen revirtiéndose"                       | `inspectEntity(e).layoutControlled` — un contenedor padre posee esa propiedad                                                                        |
| "El objetivo del clic está desplazado respecto a lo visual"           | `highlightGeometry(scene, e)` y busca `divergesFromLayout` en `a11y` o `content`                                                                     |
| "El área clicable de esta forma está mal"                             | `sampleHitRegion(e)` — la región de hit real, no la caja                                                                                             |
| "El lector de pantalla no dice nada / dice lo equivocado"             | `inspectA11y(scene, e)` para `accessibleName` + `nameSource`; `a11yReadingOrder(scene)` para la secuencia de anuncio                                 |
| "Este texto se renderiza en el orden equivocado"                      | `inspectText(e)` — niveles bidi, corridas de nivel, orden visual                                                                                     |
| "Los glifos se renderizan como cajas en blanco"                       | `inspectText(e).glyphs` — entradas marcadas con `atlasMiss`                                                                                          |
| "Un clic/rueda/tecla va al sitio equivocado"                          | `createEventTrace(scene)` — fuente, path objetivo, coordenadas, `defaultPrevented` final                                                             |
| "La selección o copia por arrastre de texto está siendo interceptada" | Traza de eventos con `entry.source === 'content'` — el evento comenzó en una proyección seleccionable                                                |
| "Un arrastre se queda atascado / nunca confirma"                      | Las trazas de puntero son transaccionales: un `pointerup`/`pointercancel` ausente significa que la entidad no se proyectó o que el capture se eludió |

---

[Descripción general](/reference/devtools/) · [Auditar](/reference/devtools-audit/) · [Rendimiento](/reference/devtools-perf/) · [Puente y plugins](/reference/devtools-extend/)
