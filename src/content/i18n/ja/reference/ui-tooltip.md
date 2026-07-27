---
title: 'UI: Tooltip'
description: 'ターゲットエンティティにアンカーされた、ホバーで表示されるオーバーレイテキスト。'
order: 37
---

# `Tooltip`

`Tooltip` は遅延の後にターゲットの近くに小さなテキストパネルを表示します。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Tooltip</span></div>
  <iframe src="/sandbox/ui/component.html?name=tooltip&v=core-1.17.1-ui-2.3.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Tooltip live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>ターゲットにホバーして、配置と消去を確認してください。</figcaption>
</figure>

## 最小限の例

```ts
import { Button, Tooltip } from '@vectojs/ui';

const target = new Button('Hover me');
const tooltip = new Tooltip({
  target,
  content: 'Save file',
  placement: 'right',
});
```

## メンテナー向けチェックリスト

- ポインターが離れたら保留中のタイマーをクリアします。
- ツールチップのコンテンツは短く保ちます。
- 一度だけマウントし、ツールチップに自身の表示/非表示ライフサイクルを管理させます。
