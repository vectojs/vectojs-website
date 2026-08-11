+++
title = "カスタムエンティティの構築"
description = "Entityをサブクラス化して独自のキャンバスコンポーネントを構築する方法：トランスフォーム、レンダリング、ヒットテスト、アニメーション、バッチ処理、アクセシビリティ。"
weight = 9

[extra]
order = 9
+++

# カスタムエンティティの構築

VectoJSのすべてのオブジェクトは`Entity` — 仮想数学ツリーのノードです。`Button`や`Toggle`のような組み込みコンポーネントは、そのまま使用できるEntityサブクラスです。このガイドでは独自のものの構築方法を示します。

## ライブで試す

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · @vectojs/core</span></div>
  <iframe src="/sandbox/custom-entity.html" class="sandbox-frame" loading="lazy" title="カスタムエンティティのインタラクティブ例" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>アニメーションする円弧塗りつぶしを持つ3つの<code>GaugeWidget</code>カスタムエンティティ。Randomizeをクリックして<code>animate()</code>トゥイーンシステムの動作を確認。</figcaption>
</figure>

## ローカル座標系

これは最初の`render()`メソッドを書く前に内部化すべき最も重要なことです：

> **エンティティは`(0, 0)`で描画します。`render()`が呼び出される前に、キャンバスは既にエンティティの位置、スケール、回転に変換されています。**

`Scene`はツリーを下る際に**T · S · R**順序（Translate → Scale → Rotate）で変換を適用します。`render(renderer)`が呼び出される時点で、原点はエンティティの左上隅であり、スケールが有効になり、回転が適用されています。`render()`内で`this.x`や`this.y`を読む必要はありません。

<figure>
  <img src="/images/local-coordinate-system.svg" alt="左側のワールド空間に(80, 90)に配置されたエンティティと、右側の原点が(0,0)でrender()が描画するローカル空間を示す図。矢印でSceneがT·S·R変換を適用するとラベル付け。" class="diagram" />
  <figcaption>Sceneは<code>render()</code>を呼び出す前にキャンバスをエンティティのワールド位置に変換します。常に<code>(0, 0)</code>で描画します。</figcaption>
</figure>

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class Banner extends Entity {
  color = '#6366f1';

  isPointInside(_gx: number, _gy: number) {
    return false;
  }

  render(renderer: IRenderer) {
    // (0, 0)を基準に描画 — (this.x, this.y)ではない
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 12);
    renderer.fill(this.color);
  }
}

const banner = new Banner();
banner.width = 300;
banner.height = 60;
banner.setPosition(80, 120); // 画面上の表示位置を制御
scene.add(banner);
```

## 最小実装契約

2つのメソッドが必要です：

```typescript
abstract class Entity {
  // グローバルポインター座標(gx, gy)がこのエンティティにヒットした場合にtrueを返す。
  abstract isPointInside(gx: number, gy: number): boolean;

  // エンティティを描画。レンダラーは既にローカル空間 — 原点は(0,0)。
  abstract render(renderer: IRenderer): void;
}
```

エンティティにインタラクティブ領域がない場合は、`isPointInside`から`false`を返します。矩形のヒット領域の場合は、`worldToLocal()`でワールドポイントを変換し、ネストされた回転と非一様スケールが正確に処理されるようにします：

```typescript
isPointInside(gx: number, gy: number): boolean {
  const local = this.worldToLocal(gx, gy);
  return !!local && local.x >= 0 && local.x <= this.width
      && local.y >= 0 && local.y <= this.height;
}
```

> [!NOTE] > `UIComponent`はこのAABBテストを既に実装しています。コンポーネントに矩形のヒットボックスがある場合は、`Entity`の代わりに`@vectojs/ui`の`UIComponent`を拡張してください — `isPointInside`、`getBounds`、`padding`が無料で得られます。

## IRenderer API

`render()`に渡されるレンダラーオブジェクトは、Canvas2Dに似た描画面を提供します（ただしバックエンドに依存しません — Canvas2D、WebGL、SVGの可能性があります）。

```typescript
// パス
renderer.beginPath()
renderer.moveTo(x, y)
renderer.lineTo(x, y)
renderer.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y)
renderer.arc(cx, cy, radius, startAngle, endAngle, counterclockwise?)
renderer.roundRect(x, y, w, h, radii)
renderer.closePath()

