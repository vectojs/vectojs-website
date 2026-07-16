---
title: 'ThreeAdapter'
description: 'VectoJS の Scene をキャンバスにレンダリングし、THREE.CanvasTexture として公開し、UV レイキャスティングを介してポインタイベント（WebXR コントローラーやマルチタッチを含む）を配線します。'
order: 42
---

# `ThreeAdapter`

[`@vectojs/three`](/reference/three/) の一部。

`ThreeAdapter` は、指定された `canvas` を使用するか、省略された場合は作成します。VectoJS の `Scene` をそのキャンバスにレンダリングし、結果を `THREE.CanvasTexture` としてラップし、すぐに使える `THREE.Mesh`（`MeshBasicMaterial` を持つ単位 `PlaneGeometry`）を提供します。Three.js のイベントリスナーからのポインターおよびスクロールイベントは、レイキャスティングを介して VectoJS の論理座標に変換されます。

3D シーンがあり、サーフェス上に浮かぶ 2D UI パネルが必要な場合にこれを使用します — Three.js シーンの残りの部分は変更されず、Canvas 2D レンダリングを維持できます。`Scene` 自体のレンダリングバックエンドとして Three.js を使用する場合は、代わりに [`ThreeRenderer`](/reference/three-renderer/) を参照してください。

## コンストラクタ

```ts
new ThreeAdapter(options: ThreeAdapterOptions)
```

```ts
interface ThreeAdapterOptions {
  width: number; // 2D UI シーンの論理幅（CSS px）
  height: number; // 論理高さ（CSS px）
  canvas?: HTMLCanvasElement; // オプションの既存キャンバス；省略時はアダプターが作成
  sceneOptions?: SceneOptions; // VectoScene コンストラクタに転送
}
```

`disableWindowResize` は、`sceneOptions` で何を渡しても内部的に強制的に `true` に設定されます — アダプターはウィンドウではなく、`resize(w, h)` を介してリサイズを管理します。

## パブリックプロパティ

| プロパティ   | 型                    | 説明                                                                                                                     |
| ------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `texture`    | `THREE.CanvasTexture` | VectoJS キャンバスをラップするテクスチャ。VectoJS のレンダーフレームごとに自動的に `needsUpdate = true` が設定されます。 |
| `vectoScene` | `VectoScene`          | アクティブな VectoJS `Scene` インスタンス。ここにエンティティを追加します。                                              |
| `canvas`     | `HTMLCanvasElement`   | アダプター所有または呼び出し元が指定した、VectoJS が描画するキャンバス。                                                 |
| `mesh`       | `THREE.Mesh`          | 事前構築済みの `PlaneGeometry(1, 1)` + `MeshBasicMaterial` メッシュ。Three.js シーンにそのまま追加できます。             |

## メソッド

### `updateIntersection(raycaster, type, originalEvent?)`

```ts
updateIntersection(
  raycaster: THREE.Raycaster,
  type: 'pointerdown' | 'pointerup' | 'pointermove' | 'wheel' | 'click',
  originalEvent?: PointerEvent | WheelEvent
): boolean
```

アダプターメッシュに対してレイをキャストし、UV ヒットを VectoJS キャンバス座標に変換し、イベントを VectoJS シーンにディスパッチします。レイがメッシュに交差した場合に `true` を返します。

ポインターボタンの状態と `shiftKey`/`ctrlKey`/`altKey`/`metaKey` は保持されます。
ホイールイベントは、すべてのデルタ値と修飾キーを追加で保持します。

Three.js のレンダーループまたはポインタイベントリスナー内からこれを呼び出してください。アダプターは `pointerId` ごとのホバー状態を維持するため、WebXR コントローラーとマルチタッチ入力はそれぞれ独立したホバー/フォーカスコンテキストを持ちます。

**UV リマッピング**：Three.js の UV 座標はプレーンの下部が Y=0 です。VectoJS は上部が Y=0 です。アダプターは Y 軸を自動的に反転します — 座標を調整する必要はありません。

### `resize(width, height)`

```ts
resize(width: number, height: number): void
```

キャンバスとその基になる論理的な `VectoScene` をリサイズします。パネルのレンダリング解像度または 2D レイアウトビューポートが変更されたときに呼び出します。メッシュのワールド空間スケールのみを変更する場合は、これは必要ありません。

### `dispose()`

```ts
dispose(): void
```

冪等に `THREE.CanvasTexture`、ジオメトリ、マテリアルをメッシュから破棄し、メッシュをデタッチし、Scene のレンダリングメソッドを復元し、`VectoScene` を破棄し、すべてのポインター単位の状態をクリアします。アダプターが作成したキャンバスは `0×0` に解放されます。呼び出し元が指定したキャンバスはその寸法を保持します。

## 完全な例

次の例では、Three.js シーン内の回転するプレーン上に VectoJS の設定パネルをレンダリングします。`pointermove`、`pointerdown`、`pointerup` の DOM リスナーからのポインタイベントは、`updateIntersection` を介して VectoJS に転送されます。

