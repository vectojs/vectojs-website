---
title: 'UI: Link'
description: 'Enlace independiente renderizado en canvas con una proyección de ancla semántica.'
order: 18
---

# `Link`

`Link` es para texto de navegación independiente. Para enlaces en línea dentro de prosa, usa `RichText` o
`Markdown`.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Link</span></div>
  <iframe src="/sandbox/ui/component.html?name=link&v=core-1.30.0-ui-2.12.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Link" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>El texto visible está en el canvas; la automatización y la tecnología de asistencia ven un ancla real.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Link } from '@vectojs/ui';

scene.add(
  new Link('Abrir documentación ↗', {
    href: 'https://vectojs.org',
  }).setPosition(24, 24),
);
```

## Lista de verificación para mantenedores

- Sanitiza las URLs antes de abrir o proyectar `href`.
- Mantén la etiqueta visible y el nombre accesible alineados.
- Prefiere `RichText` para enlaces incrustados dentro de un párrafo.
