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
  <iframe src="/sandbox/ui/slider.html?v=core-1.32.3-ui-2.13.1" class="sandbox-frame component-demo-frame component-demo-frame-tall" loading="eager" title="Slider live demo" sandbox="allow-scripts allow-same-origin"></iframe>
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
  label?: string;            // accessible name — set this
  min?: number;              // default 0
  max?: number;              // default 100
  value?: number;            // default min
  width?: number;            // default 200
  height?: number;           // default 24
  trackColor?: string;
  progressColor?: string;
  handleColor?: string;
  focusColor?: string;       // 2.7.0+ — focus ring around the handle
  onChange?: (value: number) => void;
})
```

`focused` はキーボードフォーカスを追跡し、ハンドルの周囲に 2px の `focusColor` リング（デフォルト `'#00f0ff'`）を描画します。`@vectojs/ui@2.7.0` より前は、スライダーはキーボード操作が完全に可能だったにもかかわらず、**フォーカスインジケータを一切描画していませんでした** — 矢印キー、`Home`、`End` はすべて機能しましたが、フォーカスがどこにあるかを示す画面表示はありませんでした（WCAG 2.4.7）。強制カラーモードでは代わりにシステムの `Highlight` 色が使われます。

`Slider` をサブクラス化して `render()` を再実装する場合は、リングを引き継いでください。また、`focus`/`blur` 時にシーンをダーティとしてマークしないと、`onDemand` シーンはそれを表示するために再描画されません。

> **`label` を設定してください。** アクセシブルな名前のない `role=\"slider\"` は単なる「スライダー」として読み上げられ、スクリーンリーダーユーザーに何を制御するのか全く伝わりません（WCAG 4.1.2）。キャンバス上に描画された視覚的なラベルはセマンティックレイヤーに到達しないため、ここでもラベルを渡してください。`label` を省略すると、値から名前を導出するのではなく、`aria-label` が未設定のままになります — 間違った名前はないより悪いものです。`@vectojs/ui@2.2.0` 以降で利用可能です。

## イベント

`Slider` はポインター入力が丸められた値を変更した後、`{ value }` とともに `change` を発行します。同じ値での繰り返しのポインターイベントは重複したchangeを発行しません。

## メンテナー向けチェックリスト

- ポインターの更新は、ローカルXを `[0,width]` にクランプする必要があります。
- 値の変更は `scene.markDirty()` を呼び出して、`renderMode = 'onDemand'` が滑らかに保たれるようにする必要があります。
- ロールのメタデータを現在の値と同期させ続けます。

関連情報: [`ProgressBar`](/reference/ui-components/#progressbar)、[`Input`](/reference/ui-components/#input)、[`Button`](/reference/ui-button/)。
