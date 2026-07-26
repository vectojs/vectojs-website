---
title: 'UI: TextArea'
description: 'Édition de texte multiligne native avec rendu sur canvas.'
order: 24
---

# `TextArea`

`TextArea` reflète un `<textarea>` natif sur le canvas, préservant le comportement dʼédition du navigateur.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TextArea</span></div>
  <iframe src="/sandbox/ui/component.html?name=textarea&v=core-1.17.0-ui-2.2.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de TextArea" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Lʼédition multiligne est native ; le canvas peint le miroir visuel.</figcaption>
</figure>

## Exemple minimal

```ts
import { TextArea } from '@vectojs/ui';

const notes = new TextArea({
  width: 420,
  height: 140,
  placeholder: 'Écrire une note…',
  onChange: (value) => saveDraft(value),
});
```

## Composition IME

Lorsquʼune composition IME est active, le composant dessine un soulignement sous la plage de composition. La **surbrillance de sélection est supprimée** pendant la durée : composer par-dessus du texte sélectionné remplace logiquement cette plage, mais lʼélément natif continue de rapporter le `selectionStart`/`selectionEnd` pré-composition jusquʼà ce que la composition soit validée — le dessiner afficherait une surbrillance obsolète derrière (et plus large que) le soulignement de composition. Une composition de longueur zéro (le `compositionstart` initial) affiche toujours la sélection, puisque rien ne lʼa encore remplacée.

## Liste de vérification pour les mainteneurs

- Utilisez ceci pour une véritable saisie de texte multiligne.
- Gardez un seul propriétaire dʼédition de texte ; ne simulez pas lʼIME ou le presse-papier dans le canvas.
- Testez avec la sélection au clavier et le collage, pas seulement les clics de pointeur.
- Le textarea natif transparent hérite de la police du canvas, de la hauteur de ligne,
  du padding et du contrat `border-box`, donc le clic-à-curseur et les lignes de sélection utilisent
  la même géométrie que le miroir canvas visible.
