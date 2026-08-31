+++
title = "14 — レスポンシブ・レイアウトとインタラクション — ビューポートと入力への適応"
description = "制約としてのビューポート: リサイズ／ズームのリフロー、Stack／Flow レイアウトパス、パネルダッシュボード、VirtualList ウィンドウ、ScrollView 物理演算、ResizablePanel ハンドル、オーバーレイ配置、ホバー／フォーカス状態 — すべて VectoJS の canvas ネイティブな世界で。"
weight = 34
+++

# 14 — レスポンシブ・レイアウトとインタラクション — ビューポートと入力への適応

> DOM ブラウザでは、レスポンシブ・レイアウトは CSS である: メディアクエリ、flexbox、grid、そしてエンジンが無料で提供するスクロールコンテナ。VectoJS には CSS エンジンはない — すべてのピクセルは単一の `<canvas>` 上の保持された Entity ツリーに対する算術である。ビューポートはキャッシュを無効化する単なる数値であり、スクロールオフセットはスプリング駆動の `y` であり、オーバーレイは明示的な配置計算を伴い `overlayRoot` に再親化された Entity である。本ドキュメントは、ウィンドウがリサイズされたとき、ユーザーがズームしたとき、あるいは指がパネル境界をドラッグしたときに、それらの数値がどのように一貫性を保つかを示す。

- **学べること**: `Scene.resize()` がレンダラーのバッキングストア、投影ティア、レイアウトパスを通じてビューポート変更をどう伝播させるか、`Stack`／`Flow`／`Card`／`PanelGroup` が CSS エンジンなしでどうレスポンシブなダッシュボードを構成するか、`VirtualList` がどのように 10k 行を約 15 個のマウントされた Entity にウィンドウするか、`ScrollView` のスプリング物理演算、`ResizablePanel` のドラッグハンドル、`Overlay` の配置反転、`Button` のホバー／フォーカスリングがどのようにインタラクションループを閉じるか — すべて file:line の領収書付きで。
- **学べないこと**: VMT ライフサイクル／dirty／イベントディスパッチ（ボス 06）、テキスト整形と行分割（ボス 02）、セマンティック投影（ボス 03）、あるいはストリーミング Markdown 差分（ボス 04）。

## 1. ビューポートはコンテナではなく制約である

### 1.1 Scene.resize() — 唯一の真実の源

`Scene.resize(width, height)` は `packages/core/src/tree/Scene.ts:6381` にあるビューポート境界である:

```ts
public resize(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) {
    if (!this.hasWarnedInvalidResize) console.warn(`...`); return;
  }
  this.width = width; this.height = height;
  this.contentFontEpoch++; this.contentViewportEpoch++;
  (this.renderer as any).resize(width, height);
  if (this.pointRenderer) { this.pointRenderer.resize(width, height); }
  if (this.gpuCanvas) this.sizeGpuCanvas(this.gpuCanvas, width, height);
  this.markDirty();
}
```

5 つのことが不可分に起きる: 論理 `width`／`height` の更新、2 つの世代カウンタのバンプ、すべてのバッキングストアのリサイズ、そしてフレームの dirty 化。世代カウンタが鍵である — `contentFontEpoch` はテキスト再キャリブレーションを強制し（ブラウザズームは同じ CSS フォントでも Range ジオメトリを変える）、`contentViewportEpoch` はいずれも移動させずにすべてのコンテンツブロックを再ティアリングする（`Scene.ts:6415`、`Scene.ts:6420`）。`width`／`height` だけを変えたリサイズでは、すべてのブロックが古いビューポート用に構築された DOM を保持したままになる。

不正な寸法はクランプされるのではなく拒否される（`Scene.ts:6382`）: canvas 要素が `0` にクランプする一方で `-10` を保存すると、カリングと a11y ジオメトリが不一致になる。警告はラッチされる（`hasWarnedInvalidResize` は `Scene.ts:2113`）。`ResizeObserver` 駆動の呼び出し元がドラッグフレームごとにスパムするためである。

### 1.2 誰が resize() を呼ぶのか

2 つのパスがあり、`disableWindowResize`（`Scene.ts:268`、`Scene.ts:2051`）で分岐する:

| モード                                                     | オブザーバー                                                                                        | ハンドラ                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| ウィンドウ充填（`disableWindowResize: false`、デフォルト） | `window` `resize` リスナー（`Scene.ts:2968`）＋ DPR メディアクエリ／ウォッチャー（`Scene.ts:3052`） | `resize(window.innerWidth, window.innerHeight)`             |
| 埋め込み（`disableWindowResize: true`）                    | `canvas` 上の `ResizeObserver`（`Scene.ts:3082`）                                                   | `resize(entry.contentRect.width, entry.contentRect.height)` |

