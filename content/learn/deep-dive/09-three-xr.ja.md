+++
title = "09 — Three.js / XR ブリッジ — 2 つの座標世界"
description = "VectoJS の 2D canvas 契約と Three.js の 3D 空間をつなぐアダプタ：CanvasTexture パネル、raycast→UV→scene マッピング、オフスクリーンのフォーカス／キーボード所有権、そして Graph3D が示すピュア Three 側の対照。"
weight = 29
+++

# 09 — Three.js / XR ブリッジ — 2 つの座標世界

> **ボス 09** は 2 つの入力モデルが衝突する場所に立つ。VectoJS は透過的な a11y DOM がポインタとキーボード配送を所有する 2D 論理ピクセルシーンに描画し、Three.js はポインタがレイでありパネルがワールド空間に浮かぶテクスチャ付きクアッドである WebGL シーンに描画する。`ThreeAdapter` は両方を話す唯一の部品である。

- **学べること**: なぜアダプタがレンダラではなく座標系ブリッジなのか、`CanvasTexture` テクスチャパスとその `needsUpdate` プロキシ、`Raycaster` の UV がどのように論理ピクセルにマップされるか（そして DPR の罠）、ポインタ・ホイール・ホバー・フォーカス・キーボード所有権がオフスクリーン canvas を経由してどのように再ルーティングされるか、そして `Graph3D`／`GraphCamera`／`GraphInteraction` が示すピュア Three の代替。
- **学べないこと**: `IRenderer` 契約自体（ボス 07）、テキストラスタライズと y-down ortho の詳細（ボス 07 §Text raster paths）、WASM 高速化（ボス 08）、2D force レイアウトチューニング（ボス 11）。本ドキュメントは VectoJS の 2D 契約と 3D ホストの間の継ぎ目である。

## 1. なぜアダプタが難しいのか — 2 つの世界、1 枚の canvas

通常の VectoJS `Scene` はページに挿入された `<canvas>` を所有する。その a11y ミラーはその canvas の `a11yRoot`（canvas の上に積み重ねられた `<div>`）に追加され、ポインタ／キーボード配送はそれらのミラーを経由して実行される（`Scene.ts:3512` ミラーごとのリスナー）。ブリッジでは canvas は**オフスクリーン**である — ドキュメントに挿入されることはなく、GPU テクスチャとしてサンプリングされる。

この単一の事実が連鎖する：

| world       | who owns input                                      | where pixels live                      | who owns focus                                                                                    |
| ----------- | --------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| VectoJS 2D  | 投影された a11y DOM（`Scene` ミラーごとのリスナー） | `canvas.width/height` バッキングストア | `document.activeElement` + `Scene.focusedA11yElement`（`Scene.ts:1446`）                          |
| Three.js 3D | `THREE.Raycaster` + `window`／`domElement` リスナー | `CanvasTexture` 上の `PlaneGeometry`   | Three は DOM フォーカスを持たない。ホストの `OrbitControls` または `GraphCamera` がポインタを所有 |

`ThreeAdapter`（`packages/three/src/ThreeAdapter.ts:90`）は、ピクセルが 3D ヒットテストの背後にありミラーが `document` から恒久的に切断された状態で、オンスクリーンであると信じている 2D シーンを正しく振る舞わせなければならない。

パッケージ内のもう 1 つのモジュールである `ThreeRenderer`（`packages/three/src/ThreeRenderer.ts:216`）は、同じ問いに対する異なる答えである：それは VectoJS の Entity を `CanvasRenderingContext2D` の代わりに Three.js で描画する `IRenderer`（`IRenderer.ts:41` 契約）**である**。アダプタは Scene をテクスチャとしてラップし、レンダラは 2D コンテキストを置換する。両者は同じ y-down ortho と DPR の罠を共有するが（ボス 07）、所有権は逆である：アダプタの `vectoScene` はデフォルトで `CanvasRenderer` でレンダリングし続け、レンダラの `scene/camera/renderer`（`ThreeRenderer.ts:219`）は Entity を直接レンダリングする。

## 2. テクスチャパス — VectoJS ピクセルから Three.js クアッドへ

```ts
// packages/three/src/ThreeAdapter.ts:125 — construction (abbreviated)
this.canvas = optCanvas ?? (document ? document.createElement('canvas') : offscreenFallback);
this.vectoScene = new VectoScene(this.canvas, { disableWindowResize: true, ...sceneOptions });
this.texture = new THREE.CanvasTexture(this.canvas);
this.texture.minFilter = THREE.LinearFilter; // ThreeAdapter.ts:151
this.texture.magFilter = THREE.LinearFilter; // ThreeAdapter.ts:152
this.vectoScene.render = (renderer, dt, time) => { originalRender.call(...); this.texture.needsUpdate = true; }; // ThreeAdapter.ts:157
this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false })); // ThreeAdapter.ts:163
```

`file:line` 付きの設計メモ：

- **オフスクリーン canvas の所有権** — `ThreeAdapter.ts:122` `_ownsCanvas` はアダプタが canvas を作成したかどうかを追跡する。`dispose()`（`ThreeAdapter.ts:750`）は所有する場合のみ `canvas.width/height` をゼロにする。呼び出し元が提供した canvas はそのまま残される。SSR フォールバック（`ThreeAdapter.ts:78` `OffscreenCanvasFallback`）は `document` が undefined のときに存在するメンバーを正確に記述する — 以前は `{width,height} as HTMLCanvasElement` という素のオブジェクトがその契約を隠していた。
- **リサイズは手動** — `sceneOptions.disableWindowResize = true`（`ThreeAdapter.ts:140`）。フルウィンドウの `Scene` は `window.innerWidth/Height` を自動的に採用するためである（`Scene.ts:2284`）。テクスチャ backed なシーンはウィンドウに追従してはならない。ホストは `adapter.resize(w,h)`（`ThreeAdapter.ts:713`）を呼び出す。これはバッキングストア、Scene ビューポートをリサイズし、`texture.needsUpdate` をマークする。
- **dirty ゲートされた upload** — render プロキシ（`ThreeAdapter.ts:155`）は Scene が実際に再描画したときのみ `texture.needsUpdate = true` を設定する。連続する `Scene.renderMode: 'always'` ループでも毎フレーム upload し、`onDemand` の Scene は `markDirty()` が発火したときのみ upload する — すべての入力パスがそうする（`ThreeAdapter.ts:270`、`ThreeAdapter.ts:612`）。
- **デフォルトメッシュは便宜であり処方ではない** — `mesh` は単位 `PlaneGeometry(1,1)`（`ThreeAdapter.ts:163`）である。曲面スクリーン、ビルボード、VR ダッシュボードが必要なホストはジオメトリ／マテリアルを置換し `texture` を保持する。メッシュはどのシーンにも事前追加されない。ホストが `scene3d.add(adapter.mesh)` する。
- **破棄の衛生** — `dispose()`（`ThreeAdapter.ts:723`）は Scene を破棄する**前**に `vectoScene.render` を `_originalRender`（`ThreeAdapter.ts:730`）に復元する。さもなければ生き残った参照が削除済みテクスチャに `needsUpdate` を設定し、Three は `trying to use deleted texture` をログする。その後 `texture`、`geometry`、`material`（複数）を破棄し、親から `mesh` を削除し、`vectoScene.destroy()` を呼び、`activePointers` をクリアし、ミラーがもはや存在しないため emit せずに `_focusedEntity` を破棄し、所有する場合のみ canvas をゼロにする。

