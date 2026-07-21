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
  <iframe src="/sandbox/ui/component.html?name=radiogroup&v=core-1.15.0-ui-2.0.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="RadioGroup live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## メンテナー向けチェックリスト

- 選択された視覚状態と発行される値を一致させ続けます。
- 無効化のスタイリングと動作を併せて使用します。
- ラベル、フォント、方向が変わったらレイアウトを再計算します。
