---
title: 'Componentes de UI'
description: 'Visión general de la biblioteca de componentes @vectojs/ui: formularios, contenedores de disposición, overlays y contenido enriquecido.'
order: 16
---

# Componentes de UI

El paquete `@vectojs/ui` proporciona un conjunto de componentes listos para usar, con calidad de producción, construidos sobre `@vectojs/core`. Cada componente se renderiza enteramente en canvas; la accesibilidad proviene de la capa automática del shadow DOM de A11y.

## Todos los componentes extienden `UIComponent`

<figure>
  <img src="/images/entity-hierarchy.svg" alt="Jerarquía de la clase Entity que muestra todos los componentes de UI integrados" class="diagram" />
  <figcaption>Cada componente hereda de Entity la posición, escala, rotación, animate() y el sistema de eventos completo.</figcaption>
</figure>

`UIComponent` extiende `Entity` y añade un modelo de caja compartido con hit-testing AABB. Todas las props heredadas (`x`, `y`, `width`, `height`, `opacity`, `interactive`, `animate`, `on`/`off`) funcionan en todos los componentes.

> **Nota sobre `interactive`:** La mayoría de los componentes de formulario (`Button`, `Input`, `Text`, etc.) establecen `this.interactive = true` en sus constructores. `Card` es decorativo por defecto — se vuelve interactivo solo cuando pasas una opción `label`.

## Contenedores de disposición

### `Stack`

Un contenedor tipo flexbox — posiciona los hijos secuencialmente a lo largo de un eje principal:

```typescript
import { Stack } from '@vectojs/ui';
import { Button, Text } from '@vectojs/ui';

const col = new Stack({ direction: 'vertical', gap: 12 });
col.add(new Text('Hello'));
col.add(new Button('Click me'));
scene.add(col.setPosition(40, 40));
```

Soporta `direction`, `gap`, `align` (eje transversal), y `wrap` opcional con `maxWidth`/`maxHeight`.

### `Flow`

Un `Stack` preconfigurado como `{ direction: 'horizontal', wrap: true }` — para filas de chips y nubes de etiquetas:

```typescript
import { Flow } from '@vectojs/ui';

const tags = new Flow({ gap: 8, maxWidth: 400 });
for (const label of ['TypeScript', 'WebGPU', 'Canvas']) {
  tags.add(new Button(label, { bg: '#1e293b', padding: 6 }));
}
scene.add(tags.setPosition(20, 20));
```

### `Card`

Un panel de fondo redondeado — añade hijos encima:

```typescript
import { Card } from '@vectojs/ui';

const card = new Card({
  width: 300,
  height: 200,
  bg: 'rgba(15, 23, 42, 0.8)',
  border: 'rgba(255, 255, 255, 0.1)',
  radius: 16,
  label: 'Settings panel', // makes it interactive + role="group"
});
card.add(toggle.setPosition(24, 24));
scene.add(card.setPosition(100, 100));
```

### `ResizablePanel`

Un sistema de disposición de paneles divididos que permite divisiones de redimensionamiento anidadas (tanto horizontales como verticales):

```typescript
import { PanelGroup, Panel, PanelResizeHandle } from '@vectojs/ui';

const group = new PanelGroup({ direction: 'horizontal', width: 600, height: 400 });
const leftPanel = new Panel({ minSize: 100, defaultSize: 0.3 });
const rightPanel = new Panel({ minSize: 150 });

group.addPanel(leftPanel);
group.addPanel(rightPanel);
scene.add(group);
```

## Controles de formulario

Todos los controles de formulario proyectan un nodo del shadow DOM real y transparente. Los agentes y los lectores de pantalla interactúan a través de esos elementos nativos; el canvas renderiza los visuales. Todos los controles de formulario tienen un enlace estandarizado del evento `change` y la ejecución del callback `onChange`.

### `Button`

```typescript
import { Button } from '@vectojs/ui';

const btn = new Button('Save', {
  bg: '#2563eb',
  hoverBg: '#3b82f6',
  onClick: () => save(),
});
scene.add(btn.setPosition(20, 20));
```

Se autodimensiona a la etiqueta. Proyecta `<button>` → `getByRole('button', { name: 'Save' })`.

### `Input` (una sola línea)

