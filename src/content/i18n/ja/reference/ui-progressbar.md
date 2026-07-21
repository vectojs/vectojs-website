---
title: 'UI: ProgressBar'
description: 'オプションのパーセンテージラベルとprogressbarセマンティクスを備えたcanvasプログレスインジケーター。'
order: 30
---

# `ProgressBar`

`ProgressBar` はトラック、塗りつぶされたアクセント、およびオプションのパーセンテージテキストを描画します。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ProgressBar</span></div>
  <iframe src="/sandbox/ui/component.html?name=progressbar&v=core-1.15.0-ui-2.0.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ProgressBar live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>`setValue()` を使用して進捗の変化をクランプし再描画します。</figcaption>
</figure>

## 最小限の例

```ts
import { ProgressBar } from '@vectojs/ui';

const progress = new ProgressBar({
  value: 0.72,
  width: 320,
  height: 22,
  showText: true,
});

progress.setValue(0.9);
```

## メンテナー向けチェックリスト

- 値を `[0, 1]` の範囲にクランプします。
- 進捗の色をテキストまたはセマンティックな値と組み合わせます。
- 値が変わったら `scene.markDirty()` を呼び出します。
