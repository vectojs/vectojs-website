+++
title = "UI: Text"
description = "Composant de texte sur canvas avec enroulement, reflow à chaud de maxWidth et un libellé sémantique."
weight = 16
+++

# `Text`

`Text` affiche du texte multiligne à style unique sur le canvas. Cʼest le choix par défaut pour les libellés, le texte
dʼaide, les titres et le texte court en lecture seule dans VectoJS UI. Sa projection de contenu transparente conserve
le texte source logique exact à travers les enroulements souples, les retours à la ligne explicites, le texte CJK, les ligatures et les paragraphes
RTL, de sorte que la sélection native, la copie, la recherche dans la page et la traduction nʼhéritent pas de lʼordre visuel des glyphes.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Text</span></div>
  <iframe src="/sandbox/ui/component.html?name=text&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de Text" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Redimensionnez la page pour inspecter le reflow à chaud de `maxWidth` dans une zone dʼaffichage ciblée.</figcaption>
</figure>

## Exemple minimal

```ts
import { Text } from '@vectojs/ui';

const heading = new Text('UI mathématique sur canvas', {
  font: '700 24px Inter, system-ui',
  color: '#f8fafc',
  maxWidth: 360,
  lineHeight: 32,
  selectable: true,
});

scene.add(heading.setPosition(24, 24));
```

## Liste de vérification pour les mainteneurs

- Utilisez `setMaxWidth()` pour les changements de largeur responsifs.
- Utilisez `setText()` ou `append()` pour les changements de contenu.
- Utilisez `setSelectable(false)` lorsque les gestes de glissement doivent posséder la région de texte plutôt que la sélection du navigateur.
- Gardez la source de lʼapplication dans lʼordre Unicode logique ; VectoJS et le navigateur résolvent la direction arabe/hébreu automatiquement.
- Core 1.8 résout les curseurs de pointeur dans la géométrie bidimensionnelle transformée ; nʼajoutez pas de gestionnaires de sélection basés uniquement sur la largeur de la zone dʼaffichage pour le texte pivoté, miré ou mis à lʼéchelle non uniformément.
- Préférez `RichText` lorsque des styles en ligne ou des liens sont nécessaires.
