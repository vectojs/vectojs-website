---
title: 'UI: Paneles redimensionables'
description: 'PanelGroup, Panel y PanelResizeHandle para diseños de paneles divididos arrastrables.'
order: 35
---

# Paneles redimensionables

Las exportaciones de paneles redimensionables funcionan juntas: `PanelGroup` divide el espacio, `Panel` posee una región de contenido
recortada y `PanelResizeHandle` se inserta automáticamente entre los paneles.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · PanelGroup</span></div>
  <iframe src="/sandbox/ui/component.html?name=resizablepanel&v=core-1.9.2-ui-1.9.5" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de panel redimensionable" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Arrastra el divisor entre paneles para inspeccionar el comportamiento de cambio de tamaño y hover del mango.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Panel, PanelGroup, Text } from '@vectojs/ui';

const group = new PanelGroup({ direction: 'horizontal', width: 640, height: 360 });
group
  .addPanel(new Panel({ minSize: 160 }).setContent(new Text('Barra lateral')))
  .addPanel(new Panel({ minSize: 260 }).setContent(new Text('Canvas')));
```

## Lista de verificación para mantenedores

- Preserva el `minSize` de cada panel al arrastrar.
- Llama a `resize(width, height)` cuando el contenedor anfitrión cambie de tamaño.
- Mantén las instancias anidadas de `PanelGroup` dentro del límite de contenido de un `Panel`.