`ThreeRenderer` は代替のテクスチャパスである — アダプタ canvas 自体がない。独自の `THREE.Scene` + `THREE.OrthographicCamera(0,width,0,height)` + `THREE.WebGLRenderer({canvas, alpha:true, antialias:true})` を所有する（`ThreeRenderer.ts:256`）。その y-down ortho、`effectiveDPR`／`pixelRatio` クランプ、コンテキストロスト復旧、`present()` 遅延はボス 07 でカバーされる。ブリッジ固有の事実は、それが `IRenderer` を実装するため任意の `Entity.render(r)` がそのまま動作すること、そして `fillText`／`drawImage` キャッシュが `dpr` と丸めた `x,y` フェーズでキー付けされることである（`ThreeRenderer.ts:1002`）。

ブリッジ関連の内部で、再発見しないよう名前を挙げておく価値があるもの：

- **DPR** — `effectiveDPR()`（`ThreeRenderer.ts:309`）は `min(real DPR, maxDPR)` であり、`pixelRatio`（`ThreeRenderer.ts:324`）はスナップショットではなくライブの `renderer.getPixelRatio()` である。`Scene` はすべての `resize` で `maxDPR` をレンダラに同期する（`Scene.ts:286`）。`ThreeRenderer.resize`（`ThreeRenderer.ts:355`）は `setSize`／`updateProjectionMatrix` の前にクランプされた比率を再適用する。`window.devicePixelRatio` ではなく `pixelRatio` でキー付けされたテクスチャは、クランプされたディスプレイでぼやける。
- **コンテキストロスト** — `webglcontextlost` は `preventDefault` される（`ThreeRenderer.ts:281`）ため `webglcontextrestored` が発火できる。復旧ハンドラは `effectiveDPR` を再適用し、リサイズし、`frameDirty` をマークしてクリアされたフレームバッファに `present()` する（`ThreeRenderer.ts:285`）。`dispose()` は両リスナーをデタッチし `renderer.forceContextLoss()` を呼ぶ（`ThreeRenderer.ts:1186`）ため SPA 再マウントでライブ GL コンテキストがリークしない。
- **Y-down の帰結** — すべての塗りプリミティブは `side: DoubleSide`（`ThreeRenderer.ts:596` fill、`:658` drawImage、`:1049` fillText）と `texture.flipY = false`（`ThreeRenderer.ts:628` drawImage、`:1035` fillText）を必要とする。これらがなければ、y-down ortho（`ThreeRenderer.ts:250`）の下で FrontSide 面はカリングされ、画像／テキストは上下反転する。
- **キャッシュ** — `textTextureCache`（`ThreeRenderer.ts:911`）と `imageTextureCache`（`ThreeRenderer.ts:599`）は identity キー、LRU で `256` で eviction（`ThreeRenderer.ts:635`、`:1040`）、`userData.vectoCached` でフラグ付けされるためフレームごとの `disposeActiveObjects`（`ThreeRenderer.ts:380`）はそれらをスキップし、`drawImage` は LRU 順のためにヒットで再挿入する（`ThreeRenderer.ts:641`）。可変 canvas ソースは `invalidateImage` を呼ばなければならない（`ThreeRenderer.ts:602`）。

## 3. 座標マッピング — UV → 論理ピクセル（そして 3 つの罠）

### 3.1 raycast エントリ

```ts
// packages/three/src/ThreeAdapter.ts:181
public updateIntersection(raycaster: THREE.Raycaster, type, originalEvent?): boolean {
  const intersects = raycaster.intersectObject(this.mesh); // ThreeAdapter.ts:186
  if (intersects.length > 0 && hit.uv) {
    state.lastUv.copy(hit.uv);
    this.dispatchAtUv(type, hit.uv, pointerId, originalEvent);
  } else if (state.isHovering) {
    this.dispatchAtUv('pointerleave', state.lastUv, pointerId, originalEvent); // ThreeAdapter.ts:209
  }
}
```

呼び出し元が `Raycaster` を所有する — 通常は `raycaster.setFromCamera(ndc, camera)` であり、`ndc` は `((clientX/width)*2-1, -((clientY/height)*2-1))` である。これは `GraphInteraction.setPointerFromEvent`（`packages/graph3d/src/GraphInteraction.ts:157`）や `GraphCamera` のホイールズーム（`packages/graph3d/src/GraphCamera.ts:363`）の形状である。

### 3.2 UV からシーンピクセルへ — バッキングストアではなく論理、y 反転

```ts
// packages/three/src/ThreeAdapter.ts:240
private dispatchAtUv(type: VectoEvent, uv: THREE.Vector2, ...): void {
  const px = uv.x * this.vectoScene.width;        // ThreeAdapter.ts:251 — logical width
  const py = (1.0 - uv.y) * this.vectoScene.height; // ThreeAdapter.ts:253 — flip Three's bottom-origin
  this.dispatchAtPoint(type, px, py, ...);
}
```

3 つの罠、それぞれ修正済みバグの背後にあるもの：