加えて、カスタムコンテナ用の明示的な呼び出し元駆動 `scene.resize(w, h)` — `ResizeObserver` が利用できないときの唯一のパス（`Scene.ts:2740` ガード）。DPR スケーリングは直交する: `maxDPR`（`Scene.ts:287`）はバッキングストア倍率を上限付けするため、DPR-3 ディスプレイは 3 倍ではなく 2 倍でレンダリングされる（`論理サイズ × dpr²` コスト、`Scene.ts:276`）。

### 1.3 ズームはリサイズである

ブラウザズームは `window.resize` を発火し `devicePixelRatio` を変える。Scene の DPR ウォッチャー（`Scene.ts:1435` `dprMediaQuery`、`Scene.ts:1441` `dprPollInterval`）は `resize(this.width, this.height)` を再呼び出す — 同じ論理サイズ、新しいバッキングストアスケール — そのパスでの `contentFontEpoch++` が Firefox の分数スケールでの Range ジオメトリドリフトを処理する（`Scene.ts:6410` コメント）。

## 2. レイアウトコンテナ — stack からダッシュボードまで

### 2.1 Stack — プリミティブ

`Stack` は `packages/ui/src/Stack.ts:59` にある VectoJS の flexbox である: 1 軸上で逐次、クロス軸は `align: 'start'|'center'|'end'`（`Stack.ts:17`）、`gap`（`Stack.ts:14`）、任意の `wrap` と `maxWidth`／`maxHeight`（`Stack.ts:19`）、そして残りを埋めるレイアウト用の `fillTarget`（`Stack.ts:42`）。

`layout()` は `Stack.ts:303` にある 2 パスアルゴリズムである:

- **パス 1 — グルーピング**（`Stack.ts:325`）: `wrap` が true のとき、メイン軸に沿って子を走査し、`currentMain + gap + childMain > limit` のたびに新しい行を切る。そうでなければ 1 行がすべての子を保持する。
- **パス 1.5 — fill**（`Stack.ts:349`）: `fillTarget` が設定され wrap がオフのとき、最後の子を `children + gaps == fillTarget` になるよう引き伸ばす — コンテンツサイズでフロアされ、決して縮小しない。
- **パス 2 — 配置**（`Stack.ts:371`）: 各行について `lineCross`／`lineMain` を計算し、その後クロス軸アラインメントオフセット（`Stack.ts:388`）で `x`／`y` を割り当てる。

`Stack` は純粋な構造コンテナである — `render()` は何も描画しない（`Stack.ts:443`）、子だけがペイントする。自身の `width`／`height` はレイアウトされたコンテンツにサイズ合わせされるため、カリングが可能になる。`getLayoutControlledProperties()` は `Stack.ts:163` で `['x','y']` を返す — 子への書き込みは次のレイアウトで戻される。

ストリーミング追加時の $O(n)$ フルレイアウトを避ける 2 つの $O(1)$ 高速パス（`Stack.ts:167` `add()`、`Stack.ts:257` `appendFastWrap()`）:

- `appendFast()`（`Stack.ts:231`）— 非 wrap、`align: 'start'`: 単一の新しい子を `height + gap`（垂直）または `width + gap`（水平）に配置し、コンテナのクロスサイズを拡大する。start アラインメントの下では以前の子は影響を受けない。
- `appendFastWrap()`（`Stack.ts:257`）— wrap ＋ `align: 'start'`: 現在の行に配置するか新しい行を開始し、最後の行の状態の 4 つのスカラー（`Stack.ts:95` `wrapLineMain/Cross/PriorCross/MaxMain`）のみを使い、再走査しない。

どちらも `align !== 'start'`、`fillTarget` が設定されている、または `remove()`（`Stack.ts:184`）でセットされた `fastAppendDirty` のときは `layout()` にフォールバックする。

`add()`／`remove()` なしで成長するストリーミングテキストでは、`resizeLastChild(child)` は `Stack.ts:210` でインプレースな最後の子の成長を `height = child.y + child.height` ／ `width = max(width, child.width)` として扱う — 子のクロスサイズが成長するときのみ有効であり、縮小するときは無効である。

### 2.2 Flow — チップ行を無料で

`Flow` は `packages/ui/src/Flow.ts:19` にあり 1 行である:

```ts
export class Flow extends Stack {
  constructor(opts: FlowOptions = {}) {
    super({ ...opts, direction: opts.direction ?? 'horizontal', wrap: true });
  }
}
```

### 2.3 Card — 角丸パネル

`Card` は `packages/ui/src/Card.ts:49` にある固定サイズの角丸ボックス（`Card.ts:123` `roundRect` ＋ `fill`／`stroke`）。`label` があれば `role="group"` を投影する（`Card.ts:81`）; `onClick` があればクリック可能になる — a11y 投影が常にアクセス可能な名前を得られるよう `label` を要求する（`Card.ts:71` はそうでなければ throw し、`vectojs-docs/forge/findings/ui-components.md:43` 起源）。`setContent(entity, fit?)` は `Card.ts:92` で `Panel.setContent` を反映する — デフォルトでコンテンツは `update()`（`Card.ts:118`）経由で Card の `width`／`height` を追跡する。

### 2.4 PanelGroup — ダッシュボードの格子

`PanelGroup` は `packages/ui/src/ResizablePanel.ts:213` で、ドラッグ可能な `PanelResizeHandle` ディバイダで利用可能な空間を `Panel` の子に分割する:

```text
PanelGroup { direction, width, height }
  ├── Panel { minSize, defaultSize, clipChildren: true }  — setContent(entity, fit?)
  ├── PanelResizeHandle { width: handleSize, interactive: true }  — ドラッグデルタ → _onResize
  ├── Panel
  └── ...
```

`addPanel()` は `ResizablePanel.ts:237` で最初の後のすべてのパネルの前にハンドルを自動挿入する（`ResizablePanel.ts:239` `new PanelResizeHandle`）。`resize(w, h)` は `ResizablePanel.ts:258` でサイズを比例的に再配分し（`ResizablePanel.ts:267` `(size / basis) * avail`）、その後正規化する（`ResizablePanel.ts:309` `minSize`／`avail` にクランプ）。`_layout()` は `ResizablePanel.ts:343` でパネルとハンドルに交互に `x/y/width/height` を割り当てる — 水平グループのパネルは `width = sizes[i], height = cross`; ハンドルは `width = handleSize, height = cross` である。

`Panel.setContent()` は `ResizablePanel.ts:164` でデフォルトでコンテンツをパネルのボックスにサイズ合わせしたままにする（`fit: true`、`ResizablePanel.ts:7` `FitContentOptions`）、`Panel.update()`（`ResizablePanel.ts:190`）から毎フレーム再適用される — `Entity.width/height` がセッターフックのないプレーンフィールドであるため必要である（`ResizablePanel.ts:158` 契約注記、`vectojs-docs/forge/findings/ui-components.md:15` 起源、`@vectojs/ui@1.11.0` で修正）。

`PanelGroup` のネストが合成する: `Panel` のコンテンツとしての `PanelGroup`（`Panel.setContent(innerGroup)`）はネストされた分割を生む — 内部グループの `update()` がそれを外部パネルにサイズ合わせしたままにするため、追加の配線は不要である。

## 3. VirtualList — 10k 行を約 15 Entity にウィンドウする

### 3.1 Fenwick の背骨

`RowHeights` は `packages/ui/src/VirtualList.ts:14` にある行ごとの高さに対する Fenwick（Binary Indexed）ツリー（`VirtualList.ts:17` サイズ `n+1` の `Float64Array`）:

- `total()`（`VirtualList.ts:46`）— すべての行の高さの合計を $O(1)$ で。
- `prefix(i)`（`VirtualList.ts:60`）— 行 `i` の上端の y を $O(\log n)$ で。
- `indexAt(y)`（`VirtualList.ts:71`）— 底が `y` を超える最初の行をバイナリリフティングで $O(\log n)$ で。
- `set(i, h)`（`VirtualList.ts:51`）— 差分伝播を伴う $O(\log n)$ 点更新。

すべての行は `estimatedRowHeight`（`VirtualList.ts:28`）で開始する; `set()` は行がマウントされ計測されたときに推定を置換する。

### 3.2 リコンサイル — 可視ウィンドウのみ

`VirtualList` は `VirtualList.ts:179` で `this._pool: Map<number, Entity>`（`VirtualList.ts:203`）— データ項目ごとではなくマウントされた行インデックスごとに 1 Entity — を保持する。

`_visibleRange()` は `VirtualList.ts:468` で `_scrollY` と `height` から 2 つの `indexAt` 呼び出しで `[start, end]`（両端含む）を導出し、両端で `overscan`（デフォルト 3、`VirtualList.ts:103`）で拡張する。`_reconcile()` は `VirtualList.ts:488` で:

1. 範囲外の Entity をリサイクルする（`VirtualList.ts:494` `super.remove` ＋ `delete`）。
2. 新たに可視になった行をマウントする（`VirtualList.ts:506` `renderItem(item, i)`、`super.add`）。
3. マウント後に計測する（`VirtualList.ts:515` 配置前の `_measureMountedRows` — 配置前に `heightOf(i)` を読むことで PR #509 以前の 1 フレーム古いオフセットを防ぐ）。
4. `y = rowTop(s) + ... - _scrollY` を配置する（`VirtualList.ts:518`）。

`VirtualList.scrollToIndex(i)` ／ `scrollToTop/Bottom` ／ `jumpToBottom` は `VirtualList.ts:342` で `_targetY`／`_scrollY` を再ターゲットする; `jumpToBottom` は即座にスナップする（速度ゼロ）。ストリーミングトランスクリプトで積分器をチャンクごとに再ターゲットしても決して収束しないためである。

### 3.3 成長、同一性、アンカリング

`keyForItem` なしでは `setItems()` は `VirtualList.ts:248` で高さキャッシュをクリアしトップにジャンプする — 置換されたリストでは正しいが、成長するトランスクリプトでは誤りである。`keyForItem`（`VirtualList.ts:117`）ありでは:

- `_heightByKey: Map<string, number>`（`VirtualList.ts:199`）は `setItems` を越えて生存する — 計測された高さはインデックスではなく行のプロパティである（ツリー再構築後にキャッシュから再 seed する `VirtualList.ts:272`）。
- `_rekeyPool()` は `VirtualList.ts:317` でプールされた Entity を高さ読み取りの前に新しいインデックスに移動する — そうしなければ prepend がすべてのエントリを間違った高さで上書きする。
- スクロールアンカリング（`VirtualList.ts:397` `_captureAnchor` ／ `VirtualList.ts:431` `_restoreAnchor`）: 2 つのバリアント — スクロールごとにラッチされた `nearBottom`（`VirtualList.ts:219`）のときは `bottom`（底までの距離、ギャップを保持）、そうでなければ `item`（アンカーされた行キー ＋ 内部オフセット）。すべての行の高さを変えるリサイズでも、アンカーされた行は視覚的に静止したままである。

`_measureMountedRows()` は `VirtualList.ts:540` で毎フレームマウントされたすべての行の `height` をポーリングし、差分を `Fenwick.set` 経由で適用し、アンカリングする — セッターフックなしでマウント後にリサイズする行（ストリーミング Markdown リフロー、直接の `height` 代入）を扱う。

## 4. ScrollView — 1 つのビューポート、1 つのスプリング

`ScrollView` は `packages/ui/src/ScrollView.ts:58` にある非仮想化された counterpart である: 共有スプリングシステム（`ScrollView.ts:90` `content.setTransition({ y: scrollPhysics ?? 'spring' })`）経由で内部 `content` Entity が `y` 上でスライドするクリップされたビューポート（`ScrollView.ts:71` `clipChildren = true`）。

- **ホイール**（`ScrollView.ts:92`）: `deltaMode` 変換（`ScrollView.ts:105` ピクセル／行×16／ページ×ビューポート）、`targetY -= delta`、クランプ、`content.y = targetY` が速度を保持したままスプリングを再ターゲットする。Ctrl+ホイールはブラウザズームに譲るため bail する; 収まるコンテンツ（`maxScroll <= 0`）は bail してデッドストリップを避ける（`ScrollView.ts:95`、#525 を修正）。
- **ポインタドラッグ**（`ScrollView.ts:113`）: `localY` デルタ経由の 1:1 指追跡。
- **クランプ**（`ScrollView.ts:136`）は `clampTarget()` で `targetY ∈ [-maxScroll, 0]` を保つ。`update()` は `ScrollView.ts:219` で防御的に再クランプし、クランプが実際に動いたときのみ `content.y` を再代入する — 無条件の再代入は永遠に完了しない done-driver を生み、アイドルスロットルを破る（`ScrollView.ts:217` コメント）。
- **`scrollToBottom()`**（`ScrollView.ts:163`）はスプリングを再ターゲットするのではなく `jumpTo()`（`ScrollView.ts:79` `setImmediate('y', y)`）経由でスナップする — ストリーミングチャットで呼び出し元が毎秒何度もそれを呼び、スプリングをその速さで再ターゲットすると決して収束せずジッターするためである。
- **`DOCUMENT_SCROLL_PHYSICS`** は `ScrollView.ts:36`（`{ stiffness: 180, damping: 27 }`、ζ ≈ 1.006、`vectojs-docs/forge/findings/ui-components.md:241` 起源）で、ドキュメントスクロール用の臨界減衰プリセットである; デフォルト（`stiffness: 180, damping: 12`、ζ ≈ 0.447）は約 20% オーバーシュートしてバウンスする — リストでは活発だがドキュメントでは誤りである。
- **コンテンツ成長**（`ScrollView.ts:233` `driveVirtualizableContent`）: 毎フレーム子の範囲をポーリングし、異なるときに `updateContentSize()` 経由で再同期する — `add()`／`remove()` なしのストリーミング `setSpans` 成長を扱う。`ScrollVirtualizable.setVisibleRange`（`ScrollView.ts:50` ダックタイプ）は同じフレームで駆動される。

