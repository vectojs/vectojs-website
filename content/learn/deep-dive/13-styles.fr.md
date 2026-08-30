---
title: '13 — Styles & Thématisation — Parité CSS sur le VMT numérique'
description: "Pourquoi VectoJS style sur le Virtual Math Tree, comment les objets aux noms de propriétés CSS mappent vers les champs numériques des entités, et chaque mécanisme qui les fait ressembler à du CSS sans être du CSS — tokens et résolution var(), fusion css(), composition de fontes, padding par axe, switching atomique de thèmes et les pièges de migration qui gardent l'arbre numérique honnête."
order: 33
---

# 13 — Styles & Thématisation — Parité CSS sur le VMT numérique

> VectoJS n'a pas de feuille de style, pas de cascade, pas de navigateur. Le Virtual Math Tree stocke des nombres — `x`, `width`, `bg`, `font` — pas des chaînes CSS. `@vectojs/styles` est le pont qui vous laisse _écrire_ ces nombres comme s'il s'agissait de CSS et les voir atterrir comme nombres : un objet typé, une table de lookup fixe et un thème à tokens plat qui se re-résout au switch.

- **Ce que vous apprendrez** : pourquoi les styles vivent sur le VMT numérique, comment `Style` mappe vers les champs d'entités, comment les tokens `var(--token)` se résolvent (ancré, embarqué, transitif, avec détection de cycle), comment `css()` fusionne et `style()` type, comment `composeFont` garde les shorthands canvas valides, comment `padding: {x,y}` par axe se ventile, comment `setTheme` swap atomiquement via paires tracées par `WeakRef`, et chaque façon dont migrer des habitudes CSS peut échouer bruyamment au lieu de silencieusement.
- **Ce que vous n'apprendrez pas** : comment le texte est façonné ou layoté (boss 02), comment la scène se salit et rend (boss 06/07), ou comment Markdown thème ses blocs de code (`packages/markdown/src/markdown-presets.ts:281` `resolvePresetTheme` — un système de tokens séparé). Ce doc est la fine peau typée aux noms CSS sur l'arbre numérique.

## 1. Pourquoi les styles sur le VMT — et pourquoi pas CSS

Le VMT stocke la scène comme des nombres. `Entity.x: number` (`packages/core/src/tree/Entity.ts:1`), `UIComponent.paddingX: number` (`packages/ui/src/UIComponent.ts:28`), `Text.font: string` (`packages/ui/src/Text.ts:111`) qui reste un _shorthand de fonte canvas valide_ — pas une règle de feuille de style. Il n'y a pas d'élément DOM dont hériter, pas de cascade à résoudre, pas de sélecteur à matcher. Le moteur de styles du navigateur est absent par design : VectoJS possède la peinture, le hit-test et la projection lui-même, donc il possède aussi le dimensionnement.

`@vectojs/styles` assume cette contrainte au lieu de la combattre :

- Un `Style` est un objet plain (`packages/styles/src/types.ts:16`) avec des clés **optionnelles** — `x?: CssLength` (`types.ts:18`), `backgroundColor?: string` (`types.ts:28`), `fontSize?:`${number}px`` (`types.ts:46`), `display?: 'flex'` (`types.ts:62`). Pas de classe, pas de proxy, pas de registre.
- `applyStyle(entity, style)` (`packages/styles/src/apply.ts:294`) est une **table de lookup fixe** `RULES: Record<string, Rule>` (`apply.ts:54`) qui convertit chaque clé nommée CSS en une écriture numérique/string/booléenne. Chaque clé est énumérée ; une clé inconnue lève (`apply.ts:258`). Pas de parsing, pas d'héritage, pas de `%`.
- Les tokens sont des `Record<string, string|number>` plats (`packages/styles/src/theme.ts:38` `ThemeTokenSet`), référencés comme `var(--key)` dans les valeurs et résolus par substitution de chaînes contre le thème actif — pas par un moteur CSS.
- Le paquet dépend uniquement de `@vectojs/core` (`packages/styles/package.json:14`) et n'a zéro dépendance runtime ; `@vectojs/ui` porte zéro dépendance `@vectojs/styles` (le graphe de dépendances est `core → styles`, l'ingestion est opt-in).

Le gain est le confort de migration — `backgroundColor: 'var(--accent)'` se lit comme du CSS et atterrit pourtant sur `entity.bg: string` (`apply.ts:63`) — tandis que le VMT reste la source unique de vérité. Le prix est que tout ce que CSS fait sans champ numérique adossé _n'existe pas_ et doit échouer bruyamment (voir §10).

## 2. `Style` et la table Rule — chaque clé est un contrat

`CssLength = number |`${number}px`` (`packages/styles/src/types.ts:2`) — les nombres nus sont des px, les chaînes `px` sont parsées en nombres. La distinction ne compte que pour `fontSize`, que le type restreint à `` `${number}px` `` (`types.ts:46`) pour qu'un`16` nu soit une erreur de type — le shorthand de fonte composé doit rester valide.

`Style` (`types.ts:16`) regroupe les clés par ce qu'elles pilotent :

<!-- markdownlint-disable MD060 -->

