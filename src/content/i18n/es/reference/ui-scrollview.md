---
title: 'UI: ScrollView'
description: 'Contenedor de desplazamiento recortado con desplazamiento por rueda y arrastre de puntero.'
order: 32
---

# `ScrollView`

`ScrollView` posee una región recortada desplazable. Úsalo cuando el contenido limitado pueda exceder el área
visible.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ScrollView</span></div>
  <iframe src="/sandbox/ui/component.html?name=scrollview&v=core-1.32.3-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de ScrollView" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Usa la rueda o arrastra dentro del viewport; evita propietarios de desplazamiento anidados en conflicto.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { ScrollView, Text } from '@vectojs/ui';

const view = new ScrollView({ width: 360, height: 220 });
view.add(new Text('Contenido largo').setPosition(16, 16));
scene.add(view);
```

## Lista de verificación para mantenedores

- Mantén un propietario de rueda por región visible.
- Llama a `updateContentSize()` después de cambios en la colocación directa de hijos.
- Usa `scrollToBottom()` para contenido transmitido por streaming fijado al final.
