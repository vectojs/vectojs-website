---
title: 'UI: Toggle'
description: 'role=switch セマンティクスとスプリングによるノブモーションを備えたスイッチコントロール。'
order: 26
---

# `Toggle`

`Toggle` はスイッチスタイルのブールコントロールです。`role="switch"` を投影し、共有のアニメーションシステムでノブをアニメーションします。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Toggle</span></div>
  <iframe src="/sandbox/ui/component.html?name=toggle&v=core-1.32.6-ui-2.15.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Toggle live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>セマンティックな `checked` 状態を最新に保ちながら、ノブが滑らかに再ターゲットします。</figcaption>
</figure>

## 最小限の例

```ts
import { Toggle } from '@vectojs/ui';

const darkMode = new Toggle({
  checked: true,
  label: 'Dark mode',
  onChange: (checked) => setDarkMode(checked),
});
```

## メンテナー向けチェックリスト

- ノブのアニメーションとセマンティックな状態を一致させ続けます。
- 共有のアニメーションシステムを通じてモーション軽減を尊重します。
- スイッチではないブール選択には `Checkbox` を推奨します。
