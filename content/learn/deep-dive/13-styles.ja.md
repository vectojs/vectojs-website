---
title: '13 — スタイルとテーマ — 数値 VMT 上の CSS 互換'
description: 'なぜ VectoJS のスタイルが Virtual Math Tree 上にあるのか、CSS プロパティ名のオブジェクトがどのように数値 Entity フィールドにマッピングされるのか、そしてそれらを CSS のように感じさせつつ CSS ではないものにするすべての仕組み — トークンと var() 解決、css() マージ、フォント合成、軸ごとの padding、不可分なテーマ切り替え、そして数値ツリーを正直に保つ移行の落とし穴。'
order: 33
---

# 13 — スタイルとテーマ — 数値 VMT 上の CSS 互換

> VectoJS にはスタイルシートも、カスケードも、ブラウザもない。Virtual Math Tree は数値を保持する — `x`、`width`、`bg`、`font` — CSS 文字列ではない。`@vectojs/styles` はそれらの数値を CSS であるかのように**書ける**ようにしつつ、依然として数値として着地させる橋渡しである: 型付きオブジェクト、固定されたルックアップテーブル、そして切り替え時に再解決されるフラットなトークンテーマ。

- **学べること**: なぜスタイルが数値 VMT 上にあるのか、`Style` がどのように Entity フィールドにマッピングされるのか、`var(--token)` トークンがどのように解決されるのか（アンカー付き、埋め込み、推移的、サイクル検出付き）、`css()` がどのようにマージし `style()` がどのように型付けするのか、`composeFont` がどのように canvas ショートハンドを有効に保つのか、軸ごとの `padding: {x,y}` がどのように扇状に広がるのか、`setTheme` が `WeakRef` 追跡されたペアでどのように不可分に交換するのか、そして CSS 習慣の移行が静かにではなく大声で失敗しうるすべての方法。
- **学べないこと**: テキストがどのように整形・レイアウトされるか（ボス 02）、シーンがどのように dirty 化・レンダリングされるか（ボス 06／07）、Markdown がどのようにコードブロックをテーマ化するか（`packages/markdown/src/markdown-presets.ts:281` `resolvePresetTheme` — 別のトークンシステム）。本ドキュメントは数値ツリー上の薄く型付けされた CSS 名のスキンである。

## 1. なぜ VMT 上のスタイルなのか — そしてなぜ CSS ではないのか

VMT はシーンを数値として保持する。`Entity.x: number`（`packages/core/src/tree/Entity.ts:1`）、`UIComponent.paddingX: number`（`packages/ui/src/UIComponent.ts:28`）、`Text.font: string`（`packages/ui/src/Text.ts:111`）は依然として**有効な canvas フォントショートハンド**である — スタイルシートルールではない。継承すべき DOM 要素はなく、解決すべきカスケードも、マッチさせるセレクタもない。ブラウザのスタイルエンジンは設計上不在である: VectoJS はペイント、ヒットテスト、投影を自前で所有するため、サイジングも自前で所有する。

`@vectojs/styles` はその制約に抗うのではなく寄りかかる:

- `Style` は**任意**キーのプレーンオブジェクトである（`packages/styles/src/types.ts:16`）— `x?: CssLength`（`types.ts:18`）、`backgroundColor?: string`（`types.ts:28`）、`fontSize?:`${number}px``（`types.ts:46`）、`display?: 'flex'`（`types.ts:62`）。クラスも、プロキシも、レジストリもない。
- `applyStyle(entity, style)`（`packages/styles/src/apply.ts:294`）は各 CSS 名のキーを 1 つの数値／文字列／boolean 書き込みに変換する**固定ルックアップテーブル** `RULES: Record<string, Rule>`（`apply.ts:54`）である。すべてのキーは列挙される; 不明なキーは throw する（`apply.ts:258`）。パースも、継承も、`%` もない。
- トークンはフラットな `Record<string, string|number>`（`packages/styles/src/theme.ts:38` `ThemeTokenSet`）であり、値の中で `var(--key)` として参照され、CSS エンジンではなくアクティブなテーマに対する文字列置換で解決される。
- パッケージは `@vectojs/core` のみに依存し（`packages/styles/package.json:14`）、ランタイム依存はゼロである; `@vectojs/ui` は `@vectojs/styles` 依存をゼロで持つ（依存グラフは `core → styles`、取り込みはオプトイン）。

得られるものは移行の快適さである — `backgroundColor: 'var(--accent)'` は CSS のように読め、依然として `entity.bg: string`（`apply.ts:63`）に着地する — 一方で VMT は唯一の真実の源のままである。代償は、CSS が行うことで数値バッキングフィールドを持たないものは**存在せず**大声で失敗しなければならないことである（§10 を参照）。

## 2. `Style` と Rule テーブル — すべてのキーは契約である

`CssLength = number |`${number}px``（`packages/styles/src/types.ts:2`）— 素の数値は px、`px` 文字列は数値にパースされる。区別が重要になるのは `fontSize` のみであり、型は `` `${number}px` ``（`types.ts:46`）に絞られるため素の`16` は型エラーである — 合成されたフォントショートハンドは有効なままでなければならない。

`Style`（`types.ts:16`）はキーを何を駆動するかでグループ化する:

<!-- markdownlint-disable MD060 -->

