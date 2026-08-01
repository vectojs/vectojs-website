---
title: 'Devtools: auditoría'
description: 'Verifica que una escena de VectoJS es correcta — auditorías de layout, accesibilidad, shaping de texto y selección que devuelven hallazgos estructurados, más instantáneas y diffs para tests de regresión.'
order: 50
---

# Devtools: auditoría

Una auditoría recorre la escena y devuelve hallazgos estructurados y seguros para JSON. Cada uno es una compuerta de CI en la que puedes hacer una aserción:

```typescript
import { auditScene } from '@vectojs/devtools/headless';

expect(auditScene(scene)).toEqual([]);
```

Ese es el sentido de esta mitad del paquete. Un test de captura de pantalla te dice que una página cambió; una auditoría te dice _qué entidad_ se desborda de su contenedor y _por cuántos píxeles_ en qué borde.

| Auditoría                | Atrapa                                                                                          | ¿Necesita un navegador? |
| ------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------- |
| `auditScene`             | Desbordamiento, recorte, solapamiento de hermanos, salida del viewport                          | no                      |
| `auditA11y`              | Nombres ausentes, conflictos de rol, objetivos de foco inalcanzables                            | no                      |
| `auditTextShaping`       | Glifos ausentes del atlas                                                                       | no                      |
| `auditSceneSelection`    | La geometría de selección de texto derivando del canvas                                         | **sí**                  |
| `auditGpu`               | Batching, overdraw, save/restore desequilibrados — [ver Rendimiento](/reference/devtools-perf/) | no                      |
| `auditAccelerators`      | Un kernel WASM rechazando sus argumentos — [ver Rendimiento](/reference/devtools-perf/)         | no                      |
| `auditMarkdownStreaming` | La reutilización de streaming degradándose — [ver Rendimiento](/reference/devtools-perf/)       | no                      |

---

## Auditoría de layout

```typescript
function auditScene(scene: Scene, opts?: AuditOptions): AuditFinding[];
function auditTree(root: Entity, sceneBounds: Bounds | null, opts?: AuditOptions): AuditFinding[];

type AuditKind = 'text-overflow' | 'clip-overflow' | 'overlap' | 'viewport-overflow';

interface AuditOptions {
  tolerance?: number; // px slack before an escape/overlap counts. Default 0.5
  includeOverlay?: boolean; // modals/highlights excluded by default
  scrollableTypes?: string[]; // default ['ScrollView','VirtualList','TreeView','Table']
  ignore?: (entity: Entity) => boolean; // prune subtrees
  ignoreOverlap?: (a: Entity, b: Entity) => boolean; // allow intentional stacking
}

interface AuditFinding {
  kind: AuditKind;
  entityId: string;
  entityPath: string;
  worldBounds: Bounds;
  message: string;
  containerId?: string;
  containerPath?: string;
  containerBounds?: Bounds;
  overflow?: { left: number; right: number; top: number; bottom: number };
  otherId?: string;
  otherPath?: string;
  otherBounds?: Bounds;
  intersection?: Bounds;
}
```

```typescript
const findings = auditScene(scene, {
  tolerance: 0.5,
  includeOverlay: false,
  ignore: (e) => e.id.startsWith('debug-'),
  ignoreOverlap: (a, b) => a.id === 'badge',
});
```

Se detectan cuatro kinds:

- `text-overflow` — la caja medida de una entidad con texto escapa de su ancestro dimensionado más cercano.
- `clip-overflow` — el contenido escapa de un ancestro `clipChildren`, así que los píxeles se recortan.
- `overlap` — **solo hermanos**; la contención padre-hijo es normal.
- `viewport-overflow` — una entidad sin ancestro dimensionado dibujada fuera del canvas.

`auditScene` es el punto de entrada; `auditTree` es la primitiva de un solo árbol que llama, tomando `sceneBounds` explícitamente. Pasar `null` para esos bounds hace que `viewport-overflow` sea indetectable, ya que no hay viewport del que escapar.

Los hallazgos se ordenan por `kind`, luego `entityPath`, luego `otherPath` — determinista entre ejecuciones, que es lo que los hace seguros para instantáneas.

> [!IMPORTANT]
> Con `includeOverlay: true` el resultado son **dos corridas ordenadas concatenadas**, no una lista ordenada globalmente: primero los hallazgos del árbol principal, luego los del overlay. Agrupar por `kind` en una sola pasada verá kinds repetidos. Vuelve a ordenar si necesitas un único ordenamiento.

Puntos ciegos conocidos, todos deliberados:

