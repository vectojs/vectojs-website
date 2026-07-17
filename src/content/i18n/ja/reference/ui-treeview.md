---
title: 'UI: TreeView'
description: '先読みまたは遅延の子読み込みを備えた階層ツリーコンポーネント。'
order: 34
---

# `TreeView`

`TreeView` は展開状態とオプションの遅延子読み込みを備えた階層的な行をレンダリングします。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TreeView</span></div>
  <iframe src="/sandbox/ui/component.html?name=treeview&v=core-1.9.2-ui-1.9.5" class="sandbox-frame component-demo-frame-tall" loading="eager" title="TreeView live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>親の行をクリックして展開または折りたたみます。</figcaption>
</figure>

## 最小限の例

```ts
import { TreeView } from '@vectojs/ui';

const tree = new TreeView({
  width: 280,
  height: 360,
  nodes: [{ id: 'packages', label: 'packages', children: [{ id: 'ui', label: 'ui' }] }],
});
```

## メンテナー向けチェックリスト

- 展開、折りたたみ、またはノードの置き換え後に行を再構築します。
- 遅延ローダーは冪等に保ちます。
- 選択と展開状態には安定したノードIDを使用します。