// 塗りつぶしとストローク
renderer.fill(colorOrGradient)       // 例：'#ff0' またはグラデーション記述子
renderer.stroke(colorOrGradient, lineWidth?)

// テキスト（ネイティブブラウザキャンバステキスト — LayoutEngineなし）
renderer.fillText(text, x, y, font, color)  // font = CSS省略記法

// 画像
renderer.drawImage(source, dx, dy, dw, dh)

// 高速円バッチ（同色ランを統合）
renderer.fillCircle(cx, cy, radius, color, alpha?)

// 状態
renderer.save()
renderer.restore()
renderer.translate(x, y)
renderer.scale(x, y)
renderer.rotate(angle)        // ラジアン
renderer.setGlobalAlpha(a)
renderer.clip(x, y, w, h)    // save/restore内

// グラデーション
renderer.createLinearGradient(x0, y0, x1, y1, colorStops)
```

**例 — グラデーションカード：**

```typescript
render(renderer: IRenderer) {
  const gradient = renderer.createLinearGradient(0, 0, this.width, 0, [
    { stop: 0, color: '#6366f1' },
    { stop: 1, color: '#38bdf8' },
  ]);
  renderer.beginPath();
  renderer.roundRect(0, 0, this.width, this.height, 16);
  renderer.fill(gradient);

  renderer.fillText('Hello canvas', 20, this.height / 2 - 8, '600 18px Inter', '#fff');
}
```

## `getBounds()`によるビューポートカリング

デフォルトでは、エンティティは決してカリングされません。`getBounds()`をオーバーライドしてローカル空間のバウンディングボックスを返すと、変換されたボックスがビューポート外の場合にSceneが`render()`をスキップします。`update()`は引き続き実行されるため、エンティティが画面内に戻ったときに状態とアニメーションが最新のままになります：

```typescript
getBounds() {
  return { x: 0, y: 0, width: this.width, height: this.height };
}
```

`UIComponent`は既にこれを行っています。生の`Entity`サブクラスは大規模シーンで実装すべきです。

## `update(dt, time)`によるフレーム単位のロジック

`update()`をオーバーライドして毎フレームコードを実行します。最初に`super.update(dt, time)`を呼び出してキューイングされた`animate()`トゥイーンを進行させます。

> [!CAUTION] > `dt`は**ミリ秒**であり、秒ではありません。60fpsでは`dt ≈ 16.7`。1000で割って秒に変換します。

```typescript
class Spinner extends Entity {
  speed = 1.5; // rad/s

  update(dt: number, time: number) {
    super.update(dt, time);
    this.rotation += this.speed * (dt / 1000); // dt/1000 → 秒
  }

  // update()からのモーションは、報告しない限りSceneのアイドルチェックから見えません。
  // これによりアイドルスロットルがスピナーを2fpsに落とすのを防ぎ、
  // フレームごとのダーティフラグよりも明確にアニメーション意図を表明します。
  hasPendingAnimations() {
    return true; // スピナーは常にアニメーション中
  }

  isPointInside() {
    return false;
  }

  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.arc(this.width / 2, this.height / 2, 30, 0, Math.PI * 2);
    renderer.stroke('#00f0ff', 3);
  }
}
```

`time`は`performance.now()`であり、ドリフトしてはいけない振動に便利です：

```typescript
this.y = Math.sin(time * 0.002) * 20; // 安定した浮動小数点、累積誤差なし
```

## `animate()`によるスムーズアニメーション

一回限りの遷移には、カスタム`update()`よりも`animate()`の方が適していることがよくあります：

```typescript
entity
  .animate({ x: 300, opacity: 0 }, 400) // イーズアウト、400ms
  .animate({ opacity: 1 }, 200); // 連鎖：最初が完了すると開始
