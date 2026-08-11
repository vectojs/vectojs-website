+++
title = "Devtools: auditing"
description = "Assert a VectoJS scene is correct — layout, accessibility, text shaping, and selection audits that return structured findings, plus snapshots and diffs for regression tests."
weight = 50

[extra]
order = 50
+++

# Devtools: auditing

An audit walks the scene and returns structured, JSON-safe findings. Each one is a CI gate you can assert on:

```typescript
import { auditScene } from '@vectojs/devtools/headless';

expect(auditScene(scene)).toEqual([]);
```

That is the point of this half of the package. A screenshot test tells you a page changed; an audit tells you _which entity_ overflows its container and _by how many pixels_ on which edge.

| Audit                    | Catches                                                                                    | Needs a browser |
| ------------------------ | ------------------------------------------------------------------------------------------ | --------------- |
| `auditScene`             | Overflow, clipping, sibling overlap, escaping the viewport                                 | no              |
| `auditA11y`              | Missing names, role conflicts, unreachable focus targets                                   | no              |
| `auditTextShaping`       | Glyphs missing from the atlas                                                              | no              |
| `auditSceneSelection`    | Text selection geometry drifting from the canvas                                           | **yes**         |
| `auditGpu`               | Batching, overdraw, unbalanced save/restore — [see Performance](/reference/devtools-perf/) | no              |
| `auditAccelerators`      | A WASM kernel refusing its arguments — [see Performance](/reference/devtools-perf/)        | no              |
| `auditMarkdownStreaming` | Streaming reuse degrading — [see Performance](/reference/devtools-perf/)                   | no              |

---

## Layout audit

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

Four kinds are detected:

- `text-overflow` — a text-bearing entity's measured box escapes its nearest sized ancestor.
- `clip-overflow` — content escapes a `clipChildren` ancestor, so pixels are cut off.
- `overlap` — **siblings only**; parent-child containment is normal.
- `viewport-overflow` — an entity with no sized ancestor drawn outside the canvas.

`auditScene` is the entry point; `auditTree` is the single-tree primitive it calls, taking `sceneBounds` explicitly. Passing `null` for those bounds makes `viewport-overflow` undetectable, since there is no viewport to escape.

Findings are sorted by `kind`, then `entityPath`, then `otherPath` — deterministic across runs, which is what makes them safe to snapshot.

> [!IMPORTANT]
> With `includeOverlay: true` the result is **two concatenated sorted runs**, not one globally sorted list: the main tree's findings, then the overlay's. Grouping by `kind` in a single pass will see kinds repeat. Sort again if you need one ordering.

Known blind spots, all deliberate:

- **Scrollable containers exempt the vertical axis.** Content taller than a `ScrollView` is the entire point of a `ScrollView`. Horizontal escape is still reported. Override the type list via `scrollableTypes` — matched by constructor name, and the entity must also actually clip.
- **`opacity: 0` prunes the whole subtree.** Deliberately hidden content is not a layout defect.
- **`viewport-overflow` needs no sized ancestor at all.** A single sized non-clipping ancestor suppresses it, on the grounds that the ancestor is then the meaningful container.
- **Overlap compares direct siblings only**, never across branches, and requires the intersection to exceed `tolerance` on _both_ axes.
- An `Input` counts as text-like, because text-likeness is duck-typed on the presence of readable text.

> [!NOTE]
> `worldBounds` means two different things depending on `kind`. The overflow kinds report render extents (`getWorldBounds()`); `overlap` reports the declared layout quad. An entity that paints outside its box therefore appears with different numbers in the two kinds — intentionally, since overlap is a layout question and overflow is a painting question.

---

## A11y audit

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

