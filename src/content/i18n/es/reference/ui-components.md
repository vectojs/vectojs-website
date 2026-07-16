---
title: 'Referencia de Componentes @vectojs/ui'
description: 'Referencia completa de todos los componentes de @vectojs/ui: contenedores de layout, controles de formulario, superposiciones y contenido enriquecido.'
order: 11
---

# `@vectojs/ui` — Referencia de Componentes

> Componentes reutilizables de alto nivel para el motor Canvas zero-DOM de VectoJS.
> Versión documentada: **1.9.3**. Fuente de verdad: `dist/index.d.ts` (superficie pública) y `packages/ui/src/*` (comportamiento).

Cada componente es una hoja o contenedor en el Virtual Math Tree (VMT). Nada aquí es DOM real — los componentes se dibujan a sí mismos en un Canvas mediante un `IRenderer`. La accesibilidad, la automatización de agentes y la capacidad de rastreo provienen de un **A11y Shadow DOM** paralelo: cuando un componente es `interactive`, la `Scene` proyecta un único nodo DOM real oculto y transparente posicionado sobre la caja del componente, construido a partir de `getA11yAttributes()`. Es por eso que `page.getByRole('button', { name })` / `fill()` / los lectores de pantalla funcionan contra una UI de Canvas puro.

Las superficies de aplicación que solo usan texto pueden importar `Text` desde `@vectojs/ui/text`. Esta entrada ligera excluye Markdown y MathJax del grafo de inicio; usa la entrada raíz `@vectojs/ui` al componer varias familias de componentes.

## Galería de componentes en vivo

La galería a continuación es ahora una prueba de humo a nivel de paquete. Para la depuración diaria, usa las páginas de componentes enfocadas para que un comportamiento pueda inspeccionarse sin desplazarse por cada componente:

| Área                             | Páginas de componentes                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Texto y multimedia               | [`Text`](/reference/ui-text/), [`RichText`](/reference/ui-richtext/), [`Link`](/reference/ui-link/), [`Image`](/reference/ui-image/)                                                                                                                                                                                                                                                 |
| Contenedores de layout           | [`Card`](/reference/ui-card/), [`Stack`](/reference/ui-stack/), [`Flow`](/reference/ui-flow/), [`ScrollView`](/reference/ui-scrollview/), [`VirtualList`](/reference/ui-virtuallist/), [`TreeView`](/reference/ui-treeview/), [`Paneles redimensionables`](/reference/ui-resizable-panel/)                                                                                           |
| Controles y formularios          | [`Button`](/reference/ui-button/), [`Input`](/reference/ui-input/), [`TextArea`](/reference/ui-textarea/), [`Checkbox`](/reference/ui-checkbox/), [`Toggle`](/reference/ui-toggle/), [`Slider`](/reference/ui-slider/), [`Dropdown`](/reference/ui-dropdown/), [`RadioGroup`](/reference/ui-radiogroup/), [`Tabs`](/reference/ui-tabs/), [`ProgressBar`](/reference/ui-progressbar/) |
| Contenido enriquecido            | [`Markdown`](/reference/ui-markdown/), [`CodeBlock`](/reference/ui-codeblock/), [`Table`](/reference/ui-table/)                                                                                                                                                                                                                                                                      |
| Superposiciones y UI transitoria | [`Overlay`](/reference/ui-overlay/), [`Tooltip`](/reference/ui-tooltip/), [`Popover`](/reference/ui-popover/), [`ContextMenu`](/reference/ui-contextmenu/), [`Modal`](/reference/ui-modal/)                                                                                                                                                                                          |

<figure class=\"sandbox component-gallery\">
  <div class=\"sandbox-bar\"><span class=\"dot\"></span><span class=\"dot\"></span><span class=\"dot\"></span><span class=\"sandbox-label\">en vivo · @vectojs/ui 1.9.5 · desplázate dentro</span></div>
  <iframe src=\"/sandbox/ui-components.html\" class=\"sandbox-frame component-gallery-frame\" loading=\"eager\" title=\"Galería interactiva de cada componente de UI de VectoJS\" sandbox=\"allow-scripts allow-same-origin allow-popups\"></iframe>
  <figcaption>Galería de prueba de humo a nivel de paquete: cobertura amplia primero, páginas de componentes enfocadas al depurar un comportamiento específico.</figcaption>
</figure>

## Convenciones compartidas por todos los componentes

Todos los componentes extienden `UIComponent`, que extiende la `Entity` base. Los siguientes miembros heredados se usan constantemente y **no** se repiten por componente a continuación.

