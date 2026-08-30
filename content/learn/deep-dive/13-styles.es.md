---
title: '13 — Estilos y Theming — Paridad CSS sobre el VMT Numérico'
description: 'Por qué los estilos de VectoJS viven en el Virtual Math Tree, cómo los objetos con nombres de propiedades CSS mapean a campos numéricos de entidades, y cada mecanismo que los hace sentir como CSS sin ser CSS — tokens y resolución var(), fusión con css(), composición de fuentes, padding por eje, cambio de tema atómico y las trampas de migración que mantienen honesto al árbol numérico.'
order: 33
---

# 13 — Estilos y Theming — Paridad CSS sobre el VMT Numérico

> VectoJS no tiene hoja de estilos, ni cascada, ni navegador. El Virtual Math Tree almacena números — `x`, `width`, `bg`, `font` — no cadenas CSS. `@vectojs/styles` es el puente que te permite _escribir_ esos números como si fueran CSS y aun así hacer que aterricen como números: un objeto tipado, una tabla de lookup fija y un tema de tokens plano que se re-resuelve al cambiar.

- **Qué aprenderás**: por qué los estilos viven en el VMT numérico, cómo `Style` mapea a campos de entidad, cómo los tokens `var(--token)` se resuelven (anclados, embebidos, transitivos, con detección de ciclos), cómo `css()` fusiona y `style()` tipa, cómo `composeFont` mantiene válidos los shorthands de canvas, cómo `padding: {x,y}` por eje se expande, cómo `setTheme` intercambia atómicamente vía pares rastreados con `WeakRef`, y cada forma en que migrar hábitos CSS puede fallar ruidosamente en lugar de silenciosamente.
- **Qué no aprenderás**: cómo el texto se moldea o se dispone (boss 02), cómo la escena ensucia y renderiza (bosses 06/07), ni cómo Markdown tematiza sus bloques de código (`packages/markdown/src/markdown-presets.ts:281` `resolvePresetTheme` — un sistema de tokens separado). Este documento es la piel fina, tipada y con nombres CSS sobre el árbol numérico.

## 1. Por qué los estilos viven en el VMT — y por qué no en CSS

El VMT almacena la escena como números. `Entity.x: number` (`packages/core/src/tree/Entity.ts:1`), `UIComponent.paddingX: number` (`packages/ui/src/UIComponent.ts:28`), `Text.font: string` (`packages/ui/src/Text.ts:111`) que sigue siendo un _shorthand válido de fuente de canvas_ — no una regla de hoja de estilos. No hay elemento DOM del que heredar, ni cascada que resolver, ni selector que coincidir. El motor de estilos del navegador está ausente por diseño: VectoJS es dueño del pintado, del hit-test y de la proyección, así que también es dueño del dimensionado.

`@vectojs/styles` se apoya en esa restricción en lugar de combatirla:

- Un `Style` es un objeto plano (`packages/styles/src/types.ts:16`) con claves **opcionales** — `x?: CssLength` (`types.ts:18`), `backgroundColor?: string` (`types.ts:28`), `fontSize?:`${number}px`` (`types.ts:46`), `display?: 'flex'` (`types.ts:62`). Sin clase, sin proxy, sin registro.
- `applyStyle(entity, style)` (`packages/styles/src/apply.ts:294`) es una **tabla de lookup fija** `RULES: Record<string, Rule>` (`apply.ts:54`) que convierte cada clave con nombre CSS en una escritura numérica/string/booleana. Cada clave está enumerada; una clave desconocida lanza (`apply.ts:258`). Sin parsing, sin herencia, sin `%`.
- Los tokens son `Record<string, string|number>` planos (`packages/styles/src/theme.ts:38` `ThemeTokenSet`), referenciados como `var(--key)` en valores y resueltos por sustitución de cadenas contra el tema activo — no por un motor CSS.
- El paquete depende solo de `@vectojs/core` (`packages/styles/package.json:14`) y tiene cero deps en runtime; `@vectojs/ui` tiene cero dep de `@vectojs/styles` (el grafo de dependencias es `core → styles`, la ingesta es opt-in).

El beneficio es comodidad de migración — `backgroundColor: 'var(--accent)'` se lee como CSS y aun así aterriza en `entity.bg: string` (`apply.ts:63`) — mientras el VMT permanece como única fuente de verdad. El precio es que cualquier cosa que CSS hace y que no tiene campo numérico de respaldo _no existe_ y debe fallar ruidosamente (ver §10).

## 2. `Style` y la tabla Rule — cada clave es un contrato

`CssLength = number |`${number}px`` (`packages/styles/src/types.ts:2`) — los números sueltos son px, las cadenas `px` se parsean a números. La distinción importa solo para `fontSize`, cuyo tipo se estrecha a `` `${number}px` `` (`types.ts:46`) para que un`16` suelto sea un error de tipo — el shorthand de fuente compuesta debe permanecer válido.

`Style` (`types.ts:16`) agrupa claves por lo que impulsan:

<!-- markdownlint-disable MD060 -->

