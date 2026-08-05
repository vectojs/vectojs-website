---
title: 'UI: Tabs'
description: 'Tabbed panel container that mounts the active content view.'
order: 29
---

# `Tabs`

`Tabs` draws a tab bar and mounts only the active tab content entity.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Tabs</span></div>
  <iframe src="/sandbox/ui/component.html?name=tabs&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Tabs live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Switching tabs removes inactive content from the entity tree.</figcaption>
</figure>

## Minimal example

```ts
import { Tabs, Text } from '@vectojs/ui';

const tabs = new Tabs({
  width: 480,
  height: 260,
  tabs: [
    { id: 'usage', label: 'Usage', content: new Text('Usage panel') },
    { id: 'api', label: 'API', content: new Text('API panel') },
  ],
});
```

## Hiding the bar for a single tab

Editors and terminal-style apps often want Vim's `showtabline=1` behavior: no
tab bar while only one tab exists. Pass `autoHideTabBar: true`
(`@vectojs/ui` >= 1.9.5) — the bar (and its pointer hit region) disappears
below two tabs, the content occupies the full height, and the bar returns as
soon as a second tab is added. Owners laying out siblings around the bar
should read the live `effectiveTabBarHeight` getter instead of assuming
`tabHeight`.

```ts
const tabs = new Tabs({
  width: 480,
  height: 260,
  autoHideTabBar: true,
  tabs: [{ id: 'only', label: 'untitled', content: editorView }],
});
tabs.effectiveTabBarHeight; // 0 now, tabHeight once a second tab opens
```

`Tabs` projects `{ role: 'tablist', label }`. Since 2.8.0 the tab bar's own
accessible name is settable, defaulting to `'Tab switching panel'`:

```ts
new Tabs({
  label: 'Inspector sections',
  width: 480,
  height: 240,
  tabs: [
    { id: 'usage', label: 'Usage', content: usagePanel },
    { id: 'api', label: 'API', content: apiPanel },
  ],
});
```

Same reasoning as [`RadioGroup`](/reference/ui-radiogroup/): each tab is named,
but the tablist's name is what says what the tabs switch _between_. Set it
whenever a screen has more than one tablist, or when the heading identifying the
group of tabs is drawn on the canvas (WCAG 4.1.2).

## Maintainer checklist

- Keep tab content sizing in sync with container size.
- Emit `change` only when the active tab actually changes.
- Preserve keyboard/focus behavior in future tab-level semantics.