| Miembro             | Signature                                          | Notas                                                                                                                                                                                                                    |
| ------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `setPosition`       | `setPosition(x, y): this`                          | Colocación en espacio local; encadenable.                                                                                                                                                                                |
| `add` / `remove`    | `add(child: Entity): this` / `remove(child): this` | Gestión de hijos (los contenedores sobrescriben `add` para re-hacer layout).                                                                                                                                             |
| `on` / `off`        | `on(event, cb, { capture? }): this`                | Captura+y-burbujeo similar a DOM. Eventos: `click hover pointerdown pointerup pointercancel pointermove pointerleave change focus blur wheel keydown keyup`.                                                             |
| `emit`              | `emit(event, payload): void`                       | Despacho directo solo a sí mismo (sin propagación por el árbol).                                                                                                                                                         |
| `getGlobalPosition` | `getGlobalPosition(): Point`                       | Posición en espacio mundial acumulando transformaciones de ancestros.                                                                                                                                                    |
| `scene`             | `get scene`                                        | `Scene` adjunta más cercana; usa `this.scene?.markDirty()` para solicitar un repintado en escenas `onDemand`.                                                                                                            |
| `interactive`       | `interactive: boolean`                             | Cuando es true, el componente proyecta un nodo de sombra A11y y recibe eventos de puntero/teclado.                                                                                                                       |
| `clipChildren`      | `clipChildren: boolean`                            | Recorta los dibujos normales de los hijos a la caja local. Canvas/SVG son exactos; Three usa un scissor AABB para clips rotados/cizallados. Los trazados GPU point/WebGPU overlay no participan. Usado por `ScrollView`. |
| `width` / `height`  | `number`                                           | La caja del componente; impulsa las pruebas de impacto y el culling del viewport.                                                                                                                                        |
| `padding`           | `number`                                           | Relleno interior (por defecto `0`); los componentes tipo caja lo predeterminan más alto.                                                                                                                                 |
| transformaciones    | `x y scaleX scaleY rotation opacity`               | Las transformaciones afines y la opacidad multiplicativa son heredadas por los hijos.                                                                                                                                    |
| `animate`           | `animate(targetProps, durationMs): this`           | Pone en cola interpolaciones numéricas.                                                                                                                                                                                  |

---

## `UIComponent` (base abstracta)

```ts
abstract class UIComponent extends Entity {
  padding: number; // por defecto 0
  isPointInside(globalX: number, globalY: number): boolean;
  getBounds(): Bounds; // { x:0, y:0, width, height }

  // Helper de presencia de entrada/salida
  protected enterMotion?: MotionSpec; // se reproduce al montar
  protected exitMotion?: MotionSpec; // se reproduce al llamar dismiss()
  dismiss(): Promise<void>; // reproduce exitMotion, luego elimina del árbol
}
```

Centraliza el modelo de caja + prueba de impacto alineada a ejes (AABB) compartida por cada componente. `isPointInside` devuelve si el punto está en `[0,width] × [0,height]` en espacio local. `getBounds()` devuelve la caja local para que la `Scene` pueda hacer culling del viewport. Las subclases establecen `width`/`height` a partir del contenido medido, implementan `render(r)` y (cuando son interactivas) sobrescriben `getA11yAttributes()`.

