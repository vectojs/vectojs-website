+++
title = "スタイル (@vectojs/styles)"
description = "数値仮想数学ツリー上のCSSプロパティ名スタイルオブジェクト: トークンテーマ（var() + setTheme）、css() マージ、フォント合成 — パーサーなし、カスケードなし、セレクターなし。"
weight = 55
+++

# `@vectojs/styles`

数値仮想数学ツリーの上に置かれる宣言型スタイルレイヤー: **CSSプロパティ名とCSS風の値**でスタイルを記述すると、`applyStyle` がそれらをエンティティフィールドにマッピングします。目的は移行のしやすさ — CSSのように読めるコードが、それでも VectoJS 開発者が手で設定するのと同じ型付きの数値フィールドに届き、canvas が単一の情報源として維持されます。

これはCSSエンジンで**はありません**: パーサーもセレクターもカスケードも継承もグローバルスタイルレジストリもありません。スタイルオブジェクトは普通の型付きオプショナルキーオブジェクトです; トークン参照（`var(--key)`）はフラットなテーマに対して解決され、テーマを切り替えると追跡されたすべてのスタイルが再適用されます。

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

## エクスポート

- `style()` — オブジェクトリテラルを `Style` として型付けする恒等ファクトリ。
- `css(...styles)` — マージファクトリ（0.2.0）: 後のソースが優先されます; `null`、`undefined`、`false` のソースはスキップされるため、バリアントを条件付きにできます。入力は変更されません。
- `applyStyle(entity, style)` — マッピングされたフィールドを書き込み、`{ applied: string[] }`（実際に書き込まれたCSSキーをオブジェクト順で）を返します。
- `tokens(set)` — フラットなトークンセットから `Theme` を作成します。
- `setTheme(theme)` / `getTheme()` — アクティブなテーマを切り替え/読み取ります; `var()` を参照するスタイルは、切り替え時に再解決・再適用されます。
- `PRESET_THEMES` — `light`（デフォルトテーマ）、`dark`、`github`、`dracula` のトークンセット。
- `Style` — スタイルインターフェース。すべてのキーはオプション。
- `composeFont(current, changes)` — CSSフォントのショートハンド文字列を再構成します（[フォントの合成](#フォントの合成) を参照）。
- `ThemeTokenSet` — `Record<string, string | number>`; `tokens()` セットと `Theme.tokens` の型。
- `Theme` — `tokens()` によって作成される `{ readonly tokens: ThemeTokenSet }`。

パッケージは `@vectojs/core` のみに依存します。

## キーマッピング

| CSSキー                                  | エンティティフィールド                    | 値                                                                          |
| ---------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| `x`, `y`, `width`, `height`              | 同じ                                      | 素の数値または `px` 文字列                                                  |
| `opacity`, `scaleX`, `scaleY`            | 同じ                                      | 数値                                                                        |
| `rotation`                               | 同じ                                      | 数値、**ラジアン**（VectoJSの規約、CSSの度ではありません）                  |
| `backgroundColor`                        | `bg`                                      | 色文字列、そのまま渡されます                                                |
| `color`, `borderColor`                   | 同じ                                      | 色文字列、そのまま渡されます                                                |
| `borderRadius`                           | `radius`                                  | 素の数値または `px` 文字列                                                  |
| `padding`                                | `padding`（または `paddingX`/`paddingY`） | 単一の値、または `{ x, y }` による軸ごと（0.2.0）                           |
| `font`                                   | `font`                                    | CSSフォントのショートハンド文字列（例: `"16px Inter"`）                     |
| `fontFamily` / `fontSize` / `fontWeight` | `font` に合成される                       | 0.2.0: セグメントが置き換えられ、残りは保持されます                         |
| `lineHeight`                             | `lineHeight`                              | 素の数値または `px` 文字列                                                  |
| `textAlign`                              | `textAlign`                               | `"left"` \| `"justify"` のみ                                                |
| `display`                                | —（検証のみ）                             | `"flex"`; エンティティがコンテナであることを検証                            |
| `flexDirection`                          | `direction`                               | `"row"` → `"horizontal"`、`"column"` → `"vertical"`                         |
| `gap`                                    | `gap`                                     | 素の数値または `px` 文字列                                                  |
| `alignItems`                             | `align`                                   | `"flex-start"` → `"start"`、`"center"` → `"center"`、`"flex-end"` → `"end"` |
| `flexWrap`                               | `wrap`                                    | `"wrap"` → `true`、`"nowrap"` → `false`                                     |

## トークンとテーマ

テーマはフラットなトークンセットです; キーは `--` プレフィックスなしで記述し、CSSカスタムプロパティを反映して `var(--<key>)` として参照します:

```ts
const theme = tokens({ accent: '#2563eb', 'radius-md': 8, gap: 10 });
setTheme(theme);
applyStyle(btn, style({ backgroundColor: 'var(--accent)', borderRadius: 'var(--radius-md)' }));
```

- `var(--key)` は値コンバーターが実行される前に、アクティブなテーマのトークンに対して**正確に**（文字列全体で）解決されるため、トークンは色、px文字列、素の数値のいずれかを保持できます。不明なトークンはその名前を添えてスローします。
- トークンを参照するスタイルは**追跡**され（テーマごとの WeakMap — リークなし）、`setTheme(next)` が切り替わると再適用されるため、テーマの交換は呼び出し側の変更なしでシーン全体を再着色します。`var()` を含まないスタイルは追跡されません。トークン値が切り替え時にマッピングされたプロパティの検証に失敗した場合（例: `--radius-md: "50%"`）、`setTheme` はスローします。
- デフォルトテーマは `light` プリセットです; `tokens()` セットはプレーンなオブジェクトなので、呼び出し側のテーマはスプレッドになります: `tokens({ ...PRESET_THEMES.dark, accent: "#f00" })`。

## フォントの合成

`fontFamily`、`fontSize`、`fontWeight` は独立したフィールドではありません — uiコンポーネントはフォント全体を1つのショートハンド文字列として保持します。これらのキーはエンティティの現在の `font` を解析し、存在するセグメントのみを置き換えて、再構成された文字列を書き込みます:

```ts
applyStyle(text, style({ font: '700 16px Inter' })); // entity font
applyStyle(text, style({ fontSize: '20px' })); // -> "700 20px Inter"
applyStyle(text, style({ fontFamily: 'ui-monospace' })); // -> "700 20px ui-monospace"
```

フォントが空のエンティティは `16px` から始まります; ファミリーが欠けている場合は `sans-serif` にフォールバックします。`font` フィールドを持たないエンティティではこれらのキーはスキップされます。

基盤となる文字列ヘルパーは直接利用できるようにエクスポートされています:

```ts
composeFont(
  current: string,                                       // e.g. "700 16px Inter"
  changes: { fontFamily?: string; fontSize?: string; fontWeight?: string },
): string                                               // -> "700 20px ui-monospace"
```

`composeFont` はCSSフォントのショートハンドを解析し、`changes` に存在するセグメントのみを置き換えて再構成します; 欠けているサイズ/ファミリーは `16px` / `sans-serif` で埋められるため、結果は常に有効なcanvasフォント文字列になります。

## セマンティクス

- **コンポーネント横断の再利用。** エンティティにフィールドが存在しないキーは黙ってスキップされるため、1つのスタイルオブジェクトを `Button`、`Text`、`Stack` 間で共有できます — それぞれが持つものを取ります。`applied` は正確に何が書き込まれたかを報告します。
- **カテゴリエラーでの明示的な失敗。** コンテナでないエンティティに対するレイアウトキー（`display`、`flexDirection`、`gap`、`alignItems`、`flexWrap`）は `TypeError` をスローします — `Text` をフレックスコンテナとしてスタイルすることは、無操作ではなく誤りです。不明なCSSキーもスローします。
- **不正な値での明示的な失敗。** `"50%"`、`"8em"`、または `textAlign: "center"` はプロパティ名を添えてスローします。VectoJS テキストは `left` と `justify` のみを実装します（`Text`、`RichText`、`TextEntity`、レイアウトエンジンがすべて `"left" | "justify"` を共有）、そのため `center`/`right` は尊重できず、黙って失敗してはなりません。値は素の数値（px）または `px` 文字列です; `%`、`em`、`rem` は拒否されます。
- **Dirty シグナリング。** 少なくとも1つのキーが書き込まれた場合、`applyStyle` は `entity.scene.markDirty()` を1回呼び出すため、`onDemand` シーンが再描画されます。

## 意図的にスコープ外 (v0.2.0)

- `transform`（CSS transform 文字列は解析が必要）、`justifyContent`（バッキングフィールドなし — Stack の子は `align` で整列）、`border` オブジェクト（まだcanvasの境界レンダリングが存在しない — `borderColor` のみ）、`%`/`em`/`rem` 長さ、擬似状態（`:hover`）、メディアクエリ、セレクター、カスケード — これらはいずれもエンティティフィールドとして存在せず、追加すると数値 VMT が除去するために存在する機構を再導入することになります。

## FAQ

**なぜ `applyStyle` は `textAlign: "center"` でスローするのですか？** `textAlign` はスタック全体で `"left" | "justify"` だからです — ui の `Text`/`RichText`、core の `TextEntity`、レイアウトエンジン（`LayoutEngine.textAlign`）。`center`/`right` を尊重できるエンティティはないため、スローによって移行中のスタイルシートが黙って左寄せテキストをレンダリングすることを防ぎます。

**`rotation` は度ですか？** いいえ — ラジアンで、他のすべての VectoJS 回転サーフェスと一致します。CSS の `rotate(30deg)` 移行は `Math.PI / 6` に変換する必要があります。

**`padding: { x, y }` は Button のサイズを変更しますか？** いいえ。Box コンポーネントはコンストラクタで自身のサイズを決定するため、後から設定された軸ごとのパディングは、内在的なサイズ決定ではなく、`paddingX`/`paddingY` をライブで検査するコンシューマー（例: Card レイアウト）によって読み取られます。構築時のサイズ決定には、コンポーネントのオプションで `padding` を設定してください。

**スタイルを適用した後、テーマを切り替えるにはどうすればよいですか？** `var(--key)` トークンを参照するスタイルを適用し、その後 `setTheme(tokens({ ... }))` を呼び出してください — 追跡されたすべてのスタイルが新しいトークンに対して再解決され、再描画されます。リテラル値を持つスタイルは変更されません。
