---
title: 'UI: リサイズ可能なパネル'
description: 'ドラッグ可能な分割ペインレイアウトのための PanelGroup、Panel、PanelResizeHandle。'
order: 35
---

# リサイズ可能なパネル

リサイズ可能なパネルのエクスポートは連携して動作します：`PanelGroup` がスペースを分割し、`Panel` がクリップされたコンテンツ領域を所有し、`PanelResizeHandle` がパネル間に自動的に挿入されます。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · PanelGroup</span></div>
  <iframe src="/sandbox/ui/component.html?name=resizablepanel&v=core-1.9.2-ui-1.9.5" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Resizable panel live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>パネル間の仕切りをドラッグして、ハンドルのホバーとリサイズの動作を確認してください。</figcaption>
</figure>

## 最小限の例

```ts
import { Panel, PanelGroup, Text } from '@vectojs/ui';

const group = new PanelGroup({ direction: 'horizontal', width: 640, height: 360 });
group
  .addPanel(new Panel({ minSize: 160 }).setContent(new Text('Sidebar')))
  .addPanel(new Panel({ minSize: 260 }).setContent(new Text('Canvas')));
```

## メンテナー向けチェックリスト

- ドラッグ時に各パネルの `minSize` を保持します。
- ホストコンテナのサイズが変わったら `resize(width, height)` を呼び出します。
- ネストされた `PanelGroup` インスタンスは `Panel` のコンテンツ境界内に保ちます。
