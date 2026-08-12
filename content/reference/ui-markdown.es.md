+++
title = "Markdown"
description = "Renderizador de Markdown nativo en canvas con texto enriquecido, bloques de código, tablas, anexión por streaming y devoluciones de llamada para enlaces — el paquete independiente @vectojs/markdown."
weight = 14
+++

# `Markdown` — `@vectojs/markdown`

`Markdown` y `CodeBlock` viven en el paquete independiente **`@vectojs/markdown`**
(a partir de `@vectojs/ui@2.2.0` ya no forman parte de `@vectojs/ui`, así que las
dependencias `marked` + `@vectojs/tex` solo se cargan cuando renderizas Markdown). Compone
componentes de `@vectojs/ui`, así que instálalo junto a `@vectojs/ui` y `@vectojs/core`:
`bun add @vectojs/markdown @vectojs/ui @vectojs/core`.

`Markdown` analiza Markdown con `marked` y renderiza el resultado en un subárbol de entidades de VectoJS.
Los párrafos y encabezados se convierten en `RichText`, los bloques de código en `CodeBlock` y las tablas GFM en
`Table`.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Markdown</span></div>
  <iframe src="/sandbox/ui/markdown.html?v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame component-demo-frame-xl" loading="eager" title="Demostración en vivo de Markdown" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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
  userTiming?: boolean; // emit a `vecto:markdown:parse` measure, default false
  blockAffordances?: boolean; // copy/download controls on code blocks + tables, default false
  affordances?: BlockAffordanceConfig; // which controls + labels, e.g. { download: false }
  showCodeLanguage?: boolean; // fence language in a header band per code block, default false
  writeClipboard?: (text: string) => void; // injectable clipboard write (jsdom/tests)
  saveFile?: (filename: string, content: string, mimeType: string) => void; // injectable download
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

### Affordances de bloque (controles de copiar / descargar)

`blockAffordances: true` dibuja controles de copiar + descargar en la esquina superior derecha de los bloques de código y las tablas. Es opcional por diseño: cada control es una parada enfocable en el orden de tabulación, y un documento con muchos bloques delimitados sería tedioso de pegar con el teclado (y un lector sin permisos de portapapeles/sistema de archivos no gana nada). `affordances` reduce o vuelve a etiquetar el conjunto — las etiquetas son texto visible para el usuario y son lo que anuncia un lector de pantalla, así que úsalo para documentos no ingleses. Tanto `writeClipboard` como `saveFile` son inyectables porque las rutas de la plataforma están ausentes en jsdom. `showCodeLanguage` reserva una banda de cabecera que también evita que los controles se superpongan a la primera línea de código — actívalo cuando combines ambos.

Anulaciones por tipo (`0.20.x+`): `affordances.code` / `affordances.table` desactivan la copia/descarga para un tipo de bloque sin tocar el otro — una tabla que ya ofrece copia en su propia UI ya no necesita dos controles superpuestos:

```ts
markdown.setOptions({
  blockAffordances: true,
  affordances: {
    table: { copy: false, download: false }, // keep code-block controls only
    code: { download: false }, // per-kind, inherits top-level defaults
  },
});
```

Una clave por tipo omitida hereda el `copy`/`download` de nivel superior, que a su vez hereda `true`. Los bloques de código también pueden enmarcarse con un borde estableciendo `theme.codeBorderColor` (opcional; si no se establece, se mantiene el renderizado anterior sin bordes) — útil en fondos de página claros donde el relleno del código se funde con el fondo.

## Ancho adaptable: `setMaxWidth()`

```ts
markdown.setMaxWidth(width: number): this
```

Reajusta el salto de línea de todos los bloques ya renderizados a un ancho nuevo
(`0.9.0+`). Llámalo al redimensionar en lugar de asignar `maxWidth`, que
establece el campo sin cambiar nada visible: el ancho se lee cuando cada bloque
se **construye**, así que una asignación deja los bloques existentes medidos con
el ancho anterior.

```ts
window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
  markdown.setMaxWidth(window.innerWidth - INSET * 2);
});
```