- **Los contenedores desplazables eximen el eje vertical.** El contenido más alto que un `ScrollView` es el propósito mismo de un `ScrollView`. La salida horizontal sí se reporta. Sobrescribe la lista de tipos mediante `scrollableTypes` — se empareja por nombre de constructor, y la entidad debe recortar de hecho.
- **`opacity: 0` podas el subárbol entero.** El contenido deliberadamente oculto no es un defecto de layout.
- **`viewport-overflow` no necesita ningún ancestro dimensionado.** Un único ancestro dimensionado no recortador lo suprime, con el fundamento de que entonces el ancestro es el contenedor significativo.
- **El overlap compara solo hermanos directos**, nunca entre ramas, y exige que la intersección supere `tolerance` en _ambos_ ejes.
- Un `Input` cuenta como tipo texto, porque lo parecido-a-texto se determina por duck-typing según la presencia de texto legible.

> [!NOTE]
> `worldBounds` significa dos cosas distintas según el `kind`. Los kinds de desbordamiento reportan las extensiones de renderizado (`getWorldBounds()`); `overlap` reporta el cuadrilátero de layout declarado. Una entidad que pinta fuera de su caja aparece por tanto con números distintos en los dos kinds — intencionadamente, ya que el overlap es una cuestión de layout y el desbordamiento una cuestión de pintado.

---

## Auditoría a11y

```typescript
function auditA11y(scene: Scene, opts?: A11yAuditOptions): A11yFinding[];

type A11yAuditKind =
  | 'no-accessible-name'
  | 'role-tag-conflict'
  | 'disabled-divergence'
  | 'focusable-but-clipped'
  | 'duplicate-label';

interface A11yAuditOptions {
  includeOverlay?: boolean; // default: included
  tolerance?: number; // px slack for the clipping check. Default 0.5
  skip?: ReadonlyArray<A11yAuditKind>;
}

interface A11yFinding {
  kind: A11yAuditKind;
  entityId: string;
  entityPath: string;
  message: string;
  otherId?: string;
  otherPath?: string;
  containerId?: string;
  containerPath?: string;
}
```

- `no-accessible-name` — una entidad enfocable sin nombre, donde el rol lo requiere o la entidad es `interactive`. El defecto real más común: un botón de icono que se anuncia como "button" y nada más.
- `role-tag-conflict` — un `role` explícito que contradice el rol implícito del tag, p. ej. `tag: 'button'` con `role: 'link'`.
- `disabled-divergence` — la entidad _parece_ deshabilitada pero no lo _dice_, o viceversa. Atenuada-pero-enfocable es la trampa: un usuario de teclado tabula hasta algo que un usuario de ratón ve no disponible.
- `focusable-but-clipped` — una entidad enfocable completamente fuera de un ancestro `clipChildren`. El tab mueve el foco a algo invisible.
- `duplicate-label` — dos entidades compartiendo un nombre accesible, reportado contra la segunda en adelante con `otherId` apuntando a la primera.

A diferencia de la auditoría de layout, esta **incluye el árbol de overlay por defecto** — un modal es exactamente donde viven los traps de foco. `a11yHidden` podas el subárbol entero.

> [!NOTE]
> Los hallazgos están en orden de recorrido, no ordenados, y todos los hallazgos `duplicate-label` se anexan al final. `disabled-divergence` también tiene una banda muerta deliberada: una opacidad entre 0.6 y 0.9 no se reporta en ningún sentido, porque ese rango es ambiguo en lugar de incorrecto.

---

## Auditoría de shaping de texto

```typescript
function auditTextShaping(scene: Scene): Array<{
  kind: string;
  entityId: string;
  message: string;
  severity: 'info' | 'warn';
}>;
```

Emite un kind, `atlas-miss`: una entidad cuyos glifos no están en el atlas de fuentes, que es por lo que se renderizan como cajas en blanco. El mensaje muestrea hasta cinco glifos ausentes distintos.

> [!IMPORTANT]
> Esta auditoría solo ve entidades cuyo texto pasó por el camino de **texto preparado**. Una entidad inspeccionada mediante una cuadrícula de contenido preparada nunca puede producir un hallazgo `atlas-miss` independientemente de cuántos glifos falten de hecho, porque el camino de cuadrícula no lleva la bandera. Usa `inspectText(entity).glyphs` directamente para comprobar una entidad concreta.

Recorre solo `scene.rootEntity` — el árbol de overlay no se audita.

---

## Auditoría de selección

```typescript
function auditSceneSelection(scene: Scene, opts?: SelectionAuditOptions): SelectionAuditFinding[];
function auditEntitySelection(
  scene: Scene,
  entity: Entity,
  opts?: SelectionAuditOptions,
): SelectionAuditFinding[];

interface SelectionAuditOptions {
  tolerance?: number; // px of left-edge drift allowed. Default 2
  rightTolerance?: number; // defaults to `tolerance`
  entityIds?: string[]; // audit only these entities
}

interface SelectionAuditFinding {
  kind: 'selection-drift';
  entityId: string;
  entityPath: string;
  line: number;
  expectedLeft: number;
  expectedRight: number;
  actualLeft: number;
  actualRight: number;
  leftDrift: number;
  rightDrift: number;
  message: string;
}
```