| Groupe            | Clés                                                                                      | Champ adossé                                                            | Convertisseur                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Géométrie         | `x,y,width,height`                                                                        | identique (`apply.ts:55`)                                               | `isCssLength` (`apply.ts:23`) — nombre ou `/^[+-]?(\d+\.?\d*                                \| \.\d+)px$/` |
| Transform         | `scaleX,scaleY,rotation,opacity`                                                          | identique (`apply.ts:59`)                                               | `isFiniteNumber` (`apply.ts:33`); `rotation` est en **radians** (`types.ts:25`) pas en degrés CSS          |
| Box               | `backgroundColor→bg`, `color`, `borderColor`, `borderRadius→radius`, `padding`            | `apply.ts:63`                                                           | `isString` / `isCssLength`                                                                                 |
| Texte             | `font`, `lineHeight`, `textAlign`                                                         | identique / `textAlign` via `oneOf(['left','justify'])` (`apply.ts:70`) | `types.ts:55` — `center`/`right` sont rejetés bruyamment                                                   |
| Layout            | `display→null`, `flexDirection→direction`, `gap→gap`, `alignItems→align`, `flexWrap→wrap` | `apply.ts:71`                                                           | `oneOf` + remap enum (`row→horizontal`, `flex-start→start`, `wrap→true`)                                   |
| Segments de fonte | `fontFamily,fontSize,fontWeight`                                                          | composés en `font` (`apply.ts:101` `FONT_KEYS`)                         | `composeFont` (`packages/styles/src/font.ts:113`)                                                          |

Trois règles sur ces convertisseurs :

1. **Le skipping cross-component est silencieux.** `write()` vérifie `field in entity` (`apply.ts:186`) ; un `Text` n'a pas de `bg`, un `Button` n'a pas de `textAlign` — la clé est sautée et absente de `AppliedStyle.applied: string[]` (`types.ts:71`). Un même objet style peut être partagé entre composants.
2. **Les erreurs de catégorie lèvent.** Une clé layout sur un non-container (`!('direction' in entity)` à `apply.ts:194` ou `field===null && !('direction' in entity)` à `apply.ts:194`) est une `TypeError` nommant la propriété et `entity.constructor.name` (`apply.ts:189`). Styler un `Text` en `display: flex` est une erreur, pas un no-op.
3. **`display` n'écrit aucun champ.** `field: null` (`apply.ts:72`) — il valide que l'entité _est_ un container et que la valeur est `'flex'` (`apply.ts:74`), puis contribue à `applied` sans toucher l'entité. Le container _est_ déjà flex ; la clé existe pour qu'un style de container mal typé échoue.

La validation est stricte : `isCssLength` rejette `'50%'`, `'8em'` (`packages/styles/test/styles.test.ts:35`), `oneOf` rejette `stretch`/`row-reverse`/`block` (`styles.test.ts:150`), les clés inconnues lèvent `unknown style property 'position'` (`styles.test.ts:159`).

## 3. Le pipeline `applyStyle` — résoudre, puis écrire

```ts
export function applyStyle(entity: Entity, s: Style): AppliedStyle {
  const { style: resolved } = resolveStyle(s, getTheme()); // theme.ts:96 getTheme / apply.ts:162 resolveStyle
  const result = applyStyleResolved(entity, resolved); // apply.ts:180
  trackVarKeys(entity, s); // theme.ts:175 — enregistre les clés var() sous le thème courant
  return result;
}
```

`resolveStyle` (`apply.ts:162`) parcourt l'objet style, appelant `resolveValue(value, theme)` (`apply.ts:137`) par valeur — avec une branche spéciale pour `padding: {x,y}` (`apply.ts:166`) qui résout chaque axe indépendamment. `resolveValue` a quatre branches :

1. Non-string → pass-through.
2. `var(--key)` ancré (`theme.ts:6` `VAR_RE = /^var\(--([\w-]+)\)$/`) → `resolveToken(key, theme, seen)` (`apply.ts:112`) qui cherche `theme.tokens[key]` et récuse transitivement via `resolveValue(token, theme, seen)`.
3. Forme fallback `var(--key, …)` (`theme.ts:24` `HAS_VAR_FALLBACK_RE = /var\(\s*--[\w-]+\s*,/`) → lève `TypeError` nommant la valeur (`apply.ts:148`). Vérifié **avant** le chemin embarqué pour que les composites soient aussi couverts.
4. `var(--key)` embarqué n'importe où (`theme.ts:11` `HAS_VAR_RE = /var\(--([\w-]+)\)/`) → remplacement global via `VAR_REPLACE_RE = /var\(--([\w-]+)\)/g` (`apply.ts:105`) substituant `String(resolveToken(key,…))` par occurrence (`apply.ts:156`).

`applyStyleResolved` (`apply.ts:180`) est l'écriture numérique. Il gère d'abord les deux formes spéciales — `FONT_KEYS` (`apply.ts:207`) via `composeFont` et objets `padding` (`apply.ts:242`) en écrivant `paddingX`/`paddingY` (`apply.ts:248` `isCssLength(v, 'padding.x')`) — puis parcourt `RULES` pour tout le reste via `write()` (`apply.ts:185`). Les styles touchant la fonte posent `fontTouched` et recomposent une fois à la fin (`apply.ts:265` `composeFont(current, fontChanges)`). Quand `applied.length > 0`, `entity.scene?.markDirty()` se déclenche une fois (`apply.ts:271`), honorant le contrat `onDemand`. Pas de scène → pas d'appel dirty (`styles.test.ts:182`).