1. **論理 vs バッキングストア（DPR）** — `canvas.width = logicalWidth * devicePixelRatio` は HiDPI でのことである（`CanvasRenderer` バッキングストア、ボス 07 §DPR）。Entity レイアウトと `findEntityAt` は論理である。`uv.x * canvas.width` を掛けると、すべてのヒットが `dpr` 倍ずれる。`ThreeAdapter.ts:246` のコメントはこれを明示している。プログラム的エントリ（`dispatchPointer`、`ThreeAdapter.ts:675`）も同じ理由で論理 `x,y` を取る。`ThreeRenderer` もシザーパス（`ThreeRenderer.ts:468` `dpr = renderer.getPixelRatio()`）と fillText ラスタライズ（`ThreeRenderer.ts:987`）で対応する罠を持つ。
2. **Y 反転** — Three の UV 原点は左下、Canvas は左上である。`py = (1 - uv.y) * height`（`ThreeAdapter.ts:253`）。`ThreeRenderer` も同じ理由でテクスチャを反転解除する（`ThreeRenderer.ts:628` `texture.flipY = false`、`ThreeRenderer.ts:1035` fillText）。
3. **パネル外クリック** — `state.isHovering` のときにミスすると `lastUv` で `pointerleave` を合成し（`ThreeAdapter.ts:209`）、`pointerdown` ではパネルフォーカスを blur する（`ThreeAdapter.ts:214` `if (pointerdown && _focusedEntity) setFocusedEntity(null)`）— ページ背景クリックが DOM フォーカスを移動させるのと同様である。

### 3.3 共有される配送コア

`updateIntersection`（raycast UV）と `dispatchPointer`（論理ピクセル、`ThreeAdapter.ts:675`）の両方は `dispatchAtPoint`（`ThreeAdapter.ts:262`）に収束する：

```ts
private dispatchAtPoint(type, px, py, pointerId, originalEvent): boolean {
  this.vectoScene.markDirty();                          // ThreeAdapter.ts:270 — onDemand wake
  const hitEntity = this.vectoScene.findEntityAt(px, py); // ThreeAdapter.ts:273 — VMT hit test
  // hover transitions (ThreeAdapter.ts:277), pointerleave dedup (ThreeAdapter.ts:291),
  // then dispatchEventToTarget or canvas fallback (ThreeAdapter.ts:307)
  // then pointerdown focus (ThreeAdapter.ts:320)
}
```

`findEntityAt` はオンスクリーン Scene が使うものと同じヒットテスタである（`HitTester.ts:12`、ボス 06）。`clipChildren` ゲートや回転対応 bounds を含む — 3D 固有のヒットパスはない。

## 4. 入力ルーティング — ポインタ、ホイール、ホバー、マルチタッチ

### 4.1 ホバー遷移はポインタごと

`activePointers: Map<number, PointerState>`（`ThreeAdapter.ts:101`）はポインタごとに `{isHovering, lastUv, lastTargetId}` を追跡する（`ThreeAdapter.ts:64`）。`pointerId` は元の `PointerEvent`（`ThreeAdapter.ts:187`）から読まれるか、プログラム的／マウスパスではデフォルトで `1` になる。`pointermove` でアダプタは `lastTargetId` と現在の `hitEntity.id` を diff し、古い Entity で `pointerleave` を、新しい Entity で `hover` を emit する（`ThreeAdapter.ts:277`）。合成 `pointerleave`（メッシュ exit）では `dispatchEventToTarget` 経由で一度だけ emit し、`false` を返して末尾のフォールバック配送が leave を重複させるのを抑制する（`ThreeAdapter.ts:291` コメント + early return）。

ここでの履歴：修正前のアダプタは `pointerleave` を二重に emit し（追跡された `lastTargetId` 経由で一度、末尾の `lastUv` での汎用フォールバック経由でもう一度）、カーソルが離れた後に `lastUv` の下に偶然いた Entity に leave をリークしていた（`vectojs-docs/forge/findings/renderer-and-gpu.md:620`）。

### 4.2 マルチタッチ／WebXR

タッチ接触は常に新しく単調増加する `pointerId` を受け取る。刈り込みなしでは `activePointers` はタップごとに 1 エントリずつ、アダプタの生存期間中増え続けた。`pruneEndedPointer`（`ThreeAdapter.ts:228`）は最終配送がそれを読んだ後に `pointerup`／`pointercancel` でエントリを削除する。`ThreeRenderer` も `imageTextureCache`／`textTextureCache` で同じクラスのリークを抱えていた（修正 `ThreeRenderer.ts:635` LRU eviction）。

`GraphCamera` は 3D レイヤーで相補的なガードを持つ：アクティブなドラッグは自身の `pointerup`／`pointercancel` までその `pointerId` を所有する — 2 つ目の接触が `dragging`／`lastX`／`button` を上書きしてはならない（`packages/graph3d/src/GraphCamera.ts:305`）。

### 4.3 ホイール — 中立なデフォルトなし

`createDOMEvent`（`ThreeAdapter.ts:372`）は `type === 'wheel'` で分岐する：`WheelEvent` は元の `WheelEvent` が存在するとき `deltaX/Y/Z/deltaMode` をコピーし、さもなければ `0` で合成される（`ThreeAdapter.ts:381`）。ポインタフィールドは、元のイベントが提供されなかったときに raycaster パスが生成するものと同じ中立なデフォルトで `button/buttons/modifiers` を合成する（`ThreeAdapter.ts:48` `ThreeAdapterPointerInit` ドキュメント）。`dispatchPointer` は明示的にホイールをカバーしない（`ThreeAdapter.ts:664` ドキュメント — デルタに中立なデフォルトはない。実際の `WheelEvent` とともに `updateIntersection` 経由でホイールをルーティングすること）。

配送されたすべてのイベントは `clientX/clientY = px/py`（論理シーンピクセル）と非標準の `vectoSceneX/Y` プロパティ（`ThreeAdapter.ts:412` `Object.defineProperties`）を運ぶため、シーン空間を必要とするハンドラは un-flip や un-scale する必要がない。`originalEvent` は `VectoJSEvent.nativeEvent`（`ThreeAdapter.ts:364`）として転送されるため、ハンドラは `deltaMode`／`button` をそのまま読める。

`ThreeAdapterPointerInit`（`ThreeAdapter.ts:54`）はプログラム的パスのデフォルトを文書化する：`button`／`buttons` は 0、修飾キーは off — 元のイベントが提供されないときの raycaster パスと区別できない。`ThreeAdapterPointerType`（`ThreeAdapter.ts:40`）は 2 つのエントリポイントが受け付ける閉じた union であり、`type` は `dispatchAtPoint`（`ThreeAdapter.ts:263`）内部でのみ `VectoEvent` に widen される。

