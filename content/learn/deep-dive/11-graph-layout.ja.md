+++
title = "11 — グラフレイアウト — 力指向物理演算とベンチマーク"
description = "ForceLayout2D の依存なし 2D エンジン、Barnes-Hut 四分木と階層化された衝突グリッド、増分ミューテーションとピン契約、VectoForceLayout / D3ForceLayout の 3D ファミリー、vectojs-force-rs WASM カーネル、そしてヘッドありベンチマーク手法。"
weight = 31
+++

# 11 — グラフレイアウト — 力指向物理演算とベンチマーク

> **ボス 11** は「バネと反発」に見えるが、出荷する段になると本性が現れる。ナイーブな N 体計算は tick ごとに $O(N^2)$、単一のハブがナイーブな衝突グリッドを崩壊させ、増分展開が安定した状態を破壊してはならず、同じ seed からは 2 人のユーザーが同じレイアウトを見なければならない。VectoJS は `@vectojs/graph-layout` におけるレンダラー非依存の 2D 四分木＋階層化グリッド、 `@vectojs/graph3d` における並行する 3D 八分木ファミリー、そして `crates/vectojs-force-rs` におけるビット単位で同一の Rust カーネルでこれに応える。

- **学べること**: なぜ $N^2$、安定性、増分性、決定性が 4 つの難問なのか、`ForceLayout2D` がどのように SoA 状態を保持し `Float32Array` の positions を公開するのか、反発（Barnes-Hut）、リンクバネ、センタリング、衝突が tick ごとにどう合成されるのか、なぜ 2D 四分木と階層化衝突グリッドがナイーブなグリッドを置き換えたのか、ピン、ID マッピング、再加熱、alpha 冷却がどのように相互作用するのか、`VectoForceLayout` vs `D3ForceLayout` vs `FixedZLayout` の違いと `KnowledgeGraphModel` がどこでそれらを消費するのか、WASM 力学カーネルが何を置き換えどうビット同一性を保つのか、そして `benchmarks/graph-layout` が実際に何を測定し何を明示的に測定しないのか。
- **学べないこと**: VMT の dirty／ライフサイクル（ボス 06）、レンダラー／DPR の正確性（ボス 07）、あるいは G1／G2／G3 WASM トリプル（ボス 08）— ただし本ボスはボス 08 の不可視バックエンド契約をそのまま再利用する。テキスト整形（ボス 02）とストリーミング Markdown（ボス 04）はグラフレイアウトのコンシューマであり、逆ではない。

## 1. なぜ力指向レイアウトは見かけより難しいのか

「バネと反発」の背後には 4 つの問題が潜む:

1. **$N^2$ vs Barnes-Hut。** 反発は全ノード対全ノードである。3000 ノードでは tick ごと、フレームごとにメインスレッドまたはワーカー上で約 900 万ペアの力がかかる。真の 2D 四分木（`BarnesHutQuadtree.ts:8` フラット配列、tick 間で再利用）により、`size/distance < theta` のとき遠方セルを 1 つの擬似粒子として扱うことで（`BarnesHutQuadtree.ts:121` の開放テスト `4*half² < theta²*d²`）、これを $O(N \log N)$ にする。3D 側も八分木で同様のことを行う（`VectoForceLayout.ts:402` `BarnesHutOctree`）。これなしでは数百ノードを超えるグラフがジャンクする。

2. **不均一な半径の下での安定性。** 半径 100 の単一ハブと半径 4 の 3000 枚の葉が並ぶと、均一な衝突グリッドは崩壊する: 1 つの `cellSize = 2·maxRadius` がすべての葉を巨大な 3×3 近傍に詰め込み、ペア走査が二次関数的に劣化する（`BarnesHutQuadtree.ts:189` のコメントは 3k → 12k で 1 つの大きなハブがあると tick ごとに `12 ms → 197 ms` を計測）。修正は 2 の累乗の半径階層グリッド（`BarnesHutQuadtree.ts:190` 階層 `t = floor(log2(r))`、セル `Ct = 2^(t+2)`）であり、各階層が独自のハッシュテーブルを持ち、階層間のペアはちょうど一度だけ解決される。

3. **テレポートなしの増分性。** ナレッジグラフはページングされる: 今は 50 ノード、スクロール後にさらに 50。呼び出し元は `appendGraph` が既存の位置、速度、ピンをすべてそのまま保持し、新しいノードだけを決定論的に追加し、穏やかに再加熱することを期待する（`ForceLayout2D.ts:162` `appendGraph`、`ForceLayout2D.ts:199` `if (newNodes.length>0||addedLinks>0) this.reheat()`）。`setGraph` による再構築（`ForceLayout2D.ts:123`）は安定したグラフをテレポートさせる。

4. **プラットフォームを跨ぐ決定性。** `seed` は JS と Rust で同じ初期配置と同じ重なり点ジッターを再現しなければならず、テスト、スナップショット、将来の WASM 差分オラクルがビット単位で一致する。選ばれた数学は `mulberry32`（`ForceLayout2D.ts:868`）、`Math.hypot` ではなく `Math.sqrt`（エンジン近似、`VectoForceLayout.ts:618` 注記）、そして整数 `Math.imul` ジッター（`BarnesHutQuadtree.ts:618` `collisionPairAngle`、`VectoForceLayout.ts:606` `jitterFor` ／ `crates/vectojs-force-rs/src/lib.rs:83` `jitter_for`）である。

1 つでも欠ければ、グラフはジャンクするか、爆発するか、テレポートするか、JS と WASM の間で乖離する。

## 2. パッケージマップ

```text
@vectojs/graph-layout          依存なしの 2D エンジン、レンダラーピアなし
  src/ForceLayout2D.ts         tick ループ、SoA ストア、公開 API
  src/types.ts                 NodeId/GraphData/ForceLayout2DOptions
  src/internal/BarnesHutQuadtree.ts  四分木＋階層化衝突グリッド
  src/index.ts                 バレル（types + layout）

@vectojs/graph3d               3D インスタンスレンダラー＋レイアウトバックエンド
  src/layout/GraphLayout.ts    最小 3D 契約（setGraph/step/positions/pin/reheat/dispose）
  src/layout/VectoForceLayout.ts  自前 3D Barnes-Hut 八分木（JS オラクル＋WASM）
  src/layout/D3ForceLayout.ts  d3-force-3d アダプタ（移行の忠実性）
  src/wasm/force-backend.ts    Rust カーネル用ストリーミング／同期ローダー
  src/wasm/asset.ts            forceWasmUrl バンドラーヘルパー
  src/wasm/vectojs_force.wasm  vectojs-force-rs の gitignore された出力

@vectojs/knowledge-graph       ページングされたコンシューマ（KnowledgeGraphModel）
  src/KnowledgeGraphModel.ts   GraphLayout の単一ドライバ（setGraph/reheat）
  src/FixedZLayout.ts          z を平面にクランプした VectoForceLayout
  src/KnowledgeGraphSession.ts ファクトリ配線（theta 0.9、WASM オプトイン）

crates/vectojs-force-rs        WASM 八分木力学カーネル（不可視バックエンド）
  src/lib.rs                   ビルド＋力積算のみ、f64 アキュムレータ

benchmarks/graph-layout        ヘッドあり 4-arm マトリクス（d3-force-3d、vecto-force、d3-force-2d、force-layout-2d）
benchmarks/graph3d-frame       3D レンダラーのフレームコストハーネス（物理マトリクスではない）
benchmarks/_shared/*           単一サーバー＋バンドラー＋統計＋ランナー（run-browsers.sh）
```

