+++
title = "06 — VMT ランタイム — ライフサイクル / Dirty / イベント"
description = "Virtual Math Tree ランタイム：Entity ライフサイクル、dirty／無効化の粒度、ワールド行列の合成、capture／bubble イベント配送 — 3 つの不変条件を破る ancestor walk とライフサイクルリークの罠を添えて。"
weight = 26
+++

# 06 — VMT ランタイム — ライフサイクル / Dirty / イベント

> Virtual Math Tree は描画するシーングラフではない。毎フレーム transform を再合成し、何が dirty かを判定し、不可視なものをカリングし、インタラクティブなものをヒットテストし、それから初めてペイントする、保持された数値ツリーである。DOM は投影に過ぎず、canvas が真実である。本ドキュメントは、その真実を一貫させ続ける制御ループである。

## 1. VMT パイプラインを一枚の図で

```text
                    Entity tree               packages/core/src/tree/Entity.ts:782
                    (Scene.root)              Scene holds root + overlayRoot, never reassigns
                         │
                         │  add/remove/reparent  Entity.ts:1065 add / :1117 remove
                         │  structureVersion++   Scene.ts:3462 structureVersion
                         ▼
               ┌─────────────────────┐
               │  Dirty propagation  │   DirtyTracker  scene/DirtyTracker.ts:70
               │  markDirty / clear  │   dirty:boolean  Scene.ts:534
               └─────────┬───────────┘   consumed BEFORE update  Scene.ts:5646
                         │
                         ▼
               ┌─────────────────────┐
               │ Transform gather    │   getWorldTransform  Entity.ts:1668
               │ T·S·R compose       │   _worldFrame cache  Entity.ts:845 / :1668 fast path
               │ per-frame cache     │   currentFrame++     Scene.ts:5806 (O(1) invalidation)
               │ WASM SoA store (G1) │   _storeSlot         Entity.ts:865 / WasmBackendFacade.ts:30
               └─────────┬───────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
     ┌────────────────┐   ┌──────────────────┐
     │ Layout         │   │ Hit test         │   HitTester  scene/HitTester.ts:17
     │ LayoutEngine   │   │ findEntityAt     │   :121 JS walk fallback
     │ measurePrepared│   │ isHitEligible    │   :326 clip + opacity + pointerEvents
     │ layoutPrepared │   │ WASM grid        │   :144 ensureHitGrid / :185 fused gather
     └───────┬────────┘   └────────┬─────────┘
             │                     │  pointer capture  Scene.ts:3851 setPointerCapture
             └──────────┬──────────┘   capture/bubble  Entity.ts:1610 dispatchEvent
                        ▼
              ┌───────────────────┐
              │ Render walk       │   Scene.ts:5730 render / :5569 loop
              │ cull → paint      │   renderMode always/onDemand  Scene.ts:401
              │ a11y sync after   │   syncA11y deferred when animating
              └───────────────────┘
                        │
                        ▼
                   Pixels + DOM mirrors
```

因果順序は固定されている — `Scene.ts:5745` が正しさの契約として文書化している — 物理的な walk が融合される場合でも同様である。JS パスはノードごとに前順走査で `update → compose → cull → paint` をインターリーブし、WASM パスはツリー全体を更新した後、同じ cull／paint walk の前に 1 回の SoA パスで gather と compose を行う。どちらも同じフレーム内で `update()` による変更を公開しなければならない。

## 2. ライフサイクル — 作成 / 追加 / 削除 / 破棄

### 2.1 Entity の形状

`Entity`（`Entity.ts:782`）は `abstract` である。すべてのインスタンスは以下を保持する：

- `id: string` — 省略時はランダムな `entity_<7>`（`Entity.ts:1055` コンストラクタ）。
- `parent: Entity | null`（`:791`）、`children: Entity[]`（`:790`）。parent が唯一の所有リンクである。
- `scene` ゲッター（`:796`）— `parent` を辿って真の所有者を探す。Scene 自身の `_scene` 脱出ハッチを除き、Entity 自体には保存されない。
- ローカル transform: `_x/_y/_scaleX/_scaleY/_rotation/_opacity`（`:805`）、`_hasTransitions` 高速パスフラグ（`:812`）により、受動的な Entity の `x = v` は boolean チェック 1 回とフィールド書き込みだけで済む。
- 遅延割り当てされる `Map`：`_drivers`、`listeners`、`captureListeners`（`:819`）— 初回使用まで null。2 万パーティクルのシーンでもこれらは確保されない。
- `_mounted: boolean`（`:816`）、`_destroyed: boolean`（`:817`）、`_driversTickedFrame: number`（`:828`、初期値は `-1`）。
- ワールド行列キャッシュ `_wa.._wf / _worldFrame`（`:845`）と WASM スロット `_storeSlot: number`（`:865`、ストアにないときは `-1`）。

