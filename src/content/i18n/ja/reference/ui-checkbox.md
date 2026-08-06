---
title: 'UI: Checkbox'
description: 'ネイティブのinputセマンティクスとcanvasの視覚状態を備えたチェックボックスコントロール。'
order: 25
---

# `Checkbox`

`Checkbox` は実際のチェックボックスinputを投影し、視覚状態をcanvasに描画します。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Checkbox</span></div>
  <iframe src="/sandbox/ui/component.html?name=checkbox&v=core-1.32.2-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Checkbox live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>canvasのクリックとネイティブのinput変更は同じ `change` パスを共有します。</figcaption>
</figure>

## 最小限の例

```ts
import { Checkbox } from '@vectojs/ui';

const enabled = new Checkbox({
  checked: true,
  label: 'Enable semantic projection',
  onChange: (checked) => setEnabled(checked),
});
```

## メンテナー向けチェックリスト

- `checked` と投影されたinputの状態を同期させ続けます。
- 視覚状態が変わったら `scene.markDirty()` を呼び出します。
- 周囲のコンテキストがすでにコントロールを名付けていない限り、ラベルを使用します。