## 5. インタラクションプリミティブ

### 5.1 ResizablePanel ハンドル — シーン空間のデルタ

`PanelResizeHandle` は `packages/ui/src/ResizablePanel.ts:42` でドラッグデルタを**シーン空間**で測る（`ResizablePanel.ts:86` `posOf` は `localX`／`localY` より `sceneX`／`sceneY` を優先）。ハンドルはそれがリサイズするパネルとともに動くため、パネルが成長しハンドルがカーソルの下でスライドしてもローカル座標はほとんど変わらない — シーン座標は安定しており、1px の移動 = 1px のリサイズである（`ResizablePanel.ts:78` コメント、`vectojs-docs/forge/findings/ui-components.md:64` 起源、`@vectojs/ui@1.1.3` で修正）。`hover` は `color` → `hoverColor` を交換する; ハンドルは `pointerdown`／`pointermove`／`pointerup`／`pointerleave` 配線（`ResizablePanel.ts:92`）を持つ `interactive: true` である。

### 5.2 Overlay — ツリーの上に浮かぶコンテンツ

`Overlay` は `packages/ui/src/Overlay.ts:37` で `Tooltip`、`Popover`、`ContextMenu` の基底である:

- `scene.overlayRoot`（`Overlay.ts:168` `scene.overlayRoot.add(this)`）にマウントされる — `clipChildren` の上、常に最前面。
- 配置（`Overlay.ts:14` `OverlayPlacement`: `top|bottom|left|right|auto` に加え `-start/-end` バリアント）は `Overlay.ts:171` の `_position()` で `target.getWorldBounds()` ＋ `placement` ＋ `offset`（デフォルト 6、`Overlay.ts:23`）から計算され、その後 `Overlay.ts:227` の `_placeAt()` 経由で `4px` ビューポートマージンにクランプされる。`auto` は下 vs 上の利用可能な空間に基づいて反転する（`Overlay.ts:180`）。
- `showAtPoint(x, y, source?)` は `Overlay.ts:98` で任意の `source`（Scene またはマウントされた Entity）を受け入れ、オーバーレイ自体が一度もマウントされたことがないときに `scene` を解決する — さもなければ最初の呼び出しで静かに no-op になる（`vectojs-docs/forge/findings/ui-components.md:114` 起源、`@vectojs/ui@1.10.0` で修正）。
- `opacity/scaleX/scaleY` 上の `setTransition`（`Overlay.ts:59` `easeOutQuad` ＋ スプリング）経由の入場と、サブツリーをポインタヒットテストと a11y 投影の両方から隠す `a11yHidden`／`interactive` トグル（`Overlay.ts:149` `hide()` は `detachA11y` も呼ぶ）。
- `Modal` は `packages/ui/src/Modal.ts:25` でこれを基に構築される: 中央に `Card` を持つ全ビューポート背景（`Modal.ts:40` `width = window.innerWidth`、`Modal.ts:39` `a11yFullViewport = true`）は `card.scaleX/scaleY`（`Modal.ts:84` seed 0、`Modal.ts:266` `springTo({scaleX:1,scaleY:1})`）経由でスプリングインし、フォーカストラップと Escape 処理（`Modal.ts:188` `installFocusTrap`）、そして `scene.hideOverlay(this)` の前にアニメーションアウトしフォーカスを復元する `close()`（`Modal.ts:282`）を持つ。

### 5.3 ホバー／フォーカス — canvas フィードバックループ

canvas には `:hover` や `:focus-visible` がない。VectoJS はそれらを Scene が VMT に再ディスパッチする a11y 投影イベントから駆動する:

