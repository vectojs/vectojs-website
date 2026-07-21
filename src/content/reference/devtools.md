---
title: '@vectojs/devtools'
description: 'The in-page Virtual Math Tree inspector — entity picking, a live tree view, transform readout, and keyboard nudge editing, itself rendered with VectoJS.'
order: 48
---

# `@vectojs/devtools`

Version documented: **0.5.0**

`@vectojs/devtools` is the answer to "where's the Elements panel?" — an in-page inspector for the Virtual Math Tree, so debugging a VectoJS scene stays in state space instead of pixel space. The panel is itself a VectoJS `Scene` (dogfooding the framework it inspects), docked to an edge of the page. Since **0.5.0** it's a modern glass dock (rounded corners, shadow, `Card`-grouped sections) organized into tabs, with a filter, count badges, a live performance HUD, inline property editing, and a settings tab.

## Installation

```bash
bun add -D @vectojs/devtools
```

Add the visual panel conditionally in development — it mounts a VectoJS panel
and listens on `document`, so keep it out of production bundles. Headless
audits, snapshots, picking, and event tracing are available without the panel:

```ts
import { auditScene, captureSnapshot, createEventTrace } from '@vectojs/devtools/headless';
```

```typescript
import { attachDevtools } from '@vectojs/devtools';

const scene = new Scene(canvas);
// ...build the scene...

if (import.meta.env.DEV) {
  const devtools = attachDevtools(scene);
  // devtools.detach() to remove it later
}
```

## What it shows

The panel header carries three ghost text-glyph icon buttons — **⌖** (pick), **⟳** (refresh), **⚠** (audit) — and three count badges: total entities, interactive (**⚡**), and audit findings (**⚠**). Below them a `Tabs` bar splits the tools into **Tree · Info · Audit · Log · ⚙**, and a perf strip is pinned at the bottom.

- **Live tree view** (`Tree` tab) of `scene.rootEntity` and `scene.overlayRootEntity`, refreshed on an interval (default 500ms). Each row shows the entity's constructor name, position, size, and two badges: **⚡** (`interactive`) and **▶** (`hasPendingAnimations()`). A **filter** field (0.5.0) narrows rows by type/id substring; it's view-only, so the id→entity index still resolves everything. Programmatic: `panel.setFilter(text)`.
- **Pick mode**: click **⌖**, then click anywhere on the page. The inspector resolves the click to the deepest entity under that point using the same walk order the Scene uses for pointer input (with an AABB fallback for decorative, non-interactive entities).
- **Selection highlight**: the selected entity's world-space bounding box is drawn as an outline on the _host_ scene's overlay layer, so you see exactly what's selected relative to the live render. Toggle it in the Settings tab or via `panel.setHighlightEnabled(bool)`.
- **State readout + inline editing** (`Info` tab): geometry, scale/rotation/opacity, the full world transform matrix, and animation state as plain text. Since 0.5.0 the tab adds inline `x`/`y`/`opacity` editors and **Copy path** / **Copy JSON** buttons.
- **Keyboard nudge editing**: with an entity selected, arrow keys move it by 1px (Shift: 10px); `+`/`-` step opacity by 0.1. Useful for confirming _which_ entity a layout bug belongs to before touching code.
- **Performance HUD** (0.5.0): a bottom strip reads [`Scene.frameStats`](/reference/core-scene) — fps, ms/frame, entity count, render mode, and rendered/skipped frame counts. The fps is the real _rendered-frame_ cadence, so an idle `onDemand` or auto-throttled scene honestly reads ~2fps rather than a fake 60. Disable with `showPerf: false`.
- **Settings** (`⚙` tab, 0.5.0): toggle the selection highlight, and switch the refresh interval and dock side (left/right) live.

The panel reflows on window resize, so the bottom perf strip stays on-screen at any viewport height or zoom level. The dock and its canvas use `pointer-events: none`; only their projected interactive controls opt back in — so the inspector never steals input from host controls underneath empty dock pixels, while its own rows, tabs, inputs, and buttons remain clickable.

## API

