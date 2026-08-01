---
title: 'Devtools: inspecting'
description: 'Read a VectoJS scene as data — the tree model, entity picking, entity/a11y/text state, highlight geometry, hit-test explanation, and the event routing trace.'
order: 49
---

# Devtools: inspecting

Everything here is a pure read from `@vectojs/devtools/headless`. Nothing mounts a panel, and — with the single exception of `EventTrace`, which attaches document listeners — nothing needs tearing down.

```ts
import { inspectEntity, pickInScene } from '@vectojs/devtools/headless';
```

---

## Tree model and picking

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

`buildTreeModel` returns the root's **children**, not the root itself — `nodes` is one entry per direct child, each with its own subtree. The `index` map, by contrast, contains every descendant at every depth, keyed by entity id, which is what makes an id round-trip back to a live entity. `children` is `undefined` rather than `[]` on a leaf.

`label` is `` `${type} (${x},${y}) ${W}×${H} ⚡ ▶` `` — the size is omitted when both dimensions are 0, and the two badges appear only when `interactive` and `hasPendingAnimations()` respectively.

`pickInScene` is the function you want for "which entity owns this pixel". It checks the **overlay tree first**, then the main tree, so an open modal correctly wins over the content behind it. `findEntityAt` is the single-tree primitive underneath: it walks children in reverse order, deepest-first, so it returns the topmost-painted hit, and it falls back to an AABB test when `isPointInside` says no — which means decorative, non-interactive entities are still pickable.

> [!IMPORTANT]
> `findEntityAt` tests the entity you pass it as well as its descendants, so handing it a scene root can return that root. `pickInScene` is the safer default.

`describeEntity` returns human-readable lines: six fixed lines of generic entity state, then any `getDevtoolsDescriptor()` output the entity publishes, capped at 12 descriptor lines. Field values truncate at 32 characters and notes at 60. A descriptor that throws contributes the line `— descriptor threw —` rather than aborting the readout.

> [!NOTE]
> `type` throughout the devtools model layer is `entity.constructor.name`, which a minifier will rename. Treat it as a debugging label, never as a stable key — and never as a production branch condition.

---

## Entity state

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

`inspectEntity` is the structured, JSON-safe sibling of `describeEntity`. Every number is rounded to 2 decimals. The four optional fields are **omitted, not set to `undefined`**, so `'text' in info` distinguishes "no text" from "empty text" — an entity whose text really is `''` reports `text: ''`.

`layoutControlled` names the properties a parent layout container owns. Writing to one of those from application code is a bug: the next layout pass overwrites it. If a nudge or an animation on `x` keeps snapping back, this field is why.

`entityPath` renders the ancestry chain as `Scene > Card#a1b2c3d4 > Text#e5f6a7b8`, with ids truncated to 8 characters. It is the identifier to quote in a bug report, because it survives across runs where `id` does not.

> [!IMPORTANT]
> `entityPath` labels any entity with no parent as `Scene`, so a **detached** entity is indistinguishable from the real root. If a path looks suspiciously short, check whether the entity is still in the tree.

`textPreviewOf` duck-types `.text` then `.value`, and truncates at 80 characters plus an ellipsis. It is what supplies `EntityInfo.text` and the a11y name fallback, so a long string reaches those as a preview rather than in full.

---

## Accessibility state

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

`inspectA11y` always returns a record, never `null` — a non-projected entity reports `projected: false` and little else. This is the function that answers "why doesn't the screen reader announce this?", and the two fields that usually answer it are `accessibleName` and `nameSource`.

`nameSource` is always present, including as `'none'`. The resolution order is `label`, then a text preview, then nothing. Because the text path goes through `textPreviewOf`, a name derived from long text arrives **truncated at 80 characters** — the announced string is the full text, so do not read `accessibleName` as ground truth for long content.

`readingOrder` is a 1-based index across the whole projected layer in DOM order, not a sibling index. `a11yReadingOrder` returns every projected entity sorted by it, which is the sequence a screen reader will walk. Entities that are projected but absent from the DOM query sort to the end.

`canvasBounds` is where the canvas draws the entity; `domBounds` is where its projected mirror actually sits. **A gap between them is the defect** — it means a screen reader's focus ring, or a click target, is somewhere other than the pixels. `domBounds` is omitted when there is no element or the rect is all-zero.