- **ホバー** — `Button` は `packages/ui/src/Button.ts:97` `on('hover')` ／ `on('pointerleave')` で `hovered` をトグル → `hoverBg`（`Button.ts:11` オプション）で再描画し、`disabled` でゲートされるため無効な affordance が決してアクティブに見えない。`PanelResizeHandle` も `ResizablePanel.ts:111` で `hoverColor` のために同様に行う。
- **フォーカスリング** — `Button.focused` は `packages/ui/src/Button.ts:61` で 2px の `focusColor` リング（`Button.ts:30` デフォルト `#00f0ff`）をストロークする。フラグはシャドウ `<button>` 上の実際の DOM `focus`／`blur` から駆動され、Scene は a11y 要素がフォーカスされたときにそれを emit する — これなしでは canvas リングはキーボードユーザーには決して現れない。
- **キャレット点滅** — `UIComponent.startCaretBlinkWake()` は `packages/ui/src/UIComponent.ts:84` で 500 ms ウェイクアップをスケジュールする（次のフェーズ境界で `markDirty`）。アイドルな `onDemand` シーンでも `Input`／`TextArea` でキャレットが点滅し続ける — フェーズごとに 1 つのタイムアウトでフォーカス中は約 2 renders/s のコストである（`UIComponent.ts:76` コメント）。シーンをフルレートで固定するのと対照的である。
- **フォーカストラップ** — `Modal`（`Modal.ts:188`）と `Overlay` の hide／show は `a11yHidden` と `interactive` を足並み揃えて保つため、隠されたポップオーバーのボタンが Tab 到達可能なままにならない（`vectojs-docs/forge/findings/ui-components.md:391` 起源、2026-08-13 P2 バッチで修正）。

一般的なルール: ブラウザが CSS 擬似クラスから導出するすべてのビジュアル状態は、a11y 投影のライブ DOM イベントから明示的に駆動しなければならず、すべての hide はビジュアルと投影の両方を落とさなければならない。

## 6. CSS エンジンなしのレスポンシブパターン

### 6.1 アプリシェルのためのリサイズカスケード

```ts
// このようなハンドラの 1 つがレスポンシブカスケード全体を所有する:
window.addEventListener('resize', () => {
  const w = window.innerWidth,
    h = window.innerHeight;
  scene.resize(w, h);
  header.width = w;
  header.layout();
  sidebar.height = h - header.height;
  sidebar.layout();
  contentGroup.resize(w - sidebar.width, h - header.height);
});
```

各 `resize()` は 2 つの世代カウンタをバンプし、すべてのバッキングストアが再スケールし、`Stack`／`Flow` は次の `layout()` で再グループ化し、`PanelGroup.resize()` は再配分し、`VirtualList` は `_targetY` をクランプする（`VirtualList.ts:566` `_clamp`）。メディアクエリエンジンはない — アプリがブレークポイントを決め API を呼ぶ。

### 6.2 パネルダッシュボード — ネストされた分割

`PanelGroup` のネスト（`ResizablePanel.ts:206` ドキュメント）は慣用的な IDE／エディタシェルである:

```ts
const outer = new PanelGroup({ direction: 'horizontal', width: W, height: H });
const sidebar = new Panel({ minSize: 160, defaultSize: 0.2 });
const editorGroup = new Panel({ minSize: 300 }); // 内部の垂直分割をホスト

const inner = new PanelGroup({ direction: 'vertical', width: 0, height: 0 });
inner.addPanel(new Panel({ defaultSize: 0.6 })); // エディタ
inner.addPanel(new Panel({ minSize: 120 })); // ターミナル
editorGroup.setContent(inner); // ← Panel.setContent が inner をサイズ合わせしたままにする

outer.addPanel(sidebar).addPanel(editorGroup);
scene.add(outer);
// ウィンドウリサイズ時: outer.resize(newW, newH) — inner は Panel.update() 経由で追従する。
```

`PanelGroup.resize()` の比例スケーリング（`ResizablePanel.ts:265`）が外部グループを扱う; 内部グループは `Panel.update()` の fit 同期経由で再レイアウトされ、明示的な内部 `resize()` 呼び出しは不要である。

### 6.3 ScrollView vs VirtualList — いつウィンドウするか

