---
title: '@vectojs/ui コンポーネントリファレンス'
description: 'すべての@vectojs/uiコンポーネントの完全リファレンス：レイアウトコンテナ、フォームコントロール、オーバーレイ、リッチコンテンツ。'
order: 11
---

# `@vectojs/ui` — コンポーネントリファレンス

> VectoJSゼロDOM Canvasエンジン向けの再利用可能な高レベルコンポーネント。
> 文書化バージョン: **1.9.1**。信頼できるソース：`dist/index.d.ts`（公開サーフェス）および `packages/ui/src/*`（動作）。

すべてのコンポーネントはVirtual Math Tree（VMT）のリーフまたはコンテナです。ここにあるものは実際のDOMではありません — コンポーネントは `IRenderer` を介してCanvasに自身を描画します。アクセシビリティ、エージェント自動化、クローラビリティは、並行する**A11yシャドウDOM**から得られます：コンポーネントが `interactive` の場合、`Scene` はコンポーネントのボックスの上に配置された、単一の非表示で透明な実際のDOMノードを投影します。これは `getA11yAttributes()` から構築されます。これが、`page.getByRole('button', { name })` / `fill()` / スクリーンリーダーが純粋なCanvas UIに対して機能する理由です。

テキストのみのアプリケーションサーフェスは `@vectojs/ui/text` から `Text` をインポートできます。この軽量エントリはMarkdownとMathJaxをスタートアップグラフから除外します；複数のコンポーネントファミリーを構成する場合はルートの `@vectojs/ui` エントリを使用してください。

## ライブコンポーネントギャラリー

以下のギャラリーはパッケージレベルのスモークテストです。日常的なデバッグには、フォーカスされたコンポーネントページを使用して、すべてのコンポーネントをスクロールせずに1つの動作を検査できるようにしてください：

| エリア                 | コンポーネントページ                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| テキスト＆メディア     | [`Text`](/reference/ui-text/)、[`RichText`](/reference/ui-richtext/)、[`Link`](/reference/ui-link/)、[`Image`](/reference/ui-image/)                                                                                                                                                                                                                                                 |
| レイアウトコンテナ     | [`Card`](/reference/ui-card/)、[`Stack`](/reference/ui-stack/)、[`Flow`](/reference/ui-flow/)、[`ScrollView`](/reference/ui-scrollview/)、[`VirtualList`](/reference/ui-virtuallist/)、[`TreeView`](/reference/ui-treeview/)、[`Resizable panels`](/reference/ui-resizable-panel/)                                                                                                   |
| コントロール＆フォーム | [`Button`](/reference/ui-button/)、[`Input`](/reference/ui-input/)、[`TextArea`](/reference/ui-textarea/)、[`Checkbox`](/reference/ui-checkbox/)、[`Toggle`](/reference/ui-toggle/)、[`Slider`](/reference/ui-slider/)、[`Dropdown`](/reference/ui-dropdown/)、[`RadioGroup`](/reference/ui-radiogroup/)、[`Tabs`](/reference/ui-tabs/)、[`ProgressBar`](/reference/ui-progressbar/) |
| リッチコンテンツ       | [`Markdown`](/reference/ui-markdown/)、[`CodeBlock`](/reference/ui-codeblock/)、[`Table`](/reference/ui-table/)                                                                                                                                                                                                                                                                      |
| オーバーレイ＆一時的UI | [`Overlay`](/reference/ui-overlay/)、[`Tooltip`](/reference/ui-tooltip/)、[`Popover`](/reference/ui-popover/)、[`ContextMenu`](/reference/ui-contextmenu/)、[`Modal`](/reference/ui-modal/)                                                                                                                                                                                          |

<figure class="sandbox component-gallery">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · @vectojs/ui 1.9.1 · 内部をスクロール</span></div>
  <iframe src="/sandbox/ui-components.html" class="sandbox-frame component-gallery-frame" loading="eager" title="すべてのVectoJS UIコンポーネントのインタラクティブギャラリー" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>パッケージレベルのスモークギャラリー：まず広範なカバレッジ、特定の動作をデバッグするときはフォーカスされたコンポーネントページを。</figcaption>
</figure>

## すべてのコンポーネントで共有される規約

すべてのコンポーネントは `UIComponent` を拡張し、それはコアの `Entity` を拡張します。以下の継承メンバーは常に使用され、コンポーネントごとには**繰り返されません**。