```typescript
import { Input } from '@vectojs/ui';

const input = new Input({
  width: 300,
  placeholder: 'Search…',
  onChange: (value) => console.log(value),
});
scene.add(input.setPosition(20, 80));
```

Respaldado por un **`<input>` transparente real** — el navegador maneja toda la escritura, IME, portapapeles y deshacer de forma nativa. El canvas solo dibuja lo visual. Los subrayados de composición IME, el parpadeo del cursor y la selección RTL se renderizan todos.

### `TextArea` (varias líneas)

El mismo modelo que `Input`, respaldado por un `<textarea>`. Soporta `lineHeight`, scroll vertical hasta el cursor, y `lineOfOffset(offset)` para el mapeo de cursor a línea.

### `Toggle`

```typescript
import { Toggle } from '@vectojs/ui';

const toggle = new Toggle({
  label: 'Dark mode',
  checked: false,
  accent: '#6366f1',
  onChange: (checked) => applyTheme(checked),
});
```

Proyecta `role="switch"` con `aria-checked`. Tanto los clics en canvas como la activación por teclado se enrutan a través del callback `onChange`.

### `Checkbox`

```typescript
import { Checkbox } from '@vectojs/ui';

const cb = new Checkbox({
  label: 'Subscribe to updates',
  checked: true,
  accent: '#2563eb',
  onChange: (checked) => setSubscribed(checked),
});
```

Respaldado por `<input type="checkbox">` — alternable de forma nativa por teclado y tecnología de asistencia.

### `RadioGroup`

Selecciones de opción mutuamente excluyentes renderizadas como círculos etiquetados. Soporta navegación por teclado (las teclas de flecha alternan las opciones) y dispara un callback `onChange` en la selección.

```typescript
import { RadioGroup } from '@vectojs/ui';

const radio = new RadioGroup({
  options: [
    { value: 'light', label: 'Light Mode' },
    { value: 'dark', label: 'Dark Mode', disabled: false },
    { value: 'system', label: 'System Default' },
  ],
  value: 'dark', // initially selected value
  gap: 28, // vertical spacing between options, default 28
  color: '#e2e8f0', // label text color
  accent: '#00f0ff', // fill color for the selected circle
  onChange: (val) => setTheme(val),
});
scene.add(radio.setPosition(40, 40));
```

Opciones clave:

| Opción     | Tipo                  | Por defecto | Descripción                            |
| ---------- | --------------------- | ----------- | -------------------------------------- |
| `options`  | `RadioOption[]`       | —           | Array de `{ value, label, disabled? }` |
| `value`    | `string`              | `''`        | Valor seleccionado inicialmente        |
| `gap`      | `number`              | `28`        | Espacio vertical entre filas           |
| `accent`   | `string`              | `'#00f0ff'` | Relleno del círculo seleccionado       |
| `onChange` | `(v: string) => void` | —           | Callback al cambiar la selección       |

Llama a `radio.setValue(val)` en cualquier momento para cambiar programáticamente la selección. Proyecta `role="radiogroup"` con `role="radio"` individual + `aria-checked` en cada opción.

### `Tabs`

Un contenedor de paneles con pestañas — renderiza una barra de pestañas horizontal y monta en la escena solo el `Entity` del panel activo. Cambiar de pestaña desmonta el panel anterior y monta el siguiente, manteniendo el VMT mínimo.

```typescript
import { Tabs } from '@vectojs/ui';

const settingsPane = new Stack({ direction: 'vertical', gap: 12 });
const previewPane = new Stack({ direction: 'vertical', gap: 12 });

const tabs = new Tabs({
  width: 500,
  height: 360,
  tabs: [
    { id: 'settings', label: 'Settings', content: settingsPane },
    { id: 'preview', label: 'Preview', content: previewPane },
  ],
  activeTabId: 'settings', // default: first tab
  tabHeight: 36, // height of the tab bar, default 36
  selectedColor: '#00f0ff', // active tab underline / text color
  onChange: (tabId) => console.log('Active tab:', tabId),
});
scene.add(tabs.setPosition(20, 20));

// Switch tab programmatically:
tabs.setActiveTab('preview');
```

Opciones clave:

| Opción          | Tipo                   | Por defecto     | Descripción                              |
| --------------- | ---------------------- | --------------- | ---------------------------------------- |
| `tabs`          | `TabItem[]`            | —               | `{ id, label, content: Entity }`         |
| `activeTabId`   | `string`               | primera pestaña | Pestaña visible inicialmente             |
| `tabHeight`     | `number`               | `36`            | Altura en píxeles de la fila de la barra |
| `selectedColor` | `string`               | `'#00f0ff'`     | Color de acento de la pestaña activa     |
| `onChange`      | `(id: string) => void` | —               | Se dispara al cambiar de pestaña         |

Proyecta `role="tablist"` en la barra y `role="tab"` + `aria-selected` en cada botón. El área de contenido obtiene `role="tabpanel"`.

### `Slider`

```typescript
import { Slider } from '@vectojs/ui';

const slider = new Slider({ min: 0, max: 100, value: 50, width: 200 });
slider.on('change', (e) => console.log(e.value));
```

Pulgar arrastrable; valor redondeado al entero más cercano. Proyecta `role="slider"`.

### `Dropdown`

```typescript
import { Dropdown } from '@vectojs/ui';

const dd = new Dropdown(['Small', 'Medium', 'Large'], { value: 'Medium' });
dd.on('change', (e) => setSize(e.value));
scene.add(dd.setPosition(20, 160));
```

Abre un menú overlay flotante mediante `scene.showOverlay()`; se cierra al seleccionar o con Escape. Conexión ARIA completa de combobox/listbox.

## Texto y Tipografía

### `Text`

Texto multilínea con ajuste y una división de disposición fría/caliente:

```typescript
import { Text } from '@vectojs/ui';

const label = new Text('Hello, VectoJS!', {
  font: '600 18px "Outfit", sans-serif',
  color: '#e2e8f0',
  maxWidth: 400,
  lineHeight: 28,
});
```

- `setText(text)` — vuelve a medir (pasada fría).
- `append(text)` — ruta de streaming; solo vuelve a medir el último párrafo modificado.
- `setMaxWidth(w)` — solo reflow, sin volver a medir (pasada caliente).

### `RichText`

Texto en línea de múltiples estilos con runs de negrita/cursiva/color/tamaño, puntos activos de enlace y formas de exclusión:

```typescript
import { RichText } from '@vectojs/ui';

const rich = new RichText(
  [
    { text: 'Zero DOM, ' },
    { text: 'accessible', style: { bold: true, color: '#38bdf8' } },
    { text: ' and agent-native.' },
  ],
  { maxWidth: 500 },
);
```

Para streaming: usa `appendSpans(newSpans)` — O(párrafo modificado).

## Overlays y Viewports

### `Overlay`

Clase base para overlays de posicionamiento absoluto. Ancla contenido flotante relativo a las entidades objetivo con detección automática de colisiones con el viewport y volteo direccional:

```typescript
import { Overlay } from '@vectojs/ui';

const overlay = new Overlay({
  target: button,
  content: popoverCard,
  placement: 'bottom-start',
});
```

### `Tooltip`

Etiquetas disparadas por hover ancladas relativas a las entidades objetivo:

```typescript
import { Tooltip } from '@vectojs/ui';

const tooltip = new Tooltip({
  target: helpIcon,
  content: 'More information',
  delay: 200,
});
```

### `Popover`

Overlays disparados por clic que contienen contenido de disposición hijo arbitrario:

```typescript
import { Popover } from '@vectojs/ui';

const popover = new Popover({
  target: settingsButton,
  width: 200,
  height: 150,
});
```

### `ContextMenu`

Menús disparados por clic derecho que soportan atajos de teclado, iconos, separadores y submenús anidados:

```typescript
import { ContextMenu } from '@vectojs/ui';

const menu = new ContextMenu({
  items: [
    { label: 'Undo', shortcut: 'Ctrl+Z', onClick: () => undo() },
    { separator: true },
    { label: 'Settings', children: [{ label: 'Export', onClick: () => export() }] }
  ]
});
scene.add(menu);
```

### `VirtualList`

Un contenedor de lista de alto rendimiento que solo renderiza los elementos del viewport, soportando alturas de fila fijas y variables:

```typescript
import { VirtualList } from '@vectojs/ui';

const list = new VirtualList({
  width: 300,
  height: 500,
  itemHeight: (idx) => measuredHeights[idx], // or number for fixed heights
  itemRenderer: (idx) => createListItemEntity(idx),
});
```

