---
title: 'UI: Flow'
description: 'チップ、タグ、レスポンシブなツールバーのための水平方向の折り返しレイアウトコンテナ。'
order: 22
---

# `Flow`

`Flow` は水平方向の折り返し用に事前設定された `Stack` です。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Flow</span></div>
  <iframe src="/sandbox/ui/component.html?name=flow&v=core-1.31.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Flow live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>`maxWidth` を使用して、子要素が次の行に折り返される位置を定義します。</figcaption>
</figure>

## 最小限の例

```ts
import { Button, Flow } from '@vectojs/ui';

const chips = new Flow({ gap: 8, maxWidth: 360 });
for (const label of ['Canvas', 'WebGL', 'WebGPU']) {
  chips.add(new Button(label, { padding: 8 }));
}
```

## メンテナー向けチェックリスト

- 子要素のサイズが変わった後は `layout()` を再実行します。
- チップのタッチターゲットはモバイルに十分な大きさに保ちます。
- タグ行には手動のx/y配置よりも `Flow` を推奨します。