```typescript
function attachDevtools(
  scene: Scene,
  options?: DevtoolsOptions,
): DevtoolsPanel & { detach(): void };

interface DevtoolsOptions {
  width?: number; // panel width in px, default 360
  refreshInterval?: number; // ms; 0 disables auto-refresh
  traceEvents?: boolean; // show bounded pointer/wheel/keyboard routing records
  traceCapacity?: number;
  dockSide?: 'right' | 'left'; // 0.5.0; default 'right'
  showPerf?: boolean; // 0.5.0; live perf HUD strip, default true
  defaultTab?: string; // 0.5.0; 'tree' | 'inspect' | 'audit' | 'events' | 'settings'
}

class DevtoolsPanel {
  refresh(): void; // rebuild the tree model from the host scene
  armPick(): void; // one-shot: the next page click selects the entity under it
  select(entity: Entity): void; // select programmatically
  get selection(): Entity | null;
  setFilter(text: string): void; // 0.5.0; filter the tree by type/id substring
  setHighlightEnabled(on: boolean): void; // 0.5.0
  setRefreshInterval(ms: number): void; // 0.5.0
  setDockSide(side: 'right' | 'left'): void; // 0.5.0
  audit(): AuditFinding[]; // run the layout audit; also fills the Audit tab
  selectFinding(i: number): void; // select + highlight the entity behind finding i
  destroy(): void; // tears down listeners, timers, host highlight, and the panel scene
}
```

`detach()` (returned by `attachDevtools`) is an alias for `destroy()`.

## Event routing trace

```ts
const trace = createEventTrace(scene, { capacity: 100 });
trace.subscribe((entry) => {
  console.log(entry.source, entry.targetPath, entry.defaultPrevented);
});
```

`source` is `"canvas"`, `"a11y"`, `"content"`, or `"document"`. The
`content` source means the browser event began on a selectable
`[data-vecto-content]` mirror. The trace validates the owning Entity, records
scene/local coordinates, and finalizes in a microtask so `defaultPrevented`
reflects the application's final shortcut or selection decision. Call
`trace.destroy()` when the diagnostic surface unmounts. Pointer traces include
`pointercancel`, which makes interrupted drag and selection transactions visible
instead of leaving a diagnostic gap after `pointerdown`.

## Scene auditing

`auditScene` walks the tree and reports layout defects as structured, JSON-safe
findings — the numeric answer to "does anything overflow, overlap, or escape?":

```typescript
import { auditScene } from '@vectojs/devtools/headless';

const findings = auditScene(scene, {
  tolerance: 0.5, // px slack before an escape/overlap counts
  includeOverlay: false, // modals/highlights excluded by default
  ignore: (e) => e.id.startsWith('debug-'), // prune subtrees
  ignoreOverlap: (a, b) => a.id === 'badge', // allow intentional stacking
});
// -> AuditFinding[]: { kind, entityId, entityPath, worldBounds, message,
//    containerBounds?, overflow?{left,right,top,bottom}, otherId?, intersection? }
```

Four `kind`s are detected, deterministically sorted:

- `text-overflow` — a text-bearing entity's measured box escapes its nearest sized ancestor.
- `clip-overflow` — content escapes a `clipChildren` ancestor (pixels cut off).
- `overlap` — **siblings only**; parent-child containment is normal.
- `viewport-overflow` — an entity with no sized ancestor drawn outside the canvas.

Known blind spots: scrollable containers exempt the vertical axis (override the
list via `scrollableTypes`, matched by `constructor.name`), and `opacity: 0`
entities are skipped.

The panel's **Audit** button runs the same check in place of the tree view;
`panel.audit()` returns the findings and `panel.selectFinding(i)` highlights one.

Use it as a CI gate: `expect(auditScene(scene)).toEqual([])`.

## Snapshots & diffs

```typescript
import { captureSnapshot, diffSnapshots } from '@vectojs/devtools/headless';

const before = captureSnapshot(scene); // deterministic JSON tree
// … perform an interaction …
const diffs = diffSnapshots(before, captureSnapshot(scene));
// -> [{ path: "root > GridEntity[0]", kind: "changed", changes: { x: {from,to} } }]
```

