---
title: 'Slider'
description: 'WAI-ARIA sliderの契約を公開し、オンデマンドシーンで滑らかに再描画するcanvasスライダーコンポーネント。'
order: 13
---

# `Slider`

`Slider` はポインター駆動の範囲コントロールです。トラック、進捗、サムをcanvasに描画しながら、`valuemin`、`valuemax`、およびライブの `value` メタデータとともに `role="slider"` を公開します。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Slider</span></div>
  <iframe src="/sandbox/ui/slider.html?v=core-1.9.2-ui-1.9.5" class="sandbox-frame component-demo-frame component-demo-frame-tall" loading="eager" title="Slider live demo" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>サムをドラッグして、ラベルと進捗バーが同じchangeイベントから更新されるのを確認してください。</figcaption>
</figure>

## 最小限の例

```ts
import { Slider, Text } from '@vectojs/ui';

const label = new Text('Quality: 64%');
const slider = new Slider({
  min: 0,
  max: 100,
  value: 64,
  width: 320,
  onChange(value) {
    label.setText(`Quality: ${value}%`);
    scene.markDirty();
  },
});
```

## コンストラクタ

```ts
new Slider({
  min?: number;              // default 0
  max?: number;              // default 100
  value?: number;            // default min
  width?: number;            // default 200
  height?: number;           // default 24
  trackColor?: string;
  progressColor?: string;
  handleColor?: string;
  onChange?: (value: number) => void;
})
```

## イベント

`Slider` はポインター入力が丸められた値を変更した後、`{ value }` とともに `change` を発行します。同じ値での繰り返しのポインターイベントは重複したchangeを発行しません。

## メンテナー向けチェックリスト

- ポインターの更新は、ローカルXを `[0,width]` にクランプする必要があります。
- 値の変更は `scene.markDirty()` を呼び出して、`renderMode = 'onDemand'` が滑らかに保たれるようにする必要があります。
- ロールのメタデータを現在の値と同期させ続けます。

関連情報: [`ProgressBar`](/reference/ui-components/#progressbar)、[`Input`](/reference/ui-components/#input)、[`Button`](/reference/ui-button/)。