| グループ        | キー                                                                                      | バッキングフィールド                                                     | コンバータ                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Geometry        | `x,y,width,height`                                                                        | 同じ（`apply.ts:55`）                                                    | `isCssLength`（`apply.ts:23`）— 数値または `/^[+-]?(\d+\.?\d* \| \.\d+)px$/`                   |
| Transform       | `scaleX,scaleY,rotation,opacity`                                                          | 同じ（`apply.ts:59`）                                                    | `isFiniteNumber`（`apply.ts:33`）; `rotation` は CSS の度ではなく**ラジアン**（`types.ts:25`） |
| Box             | `backgroundColor→bg`、`color`、`borderColor`、`borderRadius→radius`、`padding`            | `apply.ts:63`                                                            | `isString` ／ `isCssLength`                                                                    |
| Text            | `font`、`lineHeight`、`textAlign`                                                         | 同じ ／ `textAlign` は `oneOf(['left','justify'])` 経由（`apply.ts:70`） | `types.ts:55` — `center`／`right` は大声で拒否される                                           |
| Layout          | `display→null`、`flexDirection→direction`、`gap→gap`、`alignItems→align`、`flexWrap→wrap` | `apply.ts:71`                                                            | `oneOf` ＋ enum 再マップ（`row→horizontal`、`flex-start→start`、`wrap→true`）                  |
| Font セグメント | `fontFamily,fontSize,fontWeight`                                                          | `font` に合成（`apply.ts:101` `FONT_KEYS`）                              | `composeFont`（`packages/styles/src/font.ts:113`）                                             |

それらのコンバータについての 3 つのルール:

1. **コンポーネント間のスキップは静かである。** `write()` は `field in entity`（`apply.ts:186`）をチェックする; `Text` は `bg` を持たず、`Button` は `textAlign` を持たない — キーはスキップされ `AppliedStyle.applied: string[]`（`types.ts:71`）には現れない。1 つのスタイルオブジェクトをコンポーネント間で共有できる。
2. **カテゴリエラーは throw する。** 非コンテナ上のレイアウトキー（`!('direction' in entity)` は `apply.ts:194`、または `field===null && !('direction' in entity)` は `apply.ts:194`）はプロパティと `entity.constructor.name` を名指しする `TypeError` である（`apply.ts:189`）。`Text` を `display: flex` としてスタイルすることは no-op ではなく間違いである。
3. **`display` はフィールドに書き込まない。** `field: null`（`apply.ts:72`）— それは Entity がコンテナであることと値が `'flex'` であることを検証し（`apply.ts:74`）、Entity に触れずに `applied` に寄与する。コンテナはすでに flex である; キーが存在するのは、誤って型付けされたコンテナスタイルが失敗するようにするためである。

検証は厳格である: `isCssLength` は `'50%'`、`'8em'` を拒否する（`packages/styles/test/styles.test.ts:35`）、`oneOf` は `stretch`／`row-reverse`／`block` を拒否する（`styles.test.ts:150`）、不明なキーは `unknown style property 'position'` で throw する（`styles.test.ts:159`）。

## 3. `applyStyle` パイプライン — 解決してから書き込む

```ts
export function applyStyle(entity: Entity, s: Style): AppliedStyle {
  const { style: resolved } = resolveStyle(s, getTheme()); // theme.ts:96 getTheme / apply.ts:162 resolveStyle
  const result = applyStyleResolved(entity, resolved); // apply.ts:180
  trackVarKeys(entity, s); // theme.ts:175 — 現在のテーマ配下で var() キーを登録
  return result;
}
```

`resolveStyle`（`apply.ts:162`）はスタイルオブジェクトを歩き、値ごとに `resolveValue(value, theme)`（`apply.ts:137`）を呼ぶ — `padding: {x,y}`（`apply.ts:166`）用の特別な分岐があり各軸を独立して解決する。`resolveValue` は 4 つの分岐を持つ:

1. 非文字列 → そのまま通す。
2. アンカー付き `var(--key)`（`theme.ts:6` `VAR_RE = /^var\(--([\w-]+)\)$/`）→ `resolveToken(key, theme, seen)`（`apply.ts:112`）は `theme.tokens[key]` をルックアップし `resolveValue(token, theme, seen)` 経由で推移的に再帰する。
3. フォールバック形式 `var(--key, …)`（`theme.ts:24` `HAS_VAR_FALLBACK_RE = /var\(\s*--[\w-]+\s*,/`）→ 値を名指しして `TypeError` を throw する（`apply.ts:148`）。複合もカバーするため埋め込みパスの**前**にチェックされる。
4. 埋め込み `var(--key)` がどこかにある（`theme.ts:11` `HAS_VAR_RE = /var\(--([\w-]+)\)/`）→ `VAR_REPLACE_RE = /var\(--([\w-]+)\)/g`（`apply.ts:105`）経由でグローバル置換し、出現ごとに `String(resolveToken(key,…))` を置換する（`apply.ts:156`）。

`applyStyleResolved`（`apply.ts:180`）は数値書き込みである。2 つの特殊な形状を最初に扱う — `FONT_KEYS`（`apply.ts:207`）は `composeFont` 経由、`padding` オブジェクト（`apply.ts:242`）は `paddingX`／`paddingY`（`apply.ts:248` `isCssLength(v, 'padding.x')`）を書き込むことで — その後 `RULES` のそれ以外を `write()`（`apply.ts:185`）経由で歩く。フォントに触れるスタイルは `fontTouched` をセットし最後に一度だけ再合成する（`apply.ts:265` `composeFont(current, fontChanges)`）。`applied.length > 0` のとき `entity.scene?.markDirty()` が一度だけ発火する（`apply.ts:271`）、`onDemand` 契約を尊重して。シーンなし → dirty 呼び出しなし（`styles.test.ts:182`）。

