---
title: 'UI: RadioGroup'
description: '相互排他的なラジオ選択肢を1つのcanvasコンポーネントとしてレンダリングします。'
order: 28
---

# `RadioGroup`

`RadioGroup` は相互排他的な一連のオプションをレンダリングし、グループレベルのセマンティックロールを公開します。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · RadioGroup</span></div>
  <iframe src="/sandbox/ui/component.html?name=radiogroup&v=core-1.30.0-ui-2.12.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="RadioGroup live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>デモは幅が狭いときに水平レイアウトと垂直レイアウトを切り替えます。</figcaption>
</figure>

## 最小限の例

```ts
import { RadioGroup } from '@vectojs/ui';

const renderer = new RadioGroup({
  value: 'webgpu',
  direction: 'horizontal',
  options: [
    { value: 'canvas', label: 'Canvas' },
    { value: 'webgl', label: 'WebGL' },
    { value: 'webgpu', label: 'WebGPU' },
  ],
});
```

`RadioGroup` は `{ role: 'radiogroup', label }` を投影します。2.8.0 以降、グループ自身のアクセシブルな名前を設定でき、デフォルトは一般的な `'Radio group'` です：

```ts
new RadioGroup({
  label: 'Render backend',
  options: [
    { value: 'canvas', label: 'Canvas' },
    { value: 'webgl', label: 'WebGL' },
  ],
});
```

各オプションは独自の名前を持ちますが、_どの選択が行われているか_を示すのはグループの名前です。画面上に複数のグループがある場合、デフォルトではスクリーンリーダーユーザーは "Radio group" を繰り返し聞くことになり、区別する方法がありません — グループを識別する視覚的な見出しがグループの一部ではなくキャンバス上に描かれている場合は、必ず設定してください（WCAG 4.1.2）。また、コンストラクション後にパブリックフィールドとして設定することもできます。

## メンテナー向けチェックリスト

- 選択された視覚状態と発行される値を一致させ続けます。
- 無効化のスタイリングと動作を併せて使用します。
- ラベル、フォント、方向が変わったらレイアウトを再計算します。
