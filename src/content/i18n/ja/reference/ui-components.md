---
title: '@vectojs/ui コンポーネントリファレンス'
description: '@vectojs/ui の全コンポーネントの完全リファレンス：レイアウトコンテナ、フォームコントロール、オーバーレイ、リッチコンテンツ。'
order: 11
---

# `@vectojs/ui` — コンポーネントリファレンス

> VectoJS ゼロ DOM Canvas エンジン向けの再利用可能な高レベルコンポーネント。
> ドキュメントバージョン：**1.10.0**。ソースオブトゥルース：`dist/index.d.ts`（パブリックサーフェス）および `packages/ui/src/*`（動作）。

すべてのコンポーネントは、Virtual Math Tree（VMT）のリーフまたはコンテナです。ここにあるものは実際の DOM ではありません — コンポーネントは `IRenderer` を介して Canvas に自身を描画します。アクセシビリティ、エージェント自動化、クローラビリティは、並行する **A11y シャドウ DOM** から提供されます：コンポーネントが `interactive` の場合、`Scene` はコンポーネントのボックスの上に配置された単一の隠れた透明な実際の DOM ノードを投影します。これは `getA11yAttributes()` から構築されます。これが、`page.getByRole('button', { name })` / `fill()` / スクリーンリーダーが純粋な Canvas UI に対して機能する理由です。

テキストのみのアプリケーションサーフェスは、`@vectojs/ui/text` から `Text` をインポートできます。この軽量エントリは、Markdown と MathJax をスタートアップグラフから除外します。複数のコンポーネントファミリーを構成する場合は、ルートの `@vectojs/ui` エントリを使用してください。

## ライブコンポーネントギャラリー

以下のギャラリーは、パッケージレベルのスモークテストとなっています。日常的なデバッグには、1 つの動作を調べるためにすべてのコンポーネントをスクロールする必要がないように、焦点を絞ったコンポーネントページを使用してください：

| エリア                  | コンポーネントページ                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| テキストとメディア      | [`Text`](/reference/ui-text/)、[`RichText`](/reference/ui-richtext/)、[`Link`](/reference/ui-link/)、[`Image`](/reference/ui-image/)                                                                                                                                                                                                                                                 |
| レイアウトコンテナ      | [`Card`](/reference/ui-card/)、[`Stack`](/reference/ui-stack/)、[`Flow`](/reference/ui-flow/)、[`ScrollView`](/reference/ui-scrollview/)、[`VirtualList`](/reference/ui-virtuallist/)、[`TreeView`](/reference/ui-treeview/)、[Resizable panels](/reference/ui-resizable-panel/)                                                                                                     |
| コントロールとフォーム  | [`Button`](/reference/ui-button/)、[`Input`](/reference/ui-input/)、[`TextArea`](/reference/ui-textarea/)、[`Checkbox`](/reference/ui-checkbox/)、[`Toggle`](/reference/ui-toggle/)、[`Slider`](/reference/ui-slider/)、[`Dropdown`](/reference/ui-dropdown/)、[`RadioGroup`](/reference/ui-radiogroup/)、[`Tabs`](/reference/ui-tabs/)、[`ProgressBar`](/reference/ui-progressbar/) |
| リッチコンテンツ        | [`Markdown`](/reference/ui-markdown/)、[`CodeBlock`](/reference/ui-codeblock/)、[`Table`](/reference/ui-table/)                                                                                                                                                                                                                                                                      |
| オーバーレイと一時的 UI | [`Overlay`](/reference/ui-overlay/)、[`Tooltip`](/reference/ui-tooltip/)、[`Popover`](/reference/ui-popover/)、[`ContextMenu`](/reference/ui-contextmenu/)、[`Modal`](/reference/ui-modal/)                                                                                                                                                                                          |

<figure class=\"sandbox component-gallery\">
  <div class=\"sandbox-bar\"><span class=\"dot\"></span><span class=\"dot\"></span><span class=\"dot\"></span><span class=\"sandbox-label\">live · @vectojs/ui 1.10.0 · 内部をスクロール</span></div>
  <iframe src=\"/sandbox/ui-components.html\" class=\"sandbox-frame component-gallery-frame\" loading=\"eager\" title=\"すべての VectoJS UI コンポーネントのインタラクティブギャラリー\" sandbox=\"allow-scripts allow-same-origin allow-popups\"></iframe>
  <figcaption>パッケージレベルのスモークギャラリー：まず広範なカバレッジ、特定の動作をデバッグするときは焦点を絞ったコンポーネントページ。</figcaption>
</figure>

## すべてのコンポーネントに共通する規則

すべてのコンポーネントは、コア `Entity` を拡張する `UIComponent` を拡張します。以下の継承メンバーは常に使用され、各コンポーネントでは繰り返し**ません**。