`@vectojs/graph-layout` は `@vectojs/*` 依存がゼロ（`package.json:1` `name: @vectojs/graph-layout`）; `@vectojs/graph3d` は `three` のみに依存; `@vectojs/knowledge-graph` は `graph3d` のレイアウト契約に依存する。ビルド順序: `math+text → graph-layout → three/graph3d → knowledge-graph`（`package.json` workspaces で検証済み）。

## 3. ForceLayout2D — 2D エンジン

### 3.1 状態と positions 契約

SoA 型付き配列、入力ノード順序とインデックス整合（`ForceLayout2D.ts:48` `nodes: GraphNode[]`、`ForceLayout2D.ts:49` `nodeIndex: Map<NodeId,number>`、`ForceLayout2D.ts:50` `positionStorage: Float32Array`、`ForceLayout2D.ts:51` `velocityX/Y`、`ForceLayout2D.ts:53` `fixedX/Y` ＋ `pinnedX/Y`、`ForceLayout2D.ts:57` `repulsion`／`collisionRadius`、`ForceLayout2D.ts:60` `linkSource/Target/Distance/Strength/Share`、`ForceLayout2D.ts:76` `quadtree`）。

公開 `positions` は入力ノード順で `positionStorage` へのライブな XY インターリーブビューである（`ForceLayout2D.ts:32` `public positions = new Float32Array(0)`、`ForceLayout2D.ts:748` `refreshPositionView` は `subarray` 経由）。同一性は `step()` 呼び出し間で安定だが、トポロジーや容量変更によりバッキングストアが置換されることがある — ホストは `setGraph`／`appendGraph`／`removeNodes` の後に `positions` を再取得しなければならない（クラスドキュメント `ForceLayout2D.ts:18`）。

公開状態に触れるすべての演算は `Math.fround` を経由して丸められる（`ForceLayout2D.ts:13` `const f = Math.fround`、`ForceLayout2D.ts:808` `toF32`）、`Float32Array` 公開と一致させるためである。3D パスも同様（`VectoForceLayout.ts:48` `const f = Math.fround`）だが Barnes-Hut アキュムレータは `f64` のままである（`BarnesHutQuadtree.ts:9` `cellX/Y/centerX/Y/halfSize/charge: Float64Array`）。

### 3.2 ノード／リンク同一性と増分ミューテーション

ノードは配列インデックスではなく `NodeId`（`types.ts:2` `string|number`）で、あらゆる場所でアドレス指定されるため、ピンはコンパクションを越えて生存する（`ForceLayout2D.ts:25` ドキュメント）。4 つのミューテーション入口があり、それぞれ厳格な all-or-nothing 検証を持つ:

| メソッド             | ドキュメント           | 所有権                                             | 失敗モード                                                                                                                               |
| -------------------- | ---------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `setGraph(data)`     | `ForceLayout2D.ts:122` | すべてを置換、再 seed、`alpha=1`                   | 重複ノード ID または欠損／自己参照リンク → 古い状態をクリアする前に throw（`ForceLayout2D.ts:132` スワップ前の検証）                     |
| `appendGraph(data)`  | `ForceLayout2D.ts:151` | 既存を保持、新しい ID を追加、重複排除             | 不明／欠損／自己リンク → いかなるミューテーションの前にも throw（`ForceLayout2D.ts:186` `resolveEndpoint` ＋ `UNKNOWN_ENDPOINT` ガード） |
| `removeNodes(ids)`   | `ForceLayout2D.ts:202` | 元の順序で生存者をコンパクト化、インデックス再構築 | 一致なしなら no-op; 一度だけ再加熱（`ForceLayout2D.ts:252`）                                                                             |
| `removeLinks(items)` | `ForceLayout2D.ts:265` | ノード状態を保持、リンクをコンパクト化             | 有向 `(source,target,id)` 同一性でマッチ（`ForceLayout2D.ts:826` `linkIdentity`）; 冪等                                                  |
| `updateLinks(links)` | `ForceLayout2D.ts:324` | 既存リンクの distance／strength を再解決           | 不明／同一エンドポイント → throw; 存在しない同一性は無視; 値が実際に変わったときのみ再加熱（`ForceLayout2D.ts:361`）                     |

リンク同一性は微妙な罠である。`ForceLayout2D.ts:826` `linkIdentity` は `[idKey(source), idKey(target), idKey(id)]` をシリアライズし、`idKey`（`ForceLayout2D.ts:835`）は `"1"` vs `1` の衝突を避けるため型を接頭辞化する。`id` がなければ同一性は有向エンドポイントペアであり、並列リンクは異なる `id` を必要とする（`types.ts:19` `GraphLink.id`）。3D バックエンドは異なる: `VectoForceLayout` と `D3ForceLayout` はすべての `(source,target)` ペアをリンクとして扱い自己ループすらスキップする（`VectoForceLayout.ts:178` `if (ia===ib) continue`）が、エディタの重複リンクガードはより厳格である — 乖離の注記は `ForceLayout2D.ts:387` にある。

`appendLinks`（`ForceLayout2D.ts:637`）はバッチ内で `pendingKeys` により重複排除し、`distance`／`strength` を呼び出し元提供の `NodeValue`／`LinkValue` アクセサ（`ForceLayout2D.ts:777` `resolveNodeValue`、`ForceLayout2D.ts:787` `resolveLinkValue`）経由で解決し、`finiteOr` ガード（`ForceLayout2D.ts:797`）を伴う。

容量の増加は幾何学的で、償却 $O(1)$（`ForceLayout2D.ts:851` `grownCapacity` は 4 から倍増、`ForceLayout2D.ts:672` `ensureNodeCapacity`、`ForceLayout2D.ts:689` `ensureLinkCapacity`、`ForceLayout2D.ts:857` `resize` は接頭辞を保持）。

### 3.3 tick — 6 フェーズ

`tick()`（`ForceLayout2D.ts:480`）は同期的でホスト駆動である（`step()` は `ForceLayout2D.ts:368` で `alpha >= alphaMin` の間 `tick()` をループ）。タイマーは所有しない — ホストがいつ `step()` を呼ぶか決める（クラスドキュメント `ForceLayout2D.ts:21`）。

```text
sanitizeState → quadtree.build → repulsion (ノードごとの Barnes-Hut)
              → link springs → collision grid → centering+integrate+pin clamp → alpha decay
```

各フェーズの詳細:

1. **サニタイズ**（`ForceLayout2D.ts:752`）— すべての position／velocity／pin／repulsion／radius を `toF32` し、迷子の NaN がツリーを汚染しないようにする; ピンされた座標は保存された位置を上書きする。

2. **ツリー構築**（`ForceLayout2D.ts:483` `quadtree.build(positions, repulsion, nodeCount)`）— §5 を参照。

3. **反発**（`ForceLayout2D.ts:484` ループで `quadtree.force(qx,qy,theta,nodeIndex,out,maxDistance)` を呼ぶ）— 逆二乗 `(-charge / d³) * (dx,dy)`、`distanceSquared` は `1e-6` でフロア、完全一致には決定論的な `pairAngle`（`BarnesHutQuadtree.ts:126` ／ `BarnesHutQuadtree.ts:610` `pairAngle`）。`repulsionDistanceMax` を尊重する（`ForceLayout2D.ts:92` 非有限はカットオフなし; `BarnesHutQuadtree.ts:85` `maxDistanceSquared` ＋ 最近接セル事前テスト `distanceToCellSquared` は `BarnesHutQuadtree.ts:632`）。3D 側も octree 挿入で同じフロアと `jitterFor` を使う。