```

**数値プロパティのみ**が補間されます。イージングはイーズアウト二次関数（`t * (2 - t)`）です。実行中のトゥイーンはシーンを非静的状態に保ち、自動的に`markDirty()`を呼び出します。

## エンティティのインタラクティブ化

`interactive = true`を設定し、`isPointInside`を実装します。その後、`on()`でリスナーをアタッチします：

```typescript
class Chip extends Entity {
  selected = false;
  label: string;

  constructor(label: string) {
    super();
    this.label = label;
    this.interactive = true;
    this.width = 80;
    this.height = 32;

    this.on('click', () => {
      this.selected = !this.selected;
      this.animate({ scaleX: 0.92, scaleY: 0.92 }, 80).animate({ scaleX: 1, scaleY: 1 }, 80);
      this.scene?.markDirty();
    });
  }

  isPointInside(gx: number, gy: number): boolean {
    const p = this.worldToLocal(gx, gy);
    return !!p && p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height;
  }

  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 16);
    renderer.fill(this.selected ? '#6366f1' : 'rgba(99,102,241,0.2)');
    renderer.fillText(this.label, 12, 9, '500 14px Inter', '#fff');
  }
}
```

## `getA11yAttributes()`によるA11y投影

エンティティが`interactive`の場合、VectoJSはその上に透明な実際のDOMノードを投影します。デフォルトはプレーンな`<div>`で、支援技術にはあまり役立ちません。`getA11yAttributes()`をオーバーライドして、どのノードを投影するかをフレームワークに伝えます：

```typescript
import type { A11yAttributes } from '@vectojs/core';

class Chip extends Entity {
  getA11yAttributes(): A11yAttributes {
    return {
      tag: 'button',
      role: 'button',
      label: this.label,
    };
  }
}
```

これでPlaywrightの`page.getByRole('button', { name: 'OK' })`がチップを見つけ、スクリーンリーダーがそれを読み上げ、キーボードユーザーがTabとEnterで操作できるようになります。完全なフィールドセット：

```typescript
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // デフォルト 'div'
  role?: string;
  label?: string; // aria-label
  href?: string; // tag='a' の場合
  src?: string;
  alt?: string; // tag='img' の場合
  inputType?: string; // 'text', 'checkbox' など
  placeholder?: string;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  controls?: string;
  haspopup?: string;
  selected?: boolean;
  activedescendant?: string;
  valuemin?: string;
  valuemax?: string;
}
```

## `getBatchCircle()`と`getBatchRect()`によるWebGLバッチ処理

数千単位のパーティクル系エンティティ（ドット、ポイント）では、エンティティごとの`save/translate/render/restore`パスは遅すぎます。代わりにバッチ高速パスを使用します：

```typescript
class Particle extends Entity {
  radius = 4;
  color = '#00f0ff';

  // 累積変換が表現可能な場合、WebGLバッチに供給。
  getBatchCircle() {
    return { radius: this.radius, color: this.color };
  }

