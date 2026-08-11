+++
title = "Introduction to VectoJS"
description = "A concise overview of what VectoJS is, what it is for, and where to go next."
weight = 1

[extra]
order = 1
+++

# Introduction to VectoJS

VectoJS is a **canvas-native UI runtime** that renders interfaces directly on HTML5 Canvas using a Virtual Math Tree (VMT) architecture.

## Why VectoJS?

Traditional web UIs rely on the DOM — a tree of HTML elements styled with CSS and manipulated with JavaScript. This works well for documents, but introduces overhead for:

- **High-frequency updates** (animations, real-time data)
- **Large entity counts** (thousands of UI elements)
- **Complex layouts** (custom positioning, physics-based motion)

VectoJS bypasses the DOM entirely, rendering everything on a single `<canvas>` element while maintaining full accessibility through semantic projection.

## Core Concepts

### Scene and Entity

Every VectoJS app starts with a `Scene` attached to a `<canvas>`:

```typescript
import { Scene } from '@vectojs/core';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const scene = new Scene(canvas, { maxFPS: 60 });
scene.renderMode = 'onDemand';
scene.start();
```

### Text and RichText

```typescript
import { Text, RichText } from '@vectojs/ui';

// Plain text
const label = new Text('Hello, world!', {
  font: '16px system-ui, sans-serif',
  color: '#111827',
});

// Mixed bold/italic/link
const rich = new RichText(
  [
    { text: 'VectoJS is ' },
    { text: 'fast', style: { bold: true } },
    { text: ' and ' },
    { text: 'accessible', style: { italic: true } },
  ],
  { font: '16px system-ui, sans-serif' },
);
```

### Inline code

Use `scene.markDirty()` to request a repaint, `scene.resize(w, h)` after viewport changes,
and `entity.setPosition(x, y)` to move any entity. Arabic: مرحبا. Emoji: 🎨 🚀 ✅.

### Arabic and bidirectional text

```typescript
// RTL paragraphs need readingDirection on the Scene
scene.readingDirection = 'rtl';
const arabic = new Text('مرحبا بالعالم', { font: '18px system-ui, sans-serif' });
```
