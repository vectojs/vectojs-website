---
title: 'UI: Input'
description: 'ネイティブの編集動作をcanvasにミラーリングした1行テキスト入力。'
order: 23
---

# `Input`

`Input` は編集に実際の透明な `<input>` を使用しながら、可視フィールドをcanvasに描画します。IME、クリップボード、選択、および自動化はネイティブのままです。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Input</span></div>
  <iframe src="/sandbox/ui/component.html?name=input&v=core-1.34.0-ui-2.15.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Input live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>キーボード入力またはロールベースの自動化を通じてテキストボックスを埋めます。</figcaption>
</figure>

## 最小限の例

```ts
import { Input } from '@vectojs/ui';

const name = new Input({
  width: 320,
  placeholder: 'Project name',
  onChange: (value) => updateProjectName(value),
});
```

## バリデーション状態 (2.3.0+)

`required` と `invalid` はボーダーだけでなく、アクセシビリティツリーにも到達します：

```ts
const email = new Input({ width: 240, placeholder: 'Email', required: true });
email.invalid = !isValidEmail(email.value); // 赤いボーダー + aria-invalid
```

`required` はシャドウ `<input>`/`<textarea>` の**ネイティブな** `required` 属性として投影されるため、単に制約を記述するだけでなく、フォームのバリデーションや `:invalid` スタイリングに参加します。`invalid` は `aria-invalid` になります。

`invalid` をクリアすると、`"false"` を設定するのではなく、属性が**削除**されます。`aria-invalid="false"` は「明示的に有効である」ことをアサートするため、これらは異なる意味を持ちます。

赤いボーダーだけでは、スクリーンリーダーや色を区別できない人には見えません（WCAG 1.4.1）。これが、状態を描画するだけでなく投影する理由です。強制カラーモードでは、両方の状態がシステムカラーに従います。

`TextArea` も同じ2つのオプションを取ります。

## IME コンポジション

IME コンポジションがアクティブな間、コンポーネントはコンポジション範囲の下にアンダーラインを描画します。この間、**選択ハイライトは抑制されます**：選択されたテキストの上にコンポジションを行うと論理的にその範囲を置き換えますが、ネイティブ要素はコンポジションがコミットされるまでコンポジション前の `selectionStart`/`selectionEnd` を報告し続けます——これを描画すると、コンポジションアンダーラインの後ろ（かつより広い）に古いハイライトが表示されます。長さゼロのコンポジション（最初の `compositionstart`）は、まだ何も置き換えていないため、選択を引き続き表示します。

## メンテナー向けチェックリスト

- カスタムテキスト入力エンティティではなく `Input` を使用してください。
- プレースホルダーを意味のあるものにしてください。これもデフォルトのアクセシブル名です。
- 制御された更新を実装する場合は、選択を意図的に保持してください。