サブクラスは `getBounds()`、`drawSelf()`、`getContentProjection()`、`update()`、`onMounted()`、`destroy()` をオーバーライドする。

### 2.2 add — サイクルガードと構造無効化を伴うアタッチ

`Entity.add(...children)`（`:1065`）は `_addOne`（`:1075`）に転送される：

1. サイクルガード — `child === this` は throw し、`this.parent` チェーンを辿って祖先の一致を検査する（`:1080`）。O(depth) だが、add はフレーム毎の処理に比べれば稀である。
2. 古い親からのデタッチ — `child.parent` が設定されているとき `child.parent.remove(child)` するため、再ペアレントで重複することはない。
3. `child.parent = this; this.children.push(child)` — O(1) の末尾追加。
4. `this.scene` が存在する場合（ライブツリー）：
   - `s.a11yNeedsReorder = true`
   - `s.markStructureChanged()` — `structureVersion` をバンプし、WASM transform ストアのレイアウトを無効化する（`Scene.ts:1625` `_storeStructureVersion`）。
   - `s.markDirty({ entity: this.id, reason: 'child-added' })`（`:1086`）。
   - `child._notifyMounted()`（`:1087`）— `_mounted` でガードされた深さ優先の `onMounted()` で、再アタッチされたサブツリーでも一度だけ発火する。
   - `s._registerActiveDriverSubtree(child)` — デタッチ時に進行中だったバッチドライバを再開する（`remove` の unregister の対になる処理）。

複数の子（`add(a,b,c)`）は同じセマンティクスで引数順にアタッチされる。

### 2.3 remove — ドライバ登録解除を伴うデタッチ

`Entity.remove(child)`（`:1117`）は `indexOf` + `splice` である：

1. `child.parent = null`。
2. `s.detachA11y(child)` + `a11yNeedsReorder`。
3. `s.markStructureChanged()` + `markDirty({ reason: 'child-removed' })`（`:1123`）。
4. `s._unregisterActiveDriverSubtree(child)` — ツリー外のサブツリーを `DriverTicker.active` から除外し、ドライバの tick と Entity のピン留めを停止する。`_addOne` の対になる処理は、ドライバが収束する前に再アタッチされれば再開する。

子でないものを削除するのは no-op（`this` を返す）である。`removeAll()` は存在しない — 反復するか `destroy()` すること。

### 2.4 destroy — 葉から順の再帰的 teardown

`Entity.destroy()`（`:1525`）— `_destroyed` ガードにより冪等：

```ts
while (this.children.length > 0) this.children.at(-1)!.destroy();
animations = null;
for (const d of this._drivers.values()) this._settleDriver(d); // resolve animateTo promises
this._drivers.clear();
listeners.clear();
captureListeners.clear();
if (this.parent) this.parent.remove(this);
```

- 葉から順（末尾から破棄）なので、各子の `parent.remove(this)` は反復対象の末尾を直接変更する — スナップショットもインデックスのずれもない。
- GPU／DOM リソースを所有するサブクラスは、リソースを解放してから `super.destroy()` を呼ぶ（`ComputeParticleEntity.ts:419`、`DOMPortalEntity.ts:142`）。
- `_settleDriver`（`:1329`）による Promise 解決は、`animateTo`／`springTo` の呼び出し元を永遠にハングさせずに解決する。

`Scene.destroy()`（`Scene.ts:2957`）はシーンレベルの対になる処理を追加する：

- ガード `if (destroyed) return`（`:2958`）、`destroyed = true` を設定。
- `while (root.children.length) destroyEntitySubtree(root.children.at(-1)!)` と `overlayRoot` でも同様（`:2964`）、それぞれ `entity.destroy()`（`:2951`）に委譲する。
- `pointRenderer`、`WebGPU device/manager`、`ResizeObserver`、DPR 監視、ポインタリスナー（`pointerEventTarget` からのデタッチ）、`a11yRoot`／`portalRoot` を teardown し、`keydownHandlers/shortcuts` をクリアする。
- 冪等 — `start()` は `destroyed` のとき早期 return し（`:3143`）、WebGPU デバイスの復旧は `if (destroyed) newDevice.destroy()` をチェックする（`:5813`）。