4. **リンクバネ**（`ForceLayout2D.ts:499`）— Hooke 風 `displacement = ((d - rest)/d) * strength * alpha`、次数重み付けされた share で分割（`ForceLayout2D.ts:701` `recomputeLinkBias`: `sourceShare = targetDegree/total`、ピンがエンドポイントを固定するときは `springShare` でフロアされる `ForceLayout2D.ts:846`）。ピンされたターゲットの予測位置を使うため、ピンされたノードも依然として引っ張る。

5. **衝突**（`ForceLayout2D.ts:580` `applyCollisions` → `BarnesHutQuadtree.ts:172` `applyGridCollisions`）— 階層化グリッド、§5。

6. **Center ＋ integrate**（`ForceLayout2D.ts:554` `center*alpha` で原点へ引く、速度減衰、その後軸ごとのピンクランプ: ピンされた軸は `fixedX/Y` にスナップし速度をゼロにする）。**冷却**（`ForceLayout2D.ts:577` `alpha += (0-alpha)*alphaDecay`）は `ForceLayout2D.ts:95` で `alphaDecay > 0` ガードを伴う。`0` だと永遠にループするためである（`step()` は `ForceLayout2D.ts:372` `while (alpha>=alphaMin)`）。

## 4. 設定としての力

`ForceLayout2DOptions`（`types.ts:42`）と `VectoForceLayoutOptions`（`VectoForceLayout.ts:12`）は同じモデルを異なるデフォルトで公開する:

| ノブ                           | 2D デフォルト（`types.ts:43`） | 3D デフォルト（`VectoForceLayout.ts:14`）         | 役割                                                            | チューニングヒント                                                                                                                                           |
| ------------------------------ | ------------------------------ | ------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `repulsion` / `chargeStrength` | `300`（正の強さ）              | `300`（VectoForce）/ `-30`（D3 `chargeStrength`） | N 体の反発                                                      | ハブを離すには上げる; 2D は負を `0` にクランプする（`ForceLayout2D.ts:629`／`ForceLayout2D.ts:761` と `BarnesHutQuadtree.ts:109` `charge<=0 skip` 不変条件） |
| `collisionRadius`              | `0`（オフ）                    | 該当なし（graph3d に 2D グリッドはない）          | ノードごとの半径、`0` で無効（`ForceLayout2D.ts:582` max 走査） | ベンチではアクセサで `radius+14` に設定（`entry.ts:631`）                                                                                                    |
| `collisionStrength`            | `1`                            | —                                                 | 重なり補正の割合                                                | `0` でパス全体をスキップ                                                                                                                                     |
| `linkDistance`                 | `30`                           | `30`                                              | バネの自然長                                                    | ベンチではリンク次数ごとのアクセサ（`entry.ts:632`）                                                                                                         |
| `linkStrength`                 | `0.3`                          | `0.3`                                             | バネ剛性 `[0,1]`                                                | `0` = リンクは何も及ぼさない                                                                                                                                 |
| `centerStrength`               | `0.02`                         | `0.02`                                            | 原点への引き                                                    | `0` = 自由浮遊グラフ                                                                                                                                         |
| `velocityDecay`                | `0.6`                          | `0.6`                                             | `1-friction`、保持率 `[0,1)`                                    | 小さいほど減衰が強い                                                                                                                                         |
| `theta`                        | `0.9`                          | `0.9`                                             | Barnes-Hut 開放角                                               | `0` = 厳密 $O(N^2)$; 大きいほど高速／粗い                                                                                                                    |
| `repulsionDistanceMax`         | `Infinity`                     | `Infinity`（3D ベンチでは個別に公開されない）     | 遠方反発の GC                                                   | `Infinity`／非有限 = カットオフなし（`ForceLayout2D.ts:91`）; `0` も `BarnesHutQuadtree.ts:77` 早期リターンで無効になる — 静かな落とし穴                     |
| `alphaDecay` / `alphaMin`      | `0.0228` / `0.001`             | `0.0228` / `0.001`                                | 冷却（`~1-0.001^(1/300)` ≈300 tick で収束）                     | `0` decay は `0.0228` にフォールバックする（`ForceLayout2D.ts:96`）                                                                                          |

アクセサ形式 `number | ((node, index)=>number)`（`types.ts:38` `NodeValue`、`LinkValue`）により、ドキュメントは再構築なしにエンティティサイズを半径にマッピングできる。リンク share はトポロジー変更ごとに再計算される（`ForceLayout2D.ts:702`）。

## 5. 2 つの空間インデックス

### 5.1 2D Barnes-Hut 四分木

`BarnesHutQuadtree.ts:8` は tick ごとに再利用されるフラット配列四分木である。`build()`（`BarnesHutQuadtree.ts:36`）は位置 AABB から正方形境界を導出（`+1e-6` のスラック）、容量を確保し（`BarnesHutQuadtree.ts:531` 64 から倍増、`count*4+4` ヒューリスティック）、すべての点を挿入する（`BarnesHutQuadtree.ts:437` `insert` は `MAX_DEPTH=40` で行 1 — 重なり点用の深さガード、葉は連結リスト `pointHead→pointNext` を保持）。`finalize()`（`BarnesHutQuadtree.ts:485`）はノードを逆順に走査し（子が親より先、ノードは上から下に割り当て）`charge` と `centerX/Y` を質量加重平均として累積する; `total>0` ガードは `BarnesHutQuadtree.ts:507` にあり、上記の `charge<=0 skip` 不変条件と対になる — 負の charge は両方を再考する必要がある。

`force()`（`BarnesHutQuadtree.ts:69`）は反復スタック走査（`BarnesHutQuadtree.ts:87` `ensureStack`）であり、カットオフ事前テスト用の `distanceToCellSquared`（`BarnesHutQuadtree.ts:632`）と `BarnesHutQuadtree.ts:117` での厳密な近似テストを伴う。

### 5.2 階層化衝突グリッド

`applyGridCollisions`（`BarnesHutQuadtree.ts:172`）が存在するのは、衝突が反発とは**異なる**空間クエリ（長距離場ではなく短距離の重なり）だからである。重要なアイデア:

- **階層割り当て**（`BarnesHutQuadtree.ts:206` `tier = floor(log2(radius))`、セル `4*2^tier` は `BarnesHutQuadtree.ts:267`）— 均一な半径は 1 つの階層に崩れ、古い `2·maxRadius` グリッドのように振る舞う; `cellSize < r_i+r_j` の bound は `BarnesHutQuadtree.ts:198` にあり、3×3 プローブがすべての重なりを見つけることを保証する。
- **ゼロ半径センチネル**（`BarnesHutQuadtree.ts:5` `ZERO_TIER = -0x40000000`、`BarnesHutQuadtree.ts:222` バケット）— ゼロ半径点はグリッドを所有しないが、より大きな階層に対して開始点として依然衝突する。
- **階層別カウンティングソート**（`BarnesHutQuadtree.ts:240` `collisionOrderOffsets` への prefix-sum、`BarnesHutQuadtree.ts:248` カーソル充填）— $O(N)$ でスパン安全: オフセットテーブルは点数ではなく**階層スパン**でサイズ決めされる。`f32` 半径は約 280 乗の 2 を跨ぐためである（`BarnesHutQuadtree.ts:237` コメント、`BarnesHutQuadtree.ts:587` `ensureCollisionOffsets`）。
- **重複排除された 3×3 プローブ**（`BarnesHutQuadtree.ts:349` `probeCollisionCell`）— 9 スロット、線形プローブハッシュ `imul(cellX,73856093)^imul(cellY,19349663)`（`BarnesHutQuadtree.ts:596`）、`BarnesHutQuadtree.ts:372` での重複セルフィルタ、ペア一度きりルール（`sameTier && target<=source` スキップは `BarnesHutQuadtree.ts:390`; 階層間はスキップ不要 — より大きな階層との各ペアはより小さい開始点によりちょうど一度だけ訪問される）。
- **share を考慮した衝撃**（`BarnesHutQuadtree.ts:406` `pinned?0:otherPinned?1:0.5`）— バネ share を反映するが、両方が free のときは半分にクランプされる（d3-force は半径加重 share を使う; `entry.ts:745` のコメントが比較の注意点を指摘）。

3D 八分木（`VectoForceLayout.ts:402`）は 3D でこの構造を反映する: `BarnesHutOctree.build` は AABB を立方体化し、同じ `depth < 40` ガードと重なり点用の決定論的 `jitterFor` で `insert` する（`VectoForceLayout.ts:561`）、ボトムアップで `finalizeMass`、`size² < theta²*d²` と距離ゼロスキップではなく `pointIndex` 同一性スキップ（`VectoForceLayout.ts:726`）による `force` — 重なった異なる点はジッターで離され依然として力を及ぼさなければならない。

## 6. ピン、再加熱、決定性

**ピンは軸ごと、ID アドレス指定である。** `ForceLayout2D` は `NodeId` でピンする（`ForceLayout2D.ts:393` `pinNode(id,x,y)`、`ForceLayout2D.ts:413` `setNodePin({x?,y?})`、`ForceLayout2D.ts:436` `clearNodePin`）、`fixedX/Y` ＋ `pinnedX/Y` を保持する（`ForceLayout2D.ts:53`）; graph3d の `GraphLayout` は**インデックス**でピンする（`GraphLayout.ts:46` `pinNode(nodeIndex,x,y,z)`、`VectoForceLayout.ts:337` `fx/fy/fz = NaN` センチネル vs `D3ForceLayout.ts:122` `fx/fy/fz = null`）。乖離は `ForceLayout2D.ts:387` で文書化されている — スタックを跨ぐときは変換すること。`GraphNode` 上の初期 `fx/fy`（`types.ts:12`）は `ForceLayout2D.ts:619` `addNode` で事前ピンとして尊重される。

**再加熱は alpha を上げるだけで下げない**（`ForceLayout2D.ts:450` `alpha = max(alpha, requested)`、`VectoForceLayout.ts:359` 同様、`D3ForceLayout.ts:150` `alpha = max(alphaMin, min(1,alpha))`）。すべてのトポロジーミューテーションは一度だけ再加熱する（`ForceLayout2D.ts:199`、`ForceLayout2D.ts:252`、`ForceLayout2D.ts:308`、`ForceLayout2D.ts:361` 条件付き）— 呼び出し元が覚える必要はない。ナレッジグラフ経路は `rebuildGraph` の後で明示的に再加熱する（`KnowledgeGraphModel.ts:285` `layout?.reheat?.(0.5)`、`KnowledgeGraphModel.ts:356` で `layout?.setGraph` を呼んだ後）。

**決定性**は三層である: seed された `mulberry32` 螺旋配置（`ForceLayout2D.ts:613` `radius=10*sqrt(i+1), angle=rand()*2π` ／ `VectoForceLayout.ts:143` `r=10*cbrt(i+1)` 球面）、`deterministicAngle`（`ForceLayout2D.ts:878` `(source,target,seed)` からハッシュ）および `collisionPairAngle`（`BarnesHutQuadtree.ts:618` seed 付き）による決定論的重なり角度、そして JS と Rust で同一の浮動小数点選択（上記の `Math.hypot` の罠）。

**冷却**は `alphaDecay = 0.0228`（`≈ 1-0.001^(1/300)`、d3-force-3d のデフォルトと同じ、`VectoForceLayout.ts:32` コメント）を使い `alphaMin = 0.001`; `step()` は `alpha >= alphaMin` を「まだ hot」として返す（`ForceLayout2D.ts:375`）、`GraphLayout` 契約（`GraphLayout.ts:26` ドキュメント）と一致する。破棄されていない `alpha=0` は決して冷却しない — 構築時にガードされる。

## 7. 3D ファミリーとナレッジグラフコンシューマ

### 7.1 VectoForceLayout vs D3ForceLayout

両方とも `GraphLayout`（`GraphLayout.ts:12` — `GraphData.nodes` 順の xyz トリプレットのフラット `Float32Array`、ワーカー転送可能、ホスト駆動 `step()`）を実装する。違い:

- **モデル:** `VectoForceLayout`（`VectoForceLayout.ts:50`）は**新しい**モデル — Barnes-Hut 八分木反発（`VectoForceLayout.ts:402`）、リンクバネ、センタリング、速度減衰、alpha 冷却 — 決定論的で依存なし。`D3ForceLayout`（`D3ForceLayout.ts:25`）は **d3-force-3d アダプタ**（`forceSimulation(…,3).force('link', forceLink).force('charge', forceManyBody).force('center', forceCenter)` は `D3ForceLayout.ts:88`）、`3d-force-graph` の感触を移行のために保つ。
- **状態所有:** `VectoForceLayout` は `positions/vx/vy/vz/fx/fy/fz/linkA/B` SoA（`VectoForceLayout.ts:87`）を保持し呼び出し元ノードを決してミューテートしない; `D3ForceLayout` は d3 がそれらをミューテートするため `simNodes: SimulationNode[]`（`D3ForceLayout.ts:71`）にクローンする。
- **ピン:** インデックスベースの `fx/fy/fz` NaN vs `null` センチネル; `VectoForceLayout.tick` は積分前にクランプする（`VectoForceLayout.ts:308`）、d3 の `fx` も tick 内で同様に行う。
- **Alpha:** `VectoForceLayout.reheat` は `alphaMin` でフロアし `1` でキャップする（`VectoForceLayout.ts:361`）; `D3ForceLayout.reheat` は直接 `simulation.alpha()` に書く（`D3ForceLayout.ts:151`）。

`FixedZLayout`（`knowledge-graph/src/FixedZLayout.ts:10`）は `VectoForceLayout` をラップし内部ステップの後で毎回 `z` を定数にクランプし、エンジンを交換せずに 3D レイアウトで 2D ナレッジグラフビューを駆動できるようにする。`KnowledgeGraphSession`（`knowledge-graph/src/KnowledgeGraphSession.ts:59` ドキュメント「セッションはミラーするだけ」）は `VectoForceLayout({theta:0.9})` を行 117 で構築し、`setGraph`／`reheat` を `KnowledgeGraphModel` に委譲する。

### 7.2 KnowledgeGraphModel — 増分コンシューマ

