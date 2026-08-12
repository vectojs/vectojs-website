+++
title = "Button"
description = "アクセシビリティと自動化のためのセマンティックなbutton投影を備えた、canvasレンダリングされたボタンコンポーネント。"
weight = 12
+++

# `Button`

`Button` は角丸のcanvasボタンをレンダリングし、同じボックスの上に実際の透明な `<button>` を投影します。ユーザーにはcanvasのピクセルが見えます。スクリーンリーダーと自動化ツールはセマンティックノードを操作します。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Button</span></div>
  <iframe src="/sandbox/ui/button.html?v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame" loading="eager" title="Button live demo" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>ホバーすると描画される状態が変わります。クリックは、Playwrightが見つけられるのと同じbuttonロールを通じてルーティングされます。</figcaption>
</figure>

## 最小限の例

```ts
import { Scene } from '@vectojs/core';
import { Button } from '@vectojs/ui';

const scene = new Scene(canvas);
scene.renderMode = 'onDemand';

scene.add(
  new Button('Save changes', {
    onClick: () => save(),
  }).setPosition(40, 40),
);

scene.start();
```

## コンストラクタ

```ts
new Button(label: string, opts?: ButtonOptions & { width?: number; height?: number })

interface ButtonOptions {
  onClick?: (event: unknown) => void;
  bg?: string;
  hoverBg?: string;
  color?: string;
  font?: string;
  padding?: number;
  radius?: number;
  focusColor?: string;       // 2.7.0+ — focus-ring color, default '#00f0ff'
}
```

フォーカスリングは `focusColor` で 2px のストロークとして描画されます。シアンのデフォルトが調整されたダークのデフォルトパレット以外のテーマでは、これを設定してください：

```ts
const save = new Button('Save', { bg: '#f43f5e', focusColor: '#60a5fa' });
```

フォーカスリングは、キーボードユーザーにとって欠かせない唯一のアフォーダンスです。そのため、単に存在するだけでなく、サーフェス上で明確に読み取れる必要があります — 3:1 の非テキストコントラスト下限（WCAG SC 1.4.11）を超えることを目指し、アクセントカラーとは異なる色相を選んで、フォーカスが通常の強調と誤読されないようにしてください。強制カラーモードではリングは無視され、システムの `Highlight` 色が優先されるため、これを設定してもハイコントラストを壊すことはありません。

## アクセシビリティと自動化

`Button` は `{ tag: 'button', role: 'button', label }` を公開するため、テストはピクセルではなくセマンティックなコントロールを対象とすべきです：

```ts
await page.getByRole('button', { name: 'Save changes' }).click();
```

### `disabled` (2.3.0+)

`disabled` はミュートされて描画される**とともに**、シャドウ `<button>` に投影されます。そのため、視覚的なユーザーが見るものとスクリーンリーダーが報告するものが乖離することはありません。コンストラクション後に設定可能です：

```ts
const save = new Button('Save', { onClick: submit });
save.disabled = true; // ミュートされた塗りつぶし、`disabled`を投影、ホバー/フォーカス状態を破棄
```

また、これは**両方の**入力パスから `onClick` をブロックします。ブラウザは無効化された `<button>` でのDOMのクリックを抑制しますが、キャンバスのヒットテストは独立してディスパッチされるため、ネイティブ属性だけでは十分ではありません。

有効なボタンは `disabled="false"` を書き込むのではなく、属性を省略します。ネイティブの `<button>` でそれを書き込むと、依然としてボタンが無効化されてしまうためです。

## 強制カラー（ハイコントラスト）

`Button` は [`Scene.forcedColors`](/reference/core-scene/#アクセシビリティと外観) を読み取り、OS が強制カラーモードの場合、テーマパレットの代わりに CSS システムカラーで再描画します：`ButtonFace` 填色、`ButtonText` ラベルに加えて 1px の `ButtonText` ボーダー（システム背景に対して形状を視認可能にするため）、および `Highlight` フォーカスリング。Canvas ピクセルはブラウザの強制カラーリマッピングの対象外であるため、この処理をスキップしたコンポーネントはハイコントラストモードでは読み取れません。設定が切り替わるとシーンは自動的に再描画されます。

## メンテナスチェックリスト

- `onDemand` シーンでは、ホバーとポインタ離脱時に `scene.markDirty()` を呼び出してください。
- 視覚的なボタンラベルとアクセシブルラベルは、将来のオプションで明示的なアクセシブル名が追加されない限り、一致したままにしてください。
- ドキュメントの例では、カスタムのクリッカブルな矩形ではなく `Button` を優先してください。
- カスタムボタンコンポーネントは上記の強制カラーブランチをミラーしてください。

関連情報: [`Toggle`](/reference/ui-components/#toggle)、[`Checkbox`](/reference/ui-components/#checkbox)、[`Overlay`](/reference/ui-overlay/)。
