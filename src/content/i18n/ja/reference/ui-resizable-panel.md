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
  <iframe src="/sandbox/ui/component.html?name=resizablepanel&v=core-1.16.3-ui-2.2.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Resizable panel live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>パネル間の仕切りをドラッグして、ハンドルのホバーとリサイズの動作を確認してください。</figcaption>
</figure>

## 最小限の例

```ts
import { Panel, PanelGroup, Stack, Text } from '@vectojs/ui';

const group = new PanelGroup({ direction: 'horizontal', width: 640, height: 360 });
group
  // サイドバーコンテンツはStackで、ビューポートを埋めるようにサイズ設定されます
  // — デフォルトの`fit: true`により、リサイズ/ドラッグのたびにパネルのボックスに
  // 一致するようになり、以前は手動で`content.width = panel.width`と同期する必要が
  // あったギャップを解消します（以下の「ホストされるコンテンツのサイズ設定」を参照）。
  .addPanel(
    new Panel({ minSize: 160 }).setContent(
      new Stack({ direction: 'vertical' }).add(new Text('Sidebar')),
    ),
  )
  .addPanel(
    new Panel({ minSize: 260 }).setContent(
      new Stack({ direction: 'vertical' }).add(new Text('Canvas')),
    ),
  );
```

## ホストされるコンテンツのサイズ設定（`setContent`）

`Panel.setContent(content, fit?)`は、ホストされるコンテンツの`width`/`height`をデフォルトでパネル自身のボックスに同期させます（`fit: true`、両軸）— `setContent()`時だけでなく、その後のすべての`PanelGroup`ディバイダードラッグや`resize()`呼び出しでも同期します。これにより実際のギャップが解消されました：以前は`setContent`はコンテンツの位置設定のみを行い（`content.x = 0; content.y = 0`）、アプリはリサイズのたびに手動で`content.width = panel.width`を同期する必要があり、深いコンポーネントチェーンの1箇所でその同期を忘れると、本番環境でクリップオーバーフローのバグが発生していました。

```ts
panel.setContent(myLayout); // width と height の両方を追跡（デフォルト）
panel.setContent(myLayout, false); // 従来の位置のみの動作
panel.setContent(myLayout, { width: true, height: false }); // width のみ
```

**自己サイズ設定コンテンツには`fit: false`を渡してください** — 自身の`width`/`height`が開発者設定ではなくコンテンツから導出されるエンティティ（例：`maxWidth`なしの裸の`Text`。`setText()`/`setMaxWidth()`のたびに`result.totalWidth`/行数から自身のボックスを再計算します）。デフォルトの`fit: true`でそのようなエンティティのボックスを毎フレームパネルのボックスに強制すると、自己計算されたサイズが上書きされます — `Text`自身の`render()`には無害ですが（キャッシュされた`lines`から描画し、直接`width`/`height`を使用しません）、そのエンティティの`width`/`height`をレイアウトに使用する他のもの（ヒットテスト、a11yシャドウ要素のサイズ、シーン監査）には悪影響を及ぼします。自己サイズ設定コンテンツは先に`Stack`/`Flow`でラップしてください（これらは自己サイズ設定ではなく子の配置が役目なので、`fit`しても問題ありません）、パネル内で中央揃え/フィルさせたい場合。または`fit: false`を渡して自分でサイズ設定してください。

## メンテナー向けチェックリスト

- ドラッグ時に各パネルの `minSize` を保持します。
- ホストコンテナのサイズが変わったら `resize(width, height)` を呼び出します。
- ネストされた `PanelGroup` インスタンスは `Panel` のコンテンツ境界内に保ちます。
- 自己サイズ設定コンテンツ（`maxWidth`なしの裸の`Text`、または自身のレイアウトでボックスを計算するエンティティ）には`setContent()`に`fit: false`を渡してください — デフォルトの`fit: true`はレイアウトコンテナ（`Stack`、`Flow`、別の`PanelGroup`）には適切ですが、自己サイズ設定エンティティのボックスを毎フレーム上書きします。
