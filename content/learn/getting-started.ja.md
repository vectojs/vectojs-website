+++
title = "Getting Started"
description = "VectoJSをインストールし、Sceneを作成し、Input、Toggle、Slider、Button、ScrollViewを備えた完全な設定パネルを構築します。"
weight = 7
+++

# Getting Started

このガイドでは、VectoJSのインストールと、完全なインタラクティブ設定パネルの構築——フォーム、レイアウト、スクロール、アクセシビリティを実際に使う現実的な例——を順を追って説明します。

## インストール

```bash
bun add @vectojs/core @vectojs/ui
```

VectoJSは、コアランタイムと高レベルのコンポーネントライブラリに分かれています。ほとんどのアプリは両方からインポートします。`@vectojs/core`は、それが構築の土台とするスタンドアロンのエンジン——`@vectojs/text`、`@vectojs/layout`、`@vectojs/math`、`@vectojs/animation`——をバンドルし再エクスポートするため、この2パッケージのインストールだけで十分です。依存の範囲を小さく抑えたいときにのみ、それらのパッケージを個別に導入してください。

## HTMLのセットアップ

VectoJSには、位置指定された親を持つ`<canvas>`要素が必要です：

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My VectoJS App</title>
    <style>
      body {
        margin: 0;
        overflow: hidden;
        background: #0a0a0f;
      }
      #app {
        position: relative;
        width: 100vw;
        height: 100vh;
      }
      #canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
    </style>
  </head>
  <body>
    <div id="app">
      <canvas id="canvas"></canvas>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

親の`<div id="app">`は`position: relative`でなければなりません——VectoJSはアクセシビリティシャドウレイヤーを、キャンバスの絶対配置された兄弟要素として挿入します。`Scene`はこれを自動的に強制しますが、明示的に設定しておくと視覚的なジャンプを防げます。

## Sceneの作成

```typescript
// src/main.ts
import { Scene } from '@vectojs/core';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, {
  maxFPS: 60,
  pointBackend: 'canvas', // 'webgl' for large point clouds
});

scene.start();
```

> [!NOTE]
> コンストラクターは`new Scene(canvas: HTMLCanvasElement, options?)`です。`{ canvasId }`という文字列ではなく、DOM要素を受け取ります。

## ライブで試す

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">ライブ · @vectojs/core</span></div>
  <iframe src="/sandbox/getting-started.html" class="sandbox-frame" loading="lazy" title="Getting Started interactive example" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Counter + Toggle + Slider——すべてDOMコンポーネントなしでキャンバス上で動作します。クリックして操作してみてください。</figcaption>
</figure>

## 最初のコンポーネント

すべてが配線されていることを確認するため、`Toggle`を追加します：

```typescript
import { Toggle } from '@vectojs/ui';

const toggle = new Toggle({
  label: 'Dark mode',
  checked: true,
  onChange: (checked) => console.log('dark mode:', checked),
});

toggle.setPosition(40, 40);
scene.add(toggle);
```

ブラウザを開いてDOMを検査してください——キャンバスの上に実際の`<div role="switch" aria-checked="true" aria-label="Dark mode">`が見つかります。`page.getByRole('switch', { name: 'Dark mode' }).click()`を呼び出すPlaywrightテストが動作します。

---

## 設定パネルの構築

もっと完全なものを構築しましょう：テキスト入力、トグル、スライダー、送信ボタンを備えたスクロール可能な設定パネルです。すべての状態はプレーンなオブジェクトに存在し、コンポーネントはそこから読み取り、そこへ書き込みます。