| メンバー            | シグネチャ                                         | 備考                                                                                                                                                                                                              |
| ------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setPosition`       | `setPosition(x, y): this`                          | ローカル空間配置；チェーン可能。                                                                                                                                                                                  |
| `add` / `remove`    | `add(child: Entity): this` / `remove(child): this` | 子管理（コンテナは `add` をオーバーライドして再レイアウトします）。                                                                                                                                               |
| `on` / `off`        | `on(event, cb, { capture? }): this`                | DOM ライクなキャプチャ+バブル。イベント：`click hover pointerdown pointerup pointercancel pointermove pointerleave change focus blur wheel keydown keyup`。                                                       |
| `emit`              | `emit(event, payload): void`                       | 直接の自己専用ディスパッチ（ツリー伝播なし）。                                                                                                                                                                    |
| `getGlobalPosition` | `getGlobalPosition(): Point`                       | 祖先変換を累積したワールド空間位置。                                                                                                                                                                              |
| `scene`             | `get scene`                                        | 最も近いアタッチされた `Scene`；`onDemand` シーンで再描画を要求するには `this.scene?.markDirty()` を使用します。                                                                                                  |
| `interactive`       | `interactive: boolean`                             | true の場合、コンポーネントは A11y シャドウノードを投影し、ポインター/キーボードイベントを受信します。                                                                                                            |
| `clipChildren`      | `clipChildren: boolean`                            | 通常の子描画をローカルボックスにクリップします。Canvas/SVG は正確、Three は回転/シアーされたクリップに AABB シザーを使用します。GPU ポイント/WebGPU オーバーレイパスは関与しません。`ScrollView` で使用されます。 |
| `width` / `height`  | `number`                                           | コンポーネントのボックス；ヒットテストとビューポートカリングを駆動します。                                                                                                                                        |
| `padding`           | `number`                                           | 内部パディング（デフォルト `0`）；ボックススタイルのコンポーネントはより高いデフォルト値を持ちます。                                                                                                              |
| 変換                | `x y scaleX scaleY rotation opacity`               | アフィン変換と乗算アルファは子に継承されます。                                                                                                                                                                    |
| `animate`           | `animate(targetProps, durationMs): this`           | 数値トゥイーンをキューに入れます。                                                                                                                                                                                |

---

## `UIComponent`（抽象ベース）

```ts
abstract class UIComponent extends Entity {
  padding: number; // デフォルト 0
  isPointInside(globalX: number, globalY: number): boolean;
  getBounds(): Bounds; // { x:0, y:0, width, height }

  // 出現/退出ヘルパー
  protected enterMotion?: MotionSpec; // マウント時に再生
  protected exitMotion?: MotionSpec; // dismiss() で再生
  dismiss(): Promise<void>; // exitMotion を再生し、ツリーから削除
}
```

すべてのコンポーネントが共有するボックスモデル + 軸平行（AABB）ヒットテストを一元化します。`isPointInside` は、ローカル空間で `[0,width] × [0,height]` 内にポイントがある場合に true を返します。`getBounds()` はローカルボックスを返すため、`Scene` はビューポートカリングできます。サブクラスは測定されたコンテンツから `width`/`height` を設定し、`render(r)` を実装し、（interactive の場合）`getA11yAttributes()` をオーバーライドします。

**出現/退出：** `enterMotion` / `exitMotion` を `MotionSpec`（`{ props: { opacity: [0, 1], … }, config? }`）として宣言すると、コンポーネントはライブシーンにマウントされたときにアニメーションで表示され、`dismiss()` で退出します — 退出アニメーションが解決するまで自身の削除を延期します。コア[アニメーションシステム](/reference/core-api/#animation)上の 1 つの共有実装であり、コンポーネントごとの手作りスプリングを置き換えます。Motion は `prefers-reduced-motion` 下で抑制されます（不透明度フェードは保持されます）。

### `getA11yAttributes(): A11yAttributes`

すべてのインタラクティブコンポーネントがオーバーライドするフック。返される形状（`@vectojs/core` から）は投影されたシャドウノードを駆動します：

```ts
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // デフォルト 'div'
  role?: string; // ARIA ロール
  label?: string; // aria-label / アクセシブルな名前
  href?: string; // タグ 'a'
  src?: string;
  alt?: string; // タグ 'img'
  inputType?: string;
  placeholder?: string;
  value?: string; // タグ 'input'
  checked?: boolean; // input.checked または aria-checked、毎フレーム更新
  disabled?: boolean;
  expanded?: boolean;
  controls?: string;
  haspopup?: string;
  selected?: boolean;
  activedescendant?: string;
  valuemin?: string;
  valuemax?: string;
}
```

---

## テキストとタイポグラフィ

### `Text`

```ts
new Text(text: string, opts?: TextOptions)

interface TextOptions {
  font?: string;                  // デフォルト '16px sans-serif'
  color?: string;                 // デフォルト '#e2e8f0'
  maxWidth?: number;              // ラップ幅；省略 → 明示的な '\\n' のみ改行
  lineHeight?: number;            // 行送り（px）、デフォルト 20
  preserveLeadingSpaces?: boolean;// デフォルト false
  selectable?: boolean;           // ブラウザネイティブのドラッグ選択、デフォルト true
}
```

ネイティブ `fillText` で描画される複数行テキスト。ラッピング/測定はコア `LayoutEngine`（`TextEntity` と同じ `Intl.Segmenter` パス）を**コールド/ホット分割**で通過します：

- `setText(text): this` — コールドパス（再セグメント化 + 再測定）、その後再レイアウト。
- `append(text): this` — ストリーミング/タイプライターパス；`setText(this.text + text)` と同等ですが、エンジンの段落メモ化が影響を受けていない先頭段落を再利用するため、変更された最後の段落のみが再測定されます。
- `setMaxWidth(maxWidth): this` — **ホット**パス；キャッシュされた測定テキストを再ラップするのみ（再セグメント化なし）。レスポンシブリフローにはこちらを推奨します。
- `setSelectable(selectable): this` — 投影されたネイティブ選択サーフェスを有効または無効にします。

コンテンツ投影は、ブラウザの検索、選択、コピーのために視覚的な改行と行の高さをミラーリングします。静的 Text はインタラクティブなヒットターゲットではありません。Canvas/VMT がそのピクセルとレイアウトを所有します。

### `RichText`

```ts
new RichText(spans: StyledSpan[], opts?: RichTextOptions)