### 4.4 プログラム的駆動 vs raycast 駆動

2 つのエントリポイントは意図的に対称だが同一ではない：

| entry                                                                 | caller supplies                   | UV step                                                            | wheel                                  | use for                                           |
| --------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------- |
| `updateIntersection(raycaster, type, event)`（`ThreeAdapter.ts:181`） | `THREE.Raycaster` + DOM `Event`   | `raycaster.intersectObject(this.mesh)` → `hit.uv` → `dispatchAtUv` | あり — `WheelEvent` はデルタ付きで転送 | ライブ 3D ポインタ／ホイール、VR コントローラレイ |
| `dispatchPointer(type, x, y, init)`（`ThreeAdapter.ts:675`）          | 論理 `x,y` + 任意の `PointerInit` | なし — `x,y` はすでにシーンピクセル                                | なし — デルタに中立なデフォルトなし    | テスト、自動化、ヘッドレス                        |

両方とも `dispatchAtPoint`（`ThreeAdapter.ts:262`）に収束するため、ホバー遷移、フォーカス、`markDirty`、`isConnected` 配送ゲートは同一に振る舞う。`dispatchPointer` だけが自身の `PointerEvent` を生成する（`ThreeAdapter.ts:690`）— プログラム的ケースでは背後に DOM イベントがないため、そうしなければならない。

### 4.5 Canvas フォールバック

`findEntityAt` が `null`（空き領域）を返すとき、イベントは `this.canvas` 自体に配送される（`ThreeAdapter.ts:312` `canvas.dispatchEvent(fallbackEvent)`）。オンスクリーン Scene ではこれは a11y ミラーを通じてバブリングする。オフスクリーンアダプタでは、Scene レベルのハンドラが依然として背景クリックを観測できる（それがフォーカスを blur する、§5 を参照）。

## 5. フォーカスとキーボード所有権 — オフスクリーンなので合成

### 5.1 なぜパネルフォーカスが `document.activeElement` ではないのか

アダプタの canvas は `document` に追加されることがないため、その `a11yRoot`（Scene がミラー用に作成するコンテナ）も接続されることがない。`getA11yElement(entity.id)` は依然として実要素を返すが（`Scene.syncA11y` がそれに関係なく投入する）、`el.isConnected === false` が恒久的である。接続された要素を要求するネイティブ API（`setPointerCapture`、堅牢な `focus()`）はそのような要素では throw するため、アダプタは切断されたミラーを不在として扱う。

したがってパネルフォーカスは**アダプタ側の状態**である：`ThreeAdapter._focusedEntity`（`ThreeAdapter.ts:111`）と、そのギャップと合成 `FocusEvent` ブリッジを説明するドキュメントコメントである。`focusedEntity` ゲッター（`ThreeAdapter.ts:441` — 破棄時は `null` を返す）と `focus(entity|null)`／`blur()`（`ThreeAdapter.ts:458`）経由でアクセスする。

### 5.2 フォーカスはどう動くか

- **ポインタ駆動** — イベント配送後に `pointerdown` がヒット Entity の最も近いフォーカス可能な祖先にフォーカスする（`ThreeAdapter.ts:321` `focusNearestFocusable(hit)`）。空き領域では blur する。`focusNearestFocusable`（`ThreeAdapter.ts:499`）は `hit.parent` チェーンを walk し、各ノードで `isFocusable` をテストする — そのため `<button>` 内の `<span>` をクリックしてもボタンにフォーカスし、DOM と一致する。チェーン内にフォーカス可能なものがなければ blur する（`ThreeAdapter.ts:506`）。フォーカス遷移はイベントの**後**に実行されるため、ハンドラはクリック前のフォーカス世界を観測する。これはネイティブの `pointerdown`→フォーカス順序と一致する（`ThreeAdapter.ts:319` コメント）。
- **プログラム的** — `focus(entity)`（`ThreeAdapter.ts:458`）は任意の Entity（フォーカス不可でも）を受け付けるため、テスト／自動化で強制的にフォーカスできる。ポインタパスはより厳格で、投影が到達可能と宣言するものにのみフォーカスする。
- **`isFocusable` 契約**（`ThreeAdapter.ts:478`）— ミラーが `tabindex`（明示的な `tabIndex` またはインタラクティブ ARIA ロールに対して core が追加する暗黙の `0`）を持つか、ネイティブにフォーカス可能なタグ（`button`／`input`／`textarea`／`select`／`a[href]`）としてレンダリングされるとき true。最初の投影同期前は生の `getA11yAttributes()` 値にフォールバックする。

### 5.3 合成 FocusEvent ブリッジ

`setFocusedEntity`（`ThreeAdapter.ts:516`）は、存在すれば前のミラーに合成 `FocusEvent('blur')` を、次のミラーに合成 `FocusEvent('focus')` を配送する。さもなければ Entity に直接 `emit` する。これにより core 自身のリスナーがそのまま動作する：Entity の `focus`／`blur` emit、`Scene.focusedA11yElement` 追跡、`Input` キャレット点滅の wake／cleanup。すべての遷移は `markDirty()` も行うため、フォーカスビジュアル（キャレット、ハイライト）は `onDemand` モードで再ペイントされる（`ThreeAdapter.ts:529`）。

### 5.4 キーボードルーティング — `dispatchKey` と所有権

```ts
// packages/three/src/ThreeAdapter.ts:573
public dispatchKey(key: string, mods: ThreeAdapterKeyModifiers = {}, phase: 'press'|'keydown'|'keyup' = 'press'): void {
  const init = { key, code: mods.code ?? ThreeAdapter.codeFor(key), ...mods, bubbles:true, cancelable:true };
  if (phase !== 'keyup') this.routeKeyEvent(new KeyboardEvent('keydown', init));
  if (phase !== 'keydown') this.routeKeyEvent(new KeyboardEvent('keyup', init));
}
```

`codeFor`（`ThreeAdapter.ts:597`）は `key` から `KeyboardEvent.code` を推論する：文字は `Key<X>`、数字は `Digit<N>`、スペースは `Space`、それ以外はそのまま — `code` はレイアウト依存であるためベストエフォートである。

`routeKeyEvent`（`ThreeAdapter.ts:610`）は 4 つのルールを実装する（`ThreeAdapter.ts:536` のドキュメント）：