```ts
import * as THREE from 'three';
import { ThreeAdapter } from '@vectojs/three';
import { Text, Button, Stack } from '@vectojs/ui';

// --- Three.js シーン設定 ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const threeScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3);

// --- VectoJS パネルアダプター（512×256 論理ピクセル、2×1 プレーンに表示） ---
const adapter = new ThreeAdapter({ width: 512, height: 256 });

const heading = new Text('Settings', { font: '600 24px Inter', color: '#f8fafc' });
const applyBtn = new Button('Apply', { width: 120, height: 40 });
applyBtn.on('click', () => console.log('apply clicked'));

const stack = new Stack({ direction: 'vertical', gap: 20 });
stack.add(heading);
stack.add(applyBtn);
stack.setPosition(20, 20);
adapter.vectoScene.add(stack);

adapter.vectoScene.start();

// --- Three.js シーンにメッシュを配置 ---
const panel = adapter.mesh;
panel.scale.set(2, 1, 1); // ワールド空間サイズが 2:1 のアスペクト比に一致
threeScene.add(panel);

// --- イベント変換用のレイキャスター ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function updatePointer(event: PointerEvent) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

window.addEventListener('pointermove', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'pointermove', e);
});

window.addEventListener('pointerdown', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'pointerdown', e);
});

window.addEventListener('pointerup', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'pointerup', e);
});

window.addEventListener('click', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'click', e);
});

window.addEventListener('wheel', (e) => {
  updatePointer(e as unknown as PointerEvent);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'wheel', e);
});

// --- レンダーループ ---
function animate() {
  requestAnimationFrame(animate);
  panel.rotation.y += 0.005;
  renderer.render(threeScene, camera);
}

animate();

// --- クリーンアップ ---
window.addEventListener('unload', () => adapter.dispose());
```

## アダプターの内部動作

コンストラクタは `vectoScene.render` をモンキーパッチして、VectoJS の各フレーム後に `texture.needsUpdate = true` を設定します。Three.js は次の `renderer.render()` 呼び出しでキャンバスを GPU にアップロードします。ポーリングや手動同期は必要ありません。

レイキャスト UV 座標は、シーンの**論理**座標空間（`vectoScene.width`/`height` — コンストラクタに渡した寸法）にマッピングされます。アダプターキャンバスの物理バッキングストアサイズではありません。この違いは HiDPI ディスプレイで重要です：`@vectojs/core` の `CanvasRenderer` は、鮮明なレンダリングのためにバッキングストアを `devicePixelRatio` でスケーリングします（`canvas.width = logicalWidth × dpr`）が、エンティティのレイアウトとヒットテストは論理的なままです。

> [!WARNING] > **`@vectojs/three` ≤ 0.1.1 では、UV マッピングは物理キャンバスサイズを使用していました** — そのため、`devicePixelRatio ≠ 1` となるディスプレイやブラウザズームレベルでは、すべてのポインタイベントがカーソルの右下に正確に DPR 係数分ずれて着弾していました。症状は特徴的です：カーソル下のコントロールではなく、パネルの**さらに下**にあるコントロールがクリックされ、ターゲットがパネルの奥にあるほどオフセットが大きくなります — DPR-1 ディスプレイやヘッドレステスト環境では正常に動作します。**0.1.2** で修正されました。回避策ではなくアップグレードしてください。

`updateIntersection` によってディスパッチされたヒットイベントは、エンティティのアクセシビリティ DOM 要素が存在し**ライブドキュメントに接続されている**場合（a11y シャドウレイヤーを経由してインタラクティブコンポーネントで `click`/`change` を発生させる）にその要素に転送されるか、それ以外の場合は `VectoJSEvent` オブジェクトとして直接転送されます。

> [!NOTE]
> デフォルトのアダプター作成キャンバスの場合、パネルはキャンバスとその a11y ルートがデタッチされているため、直接 `VectoJSEvent` パスを取ります。ドキュメントに接続されたキャンバスを提供する場合、その接続された a11y 要素は DOM ディスパッチパスを使用できます。`@vectojs/three` のバージョン 0.1.1 以降では、どちらの場合も想定するのではなく、接続状態をチェックします。
>
> **これは、エラーの回避だけでなく、`Toggle`/`Button` の正確性にとって重要です。** `@vectojs/three` のバージョン 0.1.0 では、切断された a11y 要素が誤って DOM ディスパッチブランチを選択し、コンポーネントコールバックを静かに見逃す可能性がありました。バージョン 0.1.1 以降では、切断された要素は直接ルーティングされます。ネイティブ DOM のフォーカス/IME/スクリーンリーダー動作は、デフォルトのデタッチされたキャンバスでは利用できませんが、呼び出し元が指定したキャンバスとその投影レイヤーが接続されている場合は可能です。

## WebXR とマルチタッチ

`updateIntersection` は `originalEvent` から取得した `pointerId` ごとにホバー状態を追跡します。WebXR セッションでは、各コントローラーが独自の `pointerId` を持つため、一方のコントローラーでのホバーが他方の状態に干渉することはありません。生の `XRInputSourceEvent` を、コントローラーの `inputSource.handedness` を `pointerId`（左は 0、右は 1）としてエンコードした合成 `PointerEvent` でラップして渡すことで、独立したヒット状態を維持します。

```ts
// WebXR の例 — 最小限のコントローラーイベント転送
session.addEventListener('selectstart', (xrEvent) => {
  const synth = new PointerEvent('pointerdown', {
    pointerId: xrEvent.inputSource === leftController ? 0 : 1,
  });
  raycaster.setFromCamera(controllerUV, camera);
  adapter.updateIntersection(raycaster, 'pointerdown', synth);
});
```

## 関連情報

[`ThreeRenderer`](/reference/three-renderer/)（代替ユースケース — Three.js を `Scene` のレンダリングバックエンドとして使用） ·
[`Scene`](/reference/core-scene/)（`vectoScene`） ·
[`@vectojs/three` 概要](/reference/three/)