interface RichTextOptions {
  font?: string;                          // ベースのショートハンド、デフォルト '16px sans-serif'
  color?: string;                         // デフォルト塗りつぶし、デフォルト '#e2e8f0'
  maxWidth?: number;                      // ラップ幅
  baseStyle?: TextStyle;                  // すべてのランに継承（ランスタイルが優先）
  linkColor?: string;                     // 独自の色がないリンクランのデフォルト '#38bdf8'
  onLinkClick?: (href: string) => void;   // リンクランがアクティブになったときに発火
  exclusions?: ExclusionRect[];           // テキストが回り込む矩形（除外シェイプ / フロート）
  selectable?: boolean;                   // ブラウザネイティブのドラッグ選択、デフォルト true
}
```

マルチスタイルインラインテキスト：太字/イタリック/色付き/異なるサイズのランが共通ベースライン上でフローし、ラップします。レイアウトはコア `LayoutEngine.prepareRich` を使用します。各グリフはそのランの色/太さ/傾きで描画されます。

- `setSpans(spans): this` — ランを置き換え、再レイアウト。
- `appendSpans(spans): this` — **ストリーミング**パス；リッチ段落メモ化が影響を受けていない先頭段落を再利用するため、トークンストリームは O(ドキュメント) ではなく O(変更された段落) で再準備されます。
- `setMaxWidth(maxWidth): this` — リフロー。
- `setExclusions(exclusions): this` — フロート領域を設定し、リフロー。
- `setSelectable(selectable): this` — スパンを再構築せずにネイティブ選択を切り替え。

A11y：各連続する**リンクラン**は、透過的な `<a>` ホットスポット子を取得します（再ラップ間で調整 — ランごとに 1 つのホットスポット；位置はその場で更新され、リンクの_数_が変更された場合のみシャドウノードが再構築されます）。コンポーネント自身のアクセシブルな名前は、完全な連結テキストです。

### `measureText`、`wrapLines`、`wrapText`（フリー関数）

```ts
measureText(text: string, font: string): number
```

CSS `font` でのレンダリングピクセル幅。境界 LRU（キャップ 1000）を介してメモ化されます。アラビア語は測定前に整形されます。DOM がない場合、文字あたり `0.5em` の推定値にフォールバックします。

```ts
wrapLines(text: string, font: string, maxWidth: number): string[]
```

明示的な `\\n` を尊重する欲張りワードラップ。長すぎる単語は独自の行になります（分割されません）。

```ts
wrapText(value: string, maxWidth: number, measure: (s: string) => number): WrappedLine[]

interface WrappedLine { text: string; start: number; end: number; }  // 絶対文字範囲
```

`wrapLines` と似ていますが、各行の絶対文字範囲を追跡し（そのため線形キャレットオフセットが `(line, x)` にマッピングされます）、ハード `\\n` を消費し（末尾の改行はキャレットが置かれる空の行を生成します）、長すぎる単語を文字レベルで分割します。`TextArea` によって内部的に使用されます。

---

## レイアウトコンテナ

### `Stack`

```ts
new Stack(opts?: StackOptions)

interface StackOptions {
  direction?: 'vertical' | 'horizontal';  // デフォルト 'vertical'
  gap?: number;                            // デフォルト 0
  align?: 'start' | 'center' | 'end';      // 交差軸、デフォルト 'start'
  wrap?: boolean;                          // デフォルト false
  maxWidth?: number;                       // 主軸ラップしきい値（水平）；デフォルト Infinity
  maxHeight?: number;                      // 主軸ラップしきい値（垂直）；デフォルト Infinity
}
```

子を主軸に沿って `gap` で順次配置し、交差軸で整列させます。子は自身のサイズを保持します — `x`/`y` のみが設定されます。それ自体は何も描画しません。

- `add(child): this` — 追加し、即座に `layout()` を再実行します。
- `layout(): void` — すべての子を配置し、コンテナをフィットするようにサイズ設定します（カリング可能にするため）。`add` の外部で子を変更した後（子のリサイズなど）に手動で呼び出します。

`wrap` が true の場合、主軸に沿って `maxWidth`/`maxHeight` を超える子は新しい行を開始します。コンテナは交差軸上で成長します。

```ts
const col = new Stack({ direction: 'vertical', gap: 12 });
col.add(new Text('Title'));
col.add(new Button('Go'));
scene.add(col.setPosition(40, 40));
```

### `Flow`

```ts
new Flow(opts?: FlowOptions)

interface FlowOptions extends Omit<StackOptions, 'direction' | 'wrap'> {
  direction?: 'horizontal';
}
```

`{ direction: 'horizontal', wrap: true }` として事前設定された `Stack` — `maxWidth` を超えると次の行に折り返す水平アイテム。タグクラウド、チップ行に使用します。`add()`/`layout()` を継承します。

### `Card`

```ts
new Card(opts: CardOptions)

interface CardOptions {
  width: number;          // 必須
  height: number;         // 必須
  bg?: string;            // デフォルト '#0f172a'
  border?: string;        // 省略 → ボーダーなし
  borderWidth?: number;   // デフォルト 1
  radius?: number;        // デフォルト 12
  padding?: number;       // デフォルト 0（コンシューマーが子を手動で配置）
  label?: string;         // 設定時 → interactive + role=\"group\" ランドマーク
}
```

オプションのボーダー付き角丸背景パネル。`add()` で子を追加します。子はカードのローカル空間で上にレンダリングされます。**デフォルトでは装飾的**（シャドウノードなし、interactive ではありません）。`label` を渡すと interactive になり、`{ role: 'group', label }` を投影するため、支援技術/エージェントが領域を見つけられます。`padding` は情報提供のみです — 子を自動的にインセットしません。

---

## コントロールとフォーム

以下のすべてのフォームコントロールは `interactive` であり、実際のシャドウノードを投影します。キャンバスはシャドウノードのネイティブイベントによって駆動されるビジュアルミラーです。

### `Button`

```ts
new Button(label: string, opts?: ButtonOptions)