`KnowledgeGraphModel`（`knowledge-graph/src/KnowledgeGraphModel.ts:62`）は具体化されたカット（`entities`、`facts`、`factKeys`、`expansions`）を所有し、借用した `GraphLayout` の**単一ドライバ**である（`KnowledgeGraphModel.ts:43` ドキュメント: `rebuildGraph` ごとに 1 つの `setGraph`、`expand` ごとに 1 つの `reheat`）。`expand(id)`（`KnowledgeGraphModel.ts:127`）では `KgDataSource.getNeighbors` を `AbortSignal` キャンセルでページングし（`KnowledgeGraphModel.ts:148` 共有 promise 重複排除、`KnowledgeGraphModel.ts:150` `cancelExpand`）、エンティティ／ファクトを取り込み、`loaded` をネット新規ではなくバッチのファクト数で進め（重なる近傍で進行が停滞しないように — `KnowledgeGraphModel.ts:273` のコメント）、`rebuildGraph()`（`KnowledgeGraphModel.ts:332` 位置をキャプチャし、安定した `entityOrder` でマージし、`lastPositions` から新しいノードを seed し、`GraphData` を書いて `layout?.setGraph` を呼ぶ）を呼び、再加熱し（`KnowledgeGraphModel.ts:285`）、`ExpansionState`（`KnowledgeGraphModel.ts:7`）を記録する。`dispose()`（`KnowledgeGraphModel.ts:225`）は意図的に借用レイアウトを破棄しない — セッションがまだ共有している可能性があるためである。

### 7.3 WASM — 不可視の力学カーネル

`crates/vectojs-force-rs`（`crates/vectojs-force-rs/Cargo.toml:6`「不可視バックエンド; TypeScript パスは永続的なフォールバック」）は Rust で `BarnesHutOctree` をミラーする: `Octree`（`lib.rs:47`）、`jitter_for`（`lib.rs:83`）、`build`／`insert`／`place_child`／`finalize_mass`／`force`（`lib.rs:194` ／ `lib.rs:401`）、`force_init`／`force_pos`／`force_accel`／`force_step`（`lib.rs:457` ／ `lib.rs:484` ／ `lib.rs:491` ／ `lib.rs:503`）をエクスポートし、`STATUS_OK/CAPACITY/UNINITIALIZED/OVERFLOW`（`lib.rs:31`）を持つ。スコープは**ビルド＋力積算のみ**（`lib.rs:10` コメント — そのフェーズは 3D tick の 78–90%、`VectoForceLayout.ts:240` フェーズ分割）— リンクバネ、センタリング、積分は JS tick に残るため、継ぎ目は tick ごとに 1 つの `Float32Array.set` gather と 1 つの `Float64Array` 読み戻しである。

ローダー（`packages/graph3d/src/wasm/force-backend.ts:42` `ForceBackend`）はフォールバック付きストリーミングフェッチで `arrayBuffer` にフォールバックし（`force-backend.ts:104` `instantiateStreaming`）、`ensure`／`force_init` で拡張し（`force-backend.ts:52`）、`step` で gather ＋ `force_step` ＋ stale ビュー更新を行う（`force-backend.ts:65` ＋ `force-backend.ts:37` `viewsStale` — 八分木はステップ途中で線形メモリを拡張しビューをデタッチする可能性がある）。いずれかの時点で失敗すれば `null` を返し呼び出し元は JS 八分木を保持する（`VectoForceLayout.ts:106` ／ `VectoForceLayout.ts:246` フォールバックで `this.tree.build` ＋ `this.tree.force`; アセット URL は `packages/graph3d/src/wasm/asset.ts:22` `forceWasmUrl` で `new URL('./vectojs_force.wasm', import.meta.url)` 経由 — バンドラーセーフな唯一の形式）。`.wasm` は gitignore され `tsup.config.ts:40` で公開時にコピーされる。まさに `vectojs-core-rs` と同様である。

ビットパリティは譲れない: Rust ツリーは JS ツリーと同じ `f64` 質量中心と `f64` 反発積分を計算しなければならない（位置と速度は両側で `f32` のまま）。`VectoForceLayout.ts:58` はこれを明記する: 「将来の Rust／WASM カーネル … はしたがって f64 累積を正確に再現しなければならない。」テストは 2 つのパスをビット単位で差分テストする（`packages/graph3d/test/VectoForceLayout.wasm.test.ts:6` ストリーミング／同期有効化と `VectoForceLayout.ts:618` のスペースコピーを参照）。

ビルドはボス 08 の罠と同じである: `crates/vectojs-force-rs/build.sh` で `RUSTFLAGS="-C target-cpu=generic -C target-feature=+simd128 -C linker=rust-lld"`; 素の `cargo build --target wasm32-unknown-unknown` は `~/.cargo/config.toml` のホストフラグを漏らしリンクを壊す。

## 8. ベンチマーク手法 — 何が引用可能か

`benchmarks/graph-layout/entry.ts:1` ヘッダーが権威である。`benchmarks/run-browsers.sh`（`benchmarks/run-browsers.sh:4` で `bun runner/cli.ts` のラッパー）のみが引用可能な数値を生成する — それは**実際のヘッドありブラウザを専用の Hyprland ワークスペース、フォーカスされたウィンドウ、実際の GPU**で駆動する（ワークスペース `AGENTS.md` ベンチマーク契約どおり）。`benchmarks/debug-page.ts` と `scripts/benchmark.ts` はヘッドレス（`--disable-gpu`）— リグレッションのトリップワイヤーとデバッグ補助であり、引用ではない。

### 8.1 マトリクス、予算、そして settles の意味

**予算化されたデフォルト**（CTX-0517、2026-08-26 — `entry.ts:4`）は:

- `COUNTS = 100,1000,3000`（`entry.ts:48` — 1000 の対数近傍として 500 を削除; 3000 は `#559` ベースラインとして保持）
- `TICKS = 30` 1 tick ごとの通常サンプル（`entry.ts:49`）
- `TRIALS = 3`（`entry.ts:50` — `#559` ベースラインプロトコル; スイートレベルの繰り返しは `run-browsers.sh --iterations` 経由）
- `SETTLE_CAP = 120`（`entry.ts:51` — 自然収束の約 285–300 tick ではなく、追加後の最初の 120 tick; `settleCappedTrials == TRIALS` は設計どおり、2026-08-25 スイープどおり）
- `APPEND_NODES = 50`（`entry.ts:57`）、`WARMUP_TICKS = 5`（`entry.ts:58`）、`POST_TOPOLOGY_ALPHA = 1`（`entry.ts:59`）

**旧デフォルト**（`counts 100,500,1000,3000 × 2 workloads × 4 arms × 6 trials × cap 500`）は各 settle tick が約 4 ms のタイマークランプされた `setTimeout(0)` yield（`entry.ts:301` `yieldToPaint`）を払い、settle が約 300 tick まで走るため、エンジンごとに 1500 秒超と予測された — 現在はヘッドレス Chrome でエンベロープごとに約 150 秒（`entry.ts:25`）。

**ワークロード**は `star-hub` と `mixed-sparse`（`entry.ts:61`）であり、グラフは `entry.ts:226` ／ `entry.ts:252` で構築され（スタックを避けるため `sqrt` 螺旋上に位置を seed）、追加ペイロードは 50 ノード＋ハブまたは優先的＋ランダムリンクを追加する。

**arm** は 4 つ（`entry.ts:599`）:

| arm               | 次元 | 実装               | `appendMode`       | 構築                                                                                                                                                                                                                              |
| ----------------- | ---- | ------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `d3-force-3d`     | 3    | `D3ForceLayout`    | `setGraph-rebuild` | `new D3ForceLayout()`                                                                                                                                                                                                             |
| `vecto-force`     | 3    | `VectoForceLayout` | `setGraph-rebuild` | `new VectoForceLayout()`                                                                                                                                                                                                          |
| `d3-force-2d`     | 2    | ページ内 d3-force  | `appendGraph`      | `D3Force2DLayout` は `entry.ts:78`（charge `300`、`distanceMax 450`、`theta 0.9`、collide `radius+14`）                                                                                                                           |
| `force-layout-2d` | 2    | `ForceLayout2D`    | `appendGraph`      | `new ForceLayout2D({repulsion: charge, collisionRadius: radius+14, linkDistance accessor, linkStrength 0.42, center 0.016, velocityDecay 0.64, alphaDecay 0.024, repulsionDistanceMax 450, theta 0.9, seed 7})` は `entry.ts:625` |

arm の順序は `(workloadIndex, countIndex)` ごとに**決定論的にローテーション**される（`entry.ts:647` `rotatedArms`）ため、エンジン／エージェント順序がカウントにバイアスをかけない。

### 8.2 何が測定されるか

arm／ワークロード／カウントごとに 3 つの観測値があり、すべて `performance.now()` と `setTimeout(0)` タスク境界の背後で long-task エントリがマージしないようにする（`entry.ts:330` `captureLongTasks` は `PerformanceObserver 'longtask'` 経由）:

- **`benchTicks`**（`entry.ts:501`）— 新鮮に再加熱されたグラフからの `TICKS` 回の通常 `step()` 呼び出し: `median/p95/max`（`entry.ts:292` `summarize` は `_shared/stats.ts` からの `median`／`percentile` 経由）。
- **`benchAppend`**（`entry.ts:526`）— トポロジーミューテーションのみ（クローンされたペイロードは `entry.ts:346` `prepareAppendPayloads` で事前に構築されるためクローンが `appendGraph` を優遇しない）; その後、最初の追加後 tick の前と settling ループのたびに明示的な `reheat(POST_TOPOLOGY_ALPHA)`（`entry.ts:559`）。`append` median／p95、`firstTick` median／p95、`settleTotal` median／p95（最大 `SETTLE_CAP` tick）、`settleTicks` median／p95、`settleCappedTrials`、そして `maxStepMs`（すべてのフェーズを跨ぐ最大の単一 `step()`、`entry.ts:679`）を返す。
- **`observeLiveAppendMemory`**（`entry.ts:398`）— 即時の before／after 読み取りにまたがって保持される 1 つの専用のウォームなライブレイアウト、ペイロード作成と破棄は差分の**外側**（`entry.ts:415` コメント）。`performance.measureUserAgentSpecificMemory` を優先する（`entry.ts:444`、`UA_MEMORY_TIMEOUT_MS = 1250` は `entry.ts:55` で `entry.ts:353` `readUaMemoryWithTimeout` 経由）; 単一のタイムアウト失敗でその実行の残りの UA 読み取りは無効化される（`entry.ts:454` `uaMemoryDisabledReason`）; ヒープフォールバック（`performance.memory.usedJSHeapSize` は `entry.ts:465`）で完全な観測を再試行する。両方とも**ノイジーな観測であり、保持メモリやバックエンド選択の証拠ではない**（`entry.ts:740` caveats）。未サポートは理由付きで `status: 'unsupported'` として報告される。

あわせて報告される: long-task キャプチャごとの `longTaskMaxDurationMs`（`entry.ts:678`）、`longtask` インターバルが測定された `[started,ended]` をカバーするときのみカウントされる（`entry.ts:326` `include`）。

### 8.3 ヘッドありランナー契約

2026-08-02 時点で 240 Hz パネルは Hyprland `eDP-1 2560x1600` スケール 1.6 である。3 つのケイデンスの罠があらゆる数値を静かに無効化する: フォーカスされていない Chrome は約 60 Hz に落ちる、Firefox は `layout.frame_rate` を必要としフォーカスされていてもデフォルトで 60 Hz である（手動駆動の Firefox は 4 倍間違う）、そしてちょうど 250 の `refreshHz` は 240 Hz パネル上の中央値アーティファクトである。ハーネス（`benchmarks/_shared/server.ts`、`runner.ts`、`loaf.ts`）は `validateEnvironment`、スタベーション検出、クロスラン集計を行い、コミット＋ホスト CPU／GPU／ドライバを運ぶ（ページはこれらを見ることができない）。各ベンチマークが所有するのは `entry.ts` ＋ 3 行の `build.ts`（`benchmarks/graph-layout/build.ts:11` が `_shared/build.ts` に委譲）のみである; サーバー／バンドラーは `_shared/` にある — 重複させないこと。

**リフレッシュレートをハードコードしないこと** — `calibrateRefreshRate()` を呼び、フレームごとの数値の横に `refreshHz` を報告すること。両方のエンジンを引用すること（V8 と SpiderMonkey は乖離する）。

### 8.4 ベースラインスナップショット

500 ノードでの**完全な N=7 ベースライン**（`benchmarks/graph-layout/README.md:44`、実行 `20260820T135641Z-1a6d54`、Chrome `240.04 Hz` ／ Firefox `240.64 Hz`）は、ヘッドあり予算の下で最後に完全に反復された完全なマトリクスである（1000 ノードと 3000 ノードの完全なマトリクスは `entry.ts` デフォルトでタイムアウトした — `README.md:11` と `README.md:28` を参照）。代表的な settle 中央値（500 ノード、`TICKS 30`、`TRIALS 1`、`SETTLE_CAP 500`、両ワークロード）はその README にある; 上記の削減された予算化デフォルトはエンジンごとのコスト（約 150 秒）についてそれを置き換える。結果は `benchmarks/graph-layout/results/`（gitignore）配下に保持し、貼り付けた中央値ではなくランナーの履歴 ID で識別すること。

## 9. d3-force 移行、インタラクション、カリング

**d3-force**（`d3-force`／`d3-force-3d`）から `ForceLayout2D`／`VectoForceLayout` への**移行はリネームではない**。`benchmarks/graph-layout/entry.ts:745` のベンチ caveat は重要である: 「2D 行は … 異なる力の法則を比較する: `ForceLayout2D` は逆二乗反発と等しい free／free 衝突 share を使う; `d3-force` は逆距離反発と半径二乗衝突 share を使う。比率は等価なカーネル測定ではなく実装レベルのワークロード比較として扱うこと。」

移行すべき具体的な差分:

- **反発則:** `ForceLayout2D` は `−charge / d³ * (dx,dy)`（`BarnesHutQuadtree.ts:134` `factor = -charge*invD/d²`）、すなわち力の大きさで逆二乗である; d3 の `forceManyBody` は逆距離（`strength / d`）である。絶対数値は比較できない — `repulsion`／`chargeStrength` をコピーするのではなく再チューニングすること。
- **カットオフ意味論:** `ForceLayout2D` は集約の charge 中心を `repulsionDistanceMax` に対してテストする（`BarnesHutQuadtree.ts:98` `nearestDistanceSquared` ＋ `maxDistanceSquared` 事前テスト）、d3 の many-body カットオフと一致する; `theta: 0` ではカットオフは点ごとに厳密である（`types.ts:59` ドキュメント）。`Infinity`／非有限はそれを無効化する — `0` は早期リターンで**静かに**無効化するため、`finiteOr` は `ForceLayout2D.ts:91` で非正を `Infinity` にマップする。
- **リンク同一性:** `ForceLayout2D` は `linkIdentity`（`ForceLayout2D.ts:826`）経由で有向 `(source,target,id)` で重複排除し、ミューテート前にダングリング／自己リンクで throw する; d3 はリンクオブジェクト上に生の文字列 id を保持し、エディタの `duplicate-link` ガードはさらに厳格である（`ForceLayout2D.ts:387` の乖離注記）。永続化されたグラフを移行するときはまず `id` フィールドを正規化すること。
- **ピンアドレス指定:** §6 でカバー — `ForceLayout2D` は `NodeId` で、graph3d の `GraphLayout` はインデックスで。`removeNodes` の後にインデックスをキャプチャするドラッグ to ピンハンドラは 2D 側で再解決しなければならない。
- **Theta:** 範囲と効果は同一 — `0` = 厳密 $O(N^2)$、大きいほど高速／粗い（`types.ts:57`、`VectoForceLayout.ts:28`）。デフォルト `0.9` はスタック間で似た感触になるようチューニングされているが、四分木と八分木の間でビット同一ではない。

**インタラクションと可視性**は物理 tick の外側だが大規模では高価である。`packages/graph3d/src/GraphInteraction.ts:1`（`GraphInteraction`）は Three.js レイキャスターのヒットをホバー／選択／ドラッグ to ピンのために `nodeIndex` にマッピングし、通常のホバーデバウンスを行う; `Graph3D.ts:1`（`Graph3D`）はグラフをインスタンスレンダリングし画面外をカリングする。どちらもレイアウトを置き換えない — それらは `step()` の後に `positions` を消費する。3000 ノードではレンダラーがレイアウトではなくフレームボトルネックになることが多い（`benchmarks/graph3d-frame/entry.ts:1` フレームコストハーネス vs `benchmarks/graph-layout/entry.ts:1` 物理マトリクス — 2 つのハーネスを区別しておくこと）。キャンバス `Scene` ホスト（Three.js ではない）では `packages/core/src/tree/Scene.ts:1` カリングが同じ仕事をする; graph-layout 自体は決してカリングしない。

## 10. チューニングと罠

スタックによりピンは異なる（`ForceLayout2D` は ID で、graph3d はインデックスで — `ForceLayout2D.ts:387`）; 移植するときは変換すること。`repulsionDistanceMax = 0` は反発全体を無効化する（`BarnesHutQuadtree.ts:77` 早期リターン）— 非有限が意図された「カットオフなし」である（`ForceLayout2D.ts:91`）。`alphaDecay = 0` は `0.0228` にフォールバックする。さもなければ settle ループは決して終了しない（`ForceLayout2D.ts:95`）。非有限またはホストに漏れた `RUSTFLAGS` は WASM ビルドまたはそのビットパリティを壊す（チューニングされた CPU 上での `fma`、`crates/vectojs-force-rs/build.sh:8`）; `just wasm` を使うこと。階層スパンサイズのバグ（`BarnesHutQuadtree.ts:237`）— オフセットテーブルを点数ではなく階層スパンでサイズ決めしないと、半径が `f32` の約 280 階層を跨ぐときにカウンティングソートのインクリメントが静かに落ちる。`force_init` 拡張後のビュー剥離（`force-backend.ts:37` `viewsStale`）はすべての `force_step` の後に型付き配列ビューを再検証しなければならない。

この調査で見つかった追加の地雷:

- **2D で負の反発はクランプされ、サポートされない。** `ForceLayout2D` は `repulsion` を `>=0` にクランプする（`ForceLayout2D.ts:629`／`ForceLayout2D.ts:761`）かつ `BarnesHutQuadtree.ts:109` は `charge<=0` サブツリーをスキップする — さもなければ `BarnesHutQuadtree.ts:507` の `finalize` ガードが引力ノードの charge 中心を誤配置する。D3 の負（引力）charge に相当するものはここにはない; 許可する前に両方のガードを再考すること。
- **リンク `id` vs エンドポイントアドレス指定。** `removeLinks` は素の `LinkId` が現れたときだけ遅延的に `linksByIdKey` マップを構築する（`ForceLayout2D.ts:270`）、以前のアイテムごとの `O(items×L)` 走査を置き換えた。保存されたものと異なる `id` を持つ完全な `GraphLink` オブジェクトを渡しても一致しない — 同一性はシリアライズされたトリプルであり、オブジェクト同一性ではない。
- **`positions` ビューエイリアシング。** `refreshPositionView` は同じ `ArrayBuffer` 上の `subarray` を返す（`ForceLayout2D.ts:749`）。`ensureNodeCapacity` や `removeNodes`（`ForceLayout2D.ts:857` でバッファを `resize` する）を跨いで参照を保持すると、長さ 0 のデタッチされたビューが残る。すべてのミューテーションの後に `layout.positions` を再読み込みすること。
- **`forge/baselines/graph-layout*` はまだない。** `benchmarks/graph-layout/results/` は gitignore され、チェックインされた `forge/baselines/graph-layout.json` はない — §8 のすべての主張は引用ホスト上で再測定されなければならない。`benchmarks/graph-layout/README.md:44` の 500 ノード N=7 の知見はホスト固有のスナップショットであり、ポータブルなベースラインファイルではない。
- **`crates/vectojs-force-rs` にはちょうど 1 つのビルド成果物がある。** `build.sh` は `packages/graph3d/src/wasm/vectojs_force.wasm` を排出し `tsup` がそれを `dist/wasm/` にコピーする（`packages/graph3d/tsup.config.ts:40`）。2 つ目のクレートや共有 WASM パッケージは決してない — 3 つ目のコンシューマが現れるまで（`force-backend.ts:12` の `DEC-0081`）、ローカルに保つこと。
- **差分オラクル規律。** 3D パスの `VectoForceLayout` JS 八分木は**永続的な**オラクルである; `crates/vectojs-force-rs/src/lib.rs:1` の Rust カーネルは `f64` 累積でビット同一のままでなければならない（位置は両側で `f32`）。`jitter_for`／`jitterFor`／`mulberry32` について `VectoForceLayout.ts:606`、`BarnesHutQuadtree.ts:610`、`lib.rs:83` を grep すること — 一方への変更が他方に反映されなければ差分失敗である。`measurePhases` オプトイン（`VectoForceLayout.ts:45`）はプロファイリングがオフのときにホットパスにコストをかけずにオラクルを測定可能に保つ。

新しい力を追加するときは、まず JS オラクルを書くこと（`VectoForceLayout.ts:232` `tick` 構造）、演算順序と `Math.min/Math.max` の NaN 意味論を保つこと（`BarnesHutQuadtree.ts:632` `distanceToCellSquared` 全順序コメントを参照）、そして WASM パスを `measurePhases`（`VectoForceLayout.ts:45` オプトイン `tickPhases: [octree, force, link, integrate]` wall-ms）の背後にゲートして、プロファイリングがオフのときにホットパスが何も払わないようにすること。

## 11. テスト、差分オラクル、そして実際に壊れた経緯

