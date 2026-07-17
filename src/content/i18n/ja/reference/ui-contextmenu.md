---
title: 'UI: ContextMenu'
description: 'セパレーター、無効化された行、ショートカット、ネストされたサブメニューを備えたオーバーレイコマンドメニュー。'
order: 39
---

# `ContextMenu`

`ContextMenu` はコマンドサーフェス用のオーバーレイメニューです。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ContextMenu</span></div>
  <iframe src="/sandbox/ui/component.html?name=contextmenu&v=core-1.9.2-ui-1.9.5" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ContextMenu live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>ランチャーをクリックして、制約されたビューポート内でメニューを開きます。</figcaption>
</figure>

## 最小限の例

```ts
import { ContextMenu } from '@vectojs/ui';

const menu = new ContextMenu({
  items: [
    { label: 'Copy', shortcut: 'Ctrl+C' },
    { separator: true },
    { label: 'Delete', disabled: true },
  ],
});

target.on('contextmenu', (event) => menu.showAtPoint(event.globalX, event.globalY));
```

## メンテナー向けチェックリスト

- メニューテキストをパネルからあふれさせないでください。
- 無効化された行は非インタラクティブに保ちます。
- ネストされたサブメニューはオーバーレイルートを通じて再配置します。