Reajusta la maquetación en el sitio en vez de reconstruir, y eso es lo que lo
hace utilizable a mitad de una transmisión:

- sobreviven las mismas **instancias** de entidad de bloque, así que cualquier
  cosa que mantenga una referencia a una de ellas (un ancla de desplazamiento, un
  objetivo de clic, una selección de devtools) sigue funcionando;
- un escritor [`createStream()`](#transmisión-por-streaming) abierto queda intacto y continúa
  añadiendo;
- no se vuelve a analizar léxicamente nada.

Medido en un documento de cinco bloques en ambos motores: 520 → 260 px llevó el
número de líneas proyectadas de 2 a 4 y la altura de 88 a 160 sobre las mismas
dos instancias de párrafo, con el escritor todavía en `open` y **cero**
caracteres adicionales entregados al analizador léxico.

Si el ancho no cambia no hace nada, de modo que un redimensionado solo en altura
no cuesta nada y quien llama no necesita una guarda. Un ancho negativo se acota
a 0.

> [!NOTE]
> Antes de `0.9.0` el único apaño correcto era una reconstrucción completa:
> liberar el flujo, reproducir la fuente ya revelada mediante `setContent()`,
> abrir un escritor nuevo y trasladar a mano el desplazamiento. Eso reproduce el
> documento correctamente, y por eso era fácil conservarlo: una reconstrucción
> también produce una geometría correcta. Lo que costaba era un reanálisis
> léxico de todo el documento y cada instancia de entidad, en cada
> redimensionado.

Las fórmulas en display conservan a propósito su propio ancho: `@vectojs/tex`
dimensiona una caja compuesta a partir de métricas relativas a `ex` y no del
ancho disponible, así que estirarla distorsionaría la fórmula. El código
delimitado tampoco se reajusta —tiene una rejilla monoespaciada fija y las
líneas largas se desbordan por diseño—, solo se redimensiona su fondo.

Llamarlo desde una retrollamada [`onStable`](#finalización-de-un-solo-uso-onstable) lanza una excepción, por
la misma razón que `setContent()`: esa retrollamada se ejecuta dentro del commit
que invalidaría.

## Cobertura de GFM

Más allá de párrafos, encabezados, listas, código de bloque y tablas:

| Constructo          | Se renderiza como                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `~~strikethrough~~` | Texto tachado — un solo trazo por tramo fusionado, con grosor escalado al tamaño de la fuente (`0.8.0+`)           |
| `- [ ]` / `- [x]`   | Un glifo ☐ o ☑ seguido de un espacio, que reemplaza la viñeta; `1.` y luego el glifo cuando es ordenada (`0.8.0+`) |
| `\|:--\|--:\|:-:\|` | La alineación de columnas, reenviada a `Table.align` (`0.8.0+`)                                                    |
| `$…$` / ` ```math ` | Una fórmula compuesta por `@vectojs/tex` (en línea / en bloque), convertida solo una vez que el delimitador cierra |

## Metadatos iniciales (Front matter)

Un bloque YAML delimitado por `---` al inicio del documento es metadato, no
contenido (`0.8.0+`):

```ts
const md = new Markdown('---\ntitle: Release notes\ndate: 2026-08-03\n---\n# Body');

md.frontMatter; // 'title: Release notes\ndate: 2026-08-03\n'
md.frontMatterFields; // { title: 'Release notes', date: '2026-08-03' }
```

Antes de `0.8.0` el bloque se renderizaba como contenido: `marked` no tiene noción
de metadatos iniciales, así que el `---` de apertura activaba la regla de la línea
divisoria y el de cierre **subrayaba las claves como un encabezado setext**. Un
documento con metadatos pintaba por tanto una línea horizontal más un encabezado
en negrita de 28px formado por sus propias claves.

`frontMatterFields` es una comodidad limitada, no YAML — las líneas indentadas se
omiten, así que los mapeos y secuencias anidados nunca se filtran como claves de
nivel superior (la clave padre está presente con un valor vacío). Para cualquier
necesidad más rica, entrega `md.frontMatter` a un analizador de verdad. Tanto
`scanFrontMatter(text, complete)` como `parseFrontMatterFields(raw)` se exportan
para usarse sobre texto sin procesar.

El reconocimiento es deliberadamente conservador, porque un falso positivo borra
en silencio el inicio de un documento. Un `---` inicial es metadato solo cuando la
línea siguiente es una entrada de mapeo YAML — `key: value`, con un espacio tras
los dos puntos como YAML exige — **y** le sigue un `---` o `...` de cierre. Así que
`---\n\n# Title`, `---\n# Title\n---`, `----\nkey: v\n----` y `---\n- a\n---` todos
siguen renderizando una línea divisoria.

Durante el streaming, un fragmento que aterriza dentro de un bloque sin cerrar se
retiene en lugar de analizarse léxicamente, de modo que el documento no pinta una
línea que el delimitador de cierre tendría luego que derribar. Un bloque que sigue
abierto cuando el flujo se cierra se libera como contenido, y la retención está
acotada, así que una línea divisoria al inicio de un documento largo no puede
estancarlo.

## Transmisión por streaming

`createStream()` vincula a este `Markdown` un único escritor que agrupa las escrituras
por fotograma. Haz `await write()` mientras consumes la fuente; `close()` confirma a
la fuerza la cola sin esperar otro fotograma de animación:

```ts
const stream = markdown.createStream();

try {
  for await (const token of llmStream) {
    await stream.write(token);
  }
  await stream.close();
} catch (error) {
  stream.abort(error);
  throw error;
}
```

```ts
interface StreamControllerOptions {
  maxBufferedChars?: number; // default 64 * 1024 UTF-16 code units
  pacing?: {
    graphemesPerSecond: number;
  };
  signal?: AbortSignal;
  incompleteMode?: IncompleteMarkdownMode; // default 'literal'
  onStable?: (blocks: readonly Entity[]) => void;
}

type IncompleteMarkdownMode = 'literal' | 'optimistic';

type StreamControllerState = 'open' | 'closed' | 'aborted';

interface StreamController {
  readonly state: StreamControllerState;
  readonly bufferedChars: number; // accepted + one blocked write
  write(chunk: string): Promise<void>;
  flush(): void;
  close(): Promise<void>;
  abort(reason?: unknown): void;
  destroy(): void;
}
```

El modo por defecto agrupa en una sola confirmación de análisis/maquetación todos los
fragmentos aceptados antes del siguiente rAF. `write()` se resuelve al admitirse en un
búfer acotado, no al hacerse visible. Cuando la capacidad es insuficiente, una
escritura espera; otra escritura mientras ese esperador existe se rechaza, de modo que
un productor que ignora la contrapresión no puede hacer crecer una cola no acotada.

`pacing.graphemesPerSecond` añade un ritmo de máquina de escribir fijo en tiempo real
manteniendo el techo de una confirmación por fotograma. `Intl.Segmenter` mantiene
juntas las secuencias combinantes ordinarias, los clústeres ZWJ de emoji, las banderas
y los pares subrogados a través de los límites de fragmento y fotograma. El ciclo de
vida completo, el repliegue acotado para clústeres patológicos, el patrón de
seguimiento inferior y la estrategia de transcripciones están en
[Streaming y texto en tiempo real](/learn/streaming/).

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

Pensado para el trabajo puntual posterior al flujo — precalcular una caché de
resaltado, iniciar una animación de entrada — que no debería ejecutarse a mitad del
flujo contra contenido que aún es probable que cambie.

Solo puede haber un controlador abierto para un `Markdown`. `setContent()` lo aborta
antes de reemplazar; `destroy()` lo aborta y elimina los escuchadores de
rAF/`AbortSignal`. Los controladores terminales se dan de baja. El `appendMarkdown()`
público sigue siendo sincrónico: primero vacía cada fragmento de controlador enviado
previamente y luego aplica el fragmento directo en el orden exacto de llamada.

Evita llamar a `setContent(fullDocumentSoFar)` por cada token; eso reconstruye todo el
subárbol.

## Modelo de rendimiento

Lo que realmente cuesta cada llamada, para que el código de streaming pueda razonarse:

- **El análisis sintáctico está fuera del hilo principal por defecto.** `appendMarkdown` envía la fuente acumulada a un `Worker` construido desde un paquete incrustado (sin solicitud de red); el diff de tokens y las actualizaciones de entidades se aplican cuando el análisis regresa. Los entornos sin `Worker` (algunos ejecutores de pruebas, SSR) recurren al análisis léxico sincrónico — mismo resultado, costo en el hilo principal.
- **El análisis léxico es O(documento) por adjunto**, no O(fragmento): toda la fuente acumulada se retokeniza en cada llamada. Usa `createStream()` para agrupar por fotograma y segmenta transcripciones largas en una entidad `Markdown` por mensaje para que el documento en vivo se mantenga pequeño.
- **Los bloques terminados se reutilizan, no se reconstruyen.** `appendMarkdown` compara por prefijo la nueva lista de tokens con la anterior mediante la fuente original; cada bloque ya renderizado mantiene su instancia de entidad. El caso común de streaming — el último párrafo creció — actualiza los spans de ese párrafo en el lugar.
- **`setContent()` no reutiliza nada.** Elimina cada hijo y vuelve a renderizar la lista completa de tokens. Es la llamada correcta para _reemplazar_ un documento, y la llamada incorrecta para _hacer crecer_ uno.

## Punto de extensión

Existen dos superficies de extensión:

- **`renderToken(token)`** está protegido, así que los renderizadores personalizados pueden subclasificar `Markdown` para bloques específicos de la aplicación a la vez que siguen delegando los tokens normales al renderizador integrado.
- **Registro de bloques delimitados (Fenced block registry)** — renderizado conectable para bloques de código con clave por cadena de información (code, math, mermaid, graphviz, …). Un renderizador se carga perezosamente en el primer `render()` y se cachea; `'error'` recurre al renderizador de bloques de código por defecto.

```ts
import { FencedBlockRegistry } from '@vectojs/markdown';

FencedBlockRegistry.register('mermaid', {
  async load() {
    const mermaid = await import('mermaid');
    return (source, lang, options) => {
      /* render → Entity */
    };
  },
});
FencedBlockRegistry.unregister('mermaid');
```

`FencedBlockRenderOptions` lleva `{ theme, availableWidth, selectable }`. Exportaciones relacionadas: `isFencedBlockRendererReady`, `renderFencedBlock`, además de `PRESET_THEMES` / `resolvePresetTheme` / `isPresetName` para la resolución de temas, y los ayudantes `tableToCsv` / `tableToMarkdown` / `extensionForLanguage` / `mimeForLanguage` (los internos de affordances y exportación).

Superficie de utilidad adicional: `Markdown.setUserTiming(on)` (conmutador en tiempo de ejecución de la medida de parseo), `codeAtlas` / `codeAtlasStats` / `highlightedLanguages` (diagnósticos de atlas), y `MathBlock` / `preloadMathJax()` / `isMathJaxReady` para el renderizador de matemáticas TeX opcional (se carga perezosamente, no se arrastra por defecto).

## Lista de verificación para mantenedores

- Las devoluciones de llamada de enlaces deben reenviarse a los nodos `RichText` de párrafo, encabezado y lista.
- Los bloques de código deben seguir siendo una sola entidad hoja, no una entidad por token o segmento de línea.
- El código de bloque debe proyectar su texto fuente exacto y saltos de línea.
- Los encabezados de tabla usan el color/estilo negrita de encabezado, mientras que cada celda lógica posee exactamente una proyección de contenido.
- La propiedad del puntero permanece en la proyección de texto/código hoja; las entidades estructurales de lista y tabla no deben interceptar la selección nativa.
- La transmisión por streaming debe reutilizar entidades de prefijo no modificadas.

Relacionado: [`RichText`](/reference/ui-components/#richtext), [`CodeBlock`](/reference/ui-components/#codeblock), [`Table`](/reference/ui-components/#table).