`destroy()` された Entity を再追加してはならない — `_destroyed` フラグにより以降の `destroy()` は no-op になるが、`parent` はすでに null で子も存在しない。

## 3. Dirty／無効化の粒度

### 3.1 boolean フラグとその帰属

`Scene.dirty: boolean`（`Scene.ts:534`）が唯一のスケジューリング信号である。`onDemand` は `!dirty && !frameHadAnimation && !contentSemanticDeferred`（`Scene.ts:5594` `isIdle`）のときレンダリングをスキップし、`always` は `autoThrottle` が `idleFPS` に落とすまで毎 rAF レンダリングする。

所有権は `DirtyTracker.ts:2` ヘッダーごとに分割されている：

- `DirtyTracker`（`scene/DirtyTracker.ts:70`）がフラグ（`isDirty`）、オプトインの帰属マップ、その FIFO 上限（`MAX_DIRTY_REASONS = 200` at `:71`）を所有する。
- `Scene.markDirty(source?)`（`Scene.ts:3443`）は正確な名前／シグネチャを保ったまま `_dirty.mark(source, currentFrame)` に委譲する — `Entity.ts` 内の 129 箇所の呼び出し元が `scene.markDirty()` に依存している（`DirtyTracker.ts:33`）。
- `Scene._dirty: DirtyTracker`（`Scene.ts:1220`）と private な getter／setter（`:1229`）— `set dirty(true)` は `mark(undefined, currentFrame)` を呼び、`set dirty(false)` は `clear()` を呼ぶ。

ホットパス上のコスト（`DirtyTracker.ts:47`）：`tracking` が off のとき、`mark()` はフィールド書き込み 1 回（`isDirty = true`）と既に false の分岐 1 回だけである。`record()` は別メソッドなので、V8 は 1 フィールド版をインライン化できる。

### 3.2 フラグがセットされるタイミングと消費されるタイミング

**セット** — 数十箇所、それぞれ帰属用の `reason` 文字列を持つ：

- `Entity.add` → `child-added`（`:1086`）、`remove` → `child-removed`（`:1123`）、`animate` → `animation-start`、`_spawnDriver` → `driver-added`（`:1305`）、`tickDrivers` → `driver-tick`（`:1389`）、`ComputeParticleEntity` → パーティクル変更ごとに `markDirty()`（`ComputeParticleEntity.ts:113`）。
- `Scene` 自体：スタイル変更、リサイズ、フォントロード（`:2717`）、a11y 並べ替え（`:3674`）、スクロール（`:3931`）。

**消費** — `Scene.loop`（`:5569`）は `update/render` パスの**前**に `this.dirty = false` を実行する（`:5650`）。`entity.update()` 内の `markDirty()` は次のフレームまで生き残る。レンダリング後にクリアすると、自己アニメーションの再アームが消えて Entity がフリーズする（`DirtyTracker.ts:98`）。`Scene.step(dt)`（`:3420`）は例外 — `renderMode` も `dirty` も参照せず無条件にレンダリングし（`DirtyTracker.ts:33` 契約）、後でクリアする（`:3434`）。決定性が目的であるためだ。

### 3.3 帰属 — onDemand シーンを起こし続けるものを探す

デフォルトは off。`scene.setDirtyTracking(true)`（`Scene.ts:3475`）で有効化し、実行してから `scene.dirtyReasons: DirtyReasonEntry[]`（`:3489`、最頻順にソート済み）を読む。各エントリは `{ entity?, reason, property?, count, firstFrame, lastFrame }`（`DirtyTracker.ts:59`）。キーは `entity:reason.property`（`:120`）。上限付き FIFO — 200 件で最古のものから破棄される（`:127`）。`scene.clearDirtyReasons()`（`:3495`）でクリアする。かつて「dirty は true だが理由不明」だった `onDemand` 診断が、ソートされたテーブルになった。

`structureVersion`（`Scene.ts:3462`、`_structureVersion` at `:1636` に裏付け）は対になる信号である：add／remove／reparent でバンプし、プロパティ変更ではバンプしない。ツリー形状のキャッシュはこの値が変わらない限り有効 — 再走査ではなく O(1) で判定できる。

## 4. ワールド行列の合成

### 4.1 アフィンとそのキャッシュ

`AffineTransform { a,b,c,d,e,f }`（`Entity.ts:33`）は `CanvasRenderingContext2D` と一致する — ノードごとに `T * S * R`、6 つのスカラー。

`getWorldTransform(): AffineTransform`（`Entity.ts:1668`）には 2 つのパスがある：