| Grupo               | Claves                                                                                    | Campo de respaldo                                                   | Convertidor                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Geometría           | `x,y,width,height`                                                                        | mismo (`apply.ts:55`)                                               | `isCssLength` (`apply.ts:23`) — número o `/^[+-]?(\d+\.?\d*                                \| \.\d+)px$/` |
| Transformación      | `scaleX,scaleY,rotation,opacity`                                                          | mismo (`apply.ts:59`)                                               | `isFiniteNumber` (`apply.ts:33`); `rotation` está en **radianes** (`types.ts:25`) no en grados CSS        |
| Caja                | `backgroundColor→bg`, `color`, `borderColor`, `borderRadius→radius`, `padding`            | `apply.ts:63`                                                       | `isString` / `isCssLength`                                                                                |
| Texto               | `font`, `lineHeight`, `textAlign`                                                         | mismo / `textAlign` vía `oneOf(['left','justify'])` (`apply.ts:70`) | `types.ts:55` — `center`/`right` se rechazan ruidosamente                                                 |
| Layout              | `display→null`, `flexDirection→direction`, `gap→gap`, `alignItems→align`, `flexWrap→wrap` | `apply.ts:71`                                                       | `oneOf` + remapeo de enum (`row→horizontal`, `flex-start→start`, `wrap→true`)                             |
| Segmentos de fuente | `fontFamily,fontSize,fontWeight`                                                          | compuesto en `font` (`apply.ts:101` `FONT_KEYS`)                    | `composeFont` (`packages/styles/src/font.ts:113`)                                                         |

Tres reglas sobre esos convertidores:

1. **El skipping entre componentes es silencioso.** `write()` comprueba `field in entity` (`apply.ts:186`); un `Text` no tiene `bg`, un `Button` no tiene `textAlign` — la clave se omite y está ausente de `AppliedStyle.applied: string[]` (`types.ts:71`). Un mismo objeto de estilo puede compartirse entre componentes.
2. **Los errores de categoría lanzan.** Una clave de layout en un no-contenedor (`!('direction' in entity)` en `apply.ts:194` o `field===null && !('direction' in entity)` en `apply.ts:194`) es un `TypeError` que nombra la propiedad y `entity.constructor.name` (`apply.ts:189`). Estilizar un `Text` como `display: flex` es un error, no un no-op.
3. **`display` no escribe ningún campo.** `field: null` (`apply.ts:72`) — valida que la entidad _sea_ un contenedor y que el valor sea `'flex'` (`apply.ts:74`), luego contribuye a `applied` sin tocar la entidad. El contenedor ya _es_ flex; la clave existe para que un estilo de contenedor mal tipado falle.

La validación es estricta: `isCssLength` rechaza `'50%'`, `'8em'` (`packages/styles/test/styles.test.ts:35`), `oneOf` rechaza `stretch`/`row-reverse`/`block` (`styles.test.ts:150`), claves desconocidas lanzan `unknown style property 'position'` (`styles.test.ts:159`).

## 3. El pipeline `applyStyle` — resolver, luego escribir

```ts
export function applyStyle(entity: Entity, s: Style): AppliedStyle {
  const { style: resolved } = resolveStyle(s, getTheme()); // theme.ts:96 getTheme / apply.ts:162 resolveStyle
  const result = applyStyleResolved(entity, resolved); // apply.ts:180
  trackVarKeys(entity, s); // theme.ts:175 — registra claves var() bajo el tema actual
  return result;
}
```

`resolveStyle` (`apply.ts:162`) recorre el objeto de estilo, llamando a `resolveValue(value, theme)` (`apply.ts:137`) por valor — con una rama especial para `padding: {x,y}` (`apply.ts:166`) que resuelve cada eje independientemente. `resolveValue` tiene cuatro brazos:

1. No-string → pasa tal cual.
2. Anclado `var(--key)` (`theme.ts:6` `VAR_RE = /^var\(--([\w-]+)\)$/`) → `resolveToken(key, theme, seen)` (`apply.ts:112`) que busca `theme.tokens[key]` y recursa transitivamente vía `resolveValue(token, theme, seen)`.
3. Forma con fallback `var(--key, …)` (`theme.ts:24` `HAS_VAR_FALLBACK_RE = /var\(\s*--[\w-]+\s*,/`) → lanza `TypeError` nombrando el valor (`apply.ts:148`). Comprobado **antes** de la ruta embebida para que los compuestos también queden cubiertos.
4. Embebido `var(--key)` en cualquier parte (`theme.ts:11` `HAS_VAR_RE = /var\(--([\w-]+)\)/`) → reemplazo global vía `VAR_REPLACE_RE = /var\(--([\w-]+)\)/g` (`apply.ts:105`) sustituyendo `String(resolveToken(key,…))` por ocurrencia (`apply.ts:156`).

`applyStyleResolved` (`apply.ts:180`) es la escritura numérica. Maneja primero las dos formas especiales — `FONT_KEYS` (`apply.ts:207`) vía `composeFont` y objetos `padding` (`apply.ts:242`) escribiendo `paddingX`/`paddingY` (`apply.ts:248` `isCssLength(v, 'padding.x')`) — luego recorre `RULES` para todo lo demás vía `write()` (`apply.ts:185`). Los estilos que tocan fuente marcan `fontTouched` y recomponen una vez al final (`apply.ts:265` `composeFont(current, fontChanges)`). Cuando `applied.length > 0`, `entity.scene?.markDirty()` dispara una vez (`apply.ts:271`), respetando el contrato `onDemand`. Sin escena → sin llamada dirty (`styles.test.ts:182`).

