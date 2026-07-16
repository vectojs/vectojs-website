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
  <iframe src="/sandbox/ui/button.html?v=core-1.9.2-ui-1.9.5" class="sandbox-frame component-demo-frame" loading="eager" title="Démonstration live du bouton" sandbox="allow-scripts allow-same-origin"></iframe>
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
}
```

## Accessibilité et automatisation

`Button` expose `{ tag: 'button', role: 'button', label }`, donc les tests devraient cibler le contrôle
sémantique plutôt que les pixels :

```ts
await page.getByRole('button', { name: 'Save changes' }).click();
```

## Liste de vérification pour les mainteneurs

- Le survol et le départ du pointeur doivent appeler `scene.markDirty()` dans les scènes `onDemand`.
- Le libellé visuel du bouton et le libellé accessible doivent rester identiques sauf si une future option ajoute un nom accessible explicite.
- Préférez `Button` aux rectangles cliquables personnalisés dans les exemples de documentation.

Voir aussi : [`Toggle`](/reference/ui-components/#toggle), [`Checkbox`](/reference/ui-components/#checkbox), [`Overlay`](/reference/ui-overlay/).