**高速パス** — Scene の render walk が書き込むフレーム毎キャッシュ（`:1784` の `_setWorldCache` が `_wa.._wf` と `_worldFrame` にスタンプ）。`_worldFrame === scene.currentFrame`（`:1672`）なら、6 つのスカラーをそのまま返す — walk も、返されるオブジェクト以外の確保もない。古いキャッシュ（このフレームでレンダリングされなかった Entity や、フレーム間でクエリされた場合）はチェックに失敗してフォールスルーする。キャッシュは処理をスキップできるだけで、誤った行列を返すことはない。

**正規の walk** — `this` から真のルート（`parent === null`、`id === 'root'` ではない — ユーザーが設定可能、`:1690`）まで `path: Entity[]` を構築し、root→self の順に合成する：

```ts
for (let i = path.length - 1; i >= 0; i--) {
  const { cos, sin } = node._getTrig(); // cached, :1746
  const la = scaleX * cos,
    lb = scaleY * sin,
    lc = -scaleX * sin,
    ld = scaleY * cos;
  const le = x,
    lf = y;
  nextA = a * la + c * lb;
  nextB = b * la + d * lb;
  nextC = a * lc + c * ld;
  nextD = b * lc + d * ld;
  nextE = a * le + c * lf + e;
  nextF = b * le + d * lf + f;
}
```

`_getTrig()`（`:1746`）は `{cos, sin}` をキャッシュし、`rotation` が変わったときだけ再計算する（`_trigRotation` チェック）— V8 の `Math.cos/sin` は他エンジンより約 2.5 倍遅く、これは Entity ごと・フレームごとに発生する。`_readWorldCache(frame, out)`（`:1647`）は、G3 の `gatherHitAABBs` のような per-entity gather 用のゼロアロケーション版 — Entity ごとにオブジェクトを 1 つ確保する代わりに、呼び出し元が所有する `out` に 6 つのスカラーを読み込む。

無効化は O(1)：`Scene.render` は正規 walk の開始時に `currentFrame++`（`:5806`）するため、すべての Entity のキャッシュが Entity に触れることなく 1 インクリメントで stale になる。

### 4.2 WASM G1 パス — SoA transform ストア

transform バックエンドが有効なとき（`transformBackend: 'wasm'`／モジュールがロードされた `auto`）、`Scene` は常駐 SoA ストアを維持する（`WasmBackendFacade.ts:228` `structureVersion`、`scene-store.ts:buildTreeStore`）。`markStructureChanged` でストアはトポロジ（親インデックス、スロット割り当て）を再構築する。各 `Entity._storeSlot`（`:865`）はそのときに割り当てられ、信頼する前にスロットテーブルに対して検証される。フレームごとに `ensureAabbs()` が SoA バッファ上で 1 回の WASM パスですべてのワールド行列を合成する — 同じ `T·S·R` 計算で、JS walk とビット同一である。ヒットテストの fused gather（`HitTester.ts:144`）は、利用可能なら `transform.aabbView()` を優先し、なければ JS の `gatherHitAABBs`（`wasm/hit-store.ts:47`）にフォールバックする。こちらは Entity ごとに `getWorldTransform()` を呼ぶ。古い `_storeSlot` は JS フォールバックで遅くなるだけで、誤った読み取りにはならない。

### 4.3 派生クエリ

- `localToWorld(x,y)`（`:1784`）／`worldToLocal(x,y)`（`:1796`）— ワールド行列を適用／逆変換する。`worldToLocal` は特異な行列式（`|det| < 1e-12`）で `null` を返す。
- `getWorldBounds()`（`:1819`）— `getBounds() ?? {x:0,y:0,width,height}` を四隅で変換し、カリングと hit-grid 入力に使われるワールド AABB を生成する。
- `getWorldScale()`（`:1850`）— 親チェーンを遡って `scaleX/scaleY` を乗算する（回転は無視 — ヒットテストの逆変換専用）。

## 5. イベント配送 — capture／bubble とポインタ所有権

### 5.1 VectoJSEvent

`VectoJSEvent<N>`（`Entity.ts:607`）は DOM の表面を映す：`type: VectoEvent`（`:538`、`click | dblclick | hover | pointerdown/up/move/cancel/leave | wheel | keydown/keyup | scroll | change | ...`）、`target: Entity`、`currentTarget: Entity`（配送中にノードごとに設定）、`nativeEvent: N | undefined`、`bubbles: boolean`（デフォルト `true`、`hover`／`pointerleave` は `false`）、さらに `stopPropagation()`、`stopImmediatePropagation()`、`preventDefault()`、および転送される `clientX/Y`、`sceneX/Y`、`localX/Y`、`deltaX/Y`、`key/shiftKey/ctrlKey/altKey/metaKey`。

