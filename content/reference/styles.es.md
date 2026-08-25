+++
title = "Estilos (@vectojs/styles)"
description = "Objetos de estilo con nombres de propiedades CSS sobre el Virtual Math Tree numérico: temas de tokens (var() + setTheme), fusión con css() y composición de fuentes — sin parser, sin cascada, sin selector."
weight = 55
+++

# `@vectojs/styles`

Una capa de estilo declarativa sobre el Virtual Math Tree numérico: escribe estilos
con **nombres de propiedades CSS y valores similares a CSS**, y `applyStyle` los mapea
sobre los campos de la entidad. El objetivo es la comodidad de migración — el código que se lee como CSS
sigue aterrizando en los mismos campos numéricos tipados que un desarrollador de VectoJS establecería a
mano, y el canvas sigue siendo la única fuente de verdad.

Esto **no** es un motor CSS: no hay parser, ni selector, ni cascada, ni
herencia, ni registro de estilos global. Un objeto de estilo es un objeto ordinario,
tipado, de claves opcionales; las referencias a tokens (`var(--key)`) se resuelven contra un
tema plano, y cambiar el tema vuelve a aplicar cada estilo rastreado.

```ts
import { style, css, applyStyle, tokens, setTheme, PRESET_THEMES } from '@vectojs/styles';

setTheme(tokens(PRESET_THEMES.dark));

const primary = css(
  style({
    backgroundColor: 'var(--accent)',
    color: '#fff',
    borderRadius: 'var(--radius-md)',
  }),
  {
    padding: 12,
    fontFamily: 'Inter',
  },
);
const muted = css(primary, { backgroundColor: 'var(--muted)' });

applyStyle(button, muted);
applyStyle(stack, style({ flexDirection: 'row', gap: '8px', alignItems: 'center' }));
```

## Exportaciones

- `style()` — factoría de identidad que tipa un literal de objeto como `Style`.
- `css(...styles)` — factoría de fusión (0.2.0): las fuentes posteriores ganan; las fuentes
  `null`, `undefined` y `false` se omiten, por lo que las variantes pueden ser condicionales.
  Las entradas no se mutan — los objetos `padding` por eje también se copian, de modo que el
  contrato de «objeto plano fresco» se sostiene también para los valores anidados.
- `applyStyle(entity, style)` — escribe los campos mapeados y devuelve
  `{ applied: string[] }` (las claves CSS realmente escritas, en orden de objeto).
- `tokens(set)` — crea un `Theme` a partir de un conjunto de tokens plano.
- `setTheme(theme)` / `getTheme()` — cambia/lee el tema activo; los estilos
  que referencian `var()` se vuelven a resolver y reaplicar al cambiar.
- `untrackVarStyles(entity)` — descarta de inmediato el rastreo `var()` de la entidad
  (0.3.x); llámalo desde la limpieza de destroy para una liberación determinista en lugar de
  esperar el barrido por referencia débil del próximo cambio de tema.
- `PRESET_THEMES` — conjuntos de tokens `light` (el tema predeterminado), `dark`, `github` y
  `dracula`.