1. **パネルフォーカスなし** — イベントはそのまま `window` へ行く。core のシーンレベルチャネル（`Scene.ts:3351` `dispatchKeyboard`）がネイティブゲート（`defaultPrevented`、自動リピート、`ownsKeyboard(document.activeElement)`）を適用する。Orbit カメラのコンシューマやホスト入力が枯渇することはない。
2. **パネルフォーカス、ミラーにて** — core の汎用キー転送と `#694` Enter／Space アクティベーションが動作するよう、フォーカスされたミラーに配送する。ミラーが存在しなければ Entity 上の `VectoJSEvent`。
3. **所有権 — 停止** — `entityOwnsKeyboard(focused)`（`ThreeAdapter.ts:643`）が true を返す場合（タグ `input`／`textarea`／`select`、または `Scene.ts:115` からの `KEYBOARD_OWNING_ROLES` 内の `role` — `textbox`、`searchbox`、`spinbutton`、`option`、`listbox`、`button`、`link`、`tab`、`menuitem`、`slider`、`combobox`）、イベントは消費される。何も `window` に漏れない。タグ+ロールの集合は `Scene.ownsKeyboard`（`Scene.ts:143`）を映し、エクスポートされた集合を介して意図的に統一されていると文書化されている。
4. **それ以外は window へバブリング** — Entity ハンドラによって `nativeEvent.defaultPrevented` または `cancelBubble` が設定されない限り、接続された canvas のバブリングと一致する。パネルハンドラが Enter で `preventDefault()` してホストショートカットを抑制できるのはこのゲートのためである。

これは `vectojs-three` スキルレシピ（`.agents/skills/vectojs-three/references/three-recipes.md:60`）の `adapter.focus(panel); adapter.dispatchKey('Enter')` と `isFocusable` ガードの背後にあるメカニズムである。

## 6. 3D 内のセマンティック投影 — AT が見るもの

接続された canvas では `Scene.syncA11y` が各インタラクティブ Entity の `getA11yAttributes()` を透過的で絶対配置された DOM ミラー（role、label、tabindex、bounds）に投影する。スクリーンリーダーや Playwright の `getByRole` はそれらのミラーを駆動する。ヒットテストと配送されるイベントは分離可能な関心事である：Scene の `HitTester`（`HitTester.ts:12`）がヒットオーソリティであり、ミラーは配送トランスポートである（`Scene.ts:3512` ミラーごとのリスナー）— オフスクリーンブリッジが依拠する区別である。

`ThreeAdapter` 内ではミラーは同様に作成される — `Scene` は canvas がオフスクリーンであることを知らない — しかし `document` に接続されることはない。帰結：

- **デフォルトで AT 不可視** — `CanvasTexture` パネルはページの a11y ツリーにない。3D シーンで AT 到達性が必要な場合、ホストは同じ Scene の 2D オーバーレイをレンダリングするか、別の接続された Scene を通じてパネルを公開しなければならない。アダプタはこれを発明しない。2D 投影契約を保持し、3D ホスト側のページ構造はホストに委ねる。これは正しいデフォルトである：テクスチャは DOM セマンティクスを持たない。
- **配送フォールバック — `isConnected` が不可欠** — `dispatchEventToTarget`（`ThreeAdapter.ts:330`）は `a11yEl && a11yEl.isConnected`（`ThreeAdapter.ts:349`）をチェックする。接続されたミラーは実際の `PointerEvent`／`WheelEvent` をそれらに配送されるため、ネイティブにバインドされたウィジェット（`setPointerCapture` を呼ぶ投影された `<input>` や、`a11yEl.focus()` at `ThreeAdapter.ts:360` を呼ぶ Entity ごとの `focus()` パス）がブラウザのネイティブ配送で動作する。切断されたミラーはフォールバックを取る：仮想ツリーを通じてバブリングする `new VectoJSEvent(type, entity, originalEvent, …, {x,y})`（`ThreeAdapter.ts:363`）。`ThreeAdapter.ts:341` のコメントは失敗モードを説明する — 切断された要素は `setPointerCapture` で throw し `focus()` は no-op である — そのためフォールバック経由のルーティングはスタイル選択ではなく正しさのゲートである。
- **ポインタイベントは子孫の `pointerEvents: 'none'` でゲートされない** — アダプタのヒットテストは Scene 上の `findEntityAt` であり、CSS ヒットテストではない。2D ページで重要になる `pointerEvents: 'none'` セマンティクス（ボス 03、`ScrollView` `pointerEvents: 'none'` インタラクション）は 3D パスに影響しない。2D ミラーパスのみがそれを尊重する。アダプタパスでは、DOM 配送が試みられる前にヒットはすでに解決されている。
- **フォーカスも同じ分岐を映す** — `setFocusedEntity` は `isConnected` のときミラーに配送し、そうでなければ Entity に `emit` する（`ThreeAdapter.ts:516`）。2 つのパスは同じ core リスナー（Entity `focus`／`blur`、`Scene.focusedA11yElement`、キャレット点滅）を駆動するため、`onFocus` ハンドラは分岐する必要がない。

`ThreeRenderer` は投影の関心を持たない — レンダラであり Scene ではないため、a11y パスはまったくない。`ThreeRenderer` backed な Scene でも、レンダラが `a11yRoot` に触れることはないため、通常の 2D `Scene` a11y レイヤーを通じて投影は続く。

アダプタの配送分岐の両側の違いを見分ける（`ThreeAdapter.ts:341` vs `ThreeAdapter.ts:363`）：

```ts
// Connected mirror — real DOM dispatch, native capture/focus work
a11yEl.dispatchEvent(domEvent); // ThreeAdapter.ts:351
if (type === 'pointerdown' && (a11yEl instanceof HTMLInputElement || …)) a11yEl.focus();

// Disconnected mirror — virtual-tree bubble, no DOM
entity.dispatchEvent(new VectoJSEvent(type, entity, originalEvent, …, { x, y })); // ThreeAdapter.ts:363
```

## 7. ピュア Three の対照 — `Graph3D` ファミリー

`@vectojs/graph3d` は非アダプタな 3D コンシューマがどう見えるかを示す — `ThreeAdapter` なし、Scene なし、a11y 投影なし。アダプタが必要な場所と不要な場所のリファレンスである。

