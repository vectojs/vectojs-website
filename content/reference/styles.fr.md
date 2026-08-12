+++
title = "Styles (@vectojs/styles)"
description = "Des objets de style à noms de propriétés CSS sur l'arbre mathématique virtuel numérique : thèmes de jetons (var() + setTheme), fusion css() et composition de police — sans analyseur, sans cascade, sans sélecteur."
weight = 55
+++

# `@vectojs/styles`

Une couche de style déclarative sur l'arbre mathématique virtuel numérique :
écrivez des styles avec **des noms de propriétés CSS et des valeurs de type
CSS**, et `applyStyle` les mappe sur les champs des entités. Le but est le
confort de migration — un code qui se lit comme du CSS aboutit sur les mêmes
champs typés et numériques qu'un développeur VectoJS définirait à la main, et
le canvas reste la source unique de vérité.

Il ne s'agit **pas** d'un moteur CSS : pas d'analyseur, pas de sélecteur, pas de
cascade, pas d'héritage, et pas de registre de styles global. Un objet de style
est un objet ordinaire, typé, à clés optionnelles ; les références de jetons
(`var(--key)`) se résolvent contre un thème plat, et changer de thème
ré-applique chaque style suivi.

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

- `style()` — fabrique d'identité qui type un littéral d'objet comme `Style`.
- `css(...styles)` — fabrique de fusion (0.2.0) : les sources ultérieures
  l'emportent ; les sources `null`, `undefined`, `false` sont ignorées, donc
  les variantes peuvent être conditionnelles. Les entrées ne sont pas modifiées.
