---
title: 'UI: Checkbox'
description: 'Contrôle de case à cocher avec sémantique native dʼentrée et état visuel sur canvas.'
order: 25
---

# `Checkbox`

`Checkbox` projette une vraie entrée checkbox et peint lʼétat visuel sur le canvas.

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Checkbox</span></div>
  <iframe src="/sandbox/ui/component.html?name=checkbox&v=core-1.9.2-ui-1.9.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Démonstration live de Checkbox" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Les clics sur le canvas et les changements de lʼentrée native partagent le même chemin `change`.</figcaption>
</figure>

## Exemple minimal

```ts
import { Checkbox } from '@vectojs/ui';

const enabled = new Checkbox({
  checked: true,
  label: 'Enable semantic projection',
  onChange: (checked) => setEnabled(checked),
});
```

## Liste de vérification pour les mainteneurs

- Maintenez `checked` et lʼétat de lʼentrée projetée synchronisés.
- Appelez `scene.markDirty()` lorsque lʼétat visuel change.
- Utilisez un libellé sauf si le contexte environnant nomme déjà le contrôle.
