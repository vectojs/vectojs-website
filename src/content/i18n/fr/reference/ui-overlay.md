---
title: 'Overlay'
description: 'Primitives dʼUI flottante pour Tooltip, Popover et ContextMenu, montées via la racine de superposition de la Scene.'
order: 15
---

# Overlay

La famille des superpositions affiche une UI transitoire au-dessus de lʼarbre dʼentités normal. Les superpositions se montent via
`scene.overlayRoot`, elles peuvent donc échapper aux conteneurs clipsés tout en utilisant les coordonnées de la scène et
le même système dʼanimation.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Overlay</span></div>
  <iframe src="/sandbox/ui/overlay.html?v=core-1.30.0-ui-2.12.0" class="sandbox-frame component-demo-frame component-demo-frame-tall" loading="eager" title="Démonstration live dʼOverlay" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Survolez ou cliquez sur les lanceurs. Popover et ContextMenu sont positionnés pour éviter le défaut de débordement difficile à détecter dans une grande galerie.</figcaption>
</figure>

## Exemple minimal

```ts
import { Button, Popover, Text } from '@vectojs/ui';

const target = new Button('Cliquez · Popover').setPosition(40, 40);
const popover = new Popover({
  target,
  width: 220,
  height: 92,
  placement: 'right',
});

popover.add(new Text('Contenu du Popover').setPosition(14, 18));
scene.add(target);
scene.add(popover);
```

## Composants

| Composant     | Déclencheur                            | Cas dʼutilisation                               |
| ------------- | -------------------------------------- | ----------------------------------------------- |
| `Tooltip`     | Survoler la cible avec délai optionnel | Texte explicatif léger                          |
| `Popover`     | Cliquer sur la cible                   | Petits panneaux transitoires avec nœuds enfants |
| `ContextMenu` | Généralement clic droit ou clic        | Menus de commandes avec séparateurs/éléments    |
| `Overlay`     | `showAt()`/`showAtPoint()` manuel      | Composants flottants personnalisés              |

## Liste de vérification pour les mainteneurs

- Utilisez `target.getWorldBounds()` pour les cibles transformées.
- Limitez les exemples à la zone dʼaffichage ou aux limites de la carte démontrée.
- Cachez ou supprimez lʼUI transitoire lorsque sa cible quitte lʼarbre.
- Gardez le contenu de la superposition lisible sur les contrôles sous-jacents ; utilisez des arrière-plans suffisamment opaques.

Voir aussi : [`Button`](/reference/ui-button/), [`ScrollView`](/reference/ui-components/#scrollview), [`Modal`](/reference/ui-components/#modal).
