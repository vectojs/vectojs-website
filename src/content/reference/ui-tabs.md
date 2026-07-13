---
title: 'UI: Tabs'
description: 'Tabbed panel container that mounts the active content view.'
order: 38
---

# `Tabs`

`Tabs` draws a tab bar and mounts only the active tab content entity.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Tabs</span></div>
  <iframe src="/sandbox/ui/component.html?name=tabs&v=ui-bundle-2" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Tabs live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## Maintainer checklist

- Keep tab content sizing in sync with container size.
- Emit `change` only when the active tab actually changes.
- Preserve keyboard/focus behavior in future tab-level semantics.