### 5.2 登録

`Entity.on(event, cb, { capture })`（`:1470`）と `off(event, cb, { capture })`（`:1485`）：

- 2 つの遅延割り当てマップ：`listeners`（bubble）と `captureListeners`（`:1030`）、それぞれ `Map<VectoEvent, Array<cb>>`。
- `capture: true` は `captureListeners` に登録する。デフォルトは bubble。`off` はフェーズを一致させる必要がある。
- `emit(event, payload)`（`:1540`）は直接の自己のみパス（bubble リスナーのみ、伝播なし）— コンポーネント内部の `change` イベント用。`dispatchEvent` がツリーパスである。

### 5.3 配送 — capture の後に bubble

`Entity.dispatchEvent(event)`（`:1610`）：

1. `parent` チェーンを辿って `path: Entity[]` を target→root で構築する。
2. Capture：root→target（`for i = path.length-1 .. 0`）で `captureListeners` を発火する（`:1618`）。各ノードの前に `propagationStopped` をチェックする。
3. Bubble：target→root（`for i = 0 .. path.length-1`）で `listeners` を発火する（`:1622`）。`if (!event.bubbles) return` で target の後で終了 — 非バブリングイベントでも capture は実行されるが、bubble は target のみである。
4. `fireListeners(node, map, event)`（`:1595`）は `handlers.slice()` でスナップショットするため、ハンドラが配送中にリスナーを追加／削除してもパスを乱さず、`immediatePropagationStopped` を尊重する。

Scene の a11y 投影はネイティブ DOM イベントをこのツリーに配線する：`Scene.ts:3802` のミラーごとのリスナー（`click`、`dblclick`、`pointerdown/up/cancel/move`、`wheel`、`keydown/keyup`）はそれぞれ `node.dispatchEvent(new VectoJSEvent(type, node, nativeEvent))` を実行する。`scroll`（`:3912`）は特別 — DOM ではバブリングしないため、Scene は所有する Entity に対して直接 `node.emit('scroll', { scrollTop, scrollLeft, ... })`（`:3920`）する。

シーンレベルのキーボード（`Scene.ts:3272` `on('keydown'|'keyup')`）は別チャネル — Entity ターゲットなし、`stopPropagation()` はネイティブイベントに転送され（`scene/keyboard.ts:79`）、`registerShortcut(chord, handler)` は `keydown` のみでマッチする。

### 5.4 ポインタ所有権

シャドウ要素上の `pointerdown` はポインタをキャプチャする（`Scene.ts:3851`）：

```ts
if (e.target === capEl && typeof capEl.setPointerCapture === 'function')
  capEl.setPointerCapture(e.pointerId);
```

ガード `e.target === capEl` は不可欠である：ターゲットが子孫であるバブリングした `pointerdown` が再キャプチャしてはならない — 子孫がすでに所有しており、祖先が上書きすると `pointerup` + `click` が共通の祖先にリターゲットされる（Dropdown の選択肢クリックが listbox コンテナに届いた事例として計測、`Scene.ts:3844`）。`pointerup`／`pointercancel` は `releasePointer`（`:3831`）で解放され、`hasPointerCapture(pointerId)` でガードし `NotFoundError` DOMException を catch する。`pointerEvents: 'none'`（`Entity.ts:431` `a11yAttributes.pointerEvents`）はノードをヒットテストから除外するが子には影響しない — §6.3 を参照。

## 6. ヒットテスト — 一致しなければならない 2 つのパス

`Scene.findEntityAt(x, y)`（`Scene.ts:2777`）は `HitTester.findEntityAt(x, y, currentFrame, width, height)`（`HitTester.ts:121`）に委譲する：

1. オーバーレイルートを先に — 常に `findHitRecursively`（オーバーレイは少数で、WASM インデックス化されない）。
2. メインツリー — `backends.hit` と `ensureHitGrid(frame, width, height)`（`:144`）が成功すれば `findEntityAtWasm`（`:185`）、さもなければ `findHitRecursively`（`:227`）。WASM パスは確定的 — 正しい Entity か `null` を返し、決して「不明」にはならないため、信頼できる grid の後に JS フォールバックは続かない。

`findHitRecursively(node, x, y, clip)`（`:227`）：

