+++
title = "@vectojs/devtools"
description = "The in-page Virtual Math Tree inspector and its headless model layer — entity picking, tree view, audits, snapshots, GPU and accelerator readouts, and a JSON-RPC bridge."
weight = 48
+++

# `@vectojs/devtools`

Version documented: **0.11.1**

`@vectojs/devtools` is the answer to "where's the Elements panel?" — an inspector for the Virtual Math Tree, so debugging a VectoJS scene stays in state space instead of pixel space. It has two halves:

| Half                                               | Use                                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The panel** (`@vectojs/devtools`)                | An in-page dock, itself a VectoJS `Scene`, with tabs for the tree, entity state, audits, a11y, an event log, and settings. Documented on this page.     |
| **The model layer** (`@vectojs/devtools/headless`) | ~60 pure functions that answer layout, a11y, hit-testing, text, and performance questions as data. No DOM panel, usable in tests, CI, Node, and agents. |

The model layer is the larger and more useful half. Reach for it before reaching for a screenshot — a number tells you _which_ entity is wrong, where a picture only tells you that something is.

| Page                                            | Contents                                                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [Inspecting](/reference/devtools-inspect/)      | Tree model, picking, entity/a11y/text state, highlight geometry, hit-test explanation, event routing trace.                   |
| [Auditing](/reference/devtools-audit/)          | Every `audit*` function — layout, a11y, text shaping, selection drift — plus snapshots and diffs for regression assertions.   |
| [Performance](/reference/devtools-perf/)        | GPU and draw counters, WASM accelerator status, dirty-repaint attribution, Markdown streaming metrics.                        |
| [Bridge & plugins](/reference/devtools-extend/) | The JSON-RPC protocol for driving a scene from another document, and the plugin protocol for adding your own tabs and audits. |

---

## Installation

```bash
bun add -D @vectojs/devtools
```

The panel mounts a VectoJS scene and listens on `document`, so keep it out of production bundles. Import the model layer from the `headless` subpath — it carries no panel code and no `@vectojs/ui` dependency:

```ts
import { auditScene, captureSnapshot, inspectEntity } from '@vectojs/devtools/headless';
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

> [!IMPORTANT]
> Everything under `@vectojs/devtools/headless` is also re-exported from the package root, so a single `attachDevtools` import does not stop you calling `auditScene`. The subpath exists so a production test bundle can pull in the model layer without the panel.

---

## What the panel shows

The header carries three ghost icon buttons — **⌖** (pick), **⟳** (refresh), **⚠** (audit) — and three count badges: total entities, interactive (**⚡**), and audit findings (**⚠**). A `Tabs` bar splits the tools into **Tree · Info · Audit · A11y · Log · ⚙**, plus one tab per registered [plugin inspector](/reference/devtools-extend/#plugin-protocol). A perf strip is pinned at the bottom.

- **Live tree view** (`Tree`) of `scene.rootEntity` and `scene.overlayRootEntity`, refreshed on an interval (default 500ms). Each row shows the entity's constructor name, position, size, and two badges: **⚡** (`interactive`) and **▶** (`hasPendingAnimations()`). A **filter** field narrows rows by type/id substring; it is view-only, so the id→entity index still resolves everything. Programmatic: `panel.setFilter(text)`.
- **Pick mode**: click **⌖**, then click anywhere on the page. The inspector resolves the click to the deepest entity under that point using the same walk order the Scene uses for pointer input, with an AABB fallback for decorative, non-interactive entities.
- **Selection highlight**: the selected entity's geometry is outlined on the _host_ scene's overlay layer, so you see exactly what is selected relative to the live render. By default it draws the layout box; `panel.setHighlightLayers()` switches it to any of the seven [geometry layers](/reference/devtools-inspect/#highlight-geometry) — including `'hit'`, which samples the entity's real hit region rather than its box.
- **State readout + inline editing** (`Info`): geometry, scale/rotation/opacity, the full world transform matrix, animation state, and any `getDevtoolsDescriptor()` output the entity publishes. Adds inline `x`/`y`/`opacity` editors and **Copy path** / **Copy JSON** buttons.
- **A11y tab**: the selected entity's projected role, accessible name and its source, tab index, reading-order position, and the canvas-vs-DOM box — plus the scene-wide [a11y audit](/reference/devtools-audit/#a11y-audit) findings.
- **Keyboard nudge editing**: with an entity selected, arrow keys move it by 1px (Shift: 10px); `+`/`-` step opacity by 0.1. Useful for confirming _which_ entity a layout bug belongs to before touching code.
- **Performance HUD**: a bottom strip reads [`Scene.frameStats`](/reference/core-scene) — fps, ms/frame, entity count, render mode, and rendered/skipped frame counts. The fps is the real _rendered-frame_ cadence, so an idle `onDemand` scene honestly reads 0 fps — and an auto-throttled `'always'` scene reads its idle floor (60 fps by default) — rather than a fake 60. Disable with `showPerf: false`.
- **Settings** (`⚙`): toggle the selection highlight, and switch the refresh interval and dock side (left/right) live.

The panel reflows on window resize, so the bottom perf strip stays on-screen at any viewport height or zoom level. The dock and its canvas use `pointer-events: none`; only their projected interactive controls opt back in — so the inspector never steals input from host controls underneath empty dock pixels, while its own rows, tabs, inputs, and buttons remain clickable.

---

## API

```typescript
function attachDevtools(
  scene: Scene,
  options?: DevtoolsOptions,
): DevtoolsPanel & { detach(): void };

