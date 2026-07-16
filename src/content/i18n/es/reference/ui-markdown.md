---
title: 'Markdown'
description: 'Renderizador de Markdown nativo en canvas con texto enriquecido, bloques de código, tablas, transmisión por streaming y devoluciones de llamada para enlaces.'
order: 14
---

# `Markdown`

`Markdown` analiza Markdown con `marked` y renderiza el resultado en un subárbol de entidades de VectoJS.
Los párrafos y encabezados se convierten en `RichText`, los bloques de código en `CodeBlock` y las tablas GFM en
`Table`.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Markdown</span></div>
  <iframe src="/sandbox/ui/markdown.html?v=core-1.9.2-ui-1.9.3" class="sandbox-frame component-demo-frame component-demo-frame-xl" loading="eager" title="Demostración en vivo de Markdown" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>La muestra mantiene prosa, enlaces, código en línea y un bloque de código en un viewport enfocado para que los defectos de diseño sean visibles.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Markdown } from '@vectojs/ui';

const md = new Markdown(source, {
  maxWidth: 640,
  selectable: true,
  onLinkClick(href) {
    router.open(href);
  },
});

scene.add(md.setPosition(24, 24));
```

## Constructor

```ts
new Markdown(markdownText: string, opts?: MarkdownOptions)

interface MarkdownOptions {
  maxWidth?: number;
  theme?: MarkdownTheme;
  onLinkClick?: (href: string) => void;
  selectable?: boolean; // default true
}
```

`selectable` se propaga a los encabezados actuales y futuros, prosa, listas, código
de bloque y celdas de tabla. Cámbialo en tiempo de ejecución con `markdown.setSelectable(false)`.
El navegador maneja la selección por arrastre, Ctrl/Comando+C y búsqueda en página; las entidades VMT
siguen siendo dueñas del diseño y los píxeles. Los elementos de listas ordenadas y no ordenadas usan
`RichText` seleccionable; cada celda de tabla GFM tiene su propia proyección seleccionable. El orden
lógico de la fuente y los separadores duros/blandos permanecen intactos a través de la salida anidada de Markdown.
Core 1.8 enruta la prosa transformada a través de geometría de cursor bidimensional y
el código de bloque a través de la cuadrícula preparada compartida, por lo que las listas, tablas GFM, texto
árabe/RTL con ajuste y código mantienen el orden de copia lógico a DPR y zoom fraccionarios.
Cuando una aplicación controla el tamaño del contenedor o el zoom CSS, notifica a la Scene con
`scene.resize(width, height)` para que Firefox pueda recalibrar las métricas nativas de Range.

## Transmisión por streaming

Para flujos de tokens, agrega solo el nuevo delta:

```ts
for await (const token of llmStream) {
  markdown.appendMarkdown(token);
  scrollView.scrollToBottom();
}
```

Evita llamar a `setContent(fullDocumentSoFar)` por cada token; eso reconstruye todo el subárbol.

## Punto de extensión

`renderToken(token)` es protected, por lo que los renderizadores personalizados pueden crear subclases de `Markdown` para bloques
específicos de la aplicación mientras siguen delegando los tokens normales al renderizador integrado.

## Lista de verificación para mantenedores

- Las devoluciones de llamada de enlaces deben reenviarse a los nodos `RichText` de párrafo, encabezado y lista.
- Los bloques de código deben seguir siendo una sola entidad hoja, no una entidad por token o segmento de línea.
- El código de bloque debe proyectar su texto fuente exacto y saltos de línea.
- Los encabezados de tabla usan el color/estilo negrita de encabezado, mientras que cada celda lógica posee exactamente una proyección de contenido.
- La propiedad del puntero permanece en la proyección de texto/código hoja; las entidades estructurales de lista y tabla no deben interceptar la selección nativa.
- La transmisión por streaming debe reutilizar entidades de prefijo no modificadas.

Relacionado: [`RichText`](/reference/ui-components/#richtext), [`CodeBlock`](/reference/ui-components/#codeblock), [`Table`](/reference/ui-components/#table).