- `opacity <= 0` のサブツリーをスキップする（累積 opacity）。
- `clipChildren` は `intersectBounds`（`:32`）で `childClip` に交差させる — 渡されるが、ノード自体は incoming clip に対して依然テスト可能である。
- 子を描画順の逆順（最前面が先）で走査する。
- ノードがヒットする条件は `isPointInside(x,y) && isInsideAllClippers(node,x,y) && !isPointerTransparent(node)`。

`isInsideAllClippers`（`:284`）は正規の回転対応ゲート — すべての `clipChildren` 祖先の `worldToLocal(x,y)` が `[0, width]×[0, height]` 内になければならない。walk 内の AABB クリップスタックはサブツリー枝刈り用の事前フィルタに過ぎず、両方のヒットパスが正確な rect を再適用しなければ、回転したクリッパーでバックエンドごとに異なる結果になる（#680）。

`isHitEligible(node,x,y)`（`:326`、WASM パス）は同じゲートをフラットに再適用する：`!isPointerTransparent`、`opacity>0` がノードとすべての祖先で成立し、かつ `isInsideAllClippers`。`isPointerTransparent`（`:284`）は `attrs.disabled === true || attrs.pointerEvents === 'none'`（`Entity.ts:431`）— 透過コンテナの子は依然として走査される。

## 7. レンダースケジューリング — dirty がループと出会う場所

`Scene.loop(time)`（`Scene.ts:5569`）は `requestAnimationFrame` で実行される：

1. `!_canvasOnScreen`（IntersectionObserver）なら bail — 非表示中の `markDirty()` は無害で、フラグは保持される。
2. `isIdle = !dirty && !frameHadAnimation && !contentSemanticDeferred`（`:5594`）を計算 — `onDemand` スキップと `always` の `idleFPS` への auto-throttle の両方を駆動する。
3. `effectiveMaxFPS()`（`:5556`）— 明示的な `maxFPS` は `prefersReducedMotion` がマッチするとき `30` に下げられる。
4. フレームレート上限：`if (cap>0 && time - lastTime < 1000/cap -1) skip`（`:5605`）。
5. `dt` を公称 `1000/cap` に、30% 以内ならスナップしてコンポジタのジッターを除去する。バックグラウンドタブ後の spring 爆発を避けるため `MAX_FRAME_DT` にクランプする（`:5630`）。
6. `onDemand && isIdle → skip`（`:5640`）。
7. `render()` の**前**に `dirty = false`（`:5650`）— §3.2 を参照。
8. `render(renderer, dt, time)`（`:5730`）— `currentFrame` をバンプし、バッチドライバを tick（`_tickBatchedDrivers`）し、パーティクルシミュレーションを進め、Entity を walk する。
9. レンダリング後の a11y／content 投影の同期 — `frameHadAnimation` の間は完全にスキップされる（DOM リフローが canvas ループをスラッシングするのを防ぐ）。

`Scene.step(dt)`（`Scene.ts:3420`）は同期的で決定論的なドライバ（ビデオ書き出し、テスト、ベンチマーク）— `renderMode`／`dirty`／`maxFPS` を参照せず無条件にレンダリングし、後で `dirty` をクリアする。`step()` で駆動するベンチマークは `onDemand` スキップを観測できない（`Scene.ts:3406` ドキュメント）。

## 8. 難所 — 証跡付き

### 8.1 Ancestor walk は O(depth) で、しかも多数存在する

`getWorldTransform`、`getWorldScale`、`isInsideAllClippers`、`isHitEligible`、`dispatchEvent` の path 構築、`Entity.scene` ゲッター — それぞれが `parent` を root まで辿る。深さは通常浅い（Stack → Card → RichText）ため、呼び出しごとの O(depth) は安価だが、ヒットテストと render walk はフレームごと・Entity ごとにそれを呼ぶ。3 つの緩和策：

- **フレーム毎キャッシュ**（`_worldFrame`／`currentFrame`、`:845`／`5806`）— O(1) 無効化、render walk がすでに行列をスタンプしていれば高速パス。`getWorldTransform` はミス時のみ walk にフォールバックする。
- **ゼロアロケーション読み取り**（`_readWorldCache`、`:1647`）— `gatherHitAABBs` のような gather 用に、Entity ごとに 1 オブジェクト確保する代わりに呼び出し元所有のオブジェクトへ 6 スカラーを読み込む。G2 統合ベンチマークでは Entity ごとのクロージャ確保が実コストだった（`DriverTicker.ts:40` ヘッダー）。
- **WASM SoA ストア**（G1）— Entity ごとの walk の代わりに型付き配列上の 1 回の線形パス。`ensureHitGrid` の fused gather（`HitTester.ts:144`）は、Entity ごとに四隅を再導出しないよう `transform.aabbView()` を再利用する（JS gather は 100k Entity で 11.2 ms に対し 39 µs、ほぼすべてがカーネル手前のコスト）。