El valor de retorno es `{ applied: string[] }` (`types.ts:71`) — los nombres de propiedades CSS realmente escritos, en orden del objeto — así el llamante puede ramificar con `applied.includes('padding')` sin re-inspeccionar la entidad.

## 4. Sistema de tokens — `tokens()`, `PRESET_THEMES` y semántica `var()`

### 4.1 Crear un tema

```ts
export type ThemeTokenSet = Record<string, string | number>; // theme.ts:38
export interface Theme {
  readonly tokens: ThemeTokenSet;
} // theme.ts:41
export function tokens(set: ThemeTokenSet): Theme {
  return { tokens: set };
} // theme.ts:46
export const DEFAULT_THEME: Theme = tokens(PRESET_THEMES.light); // theme.ts:51
```

Plano por diseño — como `MarkdownTheme` — un solo spread, sin deep merge, sin anidamiento (`theme.ts:35`). `PRESET_THEMES` (`packages/styles/src/presets.ts:12`) provee `light | dark | github | dracula` (`presets.ts:12`), cada uno con `accent/surface/surfaceAlt/text/muted/border/radius-sm/md/lg/font/fontFamily/fontSize/fontWeight/fontMono` (`presets.ts:13`). Un tema del llamante es un spread: `tokens({ ...PRESET_THEMES.dark, accent: '#f00' })` (`vectojs-docs/content/reference/styles.md:136`). Las claves se almacenan sin `--`; las referencias escriben `var(--key)` (`theme.ts:28`).

### 4.2 Resolución anclada, embebida y transitiva

- **Anclada** — `backgroundColor: 'var(--accent)'` resuelve el valor del token directamente (retorno temprano de `resolveValue` en `apply.ts:140`), preservando su tipo: un token numérico `gap: 10` permanece `number` y fluye hacia `isCssLength` sin stringificación. La identidad de cadena completa es lo que permite que `gap: 'var(--gap)'` con `gap: 12` produzca `e.gap === 12` como número (`packages/styles/test/v2.test.ts:70`).
- **Embebida** — `'rgba(var(--rgb), 0.4)'` con `rgb: '255, 0, 0'` sustituye cada ocurrencia vía `String(resolveToken(...))` (`apply.ts:157`), resultando en `'rgba(255, 0, 0, 0.4)'` (`packages/styles/test/issue-608.test.ts:39`). Dos ocurrencias del mismo token comparten un pase de resolución y no disparan el detector de ciclos (`issue-608.test.ts:99` `shadow` con dos `var(--rgb)`).
- **Transitiva** — un token `alias: 'var(--accent)'` con `accent: '#123456'` resuelve `var(--alias)` a `var(--accent)` a `'#123456'` (`packages/styles/test/v2.test.ts:353`). Las cadenas se siguen vía `resolveValue(token, theme, seen)` dentro de `resolveToken` (`apply.ts:125`), así un token compuesto `surface: 'rgba(var(--rgb), 1)'` con `rgb: '17, 34, 51'` produce `'rgba(17, 34, 51, 1)'` al dereferenciarse como `var(--surface)` (`issue-608.test.ts:78`).

`resolveToken` porta `seen: Set<string>` (`apply.ts:112`) — la ruta de claves en la resolución actual. `seen.has(key)` significa ciclo; lanza `circular var() reference: var(--a) → var(--b) → var(--a)` (`apply.ts:121`). `seen.delete(key)` en `finally` (`apply.ts:127`) hace que referencias hermanas al mismo token sean independientes — `rgba(var(--rgb), var(--rgb))` de lo contrario daría falso positivo en la segunda ocurrencia.

### 4.3 Qué lanza y por qué el silencio nunca es correcto

