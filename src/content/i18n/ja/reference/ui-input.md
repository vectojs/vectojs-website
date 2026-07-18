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
  <iframe src="/sandbox/ui/component.html?name=input&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Input live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## メンテナー向けチェックリスト

- カスタムのテキスト入力エンティティの代わりに `Input` を使用します。
- プレースホルダーは意味のあるものに保ちます。これはデフォルトのアクセシブルラベルでもあります。
- 制御された更新を実装する際は、選択を意図的に保持します。