---

## Text and shaping

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

`inspectText` returns `null` only when the entity carries neither `.text` nor `.value`. Otherwise you get the resolved bidi levels, level runs, reversal segments, visual order, grapheme clusters, and per-glyph detail — the data behind "why is this Arabic string in the wrong order" or "why is this glyph a blank box".

Per-glyph detail arrives in one of three tiers, and the tier determines which fields exist:

| Tier                  | `glyphs[].x` | `metrics` / `lines` | `atlasMiss` |
| --------------------- | ------------ | ------------------- | ----------- |
| Prepared content grid | yes          | yes                 | never set   |
| Prepared text         | no           | no                  | yes         |
| Neither               | no glyphs    | no                  | no          |

The `unavailable` array names every capability that could not be reported and why, so a missing field is always explained rather than silently absent. It always holds at least three entries — glyph ids, script runs, and font fallback spans are not exposed by the engine at all.

`shapeProbe` runs an arbitrary string through the same pipeline with no entity and no scene, which makes it the quickest way to check a shaping question in a unit test. It always returns a full inspection with positions.

> [!NOTE]
> Cluster boundaries are re-segmented by devtools using `Intl.Segmenter`, not taken from the engine, so on a runtime without `Intl.Segmenter` they fall back to code-point iteration and are wrong for combining marks and flag emoji. Compare them against engine output before trusting a cluster count.

---

## Highlight geometry

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

One entity has up to seven different boxes, and layout bugs live in the gaps between them:

| Kind      | What it is                                                |
| --------- | --------------------------------------------------------- |
| `aabb`    | Axis-aligned bounding box of the transformed layout quad. |
| `layout`  | The true quad, rotation and skew included. The reference. |
| `render`  | `getBounds()` — where the entity actually paints.         |
| `clip`    | The nearest `clipChildren` ancestor's box.                |
| `content` | The selectable DOM content mirror's box.                  |
| `a11y`    | The a11y projection element's box.                        |
| `hit`     | The real hit region, sampled by probing `isPointInside`.  |

`divergesFromLayout` on any layer is the signal — it means that box disagrees with the layout quad by more than a pixel, which is exactly the condition that makes a click land somewhere the user did not aim. A `render` layer that diverges is content painting outside its box; a `content` or `a11y` divergence is a mis-placed selection or focus target.

`highlightGeometry` never throws. A layer that cannot be computed comes back with `unavailable` set to the reason and no polygons, so `render` on a typical entity reads `getBounds() returned null, so the layout box is the render box`. Output is always in the fixed order above regardless of the order you request.

`'hit'` is **not** in the default layer set, because it is the only expensive one. It samples `isPointInside` on a grid — default step 8 scene units, default budget 4096 probes — and returns one rectangle per contiguous horizontal run. Exceeding the budget refuses to sample and says so rather than hanging:

```ts
// An inscribed circle: same extent as its box, ~79% of its area.
const hit = sampleHitRegion(circle, { step: 4 });
hit.divergesFromLayout; // true — coverage is below 90% of the box
```

Divergence for `'hit'` is decided by **area coverage, not extent**, precisely so a circle-in-a-square registers. Cost is quadratic in entity size for a fixed step: halving `step` quadruples the probe count, so a 2px step over a 200×100 entity needs ~5100 probes and must be given a raised `hitSampleBudget` before it will run.

---

## Explaining a hit test

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

`pickInScene` tells you which entity won. `explainHitTest` tells you **why every other entity lost**, which is what you need when the answer is wrong. Each candidate carries a verdict and a sentence-long reason:

```ts
const why = explainHitTest(scene, 50, 50);
console.log(formatHitExplanation(why).join('\n'));
// hit test (50, 50) → Scene > Box#entity_d > Box#entity_k [main]
// ✗ OverlayRoot — point (50, 50) is outside its shape
//   ✗ Box — point (50, 50) is outside its shape
//     ✓ Box — inside its shape, unclipped, and accepts pointer input
//     · Box — would have been hit, but Box is drawn on top
```