戻り値は `{ applied: string[] }`（`types.ts:71`）— 実際に書き込まれた CSS プロパティ名をオブジェクト順で — 呼び出し元は Entity を再検査せずに `applied.includes('padding')` で分岐できる。

## 4. トークンシステム — `tokens()`、`PRESET_THEMES`、`var()` 意味論

### 4.1 テーマの作成

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

意図的にフラット — `MarkdownTheme` と同様 — 単一スプレッド、深いマージなし、ネストなし（`theme.ts:35`）。`PRESET_THEMES`（`packages/styles/src/presets.ts:12`）は `light | dark | github | dracula`（`presets.ts:12`）を出荷し、それぞれ `accent/surface/surfaceAlt/text/muted/border/radius-sm/md/lg/font/fontFamily/fontSize/fontWeight/fontMono`（`presets.ts:13`）を持つ。呼び出し元テーマはスプレッドである: `tokens({ ...PRESET_THEMES.dark, accent: '#f00' })`（`vectojs-docs/content/reference/styles.md:136`）。キーは `--` なしで保存される; 参照は `var(--key)` と書く（`theme.ts:28`）。

### 4.2 アンカー付き、埋め込み、推移的解決

- **アンカー付き** — `backgroundColor: 'var(--accent)'` はトークン値を直接解決する（`apply.ts:140` での `resolveValue` 早期リターン）、その型を保持する: 数値トークン `gap: 10` は `number` のまま `isCssLength` に文字列化なしで流れる。文字列全体の同一性が `gap: 'var(--gap)'` で `gap: 12` が `e.gap === 12` を数値として生むことを可能にする（`packages/styles/test/v2.test.ts:70`）。
- **埋め込み** — `'rgba(var(--rgb), 0.4)'` は `rgb: '255, 0, 0'` で `String(resolveToken(...))`（`apply.ts:157`）経由で各出現を置換し、`'rgba(255, 0, 0, 0.4)'` を生む（`packages/styles/test/issue-608.test.ts:39`）。同じトークンの 2 つの出現は 1 つの解決パスを共有しサイクル検出器に引っかからない（`issue-608.test.ts:99` 2 つの `var(--rgb)` を持つ `shadow`）。
- **推移的** — トークン `alias: 'var(--accent)'` は `accent: '#123456'` で `var(--alias)` を `var(--accent)` → `'#123456'` に解決する（`packages/styles/test/v2.test.ts:353`）。チェーンは `resolveToken` 内の `resolveValue(token, theme, seen)` 経由で辿られる（`apply.ts:125`）ため、複合トークン `surface: 'rgba(var(--rgb), 1)'` は `rgb: '17, 34, 51'` で `var(--surface)` として間接参照されたときに `'rgba(17, 34, 51, 1)'` を生む（`issue-608.test.ts:78`）。

`resolveToken` は `seen: Set<string>`（`apply.ts:112`）を運ぶ — 現在の解決におけるキーのパスである。`seen.has(key)` はサイクルを意味する; `circular var() reference: var(--a) → var(--b) → var(--a)` を throw する（`apply.ts:121`）。`finally` での `seen.delete(key)`（`apply.ts:127`）は同じトークンへの兄弟参照を独立させる — `rgba(var(--rgb), var(--rgb))` はさもなければ 2 回目の出現で誤検出する。

### 4.3 何が throw し、なぜ沈黙は決して正しくないのか

| 条件                                      | 場所                                                                 | メッセージ                                                                        | なぜ throw しなければならないのか                                                                                                                                                                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 不明なトークン                            | `resolveToken` `apply.ts:116`                                        | `unknown token 'var(--nope)'`                                                     | フィールドがゴミを受け取ると Canvas2D は静かに以前のペイントを保持する（`v2.test.ts:253`、`issue-608.test.ts:16` アンカー付きミス）                                                                                                                                             |
| 循環チェーン                              | `resolveToken` `apply.ts:121`                                        | `circular var() reference: … → …`                                                 | 無限置換はハングするかリテラル `var(--…)` を出力する                                                                                                                                                                                                                            |
| `var(--k, fallback)` — あらゆる到達パス   | `resolveValue` `apply.ts:148` ＋ `HAS_VAR_FALLBACK_RE` `theme.ts:24` | `var() fallbacks are not supported — '…' would reach the entity field unresolved` | `VAR_RE` も `HAS_VAR_RE` もそれにマッチしない（`)` はキーの後に来なければならない）ため、このガードなしでは生文字列がマップされたフィールドに到達し、Canvas2D は静かに古い値を保持し、キーはテーマ切り替え用に追跡されない（#645、`packages/styles/test/issue-645.test.ts:40`） |
| `fontSize` の素の数値または非 px          | `applyStyleResolved` `apply.ts:221` ＋ `apply.ts:232`                | `fontSize resolved to the bare number …` ／ `expects a px string`                 | 素の `16` は `'700 16 Inter'` を合成する — Canvas2D はそれを静かに落とす（`v2.test.ts:254`）                                                                                                                                                                                    |
| ショートハンドのように見える `fontFamily` | `applyStyleResolved` `apply.ts:214`                                  | `looks like a font shorthand — reference the 'font' token`                        | `'16px Inter'` が `fontFamily` に漏れるとサイズ／ウェイトが破棄される                                                                                                                                                                                                           |

