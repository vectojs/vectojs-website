---
title: '@vectojs/devtools'
description: 'The in-page Virtual Math Tree inspector — entity picking, a live tree view, transform readout, and keyboard nudge editing, itself rendered with VectoJS.'
order: 6
---

# `@vectojs/devtools`

Version documented: **0.4.0**

`@vectojs/devtools` is the answer to "where's the Elements panel?" — an in-page inspector for the Virtual Math Tree, so debugging a VectoJS scene stays in state space instead of pixel space. The panel is itself a VectoJS `Scene` (dogfooding the framework it inspects), docked to the right edge of the page.

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

- **Live tree view** of `scene.rootEntity` and `scene.overlayRootEntity`, refreshed on an interval (default 500ms). Each row shows the entity's constructor name, position, size, and two badges: **⚡** (`interactive`) and **▶** (`hasPendingAnimations()`).
- **Pick mode**: click **Pick**, then click anywhere on the page. The inspector resolves the click to the deepest entity under that point using the same walk order the Scene uses for pointer input (with an AABB fallback for decorative, non-interactive entities).
- **Selection highlight**: the selected entity's world-space bounding box is drawn as an outline on the _host_ scene's overlay layer, so you see exactly what's selected relative to the live render.
- **State readout**: geometry, scale/rotation/opacity, the full world transform matrix, and animation state as plain text — the numbers a screenshot can't give you directly.
- **Keyboard nudge editing**: with an entity selected, arrow keys move it by 1px (Shift: 10px); `+`/`-` step opacity by 0.1. Useful for confirming _which_ entity a layout bug belongs to before touching code.

## API

```typescript
function attachDevtools(
  scene: Scene,
  options?: DevtoolsOptions,
): DevtoolsPanel & { detach(): void };

interface DevtoolsOptions {
  width?: number; // panel width in px, default 320
  refreshInterval?: number; // ms; 0 disables auto-refresh
  traceEvents?: boolean; // show bounded pointer/wheel/keyboard routing records
  traceCapacity?: number;
}

class DevtoolsPanel {
  refresh(): void; // rebuild the tree model from the host scene
  armPick(): void; // one-shot: the next page click selects the entity under it
  select(entity: Entity): void; // select programmatically
  get selection(): Entity | null;
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
`trace.destroy()` when the diagnostic surface unmounts.

## Lower-level model utilities

The tree-building and picking logic is exported separately if you want to build a custom inspector UI instead of the built-in panel:

```typescript
import { buildTreeModel, findEntityAt, describeEntity, pickInScene } from '@vectojs/devtools';

buildTreeModel(root: Entity): { nodes: TreeNode[]; index: Map<string, Entity> };
findEntityAt(root: Entity, x: number, y: number): Entity | null; // scene-space point → entity
describeEntity(entity: Entity): string[]; // human-readable state lines
pickInScene(scene: Scene, sceneX: number, sceneY: number): Entity | null; // overlay-first pick
```

## Design notes

- The panel scene is constructed with `contentProjection: false` and `renderMode: 'onDemand'` — it must not project its own DOM content or repaint every frame while idle.
- Selection state lives on the panel, not the host: `select()`/`armPick()` never mutate the inspected scene except for the highlight overlay entity, which is added via `showOverlay()` and removed on `destroy()`.
- Auto-refresh is a plain interval, not a Scene animation — it works even while the host scene is fully idle (`onDemand`, nothing dirty).
