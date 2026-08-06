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
  <iframe src="/sandbox/ui/component.html?name=textarea&v=core-1.32.2-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de TextArea" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## Défilement

Le canvas suit le `scrollTop` de l'**élément natif** (2.10.0+). Le miroir est
l'autorité en matière de défilement et le navigateur l'a déjà fait défiler, donc il
n'y a aucun gestionnaire de molette — en ajouter un appliquerait le geste deux fois.

Avant 2.10.0, la position de défilement du canvas était uniquement pilotée par le
curseur, mise à jour quand `selectionStart` bougeait et jamais par la vue. Deux
défauts en découlaient. Un geste de molette déplaçait l'élément réel tandis que le
canvas restait sur place, si bien que le texte ne défilait pas du tout. Et comme
`selectionStart` est initialisé à `value.length`, une TextArea fraîchement montée
peignait le _bas_ de son contenu alors que l'élément natif se trouvait en haut —
32,6 lignes de désaccord mesurées sur un document de 60 lignes, ce qui plaçait le
curseur de chaque clic sur la mauvaise ligne.

Le suivi du curseur est conservé comme repli lorsqu'aucun miroir n'existe. Le
miroir définit aussi `scrollbar-width: none` : la gouttière d'une barre de
défilement native réduit `clientWidth` en dessous de la largeur du canvas, si bien
que les deux passent à la ligne à des endroits différents. Mesuré dans Firefox en
2.9.0, une TextArea de 516px de large avait une gouttière de 12px, de sorte que
l'élément natif passait à la ligne à 480px tandis que le canvas le faisait à 492px.
