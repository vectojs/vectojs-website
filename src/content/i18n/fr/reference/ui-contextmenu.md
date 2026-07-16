---
title: 'UI: ContextMenu'
description: 'Menu de commandes superposé avec séparateurs, lignes désactivées, raccourcis et sous-menus imbriqués.'
order: 39
---

# `ContextMenu`

`ContextMenu` est un menu superposé pour les surfaces de commandes.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ContextMenu</span></div>
  <iframe src="/sandbox/ui/component.html?name=contextmenu&v=core-1.9.2-ui-1.9.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de ContextMenu" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Cliquez sur le lanceur pour ouvrir le menu dans une zone dʼaffichage contrainte.</figcaption>
</figure>

## Exemple minimal

```ts
import { ContextMenu } from '@vectojs/ui';

const menu = new ContextMenu({
  items: [
    { label: 'Copy', shortcut: 'Ctrl+C' },
    { separator: true },
    { label: 'Delete', disabled: true },
  ],
});

target.on('contextmenu', (event) => menu.showAtPoint(event.globalX, event.globalY));
```

## Liste de vérification pour les mainteneurs

- Ne laissez pas le texte du menu déborder du panneau.
- Maintenez les lignes désactivées non interactives.
- Repositionnez les sous-menus imbriqués via la racine de la superposition.
