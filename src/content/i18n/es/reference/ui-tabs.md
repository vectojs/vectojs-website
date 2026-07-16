---
title: 'UI: Tabs'
description: 'Contenedor de paneles con pestañas que monta la vista de contenido activa.'
order: 29
---

# `Tabs`

`Tabs` dibuja una barra de pestañas y monta solo la entidad de contenido de la pestaña activa.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Tabs</span></div>
  <iframe src="/sandbox/ui/component.html?name=tabs&v=core-1.9.2-ui-1.9.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Tabs" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Cambiar de pestaña elimina el contenido inactivo del árbol de entidades.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Tabs, Text } from '@vectojs/ui';

const tabs = new Tabs({
  width: 480,
  height: 260,
  tabs: [
    { id: 'usage', label: 'Uso', content: new Text('Panel de uso') },
    { id: 'api', label: 'API', content: new Text('Panel de API') },
  ],
});
```

## Lista de verificación para mantenedores

- Mantén el tamaño del contenido de las pestañas sincronizado con el tamaño del contenedor.
- Emite `change` solo cuando la pestaña activa realmente cambie.
- Preserva el comportamiento del teclado/foco en futuras semánticas a nivel de pestaña.
