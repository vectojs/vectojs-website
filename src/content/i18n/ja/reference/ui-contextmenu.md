---
title: 'UI: ContextMenu'
description: 'セパレーター、無効化された行、ショートカット、ネストされたサブメニューを備えたオーバーレイコマンドメニュー。'
order: 39
---

# `ContextMenu`

`ContextMenu` はコマンドサーフェス用のオーバーレイメニューです。

UI 1.11.1–1.11.3 ではネストされたチェーンのライフサイクルが安全になりました：ルートメニューが所有する単一のバックドップがチェーン全体を閉じたり破棄したりし、非表示のメニューはセマンティックまたはポインタのヒットサーフェスを残さず、各ルートメニューは安定したバックドップアイデンティティを持ちます。外部の `pointerdown` は即座に閉じますが、セマンティックな `click` アクティブ化はキーボードと支援技術で引き続き利用可能です。

## Try it

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ContextMenu</span></div>
  <iframe src="/sandbox/ui/component.html?name=contextmenu&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ContextMenu live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>ランチャーをクリックして、制限されたビューポート内でメニューを開きます。</figcaption>
</figure>

## 最小の例

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

## アクセシビリティとキーボード

各非セパレータ項目は `role="menuitem"` ホットスポットを投影し、**ルービング tabindex**（メニューは1つのタブストップ）、該当する場合の `disabled`、およびサブメニューペアrentの `aria-haspopup="menu"` + `aria-expanded` を持っています。

| キー          | アクション                                                                              |
| ------------- | --------------------------------------------------------------------------------------- |
| Down / Up     | 次の/前の**有効な**項目、ラップアラウンド；セパレータと無効な項目はスキップ             |
| Home / End    | 最初の/最後の有効な項目                                                                 |
| Right         | サブメニューペアrentを開き、その最初の項目にフォーカス                                  |
| Left          | このサブメニューを閉じ、親メニューにフォーカスを戻す                                    |
| Enter / Space | アクティブにする（サブメニューを開く、または `onClick` を発火してメニュー全体を閉じる） |
| Escape        | メニュー全体のツリーを閉じる                                                            |

ホットスポットは `pointerEvents: 'none'` を設定するため、メニューは自身のポインターダウンによる位置ベースのヒット処理を維持します。[コンポジットウィジェット](/reference/core-a11y/#複合ウィジェットロービング-tabindex)を参照。

> **メニューの表示はシーン全体のバックドップをインストールします。** ルートメニューは、閉じるための外部クリックをキャッチするシーンサイズの不可視インタラクティブエンティティを追加します。そのバックドップはメニューが開いている間、シーン全体のポインターイベントを傍受します——したがって、ドラッグや選択が必要なフィクスチャやテストでメニューを開いたままにしないでください。

## メンテナー向けチェックリスト

- メニューテキストをパネルからあふれさせないでください。
- 無効化された行は非インタラクティブに保ちます。
- ネストされたサブメニューはオーバーレイルートを通じて再配置します。
- ルートメニューを共有バックドップの唯一の所有者として保持し、コマンド、外部のポインターダウン、または破棄時にサブメニューの完全なチェーンを閉じてください。