| メンバー            | シグネチャ                                         | 備考                                                                                                                                                                           |
| ------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `setPosition`       | `setPosition(x, y): this`                          | ローカル空間配置；チェーン可能。                                                                                                                                               |
| `add` / `remove`    | `add(child: Entity): this` / `remove(child): this` | 子管理（コンテナは`add`をオーバーライドして再レイアウト）。                                                                                                                    |
| `on` / `off`        | `on(event, cb, { capture? }): this`                | DOM風のキャプチャ＋バブル。イベント：`click hover pointerdown pointerup pointercancel pointermove pointerleave change focus blur wheel keydown keyup`。                        |
| `emit`              | `emit(event, payload): void`                       | 直接自己専用ディスパッチ（ツリー伝搬なし）。                                                                                                                                   |
| `getGlobalPosition` | `getGlobalPosition(): Point`                       | 先祖変換を累積したワールド空間位置。                                                                                                                                           |
| `scene`             | `get scene`                                        | 最も近くにアタッチされた `Scene`；`onDemand`シーンで再描画を要求するには `this.scene?.markDirty()` を使用。                                                                    |
| `interactive`       | `interactive: boolean`                             | trueの場合、コンポーネントはA11yシャドウノードを投影し、ポインター/キーボードイベントを受信。                                                                                  |
| `clipChildren`      | `clipChildren: boolean`                            | 通常の子描画をローカルボックスにクリッピング。Canvas/SVGは正確；Threeは回転/せん断クリップにAABBシザーを使用。GPUポイント/WebGPUオーバーレイパスは不参加。`ScrollView`で使用。 |
| `width` / `height`  | `number`                                           | コンポーネントのボックス；ヒットテストとビューポートカリングを駆動。                                                                                                           |
| `padding`           | `number`                                           | 内部パディング（デフォルト `0`）；ボックススタイルコンポーネントはデフォルトがより高い。                                                                                       |
| transforms          | `x y scaleX scaleY rotation opacity`               | アフィン変換と乗算的不透明度は子に継承されます。                                                                                                                               |
| `animate`           | `animate(targetProps, durationMs): this`           | 数値トゥイーンをキューイング。                                                                                                                                                 |

---

## `UIComponent`（抽象基底）

```ts
abstract class UIComponent extends Entity {
  padding: number; // デフォルト0
  isPointInside(globalX: number, globalY: number): boolean;
  getBounds(): Bounds; // { x:0, y:0, width, height }

  // 出入りプレゼンスヘルパー
  protected enterMotion?: MotionSpec; // マウント時に再生
  protected exitMotion?: MotionSpec; // dismiss()で再生
  dismiss(): Promise<void>; // exitMotionを再生し、ツリーから削除
}
```

すべてのコンポーネントで共有されるボックスモデル＋軸平行（AABB）ヒットテストを集中管理します。`isPointInside` は点がローカル空間の `[0,width] × [0,height]` 内にあるかを返します。`getBounds()` はローカルボックスを返すため、`Scene` はビューポートカリングを行えます。サブクラスは測定されたコンテンツから `width`/`height` を設定し、`render(r)` を実装し、（インタラクティブな場合は）`getA11yAttributes()` をオーバーライドします。

