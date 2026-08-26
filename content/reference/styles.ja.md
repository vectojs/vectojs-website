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
- `css(...styles)` — マージファクトリ（0.2.0）: 後のソースが優先されます; `null`、`undefined`、`false` のソースはスキップされるため、バリアントを条件付きにできます。入力は変更されません。軸ごとの `padding` オブジェクトもコピーされるため、「新しいプレーンオブジェクト」の契約はネストした値にも成立します。
- `applyStyle(entity, style)` — マッピングされたフィールドを書き込み、`{ applied: string[] }`（実際に書き込まれたCSSキーをオブジェクト順で）を返します。
- `tokens(set)` — フラットなトークンセットから `Theme` を作成します。
- `setTheme(theme)` / `getTheme()` — アクティブなテーマを切り替え/読み取ります; `var()` を参照するスタイルは、切り替え時に再解決・再適用されます。
- `untrackVarStyles(entity)` — エンティティの `var()` 追跡を即座に解除します（0.3.x）。次回のテーマ切り替え時の弱参照スイープを待つのではなく、destroy の片付けから呼び出して決定論的に解放してください。
- `PRESET_THEMES` — `light`（デフォルトテーマ）、`dark`、`github`、`dracula` のトークンセット。
- `Style` — スタイルインターフェース。すべてのキーはオプション。
- `composeFont(current, changes)` — CSSフォントのショートハンド文字列を再構成します（[フォントの合成](#huontonohe-cheng) を参照）。
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

- `var(--key)` は値コンバーターが実行される前に、アクティブなテーマのトークンに対して解決されるため、トークンは色、px文字列、素の数値のいずれかを保持できます。文字列全体の参照（`backgroundColor: "var(--accent)"`）は正確に解決され、より大きな文字列に埋め込まれた参照（`color: "rgba(var(--rgb), 0.4)"`）は置換によって解決され、トークンがトークンを参照するチェーンはパスベースのサイクル検出付きで推移的に解決され、参照しているキーは追跡されてテーマ切り替え時に複合値が再解決されます。不明なトークンはその名前を添えてスローし、サイクルも違反チェーンと共にスローします。
- `var(--token, fallback)` には**フォールバック解決がなく**、決して黙って通過しません: この形式は、どこに現れても（直接の値、複合文字列への埋め込み、padding 軸の中、トークンチーン経由）検出され、違反している値を名指しする `TypeError` をスローします。検出器は `var(` の後の空白を許容するため、`var( --accent, #fff)` も捕捉されます。ここでの沈黙こそが欠陥でした: 未解決の文字列がマッピングされたフィールドに到達し、Canvas2D が前回の描画を黙って保持していました。
- トークンを参照するスタイルはテーマごとに**追跡**され（破棄されたエンティティは保持されなくなりました。追跡は弱く保持し、destroy の片付けで即時解放するための `untrackVarStyles(entity)` があります）、`setTheme(next)` が切り替わると再適用されるため、テーマの交換は呼び出し側の変更なしでシーン全体を再着色します。`var()` を含まないスタイルは追跡されません。トークン値が切り替え時にマッピングされたプロパティの検証に失敗した場合（例: `--radius-md: "50%"`）、`setTheme` はスローします。
- デフォルトテーマは `light` プリセットです; `tokens()` セットはプレーンなオブジェクトなので、呼び出し側のテーマはスプレッドになります: `tokens({ ...PRESET_THEMES.dark, accent: "#f00" })`。

## フォントの合成 {#huontonohe-cheng}

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

パーサーはcanvasの完全なプレフィックス文法（`[style || variant || weight]? size[/line-height]? family`）を理解しているため、`italic 700 16px Georgia` や `16px/24px Inter` は正しく構成でき、後続のセグメント変更が無効な文字列を再構成することはありません。配置できないサイズ様セグメントは、黙って通過するのではなく明確に失敗します。weight スロットが最初の `normal` を取った後（これは文書化された互換性の選択です）、さらなる `normal` は style、次いで variant を埋めるため、有効なCSS形式 `normal normal 16px Inter` はスローではなく解析されます。`fontSize` は実行時に `${number}px` 形状を強制します: トークンやJS呼び出し元から届いたpx以外の単位は、Canvas2Dが捨ててしまうショートハンドを黙って構成するのではなくスローします。

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
