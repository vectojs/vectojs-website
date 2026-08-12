+++
title = "Texto y Tipografía"
description = "El sistema de texto de VectoJS: división fría/caliente del LayoutEngine, streaming para salida de LLM, texto enriquecido con estilos mixtos, fuentes MSDF, árabe/BiDi y formas de exclusión."
weight = 14
+++

# Texto y Tipografía

VectoJS incluye un motor de texto construido en torno a dos ideas clave: **separar la medición de la disposición** (para que el redimensionamiento evite volver a medir) y **memoizar a nivel de párrafo** (para que las rutas de anexión puedan reutilizar los párrafos iniciales sin cambios).

## Pruébalo en vivo

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">en vivo · @vectojs/core</span></div>
  <iframe src="/sandbox/text-streaming.html" class="sandbox-frame" loading="lazy" title="Text streaming interactive example" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption><code>label.append(chunk)</code> llamado cada 30 ms — O(párrafo modificado), no O(documento). Haz clic en Replay para reiniciar el stream.</figcaption>
</figure>

## Elegir el componente correcto

| Escenario                                                   | Usa              |
| ----------------------------------------------------------- | ---------------- |
| Texto estático o dinámico simple                            | `Text`           |
| Estilos mixtos (negrita, cursiva, enlaces, colores)         | `RichText`       |
| Documentos Markdown                                         | `Markdown`       |
| Texto GPU independiente de la resolución (UI de juegos, 3D) | `MSDFTextEntity` |
| Cuadrícula monoespaciada (terminal)                         | `GridTextEntity` |
| Texto personalizado respaldado por atlas vectorial          | `TextEntity`     |

`Text`, `RichText` y `Markdown` viven en `@vectojs/ui`. Los renderizadores de texto basados en `Entity` (`MSDFTextEntity`, `GridTextEntity`, `TextEntity`) viven en `@vectojs/core`. Las primitivas de shaping de más bajo nivel sobre las que se construyen — BiDi, shaping de árabe, métricas de tipografía, análisis de fuentes MSDF, cuadrículas de contenido preparadas — son el paquete independiente `@vectojs/text`, y el motor de salto de línea/disposición inline es `@vectojs/layout`. Ambos son reexportados por `@vectojs/core`, así que puedes importarlos desde cualquiera de los dos lugares.

### Texto seleccionable de cuadrícula fija

Los terminales, editores de código y otros renderizadores por celda deberían compilar su origen lógico con `prepareContentGrid()` de Core 1.8. Pinta las celdas devueltas en el Canvas y devuelve la misma cuadrícula inmutable desde `getContentProjection()`. Esto mantiene la fuente de copia/búsqueda, los cursores de grafema legales, los tabuladores, los anchos CJK/emoji, el conformado árabe, la colocación bidi y la selección del navegador en un solo plan de geometría, en lugar de mantener una segunda disposición del DOM.

Mide `cellWidth` a través del Canvas con la fuente resuelta por el navegador, reconstruye la cuadrícula cada vez que el origen o las métricas de la fuente cambien, y llama a `scene.resize()` después de que un contenedor personalizado o un zoom de la aplicación cambie. El redimensionamiento es un límite de calibración fría para la sustitución de fuentes de Firefox y las métricas de Range de glifos faltantes; los renderizados estables reutilizan los portadores preparados sin lecturas de geometría.

---

## Text

Texto de una y varias líneas con ajuste automático. Bajo el capó ejecuta el `LayoutEngine` del core (el mismo pipeline de segmentación que todos los demás componentes de texto).

```typescript
import { Text } from '@vectojs/ui';

const label = new Text('Hello, world', {
  font: '400 16px Inter', // CSS shorthand
  color: '#e2e8f0',
  maxWidth: 300, // wrap at 300px; omit for no wrapping
  lineHeight: 24, // line advance in px
  preserveLeadingSpaces: false,
});

label.setPosition(40, 40);
scene.add(label);
```

### Actualizaciones frías vs calientes

`Text` tiene tres métodos de mutación con costes muy diferentes:

```typescript
label.setText('New content'); // EXPENSIVE — cold pass: re-segment + re-measure
label.append(' more tokens'); // EFFICIENT — only the last paragraph is re-measured
label.setMaxWidth(200); // CHEAP — hot pass: re-wrap only, no re-measure
```

Usa esta distinción al transmitir texto token por token:

```typescript
// Wrong — rebuilds the full measured text on every token
for await (const token of stream) {
  label.setText((accumulated += token)); // O(document) per token → slow
}

// Correct — only the changed paragraph is re-measured
for await (const token of stream) {
  label.append(token); // reuses unchanged paragraphs; re-prepares the changed tail
}
```

Cuando el usuario redimensiona la ventana, llama a `setMaxWidth(newWidth)` — reajusta con el texto medido en caché, por lo que es seguro llamarlo en cada evento de redimensionamiento.

---

## RichText

Texto en línea de múltiples estilos: runs en negrita, cursiva, coloreados, de tamaños diferentes y enlazados, todos fluyendo juntos sobre líneas base compartidas.

```typescript
import { RichText } from '@vectojs/ui';
import type { StyledSpan } from '@vectojs/core';

const spans: StyledSpan[] = [
  { text: 'Build ' },
  { text: 'fast', style: { bold: true, color: '#00f0ff' } },
  { text: ' UIs with ', style: { italic: true } },
  { text: 'VectoJS', style: { bold: true, href: 'https://vectojs.org/' } },
  { text: '.' },
];

const rich = new RichText(spans, {
  font: '16px Inter',
  color: '#e2e8f0',
  maxWidth: 600,
  linkColor: '#38bdf8',
  onLinkClick: (href) => window.open(href, '_blank'),
});

scene.add(rich.setPosition(40, 40));
```

### Campos de `TextStyle`

```typescript
interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  color?: string;
  fontSize?: number; // overrides base font size for this run
  href?: string; // makes the run a link
}
```

> [!NOTE] > `bold` e `italic` afectan solo al renderizado, no al ancho medido (los trazos de negrita se extienden ligeramente más allá del ancho de avance). `fontSize` **sí** afecta tanto al ancho medido como a la altura de línea, por lo que mezclar tamaños en una línea funciona correctamente — la altura de cada línea se determina por su glifo más alto.

### Streaming con `appendSpans()`

Como `Text.append()`, `appendSpans()` reutiliza los párrafos iniciales sin cambios:

```typescript
const rich = new RichText([]);
scene.add(rich);

for await (const token of llmStream) {
  rich.appendSpans([{ text: token, style: { color: '#a5f3fc' } }]);
}
```

### Formas de exclusión (texto que fluye alrededor de obstáculos)

Pasa `exclusions` para hacer que el texto fluya alrededor de obstáculos rectangulares — floats de tipo CSS:

```typescript
const rich = new RichText(spans, {
  maxWidth: 500,
  exclusions: [
    { x: 0, y: 60, width: 120, height: 120 }, // avoid a 120×120 image at (0, 60)
  ],
});

// Later, update dynamically:
rich.setExclusions([{ x: 0, y: 60, width: 120, height: 120 }]);
```

El motor calcula los intervalos horizontales libres por banda de línea (`computeLineSegments`) y rellena cada intervalo de forma independiente. El reordenamiento BiDi se aplica a toda la línea lógica tras la colocación del intervalo.

---

## Markdown

Renderiza Markdown en un subárbol del VMT usando la biblioteca `marked` (variante GFM).

```typescript
import { Markdown } from '@vectojs/markdown';

const md = new Markdown('# Hello\n\nThis is **rich** text.', {
  maxWidth: 700,
  theme: {
    headingColor: '#f8fafc',
    codeColor: '#a5f3fc',
    bodyFont: 'Inter, sans-serif',
  },
});

scene.add(md.setPosition(40, 40));
```

Tokens soportados: encabezados (h1–h6), párrafos, bloques de código con resaltado de palabras clave, blockquotes, listas ordenadas/no ordenadas, reglas horizontales, código/negrita/cursiva/enlaces en línea, y tablas GFM (renderizadas mediante el componente `Table`).