**プレゼンス：** `enterMotion` / `exitMotion` を `MotionSpec`（`{ props: { opacity: [0, 1], … }, config? }`）として宣言すると、コンポーネントはライブシーンにマウントされたときにアニメーションインし、`dismiss()` でアニメーションアウトします — 終了アニメーションが解決されるまで自身の削除を延期します。[コアアニメーションシステム](/reference/core-api/#animation)上の1つの共有実装であり、コンポーネントごとの手作りスプリングを置き換えます。`prefers-reduced-motion` 下ではモーションは抑制されます（不透明度フェードは維持）。

### `getA11yAttributes(): A11yAttributes`

すべてのインタラクティブコンポーネントがオーバーライドするフック。返される形状（`@vectojs/core` から）は投影されるシャドウノードを駆動します：

```ts
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // デフォルト 'div'
  role?: string; // ARIAロール
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

## テキスト＆タイポグラフィ

### `Text`

```ts
new Text(text: string, opts?: TextOptions)

interface TextOptions {
  font?: string;                  // デフォルト '16px sans-serif'
  color?: string;                 // デフォルト '#e2e8f0'
  maxWidth?: number;              // 折り返し幅；省略 → 明示的な '\\n' のみで改行
  lineHeight?: number;            // 行送り（px）、デフォルト20
  preserveLeadingSpaces?: boolean;// デフォルト false
  selectable?: boolean;           // ブラウザネイティブのドラッグ選択、デフォルト true
}
```

ネイティブ`fillText`で描画される複数行テキスト。折り返し/測定はコアの`LayoutEngine`（`TextEntity`と同じ`Intl.Segmenter`パス）を**コールド/ホット分割**で通過します：

- `setText(text): this` — コールドパス（再セグメント化＋再測定）、その後再レイアウト。
- `append(text): this` — ストリーミング/タイプライターパス；`setText(this.text + text)` と同等ですが、エンジンの段落メモは変更されていない先頭段落を再利用するため、変更された最後の段落のみが再測定されます。
- `setMaxWidth(maxWidth): this` — **ホット**パス；キャッシュされた測定テキストのみを再折り返し（再セグメント化なし）。レスポンシブリフローにはこちらを推奨。
- `setSelectable(selectable): this` — 投影されたネイティブ選択サーフェスを有効または無効にします。

コンテンツ投影はブラウザの検索、選択、コピーのためにビジュアル改行と行高さをミラーリングします。静的テキストはインタラクティブなヒットターゲットではありません；Canvas/VMTがそのピクセルとレイアウトを所有します。

### `RichText`

```ts
new RichText(spans: StyledSpan[], opts?: RichTextOptions)

interface RichTextOptions {
  font?: string;                          // ベース略記、デフォルト '16px sans-serif'
  color?: string;                         // デフォルト塗りつぶし色、デフォルト '#e2e8f0'
  maxWidth?: number;                      // 折り返し幅
  baseStyle?: TextStyle;                  // すべてのランに継承（ランのスタイルが優先）
  linkColor?: string;                     // 独自色のないリンクランのデフォルト '#38bdf8'
  onLinkClick?: (href: string) => void;   // リンクランがアクティブになったときに発火
  exclusions?: ExclusionRect[];           // テキストが回り込む矩形（除外シェイプ/フロート）
  selectable?: boolean;                   // ブラウザネイティブのドラッグ選択、デフォルト true
}
```

マルチスタイルインラインテキスト：太字/斜体/色付き/異なるサイズのランが共有ベースライン上で流れ、折り返します。レイアウトはコアの`LayoutEngine.prepareRich`を使用；各グリフはそのランの色/ウェイト/スラントで描画されます。

- `setSpans(spans): this` — ランを置き換えて再レイアウト。
- `appendSpans(spans): this` — **ストリーミング**パス；リッチ段落メモは変更されていない先頭段落を再利用するため、トークンストリームはO(ドキュメント)ではなくO(変更された段落)で再準備されます。
- `setMaxWidth(maxWidth): this` — リフロー。
- `setExclusions(exclusions): this` — フロート領域を設定してリフロー。
- `setSelectable(selectable): this` — スパンを再構築せずにネイティブ選択を切り替え。

A11y：連続する**リンクラン**ごとに透明な`<a>`ホットスポット子ノードを取得（再折り返しで調整 — ランごとに1つのホットスポット；位置はその場で更新、リンク_数_の変更のみシャドウノードを再構築）。コンポーネント自身のアクセシブル名は連結された全文です。

### `measureText`、`wrapLines`、`wrapText`（フリー関数）

```ts
measureText(text: string, font: string): number
```

CSS `font` でのレンダリングピクセル幅。境界LRU（容量1000）でメモ化。アラビア語は測定前に整形されます。DOMがない場合、1文字あたり`0.5em`の推定値にフォールバック。

```ts
wrapLines(text: string, font: string, maxWidth: number): string[]
```

明示的な`\\n`を尊重する欲張りワードラップ。長すぎる単語はそれだけで1行になります（分割されません）。

```ts
wrapText(value: string, maxWidth: number, measure: (s: string) => number): WrappedLine[]

interface WrappedLine { text: string; start: number; end: number; }  // 絶対文字範囲
```

`wrapLines` と同様ですが、各行の絶対文字範囲を追跡し（線形キャレットオフセットを`(line, x)`にマッピング）、ハード`\\n`を消費し（末尾の改行はキャレットが置ける末尾の空行を生成）、長すぎる単一単語を文字レベルで分割します。`TextArea` で内部的に使用されます。

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
  maxWidth?: number;                       // 主軸の折り返ししきい値（水平）；デフォルト Infinity
  maxHeight?: number;                      // 主軸の折り返ししきい値（垂直）；デフォルト Infinity
}
```

子を主軸に沿って`gap`で順次配置し、交差軸で整列します。子は自身のサイズを保持 — `x`/`y`のみが設定されます。自身は何も描画しません。

- `add(child): this` — 追加してすぐに**`layout()`を再実行**。
- `layout(): void` — すべての子を配置し、コンテナをフィットするサイズにします（カリング可能にするため）。`add`以外で子を変更した後（例：子のリサイズ）は手動で呼び出します。

`wrap` がtrueの場合、主軸に沿って`maxWidth`/`maxHeight`を超える子は新しい行を開始します；コンテナは交差軸方向に成長します。

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

`{ direction: 'horizontal', wrap: true }` として事前構成された `Stack` — `maxWidth` を超えると次の行に折り返す水平アイテム。タグクラウド、チップ行に使用します。`add()`/`layout()` を継承。

### `Card`

```ts
new Card(opts: CardOptions)

interface CardOptions {
  width: number;          // 必須
  height: number;         // 必須
  bg?: string;            // デフォルト '#0f172a'
  border?: string;        // 省略 → 境界線なし
  borderWidth?: number;   // デフォルト 1
  radius?: number;        // デフォルト 12
  padding?: number;       // デフォルト 0（利用者が手動で子を配置）
  label?: string;         // 設定時 → interactive + role="group" ランドマーク
}
```

オプションの境界線を持つ角丸背景パネル。`add()` で子を追加；カードのローカル空間の上部にレンダリングされます。**デフォルトで装飾的**（シャドウノードなし、インタラクティブではない）。`label` を渡すとインタラクティブになり、`{ role: 'group', label }` を投影するため、支援技術/エージェントがリージョンを見つけられます。`padding` は情報提供のみ — 子を自動的にインセットしません。

---

## コントロール＆フォーム

以下のすべてのフォームコントロールは `interactive` で、実際のシャドウノードを投影します；キャンバスはシャドウノードのネイティブイベントによって駆動されるビジュアルミラーです。

### `Button`

```ts
new Button(label: string, opts?: ButtonOptions)

interface ButtonOptions {
  onClick?: (e: unknown) => void;  // Canvasヒットテストとシャドウ <button> クリックの両方で発火
  bg?: string;                     // デフォルト '#2563eb'
  hoverBg?: string;                // デフォルト '#3b82f6'
  color?: string;                  // ラベル色、デフォルト '#ffffff'
  font?: string;                   // デフォルト '600 16px sans-serif'
  padding?: number;                // デフォルト 12
  radius?: number;                 // デフォルト 8
}
```

中央寄せラベルの角丸矩形。`width` は `measureText(label, font) + 2·padding` に自動サイズ；`height` は `fontSizePx(font) + 2·padding` に（ラベルの測定幅ではなく、`font` からパースされたpxサイズ）。`{ tag: 'button', role: 'button', label }` を投影 → `getByRole('button', { name })` で駆動。パブリック状態：`focused`（`#00f0ff` フォーカスリングを描画）、内部 `hovered`（`hoverBg` に切り替え）。

### `Link`

```ts
new Link(label: string, opts: LinkOptions)   // opts必須（href）

interface LinkOptions {
  href: string;          // 必須；ナビゲーションターゲット＋シャドウ <a href>
  color?: string;        // デフォルト '#38bdf8'
  font?: string;         // デフォルト '16px sans-serif'
  underline?: boolean;   // デフォルト true
}
```

色付き（オプションで下線付き）テキスト。ラベルに自動サイズ。実際の `{ tag: 'a', href, label }` シャドウノードを投影（ネイティブでクリック可能/クロール可能）。Canvasヒットテストパスは `window.open(href, '_blank', 'noopener')` で開きます。

### `Image`

```ts
new Image(src: string, opts: ImageOptions)

interface ImageOptions {
  width: number;          // 必須（キャンバスはレイアウト/カリングに既知のボックスが必要）
  height: number;         // 必須
  alt?: string;           // デフォルト ''
  placeholder?: string;   // ロードまでの塗りつぶし、デフォルト '#1e293b'
  radius?: number;        // プレースホルダーの角丸、デフォルト 0
  onLoad?: () => void;    // ビットマップロード時に1回発火
}
```

`drawImage` で描画；`{ tag: 'img', src, alt, label: alt }` を投影。ロードは非同期 — 準備ができるまでプレースホルダーボックスが描画されます。`onDemand` シーンでは、ロード時に `onLoad: () => scene.markDirty()` を渡して再描画します。（`globalThis.Image` をシャドウ；クラスは `import { Image } from '@vectojs/ui'` で参照。）

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

**実際の透明な `<input>` シャドウノード**でバックエンドされた単一行フィールド。ブラウザがすべての入力をネイティブに処理 — クリック、キーボード、**IMEコンポジション**、選択、クリップボード、アンドゥ — その要素上で；キャンバスは描画のみを行います。`Scene` は `value`、`selectionStart`、`selectionEnd`、`composition` をペイロードに持つ `change` イベントを介して状態をミラーリングします。コンポーネントはこれらをパブリックフィールドとして再公開：

- `value: string`、`focused: boolean`（500msキャレット点滅を駆動）。
- `selectionStart` / `selectionEnd: number` — 実際の入力からミラーリングされたキャレット/選択オフセット。
- `composition: { start; length } | null` — アクティブなIMEプリエディット範囲（下線として描画）。

A11y：`{ tag: 'input', inputType: 'text', placeholder, value, label: placeholder }`。エージェントはロールで `fill()` し、人間はCJKを入力し、キャンバスはキャレット、選択ハイライト、IME下線、スクロール・トゥ・キャレット（`scrollLeft`）をレンダリング。レイアウトエンジンを介してRTL（ヘブライ語/アラビア語）範囲も処理。

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

**実際の透明な `<textarea>` シャドウノード**でバックエンドされた複数行フィールド — `Input` と同じミラーモデルに複数行ナビゲーションを追加。キャンバスは値（`wrapText` 経由）を再折り返し、テキスト、選択、キャレットを描画。パブリックフィールドは `Input` をミラー：`value`、`focused`、`selectionStart`、`selectionEnd`、`composition`。`lineHeightFactor` は `lineHeight` オプションを保持。

- `lineOfOffset(offset: number): number` — 線形文字オフセットを含むビジュアル（折り返し）行インデックス；境界オフセットは最も早い包含行に解決、範囲外は最後の行にクランプ。キャレット位置を行にマッピングするのに便利。

A11y：`textarea` シャドウノードを投影；エージェントが `fill()` し、人間がCJKを入力、レンダリングはゼロDOMを維持。垂直スクロール・トゥ・キャレットでアクティブ行を表示範囲内に保持（`scrollTop`）。

### `Checkbox`

```ts
new Checkbox(opts: CheckboxOptions)

interface CheckboxOptions {
  checked?: boolean;   // デフォルト false
  label?: string;      // 右側に描画；アクセシブル名として使用
  size?: number;       // ボックスサイズpx、デフォルト20
  font?: string;       // デフォルト '16px sans-serif'
  color?: string;      // ラベル色、デフォルト '#e2e8f0'
  accent?: string;     // チェック時の塗りつぶし、デフォルト '#2563eb'
  border?: string;     // 未チェック時の境界線、デフォルト '#475569'
  onChange?: (checked: boolean) => void;
}
```

実際の `<input type="checkbox">` シャドウノードでバックエンド — エージェント/支援技術でネイティブにトグル可能。Canvasの`click`とシャドウノードのネイティブ`change`はどちらも1つのガード付きセッターを経由（変更されていない値での重複`onChange`なし）。パブリック：`checked`。A11y：`{ tag: 'input', inputType: 'checkbox', checked, label }`。

### `Toggle`

```ts
new Toggle(opts: ToggleOptions)

interface ToggleOptions {
  checked?: boolean;   // デフォルト false
  label?: string;      // 右側に描画；アクセシブル名として使用
  width?: number;      // トラック幅px、デフォルト44（trackWとして公開）
  height?: number;     // トラック高さpx、デフォルト24（trackHとして公開）
  font?: string;       // デフォルト '16px sans-serif'
  color?: string;      // ラベル色、デフォルト '#e2e8f0'
  accent?: string;     // ON状態のトラック塗りつぶし、デフォルト '#2563eb'
  track?: string;      // OFF状態のトラック塗りつぶし、デフォルト '#475569'
  onChange?: (checked: boolean) => void;
}
```

iOSスタイルのスイッチ。`{ role: 'switch', checked, label }` を `aria-checked` と共に投影。`role="switch"` は `div` であるため（`Scene` によってネイティブ変更が転送されない）、`click` は自己 `change` イベントを再発行；単一の `change` ハンドラーが信頼できる情報源であり、外部の `on('change', …)` リスナーと `onChange` コールバックの両方が発火します。パブリック：`checked`、`trackW`、`trackH`。

### `Slider`

```ts
new Slider(props?: SliderProps)   // propsは.d.tsで疎に型付け（any）

// 認識されるprops（コンストラクタで読み取り）：
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

円形のつまみを持つ水平スライダー。パブリック：`min`、`max`、`value`、`step`。ドラッグ（`pointerdown` → `pointermove` → `pointerup`）はポインター `localX` を値にマッピングし、`min` をアンカーとする `step` グリッドにスナップ（デフォルトは整数ステップ、`input[type=range]` セマンティクスに一致）、`{ value }` を持つ `change` イベントを発行（`on('change', e => e.value)` で購読）。キーボード：`ArrowRight`/`ArrowUp` でステップアップ、`ArrowLeft`/`ArrowDown` でステップダウン、`Home`/`End` で `min`/`max` にジャンプ。A11y：`{ role: 'slider', value, valuemin, valuemax }`。古い1.0より前のUIビルドでは整数値のみでキーボード処理がありませんでした。

### `Dropdown`

```ts
new Dropdown(options: string[], props?: DropdownProps)  // propsは疎に型付け（any）

// 認識されるprops：
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

コンボボックス：`Button` が現在値を表示；クリック（または`ArrowDown`/`ArrowUp`/`Enter`/`Space`）でオプション `Button` の `Stack` メニューと全画面透明背景を開き、両方とも `scene.showOverlay(...)` 経由でマウント。`Escape` または背景クリックで `scene.hideOverlay(...)` 経由で閉じます。選択は `{ value }` を持つ `change` イベントを発行。キーボードナビゲーションはハイライトされたインデックスを追跡；`activedescendant` とオプションID（`${id}-opt-${i}`）はARIA用に配線されています。

ルートのA11y：`{ role: 'combobox', expanded, controls, haspopup: 'listbox', value, activedescendant }`。メニューは `role="listbox"`、各オプションは `role="option"` と `selected` を投影。

---

## オーバーレイ

### `Modal`

```ts
new Modal(title: string, props?: ModalProps)  // propsは疎に型付け（any）

// 認識されるprops：
{
  width?: number;       // 背景、デフォルト window.innerWidth（フォールバック800）
  height?: number;      // 背景、デフォルト window.innerHeight（フォールバック600）
  backdropColor?: string; // デフォルト 'rgba(0, 0, 0, 0.5)'
  modalWidth?: number;  // 中央カード、デフォルト400
  modalHeight?: number; // デフォルト250
  cardBg?: string;      // デフォルト 'rgba(15, 23, 42, 0.95)'
  cardBorder?: string;  // デフォルト 'rgba(255, 255, 255, 0.15)'
}
```

中央に配置された `Card`（`title` テキストと組み込みの「閉じる」ボタンを含む）を備えた全画面調光背景。カードは共有[アニメーションシステム](/reference/core-api/#animation)を通じてマウント時にスプリングでスケールイン；下層の `click`/`pointerdown` をブロック。`scene.showOverlay(modal)` で表示。

- `close(): Promise<void>` — カードスケールをスプリングで0に戻し、終了アニメーションが解決されたら `scene.hideOverlay(this)` 経由でアンマウント（安全な遅延ティアダウン）。Await可能。
- `update(dt, time)` — スプリングを刻み、アニメーション中はシーンをダーティとしてマーク（レンダーループから呼び出される）。

### `ScrollView`

```ts
new ScrollView(opts: ScrollViewOptions)

interface ScrollViewOptions { width: number; height: number; }
```

ホイール＋ポインタードラッグスクロールとスプリング物理（摩擦 `0.85`、スプリング `0.1`）を備えたクリッピングビューポート（`clipChildren = true`）。子は変換される非インタラクティブな `content` Entityの中に存在；ビューポートボックスは固定。

- `content: Entity` — スクロールされるコンテナ（パブリック）。
- `add(child): this` / `remove(child): this` — `content` を変更し、`updateContentSize()` を呼び出す。
- `updateContentSize(): void` — 子の範囲から `content.width/height` を再計算し、最大スクロール範囲を設定する（子を直接変更した後に呼び出す）。
- `scrollTo(y: number): void` — **0が上部**のYオフセットにスクロール（内部でクランプ；パブリックスクロールAPIは0.1.1で追加）。
- `scrollToBottom(): void` — コンテンツの最後にジャンプ（0.1.1で追加）。
- `update(dt, time)` — スプリングを目標オフセットに向けて積分（レンダーループから呼び出される）。

ホイールスクロールは `Ctrl` を押している場合を除き `preventDefault()` を呼び出します（ブラウザのズームを許可）。ポインタードラッグはコンテンツをカーソル/指と1:1で移動。スクロールターゲットは `[-maxScroll, 0]` にクランプ。

```ts
const sv = new ScrollView({ width: 360, height: 480 });
sv.add(longContent);
scene.add(sv.setPosition(20, 20));
sv.scrollToBottom(); // 例：追加後のチャットログ
```

---

## コンテンツ／リッチドキュメント

### `Markdown`

```ts
new Markdown(markdownText: string, opts?: MarkdownOptions)

interface MarkdownOptions {
  maxWidth?: number;     // デフォルト 800
  theme?: MarkdownTheme;
  onLinkClick?: (href: string) => void;
  selectable?: boolean;  // デフォルト true；レンダリングされたテキスト/コード/テーブルセルに伝播
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

**`marked`（v18, GFM）** でMarkdownをパースし、垂直 `Stack`（`content`、gap 16）の下のVMTサブツリーに変換。サポートされるトークン：見出し（h1–h6、スケールサイズ）、段落（ワードラップされた`RichText`）、フェンスコードブロック（キーワードハイライト付き`CodeBlock`）、ブロッククォート（左アクセントバー）、順序付き/順序なしリスト、水平線、インラインコード、リンク — および**GFMテーブル**（`Table` コンポーネント経由でレンダリング；GFMテーブルサポートは0.1.1で追加）。`content.width`/`height` がコンポーネントのサイズを決定。

2つのコンテンツ更新パス — **ストリーミングには正しい方を選ぶことが重要：**

- `setContent(markdown): this` — **完全再構築**：すべての子を破棄し、ゼロから再レンダリング。ワンショット/置換に使用。
- `appendMarkdown(chunk): this` — **正しいストリーミング/トークンパス**。生バッファに追加し、完全なMarkdownソースを再レックスし、生ソースでトークンを差分し、変更されていないプレフィックスエンティティを再利用し、最後の（成長中の）段落を `RichText.setSpans` でその場で更新。完全なエンティティツリーの再構築は回避しますが、レキシングはドキュメント長に比例します。
- `setSelectable(selectable): this` — 既存のテキスト/コード/テーブル子孫を更新し、将来のストリーミングノードのデフォルトになります。

> 落とし穴：トークンごとに `setContent(fullSoFar)` を呼び出してストリーミング**しないでください**。トークンごとにツリー全体を再構築し（トークンあたりO(ドキュメント)）、レイアウトコストがドキュメントとともに成長します。新しいデルタのみを `appendMarkdown(chunk)` に供給してください。

```ts
const md = new Markdown('', { maxWidth: 600 });
scene.add(md.setPosition(40, 40));
for await (const token of llmStream) md.appendMarkdown(token); // 変更されていないレンダリング済みプレフィックスを再利用
```

### `CodeBlock`

```ts
new CodeBlock(code: string, lang: string, maxWidth: number, theme: Required<MarkdownTheme>, selectable = true)
```

フェンスコード用の単一自己レンダリングリーフ：角丸背景＋行ごと、セグメントごとの色付きテキスト（`js`/`ts`/`py`/`rust` とエイリアスのキーワード/文字列/コメント/数値ハイライト）。古い行ごと/セグメントごとの子エンティティ爆発を1つのフラットリーフに置き換え。**装飾的** — `isPointInside()` は常に `false` を返します。

- `setCode(code, lang?): this` — コンテンツを再パース（例：ライブ編集）。
- `setSelectable(selectable): this` — 正確ソースコンテンツ投影を切り替え。

UI 1.9はCore 1.8の `PreparedContentGrid` を、グリフごとのCanvasペイントとセマンティック投影の間で共有します。タブ、ワイドCJK/絵文字、アラビア語整形、bidi、Firefoxフォント代替、DPR/ズーム、アフィン変換は、したがって1つのソース認識ジオメトリ計画を維持します。

注意：`theme` は完全に解決された `Required<MarkdownTheme>` でなければなりません。実際には `CodeBlock` は内部的に `Markdown` によって生成されます；完全なテーマを提供する場合にのみ直接構築してください。

### `Table`

```ts
new Table(opts: TableOptions)

interface TableOptions {
  headers: (string | Entity)[];     // 必須；Entityインスタンスは一意でなければならない
  rows: (string | Entity)[][];      // 必須（2D行×列）
  colWidths?: number[];       // 列ごとのpx；headers.lengthと一致する必要あり、さもなければ均等分配
  width?: number;             // 全体の幅、デフォルト600
  rowHeight?: number;         // デフォルト36
  bg?: string;                // デフォルト 'rgba(15, 15, 25, 0.4)'
  headerBg?: string;          // デフォルト 'rgba(255, 255, 255, 0.08)'
  borderColor?: string;       // デフォルト 'rgba(255, 255, 255, 0.15)'
  headerTextColor?: string;   // デフォルト '#ffffff'
  textColor?: string;         // デフォルト '#e2e8f0'
  font?: string;              // デフォルト '14px sans-serif'
  selectable?: boolean;       // ネイティブセルテキスト選択、デフォルト true
}
```

Canvasネイティブデータグリッド：文字列セルはText子エンティティに、Entityセルはパブリック `setMaxWidth()` で制約され、`layout()` は描画専用 `render()` パスの前に折り返し、行高さ、位置を解決します。外部セルコンテンツを変更した後に `layout()` を呼び出します。各セルは1つのコンテンツ投影を所有。A11y：`{ role: 'grid', label: 'N列M行のデータテーブルです。' }` を支援技術に投影。また、`Markdown` 内のGFMテーブルのレンダラーでもあります。

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

`{ role: 'radiogroup' }` で投影される相互排他的なラジオ選択グループ；アプリケーションはラベルとキーボード/フォーカス動作を確認する必要があります。標準化された `'change'` イベントペイロードは `{ value }` を運びます。

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
  onChange?: (value: string) => void;
}

interface TabItem {
  id: string;
  label: string;
  content: Entity;
}
```

タブ選択コンテナ。アクティブなタブのコンテンツビューを自動マウントし、残りのスペース内で変換。`{ role: 'tablist' }` をアクセシビリティ用に投影。標準化された `'change'` イベントペイロードは `{ value }` を運びます。

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

進行状況トラックを表示するプログレスバー。中央揃えのテキストオプション。アクセシビリティ用に `{ role: 'progressbar', value }` を投影。

- `setValue(value: number): void` — 安全な境界チェックで値を更新。

---

### `Overlay`

```ts
new Overlay(opts: OverlayOptions)

interface OverlayOptions {
  target: Entity;
  content: Entity;
  placement?: Placement; // 'top' | 'bottom' | 'left' | 'right' | 'top-start' | 等
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
  delay?: number; // 表示前のms、デフォルト 300
}
```

フローティングホバーツールチップヘルパー。ターゲットに対するホバー時にツールチップコンテナを投影。

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

フローティングクリックポップオーバーパネル。ターゲットをクリックするとポップオーバー表示、外側をクリックすると自動的に非表示。

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

右クリックでトリガーされるメニューコンポーネント。アイコン、ショートカット、区切り線、再帰的サブメニューをサポート。

- `showAtPoint(x: number, y: number): void` — グローバル画面位置にメニューを表示。

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

高性能レンダリングに最適化されたスクロールリストコンテナ。現在ビューポート範囲内のアイテムのみをインスタンス化/レンダリング。

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

ネストされたツリーナビゲーター。同期的な子配列または非同期遅延ロード関数リゾルバーをサポート。

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

| コンポーネント | コンストラクタ                  | シャドウノード / ロール                 |
| -------------- | ------------------------------- | --------------------------------------- |
| `Text`         | `(text, opts?)`                 | `div`（name = text）                    |
| `RichText`     | `(spans, opts?)`                | `div` + リンクごとの`<a>`ホットスポット |
| `Button`       | `(label, opts?)`                | `button` role=button                    |
| `Link`         | `(label, opts)`                 | `a[href]`                               |
| `Image`        | `(src, opts)`                   | `img[src,alt]`                          |
| `Card`         | `(opts)`                        | なし、またはrole=group + `label`        |
| `Stack`        | `(opts?)`                       | なし（構造的）                          |
| `Flow`         | `(opts?)`                       | なし（構造的）                          |
| `Input`        | `(opts)`                        | 透明な `input`                          |
| `TextArea`     | `(opts)`                        | 透明な `textarea`                       |
| `Checkbox`     | `(opts)`                        | `input[type=checkbox]`                  |
| `Toggle`       | `(opts)`                        | role=switch                             |
| `Slider`       | `(props?)`                      | role=slider                             |
| `Dropdown`     | `(options, props?)`             | role=combobox + listbox/option          |
| `RadioGroup`   | `(opts)`                        | role=radiogroup                         |
| `Tabs`         | `(opts)`                        | role=tablist                            |
| `ProgressBar`  | `(opts?)`                       | role=progressbar                        |
| `Overlay`      | `(opts)`                        | なし（構造的）                          |
| `Tooltip`      | `(opts)`                        | tooltip                                 |
| `Popover`      | `(opts)`                        | popover panel                           |
| `ContextMenu`  | `(opts)`                        | context menu list                       |
| `VirtualList`  | `(opts)`                        | viewport scroll                         |
| `TreeView`     | `(opts)`                        | tree node view                          |
| `PanelGroup`   | `(opts)`                        | resizable group                         |
| `ScrollView`   | `(opts)`                        | content viewport                        |
| `Modal`        | `(title, props?)`               | overlay（backdrop + card）              |
| `Markdown`     | `(text, opts?)`                 | 上記のサブツリー                        |
| `CodeBlock`    | `(code, lang, maxWidth, theme)` | なし（装飾的）                          |
| `Table`        | `(opts)`                        | role=grid                               |

> `Slider`、`Dropdown`、`Modal` は公開された `.d.ts` で疎に型付け（`any`）されたpropsを受け入れます；上記のオプションテーブルはソースコンストラクタから派生したもので、正確な契約です。
