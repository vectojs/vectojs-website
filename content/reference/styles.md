+++
title = "Styles (@vectojs/styles)"
description = "CSS-property-name style objects over the numeric Virtual Math Tree: token themes (var() + setTheme), css() merging, and font composition — no parser, no cascade, no selector."
weight = 55

[extra]
order = 55
+++

# `@vectojs/styles`

A declarative style layer over the numeric Virtual Math Tree: write styles
with **CSS property names and CSS-like values**, and `applyStyle` maps them
onto entity fields. The point is migration comfort — code that reads like CSS
still lands on the same typed, numeric fields a VectoJS developer would set by
hand, and the canvas stays the single source of truth.

This is **not** a CSS engine: there is no parser, no selector, no cascade, no
inheritance, and no global style registry. A style object is an ordinary,
typed, optional-key object; token references (`var(--key)`) resolve against a
flat theme, and switching the theme re-applies every tracked style.

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

## Exports

- `style()` — identity factory that types an object literal as `Style`.
- `css(...styles)` — merge factory (0.2.0): later sources win; `null`,
  `undefined`, `false` sources are skipped, so variants can be conditional.
  Inputs are not mutated.
- `applyStyle(entity, style)` — writes the mapped fields, returns
  `{ applied: string[] }` (the CSS keys actually written, in object order).
- `tokens(set)` — create a `Theme` from a flat token set.
- `setTheme(theme)` / `getTheme()` — switch/read the active theme; styles
  that reference `var()` are re-resolved and re-applied on switch.
- `PRESET_THEMES` — `light` (the default theme), `dark`, `github`,
  `dracula` token sets.
- `Style` — the style interface. All keys optional.

The package depends only on `@vectojs/core`.

## Key mapping

| CSS key                                  | Entity field                         | Value                                                                       |
| ---------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| `x`, `y`, `width`, `height`              | same                                 | bare number or `px` string                                                  |
| `opacity`, `scaleX`, `scaleY`            | same                                 | number                                                                      |
| `rotation`                               | same                                 | number, **radians** (VectoJS convention, not CSS degrees)                   |
| `backgroundColor`                        | `bg`                                 | color string, passed through                                                |
| `color`, `borderColor`                   | same                                 | color string, passed through                                                |
| `borderRadius`                           | `radius`                             | bare number or `px` string                                                  |
| `padding`                                | `padding` (or `paddingX`/`paddingY`) | single value, or `{ x, y }` per-axis (0.2.0)                                |
| `font`                                   | `font`                               | CSS font shorthand string, e.g. `"16px Inter"`                              |
| `fontFamily` / `fontSize` / `fontWeight` | composed into `font`                 | 0.2.0: segments replaced, the rest preserved                                |
| `lineHeight`                             | `lineHeight`                         | bare number or `px` string                                                  |
| `textAlign`                              | `textAlign`                          | `"left"` \| `"justify"` only                                                |
| `display`                                | — (validation only)                  | `"flex"`; asserts the entity is a container                                 |
| `flexDirection`                          | `direction`                          | `"row"` → `"horizontal"`, `"column"` → `"vertical"`                         |
| `gap`                                    | `gap`                                | bare number or `px` string                                                  |
| `alignItems`                             | `align`                              | `"flex-start"` → `"start"`, `"center"` → `"center"`, `"flex-end"` → `"end"` |
| `flexWrap`                               | `wrap`                               | `"wrap"` → `true`, `"nowrap"` → `false`                                     |

## Tokens and themes

A theme is a flat token set; keys are written without the `--` prefix and
referenced as `var(--<key>)`, mirroring CSS custom properties:

```ts
const theme = tokens({ accent: '#2563eb', 'radius-md': 8, gap: 10 });
setTheme(theme);
applyStyle(btn, style({ backgroundColor: 'var(--accent)', borderRadius: 'var(--radius-md)' }));
```

