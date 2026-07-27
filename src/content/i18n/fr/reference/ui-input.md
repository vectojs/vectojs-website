---
title: 'UI: Input'
description: 'Saisie de texte monoligne avec comportement dʼédition natif reflété sur le canvas.'
order: 23
---

# `Input`

`Input` utilise un vrai `<input>` transparent pour lʼédition tout en peignant le champ visible sur le canvas.
LʼIME, le presse-papier, la sélection et lʼautomatisation restent natifs.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Input</span></div>
  <iframe src="/sandbox/ui/component.html?name=input&v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live dʼInput" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Remplissez la zone de texte via la saisie au clavier ou lʼautomatisation basée sur les rôles.</figcaption>
</figure>

## Exemple minimal

```ts
import { Input } from '@vectojs/ui';

const name = new Input({
  width: 320,
  placeholder: 'Project name',
  onChange: (value) => updateProjectName(value),
});
```

## Composition IME

Lorsquʼune composition IME est active, le composant dessine un soulignement sous la plage de composition. La **surbrillance de sélection est supprimée** pendant la durée : composer par-dessus du texte sélectionné remplace logiquement cette plage, mais lʼélément natif continue de rapporter le `selectionStart`/`selectionEnd` pré-composition jusquʼà ce que la composition soit validée — le dessiner afficherait une surbrillance obsolète derrière (et plus large que) le soulignement de composition. Une composition de longueur zéro (le `compositionstart` initial) affiche toujours la sélection, puisque rien ne lʼa encore remplacée.

## Liste de vérification pour les mainteneurs

- Utilisez `Input` plutôt que des entités de saisie de texte personnalisées.
- Gardez le placeholder pertinent ; cʼest aussi le libellé accessible par défaut.
- Préservez la sélection intentionnellement lors de lʼimplémentation de mises à jour contrôlées.
