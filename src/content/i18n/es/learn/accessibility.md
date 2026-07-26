---
title: 'Accesibilidad y Automatización'
description: 'Cómo VectoJS proyecta controles DOM semánticos sobre el contenido del canvas para lectores de pantalla, usuarios de teclado y automatización con Playwright.'
order: 15
---

# Accesibilidad y Automatización

Los píxeles de canvas y WebGL no llevan información semántica por sí mismos. Para las entidades interactivas elegibles, VectoJS mantiene un elemento DOM real e invisible en su overlay `a11yRoot`. Los lectores de pantalla, la navegación por teclado y las herramientas de automatización pueden interactuar con esos elementos mientras las capas respaldadas por canvas proporcionan los visuales. Esto es una capa de proyección, no la API de Shadow DOM del navegador, y las aplicaciones siguen siendo responsables de la semántica y las pruebas correctas.

## Cómo funciona la proyección del shadow DOM

Cuando una entidad tiene `interactive = true` (y una caja no nula), el `Scene` crea un elemento HTML real — `<button>`, `<input>`, `<a>`, etc. — y lo posiciona por encima del canvas usando CSS absoluto. El elemento tiene `opacity: 0` y `pointer-events: auto`, por lo que es invisible al ojo pero totalmente funcional para las herramientas de accesibilidad.

<figure>
  <img src="/images/shadow-dom-layers.svg" alt="Diagrama que muestra tres capas apiladas: el canvas en z-index 0 con componentes renderizados por GPU, la capa del portal DOM en z-index 9 y la capa shadow de A11y en z-index 10 que contiene elementos DOM reales transparentes como button e input. Una flecha de cursor de puntero golpea primero la capa superior." class="diagram" />
  <figcaption>Tres capas en el padre del canvas. Solo la capa de a11y tiene <code>pointer-events: auto</code>, por lo que los clics llegan a los elementos shadow reales antes que al canvas.</figcaption>
</figure>

La capa de a11y se sitúa en el `<div>` padre del canvas, que `Scene` fuerza a `position: relative` automáticamente.

En cada frame renderizado (limitado por `a11ySyncInterval`), el Scene:

1. Lee el `getA11yAttributes()` de cada entidad interactiva.
2. Crea o actualiza el nodo shadow correspondiente (comprobado por sucio para minimizar las escrituras en el DOM).
3. Aplica la matriz afín completa del mundo de la entidad y su `width × height` local; la raíz de proyección mapea las coordenadas lógicas del Scene sobre la caja CSS del canvas.

El offset del canvas y el escalado CSS no uniforme están soportados. No asumas la alineación bajo rotación/inclinación CSS arbitraria del canvas; verifica con `debugA11y` en la página real.

> [!NOTE]
> La sincronización **nunca poda** durante un frame. Si tu código añade y elimina entidades hijas interactivas con frecuencia, llama a `scene.detachA11y(entity)` antes de descartarlas, o sus nodos shadow tendrán fugas. `scene.remove(entity)` poda recursiva y seguramente.

## Habilitarlo: `entity.interactive`

```typescript
entity.interactive = true; // enable shadow node + pointer/keyboard events
entity.width = 120;
entity.height = 40; // shadow node is only created when width > 0
```

Establecer `interactive = true` tiene un efecto secundario: activa la bandera `a11yNeedsReorder` y llama a `scene.markDirty()`.

## Controlar el nodo shadow: `getA11yAttributes()`

Sobrescribe `getA11yAttributes()` para especificar el tipo de elemento, el rol ARIA y el estado semántico:

```typescript
import type { A11yAttributes } from '@vectojs/core';

class AccessibleBtn extends Entity {
  label = 'Submit';

  getA11yAttributes(): A11yAttributes {
    return {
      tag: 'button',
      role: 'button',
      label: this.label,
    };
  }
}
```

Interfaz completa:

```typescript
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // default: 'div'
  role?: string; // ARIA role (e.g. 'switch', 'slider', 'combobox')
  label?: string; // aria-label / accessible name
  tabIndex?: number; // explicit focus order for non-control keyboard regions
  href?: string; // for tag='a' — makes it a real link
  src?: string; // for tag='img'
  alt?: string; // for tag='img'
  inputType?: string; // for tag='input' — 'text', 'checkbox', etc.
  placeholder?: string; // input/textarea placeholder
  value?: string; // input/textarea current value
  checked?: boolean; // input[type=checkbox] or aria-checked (for role=switch)
  disabled?: boolean;
  expanded?: boolean; // aria-expanded (for comboboxes, disclosures)
  controls?: string; // aria-controls (points to another element's id)
  haspopup?: string; // aria-haspopup
  selected?: boolean; // aria-selected (for listbox options)
  activedescendant?: string; // aria-activedescendant (for composite widgets)
  valuemin?: string; // aria-valuemin (for sliders, meters)
  valuemax?: string; // aria-valuemax

  // Relaciones y denominación desde otros nodos
  labelledby?: string; // aria-labelledby
  describedby?: string; // aria-describedby — texto de pista / error

  // Estado de validación (la única manera de que un formulario canvas sea anunciable)
  required?: boolean; // aria-required
  invalid?: boolean; // aria-invalid — nota: false significa "explícitamente válido"

  // Estructura y diálogos
  level?: number; // aria-level (encabezados, elementos de árbol)
  ariaModal?: 'true' | 'false'; // aria-modal en un role="dialog"

  // Regiones activas — anunciar actualizaciones en streaming sin mover el foco
  live?: 'off' | 'polite' | 'assertive';
  atomic?: boolean; // aria-atomic — leer la región completa, no la diferencia
  relevant?: string; // aria-relevant — ej. 'additions text'

  // Superficie del puntero
  pointerEvents?: 'auto' | 'none'; // 'none' para nodos estructurales/solo superposición

  target?: string; // para tag='a'
  textInputStyle?: TextInputStyle; // tipografía del editor nativo
}
```

Devolver `undefined` para un campo **elimina** el atributo, por lo que el estado que deja de aplicar desaparece en lugar de quedar obsoleto.

Usa un `tabIndex: 0` explícito para un espacio de trabajo de canvas que no es un botón ni un control de formulario pero debe poseer atajos de teclado:

```typescript
getA11yAttributes(): A11yAttributes {
  return { role: 'region', label: 'Design canvas', tabIndex: 0 };
}
```

Mantén las entradas nativas, las áreas de texto y el contenido editable a cargo de sus atajos de edición. El Scene refresca un índice de tabulación explícito cuando cambian los atributos.

### Qué proyectan los componentes integrados

| Componente         | Elemento shadow                            | Atributos ARIA clave                                                     |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------------------ |
| `Button`           | `<button>`                                 | `role="button"`, `aria-label`                                            |
| `Link`             | `<a href>`                                 | enlace nativo, `aria-label`                                              |
| `Image`            | `<img>`                                    | `src`, `alt`                                                             |
| `Input`            | `<input type="text">`                      | `placeholder`, `value` (en vivo)                                         |
| `TextArea`         | `<textarea>`                               | `placeholder`, `value` (en vivo)                                         |
| `Checkbox`         | `<input type="checkbox">`                  | `checked` (en vivo), `aria-label`                                        |
| `Toggle`           | `<div role="switch">`                      | `aria-checked` (en vivo), `aria-label`                                   |
| `Slider`           | `<div role="slider">`                      | `aria-valuenow/min/max` (en vivo)                                        |
| `Dropdown`         | `<div role="combobox">`                    | `aria-expanded`, `aria-controls`, elementos de menú como `role="option"` |
| `Card` (con label) | `<div role="group">`                       | `aria-label`                                                             |
| `Table`            | `grid` › `row` › `gridcell`/`columnheader` | tabindex flotante, teclas de flecha 2D, Ctrl+Home/End                    |
| `TreeView`         | `treeitem` por fila visible                | `aria-level`/`expanded`/`selected`, flechas expandir/colapsar            |
| `ContextMenu`      | `menuitem` por elemento                    | `aria-haspopup`/`expanded`, flechas envuelven, Escape cierra             |
| `RadioGroup`       | `radio` por opción                         | `aria-checked`, flechas mueven+seleccionan                               |
| `Tabs`             | `tab` por pestaña                          | `aria-selected`, flechas mueven, Home/End                                |
| `Text`             | `<div>`                                    | `aria-label` = contenido de texto                                        |

## Widgets compuestos: una parada de tabulación, teclas de flecha dentro

