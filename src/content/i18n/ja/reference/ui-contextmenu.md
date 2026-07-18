---
title: 'UI: ContextMenu'
description: 'セパレーター、無効化された行、ショートカット、ネストされたサブメニューを備えたオーバーレイコマンドメニュー。'
order: 39
---

# `ContextMenu`

`ContextMenu` はコマンドサーフェス用のオーバーレイメニューです。

UI 1.11.1–1.11.3 では、ネストしたメニューチェーンのライフサイクルが安全になりました。ルートメニューが所有する単一の backdrop がチェーン全体を閉じるか破棄し、非表示メニューはセマンティック面やポインターのヒット面を残さず、各ルートメニューは安定した backdrop ID を持ちます。外側の `pointerdown` は即座に閉じますが、キーボードと支援技術向けのセマンティックな `click` 操作は維持されます。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ContextMenu</span></div>
  <iframe src="/sandbox/ui/component.html?name=contextmenu&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ContextMenu live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

// `'contextmenu'` is not a VectoEvent — only pointerdown/up are dispatched
// into the tree. Filter `pointerdown` on the native right button (2), and
// pass the owning entity as the third arg so `showAtPoint` can find the
// scene even on the very first call (before any manual `scene.add(menu)`).
target.on('pointerdown', (event) => {
  const pointer = event.nativeEvent as PointerEvent | undefined;
  if (pointer?.button !== 2 || event.sceneX === undefined || event.sceneY === undefined) return;
  menu.showAtPoint(event.sceneX, event.sceneY, target);
});
```

## メンテナー向けチェックリスト

- メニューテキストをパネルからあふれさせないでください。
- 無効化された行は非インタラクティブに保ちます。
- ネストされたサブメニューはオーバーレイルートを通じて再配置します。