### Streaming de Markdown

Para la salida de LLM, usa `appendMarkdown()` — nunca hagas un bucle de `setContent(fullText)`:

```typescript
const md = new Markdown('', { maxWidth: 700 });
scene.add(md);

for await (const token of llmStream) {
  md.appendMarkdown(token);
}
```

`appendMarkdown()` vuelve a analizar léxicamente el búfer completo, hace un diff de los tokens contra el último renderizado, reutiliza el prefijo de entidades sin cambios y actualiza el último párrafo en su lugar. Ahorra trabajo de reconstrucción del árbol visual, pero el análisis léxico de Markdown aún escala con el documento completo. `setContent()` además realiza una reconstrucción completa, así que úsalo para el reemplazo de un solo disparo.

---

## Cómo funciona el LayoutEngine

Entender la división fría/caliente te ayuda a tomar la decisión correcta para el rendimiento.

### Pasada fría — medir una vez

`prepare(text)` y `prepareRich(spans)` segmentan el texto en párrafos, aplican el conformado árabe y BiDi, segmentan en palabras y grafemas con `Intl.Segmenter`, y miden el ancho de avance de cada glifo. `prepareContentGrid(source, metrics)` realiza la compilación única correspondiente para las superficies seleccionables de cuadrícula fija. El resultado (`PreparedText` o `PreparedContentGrid`) se retiene hasta que su contenido o sus entradas de métricas cambien.

**Este es el paso costoso.** Ejecútalo solo cuando el contenido cambie.

### Pasada caliente — posicionar siempre

`layoutPrepared(prepared)` toma el `PreparedText` en caché y aplica las restricciones de ajuste (`maxWidth`, `maxHeight`, formas de exclusión) para producir `LayoutNode[]` posicionados. Esto es pura aritmética — sin segmentación, sin medición.

`setMaxWidth()` solo ejecuta la pasada caliente, reutilizando el `PreparedText` en caché. Por eso el reflow responsivo es barato: puedes llamarlo en cada píxel de un arrastre de redimensionamiento sin tirones.

### Memoización a nivel de párrafo

La clave de caché es `fontSize + paragraphText` (para texto plano) o `fontSize + paragraphText + styleSig` (para texto enriquecido). Cuando anexas un token a un documento con muchos párrafos:

1. Los párrafos sin cambios pueden reutilizar los datos preparados en caché.
2. Solo el último párrafo (modificado) se vuelve a medir.

Esto acota la medición/preparación de disposición repetida al párrafo modificado. Un párrafo largo aún se vuelve más costoso a medida que crece, y el análisis de Markdown de más alto nivel puede añadir trabajo a nivel de documento.

### Justificación y guionado

`LayoutEngine` soporta `textAlign = 'justify'` (estira las líneas ajustadas hasta alinearse con `maxWidth`, con la última línea irregular) y el guionado en tiempo de ajuste (los guiones suaves `­` funcionan de fábrica; conecta una función `hyphenate: (word) => string[]` para saltos automáticos — p. ej., los patrones de Knuth–Liang del paquete npm `hyphen`).

