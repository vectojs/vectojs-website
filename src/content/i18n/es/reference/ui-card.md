---
title: 'UI: Card'
description: 'Componente de panel redondeado en canvas con semántica opcional de role=group.'
order: 20
---

# `Card`

`Card` es el panel visual base utilizado en todos los ejemplos de `@vectojs/ui`. Por defecto es decorativo;
pasar `label` lo convierte en un grupo semántico.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Card</span></div>
  <iframe src="/sandbox/ui/component.html?name=card&v=core-1.9.2-ui-1.9.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Card" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Las Cards poseen el fondo y el borde; los hijos se posicionan en el espacio local de la card.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Card, Text } from '@vectojs/ui';

const card = new Card({
  width: 320,
  height: 180,
  radius: 18,
  border: 'rgba(148,163,184,0.2)',
  label: 'Panel de configuración',
});

card.add(new Text('Configuración').setPosition(24, 24));
scene.add(card);
```

## Lista de verificación para mantenedores

- Usa `label` solo cuando la región deba ser descubrible.
- No asumas que `padding` aplica auto-layout a los hijos.
- Prefiere `Stack` o `Flow` dentro de una card para un diseño mantenible.