フォールバック検出器は `var(` の後の空白を許容する（`theme.ts:24` の `HAS_VAR_FALLBACK_RE` における `/var\(\s*--/`）ため `var( --accent, #fff)` も捕捉される — 余分な空白は一般的であり、#753 以前の検出器がそれを逃すと値がすり抜けた（`issue-645.test.ts:78`）。

型層は `fontSize` を `` `${number}px` ``（`types.ts:46`）に絞る; JS 呼び出し元とトークン値は型をバイパスするため、ランタイムもそれを強制する — トークンからの `'2em'` も依然として throw する（`issue-608.test.ts:141`）。

## 5. `css()` マージと `style()` 型付け — バリアントパターン

```ts
export function css<T extends Style>(...styles: Array<T | null | undefined | false>): T {
  // css.ts:17
  const merged: Record<string, unknown> = {};
  for (const s of styles) {
    if (!s) continue; // css.ts:20
    for (const [key, value] of Object.entries(s)) {
      merged[key] =
        key === 'padding' && typeof value === 'object' && value !== null
          ? { ...(value as object) } // css.ts:23 — 軸ごとの padding ディープコピー
          : value;
    }
  }
  return merged as T;
}
export function style<T extends Style>(s: T): T {
  return s;
} // css.ts:32
```

`style()` は恒等ファクトリである — リテラルを `Style` として型付けし、変更せずに返す（`packages/styles/test/styles.test.ts:18`）。`css()` はバリアントマージである: 後のソースが勝ち、`null`／`undefined`／`false` はスキップされるため条件付きバリアントは `css(base, isMuted && muted)`（`css.ts:11`）、入力は変更されない（`v2.test.ts:49`）、そして 1 つのネスト形状 — `padding: { x, y }`（`types.ts:34`）— はコピーされる（`css.ts:23`）ため `merged.padding.x` の変更がソースバリアントに到達することは決してない（GH-608、`issue-608.test.ts:153`）。`padding` 全体を置換する場合もコピーされる — `merged.padding !== override.padding`（`issue-608.test.ts:163`）。

## 6. テーマ切り替え — 不可分、追跡、弱く保持

### 6.1 簿記

```ts
const current = { theme: DEFAULT_THEME }; // theme.ts:53
const varPairs = new WeakMap<Theme, Map<WeakRef<Entity>, Map<string, unknown>>>(); // theme.ts:70
const entityRefs = new WeakMap<Entity, WeakRef<Entity>>(); // theme.ts:75
```

`varPairs` は `Theme` をキーとする（破棄されたテーマは `WeakMap` 経由でまとめて回収される）、値は `WeakRef<Entity>` → 追跡されたスタイル**キー**からそれが参照する `var()` 式への `Map<string, unknown>` — スタイルオブジェクト全体ではない（`theme.ts:59`）。1 つの Entity 上の複数の `var()` スタイルは蓄積する; 同じキー上の後のリテラルは次の切り替えで潰されるのではなく参照を置換する（`theme.ts:61`、`packages/styles/test/v2.test.ts:181`）。

Entity は強くではなく `WeakRef` を通じて保持される（`theme.ts:70`）: `Entity.destroy()` はスタイルに戻るフックを持たない（`theme.ts:65`）ため、強い内部マップはスタイルされたすべての Entity をそのテーマの寿命の間保持し、`setTheme` は破棄されたものを再解決し続けた（#644、`packages/styles/test/issue-644.test.ts:49`）。死んだ参照は走査中に掃除される; `untrackVarStyles(entity)`（`theme.ts:160`）は Entity がいつ消えたかを知っているフレームワーク向けの eager パスである — 冪等であり、追跡されたことのない Entity でも安全である（`issue-644.test.ts:93`）。

`entityRefs: WeakMap<Entity, WeakRef<Entity>>`（`theme.ts:75`）は Entity ごとに安定した `WeakRef` を与える（`theme.ts:77` `refOf`）ため、1 つの Entity 上の繰り返しスタイルが到達不能な重複を孤立させるのではなく同じ追跡エントリにヒットする。ref オブジェクト自体は弱く保持され Entity とともに死ぬ。

`trackVarKeys(entity, style)`（`theme.ts:175`）はリテラル上書き意味論が保持されるよう、解決されたものではなく**元の**スタイル `s` で `applyStyle` から呼ばれる（`apply.ts:300`）:

- `typeof value === 'string' && HAS_VAR_RE.test(value)` → `keys.set(key, value)`（`theme.ts:181`）— アンカー付きまたは埋め込み `var()` の両方が追跡される。
- いずれかの軸に `HAS_VAR_RE` を持つ `padding` オブジェクト → キー全体を追跡する（`theme.ts:185`）。
- そうでなければ → `keys.delete(key)`（`theme.ts:195`）— リテラルは呼び出し元によって書き込まれ、次の切り替えでリプレイされてはならない。`keys.size === 0` は Entity エントリを枝刈りする（`theme.ts:197`）。

### 6.2 `setTheme(next)` — ドライランしてからコミット

