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
  <iframe src="/sandbox/ui/button.html?v=core-1.15.0-ui-2.0.0" class="sandbox-frame component-demo-frame" loading="eager" title="Button live demo" sandbox="allow-scripts allow-same-origin"></iframe>
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

## メンテナー向けチェックリスト

- `onDemand` シーンでは、ホバーとポインター離脱で `scene.markDirty()` を呼び出す必要があります。
- 将来のオプションが明示的なアクセシブルネームを追加しない限り、視覚的なボタンラベルとアクセシブルラベルは同一に保つ必要があります。
- ドキュメントの例では、カスタムのクリック可能な矩形よりも `Button` を推奨します。

関連情報: [`Toggle`](/reference/ui-components/#toggle)、[`Checkbox`](/reference/ui-components/#checkbox)、[`Overlay`](/reference/ui-overlay/)。