  isPointInside() {
    return false;
  }
  // Canvasモードまたは非一様/シアー祖先用の必須フォールバック。
  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.arc(0, 0, this.radius, 0, Math.PI * 2);
    renderer.fill(this.color);
  }
}
```

制約：

- エンティティは**リーフ**（子なし）でなければなりません。
- エンティティ自身のスケールは**一様**（`scaleX === scaleY`）でなければなりません。
- Sceneで`pointBackend: 'webgl'`が必要です。
- 累積された祖先変換が非一様、シアー、または1つの半径/回転で表現できない場合、Sceneは通常の`render()`フォールバックを呼び出します。

Sceneは毎フレーム`getBatchCircle()`を読み取るため、アニメーションする`radius`/`color`が尊重されます。ポイントレイヤーは多くの円を1つのバッファ/描画シーケンスでアップロードします。矩形の場合は代わりに`getBatchRect()`を使用します：

```typescript
getBatchRect() {
  return { width: this.width, height: this.height, color: this.color };
}
```

## 完全な例：アニメーションゲージウィジェット

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';
import type { A11yAttributes } from '@vectojs/core';

class GaugeWidget extends Entity {
  private _value = 0;
  private _displayValue = 0; // 補間値

  label: string;
  min: number;
  max: number;
  accentColor: string;

  constructor(label: string, opts: { min?: number; max?: number; accent?: string } = {}) {
    super();
    this.label = label;
    this.min = opts.min ?? 0;
    this.max = opts.max ?? 100;
    this.accentColor = opts.accent ?? '#00f0ff';
    this.width = 180;
    this.height = 180;
    this.interactive = true;
  }

  get value() {
    return this._value;
  }

  setValue(v: number) {
    this._value = Math.max(this.min, Math.min(this.max, v));
    // スムーズな視覚遷移
    this.animate({ _displayValue: this._value } as any, 600);
  }

  update(dt: number, time: number) {
    super.update(dt, time);
  }

  getBounds() {
    return { x: 0, y: 0, width: this.width, height: this.height };
  }

  isPointInside(gx: number, gy: number): boolean {
    const p = this.worldToLocal(gx, gy);
    return !!p && p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height;
  }

  getA11yAttributes(): A11yAttributes {
    return {
      role: 'meter',
      label: this.label,
      value: String(this._value),
      valuemin: String(this.min),
      valuemax: String(this.max),
    };
  }

  render(renderer: IRenderer) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const r = 70;
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const progress = (this._displayValue - this.min) / (this.max - this.min);
    const sweepAngle = startAngle + (endAngle - startAngle) * progress;

    // トラック
    renderer.beginPath();
    renderer.arc(cx, cy, r, startAngle, endAngle);
    renderer.stroke('rgba(255,255,255,0.12)', 10);

    // 進捗円弧
    if (progress > 0) {
      renderer.beginPath();
      renderer.arc(cx, cy, r, startAngle, sweepAngle);
      renderer.stroke(this.accentColor, 10);
    }

    // 値ラベル
    renderer.fillText(
      `${Math.round(this._displayValue)}`,
      cx - 20,
      cy - 14,
      'bold 36px Inter',
      '#f8fafc',
    );
    renderer.fillText(this.label, cx - 30, cy + 20, '14px Inter', '#94a3b8');
  }
}

// 使用法：
const gauge = new GaugeWidget('CPU', { accent: '#6366f1' });
gauge.setPosition(60, 60);
scene.add(gauge);
gauge.setValue(72);
```

## まとめ

| メソッド                            | オーバーライドする時機                                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `render(renderer)`                  | 常に — ローカル空間の(0,0)でエンティティを描画                                                                                                 |
| `isPointInside(gx, gy)`             | 常に — 装飾エンティティの場合はfalseを返す                                                                                                     |
| `update(dt, time)`                  | フレーム単位のロジック；最初に`super.update`を呼び出す；`dt`はms                                                                               |
| `hasPendingAnimations()`            | `update()`が独自のモーションを駆動する場合 — 「まだ動いている」と報告し、アイドルスロットル/onDemandスキップがレンダリングを継続するようにする |
| `getBounds()`                       | ビューポートカリング用（強く推奨）                                                                                                             |
| `getA11yAttributes()`               | インタラクティブな場合 — シャドウDOMノードを制御                                                                                               |
| `getBatchCircle() / getBatchRect()` | 数千単位のパーティクル様リーフエンティティ                                                                                                     |

## トラブルシューティング

### エンティティを追加したが画面に何も表示されない

順番に確認：

1. **`scene.start()`が呼び出されていない** — これなしではレンダーループは起動しません。
2. **`render()`が描画メソッドを呼び出していない** — 空の`render()`は無音です。`renderer.fill()`または`renderer.stroke()`に到達していることを確認。
3. **`width`または`height`が`0`** — エンティティが画面外またはカリングされている可能性があります。`entity.width = 200; entity.height = 80`を設定して表示されるか確認。
4. **`opacity`が`0`** — `entity.opacity`を確認。
5. **エンティティがシーンに追加されていない** — `new MyEntity()`は構築するだけで追加はしません。`scene.add(entity)`を呼び出してください。

### `isPointInside`が決して`true`を返さない / クリックイベントが発火しない

`isPointInside`は**グローバル（ワールド空間）座標**を受け取ります。これらを`this.x` / `this.y`に対してテストするとネストされた変換で失敗し、`getGlobalPosition()`を減算しても回転と非一様スケールで失敗します。`worldToLocal()`で完全な変換を反転します：