The glyphs are `✓` accepted, `·` occluded, `✗` everything else, and the indent is the candidate's depth — capped at 6 levels, so deeper trees flatten visually. The lines carry `type` (the constructor name), not the path, and sibling entities usually share a type: read `explanation.candidates[i].entityPath` when you need to identify one precisely.

Candidates are ordered topmost-first, the same order the engine considers them.
Note that `occluded` is assigned in a post-pass: an entity that would have accepted the point but sits below the winner is rewritten from `accepted` to `occluded`. So "how many things are under this pixel" is answerable by counting them.

An `invisible` verdict (`opacity <= 0`) **prunes the subtree** — the reason names how many descendants were skipped, so a whole invisible branch reports as one candidate rather than dozens.

> [!IMPORTANT]
> This is a diagnostic, not a per-frame call. Where the engine returns on the first hit, `explainHitTest` walks the entire tree to enumerate the losers. It also always mirrors the JS walk, so on a scene using the WASM hit grid the two can disagree in one edge case: a zero-sized `clipChildren` ancestor explains as `clipped` while the WASM path registers the hit.

---

## Event routing trace

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

Each entry records the resolved target entity, scene and local coordinates, modifier keys, and the final `defaultPrevented`. The `source` says which surface the browser event arrived on: `canvas`, the `a11y` projection, a selectable `content` mirror, or `document` for global keyboard.

Records **finalize in a microtask**, so `defaultPrevented` reflects the application's final shortcut or selection decision rather than its value mid-dispatch. The practical consequence is that `entries` is empty immediately after dispatching an event — a test must await a macrotask before asserting.

Pointer traces include `pointercancel`, which makes interrupted drag and selection transactions visible instead of leaving a diagnostic gap after `pointerdown`. Expect `pointerdown` → moves → exactly one `pointerup` (commit) **or** `pointercancel` (rollback); a missing terminal entry means the entity was never projected or capture was bypassed.

> [!IMPORTANT]
> `EventTrace` attaches 14 document listeners and is the one object in the model layer that **must** be destroyed. Call `trace.destroy()` when the diagnostic surface unmounts. Also note `entries` returns the live internal array, not a copy — it mutates under you as records arrive and are evicted at capacity, so copy it if you need a stable view.

Outside a browser the constructor attaches nothing and the instance is inert, so a shared test helper can construct one unconditionally.

---

## Debugging workflows

| Symptom                                            | Workflow                                                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| "Which entity owns this pixel?"                    | `pickInScene(scene, x, y)` → `inspectEntity(hit)`                                                                                    |
| "The wrong entity owns this pixel"                 | `explainHitTest(scene, x, y)` — every loser with the reason it lost                                                                  |
| "Why is this entity positioned/sized wrong?"       | `inspectEntity` for world bounds + transform, then walk `entityPath` upward — the first ancestor whose bounds are wrong owns the bug |
| "My writes to `x` keep getting reverted"           | `inspectEntity(e).layoutControlled` — a parent container owns that property                                                          |
| "The click target is offset from the visuals"      | `highlightGeometry(scene, e)` and look for `divergesFromLayout` on `a11y` or `content`                                               |
| "This shape's clickable area is wrong"             | `sampleHitRegion(e)` — the real hit region, not the box                                                                              |
| "The screen reader says nothing / the wrong thing" | `inspectA11y(scene, e)` for `accessibleName` + `nameSource`; `a11yReadingOrder(scene)` for the announce sequence                     |
| "This text renders in the wrong order"             | `inspectText(e)` — bidi levels, level runs, visual order                                                                             |
| "Glyphs render as blank boxes"                     | `inspectText(e).glyphs` — entries flagged `atlasMiss`                                                                                |
| "A click/wheel/keypress goes to the wrong place"   | `createEventTrace(scene)` — source, target path, coordinates, final `defaultPrevented`                                               |
| "Text drag-selection or copy is being intercepted" | Event trace with `entry.source === 'content'` — the event began on a selectable projection                                           |
| "A drag gets stuck / never commits"                | Pointer traces are transactional: a missing `pointerup`/`pointercancel` means the entity wasn't projected or capture was bypassed    |

---

[Devtools overview](/reference/devtools/) · [Auditing](/reference/devtools-audit/) · [Performance](/reference/devtools-perf/) · [Bridge & plugins](/reference/devtools-extend/)