interface ButtonOptions {
  onClick?: (e: unknown) => void;  // キャンバスヒットテストとシャドウ <button> クリックの両方で発火
  bg?: string;                     // デフォルト '#2563eb'
  hoverBg?: string;                // デフォルト '#3b82f6'
  color?: string;                  // ラベル色、デフォルト '#ffffff'
  font?: string;                   // デフォルト '600 16px sans-serif'
  padding?: number;                // デフォルト 12
  radius?: number;                 // デフォルト 8
}
```

中央にラベルが配置された角丸矩形。`width` は `measureText(label, font) + 2·padding` に自動サイズ設定され、`height` は `fontSizePx(font) + 2·padding` に自動サイズ設定されます（px サイズは `font` から解析され、測定されたラベル幅ではありません）。`{ tag: 'button', role: 'button', label }` を投影 → `getByRole('button', { name })` で駆動。パブリック状態：`focused`（`#00f0ff` フォーカスリングを描画）、内部 `hovered`（`hoverBg` に切り替え）。

### `Link`

```ts
new Link(label: string, opts: LinkOptions)   // opts 必須（href）

interface LinkOptions {
  href: string;          // 必須；ナビゲーションターゲット + シャドウ <a href>
  color?: string;        // デフォルト '#38bdf8'
  font?: string;         // デフォルト '16px sans-serif'
  underline?: boolean;   // デフォルト true
}
```

色付き（オプションで下線付き）テキスト。ラベルに自動サイズ設定されます。実際の `{ tag: 'a', href, label }` シャドウノードを投影します（ネイティブでクリック可能/クロール可能）。キャンバスヒットテストパスは `window.open(href, '_blank', 'noopener')` を介して開きます。

### `Image`

```ts
new Image(src: string, opts: ImageOptions)

interface ImageOptions {
  width: number;          // 必須（キャンバスはレイアウト/カリングに既知のボックスが必要）
  height: number;         // 必須
  alt?: string;           // デフォルト ''
  placeholder?: string;   // 読み込みまで塗りつぶし、デフォルト '#1e293b'
  radius?: number;        // プレースホルダーの角半径、デフォルト 0
  onLoad?: () => void;    // ビットマップが読み込まれると 1 回発火
}
```

`drawImage` を介して描画します。`{ tag: 'img', src, alt, label: alt }` を投影します。読み込みは非同期です — 準備ができるまでプレースホルダーボックスが描画されます。`onDemand` シーンでは、`onLoad: () => scene.markDirty()` を渡して読み込み時に再描画します。（`globalThis.Image` をシャドウします；クラスは `import { Image } from '@vectojs/ui'` として参照してください。）

### `Input`

```ts
new Input(opts: InputOptions)

interface InputOptions {
  width: number;             // 必須
  height?: number;           // デフォルト 40
  placeholder?: string;
  value?: string;            // デフォルト ''
  font?: string;             // デフォルト '16px sans-serif'
  color?: string;            // デフォルト '#e2e8f0'
  placeholderColor?: string; // デフォルト '#64748b'
  bg?: string;               // デフォルト '#0f172a'
  border?: string;           // デフォルト '#334155'
  selectionColor?: string;   // デフォルト 'rgba(56, 189, 248, 0.35)'
  radius?: number;           // デフォルト 6
  padding?: number;          // デフォルト 10
  onChange?: (value: string) => void;
}
```

**実際の透過 `<input>` シャドウノード**によってバックアップされる単一行フィールド。ブラウザは、その要素上でネイティブにすべての入力 — クリック、キーボード、**IME コンポジション**、選択、クリップボード、元に戻す — を処理します。キャンバスは描画のみを行います。`Scene` は、`value`、`selectionStart`、`selectionEnd`、`composition` を運ぶ `change` イベントを介して状態をミラーリングします。コンポーネントはこれらをパブリックフィールドとして再公開します：

- `value: string`、`focused: boolean`（500ms キャレット点滅を駆動）。
- `selectionStart` / `selectionEnd: number` — 実際の入力からミラーリングされたキャレット/選択オフセット。
- `composition: { start; length } | null` — アクティブな IME プリエディット範囲（下線として描画）。

A11y：`{ tag: 'input', inputType: 'text', placeholder, value, label: placeholder }`。エージェントはロールで `fill()` し、人間は CJK を入力し、キャンバスはキャレット、選択ハイライト、IME 下線、およびスクロール-to-キャレット（`scrollLeft`）をレンダリングします。レイアウトエンジンを介して RTL（ヘブライ語/アラビア語）範囲を処理します。

### `TextArea`

```ts
new TextArea(opts: TextAreaOptions)

interface TextAreaOptions {
  width: number;             // 必須
  height?: number;           // デフォルト 120
  placeholder?: string;
  value?: string;            // デフォルト ''
  font?: string;             // デフォルト '16px sans-serif'
  lineHeight?: number;       // フォントサイズの倍数、デフォルト 1.4
  color?: string;            // デフォルト '#e2e8f0'
  placeholderColor?: string; // デフォルト '#64748b'
  bg?: string;               // デフォルト '#0f172a'
  border?: string;           // デフォルト '#334155'
  selectionColor?: string;   // デフォルト 'rgba(56, 189, 248, 0.35)'
  radius?: number;           // デフォルト 6
  padding?: number;          // デフォルト 10
  onChange?: (value: string) => void;
}
```

**実際の透過 `<textarea>` シャドウノード**によってバックアップされる複数行フィールド — `Input` と同じミラーモデルに複数行ナビゲーションを加えたもの。キャンバスは値（`wrapText` 経由）を再ラップし、テキスト、選択、キャレットを描画します。パブリックフィールドは `Input` をミラーリングします：`value`、`focused`、`selectionStart`、`selectionEnd`、`composition`。`lineHeightFactor` は `lineHeight` オプションを保持します。

- `lineOfOffset(offset: number): number` — 線形文字オフセットを含む視覚的な（ラップされた）行インデックス；境界オフセットは最も早い包含行に解決され、範囲外は最後の行にクランプされます。キャレット位置を行にマッピングするのに便利です。

A11y：`textarea` シャドウノードを投影します。エージェントは `fill()` し、人間は CJK を入力し、レンダリングはゼロ DOM のままです。垂直スクロール-to-キャレットはアクティブな行をビュー内に保ちます（`scrollTop`）。

