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
  <iframe src="/sandbox/ui/component.html?name=textarea&v=core-1.17.1-ui-2.3.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="TextArea live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## IME コンポジション

IME コンポジションがアクティブな間、コンポーネントはコンポジション範囲の下にアンダーラインを描画します。この間、**選択ハイライトは抑制されます**：選択されたテキストの上にコンポジションを行うと論理的にその範囲を置き換えますが、ネイティブ要素はコンポジションがコミットされるまでコンポジション前の `selectionStart`/`selectionEnd` を報告し続けます——これを描画すると、コンポジションアンダーラインの後ろ（かつより広い）に古いハイライトが表示されます。長さゼロのコンポジション（最初の `compositionstart`）は、まだ何も置き換えていないため、選択を引き続き表示します。

## メンテナー向けチェックリスト

- これは本物の複数行テキスト入力に使用してください。
- テキスト編集のオーナーを1つに保ち、canvas で IME やクリップボードを偽造しないでください。
- キーボードでの選択と貼り付けでテストし、ポインタクリックのみにしないでください。
- 透過されたネイティブ textarea は canvas のフォント、行高、パディング、`border-box` コントラクトを継承するため、クリックからカーソルと選択行は可視 canvas ミラーと同じジオメトリを使用します。
  `border-box` 契約を継承するため、クリックによるキャレット配置と選択行は、
  表示されるcanvasミラーと同じジオメトリを使用します。
