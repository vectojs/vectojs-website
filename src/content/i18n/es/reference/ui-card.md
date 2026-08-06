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
  <iframe src="/sandbox/ui/component.html?name=card&v=core-1.32.2-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Card" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## Objetivos de clic en toda la tarjeta

Pasa `onClick` para hacer que toda la tarjeta sea presionable — ya no es necesario apilar un
`Button` transparente sobre una `Card` para hacerla cliqueable, lo que solía
contaminar la proyección a11y con un botón sin etiqueta y producir
ruido de `overlap` en las auditorías de escena. `onClick` requiere `label`: una
región interactiva sin un nombre accesible recrearía el mismo problema
un nivel más arriba, por lo que `Card` lanza un error en lugar de aceptarlo silenciosamente.

```ts
const card = new Card({
  width: 320,
  height: 96,
  label: 'Abrir configuración',
  onClick: () => openSettingsPanel(),
});
```

## Dimensionamiento del contenido alojado (`setContent`)

`Card.setContent(content, fit?)` coloca una única entidad de contenido dentro de la
tarjeta y, por defecto, mantiene su `width`/`height` sincronizados con la caja de la
tarjeta — el mismo contrato `fitContent` que usa `Panel.setContent` (ver
[`Paneles redimensionables`](/reference/ui-resizable-panel/)). `fit` por defecto es `true`
(ambos ejes rastreados); pasa `false`, o `{ width, height }` por eje, para volver
al comportamiento antiguo solo de posición.

```ts
const card = new Card({ width: 320, height: 180 });
card.setContent(new SomeContentEntity()); // dimensionado a 320×180, resincronizado en cambios de card.width/height
```

Esto es independiente de `add()`: usa `add()` para decoraciones
posicionadas manualmente (iconos, etiquetas) que deben mantener su propio tamaño dado por el autor
independientemente de los redimensionamientos de la tarjeta; usa `setContent()` para la entidad que
siempre debe llenar la tarjeta.

Pasa `fit: false` para contenido de tamaño automático — una entidad cuyo propio
`width`/`height` se derivan de su contenido (ej. un `Text` simple sin
`maxWidth`) en lugar de ser establecidos por el autor. El `fit: true` por defecto sobrescribiría
la caja autocalculada de esa entidad cada fotograma; envuélvelo en un `Stack`/`Flow`
primero si lo quieres centrado/relleno dentro de la tarjeta, o ajústalo tú mismo
con `fit: false`. Ver [Paneles redimensionables](/reference/ui-resizable-panel/)
para la explicación completa — el mismo contrato `fitContent`, la misma advertencia.

## Lista de verificación para mantenedores

- Usa `label` solo cuando la región deba ser descubrible.
- No asumas que `padding` aplica auto-layout a los hijos.
- Prefiere `Stack` o `Flow` dentro de una card para un diseño mantenible.
- Prefiere `onClick` en lugar de apilar un `Button` superpuesto para objetivos
  de clic en toda la tarjeta.
- Prefiere `setContent()` en lugar de `add()` + sincronización manual de tamaño para una entidad
  que debe llenar la tarjeta.
