---
title: 'UI: ContextMenu'
description: 'Menu de commandes superposé avec séparateurs, lignes désactivées, raccourcis et sous-menus imbriqués.'
order: 39
---

# `ContextMenu`

`ContextMenu` est un menu superposé pour les surfaces de commandes.

Les versions UI 1.11.1 à 1.11.3 sécurisent le cycle de vie des menus imbriqués : un seul backdrop, possédé par le menu racine, ferme ou détruit toute la chaîne ; un menu masqué ne conserve aucune surface sémantique ni cible de pointeur ; et chaque menu racine possède une identité de backdrop stable. Un `pointerdown` extérieur ferme immédiatement la chaîne, tandis que l'activation sémantique par `click` reste disponible au clavier et aux technologies d'assistance.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ContextMenu</span></div>
  <iframe src="/sandbox/ui/component.html?name=contextmenu&v=core-1.17.0-ui-2.2.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de ContextMenu" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

// `'contextmenu'` is not a VectoEvent — only pointerdown/up are dispatched
// into the tree. Filter `pointerdown` on the native right button (2), and
// pass the owning entity as the third arg so `showAtPoint` can find the
// scene even on the very first call (before any manual `scene.add(menu)`).
target.on('pointerdown', (event) => {
  const pointer = event.nativeEvent as PointerEvent | undefined;
  if (pointer?.button !== 2 || event.sceneX === undefined || event.sceneY === undefined) return;
  menu.showAtPoint(event.sceneX, event.sceneY, target);
});
```

## Accessibilité et clavier

Chaque élément non-séparateur projette un point d'accès `role="menuitem"` avec un **tabindex tournant** (le menu est un seul arrêt de tabulation), `disabled` le cas échéant, et `aria-haspopup="menu"` + `aria-expanded` sur un parent de sous-menu.

| Touche          | Action                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Bas / Haut      | Élément **activé** suivant / précédent, avec retour ; les séparateurs et éléments désactivés sont ignorés |
| Home / End      | Premier / dernier élément activé                                                                          |
| Droite          | Ouvrir un parent de sous-menu et donner le focus à son premier élément                                    |
| Gauche          | Fermer ce sous-menu et retourner le focus à son menu parent                                               |
| Entrée / Espace | Activer (ouvrir un sous-menu, ou déclencher `onClick` et fermer l'arbre du menu)                          |
| Échappement     | Fermer tout l'arbre du menu                                                                               |

Les points d'accès définissent `pointerEvents: 'none'` pour que le menu conserve sa propre gestion des clics par position via `pointerdown`. Voir [Widgets composites](/reference/core-a11y/#composite-widgets-roving-tabindex).

> **L'affichage d'un menu installe un arrière-plan sur toute la scène.** Un menu racine ajoute une entité interactive invisible de la taille de la scène pour capter le clic extérieur qui le ferme. Cet arrière-plan intercepte les événements de pointeur sur toute la scène pendant que le menu est ouvert — ne laissez donc pas un menu ouvert dans un fixture ou un test qui a également besoin de glisser/sélectionner ailleurs.

## Liste de vérification pour les mainteneurs

- Ne laissez pas le texte du menu déborder du panneau.
- Maintenez les lignes désactivées non interactives.
- Repositionnez les sous-menus imbriqués via la racine de la superposition.
- Gardez le menu racine comme unique propriétaire de l'arrière-plan partagé et fermez la chaîne complète des sous-menus sur commande, pointerdown externe ou destruction.