- `applyStyle(entity, style)` — écrit les champs mappés, renvoie
  `{ applied: string[] }` (les clés CSS réellement écrites, dans l'ordre de
  l'objet).
- `tokens(set)` — crée un `Theme` à partir d'un ensemble de jetons plat.
- `setTheme(theme)` / `getTheme()` — change/lit le thème actif ; les styles
  qui référencent `var()` sont re-résolus et ré-appliqués au changement.
- `PRESET_THEMES` — les ensembles de jetons `light` (le thème par défaut),
  `dark`, `github`, `dracula`.
- `Style` — l'interface de style. Toutes les clés sont optionnelles.
- `composeFont(current, changes)` — recompose une chaîne abrégée de police CSS
  (voir [Composition de police](#composition-de-police)).
- `ThemeTokenSet` — `Record<string, string | number>` ; le type d'un ensemble
  `tokens()` et de `Theme.tokens`.
- `Theme` — `{ readonly tokens: ThemeTokenSet }`, créé par `tokens()`.

Le paquet ne dépend que de `@vectojs/core`.

## Correspondance des clés

| Clé CSS                                  | Champ d'entité                       | Valeur                                                                      |
| ---------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| `x`, `y`, `width`, `height`              | même                                 | nombre nu ou chaîne `px`                                                    |
| `opacity`, `scaleX`, `scaleY`            | même                                 | nombre                                                                      |
| `rotation`                               | même                                 | nombre, **radians** (convention VectoJS, pas les degrés CSS)                |
| `backgroundColor`                        | `bg`                                 | chaîne de couleur, transmise telle quelle                                   |
| `color`, `borderColor`                   | même                                 | chaîne de couleur, transmise telle quelle                                   |
| `borderRadius`                           | `radius`                             | nombre nu ou chaîne `px`                                                    |
| `padding`                                | `padding` (ou `paddingX`/`paddingY`) | valeur unique, ou `{ x, y }` par axe (0.2.0)                                |
| `font`                                   | `font`                               | chaîne abrégée de police CSS, par ex. `"16px Inter"`                        |
| `fontFamily` / `fontSize` / `fontWeight` | composées dans `font`                | 0.2.0 : segments remplacés, le reste conservé                               |
| `lineHeight`                             | `lineHeight`                         | nombre nu ou chaîne `px`                                                    |
| `textAlign`                              | `textAlign`                          | uniquement `"left"` \| `"justify"`                                          |
| `display`                                | — (validation uniquement)            | `"flex"` ; vérifie que l'entité est un conteneur                            |
| `flexDirection`                          | `direction`                          | `"row"` → `"horizontal"`, `"column"` → `"vertical"`                         |
| `gap`                                    | `gap`                                | nombre nu ou chaîne `px`                                                    |
| `alignItems`                             | `align`                              | `"flex-start"` → `"start"`, `"center"` → `"center"`, `"flex-end"` → `"end"` |
| `flexWrap`                               | `wrap`                               | `"wrap"` → `true`, `"nowrap"` → `false`                                     |

## Jetons et thèmes

Un thème est un ensemble de jetons plat ; les clés sont écrites sans le préfixe
`--` et référencées comme `var(--<key>)`, reflétant les propriétés personnalisées
CSS :

```ts
const theme = tokens({ accent: '#2563eb', 'radius-md': 8, gap: 10 });
setTheme(theme);
applyStyle(btn, style({ backgroundColor: 'var(--accent)', borderRadius: 'var(--radius-md)' }));
```

- `var(--key)` est résolue **exactement** (chaîne entière) contre les jetons du
  thème actif avant que le convertisseur de valeur ne s'exécute, donc un jeton
  peut contenir une couleur, une chaîne px, ou un nombre nu. Un jeton inconnu
  lance une erreur avec son nom.
- Les styles qui référencent des jetons sont **suivis** (WeakMap par thème —
  sans fuite) et ré-appliqués lorsque `setTheme(next)` change, donc un échange
  de thème recolore toute la scène sans aucun changement côté appelant. Les
  styles sans `var()` ne sont pas suivis. Si une valeur de jeton échoue à la
  validation de la propriété mappée au moment du changement (par ex.
  `--radius-md: "50%"`), `setTheme` lance une erreur.
- Le thème par défaut est le préréglage `light` ; les ensembles `tokens()` sont
  des objets simples, donc un thème d'appelant est une propagation :
  `tokens({ ...PRESET_THEMES.dark, accent: "#f00" })`.

## Composition de police

`fontFamily`, `fontSize` et `fontWeight` ne sont pas des champs indépendants —
les composants ui portent toute la police comme une seule chaîne abrégée. Ces
clés analysent le `font` actuel de l'entité, ne remplacent que les segments
présents, et écrivent la chaîne recomposée :

```ts
applyStyle(text, style({ font: '700 16px Inter' })); // entity font
applyStyle(text, style({ fontSize: '20px' })); // -> "700 20px Inter"
applyStyle(text, style({ fontFamily: 'ui-monospace' })); // -> "700 20px ui-monospace"
```

Une entité avec une police vide démarre à partir de `16px` ; une famille
manquante retombe sur `sans-serif`. Sur les entités sans champ `font`, ces clés
sont ignorées.

L'outil de chaîne sous-jacent est exporté pour une utilisation directe :

```ts
composeFont(
  current: string,                                       // e.g. "700 16px Inter"
  changes: { fontFamily?: string; fontSize?: string; fontWeight?: string },
): string                                               // -> "700 20px ui-monospace"
```

`composeFont` analyse une abréviation de police CSS, ne remplace que les
segments présents dans `changes`, et recompose ; une taille/famille manquante
est remplie avec `16px` / `sans-serif` afin que le résultat soit toujours une
chaîne de police canvas valide.

## Sémantique

- **Réutilisation inter-composants.** Une clé dont le champ n'existe pas sur
  l'entité est ignorée silencieusement, donc un objet de style peut être
  partagé entre un `Button`, un `Text` et un `Stack` — chacun prend ce qu'il a.
  `applied` rapporte exactement ce qui a été écrit.
- **Échecs bruyants pour les erreurs de catégorie.** Les clés de mise en page
  (`display`, `flexDirection`, `gap`, `alignItems`, `flexWrap`) sur une entité
  qui n'est pas un conteneur lancent un `TypeError` — styliser un `Text` comme
  un conteneur flex est une erreur, pas une opération nulle. Une clé CSS
  inconnue lance aussi une erreur.
- **Échecs bruyants pour les valeurs invalides.** `"50%"`, `"8em"`, ou
  `textAlign: "center"` lancent une erreur avec le nom de la propriété. Le
  texte VectoJS n'implémente que `left` et `justify` (`Text`, `RichText`,
  `TextEntity` et le moteur de mise en page partagent tous `"left" | "justify"`),
  donc `center`/`right` ne peuvent pas être honorés et ne doivent pas échouer
  silencieusement. Les valeurs sont des nombres nus (px) ou des chaînes `px` ;
  `%`, `em`, `rem` sont rejetés.
- **Signalisation de modification.** Lorsqu'au moins une clé a été écrite,
  `applyStyle` appelle `entity.scene.markDirty()` une fois, donc les scènes
  `onDemand` se repeignent.

## Volontairement hors de portée (v0.2.0)

- `transform` (les chaînes de transformation CSS nécessitent une analyse),
  `justifyContent` (pas de champ sous-jacent — les enfants du `Stack`
  s'alignent via `align`), les objets `border` (aucun rendu de bordure canvas
  n'existe encore — seulement `borderColor`), les longueurs `%`/`em`/`rem`, les
  pseudo-états (`:hover`), les media queries, les sélecteurs et la cascade —
  aucun de ces éléments n'existe comme champ d'entité, et les ajouter
  réintroduirait la machinerie que le VMT numérique existe pour éliminer.

## FAQ

**Pourquoi `applyStyle` lance-t-il une erreur sur `textAlign: "center"` ?**
Parce que `textAlign` est `"left" | "justify"` dans toute la pile — ui
`Text`/`RichText`, core `TextEntity`, et le moteur de mise en page
(`LayoutEngine.textAlign`). Aucune entité n'a le moyen d'honorer
`center`/`right`, donc l'erreur empêche une feuille de style en migration de
rendre silencieusement un texte aligné à gauche.

**`rotation` est-il en degrés ?** Non — en radians, conformément à toutes les
autres surfaces de rotation VectoJS. Une migration CSS `rotate(30deg)` doit
convertir en `Math.PI / 6`.

**Est-ce que `padding: { x, y }` redimensionne un `Button` ?** Non. Les
composants boîte se dimensionnent eux-mêmes dans leur constructeur, donc un
padding par axe défini ensuite est lu par les consommateurs qui inspectent
`paddingX`/`paddingY` en direct (par ex. une mise en page `Card`), pas par le
dimensionnement intrinsèque. Définissez `padding` dans les options du composant
pour le dimensionnement à la construction.

**Comment changer de thème après avoir appliqué des styles ?** Appliquez des
styles qui référencent des jetons `var(--key)`, puis appelez
`setTheme(tokens({ ... }))` — chaque style suivi se re-résout contre les
nouveaux jetons et se repeint. Les styles avec des valeurs littérales ne sont
pas touchés.