それでも 500 段のチェーンを挿入し、タイトループで `getWorldTransform` を呼べば O(n·depth) になる。ツリーは深くではなく広く保つこと。

### 8.2 Transform コスト — cos／sin の罠

`Math.cos/sin` は V8 ではソフトウェア libm 呼び出しで、他エンジンより約 2.5 倍遅い（`Entity.ts:828` ヘッダー）。`Entity._getTrig()`（`:1746`）はペアをキャッシュし、rotation が変わったときだけ再計算する。`getWorldTransform` と render walk の両方がそれを読む。これがなければ、多数の回転パーティクルを持つシーン（Danmaku）では、角度が変わっていないのに Entity ごと・フレームごとに libm コストを支払うことになる。`_hasTransitions` フラグ（`:812`）も同種のマイクロ最適化 — ほとんどの Entity はアニメーションしないため、`x = v` が transition／driver マップに触れてはならない。

### 8.3 ライフサイクルリーク — 繰り返す 3 つのパターン

**ドライバサブツリーリーク。** `DriverTicker.active: Set<Entity>`（`DriverTicker.ts:84`）はバッチ候補セットである。`Entity.add` はサブツリーを登録し（`:1087` の対）、`remove` は登録解除する（`:1130`）。どちらかの呼び出しが欠けると — たとえば `add`／`remove` を経由せず `children` を直接変更するカスタムコンテナ — ドライバはツリー外でも毎フレーム tick し続け、Set 内で Entity をピン留めする。監査：`Entity.ts` 外での直接の `children.push/splice` を検索すること。

**destroyed ガード。** `Entity.destroy()`（`:1525`）は最初に `_destroyed` を設定してから再帰する。2 回目の `destroy()` は no-op である。子の `onMounted` やドライバの `onDone` 経由で再入した `destroy()` はフラグを見て停止する。`Scene.destroy()`（`:2957`）は子を teardown する前に `destroyed` を設定し、すべての非同期コールバック（WebGPU デバイス復旧 `:5813`、`requestAnimationFrame` ループ `:5569`）は `if (destroyed) return/newDevice.destroy()` をチェックする。ガードが欠けると、半壊したシーンが復活したり、SPA のルート遷移で GPU デバイスがリークしたりする。

**a11y／portal リーク。** `remove` は `detachA11y(child)`（`:1117`）を呼び、`destroy` は `A11yProjectionManager.ts:227` 経由で `removeA11yRecursively` を呼ぶ。投影の `contentSemanticBudget` と `contentViewportEpoch` により、削除された Entity のキャリア／投影状態が `syncA11y` walk を跨いで保持されない。`detachA11y` を忘れると、透過なシャドウ要素が残り、ポインタイベントを捕捉し続け `getA11yTree()` に現れる。

### 8.4 レンダースケジューラ分解の罠

`Scene.ts` は約 6.5k 行ある。4 つのドメインが可変なフレーム状態を共有しているためである：`DirtyTracker`（`DirtyTracker.ts:70`）、`DriverTicker`（`DriverTicker.ts:57`）、`HitTester`（`HitTester.ts:17`）、`WasmBackendFacade`（`WasmBackendFacade.ts:1`）は `forge/decisions/file-decomposition-2026-08.md` に従って抽出されたが、`loop`／`render` と `a11yRoot`／`canvas` ジオメトリは Scene に残っている。`Scene._updateWalkDt`（`:5806`）は `Entity._spawnDriver` の walk 途中 catch-up tick 用に公開されている — バッチパスが Entity を確定した後に生成されたドライバが、そうしなければ WASM パスでは次フレームまで待たされるが JS パスでは同フレームで tick してしまうためである。`dt`／`currentFrame`／`frameHadAnimation` を一緒に持ち運ばずに `loop` を分割すると `DEC-0019` ルール 5 に違反する。

## 9. 開発者が守るべき不変条件