| 必要性                                             | 使うもの                                                               | なぜ                                                                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| ドキュメント／チャットトランスクリプト、無限の高さ | `ScrollView` ＋ `Stack`                                                | シンプル、スプリングアニメーション、コンテンツ成長ポーリングがストリーミングを扱う                              |
| 100 以上の均一行を持つ長いリスト                   | `VirtualList`                                                          | 約 15 Entity のみがマウントされ、Fenwick スクロール計算は $O(\log n)$、高さはキーで `setItems` を越えて生存する |
| 可変行高さを持つ長いリスト                         | `VirtualList` ＋ `estimatedRowHeight`                                  | 最初のマウント時は推定、計測された高さがそれらを置換しビューポートをアンカーする                                |
| ストリーミングで底にピンされた成長を持つチャット   | `VirtualList` ＋ `jumpToBottom()` または `ScrollView.scrollToBottom()` | スプリング再ターゲットではなくスナップすることでビューポートを静止させ続ける                                    |

### 6.4 スクロールバーの可視性 — `clip-overflow` vs 本物のスクロールバー

VectoJS にはネイティブなスクロールバーウィジェットはない — `ScrollView` と `VirtualList` は自身でクリップしホイール／ドラッグを扱い、a11y シャドウは読み順を保持する。ビジュアルなスクロールバー（DevTools 監査 `clip-overflow` は `packages/devtools/src/audit.ts:51`、 `ScrollView`／`VirtualList`／`Tree`／`Table` では除外）は、親指の `y` が `scrollY ／ maxScroll` を追跡する装飾的な `Rect` である — 別のインタラクティブなターゲットではない。

## 7. 難しい部分 — 領収書付き

| 落とし穴                                                                                 | 場所                                                        | 状態                                                                                 |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| コンテナがコンテンツを決してサイズ合わせしない（`Tabs`／`Panel`／`PanelGroup` チェーン） | `ResizablePanel.ts:164`、`Card.ts:92`、forge 2026-07-10     | 修正済み `@vectojs/ui@1.11.0` — 毎フレーム fit 同期を伴う `setContent(entity, fit?)` |
| カード全体クリックに不可視オーバーレイ Button が必要だった                               | `Card.ts:35`、forge 2026-07-10                              | 修正済み `@vectojs/ui@1.11.0` — `Card({ onClick, label })`                           |
| パネルドラッグがローカル空間デルタを使った（遅れたカーソル）                             | `ResizablePanel.ts:78`、forge 2026-07-10                    | 修正済み `@vectojs/ui@1.1.3` — シーン空間 `sceneX`／`sceneY`                         |
| タブが約 10 タブを越えると薄片に崩れた                                                   | forge 2026-07-10                                            | 修正済み `@vectojs/ui@1.1.3` — 固定 `tabWidth` ＋ オーバーフロースクロール           |
| タブが NEXT タブのラベルのすぐ隣で引き伸ばされる                                         | `Tabs._tabW()`、forge 2026-07-16                            | 修正済み `@vectojs/ui@1.9.4` — `tabWidth` は最大であり、余剰は空である               |
| Overlay.showAtPoint が最初のマウントの前に静かに no-op になる                            | `Overlay.ts:98`、forge 2026-07-17                           | 修正済み `@vectojs/ui@1.10.0` — シーン解決用の `source` 引数                         |
| Stack.add() がストリーミングで $O(n^2)$                                                  | `Stack.ts:167`、`Flow.ts:19`、forge 2026-07-19              | 修正済み `@vectojs/ui@1.11.4` — `appendFast`／`appendFastWrap`                       |
| ScrollView デフォルトスプリングが不足減衰（5 回反転、801 ms）                            | `ScrollView.ts:14`、forge 2026-08-02                        | 修正済み `@vectojs/ui` #322 — `scrollPhysics` ＋ `DOCUMENT_SCROLL_PHYSICS`           |
| VirtualList のキーなし setItems が古い行を画面に残した                                   | `VirtualList.ts:248`、forge 2026-08-02/08                   | 修正済み `@vectojs/ui@2.15.1`                                                        |
| スクロールウィジェットが deltaMode を無視（行／ページ ホイールが 1-3 px スクロール）     | `ScrollView.ts:105`、`VirtualList.ts:583`、forge 2026-08-08 | 修正済み `@vectojs/ui@2.15.2`                                                        |
| deltaMode 修正が VirtualList markDirty を落とした（onDemand でフリーズ）                 | `VirtualList.ts:596`、forge 2026-08-08                      | 修正済み `@vectojs/ui@2.15.3`                                                        |
| Popover ＋ Overlay の a11y／pointer が隠れている間に漏洩                                 | `Overlay.ts:48`、forge 2026-08-13                           | 修正済み vectojs#474、マージ vectojs#509                                             |
| 仮想化 Table が layout() で文字列セルを再同期しない                                      | `Table.ts:354`、forge 2026-08-13                            | 修正済み vectojs#494、マージ vectojs#520                                             |
| Tabs/RadioGroup ホットスポットが配列再代入で非同期                                       | `Tabs.ts:229`、forge 2026-08-13                             | 修正済み vectojs#494、マージ vectojs#520                                             |
| キーなし VirtualList setItems が古い _velY を残す（一時的なオーバーシュート）            | `VirtualList.ts:290`、forge 2026-08-13                      | 修正済み vectojs#494、マージ vectojs#520                                             |