| piece                                | role                                                                                                                            | key file:line                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `Graph3D`                            | インスタンス化された表現：単一 `group`（`Graph3D.ts:30`）配下のノード用 1 つの `InstancedMesh` + リンク用 1 つの `LineSegments` | `Graph3D.ts:28` group、`Graph3D.ts:115` InstancedMesh、`Graph3D.ts:136` LineSegments                                         |
| `GraphCamera`                        | 2D ortho vs 3D perspective の pan／zoom／orbit コントロール                                                                     | `GraphCamera.ts:73` GraphCamera、`GraphCamera.ts:200` setSize ズーム修正、`GraphCamera.ts:354` wheel zoom-about-cursor       |
| `GraphInteraction`                   | `Raycaster` + NDC → `pickNode` → hover／select／drag-to-pin                                                                     | `GraphInteraction.ts:83` GraphInteraction、`GraphInteraction.ts:157` setPointerFromEvent、`GraphInteraction.ts:246` pickNode |
| `VectoForceLayout` / `D3ForceLayout` | `Float32Array` 位置を `applyPositions` に供給するレイアウト契約                                                                 | `packages/graph3d/src/layout/`                                                                                               |

アダプタの落とし穴を映す注目すべき不変条件：

- **`setGraphData` は変更前に throw する** — リンク端点は `indexById`（`Graph3D.ts:80`）経由で解決され検証される（`Graph3D.ts:90` throw）。`clearMeshes()`（`Graph3D.ts:99`）やメッシュのアタッチより前であるため、拒否されたグラフはシーンをそのまま残す（`Graph3D.ts:73` ドキュメント、`forge 2026-08-13` エントリ）。
- **`applyPositions` は NaN をガードする** — `positions.length < nodeCount*3` は書き込み前に bail し、`setGraphData` ごとに一度だけ警告する（`Graph3D.ts:162` `hasWarnedShortPositions`、at `Graph3D.ts:100` でリセット）。更新をスキップして NaN インスタンス行列とメッシュ全体を frustum カリングしてしまう NaN バウンディングスフィアを避ける（`Graph3D.ts:148` ドキュメント）。`setGraphData` がすべての端点を検証したため、リンクごとの bounds チェックは不要である。
- **`pickNode` はインスタンス対応** — `raycaster.intersectObject(nodeMesh)` を `h.instanceId != null`（`Graph3D.ts:248`）でフィルタし、`GraphData.nodes` インデックスをレイアウトと整列させて返す。
- **`GraphCamera.setSize` ズーム二重適用修正** — frustum はズームなしの half-extents のまま、`camera.zoom` だけがズームを担う（`GraphCamera.ts:200` コメント：ズームを frustum に焼き込み**かつ** `camera.zoom` を設定すると可視範囲が `1/zoom²` になりグラフが視界外にスナップする）。
- **`GraphInteraction` ポインタキャプチャ** — `pointerdown` で `domElement` 上の `setPointerCapture`（`GraphInteraction.ts:284`）と `window` の `pointerup`／`pointercancel`（`GraphInteraction.ts:135`）経由で、canvas 外でのリリースでもドラッグを終了しホストコントロールを再有効化する。`dispose()` がドラッグ途中で呼ばれても finish パスを実行する（`GraphInteraction.ts:314`）。

## 8. 落とし穴と罠（file:line 付き）

| trap                                                   | where                                                              | symptom                                                                                      | fixed / status                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| UV × バッキングストアで論理サイズではない              | `ThreeAdapter.ts:246` コメント                                     | HiDPI でヒットが `dpr` 倍ずれて下／右に外れる                                                | 修正済み — `vectoScene.width/height` を使用                             |
| Y が反転されていない                                   | `ThreeAdapter.ts:253`                                              | ヒットが垂直に反転                                                                           | 修正済み — `(1-uv.y)*height`                                            |
| 切断されたまま a11y ミラーに配送                       | `ThreeAdapter.ts:349` `isConnected`                                | `setPointerCapture` が throw、`focus()` が no-op                                             | 修正済み — `VectoJSEvent` にフォールバック                              |
| メッシュ exit で `pointerleave` が重複                 | `ThreeAdapter.ts:291` early return                                 | Entity が二重にヒット、隣接が leave をリーク                                                 | 修正済み `ThreeAdapter.ts:291` 末尾配送をスキップ（`forge 2026-08-13`） |
| `activePointers` がタップごとに増加                    | `ThreeAdapter.ts:228` `pruneEndedPointer`                          | 無制限 Map、WebXR／マルチタッチ                                                              | 修正済み — `pointerup`／`pointercancel` で削除                          |
| ホイールに中立なデフォルトなし                         | `ThreeAdapter.ts:664` ドキュメント                                 | `dispatchPointer('wheel',…)` が誤ったデルタを合成                                            | 設計通り — 実際の `WheelEvent` とともに `updateIntersection` を使用     |
| パネル外 `pointerdown` で blur しなかった              | `ThreeAdapter.ts:214`                                              | 3D 空の領域をクリックしてもパネルがフォーカスを保持                                          | 修正済み — 外側 `pointerdown` で blur                                   |
| dispose で `render` プロキシが復元されなかった         | `ThreeAdapter.ts:113` `_originalRender`                            | 削除済み `CanvasTexture` 上の `needsUpdate` → `THREE.Texture: trying to use deleted texture` | 修正済み `ThreeAdapter.ts:730`                                          |
| 呼び出し元提供なのに canvas がゼロクリアされた         | `ThreeAdapter.ts:122` `_ownsCanvas`                                | dispose 後に呼び出し元の canvas が空白に                                                     | 修正済み — 所有時のみゼロクリア                                         |
| `ThreeRenderer` `FrontSide` が y-down ortho でカリング | `ThreeRenderer.ts:250` camera、`ThreeRenderer.ts:596` `DoubleSide` | `fillCircle`／fill／gradient／drawImage が不可視                                             | 修正済み（`forge 2026-08-13`、`ThreeRenderer.ts:596`）                  |
| `drawImage` が垂直反転                                 | `ThreeRenderer.ts:628` `flipY = false`                             | blit されたすべての画像が上下反転                                                            | 修正済み（`forge 2026-08-23`、`ThreeRenderer.ts:478`）                  |
| `LineBasicMaterial.linewidth` が無視                   | `ThreeRenderer.ts:110` `buildStrokeRibbon`                         | すべてのストロークが hairline                                                                | 修正済み — リボンジオメトリ                                             |
| `fillText` が weight をサイズとして解析                | `ThreeRenderer.ts:274` `parseFontSize`                             | 太字テキストが 700px の高さ、ベースラインが `fontSize/2` 低い                                | 修正済み（`forge 2026-08-13 #486`、`ThreeRenderer.ts:274` + `:831`）    |
| `Graph3D` が不正な link id で半構築                    | `Graph3D.ts:73`                                                    | ノードはアタッチ、リンク欠落、古いスケール                                                   | 修正済み `Graph3D.ts:80` 先に解決                                       |
| `applyPositions` の短い配列 → NaN                      | `Graph3D.ts:148`                                                   | ノード消失、frustum 空白                                                                     | 修正済み `Graph3D.ts:162` ガード + ラッチされた警告                     |
| `GraphInteraction` dispose がドラッグ途中              | `GraphInteraction.ts:314`                                          | ホストコントロールが無効のまま                                                               | 修正済み — `dispose` で `finishDrag`                                    |
| `GraphCamera` リサイズで二重ズーム                     | `GraphCamera.ts:200`                                               | ズーム `1/zoom²`、グラフがスナップアウト                                                     | 修正済み — frustum はズームなしのまま                                   |

