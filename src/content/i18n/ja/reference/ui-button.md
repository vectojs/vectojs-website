---
title: 'Button'
description: 'アクセシビリティと自動化のためのセマンティックなbutton投影を備えた、canvasレンダリングされたボタンコンポーネント。'
order: 12
---

# `Button`

`Button` は角丸のcanvasボタンをレンダリングし、同じボックスの上に実際の透明な `<button>` を投影します。ユーザーにはcanvasのピクセルが見えます。スクリーンリーダーと自動化ツールはセマンティックノードを操作します。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Button</span></div>
  <iframe src="/sandbox/ui/button.html?v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame" loading="eager" title="Button live demo" sandbox="allow-scripts allow-same-origin"></iframe>
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
}
```

## アクセシビリティと自動化

`Button` は `{ tag: 'button', role: 'button', label }` を公開するため、テストはピクセルではなくセマンティックなコントロールを対象とすべきです：

```ts
await page.getByRole('button', { name: 'Save changes' }).click();
```

## 強制カラー（ハイコントラスト）

`Button` は [`Scene.forcedColors`](/reference/core-scene/#accessibility--appearance) を読み取り、OS が強制カラーモードの場合、テーマパレットの代わりに CSS システムカラーで再描画します：`ButtonFace` 填色、`ButtonText` ラベルに加えて 1px の `ButtonText` ボーダー（システム背景に対して形状を視認可能にするため）、および `Highlight` フォーカスリング。Canvas ピクセルはブラウザの強制カラーリマッピングの対象外であるため、この処理をスキップしたコンポーネントはハイコントラストモードでは読み取れません。設定が切り替わるとシーンは自動的に再描画されます。

## メンテナスチェックリスト

- `onDemand` シーンでは、ホバーとポインタ離脱時に `scene.markDirty()` を呼び出してください。
- 視覚的なボタンラベルとアクセシブルラベルは、将来のオプションで明示的なアクセシブル名が追加されない限り、一致したままにしてください。
- ドキュメントの例では、カスタムのクリッカブルな矩形ではなく `Button` を優先してください。
- カスタムボタンコンポーネントは上記の強制カラーブランチをミラーしてください。

関連情報: [`Toggle`](/reference/ui-components/#toggle)、[`Checkbox`](/reference/ui-components/#checkbox)、[`Overlay`](/reference/ui-overlay/)。
