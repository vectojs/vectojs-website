---
title: 'UI: TextArea'
description: 'canvasレンダリングによる複数行のネイティブテキスト編集。'
order: 24
---

# `TextArea`

`TextArea` はネイティブの `<textarea>` をcanvasにミラーリングし、ブラウザの編集動作を保持します。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TextArea</span></div>
  <iframe src="/sandbox/ui/component.html?name=textarea&v=core-1.9.0-ui-1.9.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="TextArea live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>複数行編集はネイティブです。canvasは視覚的なミラーを描画します。</figcaption>
</figure>

## 最小限の例

```ts
import { TextArea } from '@vectojs/ui';

const notes = new TextArea({
  width: 420,
  height: 140,
  placeholder: 'Write a note…',
  onChange: (value) => saveDraft(value),
});
```

## メンテナー向けチェックリスト

- 実際の複数行テキスト入力にはこれを使用します。
- テキスト編集の所有者は1つに保ちます。canvas内でIMEやクリップボードを偽装しないでください。
- ポインタークリックだけでなく、キーボードでの選択と貼り付けでテストします。
- 透明なネイティブtextareaはcanvasのフォント、行の高さ、パディング、および
  `border-box` 契約を継承するため、クリックによるキャレット配置と選択行は、
  表示されるcanvasミラーと同じジオメトリを使用します。