- `Style` — la interfaz de estilo. Todas las claves son opcionales.
- `composeFont(current, changes)` — recompone una cadena abreviada de fuente CSS
  (consulta [Composición de fuentes](#composición-de-fuentes)).
- `ThemeTokenSet` — `Record<string, string | number>`; el tipo de un
  conjunto de `tokens()` y de `Theme.tokens`.
- `Theme` — `{ readonly tokens: ThemeTokenSet }`, creado por `tokens()`.

El paquete depende solo de `@vectojs/core`.

## Mapeo de claves

| Clave CSS                                | Campo de entidad                    | Valor                                                                       |
| ---------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| `x`, `y`, `width`, `height`              | igual                               | número simple o cadena `px`                                                 |
| `opacity`, `scaleX`, `scaleY`            | igual                               | número                                                                      |
| `rotation`                               | igual                               | número, **radianes** (convención de VectoJS, no grados CSS)                 |
| `backgroundColor`                        | `bg`                                | cadena de color, se pasa tal cual                                           |
| `color`, `borderColor`                   | igual                               | cadena de color, se pasa tal cual                                           |
| `borderRadius`                           | `radius`                            | número simple o cadena `px`                                                 |
| `padding`                                | `padding` (o `paddingX`/`paddingY`) | valor único, o `{ x, y }` por eje (0.2.0)                                   |
| `font`                                   | `font`                              | cadena abreviada de fuente CSS, p. ej. `"16px Inter"`                       |
| `fontFamily` / `fontSize` / `fontWeight` | compuestas en `font`                | 0.2.0: los segmentos se reemplazan, el resto se conserva                    |
| `lineHeight`                             | `lineHeight`                        | número simple o cadena `px`                                                 |
| `textAlign`                              | `textAlign`                         | solo `"left"` \| `"justify"`                                                |
| `display`                                | — (solo validación)                 | `"flex"`; afirma que la entidad es un contenedor                            |
| `flexDirection`                          | `direction`                         | `"row"` → `"horizontal"`, `"column"` → `"vertical"`                         |
| `gap`                                    | `gap`                               | número simple o cadena `px`                                                 |
| `alignItems`                             | `align`                             | `"flex-start"` → `"start"`, `"center"` → `"center"`, `"flex-end"` → `"end"` |
| `flexWrap`                               | `wrap`                              | `"wrap"` → `true`, `"nowrap"` → `false`                                     |

## Tokens y temas

Un tema es un conjunto de tokens plano; las claves se escriben sin el prefijo `--` y se
referencian como `var(--<key>)`, reflejando las propiedades personalizadas de CSS:

```ts
const theme = tokens({ accent: '#2563eb', 'radius-md': 8, gap: 10 });
setTheme(theme);
applyStyle(btn, style({ backgroundColor: 'var(--accent)', borderRadius: 'var(--radius-md)' }));
```

- `var(--key)` se resuelve contra los tokens del tema activo antes de que se ejecute el
  conversor de valores, por lo que un token puede contener un color, una cadena `px` o un número
  simple. Las referencias de cadena completa (`backgroundColor: "var(--accent)"`) se resuelven
  exactamente; las referencias **incrustadas** en una cadena mayor
  (`color: "rgba(var(--rgb), 0.4)"`) se resuelven por sustitución, las cadenas de token-referencia-token
  se resuelven transitivamente con detección de ciclos basada en rutas, y la clave que referencia se
  rastrea para que los cambios de tema re-resuelvan los compuestos. Un token desconocido lanza una
  excepción con su nombre; un ciclo también, con la cadena infractora.
- `var(--token, fallback)` **no tiene resolución de respaldo** y nunca pasa en silencio: la forma se
  detecta dondequiera que pueda llegar (un valor directo, incrustado en una cadena compuesta, dentro de
  un eje de padding o a través de una cadena de tokens) y lanza un `TypeError` que nombra el valor
  infractor. El detector tolera espacios después de `var(`, así que `var( --accent, #fff)` también se
  captura. El silencio aquí era el defecto: una cadena no resuelta llegaba a los campos mapeados mientras
  Canvas2D conservaba silenciosamente la pintura anterior.
- Los estilos que referencian tokens se **rastrean** por tema (las entidades destruidas ya no se
  retienen — el rastreo las mantiene débilmente, con `untrackVarStyles(entity)` para una liberación
  inmediata en la limpieza de destroy) y se vuelven a aplicar cuando `setTheme(next)` cambia, por lo que
  un cambio de tema recolorea toda la escena sin cambios del lado de la persona que llama. Los estilos sin
  `var()` no se rastrean. Si un valor de token falla la validación de la propiedad mapeada al cambiar
  (p. ej. `--radius-md: "50%"`), `setTheme` lanza una excepción.
- El tema predeterminado es el preset `light`; los conjuntos de `tokens()` son objetos simples,
  por lo que el tema de la persona que llama es una extensión: `tokens({ ...PRESET_THEMES.dark, accent: "#f00" })`.

## Composición de fuentes

`fontFamily`, `fontSize` y `fontWeight` no son campos independientes — los componentes de
ui llevan la fuente completa como una sola cadena abreviada. Estas claves analizan la
`font` actual de la entidad, reemplazan solo los segmentos presentes y escriben la
cadena recomuesta:

```ts
applyStyle(text, style({ font: '700 16px Inter' })); // entity font
applyStyle(text, style({ fontSize: '20px' })); // -> "700 20px Inter"
applyStyle(text, style({ fontFamily: 'ui-monospace' })); // -> "700 20px ui-monospace"
```

Una entidad con una fuente vacía comienza desde `16px`; una familia ausente cae en
`sans-serif`. En entidades sin campo `font`, estas claves se omiten.

El helper de cadenas subyacente se exporta para uso directo:

```ts
composeFont(
  current: string,                                       // e.g. "700 16px Inter"
  changes: { fontFamily?: string; fontSize?: string; fontWeight?: string },
): string                                               // -> "700 20px ui-monospace"
```

`composeFont` analiza una abreviación de fuente CSS, reemplaza solo los segmentos presentes
en `changes` y recompone; un tamaño/familia ausente se completa con `16px` /
`sans-serif` para que el resultado sea siempre una cadena de fuente de canvas válida.

El analizador entiende la gramática completa de prefijos de canvas
(`[style || variant || weight]? size[/line-height]? family`), así que
`italic 700 16px Georgia` y `16px/24px Inter` se componen correctamente y un cambio posterior de
segmento no puede recomponer una cadena inválida — los segmentos con apariencia de tamaño que no
puedan colocarse fallan ruidosamente en lugar de pasar en silencio. Después de que el hueco de weight toma
el primer `normal` (la elección de compatibilidad documentada), los `normal` siguientes llenan style y luego
variant, de modo que la forma válida de CSS `normal normal 16px Inter` se analiza en lugar de lanzar.
`fontSize` impone su forma `${number}px` en tiempo de ejecución: las unidades que no son px que llegan a través
de tokens o de llamantes JS lanzan en lugar de componer en silencio una abreviación que Canvas2D descartaría.

## Semántica

- **Reutilización entre componentes.** Una clave cuyo campo no existe en la entidad se
  omite silenciosamente, por lo que un objeto de estilo puede compartirse entre un `Button`, un
  `Text` y un `Stack` — cada uno toma lo que tiene. `applied` informa exactamente
  lo que se escribió.
- **Fallos ruidosos para errores de categoría.** Las claves de diseño (`display`,
  `flexDirection`, `gap`, `alignItems`, `flexWrap`) en una entidad que no es un
  contenedor lanzan un `TypeError` — estilizar un `Text` como contenedor flex es un
  error, no una no-operación. Una clave CSS desconocida también lanza.
- **Fallos ruidosos para valores no válidos.** `"50%"`, `"8em"` o
  `textAlign: "center"` lanzan con el nombre de la propiedad. El texto de VectoJS implementa
  solo `left` y `justify` (`Text`, `RichText`, `TextEntity` y el motor de
  diseño comparten todos `"left" | "justify"`), por lo que `center`/`right` no pueden
  respetarse y no deben fallar en silencio. Los valores son números simples (px) o cadenas
  `px`; se rechazan `%`, `em` y `rem`.
- **Señalización de suciedad.** Cuando se escribió al menos una clave, `applyStyle` llama
  a `entity.scene.markDirty()` una vez, por lo que las escenas `onDemand` se repintan.

## Qué queda deliberadamente fuera del alcance (v0.2.0)

- `transform` (las cadenas de transform CSS necesitan análisis), `justifyContent` (no
  hay campo de respaldo — los hijos de Stack se alinean mediante `align`), objetos `border` (aún no
  existe renderizado de borde en canvas — solo `borderColor`), longitudes `%`/`em`/`rem`,
  pseudo-estados (`:hover`), media queries, selectores y cascada —
  ninguno de estos existe como campo de entidad, y añadirlos reintroduciría la
  maquinaria que el VMT numérico existe para eliminar.

## FAQ

**¿Por qué `applyStyle` lanza una excepción en `textAlign: "center"`?** Porque `textAlign`
es `"left" | "justify"` en toda la pila — `Text`/`RichText` de ui, `TextEntity` del core
y el motor de diseño (`LayoutEngine.textAlign`). Ninguna entidad tiene
una forma de respetar `center`/`right`, por lo que la excepción evita que una hoja de estilos
en migración renderice silenciosamente texto alineado a la izquierda.

**¿Está `rotation` en grados?** No — radianes, igual que cualquier otra superficie de rotación de
VectoJS. Una migración de `rotate(30deg)` de CSS debe convertir a
`Math.PI / 6`.

**¿`padding: { x, y }` cambia el tamaño de un `Button`?** No. Los componentes de caja se dimensionan
a sí mismos en su constructor, por lo que el padding por eje establecido después lo leen los
consumidores que inspeccionan `paddingX`/`paddingY` en vivo (p. ej. un diseño de Card), no el
dimensionado intrínseco. Establece `padding` en las opciones del componente para el dimensionado
en la construcción.

**¿Cómo cambio de tema tras aplicar estilos?** Aplica estilos que referencian
tokens `var(--key)`, y luego llama a `setTheme(tokens({ ... }))` — cada estilo
rastreado se vuelve a resolver contra los nuevos tokens y se repinta. Los estilos con valores
literales no se tocan.