## 9. レシピ — どのパスをいつ使うか

**3D シーン内のパネル（HUD、ダッシュボード、VR スクリーン）：**

```ts
// .agents/skills/vectojs-three/references/three-recipes.md:10 + :24
import { ThreeAdapter } from '@vectojs/three';
import { Button, Stack, Text } from '@vectojs/ui';
const adapter = new ThreeAdapter({ width: 800, height: 500 });
const panel = new Stack({ direction: 'vertical', gap: 16 });
panel.add(new Text('VectoJS in 3D', { font: '700 28px Inter' }));
adapter.vectoScene.add(panel);
adapter.vectoScene.start();
scene3d.add(adapter.mesh);
// pointer routing — raycaster owns the 3D hit, adapter owns the 2D dispatch
const handled = adapter.updateIntersection(raycaster, type, event);
if (handled) event.preventDefault();
```

- `window`／`document` リスナーから実際の `PointerEvent`／`WheelEvent` を渡して `adapter.updateIntersection(raycaster, type, event)` を呼ぶ。ボタン／修飾子状態とホイールデルタが転送される。`handled` が true のとき 3D ヒットは消費された — ホストイベントを `preventDefault()` してページが下でスクロール／選択しないようにする。
- テスト／自動化では `adapter.dispatchPointer(type, x, y)`（`ThreeAdapter.ts:675`）を使う — 論理ピクセル、raycaster と同じ下流パスだが、ホイールは raycaster パスに残す（合成する中立なデルタがない、`ThreeAdapter.ts:664`）。
- フォーカス：`adapter.focus(entity)`／`adapter.blur()`（`ThreeAdapter.ts:458`）、`adapter.isFocusable(entity)`（`ThreeAdapter.ts:478`）でクエリ。キーボード：`adapter.dispatchKey('Enter')`（`ThreeAdapter.ts:573`）— デフォルトでフルプレス、または `dispatchKey('a', {shiftKey:true}, 'keydown')` のように保持するキー向けに。フォーカスがキーを `window` に漏らすかどうかを決める `ownsKeyboard` ゲートを駆動する。
- リサイズ：ホスト canvas やパネルサイズが変わったときに `adapter.resize(w, h)`（`ThreeAdapter.ts:713`）。Scene は `window` に追従しない（`ThreeAdapter.ts:140` `disableWindowResize`）。
- teardown：`scene3d.remove(adapter.mesh); adapter.dispose()`（`ThreeAdapter.ts:723`）— render プロキシを復元し（`ThreeAdapter.ts:730`）、テクスチャ／ジオメトリ／マテリアルを破棄し、メッシュを削除し、Scene を破棄し、ポインタ／フォーカスをクリアする。

**2D パネルなしの 3D グラフ：**

`Graph3D` + `GraphCamera` + `GraphInteraction` を直接使う — アダプタなし。`Graph3D.group` がホストシーンに追加され、`GraphCamera` がカメラと自身の `pointerdown/move/up/wheel` リスナー（`GraphCamera.ts:150`）を所有し、`GraphInteraction` が `domElement` 上の `pointermove/down` とドラッグアウト用の `window` `pointerup/cancel` を所有する。`setMode('2d'|'3d')` をライブに保つため `() => graphCamera.camera` ゲッターで配線する（`GraphInteraction.ts:5` `GraphInteractionCamera`）。

**ホストがカメラを所有する場合（例：`OrbitControls` + graph）：**

`setControlsEnabled`（`GraphInteraction.ts:53`）を渡して、ノードドラッグ中はカメラコントロールを無効化する。同じパターンは canvas を 3D シーンと共有するアダプタパネルにも当てはまる：カメラがドラッグ中はパネルの `updateIntersection` をゲートし、その逆も同様である。

## 10. 未解決の問いと XR の地平

- **XR セッション配送** — WebXR コントローラは `PointerEvent` ではなく `select`／`squeeze` + `XRInputSource` レイを生成する。アダプタの `pointerId` マップ（`ThreeAdapter.ts:101`）はすでにマルチポインタに汎化されているが、ホストは XR ビュー + 入力ポーズから `Raycaster` を合成し、入力ソースごとに `updateIntersection` を呼ばなければならない。`XRRaycaster` ヘルパーはまだ存在しない。
- **1 つの canvas に 2 つのパネル** — `updateIntersection` は単一 `mesh` をヒットテストする（`ThreeAdapter.ts:186` `intersectObject(this.mesh)`）。1 つの Three.js シーンに 2 つのアダプタがある場合は、アダプタごとの raycast または `hit.object` で配送する共有 `intersectObjects([a.mesh, b.mesh])` が必要である。`pointerId` ごとのホバー状態はアダプタごとなので、パネルを跨ぐ `pointerleave` はすでに分離されている。
- **3D パネル向け AT** — §6 のとおり、オフスクリーンミラーは AT 不可視である。AT を必要とする XR や WebGL のみのデプロイは、接続された 2D Scene（または DOM オーバーレイ）を同期させておかなければならない — ページの a11y ツリーがテクスチャのスコープ外であるため、アダプタはこれを解決しない。
- **SSR／OffscreenCanvas** — `ThreeAdapter.ts:130` は `document` が undefined のとき `{width,height}` オブジェクトにフォールバックする。`THREE.CanvasTexture` は依然として tex-image ソースを期待する。サーバで事前レンダリングするホストは、実際の `OffscreenCanvas` か遅延したアダプタ構築を必要とする。