| Condición                                        | Dónde                                                               | Mensaje                                                                           | Por qué debe lanzar                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token desconocido                                | `resolveToken` `apply.ts:116`                                       | `unknown token 'var(--nope)'`                                                     | Canvas2D mantiene silenciosamente el pintado previo cuando el campo recibe basura (`v2.test.ts:253`, `issue-608.test.ts:16` fallo anclado)                                                                                                                                                                     |
| Cadena circular                                  | `resolveToken` `apply.ts:121`                                       | `circular var() reference: … → …`                                                 | La sustitución infinita se colgaría o emitiría el literal `var(--…)`                                                                                                                                                                                                                                           |
| `var(--k, fallback)` — cualquier ruta de llegada | `resolveValue` `apply.ts:148` + `HAS_VAR_FALLBACK_RE` `theme.ts:24` | `var() fallbacks are not supported — '…' would reach the entity field unresolved` | Ni `VAR_RE` ni `HAS_VAR_RE` lo coinciden (`)` debe seguir a la clave), así que sin esta guarda la cadena cruda alcanzaba campos mapeados mientras Canvas2D mantenía silenciosamente el valor anterior y la clave quedaba sin rastrear para cambios de tema (#645, `packages/styles/test/issue-645.test.ts:40`) |
| `fontSize` número suelto o no-px                 | `applyStyleResolved` `apply.ts:221` + `apply.ts:232`                | `fontSize resolved to the bare number …` / `expects a px string`                  | Un `16` suelto compone `'700 16 Inter'` — Canvas2D lo descarta silenciosamente (`v2.test.ts:254`)                                                                                                                                                                                                              |
| `fontFamily` que parece shorthand                | `applyStyleResolved` `apply.ts:214`                                 | `looks like a font shorthand — reference the 'font' token`                        | `'16px Inter'` filtrado a `fontFamily` descartaría tamaño/peso                                                                                                                                                                                                                                                 |

El detector de fallback tolera espacios tras `var(` (`/var\(\s*--/` en `HAS_VAR_FALLBACK_RE` en `theme.ts:24`) para que `var( --accent, #fff)` también sea capturado — los espacios perdidos son comunes y el detector pre-#753 que los omitía dejaba pasar el valor (`issue-645.test.ts:78`).

La capa de tipos estrecha `fontSize` a `` `${number}px` `` (`types.ts:46`); los llamantes JS y los valores de token evaden el tipo, así que el runtime también lo impone — `'2em'` desde un token aún lanza (`issue-608.test.ts:141`).

## 5. Fusión con `css()` y tipado con `style()` — el patrón de variantes

```ts
export function css<T extends Style>(...styles: Array<T | null | undefined | false>): T {
  // css.ts:17
  const merged: Record<string, unknown> = {};
  for (const s of styles) {
    if (!s) continue; // css.ts:20
    for (const [key, value] of Object.entries(s)) {
      merged[key] =
        key === 'padding' && typeof value === 'object' && value !== null
          ? { ...(value as object) } // css.ts:23 — deep-copy de padding por eje
          : value;
    }
  }
  return merged as T;
}
export function style<T extends Style>(s: T): T {
  return s;
} // css.ts:32
```

`style()` es una factoría identidad — tipa el literal como `Style`, lo retorna sin cambios (`packages/styles/test/styles.test.ts:18`). `css()` es la fusión de variantes: fuentes posteriores ganan, `null`/`undefined`/`false` se omiten para que las variantes condicionales sean `css(base, isMuted && muted)` (`css.ts:11`), los inputs no se mutan (`v2.test.ts:49`) y la única forma anidada — `padding: { x, y }` (`types.ts:34`) — se copia (`css.ts:23`) para que mutar `merged.padding.x` nunca alcance una variante fuente (GH-608, `issue-608.test.ts:153`). Reemplazar `padding` por completo también se copia — `merged.padding !== override.padding` (`issue-608.test.ts:163`).

## 6. Cambio de tema — atómico, rastreado y con retención débil

### 6.1 Contabilidad

```ts
const current = { theme: DEFAULT_THEME }; // theme.ts:53
const varPairs = new WeakMap<Theme, Map<WeakRef<Entity>, Map<string, unknown>>>(); // theme.ts:70
const entityRefs = new WeakMap<Entity, WeakRef<Entity>>(); // theme.ts:75
```

`varPairs` indexa por `Theme` (un tema descartado se recolecta por completo vía `WeakMap`), los valores mapean `WeakRef<Entity>` → `Map<string, unknown>` de claves de estilo rastreadas al `var()` que referencian — no el objeto de estilo completo (`theme.ts:59`). Múltiples estilos `var()` en una entidad se acumulan; un literal posterior sobre la misma clave reemplaza la referencia en lugar de ser pisado en el próximo cambio (`theme.ts:61`, `packages/styles/test/v2.test.ts:181`).

Las entidades se retienen vía `WeakRef`s, no fuertemente (`theme.ts:70`): `Entity.destroy()` no tiene hook de vuelta a styles (`theme.ts:65`), así que un mapa interno fuerte retenía cada entidad estilizada por la vida de su tema y `setTheme` seguía re-resolviendo las destruidas (#644, `packages/styles/test/issue-644.test.ts:49`). Las refs muertas se barren durante el recorrido; `untrackVarStyles(entity)` (`theme.ts:160`) es la ruta eager para frameworks que saben cuándo una entidad desapareció — idempotente, seguro para entidades nunca rastreadas (`issue-644.test.ts:93`).

`entityRefs: WeakMap<Entity, WeakRef<Entity>>` (`theme.ts:75`) da un `WeakRef` estable por entidad (`theme.ts:77` `refOf`) para que estilos repetidos sobre una entidad apunten a la misma entrada de tracking en lugar de huérfanos duplicados inalcanables. El propio objeto ref se retiene débilmente y muere con la entidad.

`trackVarKeys(entity, style)` (`theme.ts:175`) es llamado por `applyStyle` con el estilo original `s` (no el resuelto) para que la semántica de override literal se preserve (`apply.ts:300`):

- `typeof value === 'string' && HAS_VAR_RE.test(value)` → `keys.set(key, value)` (`theme.ts:181`) — tanto `var()` anclado como embebido se rastrean.
- Objeto `padding` con `HAS_VAR_RE` en cualquier eje → rastrea la clave completa (`theme.ts:185`).
- En caso contrario → `keys.delete(key)` (`theme.ts:195`) — el literal es escrito por el llamante y no debe reproducirse. `keys.size === 0` poda la entrada de la entidad (`theme.ts:197`).

### 6.2 `setTheme(next)` — dry-run, luego commit

```ts
export function setTheme(next: Theme): void {
  if (next === current.theme) return; // theme.ts:117 — identidad, no igualdad profunda
  const previous = current.theme;
  const pairs = varPairs.get(previous);
  const resolved = new Map<WeakRef<Entity>, Style>();
  if (pairs) {
    for (const [ref, keys] of pairs) {
      const entity = ref.deref();
      if (entity === undefined) {
        pairs.delete(ref);
        continue;
      } // barrer recolectadas (#644) theme.ts:129
      const style: Style = {};
      for (const [key, expr] of keys) (style as Record<string, unknown>)[key] = expr;
      resolved.set(ref, resolveStyle(style, next).style); // dry-run contra next — lanza mientras aún está en previous
    }
  }
  current.theme = next; // theme.ts:139 — solo tras que cada dry-run tuvo éxito
  if (pairs) {
    const nextPairs = pairsOf(next);
    for (const [ref, style] of resolved) {
      const entity = ref.deref();
      if (entity === undefined) continue; // recolectada entre pases theme.ts:144
      applyStyleResolved(entity, style); // sin re-tracking — ya migrado abajo
      nextPairs.set(ref, pairs.get(ref)!); // migra refs al próximo tema theme.ts:146
    }
    varPairs.delete(previous); // theme.ts:148
  }
}
```

La garantía de atomicidad (`theme.ts:107`): cada estilo rastreado se resuelve contra `next` _antes_ de que `current.theme` se mueva. Un token faltante o un valor inválido (p. ej. `--gap: '50%'` en `v2.test.ts:126`, `--radius-md` faltante en `v2.test.ts:139` GH-485) lanza mientras la escena, el tema activo y la contabilidad de pares siguen totalmente consistentes bajo el tema previo — nunca medio re-estilizado. Verificado por el test GH-485: un tema `partial` sin `radius-md` lanza, `getTheme() === themeA` aún se mantiene, ninguna entidad fue re-estilizada y un cambio válido posterior aún re-resuelve cada par (`v2.test.ts:137`).

`getTheme(): Theme` (`theme.ts:96`) lee `current.theme`; `untrackVarStyles` (`theme.ts:160`) elimina la entrada de la entidad bajo el tema activo para que el próximo `setTheme` deje de reproducirla.

## 7. Composición de fuentes y padding por eje — las dos escrituras no triviales

### 7.1 `composeFont` — cirugía sobre una cadena shorthand

Los componentes UI portan la fuente completa como un `font: string` (`packages/ui/src/UIComponent.ts:1` vía `Entity`, `packages/ui/src/Text.ts:111` `font: string`). Las tres claves con nombre CSS no son campos independientes — `applyStyleResolved` parsea el shorthand actual, reemplaza los segmentos que el estilo cambia y escribe la cadena recompuesta (`apply.ts:207` bucle `FONT_KEYS`, `apply.ts:267` `composeFont(current, fontChanges)`).

`composeFont(current, changes)` (`packages/styles/src/font.ts:113`) delega a `parse(font)` (`font.ts:73`) que tokeniza por espacios (`font.ts:74` `split(/\s+/).filter(Boolean)`), consume keywords iniciales `style`/`variant`/`weight` (`font.ts:40` `parsePrefixes` con `WEIGHT_RE = /^(normal|bold|bolder|lighter|[1-9]00)$/` en `font.ts:18`, `STYLE_RE` `:19`, `VARIANT_RE` `:20`), coincide `SIZE_SLOT_RE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:rem|em|px|pt))(?:\/([^\s/]+))?$/` (`font.ts:26`) en el slot de tamaño y trata el resto como `family`. La recomposición une `[style, variant, weight, size[/lineHeight], family]` (`font.ts:103`).

Por qué importa:

- Gramática de prefijos: `italic 700 16px Georgia` o `16px/24px Inter` solían colapsar todo alrededor del tamaño dentro de family (`font.ts:14`), así que un cambio posterior de segmento recomponía una cadena inválida que Canvas2D descarta silenciosamente. Ahora `fontSize: '20px'` sobre `italic 700 16px Georgia` produce `italic 700 20px Georgia` (`issue-608.test.ts:107`) y preserva `16px/24px` line-height (`issue-608.test.ts:112`).
- Ambigüedad de `normal`: `font: normal normal 16px Inter` es CSS válido; el primer `normal` llena `weight`, los siguientes llenan `style` luego `variant` (`font.ts:48`) en lugar de caer en el slot de tamaño y lanzar.
- Fallos ruidosos: `ultra-condensed 700 16px serif` antes del tamaño lanza nombrando el segmento infractor (`issue-608.test.ts:124`). Los segmentos tipo tamaño que no pueden colocarse fallan en `font.ts:91` (`unrecognized segment '…' before the font size`) en lugar de quedar enterrados en family.
- Defaults de tamaño/familia faltantes: `parts.size ??= '16px'` y `family ??= 'sans-serif'` (`font.ts:121`) para que un `font: ''` vacío más `fontFamily: 'Inter'` produzca `'16px Inter'` (`v2.test.ts:239`), y los shorthands con solo prefijo de estilo `italic Georgia` normalicen a `italic 18px Georgia` (`issue-608.test.ts:129`).
- Imposición de unidad en runtime: `fontSize` que llega como `12` (número suelto desde un token) lanza `unit-bearing token (e.g. '16px')` (`apply.ts:223`), `'2em'` lanza `fontSize expects a px string` (`apply.ts:233`) y un `fontFamily` que contiene un dígito dispara `looks like a font shorthand` (`apply.ts:214`, `v2.test.ts:272`). El tipo `fontSize:`${number}px`` (`types.ts:46`) atrapa el caso estático; el runtime atrapa tokens y llamantes JS.

### 7.2 Padding por eje — `padding: { x, y }`

`padding?: CssLength | { x?: CssLength; y?: CssLength }` (`types.ts:34`). Los componentes de caja (`Button`, `Link`, `Card`) portan `padding` (uniforme) más `paddingX`/`paddingY` (`packages/ui/src/UIComponent.ts:21` / `:28`): la capa apply escribe los campos por eje cuando están presentes (`apply.ts:248` `paddingX`/`paddingY` vía `isCssLength(v, 'padding.x')`), deja `padding` intacto y reporta `applied: ['padding']` como un todo. En entidades sin campos por eje el estilo se omite (`v2.test.ts:329`) — el `padding` en tiempo de construcción en las opciones del componente aún gobierna el dimensionado intrínseco; el `padding: {x,y}` post-construcción es leído en vivo por consumidores que inspeccionan `paddingX`/`paddingY` (p. ej. layout de `Card`), no re-midiendo la caja.

Las referencias a tokens dentro del objeto se resuelven por eje (`apply.ts:168` `resolveValue(pad.x, theme)`) y `trackVarKeys` rastrea la clave como un todo cuando cualquier eje referencia un token (`theme.ts:189`). Un valor de eje inválido lanza nombrando `padding.x` (`v2.test.ts:336`).

## 8. Cómo lo consumen UI y core

Ningún componente UI importa `@vectojs/styles` en runtime — los estilos se aplican _a_ ellos, no _por_ ellos. Los componentes exponen campos numéricos tipados que resultan ser los destinos de escritura de la tabla Rule:

- **Geometría** — cada `Entity` tiene `x/y/width/height/opacity/scaleX/scaleY/rotation` — `Text` y `Button` construyen directamente sobre ellos.
- **Caja** — `UIComponent` (`packages/ui/src/UIComponent.ts:19`) posee `padding`, `paddingX`, `paddingY`; `Button` (`packages/ui/src/Button.ts:19`) posee `bg` (`backgroundColor` → `bg` en `apply.ts:63`), `color`, `borderColor`, `radius` (`borderRadius`), más `font` para su centrado de etiqueta (`Button.ts:80` `measureText(label, font)`). `Card`, `Link`, `Tabs` siguen los mismos campos de caja.
- **Texto** — `Text` (`packages/ui/src/Text.ts:18` `TextOptions`) posee `font`, `color`, `lineHeight`, `textAlign` (`'left'|'justify'` — `Text.ts:42`); su `fontSize` se extrae vía `fontSizePx(font)` (`packages/ui/src/measure.ts:27`) que escanea el token `px` con `indexOf('px')` en lugar de una regex con cuantificadores de clase de dígito adyacentes (misma higiene ReDoS que `font.ts:26` `SIZE_SLOT_RE`). `familyOf(font)` (`measure.ts:57`) descompone el mismo shorthand para medición por familia.
- **Layout** — `Stack` (`packages/ui/src/Stack.ts:10`) posee `direction→flexDirection`, `gap`, `align→alignItems`, `wrap→flexWrap`; `Flow` es el contenedor hermano. Solo estos dos aceptan las claves solo-contenedor — cualquier otra entidad lanza (`packages/styles/test/styles.test.ts:144`).

Las entidades de texto de core (`packages/core/src/text/MSDFTextEntity.ts:1` `MSDFTextEntity`, `SVGEntity`) no se estilizan vía este paquete en el codebase actual — su `font`/`maxWidth`/`lineHeight` son impulsados por `MSDFFont` y `LayoutWorkerManager` (boss 02). Aplicar `fontSize: '20px'` a una `MSDFTextEntity` aún pasaría por `composeFont` pero hoy no hay call site de `applyStyle` para ella; la interacción de texto del capítulo es a nivel de contrato de medición (mide donde pintas, `packages/text/src/measureContext.ts:87` `getSharedMeasuringContext`).

`measure.ts` también posee la invalidación de métricas de fuente con la que los estilos interactúan indirectamente: cargas de webfont disparan `notifyFontMetricsChanged` (`measure.ts:111`) que limpia el LRU y notifica a suscriptores `UIComponent.watchFontMetrics(handler)` (`UIComponent.ts:128`) — `Text` y `Button` re-miden sus anchos intrínsecos y hacen `markDirty`. Los estilos no necesitan re-aplicarse tras una carga de webfont; los propios handlers `watchFontMetrics` de las entidades mantienen correcta la geometría.

## 9. Migrar hábitos CSS al VMT — cada fallo silencioso hecho ruidoso

La doctrina del paquete (GH-608, `packages/styles/src/theme.ts:20` "doctrina GH-608") es que una forma `var()` no reconocida nunca debe pasar silenciosamente — lo único que este paquete no debe hacer es entregar a Canvas2D una cadena que ignore silenciosamente. Esa doctrina se extiende a cada hábito CSS que no tiene contraparte en el VMT:

| Hábito CSS                                                                   | Qué ocurre                                                                                                                                           | Por qué                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `width: '50%'`, `gap: '8em'`, `radius: '50%'`                                | `TypeError: width expects a bare number or a px string` (`apply.ts:29`)                                                                              | Solo existen unidades px en el VMT; `%`/`em`/`rem` no tienen campo de respaldo (ver `vectojs-docs/content/reference/styles.md:193`). Gaps porcentuales requerirían un containing block que el VMT nunca computa.                                                                                        |
| `textAlign: 'center' \| 'right'`                                             | `TypeError: textAlign expects one of left \| justify` (`apply.ts:50`, `styles.test.ts:87`)                                                           | `Text`/`RichText`/`TextEntity` y el motor de layout (`LayoutEngine.textAlign` en `packages/layout/src/LayoutEngine.ts:1`) implementan solo `left` y `justify` — `center`/`right` no pueden honrarse y no deben renderizar como `left` silenciosamente (`vectojs-docs/content/reference/styles.md:208`). |
| `var(--token, fallback)`                                                     | `TypeError: var() fallbacks are not supported — 'var(--accent, #fff)' would reach the entity field unresolved` (`apply.ts:149`)                      | La resolución de fallback no está implementada; la cadena cruda alcanzaría Canvas2D que mantiene silenciosamente el pintado previo, y la clave quedaría sin rastrear para `setTheme` (#645, `issue-645.test.ts:33`).                                                                                    |
| `rotation: '30deg'` o `30` suelto                                            | Escrito solo como número (`isFiniteNumber` en `apply.ts:33`) e interpretado como **radianes** (`types.ts:25`). `rotate(30deg)` debe ser `Math.PI/6`. | Cada otra superficie de rotación en VectoJS está en radianes; la capa de estilos no introduce una segunda unidad.                                                                                                                                                                                       |
| `display: 'block'`, `flexDirection: 'row-reverse'`                           | `TypeError: display expects one of flex` (`apply.ts:50`, `styles.test.ts:152`)                                                                       | Solo existen contenedores `flex`; `block`/`grid` no tienen significado para un `Stack`/`Flow` que _ya es_ flex.                                                                                                                                                                                         |
| `gap` / `alignItems` en un `Text`                                            | `TypeError: 'gap' is a container-only property and Text is not a container` (`apply.ts:189`, `styles.test.ts:144`)                                   | Error de categoría, no un no-op silencioso.                                                                                                                                                                                                                                                             |
| `position: 'absolute'`, `transform`, `justifyContent`, `border: '1px solid'` | `unknown style property 'position'` (`apply.ts:258`, `styles.test.ts:159`)                                                                           | Sin campo donde escribir; añadirlos reintroduciría maquinaria de cascada/colapso de márgenes que el VMT existe para eliminar (`vectojs-docs/content/reference/styles.md:198`).                                                                                                                          |
| `fontSize: 16` (número suelto) o `fontSize: '2em'`                           | `bare number` / `expects a px string like '16px'` (`apply.ts:223` / `:233`)                                                                          | Los shorthands de fuente de canvas requieren un tamaño con unidad; un número suelto compone un shorthand inválido que Canvas2D descarta silenciosamente (`v2.test.ts:244`, `issue-608.test.ts:137`).                                                                                                    |
| `fontFamily: '16px Inter'`                                                   | `looks like a font shorthand — reference the 'font' token` (`apply.ts:214`, `v2.test.ts:272`)                                                        | Evita que un shorthand completo se filtre al slot de family y descarte tamaño/peso.                                                                                                                                                                                                                     |

El hilo común: cada throw nombra la propiedad CSS y hace eco del valor (`apply.ts:29` `JSON.stringify(value)`), así un grep del mensaje encuentra el call site migrado. Un estilo que _pasa_ validación siempre produce un shorthand de fuente válido para canvas y un número que el VMT puede pintar — no hay camino donde un valor malo pinte silenciosamente el estado del frame previo.

## 10. Partes difíciles — con recibos

| Trampa                                                                                                              | Dónde                                                            | Estado                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `rgba(var(--rgb), 0.4)` escrito como cadena cruda — Canvas2D mantuvo silenciosamente el fill previo                 | `apply.ts:133` (GH-608), `issue-608.test.ts:37`                  | Corregido: `var()` embebido sustituido vía `VAR_REPLACE_RE` (`apply.ts:105`)                                          |
| Prefijo de tamaño `italic 700 16px` colapsado en family al recomponer                                               | `font.ts:14` (GH-608)                                            | Corregido: parser completo `[style\|variant\|weight]? size[/line-height]? family` (`font.ts:40` `parsePrefixes`)      |
| Segmento line-height `16px/24px` perdido al cambiar `fontSize`                                                      | `font.ts:26` `SIZE_SLOT_RE`                                      | Corregido: captura `size/lineHeight` y re-emisión (`font.ts:80` / `:102`)                                             |
| `fontSize` aceptando `'2em'`/`2rem` y componiendo un shorthand que Canvas2D descarta                                | `apply.ts:232` (GH-608)                                          | Corregido: imposición runtime de `px` (`apply.ts:232`, `issue-608.test.ts:137`)                                       |
| `css()` compartiendo el mismo objeto `padding: {x,y}` entre variantes                                               | `css.ts:23` (GH-608)                                             | Corregido: copia por eje (`css.ts:23`, `issue-608.test.ts:153`)                                                       |
| `var(--token, fallback)` pasando sin resolver                                                                       | `theme.ts:24` `HAS_VAR_FALLBACK_RE` (#645)                       | Corregido: detectado antes de sustitución embebida y lanzado (`apply.ts:147`, `issue-645.test.ts:30`)                 |
| `var( --token, fb)` con espacio perdido escapando la guarda de fallback                                             | `theme.ts:24` `/var\(\s*--/` (#753)                              | Corregido: espacios tras `var(` permitidos (`issue-645.test.ts:78`)                                                   |
| Cadenas token-ref→token filtrando el literal `var(--…)` a campos string                                             | `apply.ts:112` `resolveToken` (GH-452/608)                       | Corregido: `resolveValue` transitivo con set `seen` de ciclo (`apply.ts:125`)                                         |
| `setTheme` medio re-estilizando con token faltante                                                                  | `theme.ts:107` dry-run (GH-485, `v2.test.ts:137`)                | Corregido: resolver-todo-antes-de-commit, `current.theme` solo se mueve tras cada dry-run                             |
| Entidades estilizadas retenidas para siempre — `WeakMap<Theme, Map<Entity,…>>` retenía fuerte                       | `theme.ts:70` `WeakRef` (#644)                                   | Corregido: `WeakMap<Theme, Map<WeakRef<Entity>,…>>` + `refOf` (`theme.ts:77`) + barrido en recorrido (`theme.ts:129`) |
| `css()` compartiendo el mismo objeto `padding` mientras la clave de tracking `var()` se elimina en override literal | `theme.ts:195` `keys.delete(key)` (GH-451, `v2.test.ts:181`)     | Corregido: `Map<string,unknown>` por clave en lugar de tracking por objeto                                            |
| Token `fontSize` con número suelto `bad-size: 12` componiendo `'700 12 Inter'` silenciosamente                      | `apply.ts:221` guarda de número suelto                           | Corregido: `fontSize resolved to the bare number 12 — use a unit-bearing token` (`v2.test.ts:244`)                    |
| `SIZE_SLOT_RE` ReDoS polinomial en `\d+\.?\d*` con clases de dígito adyacentes                                      | `font.ts:26` `SIZE_SLOT_RE` seguro ante ramas (`v2.test.ts:258`) | Corregido: sin cuantificadores adyacentes de misma clase, alternativas de unidad más largas primero (`font.ts:22`)    |
| `Text` hardcodeado `textAlign: 'center'` desde una hoja migrada                                                     | `styles.test.ts:87`                                              | Por diseño: lanza — `center`/`right` no tienen respaldo en entidad; migra a `left`+layout o `justify`                 |

## 11. Checklist — antes de aterrizar un cambio de estilos

1. **Nunca aliases la forma anidada.** Un `Style` porta como máximo un objeto anidado (`padding: {x,y}` en `types.ts:34`); `css()` debe copiarlo (`css.ts:23`) y cualquier clave anidada nueva necesita el mismo tratamiento o las fusiones de variantes sangran.
2. **Impone unidades en runtime, no solo en tipos.** `` fontSize: `${number}px` `` (`types.ts:46`) atrapa `16` en tiempo de compilación, pero tokens y llamantes JS lo evaden — `apply.ts:221` / `232` aún deben lanzar.
3. **Mantén atómica la resolución de tokens.** El dry-run de `setTheme` (`theme.ts:124` `resolveStyle(style, next)`) debe cubrir cada clave rastreada antes de que `current.theme` se mueva; un valor que falla validación al cambiar no debe re-estilizar a medias la escena (`v2.test.ts:137` GH-485).
4. **Retén entidades débilmente.** `varPairs` debe permanecer `WeakMap<Theme, Map<WeakRef<Entity>,…>>` (`theme.ts:70`) y barrer `ref.deref() === undefined` (`theme.ts:129`) — `Entity.destroy()` no puede llamar a `untrackVarStyles` porque `core` no depende de `styles` (`theme.ts:65`).
5. **Rastrea por clave, no por objeto.** `trackVarKeys` (`theme.ts:175`) compara las claves del estilo _actual_ contra el `Map<string,unknown>` almacenado — un literal posterior sobre la misma clave debe hacer `delete` (`theme.ts:195`) o el replay de var lo pisará (`v2.test.ts:181` GH-451).
6. **Mantén sincronizados el parser de fuentes y la guarda `isCssLength`.** `SIZE_SLOT_RE` (`font.ts:26`) e `isCssLength` (`apply.ts:23`) comparten la misma forma de cadena `px`; divergir permite que uno acepte lo que el otro rechaza y compone un shorthand inválido que Canvas2D descarta silenciosamente.
7. **Falla ruidosamente en formas desconocidas.** Cualquier sintaxis `var()` nueva, clave CSS nueva o propiedad solo-contenedor nueva debe lanzar con el nombre de propiedad y el valor (`apply.ts:29` `JSON.stringify(value)`) — la doctrina GH-608 de que el silencio es lo único que este paquete no debe hacer con una forma no reconocida.

---

_Serie: 00 Overview → 01 Selection → 02 Text+Layout → 03 Projection+Virtualization → 04 Streaming Markdown → 05 TeX → 06 Runtime VMT → 07 Renderer → 08 WASM G1/G2/G3 → 09 Three/XR → 10 Video Export → 11 Layout de Grafos → 12 DevTools → **13 Estilos y Theming** → 99 Synthesis._