`TextEntity` expone ambos directamente: `text.setTextAlign('justify')`, `text.setHyphenator(fn)` — consulta la [`TextEntity` & `GridTextEntity`](/reference/core-text/#textentity-y-gridtextentity-desde-) para más detalles. Estos se renderizan correctamente porque `TextEntity` dibuja cada glifo en su propia posición calculada. Los componentes `Text`/`RichText` de `@vectojs/ui` colapsan cada línea ajustada en una sola llamada nativa a `fillText()` por rendimiento, por lo que aún no respetan la justificación por glifo — recurre a `TextEntity` cuando necesites cuerpo de texto justificado.

---

## Fuentes MSDF

Las fuentes de Campo de Distancia con Signo Multicanal (Multi-channel Signed Distance Field) renderizan texto nítido a cualquier nivel de zoom sin artefactos de rasterización. Úsalas para UIs de estilo de juego, interfaces con zoom o pantallas de alto DPR.

### Generar un atlas

Instala `msdf-atlas-gen` y ejecuta:

```bash
msdf-atlas-gen -font myfont.ttf -type msdf -format png -imageout atlas.png -json atlas.json
```

Esto produce `atlas.png` (la textura de los glifos) y `atlas.json` (métricas de glifos, anchos de avance, límites UV).

### Cargar en VectoJS

```typescript
import { MSDFFont, MSDFTextEntity } from '@vectojs/core/text';

// Parse the JSON
const fontData = await fetch('/fonts/atlas.json').then((r) => r.json());
const font = MSDFFont.parse(fontData);

// Load the texture image
const img = new window.Image();
img.src = '/fonts/atlas.png';
await new Promise((r) => (img.onload = r));

// Create the text entity
const msdfText = new MSDFTextEntity('Hello GPU text', {
  font,
  texture: img, // TexImageSource
  fontSize: 48,
  color: '#ffffff',
  letterSpacing: 0,
  fallbackFont: 'sans-serif', // used when pointBackend is not 'webgl'
});

scene.add(msdfText.setPosition(40, 40));
```

`MSDFTextEntity` descarga la disposición a un worker `LayoutWorkerManager` en segundo plano (con debounce, sin copia mediante transferencia de `Float32Array`). El texto aparece un tick asíncrono después de la construcción o de `setText()`. Cuando `pointBackend: 'webgl'` está establecido en la escena, los glifos se dibujan mediante el programa MSDF de WebGL; de lo contrario, la entidad recurre a `fillText` nativo.

### `MSDFFont.layout()` directamente

Si estás construyendo un renderizador personalizado o necesitas los quads de los glifos tú mismo:

```typescript
const result = font.layout('Hello', 48);
// result.glyphs: PositionedGlyph[]
// Each glyph: { char, x, y, w, h, u0, v0, u1, v1 }

for (const g of result.glyphs) {
  renderer.setMSDFTexture(texture, font.distanceRange);
  renderer.addGlyph(g.x, g.y, g.w, g.h, g.u0, g.v0, g.u1, g.v1, '#fff');
}
```

---

## Texto árabe y bidireccional

El texto árabe y bidireccional se maneja **automáticamente** dentro de `prepare()` y `prepareRich()`. No necesitas llamar a ninguna API de conformado tú mismo.

### Qué ocurre internamente

1. **Conformado árabe** (`ArabicShaper.shapeArabic`): sustituye los caracteres árabes por sus formas de presentación contextuales (inicial/medial/final/aislada) y aplica las ligaduras Lam-Alef. El `indexMap` rastrea el índice conformado→origen para el hit-testing del cursor.

2. **Asignación de nivel BiDi** (`BidiResolver.resolveLevels`): asigna un nivel de anidamiento (0 = LTR, 1 = RTL, más alto = incrustación más profunda) a cada carácter usando las reglas UAX#9. Los controles de incrustación (LRE/RLE/PDF) se respetan.

3. **Reordenamiento visual** (`BidiResolver.reorderVisual`): al final de cada línea, invierte los runs desde el nivel más alto hasta 1, produciendo el orden visual de palabras correcto.

Esto significa que un `Text` o `RichText` con contenido árabe o hebreo simplemente funciona:

```typescript
const arabic = new Text('مرحبا بك في VectoJS', {
  font: '20px sans-serif',
  color: '#f8fafc',
});
const hebrew = new RichText([{ text: 'שלום ' }, { text: 'VectoJS', style: { bold: true } }]);
```

> [!NOTE]
> Los saltos de línea (`\n`) siempre reinician el contexto de conformado árabe y el estado BiDi. Las líneas con ajuste suave dentro del mismo párrafo comparten una pasada de conformado, por lo que los párrafos árabes multilínea se conforman correctamente a través de los ajustes.

---

## Funciones auxiliares

`measureText`, `wrapLines` y `fontSizePx` se exportan desde `@vectojs/ui` para su uso en componentes personalizados.

```typescript
import { measureText, wrapLines, fontSizePx } from '@vectojs/ui';

// Rendered pixel width, LRU-cached (cap 1000)
const w = measureText('Hello world', '600 16px Inter');

// Greedy word-wrap — returns string[]
const lines = wrapLines('A longer text that wraps', '16px sans-serif', 200);

// Extract the px size from a CSS font shorthand
const size = fontSizePx('600 16px Inter'); // → 16
```

`measureText` conforma el texto árabe mediante `ArabicShaper` antes de medir, por lo que devuelve el ancho visual correcto para los runs árabes.

---

## Guía de rendimiento

| Escenario                                                | Mejor enfoque                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| Texto estático, establecido una vez                      | `new Text(content, opts)` — una pasada fría                     |
| Streaming de solo anexión (LLM)                          | `text.append(token)` o `md.appendMarkdown(token)`               |
| Redimensionamiento responsivo                            | `text.setMaxWidth(newW)` — solo pasada caliente                 |
| Disposición densa repetida (p. ej., cuadrícula de datos) | Reutiliza `LayoutResultBuffer` con `layoutPreparedIntoBuffer()` |
| Texto independiente de la resolución                     | `MSDFTextEntity` + `pointBackend: 'webgl'`                      |
| Árabe / hebreo / RTL                                     | Cualquier `Text`/`RichText`/`Markdown` — automático             |
| Texto que fluye alrededor de imágenes                    | `RichText` + `exclusions: ExclusionRect[]`                      |

El texto seleccionable siempre proyecta la fuente Unicode lógica original. El conformado del Canvas y el reordenamiento BiDi afectan solo a los píxeles; la copia, la búsqueda en la página, la traducción del navegador y la tecnología de asistencia conservan el orden de origen del llamante. Los separadores de ajuste suave y los saltos de línea explícitos se adjuntan a su fila visual precedente para que la geometría de selección multilínea permanezca dentro de las bandas de línea renderizadas.

## Resolución de problemas

### El texto aparece demasiado ancho o en la posición equivocada

Tanto `measureText` como el `LayoutEngine` usan una llamada a `measureText` del canvas con la cadena de fuente CSS exacta. Si la familia de fuentes aún no se ha cargado (p. ej., una fuente web), el navegador sustituye una fuente alternativa con métricas diferentes, causando un desajuste entre la disposición y el renderizado.

Asegúrate de que las fuentes web estén cargadas antes de construir `Text` o `RichText`:

```typescript
await document.fonts.ready;
const label = new Text('Hello', { font: '16px Inter' });
```

### `append()` es más lento de lo esperado para documentos largos

`append()` memoiza a **nivel de párrafo** (dividido por `\n`). Si todo tu documento es un único párrafo largo sin saltos de línea, cada llamada a `append()` vuelve a medir todo el párrafo.

Para el contenido en streaming, inserta un salto de línea tras cada párrafo para permitir que la caché los divida:

```typescript
md.appendMarkdown(chunk);
// If the LLM output naturally has paragraphs, the memoization works automatically.
// If it is one endless run-on sentence, performance degrades to O(document).
```

### El texto de `MSDFTextEntity` falta en el primer frame

`MSDFTextEntity` dispone el texto fuera del hilo mediante `LayoutWorkerManager`. El resultado llega un tick asíncrono después de la construcción o de `setText()`. Esto es por diseño — la entidad llama a `scene.markDirty()` cuando se dispara el callback de disposición, desencadenando un repintado.

Si usas `renderMode: 'onDemand'`, este repintado ocurrirá correctamente. Si necesitas que el texto aparezca de forma síncrona (p. ej., en una prueba de captura de pantalla), espera al siguiente `rAF` tras `scene.start()`.

### Las exclusiones de RichText no se aplican

Las formas de exclusión solo funcionan con `layoutPrepared()`, no con `layoutPreparedIntoBuffer()`. Si usas la ruta de búfer reutilizable, las exclusiones se ignoran. Usa `layoutPrepared()` para el soporte de exclusiones.

> **Siguiente:** [Accesibilidad](/learn/accessibility/) — cómo el shadow DOM hace que tu UI de canvas sea manejable por lectores de pantalla y agentes.