- `no-accessible-name` — a focusable entity with no name, where the role requires one or the entity is `interactive`. The commonest real defect: an icon button that announces as "button" and nothing else.
- `role-tag-conflict` — an explicit `role` contradicting the tag's implicit role, e.g. `tag: 'button'` with `role: 'link'`.
- `disabled-divergence` — the entity _looks_ disabled but does not _say_ it is, or vice versa. Dimmed-but-focusable is the trap: a keyboard user tabs into something a mouse user can see is unavailable.
- `focusable-but-clipped` — a focusable entity entirely outside a `clipChildren` ancestor. Tab moves focus to something invisible.
- `duplicate-label` — two entities sharing an accessible name, reported against the second onward with `otherId` pointing at the first.

Unlike the layout audit, this one **includes the overlay tree by default** — a modal is exactly where focus traps live. `a11yHidden` prunes the entire subtree.

> [!NOTE]
> Findings are in walk order, not sorted, and all `duplicate-label` findings are appended last. `disabled-divergence` also has a deliberate dead band: an opacity between 0.6 and 0.9 is reported neither way, because that range is ambiguous rather than wrong.

---

## Text shaping audit

```typescript
function auditTextShaping(scene: Scene): Array<{
  kind: string;
  entityId: string;
  message: string;
  severity: 'info' | 'warn';
}>;
```

Emits one kind, `atlas-miss`: an entity whose glyphs are not in the font atlas, which is why they render as blank boxes. The message samples up to five distinct missing glyphs.

> [!IMPORTANT]
> This audit only sees entities whose text went through the **prepared-text** path. An entity inspected via a prepared content grid can never produce an `atlas-miss` finding regardless of how many glyphs are actually missing, because the grid path does not carry the flag. Use `inspectText(entity).glyphs` directly to check a specific entity.

It walks `scene.rootEntity` only — the overlay tree is not audited.

---

## Selection audit

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

"Selection" here means **native browser text selection** — dragging to select text over the transparent DOM content projection. This audit compares the entity's own line geometry, which is what the canvas draws from, against the live DOM `Range` rectangles the browser would highlight. A drift means the blue selection band lands somewhere other than the glyphs.

Both are normalised into the entity's local logical pixels, so the check is independent of device pixel ratio and browser zoom. It catches justified-text, RTL/bidi, and fractional-DPR drift.

`auditSceneSelection` walks the tree and sorts by `entityPath` then `line`. `auditEntitySelection` checks one entity.

> [!IMPORTANT]
> This audit **clears the user's current text selection** as it runs, and it requires a real browser — it references `document` unguarded, so it throws rather than returning `[]` in Node or a bare test runner. Keep it in browser e2e, not unit tests. It also walks `scene.rootEntity` only, with no overlay option.

`entityIds` filters which entities are _audited_ but not which are traversed, so a filtered-out parent's children are still checked.

---

## Snapshots and diffs

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

Instead of screenshotting, assert that an interaction changed **exactly** the entities it should have. That turns "the page looks different" into "this one entity moved 4px it should not have moved".

Diffs key on **structural paths** (`type[index]` chains), never entity ids, because ids are random per run. An entity that publishes a `devtoolsKey` — or failing that an a11y label — is matched by that key instead, so reordering a keyed list reports as movement rather than as every row changing. Keyed matching applies only when keys are unique on both sides of a level; on a collision the level falls back to index alignment.

Default-valued props are omitted from snapshots, so diffs stay quiet.

> [!NOTE]
> Only a fixed property set is compared: `type`, `x`, `y`, `width`, `height`, `worldBounds`, `opacity`, `interactive`, `animating`, `clipChildren`, and `text`. Notably **a change to `scene.width`/`scene.height` produces no diffs at all**, and neither `id` nor `key` changes are reported. `added` and `removed` do not recurse, so a deleted subtree is one finding rather than one per descendant.

---

## Combining audits in CI

Every audit is a plain function returning plain data, so one gate can assert the whole surface:

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
> Audit before the scene has laid out and everything passes vacuously. Drive at least one `scene.step()` first — an empty findings array from an empty scene is not evidence of anything.

---

[Devtools overview](/reference/devtools/) · [Inspecting](/reference/devtools-inspect/) · [Performance](/reference/devtools-perf/) · [Bridge & plugins](/reference/devtools-extend/)