## 8. チェックリスト — レスポンシブ・レイアウト変更を着地させる前に

1. **論理ビューポートが変わったときに scene.resize() を呼ぶこと。** 論理 `width`／`height` はプレーンフィールドである（`Scene.ts:2049`）— `resize()` が 2 つの世代カウンタをバンプしバッキングストアを再スケールするまで何もそれらを観測しない。`disableWindowResize: false`（ウィンドウパス）と `true`（ResizeObserver パス）の両方をチェックすること。`Number.isFinite && >= 0` チェック（`Scene.ts:6395`）でガードすること。
2. **コンテナサイズ合わせを対称に保つこと。** 子の `width`／`height` を所有するすべてのコンテナは `update()` 経由で再適用しなければならない（`ResizablePanel.ts:190` ／ `Card.ts:118` の `Panel`／`Card` パターン）。`Entity.width/height` はセッターフックのないプレーンフィールドであるためである。`Entity.ts:1065 add()` の外側での直接 `children.push` を grep すること — それは `markStructureChanged` と `markDirty` を完全にスキップする。
3. **Stack 高速パスは不変条件の下に留まらなければならない。** 非 wrap `appendFast` は `align: 'start'` と `fillTarget` なしを仮定する; wrap `appendFastWrap` は 4 つのスカラーの最後の行状態（`Stack.ts:95`）を復元し、完全な `layout()`（`Stack.ts:422`）の後で行から再計算する。後の子が以前の位置に影響を与えることを可能にする新しいフラグは `fastAppendDirty` を無効化しなければならない。
4. **Overlay の所有は親ではなく overlayRoot である。** `Overlay.showAt`（`Overlay.ts:70`）は `scene.overlayRoot` に再親化する — 一度もマウントされたことのないオーバーレイが最初の表示で `scene` を解決できるよう、常に `showAtPoint` の呼び出し元から `source` を渡すこと（`Overlay.ts:98` 3 番目の引数）。
5. **スクロール積分器はアイドルスロットルを再武装してはならない。** `ScrollView.update()`（`ScrollView.ts:219`）はクランプが `targetY` を動かしたときのみ `content.y` を再代入する; `VirtualList` はスクロール状態が変わったときのみ `markDirty()` する（`VirtualList.ts:596`）。毎フレーム無条件に dirty 化すると `onDemand` シーンが永遠にフルレートのままになる。
6. **deltaMode — クランプする前にスケールすること。** 行→×16、ページ→×ビューポートしてから `clampTarget()`／`_clamp()`（`ScrollView.ts:105`、`VirtualList.ts:583`）。Chrome／jsdom は常に `deltaMode: 0` を配信するため、バグはそこでは不可視である。
7. **VirtualList: 高さをインデックスではなくキーから再構築すること。** `keyForItem` ありの `setItems` の後、Fenwick ツリーは `_heightByKey`（`VirtualList.ts:272`）から再 seed され、 `_rekeyPool()`（`VirtualList.ts:317`）は高さ読み取りの前にプールされた Entity を移動する — 再キー化なしのインデックスアドレス再利用はすべての高さを間違ったキャッシュスロットに書き込む。
8. **PanelDrag はシーン空間に留まり pointerleave で終了してはならない。** `PanelResizeHandle`（`ResizablePanel.ts:86`）は利用可能なとき `sceneX`／`sceneY` を読み、もはや `pointerleave` でドラッグを終了しない — シャドウノードがキャプチャを保持する。

---

_シリーズ: 00 Overview → 01 Selection → 02 Text+Layout → 03 Semantic Projection → 04 Streaming Markdown → 05 TeX → 06 VMT Runtime → 07 Renderer → 08 WASM → 09 Three/XR → 10 Video Export → 11 Graph Layout → 12 DevTools → **14 レスポンシブ・レイアウト** → 99 Synthesis。_
