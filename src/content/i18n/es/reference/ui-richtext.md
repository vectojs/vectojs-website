---
title: 'UI: RichText'
description: 'Componente de texto en línea con múltiples estilos, hotspots de enlace y soporte para transmisión por streaming.'
order: 17
---

# `RichText`

`RichText` fluye spans mixtos en líneas base compartidas: negrita, cursiva, color, tamaño y enlaces en línea.
La proyección reconstruye las secuencias lógicas de origen en lugar de glifos visuales con forma, preservando el texto
exacto del portapapeles a través de tamaños de fuente mixtos, ligaduras, texto árabe/hebreo, ajuste suave y saltos duros.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · RichText</span></div>
  <iframe src="/sandbox/ui/component.html?name=richtext&v=core-1.30.0-ui-2.12.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de RichText" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>El enlace en línea es un hotspot de ancla transparente sobre el texto del canvas.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { RichText } from '@vectojs/ui';

const copy = new RichText(
  [
    { text: 'Texto ' },
    { text: 'con peso', style: { bold: true, color: '#22d3ee' } },
    { text: ' con ' },
    { text: 'enlaces', style: { href: '/learn/accessibility/' } },
  ],
  {
    maxWidth: 420,
    selectable: true,
    onLinkClick: (href) => router.open(href),
  },
);
```

## Lista de verificación para mantenedores

- Mantén las devoluciones de llamada de enlaces conectadas a través de los renderizadores de párrafo, encabezado y lista.
- Usa `appendSpans()` para transmisión por streaming de tokens.
- `getContentProjection()` lleva una fila visual explícita con fuentes por ejecución,
  una línea base compartida de Canvas y el avance de línea real. Esto mantiene los rectángulos
  de selección de tamaño mixto alineados en lugar de dejar que el navegador refluya los spans.
  Los separadores lógicos pertenecen a la fila posicionada precedente, por lo que la selección
  multilínea nunca crea un fragmento de resaltado huérfano en el origen de la raíz.
  Core 1.8 resuelve cursores de grafema legales a partir de geometría Range bidimensional
  transformada, incluyendo rotación, reflexión y escala no uniforme.
  Usa `setSelectable(false)` cuando no se desee la selección nativa por arrastre.
- Usa `setExclusions()` cuando el texto deba fluir alrededor de rectángulos locales.
