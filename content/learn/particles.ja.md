+++
title = "Particle Systems"
description = "ComputeParticleEntity：WebGPUコンピュートパーティクル、CPUフォールバック、8-floatのメモリレイアウト、マウスインタラクション、triggerExplosion。"
weight = 12
+++

# Particle Systems

`ComputeParticleEntity`は、VectoJSの高スループットなパーティクルレイヤーです。WebGPUコンピュートパスを通じてばね物理シミュレーションを実行し、WebGPUをサポートしないブラウザ向けにCPUフォールバックを備えています。サポートされるパーティクル数とフレームレートは、GPU、ブラウザ、DPR、レンダリング設定に強く依存します。リポジトリには現在、チェックインされた100k/1Mのハードウェアベンチマークは含まれていません。

## ライブで試す

<figure class="sandbox">
  <a class="sandbox-cta" href="/demos/nexus/">
    <span class="sandbox-cta-title">Nexusパーティクルデモを開く →</span>
    <span class="sandbox-cta-sub">WebGPU上でシミュレートされ、「VectoJS」の文字を綴る数万個の<code>ComputeParticleEntity</code>点。ドラッグでパン、スクロールでズーム、クリックでフィールドにパルスを送ります。</span>
  </a>
  <figcaption>パーティクルフィールドは、スタンドアロンのWebGPUページとしてフルスピードで動作します——小さな埋め込みiframeでは足を引っ張られたため、本物へのリンクとしています。</figcaption>
</figure>

## パーティクル と `getBatchCircle`

|              | `ComputeParticleEntity`            | カスタムエンティティ上の`getBatchCircle` |
| ------------ | ---------------------------------- | ---------------------------------------- |
| 物理         | 組み込み（ばね、マウス反発、爆発） | 手動——`update()`内で位置を更新する       |
| バックエンド | WebGPUコンピュートまたはCPU        | WebGLポイントレイヤー                    |
| スループット | ハードウェア/ワークロード依存      | ハードウェア/ワークロード依存            |
| 使いどき     | 自己完結型の物理フィールド         | 直接制御するポイントクラウド             |

編隊へとばね運動し、カーソルに反応し、爆発をトリガーするパーティクルフィールドが必要なら、`ComputeParticleEntity`が適したツールです。自分で制御する位置に多数の点をレンダリングしたいだけなら、カスタムエンティティ上に`getBatchCircle()`を実装してください。

## 基本セットアップ

```typescript
import { Scene, ComputeParticleEntity } from '@vectojs/core';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;

const scene = new Scene(canvas, {
  particleBackend: 'auto', // 'webgpu' | 'cpu' | 'auto' (default: tries WebGPU, falls back)
  pointBackend: 'webgl', // needed for CPU fallback rendering
  maxFPS: 60,
});

const particles = new ComputeParticleEntity({
  maxParticles: 50_000,
  springK: 0.05, // spring pull toward origin (0–10)
  damping: 0.95, // velocity damping per step (0–1)
  bounceDamping: 0.5, // energy retained on boundary bounce (0–1)
  maxVelocity: 500, // speed clamp
  size: 3, // base particle radius in px
  color: '#00f0ff',
  pointerEvents: false, // true → entity captures hit events
});

scene.add(particles);
scene.start();

// IMPORTANT: resize before calling initRandomParticles
scene.resize(window.innerWidth, window.innerHeight);

// Scatter particles across the viewport
particles.initRandomParticles(scene.width, scene.height);

window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
});
```

> [!CAUTION] > `resize(w, h)`は`initRandomParticles`の**前に**呼ぶ必要があります。`0×0`のビューポートは、すべてのパーティクル位置がデフォルトで`(0, 0)`となり、シミュレーションが跳ね返る境界を持たないことを意味します。幅または高さがゼロの場合、`scene.start()`は一度だけ警告をログ出力します。

## 8-floatのメモリレイアウト

各パーティクルは、`entity.particleData`内の8つの連続する`float32`値です：

| オフセット定数               | インデックス | フィールド | 備考                                                   |
| ---------------------------- | ------------ | ---------- | ------------------------------------------------------ |
| `PARTICLE_OFFSET_POSITION_X` | 0            | position.x | 現在のワールド空間x                                    |
| `PARTICLE_OFFSET_POSITION_Y` | 1            | position.y | 現在のワールド空間y                                    |
| `PARTICLE_OFFSET_VELOCITY_X` | 2            | velocity.x |                                                        |
| `PARTICLE_OFFSET_VELOCITY_Y` | 3            | velocity.y |                                                        |
| `PARTICLE_OFFSET_ORIGIN_X`   | 4            | origin.x   | ばねの静止/アンカー点                                  |
| `PARTICLE_OFFSET_ORIGIN_Y`   | 5            | origin.y   |                                                        |
| `PARTICLE_OFFSET_SIZE`       | 6            | size       | パーティクルごとのサイズ上書き                         |
| `PARTICLE_OFFSET_LIFE`       | 7            | life       | `-1` = 永続；`≥0`は0.5/sで減衰；`0` = 死亡（スキップ） |