```typescript
import { Scene } from '@vectojs/core';
import { Stack, Card, Text, Input, Toggle, Slider, Button, ScrollView } from '@vectojs/ui';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  username: '',
  notifications: true,
  highPerformance: false,
  particleCount: 5000,
};

// ── Helper: section heading ───────────────────────────────────────────────────
function heading(text: string): Text {
  return new Text(text, { font: '600 13px Inter', color: '#64748b' });
}

// ── Username field ────────────────────────────────────────────────────────────
const usernameLabel = heading('USERNAME');

const usernameInput = new Input({
  width: 320,
  height: 40,
  placeholder: 'your-username',
  value: state.username,
  font: '16px Inter',
  onChange: (value) => {
    state.username = value;
  },
});

// ── Toggle: notifications ─────────────────────────────────────────────────────
const notifLabel = heading('NOTIFICATIONS');

const notifToggle = new Toggle({
  label: 'Email notifications',
  checked: state.notifications,
  accent: '#6366f1',
  onChange: (checked) => {
    state.notifications = checked;
  },
});

// ── Toggle: high performance ──────────────────────────────────────────────────
const perfToggle = new Toggle({
  label: 'High-performance mode',
  checked: state.highPerformance,
  accent: '#6366f1',
  onChange: (checked) => {
    state.highPerformance = checked;
  },
});

// ── Slider: particle count ────────────────────────────────────────────────────
const particleLabel = heading('MAX PARTICLES');

const particleCountDisplay = new Text(`${state.particleCount.toLocaleString()}`, {
  font: '600 14px Inter',
  color: '#00f0ff',
});

const particleSlider = new Slider({
  min: 1000,
  max: 50000,
  value: state.particleCount,
  width: 280,
  progressColor: '#6366f1',
});

particleSlider.on('change', (e) => {
  state.particleCount = e.value;
  particleCountDisplay.setText(e.value.toLocaleString());
});

// Lay out label + display side by side
const particleRow = new Stack({ direction: 'horizontal', gap: 12, align: 'center' });
particleRow.add(particleLabel);
particleRow.add(particleCountDisplay);

// ── Save button ───────────────────────────────────────────────────────────────
const saveBtn = new Button('Save settings', {
  bg: '#6366f1',
  hoverBg: '#818cf8',
  padding: 14,
  onClick: () => {
    console.log('Saved:', state);
    saveBtn.animate({ scaleX: 0.95, scaleY: 0.95 }, 80).animate({ scaleX: 1, scaleY: 1 }, 80);
  },
});

// ── Main layout stack ─────────────────────────────────────────────────────────
const content = new Stack({ direction: 'vertical', gap: 20 });
content.add(usernameLabel);
content.add(usernameInput);
content.add(notifLabel);
content.add(notifToggle);
content.add(perfToggle);
content.add(particleRow);
content.add(particleSlider);
content.add(saveBtn);

// ── Scrollable card ───────────────────────────────────────────────────────────
const PANEL_W = 400;
const PANEL_H = 480;
const PADDING = 24;

const scroll = new ScrollView({ width: PANEL_W - PADDING * 2, height: PANEL_H - PADDING * 2 });
content.setPosition(0, 0);
scroll.add(content);

const card = new Card({
  width: PANEL_W,
  height: PANEL_H,
  radius: 16,
  border: 'rgba(255,255,255,0.08)',
  label: 'Settings panel', // makes the card a role="group" landmark
});

const titleText = new Text('Settings', { font: '700 22px Inter', color: '#f8fafc' });
titleText.setPosition(PADDING, PADDING);
card.add(titleText);

scroll.setPosition(PADDING, PADDING + 40);
card.add(scroll);

// Centre the card on screen
const cx = (window.innerWidth - PANEL_W) / 2;
const cy = (window.innerHeight - PANEL_H) / 2;
card.setPosition(cx, cy);
scene.add(card);

scene.start();

// ── Responsive resize ─────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
  card.setPosition((window.innerWidth - PANEL_W) / 2, (window.innerHeight - PANEL_H) / 2);
});
```

### 得られるもの