```typescript
// 間違い — エンティティがシーンルートにあり親変換がない場合のみ動作
isPointInside(gx, gy) {
  return gx >= this.x && gx <= this.x + this.width; // ← ネストされたツリーで壊れる
}

// 正しい — ネストされた変換、回転、非一様スケールを処理
isPointInside(gx, gy) {
  const p = this.worldToLocal(gx, gy);
  return !!p && p.x >= 0 && p.x <= this.width
      && p.y >= 0 && p.y <= this.height;
}
```

また、`entity.interactive = true`が設定されていることを確認してください — これがないと、ポインターイベントはエンティティにディスパッチされません。

### `getBatchCircle()` / `getBatchRect()`が使用されていない

見落としがちな2つの要件：

- Sceneのコンストラクタオプションで`pointBackend: 'webgl'`が設定されている必要があります。
- エンティティは**リーフ**（`children`なし）でなければなりません。バッチエンティティに子を`add()`すると、静かに通常の`render()`パスにフォールバックします。

`console.log(scene.getRenderer())`で確認 — レンダラーが`CanvasRenderer`でWebGLレイヤーがない場合、`pointBackend: 'webgl'`が設定されていないか、WebGL2が利用できません。

### DevToolsにシャドウDOMノードがない

a11yシャドウノードは以下の**両方**の条件が真の場合のみ作成されます：

1. `entity.interactive === true`
2. `entity.width > 0`（または`entity.a11yFullViewport === true`）

`interactive = true`でも`width = 0`のエンティティはシャドウノードを作成しません。`entity.width`と`entity.height`を視覚サイズに合わせて設定してください。

## チャレンジ

### プログレスバーエンティティ

アニメーションする塗りつぶしバーを表示し、スクリーンリーダーに進捗インジケーターとして正しく通知される`ProgressBar`エンティティを構築します。

- プロパティ：`min: number`、`max: number`、`value: number`、`barColor: string`、`trackColor: string`、`width`/`height`。
- `setValue(n: number)`を実装し、`n`を`[min, max]`にクランプして`this.animate({ displayValue: n }, 400)`を呼び出します。`displayValue`がレンダリングされる塗りつぶし幅を駆動します。
- `getA11yAttributes()`をオーバーライドして`{ role: 'progressbar', valuemin, valuemax, value }`を文字列として返し、支援技術が現在のパーセンテージを通知できるようにします。

### ドーナツチャート

`GaugeWidget`（このページ下部の完全な例）を拡張し、トラック円弧と進捗円弧の間に可視ギャップのあるドーナツ形状をレンダリングし、値の下にカテゴリ凡例ラベルを追加します。

- トラック円弧の半径を6px減らし、進捗円弧の半径を6px増やす（またはその逆）ことで、2つの同心リング間に可視ギャップを作成します。
- `legendLabel: string`プロパティを追加し、数値の下に小さく控えめな色で`renderer.fillText`を使ってレンダリングします。
- `getA11yAttributes()`を更新して、返される`label`フィールドに`legendLabel`を追加し、完全な説明がスクリーンリーダーで通知されるようにします。

### クリックカウンターチップ

このページのインタラクティブセクションの`Chip`エンティティを拡張し、クリックごとにカウンターを増分し、右上隅にカウントを表示する小さな円形バッジを表示します。

- `clickCount = 0`プロパティを追加し、既存のトグルとスケールアニメーションとともに、`'click'`ハンドラー内でインクリメントします。
- `render()`で、`clickCount > 0`の場合のみバッジ（カウントをテキストとして含む小さな塗りつぶし円）を描画します。チップのローカル座標空間の`(this.width - 10, -6)`に配置します。
- `getA11yAttributes()`をオーバーライドして、現在のカウントを`label`フィールドに含めます（例：`'OK — 3 clicks'`）。これにより、カウントが変わってもアクセシブル名が最新のままになります。

> **次へ：** [イベントとヒットテスト](/learn/events/) — ポインターイベントがキャプチャとバブルでエンティティツリーを伝播する方法。