カスタムな編隊を設定するため、`particleData`を直接読み書きできます。書き込み後、次のフレームでのGPUアップロードをトリガーするため`needsInit = true`を設定してください。

## テキスト形状とパターンの形成

`setOrigins()`は、パーティクルを編隊へとばね運動させる主要な方法です。交互に並ぶ`[x0, y0, x1, y1, …]`のペアのフラットな`Float32Array`——パーティクルごとに1つ——を渡します：

```typescript
// Arrange 10,000 particles in a grid
const N = 10_000;
const cols = 100;
const origins = new Float32Array(N * 2);

for (let i = 0; i < N; i++) {
  const col = i % cols;
  const row = Math.floor(i / cols);
  origins[i * 2] = 100 + col * 8; // x
  origins[i * 2 + 1] = 100 + row * 8; // y
}

particles.setOrigins(origins); // also uploads particleData to GPU
```

`setOrigins(points, requestPositionReset = true)` — 第2引数は、パーティクルが新しい原点にテレポートするか（即座の編隊変更に便利）、現在の位置からそれらへ向かってばね運動するかを制御します。

原点を変えずに位置を設定するには、`setPositions()`を使ってください。初期速度（例：中心から外側への噴出）を設定するには、`setVelocities()`を使ってください。

これら3つのメソッドはすべて`particleData`に書き込み、`needsInit = true`を設定するため、データは次のフレームでWebGPUストレージバッファにアップロードされます。

## マウスインタラクション

`pointerEvents: true`のとき、`Scene`はカーソル座標をパーティクルシミュレーションに渡します。カーソルの**120 px**以内のパーティクルは反発します：

```typescript
const particles = new ComputeParticleEntity({
  maxParticles: 100_000,
  pointerEvents: true,
});
scene.add(particles);
```

反発の半径と力はシェーダー内で固定されています。カーソルがキャンバスを離れると、反発が適用されないよう、反発点は`(-99999, -99999)`に設定されます。

## アクセシビリティとパーティクルフィールドのヒットテスト

パーティクルフィールドは装飾的です：個々のパーティクルは宣言する価値のあるセマンティクスを持たず、誰もそれをデベロッパーツールで検査したりテキストとして選択したりしません。フィールドを1つのオブジェクトとして扱います。

