+++
title = "@vectojs/devtools"
description = "ページ内Virtual Math Treeインスペクターとそのヘッドレスモデルレイヤー — エンティティピッキング、ツリービュー、監査、スナップショット、GPU・アクセラレータ読み出し、JSON-RPCブリッジ。"
weight = 48
+++

# `@vectojs/devtools`

文書化バージョン: **0.11.0**

`@vectojs/devtools` は「Elementsパネルはどこ？」という問いに対する答えです — Virtual Math Tree用のインスペクターで、VectoJSシーンのデバッグをピクセル空間ではなく状態空間で行えるようにします。これには2つの部分があります：

| 部分                                              | 用途                                                                                                                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **パネル** (`@vectojs/devtools`)                  | ページ内ドック。それ自体がVectoJSの`Scene`であり、ツリー、エンティティ状態、監査、a11y、イベントログ、設定のタブを備えています。このページで文書化されています。  |
| **モデルレイヤー** (`@vectojs/devtools/headless`) | レイアウト、a11y、ヒットテスト、テキスト、パフォーマンスの質問にデータとして答える約60の純粋関数。DOMパネルはなく、テスト、CI、Node、エージェントで使用できます。 |

モデルレイヤーはより大きく、より有用な部分です。スクリーンショットを撮る前にこれを利用してください — 画像では何かが間違っていることしかわかりませんが、数値は_どの_エンティティが間違っているかを教えてくれます。

| ページ                                              | 内容                                                                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [インスペクト](/reference/devtools-inspect/)        | ツリーモデル、ピッキング、エンティティ/a11y/テキスト状態、ハイライトジオメトリ、ヒットテストの説明、イベントルーティングトレース。           |
| [監査](/reference/devtools-audit/)                  | すべての `audit*` 関数 — レイアウト、a11y、テキストシェーピング、選択ドリフト — およびリグレッションアサーション用のスナップショットと差分。 |
| [パフォーマンス](/reference/devtools-perf/)         | GPUと描画カウンター、WASMアクセラレータの状態、ダーティ再描画の帰属、Markdownストリーミングメトリクス。                                      |
| [ブリッジとプラグイン](/reference/devtools-extend/) | 別のドキュメントからシーンを操作するためのJSON-RPCプロトコル、および独自のタブと監査を追加するためのプラグインプロトコル。                   |

---

## インストール

```bash
bun add -D @vectojs/devtools
```

パネルはVectoJSシーンをマウントし、`document`をリッスンするため、プロダクションバンドルには含めないでください。`headless` サブパスからモデルレイヤーをインポートします — パネルコードや `@vectojs/ui` への依存関係は含まれません：

```ts
import { auditScene, captureSnapshot, inspectEntity } from '@vectojs/devtools/headless';
```

```typescript
import { attachDevtools } from '@vectojs/devtools';

const scene = new Scene(canvas);
// ...シーンを構築...

if (import.meta.env.DEV) {
  const devtools = attachDevtools(scene);
  // devtools.detach() で後から削除
}
```

> [!IMPORTANT]
> `@vectojs/devtools/headless` 以下のすべてのものはパッケージルートからも再エクスポートされるため、単一の `attachDevtools` のインポートで `auditScene` を呼び出すことができます。サブパスが存在するのは、プロダクションのテストバンドルがパネルなしでモデルレイヤーを取り込めるようにするためです。

---

## 表示内容

