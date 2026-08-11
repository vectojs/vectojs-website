+++
title = "UI: ScrollView"
description = "Clipped scroll container with wheel and pointer-drag scrolling."
weight = 32

[extra]
order = 32
+++

# `ScrollView`

`ScrollView` owns one scrollable clipped region. Use it when bounded content can exceed the visible
area.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ScrollView</span></div>
  <iframe src="/sandbox/ui/component.html?name=scrollview&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ScrollView live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Wheel or drag inside the viewport; avoid nested competing scroll owners.</figcaption>
</figure>

## Minimal example

```ts
import { ScrollView, Text } from '@vectojs/ui';

const view = new ScrollView({ width: 360, height: 220 });
view.add(new Text('Long content').setPosition(16, 16));
scene.add(view);
```

## Maintainer checklist

- Keep one wheel owner per visible region.
- Call `updateContentSize()` after direct child placement changes.
- Use `scrollToBottom()` for streaming content pinned to the end.
