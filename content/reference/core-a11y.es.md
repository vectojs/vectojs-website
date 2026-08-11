+++
title = "a11yRoot y el contrato del agente"
description = "Cómo cada Entity interactiva proyecta un nodo sombra ARIA transparente en el DOM — la forma A11yAttributes, el contrato de rendimiento de canvas y accesibilidad de grado DOM, y los problemas de sincronización que causan nodos sombra obsoletos o faltantes."
weight = 10

[extra]
order = 10
+++

# a11yRoot y el contrato del agente

Parte de [`@vectojs/core`](/reference/core-api/).

Toda entidad interactiva que tiene una caja proyecta un **nodo sombra ARIA
transparente** en el `a11yRoot` div de la Scene (encima del canvas,
`pointerEvents:auto` para que la automatización/AT pueda interactuar;
`opacity:0` a menos que `debugA11y` esté activo). Cada nodo lleva
`id` + `data-vecto-id`, más el rol/etiqueta/estado de
[`Entity.getA11yAttributes()`](/reference/core-entity/#hooks-de-a11y--agrupación-sobrescribir-para-optar).

La raíz de proyección sigue la caja CSS del canvas: el desplazamiento del canvas y el escalado CSS no uniforme
se aplican a las capas sombra y DOM-portal mientras la geometría de la entidad
permanece en coordenadas lógicas de la Scene. La rotación/inclinación CSS arbitraria del canvas
no forma parte de este mapeo.

`A11yAttributes`:

```ts
{
  // Element + identity
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea';   // default 'div'
  role?: string;
  label?: string;                      // aria-label
  labelledby?: string;                 // aria-labelledby
  describedby?: string;                // aria-describedby

  // Focus & pointer
  tabIndex?: number;
  pointerEvents?: 'auto' | 'none';     // default 'auto'

  // Native element attributes (only for the matching `tag`)
  href?: string; target?: string;      // tag: 'a'
  src?: string; alt?: string;          // tag: 'img'
  inputType?: string; placeholder?: string; value?: string;
  textInputStyle?: TextInputStyle;     // native editor typography

  // State
  checked?: boolean; disabled?: boolean; selected?: boolean;
  expanded?: boolean; required?: boolean; invalid?: boolean;
  valuemin?: string; valuemax?: string;
  level?: number;                      // aria-level (headings, tree items)

  // Relationships & popups
  controls?: string; haspopup?: string; activedescendant?: string;
  ariaModal?: 'true' | 'false';        // aria-modal on a role="dialog"

  // Live regions
  live?: 'off' | 'polite' | 'assertive';
  atomic?: boolean;                    // aria-atomic
  relevant?: string;                   // aria-relevant
}
```

Cada campo se proyecta a un atributo real cada fotograma con verificación de estado sucio. Devolver `undefined` para un campo **elimina** el atributo, por lo que el estado que deja de aplicarse desaparece en lugar de quedar obsoleto — nota que `false` es distinto de `undefined` aquí (`aria-invalid="false"` significa "explícitamente válido" y se preserva).

La sincronización aplica estos atributos a un elemento real (un verdadero `<button>`, `<a href>`, `<img>`,
`<input>`/`<textarea>` con eventos `change`/`focus`/`blur` compatibles con IME, etc.). Esta es la historia de "**rendimiento de canvas Y accesibilidad
de grado DOM**": los visuales son 100% GPU/canvas, pero un agente Playwright
`getByRole('button', { name })` resuelve el nodo sombra y hace clic en él.

## Orden de enfoque

Los roles interactivos no enfocables nativamente
(`button`, `switch`, `checkbox`, `link`, `slider`, …) reciben `tabindex="0"` y
Enter/Espacio → `click`.

**Los widgets compuestos son diferentes.** Un `tree`, `grid`, `menu`, `radiogroup` o
`tablist` es una parada de tabulación, no una por hijo — por lo tanto sus hijos usan un **tabindex flotante**: exactamente un hijo lleva `tabIndex: 0` y el resto `-1`, y las teclas de flecha mueven esa parada. Ver [Widgets compuestos](#widgets-compuestos-tabindex-flotante).

El orden de tabulación sigue el orden de lectura **visual**, no el orden de inserción del grafo de escena — ver [`Scene.readingDirection`](/reference/core-scene/#accesibilidad-y-apariencia) para RTL.

Establece `tabIndex: 0` explícitamente cuando una región que no es un control, como un lienzo de diseño,
debe entrar en el orden de enfoque secuencial y recibir eventos `keydown` del VMT. Usa `-1`
solo para enfoque programático; devolver `undefined` elimina el valor explícito.

## Widgets compuestos (tabindex flotante)

Un árbol, cuadrícula, menú, grupo de radio o lista de pestañas debe exponer **un rol por hijo**,
no solo un rol de contenedor — de lo contrario AT ve una caja opaca. VectoJS hace esto
reuniendo una entidad hijo transparente y enfocable ("punto caliente") sobre cada hijo visible:
lleva el `role` del hijo + estado + `tabindex` flotante, no renderiza nada, y el padre posee
el manejador de teclado.

Crucialmente, estos puntos calientes establecen `pointerEvents: 'none'`. El componente
debajo ya posee el ratón (clic para alternar, arrastrar para desplazar, texto de celda
seleccionable), por lo que el punto caliente no debe interceptarlo — el enfoque de teclado
y el `click` sintetizado por AT aún funcionan a través de un elemento con `pointer-events:none`.

| Componente    | Rol hijo                                                      | Teclado                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TreeView`    | `treeitem` (+ `aria-level`, `aria-expanded`, `aria-selected`) | Arriba/Abajo mueven · Derecha expande luego entra · Izquierda colapsa luego va al padre · Home/End · Enter/Espacio activan                                               |
| `Table`       | `row` › `gridcell` / `columnheader`                           | Flechas mueven en 2D (encabezado es row −1) · Home/End extremos de fila · Ctrl+Home/Ctrl+End esquinas de cuadrícula                                                      |
| `ContextMenu` | `menuitem` (+ `aria-haspopup`, `aria-expanded`)               | Arriba/Abajo envuelven y saltan separadores + deshabilitados · Home/End · Derecha abre submenú · Izquierda retorna al menú padre · Enter/Espacio activan · Escape cierra |
| `RadioGroup`  | `radio` (+ `aria-checked`)                                    | Flechas mueven y seleccionan · Home/End · Espacio selecciona                                                                                                             |
| `Tabs`        | `tab` (+ `aria-selected`)                                     | Flechas mueven · Home/End · Espacio/Enter activan                                                                                                                        |

Solo los hijos visibles se reúnen, por lo que un `TreeView` o `Table` virtualizado
proyecta O(viewport) puntos calientes en lugar de uno por fila en el conjunto de datos.
La fila/celda enfocada se desplaza a la vista antes de que el enfoque se mueva a ella.

## Colores forzados (Alto contraste)

Un canvas es píxeles opacos, por lo que el remapeo `forced-colors` del navegador nunca
toca lo que VectoJS dibuja — bajo Alto contraste de Windows un control con tema permanece
ilegible a menos que el componente se repinte. Lee
[`Scene.forcedColors`](/reference/core-scene/#accesibilidad-y-apariencia) y dibuja
con colores del sistema CSS (`ButtonFace`, `ButtonText`, `Highlight`, `Canvas`,
`CanvasText`); la escena se repinta automáticamente cuando la configuración cambia.
`Button` ya hace esto.

## Coste de la proyección con muchas entidades (`1.30.0+`)

Cada entidad interactiva que tiene una caja obtiene un nodo sombra mientras siga siendo interactiva. Eso es correcto para un botón e incorrecto para miles de entidades efímeras e individualmente insignificantes — partículas, comentarios danmaku, nodos de un grafo — donde produce un nodo DOM por entidad, en cada frame.

Medido con 5.000 entidades interactivas en movimiento:

|                              | Chrome        | Firefox        |
| ---------------------------- | ------------- | -------------- |
| toda entidad interactiva     | 66.4 ms/frame | 114.7 ms/frame |
| `a11yProjection: 'onDemand'` | 2.23 ms       | 1.69 ms        |
| ningún nodo sombra           | 1.35 ms       | 1.75 ms        |

Ambas filas eager no alcanzan ni un presupuesto de 60 Hz. `'onDemand'` se sitúa en el suelo de no proyectar nada, mientras cada entidad sigue siendo alcanzable individualmente.

`Entity.a11yProjection` selecciona cuándo se materializa el nodo:

```ts
particle.a11yProjection = 'onDemand';
```

- **`'eager'`** (predeterminado): existe un nodo mientras la entidad sea interactiva y tenga caja. Comportamiento sin cambios; déjalo así para controles ordinarios.
- **`'onDemand'`**: existe un nodo solo mientras la entidad está _en uso_. Úsalo para entidades interactivas de alta cardinalidad.
- **`'never'`**: ningún nodo. Prefiere `interactive = false` a menos que la entidad realmente necesite eventos de puntero sin presencia semántica.

### Qué cuenta como en uso

Tres señales, cualquiera de ellas basta. Deliberadamente **no** el hover en solitario: una persona que usa teclado o lector de pantalla no genera eventos de puntero, así que un nodo condicionado al hover se les negaría precisamente a los usuarios para los que existe.

- **El foco.** Un nodo enfocado nunca se poda, así que el foco no puede arrancarse a alguien en mitad de una interacción.
- **Que el puntero esté dentro de la entidad.**
- **Una petición explícita**: véase más abajo.

La entidad sigue siendo comprobable por impacto en el canvas todo el tiempo, así que un clic siempre la alcanza y la promueve.

```ts
// Keep the selected item projected for as long as it is selected.
scene.requestA11yProjection(selected);
scene.releaseA11yProjection(previous);
```

Ambas aceptan una `Entity` o una cadena de id y son idempotentes. Liberar no elimina el nodo de inmediato: sobrevive mientras tenga el foco o esté bajo el puntero, y se poda en la siguiente sincronización que lo encuentre sin uso. Ambas no hacen nada para una entidad `'eager'`, que siempre se proyecta.

Usa una petición explícita para cualquier cosa cuya importancia solo conoce la aplicación: una selección, un resultado de búsqueda, un elemento recién anunciado en una región activa.

> [!IMPORTANT]
> Una entidad que proyecta su propio **texto seleccionable** nunca es promovida por el puntero. Su nodo sombra lleva `pointer-events: auto` y se apila sobre el espejo de texto transparente, así que materializar uno bajo el puntero se traga el `mousedown` y la selección nativa por arrastre nunca comienza. El foco y las peticiones explícitas siguen alcanzándola. Es el mismo conflicto que hace que [`Text`](/reference/ui-text/) y `RichText` no sean interactivos por defecto.

La cardinalidad no es por sí sola el criterio para recurrir a `'onDemand'`, y este es el caso que más fácilmente se juzga mal:

> [!WARNING]
> **No apliques `'onDemand'` al cuerpo de texto por analogía con las partículas.** Para un botón o un nodo de grafo, la entidad del canvas es el sujeto y el nodo sombra es un proxy semántico temporal, así que retenerlo hasta que esté en uso no pierde nada. Para prosa, Markdown o una transcripción de chat, el bitmap del canvas no es legible en absoluto por un lector de pantalla, y _leer es la interacción principal_ para una persona no vidente en lugar de un acto ocasional. Las entidades de texto no son interactivas por defecto y es su [proyección de contenido](/reference/core-renderer/#entitygetcontentprojection) — no un nodo sombra — la que porta su semántica; esa proyección se virtualiza por línea y permanece residente.

Ser alcanzable individualmente tampoco es lo mismo que ser comprendido:

> [!NOTE]
> `'onDemand'` no es por sí solo una historia de accesibilidad completa. Mil danmaku alcanzables individualmente siguen sin decir nada en conjunto. Combínalo con una única región activa agregada (`role: 'status'`, `a11yFullViewport`) más un pequeño grupo de puntos calientes persistentes para la selección actual, de modo que el número de nodos DOM se mantenga constante en lugar de escalar con el número de entidades.

## Controles y problemas

- `data-vecto-id` en cada nodo sombra refleja el `id` de la entidad — el identificador estable
  para selectores de automatización.
- `a11ySyncInterval` (ver [`SceneOptions`](/reference/core-scene/#sceneoptions))
  limita la sincronización durante la animación y asegura una actualización final después de que el
  movimiento pendiente se estabilice; no suspende toda la sincronización durante toda la animación.
- `debugA11y: true` muestra los nodos (azul punteado) para desarrollo.
- `detachA11y(entity)` poda los nodos sombra de un subárbol sin eliminar la
  entidad; `remove()` poda automáticamente. La sincronización por fotograma **crea/actualiza pero nunca
  poda**, así que gestiona explícitamente la rotación de hijos interactivos.
- `getA11yTree()` devuelve una instantánea `A11yTreeNode[]` anidada para aserciones;
  `getA11yElement(id)` obtiene un elemento sombra específico.
- `a11yFullViewport` monta una superficie de interacción sin límites detrás de todas las demás.
- Desde Core 1.11.1, cada entidad interactiva recién proyectada recibe el `z-index` correspondiente al orden de pintura del canvas en el mismo fotograma que crea su nodo sombra. Por tanto, el backdrop de una superposición nueva queda por encima de los controles de diseño existentes desde la primera interacción del puntero, sin esperar otro renderizado.

Ver [Accesibilidad](/learn/accessibility/) para patrones de uso y pruebas.

## Relacionados

[`Scene`](/reference/core-scene/) (`a11ySyncInterval`, `debugA11y`) ·
[`Entity`](/reference/core-entity/) (`getA11yAttributes()`, `interactive`, `width`/`height`) ·
[Visión general de `@vectojs/core`](/reference/core-api/)