### `Checkbox`

```ts
new Checkbox(opts: CheckboxOptions)

interface CheckboxOptions {
  checked?: boolean;   // デフォルト false
  label?: string;      // 右側に描画；アクセシブルな名前として使用
  size?: number;       // ボックスサイズ px、デフォルト 20
  font?: string;       // デフォルト '16px sans-serif'
  color?: string;      // ラベル色、デフォルト '#e2e8f0'
  accent?: string;     // チェック時の塗りつぶし、デフォルト '#2563eb'
  border?: string;     // 未チェック時のボーダー、デフォルト '#475569'
  onChange?: (checked: boolean) => void;
}
```

実際の `<input type=\"checkbox\">` シャドウノードによってバックアップ — エージェント/支援技術によってネイティブにトグル可能。キャンバスの `click` とシャドウノードのネイティブ `change` の両方が 1 つのガードされたセッターを通過します（変更されていない値に対する重複 `onChange` はありません）。パブリック：`checked`。A11y：`{ tag: 'input', inputType: 'checkbox', checked, label }`。

### `Toggle`

```ts
new Toggle(opts: ToggleOptions)

interface ToggleOptions {
  checked?: boolean;   // デフォルト false
  label?: string;      // 右側に描画；アクセシブルな名前として使用
  width?: number;      // トラック幅 px、デフォルト 44（trackW として公開）
  height?: number;     // トラック高さ px、デフォルト 24（trackH として公開）
  font?: string;       // デフォルト '16px sans-serif'
  color?: string;      // ラベル色、デフォルト '#e2e8f0'
  accent?: string;     // オン状態のトラック塗りつぶし、デフォルト '#2563eb'
  track?: string;      // オフ状態のトラック塗りつぶし、デフォルト '#475569'
  onChange?: (checked: boolean) => void;
}
```

iOS スタイルのスイッチ。`{ role: 'switch', checked, label }` を `aria-checked` とともに投影します。`role=\"switch\"` は `div` であるため（`Scene` によってネイティブの変更が転送されない）、`click` は自身の `change` イベントを再発行します。単一の `change` ハンドラーが信頼できる情報源であるため、外部の `on('change', …)` リスナーと `onChange` コールバックの両方が発火します。パブリック：`checked`、`trackW`、`trackH`。

### `Slider`

```ts
new Slider(props?: SliderProps)   // props は .d.ts で緩く型付け（any）

// 認識されるプロパティ（コンストラクタで読み取り）：
{
  min?: number;            // デフォルト 0
  max?: number;            // デフォルト 100
  value?: number;          // デフォルト = min
  width?: number;          // デフォルト 200
  height?: number;         // デフォルト 24
  step?: number;           // デフォルト 1 — ポインターとキーボードの値粒度
  trackColor?: string;     // デフォルト 'rgba(255, 255, 255, 0.15)'
  progressColor?: string;  // デフォルト '#00f0ff'
  handleColor?: string;    // デフォルト '#fff'
}
```

丸いサムを持つ水平スライダー。パブリック：`min`、`max`、`value`、`step`。ドラッグ（`pointerdown` → `pointermove` → `pointerup`）はポインター `localX` を値にマッピングし、**`min` を基準とした `step` グリッドにスナップ**（デフォルトで整数ステップ、`input[type=range]` セマンティクスに一致）し、`{ value }` を含む `change` イベントを発行します（`on('change', e => e.value)` で購読）。キーボード：`ArrowRight`/`ArrowUp` でステップアップ、`ArrowLeft`/`ArrowDown` でステップダウン、`Home`/`End` で `min`/`max` にジャンプ。A11y：`{ role: 'slider', value, valuemin, valuemax }`。古いプレ 1.0 の UI ビルドには整数のみの値とキーボードハンドリングがありませんでした。

### `Dropdown`

```ts
new Dropdown(options: string[], props?: DropdownProps)  // props は緩く型付け（any）

// 認識されるプロパティ：
{
  value?: string;   // 初期選択；デフォルト = options[0]
  width?: number;   // デフォルト 120
  height?: number;  // デフォルト 36
  bg?: string;      // ボタン背景、デフォルト 'rgba(30, 41, 59, 0.85)'
  color?: string;   // デフォルト '#fff'
  radius?: number;  // デフォルト 8
  font?: string;    // デフォルト '14px sans-serif'
}
```

コンボボックス：`Button` が現在の値を表示し、クリック（または `ArrowDown`/`ArrowUp`/`Enter`/`Space`）でオプション `Button` の `Stack` メニューと全画面透過背景を開きます。両方とも `scene.showOverlay(...)` でマウントされます。`Escape` または背景クリックで `scene.hideOverlay(...)` を介して閉じます。選択は `{ value }` を含む `change` イベントを発行します。キーボードナビゲーションはハイライトされたインデックスを追跡します。`activedescendant` とオプション ID（`${id}-opt-${i}`）は ARIA のために配線されています。

ルートの A11y：`{ role: 'combobox', expanded, controls, haspopup: 'listbox', value, activedescendant }`。メニューは `role=\"listbox\"` を投影し、各オプションは `selected` を持つ `role=\"option\"` です。

---

## オーバーレイ

### `Modal`

```ts
new Modal(title: string, props?: ModalProps)  // props は緩く型付け（any）

// 認識されるプロパティ：
{
  width?: number;       // 背景、デフォルト window.innerWidth（フォールバック 800）
  height?: number;      // 背景、デフォルト window.innerHeight（フォールバック 600）
  backdropColor?: string; // デフォルト 'rgba(0, 0, 0, 0.5)'
  modalWidth?: number;  // 中央カード、デフォルト 400
  modalHeight?: number; // デフォルト 250
  cardBg?: string;      // デフォルト 'rgba(15, 23, 42, 0.95)'
  cardBorder?: string;  // デフォルト 'rgba(255, 255, 255, 0.15)'
}
```

