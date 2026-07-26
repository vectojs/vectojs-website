---
title: 'UI: Tabs'
description: 'アクティブなコンテンツビューをマウントするタブ付きパネルコンテナ。'
order: 29
---

# `Tabs`

`Tabs` はタブバーを描画し、アクティブなタブのコンテンツエンティティのみをマウントします。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Tabs</span></div>
  <iframe src="/sandbox/ui/component.html?name=tabs&v=core-1.16.0-ui-2.1.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Tabs live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>タブを切り替えると、非アクティブなコンテンツはエンティティツリーから削除されます。</figcaption>
</figure>

## 最小限の例

```ts
import { Tabs, Text } from '@vectojs/ui';

const tabs = new Tabs({
  width: 480,
  height: 260,
  tabs: [
    { id: 'usage', label: 'Usage', content: new Text('Usage panel') },
    { id: 'api', label: 'API', content: new Text('API panel') },
  ],
});
```

## 単一タブのバーを非表示にする

エディタやターミナルスタイルのアプリでは、Vim の `showtabline=1` 動作が求められることがよくあります：タブが 1 つだけの間はタブバーを表示しません。`autoHideTabBar: true` を渡します（`@vectojs/ui` >= 1.9.5）— タブが 2 つ未満の間、バー（およびそのポインタヒット領域）が非表示になり、コンテンツが全高を占有し、2 つ目のタブが追加されるとすぐにバーが戻ります。バーの周りに兄弟をレイアウトするオーナーは、`tabHeight` を想定する代わりに、ライブの `effectiveTabBarHeight` ゲッターを読み取る必要があります。

```ts
const tabs = new Tabs({
  width: 480,
  height: 260,
  autoHideTabBar: true,
  tabs: [{ id: 'only', label: 'untitled', content: editorView }],
});
tabs.effectiveTabBarHeight; // 今は 0、2 つ目のタブが開くと tabHeight
```

## メンテナー向けチェックリスト

- タブコンテンツのサイズをコンテナサイズと同期させ続けます。
- アクティブなタブが実際に変わったときのみ `change` を発行します。
- 将来のタブレベルのセマンティクスでキーボード/フォーカスの動作を保持します。