interface DevtoolsOptions {
  width?: number; // panel width in px, default 360
  refreshInterval?: number; // ms; 0 disables auto-refresh. Default 500
  traceEvents?: boolean; // show bounded pointer/wheel/keyboard routing records
  traceCapacity?: number; // retained trace records, default 50
  dockSide?: 'right' | 'left'; // default 'right'
  showPerf?: boolean; // live perf HUD strip, default true
  defaultTab?: string; // 'tree' | 'inspect' | 'audit' | 'a11y' | 'events' | 'settings'
}

class DevtoolsPanel {
  refresh(force?: boolean): void; // rebuild the tree model from the host scene
  armPick(): void; // one-shot: the next page click selects the entity under it
  select(entity: Entity): void; // select programmatically
  get selection(): Entity | null;
  get trace(): EventTrace | null; // null unless traceEvents was enabled
  setFilter(text: string): void; // filter the tree by type/id substring
  setHighlightEnabled(on: boolean): void;
  setHighlightLayers(kinds: ReadonlyArray<HighlightLayerKind>, hitSampleStep?: number): void;
  getHighlightLayers(): ReadonlyArray<HighlightLayer>; // layers from the last draw
  setRefreshInterval(ms: number): void;
  setDockSide(side: 'right' | 'left'): void;
  audit(): AuditFinding[]; // run the layout audit; also fills the Audit tab
  selectFinding(i: number): void; // select + highlight the entity behind finding i
  getPluginFindings(): ReadonlyArray<PluginFinding>; // findings from plugin audits
  getPluginRows(inspectorId: string): PluginRow[]; // a plugin tab's current rows
  runCommand(qualifiedId: string): unknown; // run a `<pluginId>/<commandId>`
  destroy(): void; // tears down listeners, timers, host highlight, and the panel scene
}
```

`detach()` (returned by `attachDevtools`) is an alias for `destroy()`.

`refresh(force)` skips the rebuild when `scene.structureVersion` has not moved, so calling it on a tight interval is cheap; pass `true` to rebuild regardless. Independently of that check, the panel reconciles every 3s so a missed structure bump cannot leave the tree stale indefinitely.

`getPluginRows` returns `[]` for an unknown inspector id, with nothing selected, or when the inspector's `appliesTo` rejects the selection — the three cases are not distinguished. `runCommand` **throws** on an unknown command id rather than no-op'ing.

---

## Design notes

- The panel scene is constructed with `contentProjection: false` and `renderMode: 'onDemand'` — it must not project its own DOM content or repaint every frame while idle.
- Selection state lives on the panel, not the host: `select()`/`armPick()` never mutate the inspected scene except for the highlight overlay entity, which is added via `showOverlay()` and removed on `destroy()`.
- Auto-refresh is a plain interval, not a Scene animation — it works even while the host scene is fully idle (`onDemand`, nothing dirty).
- The dock (`position: fixed`, full viewport height) and its canvas are `pointer-events: none`, mirroring how the main `Scene`'s own `a11yRoot` opts out while individual interactive shadow elements opt back in via `auto`. Clicks over the dock's empty background fall through to whatever host content sits underneath — including a host app's own right-edge controls that would otherwise sit in the dock's band. Only the panel's own a11y-projected controls are independently clickable, through their own `auto` opt-in.

---

[Inspecting](/reference/devtools-inspect/) · [Auditing](/reference/devtools-audit/) · [Performance](/reference/devtools-perf/) · [Bridge & plugins](/reference/devtools-extend/)