La valeur de retour est `{ applied: string[] }` (`types.ts:71`) — les noms de propriétés CSS réellement écrits, dans l'ordre de l'objet — pour qu'un appelant puisse brancher sur `applied.includes('padding')` sans ré-inspecter l'entité.

## 4. Système de tokens — `tokens()`, `PRESET_THEMES` et sémantique `var()`

### 4.1 Créer un thème

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

Plat par design — comme `MarkdownTheme` — un seul spread, pas de deep merge, pas de nesting (`theme.ts:35`). `PRESET_THEMES` (`packages/styles/src/presets.ts:12`) livre `light | dark | github | dracula` (`presets.ts:12`), chacun avec `accent/surface/surfaceAlt/text/muted/border/radius-sm/md/lg/font/fontFamily/fontSize/fontWeight/fontMono` (`presets.ts:13`). Un thème appelant est un spread : `tokens({ ...PRESET_THEMES.dark, accent: '#f00' })` (`vectojs-docs/content/reference/styles.md:136`). Les clés sont stockées sans `--` ; les références écrivent `var(--key)` (`theme.ts:28`).

### 4.2 Résolution ancrée, embarquée et transitive

- **Ancrée** — `backgroundColor: 'var(--accent)'` résout la valeur du token directement (`resolveValue` early return à `apply.ts:140`), en préservant son type : un token numérique `gap: 10` reste `number` et alimente `isCssLength` sans stringification. L'identité whole-string est ce qui permet à `gap: 'var(--gap)'` avec `gap: 12` de produire `e.gap === 12` comme nombre (`packages/styles/test/v2.test.ts:70`).
- **Embarquée** — `'rgba(var(--rgb), 0.4)'` avec `rgb: '255, 0, 0'` substitue chaque occurrence via `String(resolveToken(...))` (`apply.ts:157`), donnant `'rgba(255, 0, 0, 0.4)'` (`packages/styles/test/issue-608.test.ts:39`). Deux occurrences du même token partagent une passe de résolution et ne déclenchent pas le détecteur de cycle (`issue-608.test.ts:99` `shadow` avec deux `var(--rgb)`).
- **Transitive** — un token `alias: 'var(--accent)'` avec `accent: '#123456'` résout `var(--alias)` vers `var(--accent)` vers `'#123456'` (`packages/styles/test/v2.test.ts:353`). Les chaînes sont suivies via `resolveValue(token, theme, seen)` à l'intérieur de `resolveToken` (`apply.ts:125`), donc un token composite `surface: 'rgba(var(--rgb), 1)'` avec `rgb: '17, 34, 51'` donne `'rgba(17, 34, 51, 1)'` quand déréférencé comme `var(--surface)` (`issue-608.test.ts:78`).

`resolveToken` porte `seen: Set<string>` (`apply.ts:112`) — le chemin des clés dans la résolution courante. `seen.has(key)` signifie un cycle ; lève `circular var() reference: var(--a) → var(--b) → var(--a)` (`apply.ts:121`). `seen.delete(key)` dans `finally` (`apply.ts:127`) rend les références sœurs au même token indépendantes — `rgba(var(--rgb), var(--rgb))` ferait sinon un faux positif à la seconde occurrence.

### 4.3 Ce qui lève, et pourquoi le silence n'est jamais correct