```ts
export function setTheme(next: Theme): void {
  if (next === current.theme) return; // theme.ts:117 — 深い等価ではなく同一性
  const previous = current.theme;
  const pairs = varPairs.get(previous);
  const resolved = new Map<WeakRef<Entity>, Style>();
  if (pairs) {
    for (const [ref, keys] of pairs) {
      const entity = ref.deref();
      if (entity === undefined) {
        pairs.delete(ref);
        continue;
      } // 回収済みを掃除（#644） theme.ts:129
      const style: Style = {};
      for (const [key, expr] of keys) (style as Record<string, unknown>)[key] = expr;
      resolved.set(ref, resolveStyle(style, next).style); // next に対するドライラン — 依然 previous 上で throw する
    }
  }
  current.theme = next; // theme.ts:139 — すべてのドライランが成功した後にのみ
  if (pairs) {
    const nextPairs = pairsOf(next);
    for (const [ref, style] of resolved) {
      const entity = ref.deref();
      if (entity === undefined) continue; // パス間で回収された theme.ts:144
      applyStyleResolved(entity, style); // 再追跡なし — 下記で既に移行済み
      nextPairs.set(ref, pairs.get(ref)!); // refs を next テーマに移行 theme.ts:146
    }
    varPairs.delete(previous); // theme.ts:148
  }
}
```

不可分性の保証（`theme.ts:107`）: 追跡されたすべてのスタイルは `current.theme` が動く**前**に `next` に対して解決される。欠損トークンや無効な値（例: `v2.test.ts:126` の `--gap: '50%'`、`v2.test.ts:139` GH-485 の `--radius-md` 欠損）は、シーン、アクティブなテーマ、ペア簿記のすべてが依然として以前のテーマの下で完全に一貫している間に throw する — 決して半分だけ再スタイルされない。GH-485 テストで検証済み: `radius-md` を欠く `partial` テーマは throw し、`getTheme() === themeA` は依然として成立し、どちらの Entity も再スタイルされず、後続の有効な切り替えは依然としてすべてのペアを再解決する（`v2.test.ts:137`）。

`getTheme(): Theme`（`theme.ts:96`）は `current.theme` を読む; `untrackVarStyles`（`theme.ts:160`）はアクティブなテーマ配下の Entity エントリを落とすため、次の `setTheme` はそれをリプレイしなくなる。

## 7. フォント合成と軸ごとの padding — 2 つの非自明な書き込み

### 7.1 `composeFont` — ショートハンド文字列への手術

UI コンポーネントはフォント全体を 1 つの `font: string`（`packages/ui/src/UIComponent.ts:1` 経由の `Entity`、`packages/ui/src/Text.ts:111` `font: string`）として保持する。3 つの CSS 名のキーは独立したフィールドではない — `applyStyleResolved` は現在のショートハンドをパースし、スタイルが変更するセグメントを置換し、再合成された文字列を書き込む（`apply.ts:207` `FONT_KEYS` ループ、`apply.ts:267` `composeFont(current, fontChanges)`）。

`composeFont(current, changes)`（`packages/styles/src/font.ts:113`）は `parse(font)`（`font.ts:73`）に委譲し、空白でトークン化し（`font.ts:74` `split(/\s+/).filter(Boolean)`）、先頭の `style`／`variant`／`weight` キーワードを消費し（`font.ts:40` `parsePrefixes` は `WEIGHT_RE = /^(normal|bold|bolder|lighter|[1-9]00)$/` は `font.ts:18`、`STYLE_RE` `:19`、`VARIANT_RE` `:20` を伴う）、サイズスロットで `SIZE_SLOT_RE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:rem|em|px|pt))(?:\/([^\s/]+))?$/`（`font.ts:26`）にマッチし、残りを `family` として扱う。再合成は `[style, variant, weight, size[/lineHeight], family]` を結合する（`font.ts:103`）。

なぜこれが重要か:

- プレフィックス文法: `italic 700 16px Georgia` や `16px/24px Inter` はサイズ周辺のすべてを family に崩していた（`font.ts:14`）ため、後のセグメント変更が Canvas2D が静かに落とす無効な文字列を再合成していた。現在は `fontSize: '20px'` を `italic 700 16px Georgia` に対して `italic 700 20px Georgia` を生み（`issue-608.test.ts:107`）、`16px/24px` line-height を保持する（`issue-608.test.ts:112`）。
- `normal` の曖昧さ: `font: normal normal 16px Inter` は有効な CSS である; 最初の `normal` は `weight` を埋め、さらにそれらは `style`、次に `variant` を埋める（`font.ts:48`）。サイズスロットに落ちて throw するのではなく。
- 大声での失敗: サイズの前の `ultra-condensed 700 16px serif` は違反セグメントを名指しして throw する（`issue-608.test.ts:124`）。配置できないサイズ風セグメントは family に埋もれるのではなく `font.ts:91`（`unrecognized segment '…' before the font size`）で失敗する。
- 欠損サイズ／ファミリのデフォルト: `parts.size ??= '16px'` と `family ??= 'sans-serif'`（`font.ts:121`）により、空の `font: ''` に `fontFamily: 'Inter'` を加えると `'16px Inter'` を生む（`v2.test.ts:239`）、素のスタイルプレフィックスショートハンド `italic Georgia` は `italic 18px Georgia` に正規化される（`issue-608.test.ts:129`）。
- ランタイム単位強制: `fontSize` が `12`（トークンからの素の数値）として到達すると `unit-bearing token (e.g. '16px')` で throw する（`apply.ts:223`）、`'2em'` は `fontSize expects a px string` で throw する（`apply.ts:233`）、数字を含む `fontFamily` は `looks like a font shorthand` をトリガする（`apply.ts:214`、`v2.test.ts:272`）。`fontSize:`${number}px`` 型（`types.ts:46`）は静的な場合を捕捉する; ランタイムはトークンと JS 呼び出し元を捕捉する。