1. **決して `add`／`remove`／`destroy` 以外で `children` を変更しない。** 直接の配列変更は `markStructureChanged`、`markDirty`、ドライバ登録、a11y デタッチのすべてをスキップする — 4 つの不変条件が静かに壊れる。`Entity.ts` 外で `\.children\.push|\.children\.splice` を grep すること。
2. **処理をスケジュールする前に `destroyed` をチェックする。** `scene` や `entity.scene` に触れる `requestAnimationFrame`、`setTimeout`、`ResizeObserver`、WebGPU Promise はすべて `if (destroyed) return` でガードしなければならない。`Scene.ts:3137` の `destroy()` ドキュメントは明示的である。
3. **dirty 契約を尊重する。** `onDemand` シーンは `markDirty()` かアクティブなドライバまでスリープする。`Entity.animate`／`setTransition` の外で `x/y/scale/rotation/opacity/width/height` を `markDirty({ reason })` なしで変更すると、変更が不可視のままになる。逆にフレームごとの `markDirty`（例：`update()` が自ら再アームする）が `onDemand` を起こし続ける — 毎フレーム発火する `reason` を見つけるには `scene.dirtyReasons`（`:3489`）を使うこと。
4. **ヒットテストのゲートを同期させておく。** 新しい可視性／入力／クリップ条件は `findHitRecursively`（`HitTester.ts:227`）と `isHitEligible`（`:326`）の両方に追加しなければならない。片方だけにあると WASM と JS のパスが不一致になり、アクセラレータがバグ生成器になる。
5. **ポインタキャプチャは `e.target === capEl` のときだけ。** `Scene.ts:3851` のガードは任意ではない。これを外すと、選択肢がキャプチャ要素の子であるすべての Dropdown／Select メニューが壊れる。
6. **ワールド行列の利用側は stale キャッシュのケースを扱わなければならない。** `getWorldTransform()` は `currentFrame` に対してのみキャッシュされた行列を返せる。フレーム間やツリー外の Entity に対しては walk する。`_readWorldCache` の呼び出し元は、`false` が返ったときにフル walk にフォールバックしなければならない（`HitTester.ts:144` fused-gather コメント）。
7. **計測はバージョン管理し、走査しない。** フォント／DPR／ビューポートの変更は、すべてのキャリアに触れるのではなく生成カウンタで `scaleX`／キャリブレーションを無効化する（`ContentProjectionManager.ts:524`）。同じパターンが形状キャッシュの `structureVersion` にも当てはまる。

## 10. デバッグチェックリスト — シーンがおかしく見えるとき

- **onDemand モードで変更後に何もレンダリングされない** → `dirty` はまだ `false` か？ `scene.setDirtyTracking(true)` を有効化し、変更して `scene.dirtyReasons` を読む。約 90% のケースで原因は `markDirty` の欠落である。devtools で `scene.frameStats.dirty`（`Scene.ts:3528`）を確認すること。
- **remove() 後に幻のヒットターゲットが残る** → `children` は直接変更されたか？ `structureVersion` のバンプと `HitTester.ensureHitGrid` の staleness（`hitGridStructureVersion` vs `structureVersion`）を確認すること。`hitGridOk=true` の stale grid は誤った候補を提供する。
- **サブツリー削除後もドライバが動き続ける** → `DriverTicker.active` のサイズは減ったか？ `scene._tickBatchedDrivers` のゲートを点検すること — `unregisterSubtree` at `DriverTicker.ts:101` はサブツリー全体を walk するため、非常に深いデタッチ済みサブツリーはフレームごとではなく削除時に O(subtree) を支払う。
- **transform が JS と WASM で乖離する** → `entity.getWorldTransform()`（JS walk）と `transform.aabbView()` のスロットを比較すること。古い `_storeSlot`（`Entity.ts:865`、ストアにないとき `-1`）は遅いが正しい JS フォールバックを生むだけで、誤った行列にはならない — 行列が異なるなら、トポロジ再構築で `markStructureChanged` が欠落している。
- **イベントが二重に発火する／まったく発火しない** → `bubbles` フラグ（`VectoJSEvent.ts:607`）と、リスナーが `captureListeners` と `listeners` のどちらにあるかを確認すること。非バブリングの `hover`／`pointerleave` は bubble フェーズで target のみで発火する。
- **タブ再フォーカスで spring が爆発する** → `loop` は `dt` を `MAX_FRAME_DT`（`Scene.ts:5630`）にクランプする。カスタムの `step(dt)` が巨大な `dt` を `tickDrivers` に直接渡す場合、同じクランプを呼び出し側で適用しなければならない。

---

_Series: 00 Overview → 01 Selection → 02 Text+Layout → 03 Projection+Virtualization → 04 Streaming Markdown → 05 TeX → **06 VMT Runtime** → 07 Renderer → 08 WASM G1/G2/G3 → 09 Three/XR → 10 Video Export → 11 Graph Layout → 12 DevTools → 99 Synthesis._