- `var(--key)` is resolved **exactly** (whole-string) against the active
  theme's tokens before the value converter runs, so a token may hold a color,
  a px string, or a bare number. An unknown token throws with its name.
- Styles that reference tokens are **tracked** (WeakMap per theme — no leaks)
  and re-applied when `setTheme(next)` switches, so a theme swap recolours the
  whole scene with zero caller-side changes. Styles without `var()` are not
  tracked. If a token value fails the mapped property's validation on switch
  (e.g. `--radius-md: "50%"`), `setTheme` throws.
- The default theme is the `light` preset; `tokens()` sets are plain objects,
  so a caller theme is a spread: `tokens({ ...PRESET_THEMES.dark, accent: "#f00" })`.

## Font composition

`fontFamily`, `fontSize` and `fontWeight` are not independent fields — ui
components carry the whole font as one shorthand string. These keys parse the
entity's current `font`, replace only the segments present, and write the
recomposed string:

```ts
applyStyle(text, style({ font: '700 16px Inter' })); // entity font
applyStyle(text, style({ fontSize: '20px' })); // -> "700 20px Inter"
applyStyle(text, style({ fontFamily: 'ui-monospace' })); // -> "700 20px ui-monospace"
```

An entity with an empty font starts from `16px`; a missing family falls back
to `sans-serif`. On entities without a `font` field these keys are skipped.

## Semantics

- **Cross-component reuse.** A key whose field does not exist on the entity is
  skipped silently, so one style object can be shared across a `Button`, a
  `Text`, and a `Stack` — each takes what it has. `applied` reports exactly
  what was written.
- **Loud failures for category errors.** Layout keys (`display`,
  `flexDirection`, `gap`, `alignItems`, `flexWrap`) on an entity that is not a
  container throw a `TypeError` — styling a `Text` as a flex container is a
  mistake, not a no-op. An unknown CSS key throws too.
- **Loud failures for invalid values.** `"50%"`, `"8em"`, or
  `textAlign: "center"` throw with the property name. VectoJS text implements
  `left` and `justify` only (`Text`, `RichText`, `TextEntity`, and the layout
  engine all share `"left" | "justify"`), so `center`/`right` cannot be
  honored and must not fail silently. Values are bare numbers (px) or `px`
  strings; `%`, `em`, `rem` are rejected.
- **Dirty signalling.** When at least one key was written, `applyStyle` calls
  `entity.scene.markDirty()` once, so `onDemand` scenes repaint.

## What is deliberately out of scope (v0.2.0)

- `transform` (CSS transform strings need parsing), `justifyContent` (no
  backing field — Stack children align via `align`), `border` objects (no
  canvas border rendering exists yet — only `borderColor`), `%`/`em`/`rem`
  lengths, pseudo-states (`:hover`), media queries, selectors and cascade —
  none of these exist as entity fields, and adding them would reintroduce the
  machinery the numeric VMT exists to remove.

## FAQ

**Why does `applyStyle` throw on `textAlign: "center"`?** Because `textAlign`
is `"left" | "justify"` across the whole stack — ui `Text`/`RichText`, core
`TextEntity`, and the layout engine (`LayoutEngine.textAlign`). No entity has
a way to honor `center`/`right`, so the throw keeps a migrating stylesheet
from silently rendering left-aligned text.

**Is `rotation` in degrees?** No — radians, matching every other VectoJS
rotation surface. A CSS `rotate(30deg)` migration must convert to
`Math.PI / 6`.

**Does `padding: { x, y }` resize a Button?** No. Box components size
themselves in their constructor, so per-axis padding set afterwards is read by
consumers that inspect `paddingX`/`paddingY` live (e.g. a Card layout), not by
intrinsic sizing. Set `padding` in the component's options for construction
sizing.

**How do I switch themes after applying styles?** Apply styles referencing
`var(--key)` tokens, then call `setTheme(tokens({ ... }))` — every tracked
style re-resolves against the new tokens and repaints. Styles with literal
values are not touched.