Diffs key on **structural paths** (`type[index]` chains), never entity ids —
ids are random per run. Default-valued props are omitted from snapshots, so
diffs stay quiet. Snapshot pairs make precise golden-state assertions in smoke
tests: instead of screenshotting, assert that an interaction changed exactly
the entities it should have.

## Lower-level model utilities

The tree-building and picking logic is exported separately if you want to build a custom inspector UI instead of the built-in panel:

```typescript
import {
  buildTreeModel,
  findEntityAt,
  describeEntity,
  inspectEntity,
  entityPath,
  pickInScene,
} from '@vectojs/devtools';

buildTreeModel(root: Entity): { nodes: TreeNode[]; index: Map<string, Entity> };
findEntityAt(root: Entity, x: number, y: number): Entity | null; // scene-space point → entity
describeEntity(entity: Entity): string[]; // human-readable state lines
inspectEntity(entity: Entity): EntityInfo; // structured, JSON-safe state
entityPath(entity: Entity): string; // ancestry chain ("Scene > Card#<id> > Text#<id>", ids truncated to 8 chars)
pickInScene(scene: Scene, sceneX: number, sceneY: number): Entity | null; // overlay-first pick
```

`inspectEntity` is the structured sibling of `describeEntity`: world bounds and
transform, interaction flags, `clipChildren`, child count, a duck-typed text
preview (`.text`/`.value`), and the a11y projection attributes when present.

## Debugging workflows

The devtools model layer answers layout questions with numbers — reach for it
before reaching for a screenshot. Symptom → tool:

| Symptom                                              | Workflow                                                                                                                                                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Which entity owns this pixel?"                      | `pickInScene(scene, x, y)` → `inspectEntity(hit)`; in-page, the panel's **Pick** button                                                                                                                                 |
| "Why is this entity positioned/sized wrong?"         | `inspectEntity` for world bounds + transform, then walk `entityPath` upward — the first ancestor whose bounds are wrong owns the bug                                                                                    |
| "Something overflows/overlaps but I can't see where" | `auditScene(scene)` — each finding carries `entityPath`, world bounds, and per-edge overflow amounts                                                                                                                    |
| "This interaction moved something it shouldn't"      | `captureSnapshot` before, interact, `diffSnapshots` after — the diff lists exactly what changed                                                                                                                         |
| "A click/wheel/keypress goes to the wrong place"     | `createEventTrace(scene)` — each entry shows source (`canvas`/`a11y`/`content`/`document`), target path, coordinates, and the final `defaultPrevented`                                                                  |
| "Text drag-selection or copy is being intercepted"   | Event trace with `entry.source === 'content'` — it means the browser event began on a selectable projection; check `defaultPrevented` and the target path                                                               |
| "A drag gets stuck / never commits"                  | Pointer traces are transactional: expect `pointerdown` → moves → exactly one `pointerup` (commit) **or** `pointercancel` (rollback); a missing terminal entry means the entity wasn't projected or capture was bypassed |
| "Is this a regression?"                              | Keep a committed snapshot (`captureSnapshot`) of the healthy scene and `diffSnapshots` against it in CI                                                                                                                 |

## Design notes

- The panel scene is constructed with `contentProjection: false` and `renderMode: 'onDemand'` — it must not project its own DOM content or repaint every frame while idle.
- Selection state lives on the panel, not the host: `select()`/`armPick()` never mutate the inspected scene except for the highlight overlay entity, which is added via `showOverlay()` and removed on `destroy()`.
- Auto-refresh is a plain interval, not a Scene animation — it works even while the host scene is fully idle (`onDemand`, nothing dirty).
- The dock (`position: fixed; right: 0; width: 320px` by default, full viewport height) and its canvas are `pointer-events: none`, mirroring how the main `Scene`'s own `a11yRoot` opts out while individual interactive shadow elements opt back in via `auto` (`@vectojs/devtools@0.4.3+`). This means clicks over the dock's empty background/chrome fall through to whatever host content sits underneath — including a host app's own right-edge controls (tab close buttons, toolbar buttons) that would otherwise sit in the dock's 320px band. Only the panel's own a11y-projected controls (buttons, VMT tree rows) are independently clickable, through their own `auto` opt-in.