ヘッダーには3つのゴーストアイコンボタン — **⌖** (ピック)、**⟳** (リフレッシュ)、**⚠** (監査) — と、3つのカウントバッジ：全エンティティ、インタラクティブ (**⚡**)、監査の所見 (**⚠**) があります。`Tabs` バーはツールを **Tree · Info · Audit · A11y · Log · ⚙** に分割し、さらに登録された[プラグインインスペクター](/reference/devtools-extend/#プラグインプロトコル)ごとに1つのタブを追加します。パフォーマンスストリップは下部に固定されています。

- **ライブツリービュー（`Tree` タブ）** — `scene.rootEntity` と `scene.overlayRootEntity` を一定間隔（デフォルト500ms）で更新。各行にエンティティのコンストラクタ名、位置、サイズ、および2つのバッジ（**⚡** `interactive`、**▶** `hasPendingAnimations()`）を表示します。**フィルター**フィールドは、タイプ/IDのサブストリングで行を絞り込みます。これは表示のみなので、ID→エンティティのインデックスは依然としてすべてを解決します。プログラムによる操作: `panel.setFilter(text)`。
- **ピックモード**：**⌖** をクリックし、ページ上の任意の場所をクリックします。インスペクターは、Sceneがポインター入力に使用するのと同じ走査順序（装飾用・非インタラクティブなエンティティにはAABBフォールバック）を使用して、クリックをそのポイント直下の最も深いエンティティに解決します。
- **選択ハイライト**：選択されたエンティティのジオメトリが、_ホスト_シーンのオーバーレイレイヤーにアウトラインとして描画されるため、ライブレンダリングに対して何が選択されているかが正確にわかります。デフォルトではレイアウトボックスを描画しますが、`panel.setHighlightLayers()` で7つの[ジオメトリレイヤー](/reference/devtools-inspect/#ハイライトジオメトリ)のいずれかに切り替えることができます — ボックスではなくエンティティの実際のヒット領域をサンプリングする `'hit'` も含まれます。
- **状態読み出し + インライン編集（`Info` タブ）**：ジオメトリ、スケール/回転/不透明度、完全なワールドトランスフォーム行列、アニメーション状態、およびエンティティが公開する `getDevtoolsDescriptor()` の出力を表示。インラインの `x`/`y`/`opacity` エディタと **Copy path** / **Copy JSON** ボタンを追加します。
- **A11yタブ**: 選択されたエンティティの投影されたロール、アクセシブルな名前とそのソース、タブインデックス、読み上げ順序の位置、キャンバスとDOMのボックス — さらにシーン全体の[a11y監査](/reference/devtools-audit/#a11y監査)の所見。
- **キーボードナッジ編集**：エンティティを選択した状態で、矢印キーで1px移動（Shift: 10px）、`+`/`-`で不透明度を0.1刻みで変更。コードに触れる前にレイアウトバグが_どの_エンティティに属するかを確認するのに便利です。
- **パフォーマンスHUD**: 下部のストリップで [`Scene.frameStats`](/reference/core-scene) を読み取ります —— fps、ms/フレーム、エンティティ数、レンダリングモード、レンダリング済み/スキップ済みのフレーム数。fps は実際の*レンダリングフレーム*のケイデンスであるため、アイドル状態の `onDemand` や自動スロットルシーンでは、偽の 60 ではなく正直に ~2fps と読み取られます。`showPerf: false` で無効化します。
- **設定** (`⚙`): 選択ハイライトの切り替え、およびリフレッシュ間隔とドック側（左/右）のライブ切り替え。

パネルはウィンドウのサイズ変更に応じてリフローするため、下部のパフォーマンスストリップはあらゆるビューポートの高さやズームレベルでも画面上に留まります。ドックとそのキャンバスは `pointer-events: none` を使用し、投影されたインタラクティブコントロールだけがオプトインします — そのため、インスペクターは空のドックピクセルの下にあるホストコントロールから入力を奪うことはなく、独自の行、タブ、入力、およびボタンは引き続きクリック可能です。

---

## API

```typescript
function attachDevtools(
  scene: Scene,
  options?: DevtoolsOptions,
): DevtoolsPanel & { detach(): void };

interface DevtoolsOptions {
  width?: number; // パネル幅（px）、デフォルト360
  refreshInterval?: number; // ms；0で自動更新を無効化。デフォルト500
  traceEvents?: boolean; // バウンドされたポインター/ホイール/キーボードルーティングレコードを表示
  traceCapacity?: number; // 保持するトレースレコード数、デフォルト50
  dockSide?: 'right' | 'left'; // デフォルト 'right'
  showPerf?: boolean; // ライブパフォーマンスHUDストリップ、デフォルト true
  defaultTab?: string; // 'tree' | 'inspect' | 'audit' | 'a11y' | 'events' | 'settings'
}

class DevtoolsPanel {
  refresh(force?: boolean): void; // ホストシーンからツリーモデルを再構築
  armPick(): void; // ワンショット：次のページクリックでその下のエンティティを選択
  select(entity: Entity): void; // プログラムによる選択
  get selection(): Entity | null;
  get trace(): EventTrace | null; // traceEventsが有効でない場合はnull
  setFilter(text: string): void; // タイプ/IDのサブストリングでツリーをフィルタリング
  setHighlightEnabled(on: boolean): void;
  setHighlightLayers(kinds: ReadonlyArray<HighlightLayerKind>, hitSampleStep?: number): void;
  getHighlightLayers(): ReadonlyArray<HighlightLayer>; // 最後の描画からのレイヤー
  setRefreshInterval(ms: number): void;
  setDockSide(side: 'right' | 'left'): void;
  audit(): AuditFinding[]; // レイアウト監査を実行；Auditタブも入力する
  selectFinding(i: number): void; // 所見iの背後にあるエンティティを選択＋ハイライト
  getPluginFindings(): ReadonlyArray<PluginFinding>; // プラグイン監査からの所見
  getPluginRows(inspectorId: string): PluginRow[]; // プラグインタブの現在の行
  runCommand(qualifiedId: string): unknown; // `<pluginId>/<commandId>` を実行
  destroy(): void; // リスナー、タイマー、ホストハイライト、パネルシーンを破棄
}
```

`detach()`（`attachDevtools`によって返される）は`destroy()`のエイリアスです。

`refresh(force` は `scene.structureVersion` が移動していない場合、再構築をスキップするため、短い間隔で呼び出してもコストは低いです。強制的に再構築するには `true` を渡します。このチェックとは独立して、パネルは3秒ごとにすべての状態を調整するため、構造バージョンアップを見逃してもツリーが永久に古いままになることはありません。

`getPluginRows` は、未知のインスペクターID、何も選択されていない場合、またはインスペクターの `appliesTo` が選択を拒否した場合に `[]` を返します — これら3つのケースは区別されません。`runCommand` は何もせずに処理を終えるのではなく、未知のコマンドIDに対して**スロー**します。

---

## 設計ノート

- パネルシーンは `contentProjection: false` と `renderMode: 'onDemand'` で構築されます — 自身のDOMコンテンツを投影したり、アイドル中に毎フレーム再描画したりしてはいけません。
- 選択状態はホストではなくパネルに存在します：`select()`/`armPick()` は、ハイライトオーバーレイエンティティ（`showOverlay()` で追加され、`destroy()` で削除される）を除いて、検査対象のシーンを決して変更しません。
- 自動更新はSceneアニメーションではなくプレーンなインターバルです — ホストシーンが完全にアイドル状態（`onDemand`、ダーティなし）でも動作します。
- ドック（`position: fixed`、ビューポート全高）とそのキャンバスは`pointer-events: none`であり、メイン`Scene`の`a11yRoot`がオプトアウトし、個々のインタラクティブなシャドウ要素が`auto`でオプトインするのをミラーリングしています。これにより、ドックの空の背景に対するクリックは、その下にあるホストコンテンツに透過します — そうでなければドックの帯域の下に隠れてしまうホストアプリの右端のコントロールも含まれます。パネル自身のa11y投影コントロールのみが、自身の`auto`オプトインを通じて独立してクリック可能です。

---

[インスペクト](/reference/devtools-inspect/) · [監査](/reference/devtools-audit/) · [パフォーマンス](/reference/devtools-perf/) · [ブリッジとプラグイン](/reference/devtools-extend/)