`title` テキストと組み込みの「閉じる」ボタンを含む中央の `Card` を持つ全画面暗転背景。カードは共有の[アニメーションシステム](/reference/core-api/#animation)を通じてマウント時にスプリングでスケールインします。下にある `click`/`pointerdown` をブロックします。`scene.showOverlay(modal)` で表示します。

- `close(): Promise<void>` — カードスケールを 0 にスプリングバックし、退出アニメーションが解決したら `scene.hideOverlay(this)` でアンマウントします（安全な遅延ティアダウン）。Await 可能。
- `update(dt, time)` — アニメーション中にスプリングをティックし、シーンをダーティマークします（レンダーループによって呼び出されます）。

### `ScrollView`

```ts
new ScrollView(opts: ScrollViewOptions)

interface ScrollViewOptions { width: number; height: number; }
```

クリッピングビューポート（`clipChildren = true`）で、ホイール + ポインタードラッグスクロールとスプリング物理（摩擦 `0.85`、スプリング `0.1`）を備えています。子は非インタラクティブな `content` Entity 内に存在し、変換されます。ビューポートボックスは固定されたままです。

- `content: Entity` — スクロールされるコンテナ（パブリック）。
- `add(child): this` / `remove(child): this` — `content` を変更し、`updateContentSize()` を呼び出します。
- `updateContentSize(): void` — 子の範囲から `content.width/height` を再計算し（子を直接変更した後に呼び出します）、最大スクロール範囲を設定します。
- `scrollTo(y: number): void` — **0 が上部**である Y オフセットにスクロールします（内部的にクランプ；パブリックスクロール API は 0.1.1 で追加）。
- `scrollToBottom(): void` — コンテンツの最後にジャンプします（0.1.1 で追加）。
- `update(dt, time)` — ターゲットオフセットに向かってスプリングを積分します（レンダーループによって呼び出されます）。

ホイールスクロールは、`Ctrl` が押されている場合を除いて `preventDefault()` を呼び出します（ブラウザのズームを許可）。ポインタードラッグはコンテンツをカーソル/指と 1:1 で移動します。スクロールターゲットは `[-maxScroll, 0]` にクランプされます。

```ts
const sv = new ScrollView({ width: 360, height: 480 });
sv.add(longContent);
scene.add(sv.setPosition(20, 20));
sv.scrollToBottom(); // 例：追加後のチャットログ
```

---

## コンテンツ / リッチドキュメント

### `Markdown`

```ts
new Markdown(markdownText: string, opts?: MarkdownOptions)

interface MarkdownOptions {
  maxWidth?: number;     // デフォルト 800
  theme?: MarkdownTheme;
  onLinkClick?: (href: string) => void;
  selectable?: boolean;  // デフォルト true；レンダリングされるテキスト/コード/テーブルセルに伝播
}

interface MarkdownTheme {        // すべてオプション；デフォルト表示
  textColor?: string;            // '#e2e8f0'
  headingColor?: string;         // '#f8fafc'
  codeColor?: string;            // '#a5f3fc'
  codeBgColor?: string;          // 'rgba(30, 41, 59, 0.85)'
  quoteBorderColor?: string;     // '#6366f1'
  quoteTextColor?: string;       // '#94a3b8'
  hrColor?: string;              // 'rgba(148, 163, 184, 0.3)'
  tableBgColor?: string;         // 'rgba(15, 15, 25, 0.4)'
  tableHeaderBgColor?: string;   // 'rgba(255, 255, 255, 0.08)'
  bodyFont?: string;             // 'Inter, system-ui, sans-serif'
  codeFont?: string;             // '"JetBrains Mono", "Fira Code", monospace'
  fontSize?: number;             // 16
}
```

Markdown を **`marked`（v18、GFM）** で垂直 `Stack`（`content`、gap 16）の下の VMT サブツリーにパースします。サポートされるトークン：見出し（h1–h6、スケーリングサイズ）、段落（ワードラップされた `RichText`）、フェンス付きコードブロック（キーワードハイライト付き `CodeBlock`）、ブロッククォート（左アクセントバー）、順序付き/順序なしリスト、水平線、インラインコード、リンク — および **GFM テーブル**（`Table` コンポーネントでレンダリング；GFM テーブルサポートは 0.1.1 で追加）。`content.width`/`height` がコンポーネントのサイズを決めます。

2 つのコンテンツ更新パス — **ストリーミングには正しい方を選ぶことが重要です：**

- `setContent(markdown): this` — **完全再構築**：すべての子を破棄し、ゼロから再レンダリングします。ワンショット/置換に使用します。
- `appendMarkdown(chunk): this` — **正しいストリーミング/トークンパス**。生のバッファに追加し、完全な Markdown ソースを再レキシングし、生ソースでトークンを差分し、変更されていないプレフィックスエンティティを再利用し、`RichText.setSpans` で最後の（成長する）段落をインプレース更新します。エンティティツリー全体の再構築を避けますが、レキシングはドキュメント長に応じてスケーリングされます。
- `setSelectable(selectable): this` — 既存のテキスト/コード/テーブルの子孫を更新し、将来のストリーミングノードのデフォルトになります。

> 注意：すべてのトークンで `setContent(fullSoFar)` を呼び出してストリーミング**しないでください**。これにより、トークンごとにツリー全体が再構築され（トークンあたり O(ドキュメント)）、レイアウトコストがドキュメントとともに増大します。新しいデルタのみを `appendMarkdown(chunk)` にフィードしてください。

```ts
const md = new Markdown('', { maxWidth: 600 });
scene.add(md.setPosition(40, 40));
for await (const token of llmStream) md.appendMarkdown(token); // 変更されていないレンダリング済みプレフィックスを再利用
```

### `CodeBlock`

```ts
new CodeBlock(code: string, lang: string, maxWidth: number, theme: Required<MarkdownTheme>, selectable = true)
```

フェンス付きコード用の単一自己レンダリングリーフ：角丸背景 + 行ごと、セグメントごとの色付きテキスト（`js`/`ts`/`py`/`rust` およびエイリアスのキーワード/文字列/コメント/数値ハイライト）。古い行ごと/セグメントごとの子エンティティ爆発を 1 つのフラットリーフに置き換えます。**装飾的** — `isPointInside()` は常に `false` を返します。

- `setCode(code, lang?): this` — コンテンツを再パース（例：ライブ編集）。
- `setSelectable(selectable): this` — 正確なソースコンテンツ投影を切り替え。

UI 1.9 は Core 1.8 の `PreparedContentGrid` を、書記素ごとの Canvas ペイントとセマンティック投影の間で共有します。タブ、ワイド CJK/絵文字、アラビア語整形、bidi、Firefox フォント置換、DPR/ズーム、およびアフィン変換は、したがって 1 つのソース認識ジオメトリ計画を維持します。

注：`theme` は完全に解決された `Required<MarkdownTheme>` でなければなりません。実際には `CodeBlock` は `Markdown` によって内部的に生成されます。完全なテーマを提供する場合にのみ直接構築してください。

### `Table`

```ts
new Table(opts: TableOptions)

interface TableOptions {
  headers: (string | Entity)[];     // 必須；Entity インスタンスは一意でなければならない
  rows: (string | Entity)[][];      // 必須（2D 行 × 列）
  colWidths?: number[];       // 列ごとの px；headers.length と一致する必要あり、さもなくば均等配分
  width?: number;             // 全体の幅、デフォルト 600
  rowHeight?: number;         // デフォルト 36
  bg?: string;                // デフォルト 'rgba(15, 15, 25, 0.4)'
  headerBg?: string;          // デフォルト 'rgba(255, 255, 255, 0.08)'
  borderColor?: string;       // デフォルト 'rgba(255, 255, 255, 0.15)'
  headerTextColor?: string;   // デフォルト '#ffffff'
  textColor?: string;         // デフォルト '#e2e8f0'
  font?: string;              // デフォルト '14px sans-serif'
  selectable?: boolean;       // ネイティブセルテキスト選択、デフォルト true
}
```

Canvas ネイティブデータグリッド：文字列セルは Text 子エンティティになり、Entity セルはパブリック `setMaxWidth()` を通じて制約され、`layout()` は描画専用の `render()` パスの前にラッピング、行の高さ、位置を解決します。外部セルコンテンツを変更した後は `layout()` を呼び出します。各セルは 1 つのコンテンツ投影を所有します。A11y：支援技術のために `{ role: 'grid', label: 'N 列 M 行のデータテーブル' }` を投影します。また、`Markdown` 内の GFM テーブルのレンダラーでもあります。

---

### `RadioGroup`

```ts
new RadioGroup(opts: RadioGroupOptions)

interface RadioGroupOptions {
  options: RadioOption[];
  value?: string;
  direction?: 'horizontal' | 'vertical';
  gap?: number;
  size?: number;
  font?: string;
  color?: string;
  accent?: string;
  border?: string;
  onChange?: (value: string) => void;
}

interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}
```

相互排他的なラジオ選択グループ。`{ role: 'radiogroup' }` で投影されます。アプリケーションは引き続きラベルとキーボード/フォーカス動作を確認する必要があります。標準化された `'change'` イベントペイロードは `{ value }` を運びます。

---

### `Tabs`

```ts
new Tabs(opts: TabsOptions)

interface TabsOptions {
  tabs: TabItem[];
  value?: string;
  width: number;
  height: number;
  tabHeight?: number;
  font?: string;
  color?: string;
  selectedColor?: string;
  borderColor?: string;
  closable?: boolean; // 閉じるアフォーダンスを表示; クリックは onClose にルーティング
  tabWidth?: number; // 推奨幅（px）; オーバーフロー時にバーがスクロール（デフォルト 160）
  minTabWidth?: number; // スクロールが始まる下限（デフォルト 96）
  autoHideTabBar?: boolean; // タブが 2 つ未満のときにバーを非表示（デフォルト false; 1.10.0）
  onChange?: (value: string) => void;
  onClose?: (value: string) => void;
}

interface TabItem {
  id: string;
  label: string;
  content: Entity;
}
```

タブ選択コンテナ。アクティブなタブのコンテンツビューを自動マウントし、残りのスペース内で変換します。アクセシビリティのために `{ role: 'tablist' }` を投影します。標準化された `'change'` イベントペイロードは `{ value }` を運びます。

Tabs は固定の推奨 `tabWidth` を維持し、タブがオーバーフローすると縮小せずにバーが水平方向にスクロールします（ホイール、またはアクティブタブを表示するための自動スクロール）— 1.9.4 以降、`tabWidth` はバーがスクロールしていく目標値であり、引き伸ばして埋める幅ではありません（以前はワイドストリップで閉じるヒットが誤ってターゲットされていました）。`autoHideTabBar`（1.10.0）を使用すると、タブが 2 つ未満の間はバーとそのヒット領域が非表示になり、コンテンツが全高を占めます（Vim の `showtabline=1` セマンティクス）; `effectiveTabBarHeight` ゲッターはバーの現在の高さを報告し（非表示時は `0`）、コンテンツジオメトリは毎フレーム再同期されるため、`tabs` の再割り当てによって古くなったりずれたりしたコンテンツが残ることはありません。

---

### `ProgressBar`

```ts
new ProgressBar(opts?: ProgressBarOptions)

interface ProgressBarOptions {
  value: number; // 0..1
  width?: number;
  height?: number;
  radius?: number;
  bg?: string;
  accent?: string;
  showText?: boolean;
  font?: string;
  color?: string;
}
```

進捗トラックを表示するプログレスバー。中央テキストオプションが利用可能です。アクセシビリティのために `{ role: 'progressbar', value }` を投影します。

- `setValue(value: number): void` — セーフティバウンドチェック付きで値を更新します。

---

### `Overlay`

```ts
new Overlay(opts: OverlayOptions)

interface OverlayOptions {
  target: Entity;
  content: Entity;
  placement?: Placement; // 'top' | 'bottom' | 'left' | 'right' | 'top-start' | など
  offset?: number;       // 距離（px）、デフォルト 8
  autoFlip?: boolean;    // ビューポート境界外の場合に方向を自動調整
}
```

フローティング配置レイヤーエンジン。ネイティブではアクセシビリティノードを投影しません。

---

### `Tooltip`

```ts
new Tooltip(opts: TooltipOptions)

interface TooltipOptions {
  target: Entity;
  content: string;
  placement?: Placement;
  delay?: number; // 表示までの ms、デフォルト 300
}
```

フローティングホバーツールチップヘルパー。ターゲットに対するホバー時にツールチップコンテナを投影します。

---

### `Popover`

```ts
new Popover(opts: PopoverOptions)

interface PopoverOptions {
  target: Entity;
  width: number;
  height: number;
  placement?: Placement;
  offset?: number;
}
```

フローティングクリックポップオーバーパネル。ターゲットをクリックするとポップオーバーが表示され、外側をクリックすると自動的に非表示になります。

---

### `ContextMenu`

```ts
new ContextMenu(opts: ContextMenuOptions)

interface ContextMenuOptions {
  items: ContextMenuItem[];
  width?: number;
}

type ContextMenuItem =
  | { label: string; icon?: string; shortcut?: string; disabled?: boolean; onClick?: () => void; children?: ContextMenuItem[] }
  | { separator: true };
```

右クリックでトリガーされるメニューコンポーネント。アイコン、ショートカット、区切り線、再帰的サブメニューをサポートします。

- `showAtPoint(x: number, y: number): void` — グローバル画面位置にメニューを表示します。

---

### `VirtualList`

```ts
new VirtualList(opts: VirtualListOptions)

interface VirtualListOptions {
  width: number;
  height: number;
  itemHeight: number | ((idx: number) => number);
  itemRenderer: (idx: number) => Entity;
}
```

高性能レンダリング用に最適化されたスクロールリストコンテナ。現在ビューポート境界内にあるアイテムのみをインスタンス化/レンダリングします。

---

### `TreeView`

```ts
new TreeView(opts: TreeViewOptions)

interface TreeViewOptions {
  nodes: TreeNode[];
}

interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[] | (() => Promise<TreeNode[]>);
}
```

ネストされたツリーナビゲーター。同期的な子配列または非同期の遅延ロード関数リゾルバーをサポートします。

---

### `ResizablePanel`

```ts
new PanelGroup(opts: PanelGroupOptions)
new Panel(opts: PanelOptions)
new PanelResizeHandle()

interface PanelGroupOptions {
  direction: 'horizontal' | 'vertical';
  width: number;
  height: number;
}

interface PanelOptions {
  minSize?: number;
  defaultSize?: number; // 割合
}
```

リサイズ可能な分割ペインシステム。

---

## クイックインデックス

| コンポーネント | コンストラクタ                  | シャドウノード / ロール                   |
| -------------- | ------------------------------- | ----------------------------------------- |
| `Text`         | `(text, opts?)`                 | `div`（名前 = テキスト）                  |
| `RichText`     | `(spans, opts?)`                | `div` + リンクごとの `<a>` ホットスポット |
| `Button`       | `(label, opts?)`                | `button` role=button                      |
| `Link`         | `(label, opts)`                 | `a[href]`                                 |
| `Image`        | `(src, opts)`                   | `img[src,alt]`                            |
| `Card`         | `(opts)`                        | なし、または `label` 付き role=group      |
| `Stack`        | `(opts?)`                       | なし（構造的）                            |
| `Flow`         | `(opts?)`                       | なし（構造的）                            |
| `Input`        | `(opts)`                        | 透過 `input`                              |
| `TextArea`     | `(opts)`                        | 透過 `textarea`                           |
| `Checkbox`     | `(opts)`                        | `input[type=checkbox]`                    |
| `Toggle`       | `(opts)`                        | role=switch                               |
| `Slider`       | `(props?)`                      | role=slider                               |
| `Dropdown`     | `(options, props?)`             | role=combobox + listbox/option            |
| `RadioGroup`   | `(opts)`                        | role=radiogroup                           |
| `Tabs`         | `(opts)`                        | role=tablist                              |
| `ProgressBar`  | `(opts?)`                       | role=progressbar                          |
| `Overlay`      | `(opts)`                        | なし（構造的）                            |
| `Tooltip`      | `(opts)`                        | ツールチップ                              |
| `Popover`      | `(opts)`                        | ポップオーバーパネル                      |
| `ContextMenu`  | `(opts)`                        | コンテキストメニューリスト                |
| `VirtualList`  | `(opts)`                        | ビューポートスクロール                    |
| `TreeView`     | `(opts)`                        | ツリーノードビュー                        |
| `PanelGroup`   | `(opts)`                        | リサイズ可能グループ                      |
| `ScrollView`   | `(opts)`                        | コンテンツビューポート                    |
| `Modal`        | `(title, props?)`               | オーバーレイ（背景 + カード）             |
| `Markdown`     | `(text, opts?)`                 | 上記のサブツリー                          |
| `CodeBlock`    | `(code, lang, maxWidth, theme)` | なし（装飾的）                            |
| `Table`        | `(opts)`                        | role=grid                                 |

> `Slider`、`Dropdown`、および `Modal` は公開された `.d.ts` で緩く型付けされた（`any`）props を受け入れます。上記のオプションテーブルはソースコンストラクタから派生したものであり、正確な契約です。