### 7.2 軸ごとの padding — `padding: { x, y }`

`padding?: CssLength | { x?: CssLength; y?: CssLength }`（`types.ts:34`）。ボックスコンポーネント（`Button`、`Link`、`Card`）は `padding`（均一）に加え `paddingX`／`paddingY`（`packages/ui/src/UIComponent.ts:21` ／ `:28`）を持つ: apply 層は存在するときに軸ごとのフィールドを書き込み（`apply.ts:248` `paddingX`／`paddingY` は `isCssLength(v, 'padding.x')` 経由）、`padding` はそのままにし、`applied: ['padding']` 全体として報告する。軸ごとのフィールドを持たない Entity ではスタイルはスキップされる（`v2.test.ts:329`）— コンポーネントのオプションにおける構築時の `padding` が依然として固有サイジングを支配する; 構築後の `padding: {x,y}` は `paddingX`／`paddingY` を検査するコンシューマ（例: `Card` レイアウト）によってライブで読まれる。ボックスを再計測することによってではない。

オブジェクト内のトークン参照は軸ごとに解決され（`apply.ts:168` `resolveValue(pad.x, theme)`）、`trackVarKeys` はいずれかの軸がトークンを参照するときにキー全体を追跡する（`theme.ts:189`）。無効な軸値は `padding.x` を名指しして throw する（`v2.test.ts:336`）。

## 8. UI と core がどのようにそれを消費するか

UI コンポーネントはランタイムで `@vectojs/styles` を import しない — スタイルはそれら**によって**ではなくそれら**に対して**適用される。コンポーネントはたまたま Rule テーブルの書き込みターゲットである型付き数値フィールドを公開する:

- **Geometry** — すべての `Entity` は `x/y/width/height/opacity/scaleX/scaleY/rotation` を持つ — `Text` と `Button` はそれらの上に直接構築される。
- **Box** — `UIComponent`（`packages/ui/src/UIComponent.ts:19`）は `padding`、`paddingX`、`paddingY` を所有する; `Button`（`packages/ui/src/Button.ts:19`）は `bg`（`backgroundColor` → `bg` は `apply.ts:63`）、`color`、`borderColor`、`radius`（`borderRadius`）に加え、ラベルセンタリング用の `font`（`Button.ts:80` `measureText(label, font)`）を所有する。`Card`、`Link`、`Tabs` は同じボックスフィールドに従う。
- **Text** — `Text`（`packages/ui/src/Text.ts:18` `TextOptions`）は `font`、`color`、`lineHeight`、`textAlign`（`'left'|'justify'` — `Text.ts:42`）を所有する; その `fontSize` は `fontSizePx(font)`（`packages/ui/src/measure.ts:27`）経由で抽出され、隣接する数字クラス数量子を持つ正規表現ではなく `indexOf('px')` で `px` トークンを走査する（`font.ts:26` `SIZE_SLOT_RE` と同じ ReDoS 衛生）。`familyOf(font)`（`measure.ts:57`）は同じショートハンドを家族ごとの計測のために分解する。
- **Layout** — `Stack`（`packages/ui/src/Stack.ts:10`）は `direction→flexDirection`、`gap`、`align→alignItems`、`wrap→flexWrap` を所有する; `Flow` は兄弟コンテナである。これら 2 つのみがコンテナ専用キーを受け入れる — 他の Entity は throw する（`packages/styles/test/styles.test.ts:144`）。

コアテキスト Entity（`packages/core/src/text/MSDFTextEntity.ts:1` `MSDFTextEntity`、`SVGEntity`）は現在のコードベースではこのパッケージを通じてスタイルされない — それらの `font`／`maxWidth`／`lineHeight` は `MSDFFont` と `LayoutWorkerManager`（ボス 02）によって駆動される。`fontSize: '20px'` を `MSDFTextEntity` に適用しても依然として `composeFont` にヒットするが、今日それに対する `applyStyle` 呼び出しサイトはない; 本章のテキスト相互作用は計測契約レベルにある（`packages/text/src/measureContext.ts:87` `getSharedMeasuringContext` で測った場所で描画する）。

`measure.ts` はスタイルが間接的に相互作用するフォントメトリクス無効化も所有する: webfont ロードは `notifyFontMetricsChanged`（`measure.ts:111`）を発火し、LRU をクリアし `UIComponent.watchFontMetrics(handler)`（`UIComponent.ts:128`）サブスクライバに通知する — `Text` と `Button` は固有幅を再計測し `markDirty` する。スタイルは webfont ロード後に再適用される必要はない; Entity 自身の `watchFontMetrics` ハンドラがジオメトリを正しく保つ。

## 9. CSS 習慣から VMT への移行 — すべての静かな失敗を大声に

パッケージのドクトリン（GH-608、`packages/styles/src/theme.ts:20`「GH-608 ドクトリン」）は、認識されない `var()` 形式が決して静かにすり抜けてはならないということである — このパッケージがしてはならない唯一のことは、Canvas2D が静かに無視する文字列を渡すことである。そのドクトリンは VMT 対応を持たないすべての CSS 習慣に拡張される:

| CSS 習慣                                                                     | 起きること                                                                                                                                                        | なぜ                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `width: '50%'`、`gap: '8em'`、`radius: '50%'`                                | `TypeError: width expects a bare number or a px string`（`apply.ts:29`）                                                                                          | VMT 上には px 単位のみが存在する; `%`／`em`／`rem` はバッキングフィールドを持たない（`vectojs-docs/content/reference/styles.md:193` を参照）。パーセンテージ gap は VMT が決して計算しない包含ブロックを必要とする。                                                                                 |
| `textAlign: 'center' \| 'right'`                                             | `TypeError: textAlign expects one of left \| justify`（`apply.ts:50`、`styles.test.ts:87`）                                                                       | `Text`／`RichText`／`TextEntity` とレイアウトエンジン（`LayoutEngine.textAlign` は `packages/layout/src/LayoutEngine.ts:1`）は `left` と `justify` のみを実装する — `center`／`right` は尊重できず静かに `left` としてレンダリングしてはならない（`vectojs-docs/content/reference/styles.md:208`）。 |
| `var(--token, fallback)`                                                     | `TypeError: var() fallbacks are not supported — 'var(--accent, #fff)' would reach the entity field unresolved`（`apply.ts:149`）                                  | フォールバック解決は実装されていない; 生文字列は以前のペイントを静かに保持する Canvas2D に到達し、キーは `setTheme` 用に追跡されない（#645、`issue-645.test.ts:33`）。                                                                                                                               |
| `rotation: '30deg'` または素の `30`                                          | 数値としてのみ書き込まれ（`apply.ts:33` の `isFiniteNumber`）、**ラジアン**として解釈される（`types.ts:25`）。`rotate(30deg)` は `Math.PI/6` でなければならない。 | 他のすべての VectoJS 回転サーフェスはラジアンである; スタイル層は第二の単位を導入しない。                                                                                                                                                                                                            |
| `display: 'block'`、`flexDirection: 'row-reverse'`                           | `TypeError: display expects one of flex`（`apply.ts:50`、`styles.test.ts:152`）                                                                                   | flex コンテナのみが存在する; `block`／`grid` は_すでに flex である_ `Stack`／`Flow` にとって意味を持たない。                                                                                                                                                                                         |
| `Text` 上の `gap` ／ `alignItems`                                            | `TypeError: 'gap' is a container-only property and Text is not a container`（`apply.ts:189`、`styles.test.ts:144`）                                               | カテゴリエラーであり、静かな no-op ではない。                                                                                                                                                                                                                                                        |
| `position: 'absolute'`、`transform`、`justifyContent`、`border: '1px solid'` | `unknown style property 'position'`（`apply.ts:258`、`styles.test.ts:159`）                                                                                       | 書き込むフィールドがない; それらを追加すると VMT が除去するために存在するカスケード／マージン崩壊機構が再導入される（`vectojs-docs/content/reference/styles.md:198`）。                                                                                                                              |
| `fontSize: 16`（素の数値）または `fontSize: '2em'`                           | `bare number` ／ `expects a px string like '16px'`（`apply.ts:223` ／ `:233`）                                                                                    | Canvas フォントショートハンドは単位を持つサイズを必要とする; 素の数値は Canvas2D が静かに落とす無効なショートハンドを合成する（`v2.test.ts:244`、`issue-608.test.ts:137`）。                                                                                                                         |
| `fontFamily: '16px Inter'`                                                   | `looks like a font shorthand — reference the 'font' token`（`apply.ts:214`、`v2.test.ts:272`）                                                                    | 完全なショートハンドがファミリースロットに漏れてサイズ／ウェイトを破棄するのを防ぐ。                                                                                                                                                                                                                 |

共通する糸: すべての throw は CSS プロパティを名指しし値をエコーする（`apply.ts:29` `JSON.stringify(value)`）ため、メッセージに対する grep で移行呼び出しサイトが見つかる。検証を**通過**するスタイルは常に有効な canvas フォントショートハンドと VMT が描画できる数値を生成する — 不正な値が前のフレームの状態を静かに描画するパスはない。

## 10. 難しい部分 — 領収書付き

