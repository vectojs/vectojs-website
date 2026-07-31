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
  <iframe src="/sandbox/ui/component.html?name=tabs&v=core-1.25.0-ui-2.6.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Tabs" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Cambiar de pestaña elimina el contenido inactivo del árbol de entidades.</figcaption>
</figure>

## Ejemplo mínimo

````ts
import { Tabs, Text } from '@vectojs/ui';

const tabs = new Tabs({
  width: 480,
  height: 260,
  tabs: [
    { id: 'usage', label: 'Uso', content: new Text('Panel de uso') },
    { id: 'api', label: 'API', content: new Text('Panel de API') },
  ],
});

## Ocultar la barra para una sola pestaña

Los editores y las aplicaciones tipo terminal a menudo quieren el comportamiento `showtabline=1` de Vim: sin
barra de pestañas mientras solo exista una pestaña. Pasa `autoHideTabBar: true`
(`@vectojs/ui` >= 1.9.5) — la barra (y su región de impacto de puntero) desaparece
por debajo de dos pestañas, el contenido ocupa toda la altura y la barra regresa tan
pronto como se añade una segunda pestaña. Los propietarios que distribuyen hermanos alrededor de la barra
deben leer el getter en vivo `effectiveTabBarHeight` en lugar de asumir
`tabHeight`.

```ts
const tabs = new Tabs({
  width: 480,
  height: 260,
  autoHideTabBar: true,
  tabs: [{ id: 'only', label: 'untitled', content: editorView }],
});
tabs.effectiveTabBarHeight; // 0 ahora, tabHeight cuando se abra una segunda pestaña
````

## Lista de verificación para mantenedores

- Mantén el tamaño del contenido de las pestañas sincronizado con el tamaño del contenedor.
- Emite `change` solo cuando la pestaña activa realmente cambie.
- Preserva el comportamiento del teclado/foco en futuras semánticas a nivel de pestaña.