| Condition                                    | Où                                                                  | Message                                                                           | Pourquoi cela doit lever                                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Token inconnu                                | `resolveToken` `apply.ts:116`                                       | `unknown token 'var(--nope)'`                                                     | Canvas2D garde silencieusement la peinture précédente quand le champ reçoit des données invalides (`v2.test.ts:253`, `issue-608.test.ts:16` miss ancré)                                                                                                                                                            |
| Chaîne circulaire                            | `resolveToken` `apply.ts:121`                                       | `circular var() reference: … → …`                                                 | Une substitution infinie bloquerait ou émettrait le littéral `var(--…)`                                                                                                                                                                                                                                            |
| `var(--k, fallback)` — tout chemin d'arrivée | `resolveValue` `apply.ts:148` + `HAS_VAR_FALLBACK_RE` `theme.ts:24` | `var() fallbacks are not supported — '…' would reach the entity field unresolved` | Ni `VAR_RE` ni `HAS_VAR_RE` ne le match (`)` doit suivre la clé), donc sans cette garde la chaîne brute atteignait les champs mappés tandis que Canvas2D gardait silencieusement l'ancienne valeur et que la clé restait non tracée pour les switches de thème (#645, `packages/styles/test/issue-645.test.ts:40`) |
| `fontSize` nombre nu ou non-px               | `applyStyleResolved` `apply.ts:221` + `apply.ts:232`                | `fontSize resolved to the bare number …` / `expects a px string`                  | Un `16` nu compose `'700 16 Inter'` — Canvas2D le drop silencieusement (`v2.test.ts:254`)                                                                                                                                                                                                                          |
| `fontFamily` qui ressemble à un shorthand    | `applyStyleResolved` `apply.ts:214`                                 | `looks like a font shorthand — reference the 'font' token`                        | `'16px Inter'` fuitant dans `fontFamily` écraserait taille/poids                                                                                                                                                                                                                                                   |

Le détecteur de fallback tolère les espaces après `var(` (`/var\(\s*--/` dans `HAS_VAR_FALLBACK_RE` à `theme.ts:24`) pour que `var( --accent, #fff)` soit aussi attrapé — les espaces égarés sont courants et le détecteur pré-#753 les manquant laissait passer la valeur (`issue-645.test.ts:78`).

La couche type restreint `fontSize` à `` `${number}px` `` (`types.ts:46`) ; les appelants JS et les valeurs de tokens contournent le type, donc le runtime l'impose aussi — `'2em'` depuis un token lève toujours (`issue-608.test.ts:141`).

## 5. Fusion `css()` et typage `style()` — le pattern variant

```ts
export function css<T extends Style>(...styles: Array<T | null | undefined | false>): T {
  // css.ts:17
  const merged: Record<string, unknown> = {};
  for (const s of styles) {
    if (!s) continue; // css.ts:20
    for (const [key, value] of Object.entries(s)) {
      merged[key] =
        key === 'padding' && typeof value === 'object' && value !== null
          ? { ...(value as object) } // css.ts:23 — copie profonde padding par axe
          : value;
    }
  }
  return merged as T;
}
export function style<T extends Style>(s: T): T {
  return s;
} // css.ts:32
```

`style()` est une fabrique identité — type le littéral comme `Style`, le retourne inchangé (`packages/styles/test/styles.test.ts:18`). `css()` est la fusion de variants : les sources ultérieures gagnent, `null`/`undefined`/`false` sont sautés pour que les variants conditionnels soient `css(base, isMuted && muted)` (`css.ts:11`), les entrées ne sont pas mutées (`v2.test.ts:49`), et la seule forme imbriquée — `padding: { x, y }` (`types.ts:34`) — est copiée (`css.ts:23`) pour que muter `merged.padding.x` n'atteigne jamais un variant source (GH-608, `issue-608.test.ts:153`). Remplacer `padding` wholesale est aussi copié — `merged.padding !== override.padding` (`issue-608.test.ts:163`).

## 6. Switching de thème — atomique, tracé, faiblement retenu

### 6.1 Comptabilité

```ts
const current = { theme: DEFAULT_THEME }; // theme.ts:53
const varPairs = new WeakMap<Theme, Map<WeakRef<Entity>, Map<string, unknown>>>(); // theme.ts:70
const entityRefs = new WeakMap<Entity, WeakRef<Entity>>(); // theme.ts:75
```

`varPairs` clé par `Theme` (un thème abandonné est collecté wholesale via `WeakMap`), les valeurs mappent `WeakRef<Entity>` → `Map<string, unknown>` de clés de style tracées vers l'expression `var()` qu'elles référencent — pas l'objet style entier (`theme.ts:59`). Plusieurs styles `var()` sur une entité s'accumulent ; un littéral ultérieur sur la même clé remplace la référence au lieu d'être écrasé au prochain switch (`theme.ts:61`, `packages/styles/test/v2.test.ts:181`).

Les entités sont retenues via `WeakRef`s, pas fortement (`theme.ts:70`) : `Entity.destroy()` n'a pas de hook vers styles (`theme.ts:65`), donc une map interne forte retenait chaque entité stylée pour la durée de vie de son thème et `setTheme` continuait à re-résoudre celles détruites (#644, `packages/styles/test/issue-644.test.ts:49`). Les refs mortes sont balayées durant le parcours ; `untrackVarStyles(entity)` (`theme.ts:160`) est le chemin eager pour les frameworks sachant quand une entité est partie — idempotent, sûr pour entités jamais tracées (`issue-644.test.ts:93`).

`entityRefs: WeakMap<Entity, WeakRef<Entity>>` (`theme.ts:75`) donne un `WeakRef` stable par entité (`theme.ts:77` `refOf`) pour que des styles répétés sur une entité touchent la même entrée de tracking au lieu d'orpheliner des duplicatas inatteignables. L'objet ref lui-même est faiblement retenu et meurt avec l'entité.

`trackVarKeys(entity, style)` (`theme.ts:175`) est appelé par `applyStyle` avec le style d'origine `s` (pas celui résolu) pour que la sémantique d'override littéral soit préservée (`apply.ts:300`) :

- `typeof value === 'string' && HAS_VAR_RE.test(value)` → `keys.set(key, value)` (`theme.ts:181`) — `var()` ancré ou embarqué trace tous deux.
- objet `padding` avec `HAS_VAR_RE` sur l'un des axes → trace la clé entière (`theme.ts:185`).
- Sinon → `keys.delete(key)` (`theme.ts:195`) — le littéral est écrit par l'appelant et ne doit pas être rejoué. `keys.size === 0` élague l'entrée d'entité (`theme.ts:197`).

### 6.2 `setTheme(next)` — dry-run, puis commit

```ts
export function setTheme(next: Theme): void {
  if (next === current.theme) return; // theme.ts:117 — identité, pas deep equal
  const previous = current.theme;
  const pairs = varPairs.get(previous);
  const resolved = new Map<WeakRef<Entity>, Style>();
  if (pairs) {
    for (const [ref, keys] of pairs) {
      const entity = ref.deref();
      if (entity === undefined) {
        pairs.delete(ref);
        continue;
      } // balaye collectés (#644) theme.ts:129
      const style: Style = {};
      for (const [key, expr] of keys) (style as Record<string, unknown>)[key] = expr;
      resolved.set(ref, resolveStyle(style, next).style); // dry-run contre next — lève tant qu'on est encore sur previous
    }
  }
  current.theme = next; // theme.ts:139 — seulement après que chaque dry-run a réussi
  if (pairs) {
    const nextPairs = pairsOf(next);
    for (const [ref, style] of resolved) {
      const entity = ref.deref();
      if (entity === undefined) continue; // collecté entre les passes theme.ts:144
      applyStyleResolved(entity, style); // pas de re-tracking — déjà migré ci-dessous
      nextPairs.set(ref, pairs.get(ref)!); // migre refs vers next theme theme.ts:146
    }
    varPairs.delete(previous); // theme.ts:148
  }
}
```

La garantie d'atomicité (`theme.ts:107`) : chaque style tracé est résolu contre `next` _avant_ que `current.theme` ne bouge. Un token manquant ou une valeur invalide (ex. `--gap: '50%'` à `v2.test.ts:126`, `--radius-md` manquant à `v2.test.ts:139` GH-485) lève alors que la scène, le thème actif et la comptabilité de paires sont tous encore pleinement cohérents sous le thème précédent — jamais à moitié re-stylé. Vérifié par le test GH-485 : un thème `partial` manquant `radius-md` lève, `getTheme() === themeA` tient toujours, aucune entité n'a été re-stylée, et un switch valide ultérieur re-résout toujours chaque paire (`v2.test.ts:137`).

`getTheme(): Theme` (`theme.ts:96`) lit `current.theme` ; `untrackVarStyles` (`theme.ts:160`) drop l'entrée de l'entité sous le thème actif pour que le prochain `setTheme` cesse de la rejouer.

## 7. Composition de fonte et padding par axe — les deux écritures non triviales

### 7.1 `composeFont` — chirurgie sur une chaîne shorthand

Les composants UI portent la fonte entière comme une seule `font: string` (`packages/ui/src/UIComponent.ts:1` via `Entity`, `packages/ui/src/Text.ts:111` `font: string`). Les trois clés nommées CSS ne sont pas des champs indépendants — `applyStyleResolved` parse le shorthand courant, remplace les segments que le style change, et écrit la chaîne recomposée (`apply.ts:207` boucle `FONT_KEYS`, `apply.ts:267` `composeFont(current, fontChanges)`).

`composeFont(current, changes)` (`packages/styles/src/font.ts:113`) délègue à `parse(font)` (`font.ts:73`) qui tokenise sur whitespace (`font.ts:74` `split(/\s+/).filter(Boolean)`), consomme les mots-clés `style`/`variant`/`weight` de tête (`font.ts:40` `parsePrefixes` avec `WEIGHT_RE = /^(normal|bold|bolder|lighter|[1-9]00)$/` à `font.ts:18`, `STYLE_RE` `:19`, `VARIANT_RE` `:20`), matche `SIZE_SLOT_RE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:rem|em|px|pt))(?:\/([^\s/]+))?$/` (`font.ts:26`) au slot taille, et traite le reste comme `family`. La recomposition joint `[style, variant, weight, size[/lineHeight], family]` (`font.ts:103`).

Pourquoi cela compte :

- Grammaire des préfixes : `italic 700 16px Georgia` ou `16px/24px Inter` effondraient auparavant tout autour de la taille dans la famille (`font.ts:14`), donc un changement de segment ultérieur recomposait une chaîne invalide que Canvas2D drop silencieusement. Désormais `fontSize: '20px'` sur `italic 700 16px Georgia` donne `italic 700 20px Georgia` (`issue-608.test.ts:107`) et préserve le line-height `16px/24px` (`issue-608.test.ts:112`).
- Ambiguïté `normal` : `font: normal normal 16px Inter` est du CSS valide ; le premier `normal` remplit `weight`, les suivants remplissent `style` puis `variant` (`font.ts:48`) au lieu de tomber dans le slot taille et lever.
- Échecs bruyants : `ultra-condensed 700 16px serif` avant la taille lève en nommant le segment fautif (`issue-608.test.ts:124`). Les segments ressemblant à une taille qui ne peuvent être placés échouent à `font.ts:91` (`unrecognized segment '…' before the font size`) plutôt que d'être enterrés dans la famille.
- Défauts taille/famille manquants : `parts.size ??= '16px'` et `family ??= 'sans-serif'` (`font.ts:121`) pour qu'un `font: ''` vide plus `fontFamily: 'Inter'` donne `'16px Inter'` (`v2.test.ts:239`), et les shorthands à préfixes nus `italic Georgia` se normalisent en `italic 18px Georgia` (`issue-608.test.ts:129`).
- Enforcement runtime d'unité : `fontSize` arrivant comme `12` (nombre nu depuis un token) lève `unit-bearing token (e.g. '16px')` (`apply.ts:223`), `'2em'` lève `fontSize expects a px string` (`apply.ts:233`), et une `fontFamily` contenant un digit déclenche `looks like a font shorthand` (`apply.ts:214`, `v2.test.ts:272`). Le type `fontSize:`${number}px`` (`types.ts:46`) attrape le cas statique ; le runtime attrape tokens et appelants JS.

### 7.2 Padding par axe — `padding: { x, y }`

`padding?: CssLength | { x?: CssLength; y?: CssLength }` (`types.ts:34`). Les composants Box (`Button`, `Link`, `Card`) portent `padding` (uniforme) plus `paddingX`/`paddingY` (`packages/ui/src/UIComponent.ts:21` / `:28`) : la couche apply écrit les champs par axe quand présents (`apply.ts:248` `paddingX`/`paddingY` via `isCssLength(v, 'padding.x')`), laisse `padding` intact, et rapporte `applied: ['padding']` dans l'ensemble. Sur entités sans champs par axe le style est sauté (`v2.test.ts:329`) — le `padding` de construction dans les options du composant gouverne toujours le sizing intrinsèque ; `padding: {x,y}` post-construction est lu live par les consommateurs inspectant `paddingX`/`paddingY` (ex. layout `Card`), pas en re-mesurant la boîte.

Les références de tokens à l'intérieur de l'objet se résolvent par axe (`apply.ts:168` `resolveValue(pad.x, theme)`), et `trackVarKeys` trace la clé entière quand l'un des axes référence un token (`theme.ts:189`). Une valeur d'axe invalide lève en nommant `padding.x` (`v2.test.ts:336`).

## 8. Comment UI et core le consomment

Aucun composant UI n'importe `@vectojs/styles` au runtime — les styles leur sont appliqués, pas _par_ eux. Les composants exposent des champs numériques typés qui se trouvent être les cibles d'écriture de la table Rule :

- **Géométrie** — chaque `Entity` a `x/y/width/height/opacity/scaleX/scaleY/rotation` — `Text` et `Button` s'appuient directement dessus.
- **Box** — `UIComponent` (`packages/ui/src/UIComponent.ts:19`) possède `padding`, `paddingX`, `paddingY` ; `Button` (`packages/ui/src/Button.ts:19`) possède `bg` (`backgroundColor` → `bg` à `apply.ts:63`), `color`, `borderColor`, `radius` (`borderRadius`), plus `font` pour son centrage de label (`Button.ts:80` `measureText(label, font)`). `Card`, `Link`, `Tabs` suivent les mêmes champs box.
- **Texte** — `Text` (`packages/ui/src/Text.ts:18` `TextOptions`) possède `font`, `color`, `lineHeight`, `textAlign` (`'left'|'justify'` — `Text.ts:42`) ; sa `fontSize` est extraite via `fontSizePx(font)` (`packages/ui/src/measure.ts:27`) qui scanne le token `px` par `indexOf('px')` plutôt qu'une regex avec quantifieurs adjacents de classe digit (même hygiène ReDoS que `font.ts:26` `SIZE_SLOT_RE`). `familyOf(font)` (`measure.ts:57`) décompose le même shorthand pour mesure par famille.
- **Layout** — `Stack` (`packages/ui/src/Stack.ts:10`) possède `direction→flexDirection`, `gap`, `align→alignItems`, `wrap→flexWrap` ; `Flow` est le container sibling. Seuls ces deux acceptent les clés container-only — toute autre entité lève (`packages/styles/test/styles.test.ts:144`).

Les entités texte core (`packages/core/src/text/MSDFTextEntity.ts:1` `MSDFTextEntity`, `SVGEntity`) ne sont pas stylées via ce paquet dans le codebase actuel — leur `font`/`maxWidth`/`lineHeight` sont pilotés par `MSDFFont` et `LayoutWorkerManager` (boss 02). Appliquer `fontSize: '20px'` à une `MSDFTextEntity` toucherait encore `composeFont` mais il n'existe pas de site d'appel `applyStyle` pour elle aujourd'hui ; l'interaction texte du chapitre est au niveau du contrat de mesure (mesurez où vous peignez, `packages/text/src/measureContext.ts:87` `getSharedMeasuringContext`).

`measure.ts` possède aussi l'invalidation de métriques de fontes avec laquelle les styles interagissent indirectement : les loads de webfonts déclenchent `notifyFontMetricsChanged` (`measure.ts:111`) qui vide le LRU et notifie les abonnés `UIComponent.watchFontMetrics(handler)` (`UIComponent.ts:128`) — `Text` et `Button` re-mesurent leurs largeurs intrinsèques et `markDirty`. Les styles n'ont pas besoin d'être réappliqués après un load de webfont ; les propres handlers `watchFontMetrics` des entités gardent la géométrie correcte.

## 9. Migrer depuis les habitudes CSS vers le VMT — chaque échec silencieux rendu bruyant

La doctrine du paquet (GH-608, `packages/styles/src/theme.ts:20` « doctrine GH-608 ») est qu'une forme `var()` non reconnue ne doit jamais passer silencieusement — la seule chose que ce paquet ne doit pas faire est de remettre à Canvas2D une chaîne qu'il ignore silencieusement. Cette doctrine s'étend à chaque habitude CSS sans contrepartie VMT :

| Habitude CSS                                                                 | Ce qui se passe                                                                                                                                      | Pourquoi                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `width: '50%'`, `gap: '8em'`, `radius: '50%'`                                | `TypeError: width expects a bare number or a px string` (`apply.ts:29`)                                                                              | Seules les unités px existent sur le VMT ; `%`/`em`/`rem` n'ont pas de champ adossé (voir `vectojs-docs/content/reference/styles.md:193`). Des gaps en pourcent nécessiteraient un containing block que le VMT ne calcule jamais.                                                                                        |
| `textAlign: 'center' \| 'right'`                                             | `TypeError: textAlign expects one of left \| justify` (`apply.ts:50`, `styles.test.ts:87`)                                                           | `Text`/`RichText`/`TextEntity` et le moteur de layout (`LayoutEngine.textAlign` à `packages/layout/src/LayoutEngine.ts:1`) implémentent `left` et `justify` seulement — `center`/`right` ne peuvent être honorés et ne doivent pas rendre silencieusement comme `left` (`vectojs-docs/content/reference/styles.md:208`). |
| `var(--token, fallback)`                                                     | `TypeError: var() fallbacks are not supported — 'var(--accent, #fff)' would reach the entity field unresolved` (`apply.ts:149`)                      | La résolution de fallback n'est pas implémentée ; la chaîne brute atteindrait Canvas2D qui garde silencieusement la peinture précédente, et la clé resterait non tracée pour `setTheme` (#645, `issue-645.test.ts:33`).                                                                                                  |
| `rotation: '30deg'` ou `30` nu                                               | Écrit comme nombre seulement (`isFiniteNumber` à `apply.ts:33`) et interprété en **radians** (`types.ts:25`). `rotate(30deg)` doit être `Math.PI/6`. | Chaque autre surface de rotation VectoJS est en radians ; la couche style n'introduit pas une seconde unité.                                                                                                                                                                                                             |
| `display: 'block'`, `flexDirection: 'row-reverse'`                           | `TypeError: display expects one of flex` (`apply.ts:50`, `styles.test.ts:152`)                                                                       | Seuls les containers `flex` existent ; `block`/`grid` n'ont pas de sens pour un `Stack`/`Flow` qui _est déjà_ flex.                                                                                                                                                                                                      |
| `gap` / `alignItems` sur un `Text`                                           | `TypeError: 'gap' is a container-only property and Text is not a container` (`apply.ts:189`, `styles.test.ts:144`)                                   | Erreur de catégorie, pas un no-op silencieux.                                                                                                                                                                                                                                                                            |
| `position: 'absolute'`, `transform`, `justifyContent`, `border: '1px solid'` | `unknown style property 'position'` (`apply.ts:258`, `styles.test.ts:159`)                                                                           | Pas de champ où écrire ; les ajouter réintroduirait la machinerie cascade/margin-collapse que le VMT existe pour supprimer (`vectojs-docs/content/reference/styles.md:198`).                                                                                                                                             |
| `fontSize: 16` (nombre nu) ou `fontSize: '2em'`                              | `bare number` / `expects a px string like '16px'` (`apply.ts:223` / `:233`)                                                                          | Les shorthands de fonte canvas requièrent une taille avec unité ; un nombre nu compose un shorthand invalide que Canvas2D drop silencieusement (`v2.test.ts:244`, `issue-608.test.ts:137`).                                                                                                                              |
| `fontFamily: '16px Inter'`                                                   | `looks like a font shorthand — reference the 'font' token` (`apply.ts:214`, `v2.test.ts:272`)                                                        | Empêche un shorthand complet de fuir dans le slot famille et d'écraser taille/poids.                                                                                                                                                                                                                                     |

Le fil commun : chaque levée nomme la propriété CSS et renvoie la valeur (`apply.ts:29` `JSON.stringify(value)`), pour qu'un grep du message trouve le site d'appel migrant. Un style qui _passe_ la validation produit toujours un shorthand de fonte canvas valide et un nombre que le VMT peut peindre — il n'existe aucun chemin où une mauvaise valeur peint silencieusement l'état de la frame précédente.

## 10. Parties difficiles — avec reçus

| Piège                                                                                                               | Où                                                           | Statut                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `rgba(var(--rgb), 0.4)` écrit comme chaîne brute — Canvas2D gardait silencieusement l'ancien fill                   | `apply.ts:133` (GH-608), `issue-608.test.ts:37`              | Corrigé : `var()` embarqué substitué via `VAR_REPLACE_RE` (`apply.ts:105`)                                        |
| Préfixe taille `italic 700 16px` effondré dans la famille à la recomposition                                        | `font.ts:14` (GH-608)                                        | Corrigé : parser complet `[style\|variant\|weight]? size[/line-height]? family` (`font.ts:40` `parsePrefixes`)    |
| Segment line-height `16px/24px` perdu au changement `fontSize`                                                      | `font.ts:26` `SIZE_SLOT_RE`                                  | Corrigé : capture `size/lineHeight` et ré-émission (`font.ts:80` / `:102`)                                        |
| `fontSize` acceptant `'2em'`/`2rem` et composant un shorthand que Canvas2D drop                                     | `apply.ts:232` (GH-608)                                      | Corrigé : enforcement runtime `px` (`apply.ts:232`, `issue-608.test.ts:137`)                                      |
| `css()` partageant le même objet `padding: {x,y}` entre variants                                                    | `css.ts:23` (GH-608)                                         | Corrigé : copie par axe (`css.ts:23`, `issue-608.test.ts:153`)                                                    |
| `var(--token, fallback)` passant non résolu                                                                         | `theme.ts:24` `HAS_VAR_FALLBACK_RE` (#645)                   | Corrigé : détecté avant substitution embarquée et levé (`apply.ts:147`, `issue-645.test.ts:30`)                   |
| `var( --token, fb)` avec espace égaré échappant la garde fallback                                                   | `theme.ts:24` `/var\(\s*--/` (#753)                          | Corrigé : espace après `var(` autorisé (`issue-645.test.ts:78`)                                                   |
| Chaînes token-ref→token fuitant le littéral `var(--…)` dans les champs string                                       | `apply.ts:112` `resolveToken` (GH-452/608)                   | Corrigé : `resolveValue` transitif avec set `seen` de cycle (`apply.ts:125`)                                      |
| `setTheme` re-stylant à moitié sur token manquant                                                                   | `theme.ts:107` dry-run (GH-485, `v2.test.ts:137`)            | Corrigé : resolve-all-before-commit, `current.theme` ne bouge qu'après chaque dry-run                             |
| Entités stylées retenues pour toujours — `WeakMap<Theme, Map<Entity,…>>` retenait fortement                         | `theme.ts:70` `WeakRef` (#644)                               | Corrigé : `WeakMap<Theme, Map<WeakRef<Entity>,…>>` + `refOf` (`theme.ts:77`) + sweep au parcours (`theme.ts:129`) |
| `css()` partageant le même objet `padding` alors que la clé de tracking `var()` est supprimée sur override littéral | `theme.ts:195` `keys.delete(key)` (GH-451, `v2.test.ts:181`) | Corrigé : `Map<string,unknown>` par clé plutôt que tracking par objet                                             |
| Token `fontSize` nombre nu `bad-size: 12` composant `'700 12 Inter'` silencieusement                                | `apply.ts:221` garde nombre nu                               | Corrigé : `fontSize resolved to the bare number 12 — use a unit-bearing token` (`v2.test.ts:244`)                 |
| ReDoS polynomial `SIZE_SLOT_RE` sur classes digit adjacentes `\d+\.?\d*`                                            | `font.ts:26` `SIZE_SLOT_RE` safe (`v2.test.ts:258`)          | Corrigé : pas de quantifieurs adjacents même classe, alternatives d'unités plus longues d'abord (`font.ts:22`)    |
| `Text` hardcodé `textAlign: 'center'` depuis une feuille migrée                                                     | `styles.test.ts:87`                                          | Par design : lève — `center`/`right` n'ont pas de backing d'entité ; migrez vers `left`+layout ou `justify`       |

## 11. Checklist — avant de lander un changement de styles

1. **Ne jamais aliaser la forme imbriquée.** Un `Style` porte au plus un objet imbriqué (`padding: {x,y}` à `types.ts:34`) ; `css()` doit le copier (`css.ts:23`) et toute nouvelle clé imbriquée a besoin du même traitement ou les fusions de variants fuient.
2. **Enforcez les unités au runtime, pas seulement dans les types.** `` fontSize: `${number}px` `` (`types.ts:46`) attrape `16` à la compilation, mais tokens et appelants JS le contournent — `apply.ts:221` / `232` doivent toujours lever.
3. **Gardez la résolution de tokens atomique.** Le dry-run de `setTheme` (`theme.ts:124` `resolveStyle(style, next)`) doit couvrir chaque clé tracée avant que `current.theme` ne bouge ; une valeur qui échoue la validation au switch ne doit pas re-styler la scène à moitié (`v2.test.ts:137` GH-485).
4. **Retenez les entités faiblement.** `varPairs` doit rester `WeakMap<Theme, Map<WeakRef<Entity>,…>>` (`theme.ts:70`) et balayer `ref.deref() === undefined` (`theme.ts:129`) — `Entity.destroy()` ne peut appeler `untrackVarStyles` car `core` n'a pas de dépendance sur `styles` (`theme.ts:65`).
5. **Tracez par clé, pas par objet.** `trackVarKeys` (`theme.ts:175`) compare les clés du style _courant_ contre la `Map<string,unknown>` stockée — un littéral ultérieur sur la même clé doit la `delete` (`theme.ts:195`) ou le replay var l'écrase (`v2.test.ts:181` GH-451).
6. **Gardez le parser de fontes et la garde `isCssLength` synchronisés.** `SIZE_SLOT_RE` (`font.ts:26`) et `isCssLength` (`apply.ts:23`) partagent la même forme de chaîne `px` ; diverger laisse l'un accepter ce que l'autre rejette et compose un shorthand invalide que Canvas2D drop silencieusement.
7. **Échouez bruyamment sur les formes inconnues.** Toute nouvelle syntaxe `var()`, nouvelle clé CSS ou nouvelle propriété container-only doit lever avec nom de propriété et valeur (`apply.ts:29` `JSON.stringify(value)`) — la doctrine GH-608 que le silence est la seule chose que ce paquet ne doit pas faire avec une forme non reconnue.

---

_Série : 00 Overview → 01 Selection → 02 Text+Layout → 03 Projection+Virtualization → 04 Streaming Markdown → 05 TeX → 06 VMT Runtime → 07 Renderer → 08 WASM G1/G2/G3 → 09 Three/XR → 10 Export vidéo → 11 Agencement de graphes → 12 DevTools → **13 Styles & Thématisation** → 99 Synthesis._