- **`Stack`**は子要素を20 pxのギャップで垂直に配置します——手動の`x`/`y`計算は不要です。
- **`ScrollView`**は、コンテンツがパネルの高さを超えたときにクリップしてスクロールします。
- **`Card`**は角丸矩形の背景を描画します。`label`が設定されていると、`role="group"`のランドマークを投影し、スクリーンリーダーがその領域をアナウンスします。
- **`Input`**は実際の`<input>`シャドウ要素に支えられています——IME、クリップボード、取り消し、オートフィルがすべて動作します。
- **`Button`**はラベルに合わせて自動サイズ調整され、キャンバスのクリックとシャドウの`<button>`の両方から`onClick`を発火します。
- すべてのコンポーネントは、あなたの`state`オブジェクトに直接接続されます。

---

## フレームワーク統合

VectoJSは`<canvas>`にマウントされるため、WebGLライブラリと同じ方法で、あらゆるフレームワークと統合できます。

### React

```typescript
import { useEffect, useRef } from 'react';
import { Scene } from '@vectojs/core';
import { Button } from '@vectojs/ui';

export function VectoCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const scene = new Scene(ref.current!, { maxFPS: 60 });
    const btn = new Button('Click me');
    btn.setPosition(40, 40);
    scene.add(btn);
    scene.start();

    return () => scene.destroy();
  }, []);

  return <canvas ref={ref} style={{ width: '100%', height: '100%' }} />;
}
```

### Vue 3

```typescript
<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { Scene } from '@vectojs/core';

const canvasRef = ref(null);
let scene;

onMounted(() => {
  scene = new Scene(canvasRef.value, { maxFPS: 60 });
  scene.start();
});

onUnmounted(() => scene?.destroy());
</script>

<template>
  <canvas ref="canvasRef" style="width:100%;height:100%" />
</template>
```

---

## チャレンジ

### カウンターを追加する

設定パネルを拡張して、Saveボタンが何回クリックされたかを追跡し、その累計をボタンの隣に表示するようにしましょう。

- `0`に初期化された`clickCount`変数をstateオブジェクトに追加します。
- `'Saved 0 times'`と表示する`Text`エンティティを作成し、水平の`Stack`を使って`saveBtn`の横に配置します。
- クリックのたびに`entity.setText(...)`を使ってテキストを更新し、各押下後にカウントが正しく増加することを確認します。

### レスポンシブレイアウト

ビューポートが480 pxより狭いときに、パネルが優雅にリフローするようにしましょう。カードがウィンドウの端からはみ出してはいけません。

- `resize`イベントハンドラー内で、`window.innerWidth`を`PANEL_W`と比較し、両側で最小16 pxのマージンを差し引いたクランプ済みのパネル幅を計算します。
- リサイズのたびに、`card.width`、`ScrollView`の幅、`usernameInput`の幅を新しいパネル幅に合わせて更新します。
- ブラウザウィンドウを幅320 pxにリサイズしてテストし、すべてのコンテンツが表示され続け、カードの境界の外に何もクリップされないことを確認します。

### テーマトグル

パネルヘッダーにダーク/ライトのテーマ切り替えを追加し、すべてのコンポーネントの視覚スタイルを即座に更新しましょう。

- 2つのテーマオブジェクトを定義します——1つはダーク（現在の色）、もう1つはライト——それぞれがカードの境界色、見出しテキスト色、ラベルテキスト色、ボタン背景の値を指定します。
- ラベル`'Light mode'`の`Toggle`を`ScrollView`の上に追加し、その`change`イベントを配線して、アクティブなテーマの色の値をすべての関連エンティティに適用します。
- テーマが変わったときにカードの`border`プロパティと`titleText`の色の両方が更新されるようにし、各プロパティ更新後に`scene.markDirty()`を呼び出してキャンバスを再描画させます。

## 次のステップ

- [Core Scene](/learn/core-scene/) — レンダーループ、変換システム、アイドルスロットルを詳しく。
- [Custom Entities](/learn/custom-entity/) — 独自のキャンバスコンポーネントを構築する。
- [Events & Hit-Testing](/learn/events/) — ポインターとキーボードのイベントがツリーをどう流れるか。
- [Core API Reference](/reference/core-api/) — `Scene`、`Entity`、`IRenderer`の完全なシグネチャ。
