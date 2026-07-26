---
title: 'UI: Dropdown'
description: 'オーバーレイのリストボックスとキーボードナビゲーションを備えたコンボボックスコントロール。'
order: 27
---

# `Dropdown`

`Dropdown` はcanvasボタンをラップし、`role="combobox"` を投影し、オーバーレイのリストボックスを開きます。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Dropdown</span></div>
  <iframe src="/sandbox/ui/component.html?name=dropdown&v=core-1.17.0-ui-2.2.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Dropdown live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>ポインターまたはキーボードで開きます。メニューはシーンのオーバーレイパスを通じてマウントされます。</figcaption>
</figure>

## 最小限の例

```ts
import { Dropdown } from '@vectojs/ui';

const backend = new Dropdown(['Canvas', 'WebGL', 'WebGPU'], {
  label: 'Renderer backend',
  width: 220,
  onChange: (value) => setBackend(value),
});
```

> **`label` を設定してください。** アクセシブルな名前のない `role=\"combobox\"` は単なる「コンボボックス」として読み上げられます（WCAG 4.1.2）。選択された値だけでは、そのコントロールの目的は伝わりません。キャンバス上に描画された視覚的なラベルはセマンティックレイヤーに到達しないため、ここでもラベルを渡してください。`@vectojs/ui@2.2.0` 以降で利用可能です。

## メンテナー向けチェックリスト

- `expanded`、`controls`、`activedescendant` のメタデータを同期させ続けます。
- 外側クリックとEscapeでオーバーレイを閉じます。
- ArrowUp、ArrowDown、Enter、Space、Escapeをテストします。
