---
title: 'UI: Paneles redimensionables'
description: 'PanelGroup, Panel y PanelResizeHandle para diseños de paneles divididos arrastrables.'
order: 35
---

# Paneles redimensionables

Las exportaciones de paneles redimensionables funcionan juntas: `PanelGroup` divide el espacio, `Panel` posee una región de contenido
recortada y `PanelResizeHandle` se inserta automáticamente entre los paneles.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · PanelGroup</span></div>
  <iframe src="/sandbox/ui/component.html?name=resizablepanel&v=core-1.25.0-ui-2.6.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de panel redimensionable" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Arrastra el divisor entre paneles para inspeccionar el comportamiento de cambio de tamaño y hover del mango.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Panel, PanelGroup, Stack, Text } from '@vectojs/ui';

const group = new PanelGroup({
  direction: 'horizontal',
  width: 640,
  height: 360,
});
group
  // El contenido de la barra lateral es un Stack, diseñado para dimensionarse
  // para llenar su viewport — el `fit: true` por defecto lo mantiene
  // coincidiendo con la caja del panel en cada redimensionamiento/arrastre,
  // cerrando la brecha que solía requerir una sincronización manual
  // `content.width = panel.width` (ver "Dimensionamiento del contenido alojado" abajo).
  .addPanel(
    new Panel({ minSize: 160 }).setContent(
      new Stack({ direction: 'vertical' }).add(new Text('Barra lateral')),
    ),
  )
  .addPanel(
    new Panel({ minSize: 260 }).setContent(
      new Stack({ direction: 'vertical' }).add(new Text('Canvas')),
    ),
  );
```

## Dimensionamiento del contenido alojado (`setContent`)

`Panel.setContent(content, fit?)` mantiene el `width`/`height` del contenido alojado
sincronizado con la caja del propio panel por defecto (`fit: true`, ambos ejes) — incluyendo
en cada arrastre posterior del divisor del `PanelGroup` o llamada a `resize()`, no solo en el
momento de `setContent()`. Esto cierra una brecha real: anteriormente `setContent` solo
posicionaba el contenido (`content.x = 0; content.y = 0`), por lo que una aplicación tenía que
sincronizar manualmente `content.width = panel.width` en cada resize, y si faltaba
esa sincronización en un lugar de una cadena de componentes profunda, producía un error
de desbordamiento de clip en producción.

```ts
panel.setContent(miLayout); // rastrea tanto width como height (por defecto)
panel.setContent(miLayout, false); // comportamiento antiguo solo de posición
panel.setContent(miLayout, { width: true, height: false }); // solo width
```

**Pasa `fit: false` para contenido de tamaño automático** — una entidad cuyo propio
`width`/`height` se derivan de su contenido en lugar de ser establecidos por el autor (ej. un
`Text` simple sin `maxWidth`, que recalcula su propia caja a partir de
`result.totalWidth`/recuento de líneas en cada `setText()`/`setMaxWidth()`).
Permitir que el `fit: true` por defecto fuerce la caja de dicha entidad a la caja del
panel cada fotograma sobrescribe su tamaño autocalculado — inofensivo para el propio
`render()` de `Text` (que dibuja desde sus `lines` en caché, no directamente desde `width`/`height`),
pero corrompe cualquier otra cosa que lea el `width`/`height` de esa entidad
para el layout: pruebas de impacto, el tamaño de su elemento sombra a11y y las
auditorías de escena. Envuelve el contenido de tamaño automático en un `Stack`/`Flow` (que
son en sí mismos adecuados para `fit`, ya que posicionar hijos — no autodimensionarse — es
su único trabajo) si quieres que esté centrado/relleno dentro de un panel, o pasa
`fit: false` y ajústalo tú mismo.

## Lista de verificación para mantenedores

- Preserva el `minSize` de cada panel al arrastrar.
- Llama a `resize(width, height)` cuando el contenedor anfitrión cambie de tamaño.
- Mantén las instancias anidadas de `PanelGroup` dentro del límite de contenido de un `Panel`.
- Pasa `fit: false` a `setContent()` para contenido de tamaño automático (`Text` simple
  sin `maxWidth`, o cualquier entidad cuyo propio layout calcule su caja) —
  el `fit: true` por defecto es correcto para contenedores de layout (`Stack`, `Flow`,
  otro `PanelGroup`) pero sobrescribiría la caja de una entidad de tamaño automático cada
  fotograma.
