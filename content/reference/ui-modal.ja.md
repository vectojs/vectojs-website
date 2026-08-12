+++
title = "UI: Modal"
description = "カード、バックドロップ、およびスプリングによる出入りモーションを備えたブロッキングオーバーレイコンポーネント。"
weight = 36
+++

# `Modal`

`Modal` はオーバーレイレイヤーにマウントされ、下層のポインターイベントをブロックし、カードのイン/アウトをアニメーションします。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Modal</span></div>
  <iframe src="/sandbox/ui/component.html?name=modal&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Modal live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>モーダルを開き、canvasでレンダリングされた閉じるボタンで閉じてください。</figcaption>
</figure>

## 最小限の例

```ts
import { Button, Modal } from '@vectojs/ui';

const open = new Button('Open modal', {
  onClick: () => {
    scene.showOverlay(new Modal('Export complete', { width: scene.width, height: scene.height }));
  },
});
```

## メンテナー向けチェックリスト

- モーダルのバックドロップをシーンの寸法に合わせてサイズ設定します。
- 閉じる動作を明示的に保ちます。
- 広く使用する前に、モーション軽減の動作とフォーカス処理を確認します。