| 落とし穴                                                                                         | 場所                                                          | 状態                                                                                                                         |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `rgba(var(--rgb), 0.4)` が生文字列として書き込まれ — Canvas2D が静かに古い fill を保持           | `apply.ts:133`（GH-608）、`issue-608.test.ts:37`              | 修正済み: `VAR_REPLACE_RE`（`apply.ts:105`）経由で埋め込み `var()` を置換                                                    |
| `italic 700 16px` サイズプレフィックスが再合成で family に崩れた                                 | `font.ts:14`（GH-608）                                        | 修正済み: 完全な `[style\|variant\|weight]? size[/line-height]? family` パーサ（`font.ts:40` `parsePrefixes`）               |
| `16px/24px` line-height セグメントが `fontSize` 変更で失われた                                   | `font.ts:26` `SIZE_SLOT_RE`                                   | 修正済み: `size/lineHeight` キャプチャと再出力（`font.ts:80` ／ `:102`）                                                     |
| `fontSize` が `'2em'`／`2rem` を受け入れ Canvas2D が落とすショートハンドを合成した               | `apply.ts:232`（GH-608）                                      | 修正済み: ランタイム `px` 強制（`apply.ts:232`、`issue-608.test.ts:137`）                                                    |
| `css()` がバリアント間で同じ `padding: {x,y}` オブジェクトを共有した                             | `css.ts:23`（GH-608）                                         | 修正済み: 軸ごとのコピー（`css.ts:23`、`issue-608.test.ts:153`）                                                             |
| `var(--token, fallback)` が未解決のまま通過した                                                  | `theme.ts:24` `HAS_VAR_FALLBACK_RE`（#645）                   | 修正済み: 埋め込み置換の前に検出して throw（`apply.ts:147`、`issue-645.test.ts:30`）                                         |
| 余分な空白のある `var( --token, fb)` がフォールバックガードを逃れた                              | `theme.ts:24` `/var\(\s*--/`（#753）                          | 修正済み: `var(` の後の空白を許容（`issue-645.test.ts:78`）                                                                  |
| トークン参照→トークンチェーンがリテラル `var(--…)` を文字列フィールドに漏らした                  | `apply.ts:112` `resolveToken`（GH-452/608）                   | 修正済み: `seen` サイクルセットを伴う推移的 `resolveValue`（`apply.ts:125`）                                                 |
| `setTheme` が欠損トークンで半分だけ再スタイルした                                                | `theme.ts:107` ドライラン（GH-485、`v2.test.ts:137`）         | 修正済み: すべてのドライランの後にコミット前に解決、`current.theme` はすべてのドライランの後にのみ動く                       |
| スタイルされた Entity が永遠に保持された — `WeakMap<Theme, Map<Entity,…>>` が強く保持した        | `theme.ts:70` `WeakRef`（#644）                               | 修正済み: `WeakMap<Theme, Map<WeakRef<Entity>,…>>` ＋ `refOf`（`theme.ts:77`）＋ 走査で掃除（`theme.ts:129`）                |
| `css()` が同じ `padding` オブジェクトを共有しながら `var()` 追跡キーがリテラル上書きで削除された | `theme.ts:195` `keys.delete(key)`（GH-451、`v2.test.ts:181`） | 修正済み: オブジェクトごとの追跡ではなくキーごとの `Map<string,unknown>`                                                     |
| `fontSize` の素数トークン `bad-size: 12` が `'700 12 Inter'` を静かに合成した                    | `apply.ts:221` 素数ガード                                     | 修正済み: `fontSize resolved to the bare number 12 — use a unit-bearing token`（`v2.test.ts:244`）                           |
| `SIZE_SLOT_RE` の `\d+\.?\d*` 隣接数字クラスでの多項式 ReDoS                                     | `font.ts:26` 分岐安全な `SIZE_SLOT_RE`（`v2.test.ts:258`）    | 修正済み: 隣接する同じクラス数量子なし、より長い単位代替を先に（`font.ts:22`）                                               |
| 移行されたスタイルシートからの `Text` ハードコード `textAlign: 'center'`                         | `styles.test.ts:87`                                           | 設計どおり: throw する — `center`／`right` は Entity バッキングを持たない; `left`＋レイアウトまたは `justify` に移行すること |

## 11. チェックリスト — スタイル変更を着地させる前に

1. **ネスト形状をエイリアスしないこと。** `Style` は最大 1 つのネストオブジェクト（`padding: {x,y}` は `types.ts:34`）を持つ; `css()` はそれをコピーしなければならず（`css.ts:23`）、新しいネストキーは同様の扱いを必要とする。さもなければバリアントマージが漏れる。
2. **型だけでなくランタイムで単位を強制すること。** `` fontSize: `${number}px` ``（`types.ts:46`）はコンパイル時に `16` を捕捉するが、トークンと JS 呼び出し元はそれをバイパスする — `apply.ts:221` ／ `232` は依然として throw しなければならない。
3. **トークン解決を不可分に保つこと。** `setTheme` のドライラン（`theme.ts:124` `resolveStyle(style, next)`）は `current.theme` が動く前に追跡されたすべてのキーをカバーしなければならない; 切り替え時に検証に失敗する値はシーンを半分だけ再スタイルしてはならない（`v2.test.ts:137` GH-485）。
4. **Entity を弱く保持すること。** `varPairs` は `WeakMap<Theme, Map<WeakRef<Entity>,…>>`（`theme.ts:70`）のままでなければならず `ref.deref() === undefined`（`theme.ts:129`）を掃除する — `Entity.destroy()` は `core` が `styles` に依存しないため `untrackVarStyles` を呼べない（`theme.ts:65`）。
5. **オブジェクトごとではなくキーごとに追跡すること。** `trackVarKeys`（`theme.ts:175`）は現在のスタイルのキーを保存された `Map<string,unknown>` と比較する — 同じキー上の後のリテラルはそれを `delete` しなければならない（`theme.ts:195`）。さもなければ var リプレイがそれを潰す（`v2.test.ts:181` GH-451）。
6. **フォントパーサと `isCssLength` ガードを同期させておくこと。** `SIZE_SLOT_RE`（`font.ts:26`）と `isCssLength`（`apply.ts:23`）は同じ `px` 文字列形状を共有する; 乖離すると一方が他方が拒否するものを受け入れ、Canvas2D が静かに落とす無効なショートハンドを合成する。
7. **不明な形式では大声で失敗すること。** 新しい `var()` 構文、新しい CSS キー、または新しいコンテナ専用プロパティはプロパティ名と値とともに throw しなければならない（`apply.ts:29` `JSON.stringify(value)`）— 沈黙はこのパッケージが認識されない形式でしてはならない唯一のことであるという GH-608 ドクトリン。

---

_シリーズ: 00 Overview → 01 Selection → 02 Text+Layout → 03 Projection+Virtualization → 04 Streaming Markdown → 05 TeX → 06 VMT Runtime → 07 Renderer → 08 WASM G1/G2/G3 → 09 Three/XR → 10 Video Export → 11 Graph Layout → 12 DevTools → **13 スタイルとテーマ** → 99 Synthesis。_