### `TreeView`

Un navegador de nodos de árbol de estilo directorio. Soporta la carga perezosa de elementos hijos de forma asíncrona al expandir el nodo:

```typescript
import { TreeView } from '@vectojs/ui';

const tree = new TreeView({
  nodes: [
    {
      id: 'src',
      label: 'src',
      children: async () => [{ id: 'index.ts', label: 'index.ts' }],
    },
  ],
});
```

### `Modal`

```typescript
import { Modal } from '@vectojs/ui';

const modal = new Modal('Confirm Delete', {
  modalWidth: 420,
  modalHeight: 200,
});
scene.showOverlay(modal);

// From within: modal.close() animates and self-removes.
```

Escalado de entrada animado por resortes. Incluye un botón de Cerrar integrado.

### `ScrollView`

Un viewport recortado con scroll de física de resortes:

```typescript
import { ScrollView } from '@vectojs/ui';

const feed = new ScrollView({ width: 360, height: 600 });
for (const item of items) feed.add(new Card({ ... }));
scene.add(feed.setPosition(20, 20));
feed.scrollToBottom();  // e.g. for a chat log
```

Rueda, arrastre táctil y `scrollTo(y)` programático están todos soportados.

## Contenido enriquecido

### `Markdown`

Renderiza una cadena Markdown en un subárbol del VMT — encabezados, párrafos, bloques de código con resaltado de sintaxis, tablas, blockquotes, enlaces y formato en línea:

```typescript
import { Markdown } from '@vectojs/markdown';

const doc = new Markdown('## Hello\n\nThis is **bold** and `code`.', {
  maxWidth: 700,
});
scene.add(doc.setPosition(40, 40));
```

Para el streaming de LLM, usa `appendMarkdown(chunk)` — vuelve a analizar léxicamente la fuente completa, luego hace un diff de los tokens y reutiliza el prefijo renderizado sin cambios en lugar de reconstruir cada entidad.

```typescript
const md = new Markdown('', { maxWidth: 600 });
scene.add(md);
for await (const token of llmStream) {
  md.appendMarkdown(token);
}
```

### `ProgressBar`

Un indicador de progreso de solo lectura — renderiza un fondo de pista redondeado y una barra de acento rellena proporcional a `value`. Opcionalmente muestra una etiqueta de porcentaje centrada.

```typescript
import { ProgressBar } from '@vectojs/ui';

const progress = new ProgressBar({
  value: 0.45, // 0–1 fraction
  width: 300,
  height: 16,
  showText: true, // render '45%' centered
  accent: '#00f0ff', // fill color
});
scene.add(progress.setPosition(40, 40));

// Update during an async operation:
for await (const chunk of stream) {
  progress.setValue(bytesReceived / totalBytes);
}
```

Opciones clave:

| Opción     | Tipo      | Por defecto               | Descripción                  |
| ---------- | --------- | ------------------------- | ---------------------------- |
| `value`    | `number`  | —                         | Fracción de progreso `0`–`1` |
| `width`    | `number`  | `200`                     | Ancho total de la pista      |
| `height`   | `number`  | `16`                      | Altura de la pista           |
| `radius`   | `number`  | `8`                       | Radio de las esquinas        |
| `bg`       | `string`  | `'rgba(255,255,255,0.1)'` | Fondo de la pista            |
| `accent`   | `string`  | `'#00f0ff'`               | Color de la barra rellena    |
| `showText` | `boolean` | `false`                   | Mostrar la etiqueta `"45%"`  |

Llama a `progress.setValue(fraction)` para actualizar — el valor se acota a `[0, 1]` y solo desencadena un redibujado cuando el valor realmente cambia. Proyecta `role="progressbar"` con `aria-valuenow` establecido en el porcentaje redondeado.

<figure>
  <img src="/images/component-gallery.svg" alt="Galería de componentes de VectoJS que muestra Button, Text, Input, Card, ScrollView, Slider, Toggle, Checkbox y Dropdown" class="diagram" />
  <figcaption>Todos los componentes se renderizan enteramente en canvas. Los nodos del shadow DOM (invisibles) proporcionan soporte nativo de accesibilidad y automatización.</figcaption>
</figure>

Consulta la [Referencia de Componentes de UI](/reference/ui-components/) para las firmas de opciones completas.