## 11. この領域で変更を出荷する前のチェックリスト

- [ ] **`uv.x * canvas.width` はない。** すべての UV→ピクセルパスが `vectoScene.width/height`（論理）を使い、`canvas.width/height`（バッキングストア）ではない。`packages/three/src/ThreeAdapter.ts` で `canvas\.width` を grep すること。
- [ ] **Y は反転されている。** `py = (1 - uv.y) * height`（`ThreeAdapter.ts:253`）。シーンに blit するテクスチャは `flipY = false`（`ThreeRenderer.ts:628`、`:1035`）。
- [ ] **`updateIntersection` と `dispatchPointer` は収束する。** 新しい入力セマンティクスは `dispatchAtPoint`（`ThreeAdapter.ts:262`）に入るため、raycast とプログラム的パスが乖離しない。
- [ ] **`isConnected` ゲートが保持されている。** `dispatchEventToTarget`（`ThreeAdapter.ts:349`）はミラーに配送する前に `a11yEl.isConnected` をチェックする。オフスクリーンケース用の `VectoJSEvent` フォールバックは残さなければならない。
- [ ] **パネルフォーカスがブリッジされている。** すべての `setFocusedEntity` 遷移がミラーに合成 `FocusEvent` を配送し `markDirty()` する（`ThreeAdapter.ts:516`）。`pointerdown` フォーカスは `isFocusable` 祖先を walk する（`ThreeAdapter.ts:499`）。
- [ ] **キーボード所有権が統一されている。** `entityOwnsKeyboard`（`ThreeAdapter.ts:643`）は `Scene.ownsKeyboard`（`Scene.ts:115`、`Scene.ts:143`）と同じ `KEYBOARD_OWNING_ROLES` 集合を使う。一方に追加したロールは他方も更新しなければならない。
- [ ] **`hover` vs `pointermove` が保持されている。** `dispatchAtPoint` は `pointermove` ホバー遷移を新しい Entity 上の `hover` と古い Entity 上の `pointerleave` にマップする（`ThreeAdapter.ts:277`）。イベント名を変更すると `Entity.on('hover',…)` ハンドラが壊れる。
- [ ] **`pointerleave` 重複排除が保たれている。** 合成メッシュ exit `pointerleave`（`ThreeAdapter.ts:291`）は汎用配送にフォールスルーしてはならない — `return false` が不可欠である。
- [ ] **`activePointers` が刈り込まれている。** `pruneEndedPointer`（`ThreeAdapter.ts:228`）が `updateIntersection` と `dispatchPointer` の両方で `pointerup`／`pointercancel` 時に実行される（さらに `ThreeRenderer` LRU 上限）。
- [ ] **`needsUpdate` がゲートされている。** render プロキシ（`ThreeAdapter.ts:157`）は Scene が再描画したときのみ `needsUpdate` を設定する。`resize`／`dispose` セマンティクス（`_ownsCanvas`、`_originalRender`）は手つかずである。
- [ ] **`Graph3D` ガードが保持されている。** `setGraphData` は変更前にリンクを解決する（`Graph3D.ts:80`）、`applyPositions` は短い配列で bail する（`Graph3D.ts:162`）、`GraphInteraction` はドラッグ途中でクリーンアップする（`GraphInteraction.ts:314`）。

## 関連

- **ボス 06（VMT ランタイム）**は `Scene`、`Entity`、`findEntityAt`、`focusedA11yElement` と、アダプタが再利用する `WASM_UPLOAD_REJECT_LIMIT`／structure-version 配線を所有する。
- **ボス 07（レンダラー）**は `IRenderer`、`CanvasRenderer` の DPR／バッキングストア上限、y-down ortho、シザー、`present()` vs `flush()` バッチ処理を所有する。これらは `ThreeAdapter`（`CanvasRenderer` 経由）と `ThreeRenderer`（`IRenderer` として）の両方が継承する。
- **ボス 11（graph layout）**は `Graph3D.applyPositions` に供給する force カーネルを所有する。`@vectojs/graph-layout` 2D quadtree（`BarnesHutQuadtree.ts`）は JS のままである一方、`crates/vectojs-force-rs` は 3D octree を高速化する。
- **ボス 08（WASM）**は `Scene` ビューポートと `appliedDPR` 値を共有する。メモリ拡張を跨ぐ古い型付き配列ビューは、このボスのテクスチャキャッシュ類似物である。

## 参考文献

- `packages/three/src/ThreeAdapter.ts:1` — アダプタ：オフスクリーン canvas、`CanvasTexture`、render プロキシ、raycast + プログラム的入力、パネルフォーカス／キーボード
- `packages/three/src/ThreeRenderer.ts:1` — Three.js 経由の `IRenderer`：y-down ortho、リボンストローク、グラデーションシェーダ、DPR、キャッシュ、`present()`／`dispose()`
- `packages/three/src/index.ts:1` — 公開 barrel（`ThreeAdapter`、`ThreeRenderer`）
- `packages/graph3d/src/Graph3D.ts:1` — インスタンス化されたノード + ラインリンク、`setGraphData` 先に解決、`applyPositions` ガード、`pickNode`
- `packages/graph3d/src/GraphCamera.ts:1` — ortho／perspective カメラ + pan／zoom／orbit、`setSize` ズーム修正、カーソル中心のホイールズーム
- `packages/graph3d/src/GraphInteraction.ts:1` — `Raycaster` + NDC、`pointerId` ホバー／drag-to-pin、`window` up／cancel、`setControlsEnabled`
- `packages/core/src/tree/Scene.ts:115` `KEYBOARD_OWNING_ROLES` ／ `Scene.ts:143` `ownsKeyboard` ／ `Scene.ts:1446` `focusedA11yElement` ／ `Scene.ts:3512` ミラーごとの配送 — アダプタが映す 2D 所有権
- `.agents/skills/vectojs-three/references/three-recipes.md:1` — パネル、ポインタ、ホイール、プログラム的、破棄レシピ
- `vectojs-docs/forge/findings/renderer-and-gpu.md:1` — レンダラー／gpu 所見（DPR、`FrontSide` カリング、`flipY`、hairline、キャッシュリーク、投影の罠）