**Presencia:** declara `enterMotion` / `exitMotion` como un `MotionSpec` (`{ props: { opacity: [0, 1], … }, config? }`) y el componente se anima al entrar cuando se monta en una escena viva y al salir en `dismiss()` — que difiere su propia eliminación hasta que la animación de salida se resuelve. Una implementación compartida sobre el [sistema de animación base](/reference/core-api/#animation), reemplazando los springs hechos a mano por componente. El movimiento se suprime bajo `prefers-reduced-motion` (las transiciones de opacidad se mantienen).

### `getA11yAttributes(): A11yAttributes`

El hook que cada componente interactivo sobrescribe. La forma devuelta (de `@vectojs/core`) impulsa el nodo de sombra proyectado:

```ts
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // por defecto 'div'
  role?: string; // rol ARIA
  label?: string; // aria-label / nombre accesible
  href?: string; // tag 'a'
  src?: string;
  alt?: string; // tag 'img'
  inputType?: string;
  placeholder?: string;
  value?: string; // tag 'input'
  checked?: boolean; // input.checked o aria-checked, actualizado cada fotograma
  disabled?: boolean;
  expanded?: boolean;
  controls?: string;
  haspopup?: string;
  selected?: boolean;
  activedescendant?: string;
  valuemin?: string;
  valuemax?: string;
}
```

---

## Texto y tipografía

### `Text`

```ts
new Text(text: string, opts?: TextOptions)

interface TextOptions {
  font?: string;                  // por defecto '16px sans-serif'
  color?: string;                 // por defecto '#e2e8f0'
  maxWidth?: number;              // ancho de ajuste; omitir → solo '\\n' explícito rompe líneas
  lineHeight?: number;            // avance de línea en px, por defecto 20
  preserveLeadingSpaces?: boolean;// por defecto false
  selectable?: boolean;           // selección por arrastre nativa del navegador, por defecto true
}
```

Texto multilínea dibujado con `fillText` nativo. El ajuste/medición pasan por el `LayoutEngine` base (misma ruta `Intl.Segmenter` que `TextEntity`) con una **división frío/caliente**:

- `setText(text): this` — pasada en frío (re-segmentar + re-medir), luego re-hacer layout.
- `append(text): this` — ruta de streaming/typewriter; equivale a `setText(this.text + text)` pero el memo de párrafos del motor reutiliza los párrafos iniciales no tocados, por lo que solo el último párrafo cambiado se vuelve a medir.
- `setMaxWidth(maxWidth): this` — ruta **caliente**; re-ajusta el texto medido en caché solamente (sin re-segmentación). Prefiere esto para reflujo responsive.
- `setSelectable(selectable): this` — habilita o deshabilita la superficie de selección nativa proyectada.

La proyección de contenido refleja los saltos de línea visuales y la altura de línea para la búsqueda, selección y copia del navegador. El texto estático no es un objetivo de impacto interactivo; Canvas/VMT aún posee sus píxeles y layout.

### `RichText`

```ts
new RichText(spans: StyledSpan[], opts?: RichTextOptions)

interface RichTextOptions {
  font?: string;                          // abreviatura base, por defecto '16px sans-serif'
  color?: string;                         // relleno por defecto, por defecto '#e2e8f0'
  maxWidth?: number;                      // ancho de ajuste
  baseStyle?: TextStyle;                  // heredado por cada fragmento (el estilo del fragmento aún gana)
  linkColor?: string;                     // por defecto '#38bdf8' para fragmentos de enlace sin color propio
  onLinkClick?: (href: string) => void;   // se dispara cuando se activa un fragmento de enlace
  exclusions?: ExclusionRect[];           // rectángulos alrededor de los cuales fluye el texto (formas de exclusión / flotantes)
  selectable?: boolean;                   // selección por arrastre nativa del navegador, por defecto true
}
```

Texto en línea multi-estilo: fragmentos en negrita / cursiva / coloreados / de diferentes tamaños fluyen y se ajustan en líneas de base compartidas. El layout usa `LayoutEngine.prepareRich` del núcleo; cada glifo se dibuja con el color/ peso/ inclinación de su fragmento.

- `setSpans(spans): this` — reemplaza fragmentos y re-hace layout.
- `appendSpans(spans): this` — ruta de **streaming**; el memo de párrafos enriquecidos reutiliza los párrafos iniciales no tocados, por lo que un flujo de tokens se re-prepara en O(párrafo cambiado), no en O(documento).
- `setMaxWidth(maxWidth): this` — reflujo.
- `setExclusions(exclusions): this` — establece regiones flotantes y refluye.
- `setSelectable(selectable): this` — alterna la selección nativa sin reconstruir fragmentos.

A11y: cada **fragmento de enlace** contiguo obtiene un hijo `<a>` hotspot transparente (reconciliado a través de re-ajuste — un hotspot por fragmento; la posición se actualiza in situ, solo un cambio en el _número_ de enlaces reconstruye los nodos de sombra). El nombre accesible del componente es el texto completo concatenado.

### `measureText`, `wrapLines`, `wrapText` (funciones libres)

```ts
measureText(text: string, font: string): number
```

Ancho de píxel renderizado en una `font` CSS, memoizado mediante un LRU acotado (capacidad 1000). El árabe se forma antes de medir. Recurre a una estimación de `0.5em` por carácter sin DOM.

```ts
wrapLines(text: string, font: string, maxWidth: number): string[]
```

Ajuste de palabras codicioso que respeta los `\\n` explícitos. Las palabras demasiado largas obtienen su propia línea (no se dividen).

```ts
wrapText(value: string, maxWidth: number, measure: (s: string) => number): WrappedLine[]

interface WrappedLine { text: string; start: number; end: number; }  // rango de caracteres absoluto
```

Similar a `wrapLines` pero rastrea el rango de caracteres absoluto de cada línea (para que un desplazamiento de caret lineal se asigne a `(line, x)`), consume `\\n` duros (un salto de línea final produce una línea vacía final en la que el caret puede posicionarse), y divide una palabra individual demasiado larga a nivel de carácter. Usado internamente por `TextArea`.

---

## Contenedores de layout

### `Stack`

```ts
new Stack(opts?: StackOptions)

interface StackOptions {
  direction?: 'vertical' | 'horizontal';  // por defecto 'vertical'
  gap?: number;                            // por defecto 0
  align?: 'start' | 'center' | 'end';      // eje transversal, por defecto 'start'
  wrap?: boolean;                          // por defecto false
  maxWidth?: number;                       // umbral de ajuste del eje principal (horizontal); por defecto Infinity
  maxHeight?: number;                      // umbral de ajuste del eje principal (vertical); por defecto Infinity
}
```

Posiciona los hijos secuencialmente a lo largo del eje principal con `gap`, alineando en el eje transversal. Los hijos mantienen sus propios tamaños — solo se establecen `x`/`y`. No dibuja nada por sí mismo.

- `add(child): this` — añade y **ejecuta `layout()` inmediatamente**.
- `layout(): void` — posiciona todos los hijos y dimensiona el contenedor para que encaje (para que pueda ser cullido). Llámalo manualmente después de mutar hijos fuera de `add` (ej. redimensionando un hijo).

Cuando `wrap` es true, los hijos que excederían `maxWidth`/`maxHeight` a lo largo del eje principal comienzan una nueva línea; el contenedor crece en el eje transversal.

```ts
const col = new Stack({ direction: 'vertical', gap: 12 });
col.add(new Text('Title'));
col.add(new Button('Go'));
scene.add(col.setPosition(40, 40));
```

### `Flow`

```ts
new Flow(opts?: FlowOptions)

interface FlowOptions extends Omit<StackOptions, 'direction' | 'wrap'> {
  direction?: 'horizontal';
}
```

Un `Stack` preconfigurado como `{ direction: 'horizontal', wrap: true }` — elementos horizontales que se ajustan a la siguiente línea más allá de `maxWidth`. Úsalo para nubes de etiquetas, filas de chips. Hereda `add()`/`layout()`.

### `Card`

```ts
new Card(opts: CardOptions)

interface CardOptions {
  width: number;          // requerido
  height: number;         // requerido
  bg?: string;            // por defecto '#0f172a'
  border?: string;        // omitir → sin borde
  borderWidth?: number;   // por defecto 1
  radius?: number;        // por defecto 12
  padding?: number;       // por defecto 0 (los consumidores posicionan los hijos manualmente)
  label?: string;         // cuando se establece → interactivo + role=\"group\" landmark
}
```

Un panel de fondo redondeado con borde opcional. Agrega hijos mediante `add()`; se renderizan encima en el espacio local de la tarjeta. **Decorativo por defecto** (sin nodo de sombra, no interactivo). Pasar `label` lo hace interactivo y proyecta `{ role: 'group', label }` para que la tecnología de asistencia/agentes puedan encontrar la región. `padding` es solo informativo — no inserta automáticamente los hijos.

---

## Controles y formularios

Todos los controles de formulario a continuación son `interactive` y proyectan un nodo de sombra real; el canvas es un espejo visual impulsado por los eventos nativos del nodo de sombra.

### `Button`

```ts
new Button(label: string, opts?: ButtonOptions)

interface ButtonOptions {
  onClick?: (e: unknown) => void;  // se dispara TANTO para prueba de impacto en canvas como para click del shadow <button>
  bg?: string;                     // por defecto '#2563eb'
  hoverBg?: string;                // por defecto '#3b82f6'
  color?: string;                  // color de la etiqueta, por defecto '#ffffff'
  font?: string;                   // por defecto '600 16px sans-serif'
  padding?: number;                // por defecto 12
  radius?: number;                 // por defecto 8
}
```

Rectángulo redondeado con una etiqueta centrada. `width` se auto-dimensiona a `measureText(label, font) + 2·padding`; `height` a `fontSizePx(font) + 2·padding` (el tamaño en px analizado de `font`, no el ancho medido de la etiqueta). Proyecta `{ tag: 'button', role: 'button', label }` → manejado por `getByRole('button', { name })`. Estado público: `focused` (dibuja un anillo de foco `#00f0ff`), `hovered` interno (cambia a `hoverBg`).

### `Link`

```ts
new Link(label: string, opts: LinkOptions)   // opts requerido (href)

interface LinkOptions {
  href: string;          // requerido; destino de navegación + shadow <a href>
  color?: string;        // por defecto '#38bdf8'
  font?: string;         // por defecto '16px sans-serif'
  underline?: boolean;   // por defecto true
}
```

Texto coloreado (opcionalmente subrayado). Se auto-dimensiona a la etiqueta. Proyecta un nodo de sombra real `{ tag: 'a', href, label }` (nativamente clickeable/rastreable). La ruta de prueba de impacto del canvas abre mediante `window.open(href, '_blank', 'noopener')`.

### `Image`

```ts
new Image(src: string, opts: ImageOptions)

interface ImageOptions {
  width: number;          // requerido (el canvas necesita una caja conocida para layout/culling)
  height: number;         // requerido
  alt?: string;           // por defecto ''
  placeholder?: string;   // relleno hasta que cargue, por defecto '#1e293b'
  radius?: number;        // radio de esquina del placeholder, por defecto 0
  onLoad?: () => void;    // se dispara una vez que el bitmap carga
}
```

Dibuja mediante `drawImage`; proyecta `{ tag: 'img', src, alt, label: alt }`. La carga es asíncrona — se dibuja una caja de placeholder hasta que esté lista. En escenas `onDemand` pasa `onLoad: () => scene.markDirty()` para repintar al cargar. (Sombrea `globalThis.Image`; referencia la clase como `import { Image } from '@vectojs/ui'`.)

### `Input`

```ts
new Input(opts: InputOptions)

interface InputOptions {
  width: number;             // requerido
  height?: number;           // por defecto 40
  placeholder?: string;
  value?: string;            // por defecto ''
  font?: string;             // por defecto '16px sans-serif'
  color?: string;            // por defecto '#e2e8f0'
  placeholderColor?: string; // por defecto '#64748b'
  bg?: string;               // por defecto '#0f172a'
  border?: string;           // por defecto '#334155'
  selectionColor?: string;   // por defecto 'rgba(56, 189, 248, 0.35)'
  radius?: number;           // por defecto 6
  padding?: number;          // por defecto 10
  onChange?: (value: string) => void;
}
```

Campo de una sola línea respaldado por un **nodo de sombra `<input>` real y transparente**. El navegador maneja toda la entrada — clics, teclado, **composición IME**, selección, portapapeles, deshacer — de forma nativa en ese elemento; el canvas solo dibuja. La `Scene` refleja el estado de vuelta a través de un evento `change` cuyo payload lleva `value`, `selectionStart`, `selectionEnd` y `composition`. El componente re-expone estos como campos públicos:

- `value: string`, `focused: boolean` (impulsa el parpadeo del caret de 500ms).
- `selectionStart` / `selectionEnd: number` — desplazamientos de caret/selección reflejados desde la entrada real.
- `composition: { start; length } | null` — rango activo de pre-edición IME (dibujado como un subrayado).

A11y: `{ tag: 'input', inputType: 'text', placeholder, value, label: placeholder }`. Los agentes usan `fill()` por rol; los humanos escriben CJK; el canvas renderiza caret, resaltado de selección, subrayado IME y scroll-to-caret (`scrollLeft`). Maneja rangos RTL (hebreo/árabe) mediante el motor de layout.

### `TextArea`

```ts
new TextArea(opts: TextAreaOptions)

interface TextAreaOptions {
  width: number;             // requerido
  height?: number;           // por defecto 120
  placeholder?: string;
  value?: string;            // por defecto ''
  font?: string;             // por defecto '16px sans-serif'
  lineHeight?: number;       // múltiplo del tamaño de fuente, por defecto 1.4
  color?: string;            // por defecto '#e2e8f0'
  placeholderColor?: string; // por defecto '#64748b'
  bg?: string;               // por defecto '#0f172a'
  border?: string;           // por defecto '#334155'
  selectionColor?: string;   // por defecto 'rgba(56, 189, 248, 0.35)'
  radius?: number;           // por defecto 6
  padding?: number;          // por defecto 10
  onChange?: (value: string) => void;
}
```

Campo multilínea respaldado por un **nodo de sombra `<textarea>` real y transparente** — mismo modelo de espejo que `Input` más navegación multilínea. El canvas re-ajusta el valor (mediante `wrapText`) y dibuja texto, selección y caret. Los campos públicos reflejan `Input`: `value`, `focused`, `selectionStart`, `selectionEnd`, `composition`. `lineHeightFactor` contiene la opción `lineHeight`.

- `lineOfOffset(offset: number): number` — índice de línea visual (ajustada) que contiene un desplazamiento de caracteres lineal; los desplazamientos límite se resuelven a la primera línea que los contiene, los fuera de rango se limitan a la última. Útil para mapear la posición del caret a una línea.

A11y: proyecta un nodo de sombra `textarea`; los agentes usan `fill()`, los humanos escriben CJK, el renderizado sigue siendo Zero-DOM. El scroll vertical-to-caret mantiene la línea activa visible (`scrollTop`).

### `Checkbox`

```ts
new Checkbox(opts: CheckboxOptions)

interface CheckboxOptions {
  checked?: boolean;   // por defecto false
  label?: string;      // dibujado a la derecha; usado como nombre accesible
  size?: number;       // tamaño de la caja en px, por defecto 20
  font?: string;       // por defecto '16px sans-serif'
  color?: string;      // color de la etiqueta, por defecto '#e2e8f0'
  accent?: string;     // relleno cuando está marcado, por defecto '#2563eb'
  border?: string;     // borde no marcado, por defecto '#475569'
  onChange?: (checked: boolean) => void;
}
```

Respaldado por un nodo de sombra `<input type=\"checkbox\">` real — nativamente alternable por agentes/tecnología de asistencia. Tanto un `click` en el canvas como el `change` nativo del nodo de sombra se enrutan a través de un setter con guarda (sin `onChange` duplicado para un valor no cambiado). Público: `checked`. A11y: `{ tag: 'input', inputType: 'checkbox', checked, label }`.

### `Toggle`

```ts
new Toggle(opts: ToggleOptions)

interface ToggleOptions {
  checked?: boolean;   // por defecto false
  label?: string;      // dibujado a la derecha; usado como nombre accesible
  width?: number;      // ancho de la pista en px, por defecto 44  (expuesto como trackW)
  height?: number;     // alto de la pista en px, por defecto 24 (expuesto como trackH)
  font?: string;       // por defecto '16px sans-serif'
  color?: string;      // color de la etiqueta, por defecto '#e2e8f0'
  accent?: string;     // relleno de la pista en estado activado, por defecto '#2563eb'
  track?: string;      // relleno de la pista en estado desactivado, por defecto '#475569'
  onChange?: (checked: boolean) => void;
}
```

Interruptor estilo iOS que proyecta `{ role: 'switch', checked, label }` con `aria-checked`. Debido a que `role=\"switch\"` es un `div` (sin cambio nativo reenviado por la `Scene`), `click` re-emite un evento `change` propio; el único manejador `change` es la fuente de verdad, por lo que tanto los listeners externos `on('change', …)` como el callback `onChange` se disparan. Público: `checked`, `trackW`, `trackH`.

### `Slider`

```ts
new Slider(props?: SliderProps)   // props está tipado libremente (any) en el .d.ts

// Props reconocidas (leídas en el constructor):
{
  min?: number;            // por defecto 0
  max?: number;            // por defecto 100
  value?: number;          // por defecto = min
  width?: number;          // por defecto 200
  height?: number;         // por defecto 24
  step?: number;           // por defecto 1 — granularidad del valor para puntero y teclado
  trackColor?: string;     // por defecto 'rgba(255, 255, 255, 0.15)'
  progressColor?: string;  // por defecto '#00f0ff'
  handleColor?: string;    // por defecto '#fff'
}
```

Deslizador horizontal con un pulgar circular. Público: `min`, `max`, `value`, `step`. Arrastrar (`pointerdown` → `pointermove` → `pointerup`) mapea el `localX` del puntero a un valor, **ajustado a la rejilla de `step` anclada en `min`** (pasos enteros por defecto, coincidiendo con la semántica de `input[type=range]`), y emite un evento `change` con `{ value }` (suscríbete mediante `on('change', e => e.value)`). Teclado: `ArrowRight`/`ArrowUp` aumentan el paso, `ArrowLeft`/`ArrowDown` disminuyen el paso, `Home`/`End` saltan a `min`/`max`. A11y: `{ role: 'slider', value, valuemin, valuemax }`. Las versiones anteriores a 1.0 de UI tenían valores solo enteros y no tenían manejo de teclado.

### `Dropdown`

```ts
new Dropdown(options: string[], props?: DropdownProps)  // props tipado libremente (any)

// Props reconocidas:
{
  value?: string;   // selección inicial; por defecto = options[0]
  width?: number;   // por defecto 120
  height?: number;  // por defecto 36
  bg?: string;      // fondo del botón, por defecto 'rgba(30, 41, 59, 0.85)'
  color?: string;   // por defecto '#fff'
  radius?: number;  // por defecto 8
  font?: string;    // por defecto '14px sans-serif'
}
```

Un combobox: un `Button` muestra el valor actual; al hacer click (o `ArrowDown`/`ArrowUp`/`Enter`/`Space`) se abre un menú `Stack` de `Button`s de opción más un fondo transparente de pantalla completa, ambos montados mediante `scene.showOverlay(...)`. `Escape` o un click en el fondo cierra mediante `scene.hideOverlay(...)`. Seleccionar emite un evento `change` con `{ value }`. La navegación por teclado rastrea un índice resaltado; `activedescendant` y los ids de opción (`${id}-opt-${i}`) están conectados para ARIA.

A11y en la raíz: `{ role: 'combobox', expanded, controls, haspopup: 'listbox', value, activedescendant }`. El menú proyecta `role=\"listbox\"`, cada opción `role=\"option\"` con `selected`.

---

## Superposiciones

### `Modal`

```ts
new Modal(title: string, props?: ModalProps)  // props tipado libremente (any)

// Props reconocidas:
{
  width?: number;       // fondo, por defecto window.innerWidth (fallback 800)
  height?: number;      // fondo, por defecto window.innerHeight (fallback 600)
  backdropColor?: string; // por defecto 'rgba(0, 0, 0, 0.5)'
  modalWidth?: number;  // tarjeta central, por defecto 400
  modalHeight?: number; // por defecto 250
  cardBg?: string;      // por defecto 'rgba(15, 23, 42, 0.95)'
  cardBorder?: string;  // por defecto 'rgba(255, 255, 255, 0.15)'
}
```

Un fondo oscuro de pantalla completa con una `Card` centrada que contiene el texto `title` y un botón "Cerrar" integrado. La tarjeta se escala al montar (spring) a través del [sistema de animación](/reference/core-api/#animation) compartido; bloquea los `click`/`pointerdown` subyacentes. Muéstralo con `scene.showOverlay(modal)`.

- `close(): Promise<void>` — devuelve la escala de la tarjeta a 0 mediante spring, luego desmonta mediante `scene.hideOverlay(this)` una vez que la animación de salida se resuelve (teardown seguro diferido). Esperable.
- `update(dt, time)` — ejecuta el spring y marca la escena como sucia mientras anima (llamado por el bucle de renderizado).

### `ScrollView`

```ts
new ScrollView(opts: ScrollViewOptions)

interface ScrollViewOptions { width: number; height: number; }
```

Un viewport de recorte (`clipChildren = true`) con desplazamiento por rueda + arrastre de puntero y física de spring (fricción `0.85`, spring `0.1`). Los hijos viven dentro de una `content` Entity no interactiva que se traslada; la caja del viewport permanece fija.

- `content: Entity` — el contenedor desplazable (público).
- `add(child): this` / `remove(child): this` — muta `content` y llama a `updateContentSize()`.
- `updateContentSize(): void` — recalcula `content.width/height` a partir de las extensiones de los hijos (llamar después de mutar hijos directamente) para establecer el rango máximo de desplazamiento.
- `scrollTo(y: number): void` — desplaza a un offset Y donde **0 es la parte superior** (internamente limita; API de desplazamiento pública añadida en 0.1.1).
- `scrollToBottom(): void` — salta al final del contenido (añadido en 0.1.1).
- `update(dt, time)` — integra el spring hacia el offset objetivo (llamado por el bucle de renderizado).

El desplazamiento con rueda llama a `preventDefault()` excepto con `Ctrl` presionado (deja que el navegador haga zoom). El arrastre con puntero mueve el contenido 1:1 con el cursor/dedo. El objetivo de desplazamiento se limita a `[-maxScroll, 0]`.

```ts
const sv = new ScrollView({ width: 360, height: 480 });
sv.add(longContent);
scene.add(sv.setPosition(20, 20));
sv.scrollToBottom(); // ej. un registro de chat después de añadir
```

---

## Contenido / documentos enriquecidos

### `Markdown`

```ts
new Markdown(markdownText: string, opts?: MarkdownOptions)

interface MarkdownOptions {
  maxWidth?: number;     // por defecto 800
  theme?: MarkdownTheme;
  onLinkClick?: (href: string) => void;
  selectable?: boolean;  // por defecto true; se propaga a texto/código/celdas de tabla renderizadas
}

interface MarkdownTheme {        // todo opcional; valores por defecto mostrados
  textColor?: string;            // '#e2e8f0'
  headingColor?: string;         // '#f8fafc'
  codeColor?: string;            // '#a5f3fc'
  codeBgColor?: string;          // 'rgba(30, 41, 59, 0.85)'
  quoteBorderColor?: string;     // '#6366f1'
  quoteTextColor?: string;       // '#94a3b8'
  hrColor?: string;              // 'rgba(148, 163, 184, 0.3)'
  tableBgColor?: string;         // 'rgba(15, 15, 25, 0.4)'
  tableHeaderBgColor?: string;   // 'rgba(255, 255, 255, 0.08)'
  bodyFont?: string;             // 'Inter, system-ui, sans-serif'
  codeFont?: string;             // '"JetBrains Mono", "Fira Code", monospace'
  fontSize?: number;             // 16
}
```

Analiza Markdown con **`marked` (v18, GFM)** en un subárbol VMT bajo un `Stack` vertical (`content`, gap 16). Tokens soportados: encabezados (h1–h6, tamaños escalados), párrafos (`RichText` con ajuste de palabras), bloques de código delimitados (`CodeBlock` con resaltado de palabras clave), blockquotes (barra de acento izquierda), listas ordenadas/no ordenadas, reglas horizontales, código en línea, enlaces — y **tablas GFM** (renderizadas mediante el componente `Table`; soporte de tablas GFM añadido en 0.1.1). `content.width`/`height` dimensionan el componente.

Dos rutas de actualización de contenido — **elegir la correcta importa para streaming:**

- `setContent(markdown): this` — **reconstrucción completa**: elimina cada hijo y vuelve a renderizar desde cero. Úsalo para reemplazo único.
- `appendMarkdown(chunk): this` — **la ruta correcta para streaming/tokens**. Añade al búfer sin procesar, re-lexifica la fuente Markdown completa, diferencia tokens por fuente original, reutiliza entidades de prefijo no cambiadas y actualiza el último párrafo (en crecimiento) in-place mediante `RichText.setSpans`. Evita una reconstrucción completa del árbol de entidades, pero el lexing aún escala con la longitud del documento.
- `setSelectable(selectable): this` — actualiza los descendientes de texto/código/tabla existentes y se convierte en el valor por defecto para futuros nodos de streaming.

> Gotcha: **no** hagas streaming llamando a `setContent(fullSoFar)` en cada token. Eso reconstruye todo el árbol cada token (O(documento) por token) y hace que el costo del layout crezca con el documento. Alimenta solo el nuevo delta a `appendMarkdown(chunk)`.

```ts
const md = new Markdown('', { maxWidth: 600 });
scene.add(md.setPosition(40, 40));
for await (const token of llmStream) md.appendMarkdown(token); // reutiliza el prefijo renderizado no cambiado
```

### `CodeBlock`

```ts
new CodeBlock(code: string, lang: string, maxWidth: number, theme: Required<MarkdownTheme>, selectable = true)
```

Una única hoja auto-renderizada para código delimitado: fondo redondeado + texto coloreado por línea y por segmento (resaltado de palabras clave/cadenas/comentarios/números para `js`/`ts`/`py`/`rust` y alias). Reemplaza la antigua explosión de entidades hijo por línea/segmento con una sola hoja plana. **Decorativo** — `isPointInside()` siempre devuelve `false`.

- `setCode(code, lang?): this` — re-analizar contenido (ej. edición en vivo).
- `setSelectable(selectable): this` — alternar la proyección de contenido de fuente exacta.

UI 1.9 comparte el `PreparedContentGrid` de Core 1.8 entre la pintura de Canvas por grafema y la proyección semántica. Las pestañas, CJK/emoji anchos, la formación del árabe, bidi, la sustitución de fuentes de Firefox, DPR/zoom y las transformaciones afines mantienen por tanto un plan de geometría consciente de la fuente.

Nota: `theme` debe ser un `Required<MarkdownTheme>` completamente resuelto. En la práctica, `CodeBlock` es producido internamente por `Markdown`; constrúyelo directamente solo si proporcionas un tema completo.

### `Table`

```ts
new Table(opts: TableOptions)

interface TableOptions {
  headers: (string | Entity)[];     // requerido; las instancias de Entity deben ser únicas
  rows: (string | Entity)[][];      // requerido (2D fila × col)
  colWidths?: number[];       // por columna en px; debe coincidir con headers.length, si no se distribuye uniformemente
  width?: number;             // ancho total, por defecto 600
  rowHeight?: number;         // por defecto 36
  bg?: string;                // por defecto 'rgba(15, 15, 25, 0.4)'
  headerBg?: string;          // por defecto 'rgba(255, 255, 255, 0.08)'
  borderColor?: string;       // por defecto 'rgba(255, 255, 255, 0.15)'
  headerTextColor?: string;   // por defecto '#ffffff'
  textColor?: string;         // por defecto '#e2e8f0'
  font?: string;              // por defecto '14px sans-serif'
  selectable?: boolean;       // selección de texto de celda nativa, por defecto true
}
```

Cuadrícula de datos nativa de Canvas: las celdas de cadena se convierten en entidades hijo Text, las celdas Entity se restringen mediante `setMaxWidth()` público, y `layout()` resuelve el ajuste, las alturas de fila y las posiciones antes de la pasada de `render()` solo de dibujo. Llama a `layout()` después de cambiar el contenido de celdas externas. Cada celda posee una proyección de contenido. A11y: proyecta `{ role: 'grid', label: 'Tabla de datos con N columnas y M filas.' }` para tecnología de asistencia. También el renderizador para tablas GFM dentro de `Markdown`.

---

### `RadioGroup`

```ts
new RadioGroup(opts: RadioGroupOptions)

interface RadioGroupOptions {
  options: RadioOption[];
  value?: string;
  direction?: 'horizontal' | 'vertical';
  gap?: number;
  size?: number;
  font?: string;
  color?: string;
  accent?: string;
  border?: string;
  onChange?: (value: string) => void;
}

interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}
```

Un grupo de opciones de radio mutuamente excluyentes proyectado con `{ role: 'radiogroup' }`; las aplicaciones deberían verificar las etiquetas y el comportamiento de teclado/foco. El payload del evento `'change'` estandarizado lleva `{ value }`.

---

### `Tabs`

```ts
new Tabs(opts: TabsOptions)

interface TabsOptions {
  tabs: TabItem[];
  value?: string;
  width: number;
  height: number;
  tabHeight?: number;
  font?: string;
  color?: string;
  selectedColor?: string;
  borderColor?: string;
  onChange?: (value: string) => void;
}

interface TabItem {
  id: string;
  label: string;
  content: Entity;
}
```

Un contenedor de selección por pestañas. Monta automáticamente la vista de contenido de la pestaña activa y la traslada dentro del espacio restante. Proyecta `{ role: 'tablist' }` para accesibilidad. El payload del evento `'change'` estandarizado lleva `{ value }`.

---

### `ProgressBar`

```ts
new ProgressBar(opts?: ProgressBarOptions)

interface ProgressBarOptions {
  value: number; // 0..1
  width?: number;
  height?: number;
  radius?: number;
  bg?: string;
  accent?: string;
  showText?: boolean;
  font?: string;
  color?: string;
}
```

Barra de progreso que muestra el progreso de las pistas. Opciones de texto centrado disponibles. Proyecta `{ role: 'progressbar', value }` para accesibilidad.

- `setValue(value: number): void` — Actualiza el valor con comprobaciones de límites de seguridad.

---

### `Overlay`

```ts
new Overlay(opts: OverlayOptions)

interface OverlayOptions {
  target: Entity;
  content: Entity;
  placement?: Placement; // 'top' | 'bottom' | 'left' | 'right' | 'top-start' | etc.
  offset?: number;       // distancia en px, por defecto 8
  autoFlip?: boolean;    // ajusta automáticamente la dirección si está fuera del viewport
}
```

Motor de capa de posicionamiento flotante. No proyecta nodo de accesibilidad de forma nativa.

---

### `Tooltip`

```ts
new Tooltip(opts: TooltipOptions)

interface TooltipOptions {
  target: Entity;
  content: string;
  placement?: Placement;
  delay?: number; // ms antes de mostrar, por defecto 300
}
```

Helper de tooltip flotante al hacer hover. Proyecta contenedor de tooltip al hacer hover relativo al objetivo.

---

### `Popover`

```ts
new Popover(opts: PopoverOptions)

interface PopoverOptions {
  target: Entity;
  width: number;
  height: number;
  placement?: Placement;
  offset?: number;
}
```

Panel emergente flotante al hacer click. Al hacer click en el objetivo se muestra el popover, al hacer click fuera se oculta automáticamente.

---

### `ContextMenu`

```ts
new ContextMenu(opts: ContextMenuOptions)

interface ContextMenuOptions {
  items: ContextMenuItem[];
  width?: number;
}

type ContextMenuItem =
  | { label: string; icon?: string; shortcut?: string; disabled?: boolean; onClick?: () => void; children?: ContextMenuItem[] }
  | { separator: true };
```

Componente de menú activado por click derecho. Soporta iconos, atajos, separadores y submenús recursivos.

- `showAtPoint(x: number, y: number): void` — Muestra el menú en una posición global de pantalla.

---

### `VirtualList`

```ts
new VirtualList(opts: VirtualListOptions)

interface VirtualListOptions {
  width: number;
  height: number;
  itemHeight: number | ((idx: number) => number);
  itemRenderer: (idx: number) => Entity;
}
```

Contenedor de lista desplazable optimizado para renderizado de alto rendimiento. Solo instancia/renderiza los elementos actualmente dentro de los límites del viewport.

---

### `TreeView`

```ts
new TreeView(opts: TreeViewOptions)

interface TreeViewOptions {
  nodes: TreeNode[];
}

interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[] | (() => Promise<TreeNode[]>);
}
```

Un navegador de árbol anidado. Soporta arrays de hijos síncronos o resolvedores de funciones de carga perezosa asíncrona.

---

### `ResizablePanel`

```ts
new PanelGroup(opts: PanelGroupOptions)
new Panel(opts: PanelOptions)
new PanelResizeHandle()

interface PanelGroupOptions {
  direction: 'horizontal' | 'vertical';
  width: number;
  height: number;
}

interface PanelOptions {
  minSize?: number;
  defaultSize?: number; // fracción
}
```

Un sistema de panel dividido redimensionable.

---

## Índice rápido

| Componente    | Constructor                     | Nodo de sombra / rol              |
| ------------- | ------------------------------- | --------------------------------- |
| `Text`        | `(text, opts?)`                 | `div` (name = text)               |
| `RichText`    | `(spans, opts?)`                | `div` + hotspots `<a>` por enlace |
| `Button`      | `(label, opts?)`                | `button` role=button              |
| `Link`        | `(label, opts)`                 | `a[href]`                         |
| `Image`       | `(src, opts)`                   | `img[src,alt]`                    |
| `Card`        | `(opts)`                        | ninguno, o role=group con `label` |
| `Stack`       | `(opts?)`                       | ninguno (estructural)             |
| `Flow`        | `(opts?)`                       | ninguno (estructural)             |
| `Input`       | `(opts)`                        | `input` transparente              |
| `TextArea`    | `(opts)`                        | `textarea` transparente           |
| `Checkbox`    | `(opts)`                        | `input[type=checkbox]`            |
| `Toggle`      | `(opts)`                        | role=switch                       |
| `Slider`      | `(props?)`                      | role=slider                       |
| `Dropdown`    | `(options, props?)`             | role=combobox + listbox/option    |
| `RadioGroup`  | `(opts)`                        | role=radiogroup                   |
| `Tabs`        | `(opts)`                        | role=tablist                      |
| `ProgressBar` | `(opts?)`                       | role=progressbar                  |
| `Overlay`     | `(opts)`                        | ninguno (estructural)             |
| `Tooltip`     | `(opts)`                        | tooltip                           |
| `Popover`     | `(opts)`                        | panel popover                     |
| `ContextMenu` | `(opts)`                        | lista de menú contextual          |
| `VirtualList` | `(opts)`                        | viewport scroll                   |
| `TreeView`    | `(opts)`                        | vista de árbol                    |
| `PanelGroup`  | `(opts)`                        | grupo redimensionable             |
| `ScrollView`  | `(opts)`                        | viewport de contenido             |
| `Modal`       | `(title, props?)`               | superposición (fondo + tarjeta)   |
| `Markdown`    | `(text, opts?)`                 | subárbol de lo anterior           |
| `CodeBlock`   | `(code, lang, maxWidth, theme)` | ninguno (decorativo)              |
| `Table`       | `(opts)`                        | role=grid                         |

> `Slider`, `Dropdown` y `Modal` aceptan props débilmente tipadas (`any`) en el `.d.ts` publicado; las tablas de opciones anteriores están derivadas de sus constructores fuente y son el contrato preciso.
