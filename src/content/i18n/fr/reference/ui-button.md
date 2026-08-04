---
title: 'Button'
description: 'Composant bouton rendu sur canvas avec une projection sémantique de bouton pour lʼaccessibilité et lʼautomatisation.'
order: 12
---

# `Button`

`Button` affiche un bouton arrondi sur le canvas et projette un vrai `<button>` transparent par-dessus
la même zone. Les utilisateurs voient les pixels du canvas ; les lecteurs dʼécran et les outils dʼautomatisation manipulent le nœud sémantique.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Button</span></div>
  <iframe src="/sandbox/ui/button.html?v=core-1.31.0-ui-2.13.0" class="sandbox-frame component-demo-frame" loading="eager" title="Démonstration live du bouton" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Le survol change lʼétat peint. Les clics passent par le même rôle button que Playwright peut détecter.</figcaption>
</figure>

## Exemple minimal

```ts
import { Scene } from '@vectojs/core';
import { Button } from '@vectojs/ui';

const scene = new Scene(canvas);
scene.renderMode = 'onDemand';

scene.add(
  new Button('Save changes', {
    onClick: () => save(),
  }).setPosition(40, 40),
);

scene.start();
```

## Constructeur

```ts
new Button(label: string, opts?: ButtonOptions & { width?: number; height?: number })

interface ButtonOptions {
  onClick?: (event: unknown) => void;
  bg?: string;
  hoverBg?: string;
  color?: string;
  font?: string;
  padding?: number;
  radius?: number;
  focusColor?: string;       // 2.7.0+ — focus-ring color, default '#00f0ff'
}
```

L'anneau de focus est tracé sur 2px dans `focusColor`. Définissez-le sur tout thème qui n'est pas la palette sombre par défaut pour laquelle le cyan par défaut a été réglé :

```ts
const save = new Button('Save', { bg: '#f43f5e', focusColor: '#60a5fa' });
```

Un anneau de focus est la seule affordance dont un utilisateur clavier ne peut pas se passer, il doit donc se lire clairement sur votre surface plutôt que d'être simplement présent — visez au-delà du seuil de contraste non textuel de 3:1 (WCAG SC 1.4.11), et préférez une teinte distincte de votre couleur d'accent pour que le focus ne soit jamais lu comme une simple emphase. Le mode couleurs forcées l'ignore au profit de la couleur système `Highlight`, donc le définir ne peut pas casser le contraste élevé.

## Accessibilité et automatisation

`Button` expose `{ tag: 'button', role: 'button', label }`, donc les tests devraient cibler le contrôle
sémantique plutôt que les pixels :

```ts
await page.getByRole('button', { name: 'Save changes' }).click();
```

### `disabled` (2.3.0+)

`disabled` est dessiné de manière atténuée **et** projeté sur le shadow `<button>`, de sorte que ce
qu'un utilisateur voyant perçoit et ce qu'un lecteur d'écran signale ne peuvent pas diverger. Modifiable
après construction :

```ts
const save = new Button('Save', { onClick: submit });
save.disabled = true; // remplissage atténué, projette `disabled`, annule l'état de survol/focus
```

Il bloque également `onClick` à partir des **deux** chemins d'entrée. Le navigateur supprime un clic
DOM sur un `<button>` désactivé, mais le hit-test du canvas se déclenche indépendamment
— l'attribut natif seul ne suffirait donc pas.

Un bouton activé omet l'attribut plutôt que d'écrire `disabled="false"`,
ce qui désactiverait toujours un `<button>` natif.

## Couleurs forcées (Contraste élevé)

`Button` lit [`Scene.forcedColors`](/reference/core-scene/#accessibilité-et-apparence) et, lorsque le système d'exploitation est en mode couleurs forcées, repeint avec les couleurs système CSS au lieu de sa palette thématique : un remplissage `ButtonFace`, un libellé `ButtonText` plus une bordure `ButtonText` de 1px (pour que la forme soit visible sur le fond système), et un anneau de focus `Highlight`. Les pixels du canvas sont exemptés du remappage de couleurs forcées du navigateur, donc un composant qui omet ce comportement reste illisible en Contraste élevé. La scène repeint automatiquement lorsque le paramètre change.

## Liste de vérification pour les mainteneurs

- Le survol et le départ du pointeur doivent appeler `scene.markDirty()` dans les scènes `onDemand`.
- Le libellé visuel du bouton et le libellé accessible doivent rester identiques sauf si une future option ajoute un nom accessible explicite.
- Préférez `Button` aux rectangles cliquables personnalisés dans les exemples de documentation.
- Les composants bouton personnalisés doivent refléter la branche couleurs forcées ci-dessus.

Voir aussi : [`Toggle`](/reference/ui-components/#toggle), [`Checkbox`](/reference/ui-components/#checkbox), [`Overlay`](/reference/ui-overlay/).
