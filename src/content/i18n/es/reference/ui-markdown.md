---
title: 'Markdown'
description: 'Renderizador de Markdown nativo en canvas con texto enriquecido, bloques de código, tablas, anexión por streaming y devoluciones de llamada para enlaces — el paquete independiente @vectojs/markdown.'
order: 14
---

# `Markdown` — `@vectojs/markdown`

`Markdown` y `CodeBlock` viven en el paquete independiente **`@vectojs/markdown`**
(a partir de `@vectojs/ui@2.2.0` ya no forman parte de `@vectojs/ui`, así que las
dependencias `marked` + MathJax solo se cargan cuando renderizas Markdown). Compone
componentes de `@vectojs/ui`, así que instálalo junto a `@vectojs/ui` y `@vectojs/core`:
`bun add @vectojs/markdown @vectojs/ui @vectojs/core`.

`Markdown` analiza Markdown con `marked` y renderiza el resultado en un subárbol de entidades de VectoJS.
Los párrafos y encabezados se convierten en `RichText`, los bloques de código en `CodeBlock` y las tablas GFM en
`Table`.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Markdown</span></div>
  <iframe src="/sandbox/ui/markdown.html?v=core-1.25.0-ui-2.6.0" class="sandbox-frame component-demo-frame component-demo-frame-xl" loading="eager" title="Demostración en vivo de Markdown" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>La muestra mantiene prosa, enlaces, código en línea y un bloque de código en un viewport enfocado para que los defectos de diseño sean visibles.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Markdown } from '@vectojs/markdown';

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

Para flujos de tokens, agrega solo el nuevo delta — y agrupa tokens por fotograma de animación en lugar de agregar por token:

```ts
let pending = '';
let scheduled = false;
function pushToken(token: string) {
  pending += token;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const chunk = pending;
    pending = '';
    markdown.appendMarkdown(chunk);
    scrollView.scrollToBottom();
  });
}
for await (const token of llmStream) pushToken(token);
```

Evita llamar a `setContent(fullDocumentSoFar)` por cada token; eso reconstruye todo el subárbol.
La receta completa — adherencia de seguimiento inferior, segmentación de transcripciones largas, elección de modo de renderizado — está en la guía [Streaming y texto en tiempo real](/learn/streaming/).

### Sintaxis de cierre pendiente: `incompleteMode`

Un flujo se corta a mitad de token constantemente, por lo que los últimos caracteres de un fragmento son habitualmente la mitad de un constructo. `incompleteMode` escoge cómo se renderiza esa cola mientras el controlador está abierto:

| Modo                        | Al transmitir `a **bo`                              |
| --------------------------- | --------------------------------------------------- |
| `'literal'` _(por defecto)_ | texto `a **bo` — los asteriscos son texto ordinario |
| `'optimistic'`              | texto `a bo`, con `bo` en negrita — sintaxis oculta |

`'optimistic'` supone que el último constructo strong/emphasis/inline-code/link del párrafo final sin cerrar, se cerrará. La suposición es **solo para visualización** — el estado del token nunca se muta — y se revierte en el `close()`, por lo que un flujo `'literal'` y uno `'optimistic'` de la misma fuente terminan en un documento idéntico a nivel de bytes. `'literal'` es lo que incluía cada lanzamiento anterior a esta opción.

El modo es interpretado por `Markdown`, no por el controlador: el controlador es dueño del almacenamiento en búfer y el ritmo, mientras que la suposición es una transformación en el momento de renderizado sobre el párrafo final.

### Finalización de un solo uso: `onStable`

```ts
const stream = markdown.createStream({
  onStable: (blocks) => {
    // Se ejecuta una vez, con el documento terminado. Lugar seguro para trabajo que sería
    // desperdiciado en medio del flujo.
    console.log(`settled with ${blocks.length} top-level blocks`);
  },
});
```

Se dispara **exactamente una vez**, después de que `close()` haya aplicado el texto final _y_ se haya aplicado cualquier análisis sintáctico en curso del worker, con una instantánea de las entidades de bloque de nivel superior del documento en ese instante. Independiente de `incompleteMode`, por lo que funciona con el valor por defecto `'literal'`.

Deliberadamente no es un gancho general de "flujo progresado":

- **Nunca disparado por `flush()`, `abort()`, o `destroy()`.** Ninguno de esos significa que el contenido haya dejado de cambiar.
- Llamar a `appendMarkdown()` o `setContent()` desde dentro de la devolución de llamada **lanza un error de forma síncrona** — una mutación reentrante invalidaría la instantánea que acaba de recibir.
- Un error lanzado desde la devolución de llamada rechaza la promesa de `close()`. El controlador se libera en cualquier caso.

## Modelo de rendimiento

Lo que realmente cuesta cada llamada, para que el código de streaming pueda razonarse:

- **El análisis sintáctico está fuera del hilo principal por defecto.** `appendMarkdown` envía la fuente acumulada a un `Worker` construido desde un paquete incrustado (sin solicitud de red); el diff de tokens y las actualizaciones de entidades se aplican cuando el análisis regresa. Los entornos sin `Worker` (algunos ejecutores de pruebas, SSR) recurren al análisis léxico sincrónico — mismo resultado, costo en el hilo principal.
- **El análisis léxico es O(documento) por adjunto**, no O(fragmento): toda la fuente acumulada se retokeniza en cada llamada. Agrupa por fotograma (arriba) y segmenta transcripciones largas en una entidad `Markdown` por mensaje para que el documento en vivo se mantenga pequeño.
- **Los bloques terminados se reutilizan, no se reconstruyen.** `appendMarkdown` compara por prefijo la nueva lista de tokens con la anterior mediante la fuente original; cada bloque ya renderizado mantiene su instancia de entidad. El caso común de streaming — el último párrafo creció — actualiza los spans de ese párrafo en el lugar.
- **`setContent()` no reutiliza nada.** Elimina cada hijo y vuelve a renderizar la lista completa de tokens. Es la llamada correcta para _reemplazar_ un documento, y la llamada incorrecta para _hacer crecer_ uno.

## Punto de extensión

`renderToken(token)` está protegido, así que los renderizadores personalizados pueden extender `Markdown` con bloques específicos de la aplicación a la vez que siguen delegando los tokens normales al renderizador integrado.

## Lista de verificación para mantenedores

- Las devoluciones de llamada de enlaces deben reenviarse a los nodos `RichText` de párrafo, encabezado y lista.
- Los bloques de código deben seguir siendo una sola entidad hoja, no una entidad por token o segmento de línea.
- El código de bloque debe proyectar su texto fuente exacto y saltos de línea.
- Los encabezados de tabla usan el color/estilo negrita de encabezado, mientras que cada celda lógica posee exactamente una proyección de contenido.
- La propiedad del puntero permanece en la proyección de texto/código hoja; las entidades estructurales de lista y tabla no deben interceptar la selección nativa.
- La transmisión por streaming debe reutilizar entidades de prefijo no modificadas.

Relacionado: [`RichText`](/reference/ui-components/#richtext), [`CodeBlock`](/reference/ui-components/#codeblock), [`Table`](/reference/ui-components/#table).