**各パーティクルに `interactive = true` を設定しないでください。** そうするとエンティティごとに1つの実DOM要素がセマンティックレイヤーに投影され、カウントが増えるにつれてエンティティあたりのコストは悪化します — RTX 4060ラップトップで測定したところ、20,000の個別にインタラクティブな移動エンティティはChromeで715ms/フレーム、Firefoxで2,737ms/フレームでした。[コストテーブル](/learn/accessibility/#コストはインタラクティブエンティティ数に対して超線形に増加する)を参照してください。

代わりに：

- **フィールドを一度だけラベル付けします。** `ComputeParticleEntity`（またはラッパー）に、効果全体を説明する`role`と`aria-label`を返す単一の`getA11yAttributes()`を与えます。1ノード、一定コスト。
- **投影せずにヒットテストします。** `scene.findEntityAt(x, y)`は`interactive`に関係なくエンティティを解決するため、ポインタ操作に投影要素は必要ありません。`pointerEvents: true`はカーソル座標をシミュレーションに供給し、セマンティックレイヤーとは独立しています。
- **効果が純粋に装飾的な場合は、そう宣言します。** 投影しないままでいることが正しい回答であり、装飾的なDOM要素の`aria-hidden`と同等です — ただし、効果が伝える*情報*はテキストでも利用可能であることを確認してください。

## 爆発をトリガーする

`triggerExplosion(x, y, force)`は、次のシミュレーションステップに向けてインパルスをキューに入れます。`(x, y)`の**150 px**以内のすべてのパーティクルが、`force`でスケールされた外向きの速度キックを受けます：

```typescript
canvas.addEventListener('dblclick', (e) => {
  const point = scene.clientToScene(e.clientX, e.clientY);
  particles.triggerExplosion(point.x, point.y, 800);
});
```

一度にキューに入れられる爆発は1つだけです——前の爆発が消費される前に`triggerExplosion`を呼ぶと、それを上書きします。

## WebGPU と CPUフォールバック

`particleBackend`オプションは、どのパスが使われるかを制御します：

| 値                     | 動作                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `'auto'`（デフォルト） | WebGPUを試み、失敗または不在時にCPUへフォールバックする                                     |
| `'webgpu'`             | WebGPUを明示的に要求する。現在のランタイムは初期化に失敗するとやはりCPUへフォールバックする |
| `'cpu'`                | CPUシミュレーションを強制する。利用可能でもWebGPUを無効化する                               |

**WebGPUがアクティブなとき：**シミュレーションはGPU上でコンピュートシェーダーとして実行されます。パーティクル状態はWebGPUストレージバッファに存在し、Sceneの専用WebGPUキャンバスへとレンダリングされます。

**CPUフォールバックがアクティブなとき：**`Scene`は毎フレーム`entity.updateCPU(dt, mouseX, mouseY, width, height)`を呼びます（同じ物理モデル——ばね、反発、爆発、速度上限、跳ね返り）。Canvas2D上の`fillCircle()`または任意のWebGLポイントレイヤーを介してレンダリングします。ターゲットのブラウザとハードウェアでの測定から個数を選んでください。

> [!NOTE] > `particles.gpuStorageBuffer !== null`はGPUリソースがアロケートされたことを示しますが、
> 非同期なデバイスロスの後の信頼できるライブなバックエンド状態ではありません。

デバイスロスは、セッションのWebGPUを恒久的に無効化する前に、指数バックオフ（3回リトライ）で自動回復されます。

### GPUからパーティクル位置を読み戻す

パーティクル状態はGPUバッファに存在します。それを安価に読み戻すことはできません——`mapAsync` + `copyBufferToBuffer`のラウンドトリップはパイプラインをストールさせます。CPU上で位置が必要な場合（例：非パーティクルエンティティとの衝突判定）、自分で`particleData`に書き込み`setPositions()`を使うことで、CPU側の`Float32Array`を同期させておいてください。

パーティクルシステム内で完結する大規模な空間クエリには、追加のWebGPUコンピュートパスを書いてください。他のエンティティとの衝突には、CPUパス上で`SpatialHashGrid`を使ってください。

## GPUリソースの管理

```typescript
// Clean up GPU buffers when done (e.g. on page unload or component teardown)
particles.destroyGPUResources();
scene.remove(particles);
```

`scene.destroy()`は、すべてのパーティクルエンティティに対して`destroyGPUResources()`も呼び出すため、手動で呼ぶ必要があるのはセッション途中のティアダウンのときだけです。

## WebGPU用のTypeScript型

プロジェクトがWebGPU APIを使い、TypeScriptが`Cannot find name 'GPUDevice'`を報告する場合：

```bash
bun add -d @webgpu/types
```

```json
{ "compilerOptions": { "types": ["@webgpu/types"] } }
```

## トラブルシューティング

### 画面に何も表示されない

順番に確認してください：

1. **`initRandomParticles()`が呼ばれなかった**——これがないと、すべてのパーティクル位置は`(0, 0)`でサイズは`0`です。
2. **`initRandomParticles`の前に`resize(w, h)`が呼ばれなかった**——`0×0`のボックスに散らばったパーティクルは不可視です。`scene.width`と`scene.height`がゼロでないことを確認してください。
3. **WebGPUの初期化に失敗した**——現在のランタイムは、`'webgpu'`が明示的に要求された場合でも、失敗をログ出力し、GPUパスを無効化し、CPUフォールバックを通じて続行します。
4. **`pointBackend`が`'webgl'`に設定されていない**——CPUフォールバックは`fillCircle`を介してレンダリングします。`'webgl'`がなくても、キャンバスレンダラーがアクティブであれば、CPUパスのパーティクルはCanvas2D上に依然として表示されます。

### FPSが期待よりずっと低い

- ブラウザのGPUツールとWebGPUキャンバスを使って、アクティブなパスを検証してください。保持された`gpuStorageBuffer`だけでは、デバイスロス後の永続的な状態シグナルにはなりません。
- ヘッドレス / CI環境では、WebGPUとWebGLはソフトウェアレンダラー（Swiftshader）にフォールバックします。ヘッドレスでのFPSは代表的ではありません。実際のGPUハードウェアで測定してください。
- プロファイリング中は`maxParticles`を減らし、ターゲットデバイスでフレーム時間のパーセンタイルを記録してください。このリポジトリは、普遍的なCPUまたはGPUの上限を定めていません。

### パーティクルが私の編隊ではなく`(0, 0)`にばね運動する

`setOrigins()`と`setPositions()`は両方とも`needsInit = true`を設定し、次のフレームで`particleData`をGPUバッファにアップロードします。それらを`scene.start()`の**前に**呼ぶ場合は、アップロードが起こるよう、後から`start()`が呼ばれることを確認してください。