Un árbol, cuadrícula, menú, grupo de radio o lista de pestañas no debe poner cada hijo en el orden de tabulación. VectoJS agrupa un hotspot transparente y enfocable sobre cada hijo **visible** que lleva el rol y estado de ese hijo, y le da exactamente a uno `tabIndex: 0` — un **tabindex flotante**. El padre posee el manejador de teclas de flecha y mueve la parada. Consulte la tabla anterior para las teclas de cada componente, y [Widgets compuestos](/reference/core-a11y/#composite-widgets-roving-tabindex) si está construyendo el suyo.

Reutilice ese patrón en lugar de inventar uno: lo importante es que el hotspot debe establecer `pointerEvents: 'none'` siempre que algo debajo posea el ratón (texto de celda seleccionable, arrastrar para desplazar, manejo de impactos del canvas). El foco del teclado y el `click` sintetizado por AT aún pasan a través de él.

El orden de tabulación sigue el orden de lectura **visual**, no el orden en que agregó las entidades. Para una interfaz RTL establezca `readingDirection: 'rtl'` en la Scene para que el orden en línea dentro de cada fila también se invierta.

## Colores forzados (Alto contraste de Windows)

Un `<canvas>` son píxeles opacos, por lo que el remapeo `forced-colors` del navegador nunca llega a lo que dibujas — un control con tema permanece de bajo contraste y ilegible a menos que se repinte a sí mismo. Lea `scene.forcedColors` y dibuje con colores CSS del sistema; la escena se repinta automáticamente cuando la configuración del sistema cambia:

```typescript
render(r: IRenderer) {
  const forced = this.scene?.forcedColors ?? false;
  r.beginPath();
  r.roundRect(0, 0, this.width, this.height, 8);
  r.fill(forced ? 'ButtonFace' : this.bg);
  if (forced) r.stroke('ButtonText', 1);       // give the shape an edge
  r.fillText(this.label, x, y, this.font, forced ? 'ButtonText' : this.color);
}
```

`Button` ya hace esto. Use `Highlight` para selección/foco, `Canvas`/`CanvasText` para superficies y texto del cuerpo.

## Campos de entrada compatibles con IME

`Input` y `TextArea` usan **elementos shadow `<input>`/`<textarea>` reales y transparentes** para la entrada de texto. Esto significa:

- La composición IME (chino, japonés, coreano, árabe) funciona de forma nativa — el navegador gestiona la ventana de candidatos.
- La selección de texto, el portapapeles (cortar/copiar/pegar), deshacer/rehacer son todos nativos.
- El canvas es un **espejo visual puro**: lee `value`, `selectionStart`, `selectionEnd` y `composition` del evento `change` y dibuja el cursor, el resaltado de selección y el subrayado del IME.

Mientras una entrada está enfocada, la sincronización evita reescribir el mismo valor sincronizado por el usuario. Si el estado de la aplicación suministra un valor genuinamente diferente, se aplica; por tanto, los componentes controlados deben preservar la selección intencionalmente al reemplazar texto.

## Proyección de contenido estático

Los controles interactivos proyectan nodos de a11y. La proyección de contenido estático cubre el lado no interactivo: las entidades que renderizan texto estático lo exponen mediante `getContentProjection()`, y el Scene lo refleja como un **nodo DOM transparente y sincronizado en posición** sobre los glifos dibujados. Los lectores de pantalla, Ctrl+F, los rastreadores y las extensiones de traducción pueden entonces ver texto que se renderiza visualmente en el canvas.

```typescript
// Built-in: TextEntity and MSDFTextEntity expose content. Text, RichText,
// Markdown, fenced CodeBlock, and Table cell text are selectable by default.

// Custom entities opt in the same way:
class Caption extends Entity {
  label = 'Rendered on canvas, found by Ctrl+F';
  getContentProjection() {
    return { text: this.label, font: '16px sans-serif' };
  }
  // …render() draws the same string…
}
```

Qué desbloquea esto, con cero trabajo extra:

- **Búsqueda en la página** — Ctrl+F coincide; las cajas de resaltado del navegador se renderizan detrás de los glifos transparentes.
- **Los lectores de pantalla y los rastreadores** leen texto real en el orden de origen.
- **Las extensiones de traducción y el modo lector** operan sobre la capa proyectada.
- Los enlaces de fragmento **`#:~:text=`** se resuelven.
- **Selección nativa con el ratón** — se habilita por entidad personalizada con `selectable: true` (el resaltado `::selection` se pinta detrás de los glifos transparentes). La proyección del core está desactivada por defecto para que el texto arbitrario nunca intercepte la entrada del canvas. El contenido de Text/RichText/Markdown/Table de UI está seleccionable por defecto y expone `setSelectable(boolean)`.

Para una selección con precisión de píxel, trata la línea base del Canvas como la fuente de verdad: usa `baseline` (y `contentX`/`contentY`) para un solo run, o `lines` visuales explícitas para texto con ajuste de línea, con sangría o de tamaño mixto. Core 1.8 mapea estas coordenadas locales a través de las transformaciones y da a cada run proyectado la misma caja de línea CSS. Establece `separatorAfter` en una fila visual cuando su origen lógico termina con un salto de línea o un separador de ajuste suave preservado. El Scene fusiona ese separador en el nodo de texto final de la fila para que Firefox no pueda colocar parte de una selección multilínea en la raíz de proyección. `text` sigue siendo la fuente Unicode lógica autoritativa; nunca sustituyas el orden de glifos visuales conformados. No compenses con offsets CSS a nivel de página.

El texto ordinario seleccionable, las filas visuales explícitas y las proyecciones personalizadas sin líneas resuelven cursores de grafema legales en geometría bidimensional transformada. La rotación, las transformaciones de espejo, la escala no uniforme, el DPR fraccionario y el zoom del navegador no reducen el enrutamiento del puntero a la X del viewport. Las entidades de tipo código deberían además compartir un resultado de `prepareContentGrid()` entre el pintado del Canvas y `ContentProjection.grid`; esto mantiene los tabuladores, emoji/ZWJ, ancho CJK, árabe, bidi, la fuente del portapapeles y la geometría de selección en el mismo plan retenido.

Para las implementaciones nativas de `Input`/`TextArea`, expón `textInputStyle: { font, lineHeight, padding }` a través de `getA11yAttributes()`. El Scene lo aplica al editor transparente con `box-sizing: border-box`, mientras que el canvas debería dibujar desde el mismo padding y línea base de la caja de línea.

Notas:

- Las proyecciones son **perezosas por viewport y clip**: el texto totalmente fuera del Scene o de un ancestro con `clipChildren` está en `display: none` y no puede interceptar la entrada.
- Las proyecciones dinámicas se reordenan para coincidir con el orden de origen del VMT; eliminar un subárbol elimina cada proyección descendiente.
- Cuando la entidad también es `interactive`, su copia de texto es `aria-hidden` para que los lectores de pantalla no la anuncien dos veces.
- Deshabilita toda la capa con `new Scene(canvas, { contentProjection: false })` para escenas puramente decorativas.
- La búsqueda del navegador cubre el contenido materializado. No puede buscar una entidad virtualizada que la aplicación no ha montado.
- Los enrutadores de atajos globales deben ceder ante la copia nativa cuando `window.getSelection()?.isCollapsed === false` y no deben suprimir Ctrl/Command+F a menos que la aplicación reemplace intencionalmente la búsqueda del navegador.

## La opción `debugA11y`

Habilita `debugA11y: true` en `SceneOptions` para hacer visibles los nodos shadow durante el desarrollo — aparecen con un contorno discontinuo azul:

```typescript
const scene = new Scene(canvas, { debugA11y: true });
```

Abre las DevTools del navegador → Elements y verás los elementos reales `<button>`, `<input>` y `<a>` posicionados sobre tu canvas. Esta es la forma más rápida de verificar que los roles, las etiquetas y las posiciones son correctos.

## `a11yFullViewport` — superficies sin límites

Algunas entidades cubren todo el viewport del Scene (un canvas infinito, un reconocedor de gestos, una trampa de clic de fondo). Estas no tienen una caja delimitadora significativa. Establece `a11yFullViewport = true` para proyectar un nodo shadow del tamaño del Scene que sigue la caja CSS del canvas:

```typescript
class PanGesture extends Entity {
  constructor() {
    super();
    this.interactive = true;
    this.a11yFullViewport = true; // no width/height needed
  }

  getA11yAttributes() {
    return { role: 'application', label: 'Pan and zoom canvas' };
  }
}
```

El nodo de viewport completo se monta **detrás** de todos los demás nodos shadow, por lo que cualquier componente superior (botones, entradas) permanece clicable.

## `a11ySyncInterval` — limitación durante la animación

Por defecto, el shadow DOM se sincroniza en cada frame renderizado. Para UIs con mucha animación y muchas entidades interactivas, la sincronización puede dominar el tiempo de frame. Limítala:

```typescript
const scene = new Scene(canvas, { a11ySyncInterval: 100 });
// Shadow DOM is updated at most once per 100ms during animation
```

El intervalo permanece activo mientras la animación se ejecuta, y el Scene programa una puesta al día final tras el asentamiento del movimiento pendiente. No congela la capa semántica durante toda la animación.

## Inspeccionar el árbol shadow programáticamente

```typescript
// Get a nested snapshot of all projected shadow nodes
const tree = scene.getA11yTree();
// Returns: A11yTreeNode[] — { id, tag, role, label, value, children, ... }

// Get the actual HTMLElement for a specific entity
const el = scene.getA11yElement(entity.id);
el?.focus(); // programmatically focus a shadow node
```

## Integración con Playwright

Como cada entidad interactiva proyecta un elemento DOM real, los selectores estándar de Playwright funcionan sin ningún adaptador especial:

```typescript
import { test, expect } from '@playwright/test';

test('toggle switches physics engine', async ({ page }) => {
  await page.goto('/demos/nexus');

  // Works because Toggle projects a <div role="switch" aria-label="Physics">
  const toggle = page.getByRole('switch', { name: 'Physics' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
});

test('search input filters results', async ({ page }) => {
  await page.goto('/');

  // Input projects a real <input type="text" placeholder="Search…">
  await page.getByPlaceholder('Search…').fill('spring');
  await expect(page.getByRole('option')).toHaveCount(3);
});

test('button is keyboard accessible', async ({ page }) => {
  await page.goto('/demos/chat');

  // Tab to the button, press Enter
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
});
```

### Seleccionar por `data-vecto-id`

Cada nodo shadow lleva un atributo `data-vecto-id` igual a `entity.id`. Para selectores estables que sobreviven a los cambios del texto de la etiqueta:

```typescript
const entity = new Button('Submit');
entity.id = 'submit-btn'; // or set in constructor via super with id

// In Playwright:
await page.locator('[data-vecto-id="submit-btn"]').click();
```

## Lista de comprobación de pruebas con lector de pantalla

- [ ] Cada entidad interactiva tiene `interactive = true` y una caja no nula.
- [ ] `getA11yAttributes()` devuelve un `tag` y un `label` significativos.
- [ ] `Input`/`TextArea` tienen un `placeholder` (usado como `aria-label`).
- [ ] El estado `checked` de `Checkbox`/`Toggle` se refleja en vivo en `getA11yAttributes()`.
- [ ] `Slider` tiene `valuemin`, `valuemax` y `value` establecidos en cada renderizado.
- [ ] Los grupos `Card` tienen un `label` cuando representan una región lógica.
- [ ] El orden de tabulación es razonable (los nodos shadow se posicionan en orden del DOM, que coincide con el orden de adición).
- [ ] Ejecuta `scene.getA11yTree()` e inspecciona la salida para detectar etiquetas faltantes.
- [ ] Habilita `debugA11y: true` y verifica visualmente que las posiciones de los nodos coinciden con los componentes del canvas.

## Resolución de problemas

### La posición del nodo shadow está desplazada respecto al componente del canvas

Dos causas comunes:

1. **El padre del canvas no es `position: relative`** — `Scene` lo establece automáticamente en cada frame, pero una regla CSS con mayor especificidad que fuerce `position: static` lo anulará. Comprueba el estilo calculado en el elemento padre del canvas.
2. **`transform` CSS en el padre del canvas** — el posicionamiento absoluto de los nodos shadow es relativo al ancestro posicionado más cercano, pero `transform` crea un nuevo contexto de apilamiento que puede causar offsets. Mueve el `transform` al propio elemento canvas, no al padre.

Si anteriormente usabas `a11yOffsetX` / `a11yOffsetY` como solución alternativa, elimínalos y arregla en su lugar el problema de posicionamiento subyacente.

### `getByRole()` de Playwright no encuentra nada

Comprueba lo siguiente:

1. `entity.interactive` debe ser `true` y `entity.width > 0`.
2. `getA11yAttributes()` debe devolver el `tag` y el `role` correctos. Para que `page.getByRole('button')` funcione, el tag debe ser `'button'` o el rol debe ser `'button'`.
3. La etiqueta debe coincidir: `page.getByRole('button', { name: 'Submit' })` requiere `label: 'Submit'` en los atributos.
4. La escena debe haber llamado a `start()` — la sincronización de a11y ocurre durante el bucle de renderizado.

Usa `scene.getA11yTree()` para imprimir una instantánea de lo que se proyecta actualmente:

```typescript
console.log(JSON.stringify(scene.getA11yTree(), null, 2));
```

### `scene.getA11yTree()` devuelve un array vacío

El árbol de a11y solo se rellena después de que `scene.start()` haya ejecutado al menos un frame. Si llamas a `getA11yTree()` de forma síncrona tras la construcción, estará vacío. Envuélvelo en un `setTimeout` o comprueba después de una interacción del usuario.

Verifica también que `entity.interactive = true` está establecido — las entidades sin `interactive` nunca se proyectan.

> **Siguiente:** [Componentes de UI](/learn/ui-components/) — la suite completa de componentes interactivos listos para usar.