3 つのテストスイートが 2D 側をカバーする（`packages/graph-layout/test/BarnesHutQuadtree.test.ts:1` 四分木近似 vs 厳密、`packages/graph-layout/test/ForceLayout2D.test.ts:1` `setGraph`／`appendGraph`／`removeNodes`／`removeLinks`／`updateLinks`／ピン／alpha、`packages/graph-layout/test/ForceLayout2D.linkMutations.test.ts:1` 重複排除／次数バイアス／リンク share）。3D 側は `packages/graph3d/test/VectoForceLayout.wasm.test.ts:1`（JS vs WASM ビットパリティ: ストリーミング、同期、不正 URL でのフォールバックは `VectoForceLayout.wasm.test.ts:123` `file:///nonexistent` → `false`）を追加する。

それらが何を守り、以前に何が痛かったか — レビューチェックリストとして読むこと:

- **ビルド前にサニタイズ。** `positionStorage` に残った `NaN` 位置は四分木境界を汚染する（`minX = NaN` → `size = NaN`）。`sanitizeState` は `ForceLayout2D.ts:752` `toF32`＋ピン上書きに存在する。構造化 JSON からの `x: NaN` で一度起きたためである。そのループを決して削除しないこと。
- **ゼロ距離フロア。** `BarnesHutQuadtree.ts:132`／`BarnesHutQuadtree.ts:154` と `VectoForceLayout.ts:727` の `1e-6` フロアなしでは、同じセル内の 2 つの重なり点が `factor = -m/0 = ±Infinity` → `NaN` 速度を生み、以降のすべての tick に感染する。`BarnesHutQuadtree.ts:610`／`ForceLayout2D.ts:878` の決定論的角度が push を再現可能にする。
- **ピンされた share の漏れ。** 一方のエンドポイントがピンされたときに `springShare` フォールバックを忘れる（`ForceLayout2D.ts:846` ／ `BarnesHutQuadtree.ts:406` で固定 `0` または `1`）と、ピンされたノードが他方のエンドポイントの速度で引っ張られる。履歴: 初期の 3D ピンはリンクバネが依然としてピンされた座標を積分していたためジッターした。
- **Alpha が min に到達しない。** `alphaDecay: 0` を渡すと `alpha` が永遠に `1` のままになった — ホストループ `while(layout.step())` は決して終了しなかった。`ForceLayout2D.ts:95` ／ `VectoForceLayout.ts:117` で `0` → `0.0228` にマッピングするガードは、計算されたオプションが `0` を生成したライブインシデントに由来する。
- **メモリ観測の誤読。** `entry.ts:398` の `liveAppendMemoryObservation` 数値は GC ノイズを伴う**エージェント全体**の観測である（`entry.ts:449` caveat）; それらをバックエンドごとの保持ヒープとして扱うことがグラフベンチマークの最も一般的な誤引用である。実行は 1 回のタイムアウトの後に UA 固有読み取りを無効化し（`entry.ts:454`）、`usedJSHeapSize` で再試行する — ソースを途中で切り替えた実行とそうでない実行を比較することは有効ではない。

レビュア向け複雑さサマリー:

| フェーズ               | 2D                                                             | 3D                                      | 場所                                                   |
| ---------------------- | -------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------ |
| ツリー構築             | $O(N \log N)$ 四分木                                           | $O(N \log N)$ 八分木                    | `BarnesHutQuadtree.ts:36` ／ `VectoForceLayout.ts:414` |
| 反発                   | 平均 $O(N \log N)$、`theta=0` で最悪 $O(N^2)$                  | 同じ                                    | `ForceLayout2D.ts:484` ／ `VectoForceLayout.ts:259`    |
| リンク                 | $O(L)$                                                         | $O(L)$                                  | `ForceLayout2D.ts:499` ／ `VectoForceLayout.ts:274`    |
| 衝突                   | 階層化グリッドで平均 $O(N)$; 偏った半径で階層なしなら $O(N^2)$ | —                                       | `BarnesHutQuadtree.ts:172`                             |
| レイアウトごとのメモリ | ~6×N f32 ＋ リンク ＋ ツリー ~4N ノード                        | ~7×N f32 ＋ リンク ＋ 八分木 ~8N ノード | `ForceLayout2D.ts:672` ／ `VectoForceLayout.ts:445`    |

## 12. 再現性 — 引用可能なコマンド

```bash
# WASM 力学カーネルをビルド（WASM パスの前に必須）:
just wasm                         # または crates/vectojs-force-rs/build.sh
# オプション: JS オラクルのみを検証（Rust 不要）:
just test-pkg graph-layout && just test-pkg graph3d

# ヘッドあり物理マトリクス — 引用可能なパス（Hyprland ＋ ヘッドあり Chrome/Firefox が必要）:
./benchmarks/run-browsers.sh graph-layout 8272 --viewport 1280x720 \
  --param counts=100,1000,3000 --param ticks=30 --param trials=3 \
  --param settleCap=120 chrome firefox
# 完全収束バリアント（古い 500-tick settle を再現、明示的に予算化）:
./benchmarks/run-browsers.sh graph-layout 8273 --viewport 1280x720 \
  --param counts=100,500,1000,3000 --param ticks=30 --param trials=6 \
  --param settleCap=500 chrome firefox   # 1500 秒超を見込む — 予算を確保すること

# 3D フレームコスト（レンダラーであり物理ではない — 混同しないこと）:
./benchmarks/run-browsers.sh graph3d-frame 8274 --viewport 1280x720 chrome firefox
```

`calibrateRefreshRate()` からの `refreshHz`、両エンジン、コミット SHA、ホスト CPU／GPU／ドライバ（ページはこれらを見ることができない — `benchmarks/_shared/server.ts:1` のハーネスが取得する）を報告すること。生 JSON は `benchmarks/graph-layout/results/`（gitignore）配下に保持し、その履歴 ID を引用し、貼り付けた中央値は引用しないこと。

## 付録 — 次に読むべき場所

| 目的                                                   | 開始                                                                                      | 次に                                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 新しいデータセット用に 2D レイアウトをチューニングする | `packages/graph-layout/src/types.ts:42` ＋ `ForceLayout2D.ts:79` コンストラクタデフォルト | `ForceLayout2D.ts:480` tick フェーズ → `BarnesHutQuadtree.ts:8` インデックス           |
| 新しい力を追加する（例: radial）                       | `VectoForceLayout.ts:232` `tick` 構造をテンプレートとして                                 | `crates/vectojs-force-rs/src/lib.rs:10` スコープ注記 — octree 力のみがカーネルに属する |
| ナレッジグラフをページングする                         | `knowledge-graph/src/KnowledgeGraphModel.ts:62` ライフサイクル                            | `FixedZLayout.ts:10` 3D レイアウトの 2D 投影が必要な場合                               |
| 数値を引用する                                         | `benchmarks/graph-layout/entry.ts:1` ヘッダー ＋ `benchmarks/graph-layout/README.md:44`   | `benchmarks/_shared/stats.ts:1` `median`／`percentile` 意味論                          |

---

_次: **ボス 12 — DevTools**（ピクセルを指してどの Entity がそれを所有し、なぜなのかを読み戻せるランタイムインスペクタ）。前: **ボス 10 — ビデオ書き出し**（決定論的固定ステップキャプチャ）。シリーズ: 00 Overview → 01 Selection → … → 11 Graph Layout（本ドキュメント）→ 12 DevTools → 99 Synthesis。_