"Selección" aquí significa **selección de texto nativa del navegador** — arrastrar para seleccionar texto sobre la proyección de contenido DOM transparente. Esta auditoría compara la geometría de línea propia de la entidad, que es de donde dibuja el canvas, con los rectángulos `Range` del DOM vivo que resaltaría el navegador. Una deriva significa que la banda de selección azul aterriza en un sitio distinto de los glifos.

Ambas se normalizan en los píxeles lógicos locales de la entidad, así que la comprobación es independiente de la relación de píxeles del dispositivo y del zoom del navegador. Atrapa la deriva por texto justificado, RTL/bidi y DPR fraccionario.

`auditSceneSelection` recorre el árbol y ordena por `entityPath` y luego `line`. `auditEntitySelection` comprueba una entidad.

> [!IMPORTANT]
> Esta auditoría **limpia la selección de texto actual del usuario** mientras se ejecuta, y requiere un navegador real — referencia `document` sin protección, así que lanza en lugar de devolver `[]` en Node o en un runner de test desnudo. Mantenla en e2e de navegador, no en tests unitarios. También recorre solo `scene.rootEntity`, sin opción de overlay.

`entityIds` filtra qué entidades se _auditan_ pero no cuáles se recorrren, así que los hijos de un padre filtrado aún se comprueban.

---

## Instantáneas y diffs

```typescript
function captureSnapshot(scene: Scene): SceneSnapshot;
function diffSnapshots(a: SceneSnapshot, b: SceneSnapshot): SnapshotDiff[];

interface SceneSnapshot {
  width: number;
  height: number;
  root: SnapshotNode[];
  overlay: SnapshotNode[];
}

interface SnapshotDiff {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  changes?: Record<string, { from: unknown; to: unknown }>;
}
```

```typescript
const before = captureSnapshot(scene); // deterministic JSON tree
// … perform an interaction …
const diffs = diffSnapshots(before, captureSnapshot(scene));
// -> [{ path: 'root > GridEntity[0]', kind: 'changed', changes: { x: {from,to} } }]
```

En lugar de capturar pantallas, verifica que una interacción cambió **exactamente** las entidades que debería. Eso convierte "la página se ve distinta" en "esta entidad se movió 4px que no debería haber movido".

Los diffs se basan en **paths estructurales** (cadenas `type[index]`), nunca en ids de entidad, porque los ids son aleatorios por ejecución. Una entidad que publica un `devtoolsKey` — o, en su defecto, una etiqueta a11y — se empareja por esa clave en su lugar, así que reordenar una lista con claves se reporta como movimiento en lugar de como cada fila cambiando. El emparejamiento por clave se aplica solo cuando las claves son únicas en ambos lados de un nivel; ante una colisión, el nivel cae a la alineación por índice.

Las props con valor por defecto se omiten de las instantáneas, así que los diffs se mantienen silenciosos.

> [!NOTE]
> Solo se compara un conjunto fijo de propiedades: `type`, `x`, `y`, `width`, `height`, `worldBounds`, `opacity`, `interactive`, `animating`, `clipChildren` y `text`. Notablemente, **un cambio en `scene.width`/`scene.height` no produce ningún diff**, y no se reportan cambios de `id` ni de `key`. `added` y `removed` no recurren, así que un subárbol eliminado es un hallazgo en lugar de uno por descendiente.

---

## Combinando auditorías en CI

Cada auditoría es una función simple que devuelve datos simples, así que una sola compuerta puede verificar toda la superficie:

```typescript
import { auditA11y, auditScene, auditTextShaping } from '@vectojs/devtools/headless';

test('the scene is structurally sound', () => {
  buildDashboard(scene);
  scene.step(16.67); // let layout settle before asserting

  expect(auditScene(scene, { includeOverlay: true })).toEqual([]);
  expect(auditA11y(scene)).toEqual([]);
  expect(auditTextShaping(scene)).toEqual([]);
});
```

> [!IMPORTANT]
> Audita antes de que la escena se haya asentado en su layout y todo pasa vacuamente. Impulsa al menos un `scene.step()` primero — un array de hallazgos vacío de una escena vacía no es evidencia de nada.

---

[Descripción general](/reference/devtools/) · [Inspeccionar](/reference/devtools-inspect/) · [Rendimiento](/reference/devtools-perf/) · [Puente y plugins](/reference/devtools-extend/)
