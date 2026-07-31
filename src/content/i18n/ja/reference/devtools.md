---
title: '@vectojs/devtools'
description: 'ページ内Virtual Math Treeインスペクター — エンティティピッキング、ライブツリービュー、トランスフォーム読み出し、キーボードナッジ編集。それ自体がVectoJSでレンダリングされています。'
order: 48
---

# `@vectojs/devtools`

文書化バージョン: **0.4.3**

`@vectojs/devtools` は「Elementsパネルはどこ？」という問いに対する答えです — Virtual Math Tree用のページ内インスペクターで、VectoJSシーンのデバッグをピクセル空間ではなく状態空間で行えるようにします。パネル自体がVectoJSの`Scene`（検査対象のフレームワークをドッグフーディング）であり、ページの右端にドッキングされます。

## インストール

```bash
bun add -D @vectojs/devtools
```

開発時のみ条件付きでビジュアルパネルを追加します — VectoJSパネルをマウントし、`document`をリッスンするため、プロダクションバンドルには含めないでください。ヘッドレス監査、スナップショット、ピッキング、イベントトレースはパネルなしでも利用可能です：

```ts
import { auditScene, captureSnapshot, createEventTrace } from '@vectojs/devtools/headless';
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

## 表示内容

- **ライブツリービュー（`Tree` タブ）** — `scene.rootEntity` と `scene.overlayRootEntity` を一定間隔（デフォルト500ms）で更新。各行にエンティティのコンストラクタ名、位置、サイズ、および2つのバッジ（**⚡** `interactive`、**▶** `hasPendingAnimations()`）を表示します。
- **ピックモード**：**Pick**をクリックし、ページ上の任意の場所をクリックします。インスペクターは、Sceneがポインター入力に使用するのと同じ走査順序（装飾用・非インタラクティブなエンティティにはAABBフォールバック）を使用して、クリックをそのポイント直下の最も深いエンティティに解決します。
- **選択ハイライト**：選択されたエンティティのワールド空間バウンディングボックスが、_ホスト_シーンのオーバーレイレイヤーにアウトラインとして描画されるため、ライブレンダリングに対して何が選択されているかが正確にわかります。
- **状態読み出し + インライン編集（`Info` タブ）**：形状、スケール/回転/不透明度、完全なワールドトランスフォーム行列、およびアニメーション状態をプレーンテキストで表示 — スクリーンショットでは直接得られない数値です。
- **キーボードナッジ編集**：エンティティを選択した状態で、矢印キーで1px移動（Shift: 10px）、`+`/`-`で不透明度を0.1刻みで変更。コードに触れる前にレイアウトバグが_どの_エンティティに属するかを確認するのに便利です。

- **パフォーマンスHUD** (0.5.0): 下部のストリップで [`Scene.frameStats`](/reference/core-scene) を読み取ります —— fps、ms/フレーム、エンティティ数、レンダリングモード、レンダリング済み/スキップ済みのフレーム数。fps は実際の*レンダリングフレーム*のケイデンスであるため、アイドル状態の `onDemand` や自動スロットルシーンでは、偽の 60 ではなく正直に ~2fps と読み取られます。`showPerf: false` で無効化します。
- **設定** (`⚙` タブ, 0.5.0): 選択ハイライトの切り替え、およびリフレッシュ間隔とドック側（左/右）のライブ切り替え。
  0.4.3 以降、右端に固定された dock とその Canvas は `pointer-events: none` を使用し、投影されたインタラクティブコントロールだけがポインター入力を再び有効にします。そのため、空の dock ピクセルの下にあるホストコントロールから入力を奪わず、VMT 行とボタンは引き続きクリックできます。

## API

```typescript
function attachDevtools(
  scene: Scene,
  options?: DevtoolsOptions,
): DevtoolsPanel & { detach(): void };

interface DevtoolsOptions {
  width?: number; // パネル幅（px）、デフォルト320
  refreshInterval?: number; // ms；0で自動更新を無効化
  traceEvents?: boolean; // バウンドされたポインター/ホイール/キーボードルーティングレコードを表示
  traceCapacity?: number;
}

class DevtoolsPanel {
  refresh(): void; // ホストシーンからツリーモデルを再構築
  armPick(): void; // ワンショット：次のページクリックでその下のエンティティを選択
  select(entity: Entity): void; // プログラムによる選択
  get selection(): Entity | null;
  destroy(): void; // リスナー、タイマー、ホストハイライト、パネルシーンを破棄
}
```

`detach()`（`attachDevtools`によって返される）は`destroy()`のエイリアスです。

## イベントルーティングトレース

```ts
const trace = createEventTrace(scene, { capacity: 100 });
trace.subscribe((entry) => {
  console.log(entry.source, entry.targetPath, entry.defaultPrevented);
});
```

`source` は `"canvas"`、`"a11y"`、`"content"`、または `"document"` です。`content` ソースは、ブラウザイベントが選択可能な `[data-vecto-content]` ミラー上で発生したことを意味します。トレースは所有するEntityを検証し、シーン/ローカル座標を記録し、マイクロタスクで確定するため、`defaultPrevented` はアプリケーションの最終的なショートカットまたは選択決定を反映します。診断サーフェスがアンマウントされたら `trace.destroy()` を呼び出します。ポインターのトレースには `pointercancel` が含まれるため、中断されたドラッグや選択トランザクションが `pointerdown` 後の診断ギャップを残さずに可視化されます。

## シーン監査

`auditScene` はツリーを走査し、レイアウトの欠陥を構造化されたJSON安全な所見として報告します — 「何かがオーバーフロー、オーバーラップ、またはエスケープしているか？」という質問に数値で答えます：

```typescript
import { auditScene } from '@vectojs/devtools/headless';

const findings = auditScene(scene, {
  tolerance: 0.5, // エスケープ/オーバーラップとカウントされる前のpx余裕
  includeOverlay: false, // モーダル/ハイライトはデフォルトで除外
  ignore: (e) => e.id.startsWith('debug-'), // サブツリーを除外
  ignoreOverlap: (a, b) => a.id === 'badge', // 意図的なスタッキングを許可
});
// -> AuditFinding[]: { kind, entityId, entityPath, worldBounds, message,
//    containerBounds?, overflow?{left,right,top,bottom}, otherId?, intersection? }
```

4つの `kind` が検出され、決定論的にソートされます：

- `text-overflow` — テキストを持つエンティティの測定ボックスが、最も近いサイズ指定された祖先を超えています。
- `clip-overflow` — コンテンツが `clipChildren` 祖先を超えています（ピクセルが切り取られます）。
- `overlap` — **兄弟のみ**；親子の包含は正常です。
- `viewport-overflow` — サイズ指定された祖先がないエンティティがキャンバスの外に描画されています。

既知の盲点：スクロール可能なコンテナは垂直軸を除外します（リストは `scrollableTypes` で上書き可能、`constructor.name` で照合）。`opacity: 0` のエンティティはスキップされます。

パネルの **Audit** ボタンはツリービューの代わりに同じチェックを実行します；`panel.audit()` は所見を返し、`panel.selectFinding(i)` で1つをハイライトします。

CIゲートとして使用：`expect(auditScene(scene)).toEqual([])`。

## スナップショットと差分

```typescript
import { captureSnapshot, diffSnapshots } from '@vectojs/devtools/headless';

const before = captureSnapshot(scene); // 決定論的JSONツリー
// … インタラクションを実行 …
const diffs = diffSnapshots(before, captureSnapshot(scene));
// -> [{ path: "root > GridEntity[0]", kind: "changed", changes: { x: {from,to} } }]
```

差分は**構造パス**（`type[index]` チェーン）をキーにし、エンティティIDは決して使用しません — IDは実行ごとにランダムです。デフォルト値のプロパティはスナップショットから省略されるため、差分は静かです。スナップショットのペアは、スモークテストで正確なゴールデンステートアサーションを可能にします：スクリーンショットの代わりに、インタラクションが正確に意図したエンティティのみを変更したことをアサートします。

## 低レベルモデルユーティリティ

組み込みのパネルの代わりにカスタムインスペクターUIを構築したい場合、ツリー構築とピッキングのロジックは別途エクスポートされています：

```typescript
import {
  buildTreeModel,
  findEntityAt,
  describeEntity,
  inspectEntity,
  entityPath,
  pickInScene,
} from '@vectojs/devtools';

buildTreeModel(root: Entity): { nodes: TreeNode[]; index: Map<string, Entity> };
findEntityAt(root: Entity, x: number, y: number): Entity | null; // シーン空間の点 → エンティティ
describeEntity(entity: Entity): string[]; // 人間が読める状態行
inspectEntity(entity: Entity): EntityInfo; // 構造化されたJSON安全な状態
entityPath(entity: Entity): string; // 祖先チェーン（"Scene > Card#<id> > Text#<id>"、IDは8文字に切り詰め）
pickInScene(scene: Scene, sceneX: number, sceneY: number): Entity | null; // オーバーレイ優先ピック
```

`inspectEntity` は `describeEntity` の構造化された兄弟です：ワールド境界とトランスフォーム、インタラクションフラグ、`clipChildren`、子カウント、ダックタイピングされたテキストプレビュー（`.text`/`.value`）、および存在する場合のa11yプロジェクション属性。`entityPath` はエンティティの祖先チェーンを生成します（例：`"Scene > Card#<id> > Text#<id>"`、IDは8文字に切り詰められます）。

## デバッグワークフロー

devtoolsモデルレイヤーはレイアウトの質問に数値で答えます — スクリーンショットの前にこれを使用してください。症状 → ツール：

| 症状                                                              | ワークフロー                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 「どのエンティティがこのピクセルを所有している？」                | `pickInScene(scene, x, y)` → `inspectEntity(hit)`；ページ内では、パネルの **Pick** ボタン                                                                                                                                                          |
| 「なぜこのエンティティの位置/サイズがおかしい？」                 | `inspectEntity` でワールド境界＋トランスフォームを確認し、`entityPath` を上に辿る — 最初に境界がおかしい祖先がバグを所有している                                                                                                                   |
| 「どこかでオーバーフロー/オーバーラップしているが見つけられない」 | `auditScene(scene)` — 各所見に `entityPath`、ワールド境界、エッジごとのオーバーフロー量が含まれる                                                                                                                                                  |
| 「このインタラクションが動かすべきでないものを動かした」          | 前に `captureSnapshot`、インタラクション、後に `diffSnapshots` — diff は正確に何が変わったかをリストする                                                                                                                                           |
| 「クリック/ホイール/キープレスが間違った場所に行く」              | `createEventTrace(scene)` — 各エントリーが source（`canvas`/`a11y`/`content`/`document`）、ターゲットパス、座標、最終的な `defaultPrevented` を表示                                                                                                |
| 「テキストのドラッグ選択やコピーがインターセプトされる」          | `entry.source === 'content'` のイベントトレース — ブラウザイベントが選択可能なプロジェクション上で開始されたことを意味する；`defaultPrevented` とターゲットパスを確認                                                                              |
| 「ドラッグがスタックする/コミットされない」                       | ポインタートレースはトランザクショナル：`pointerdown` → 移動 → 正確に1つの `pointerup`（コミット）**または** `pointercancel`（ロールバック）を期待；終端エントリーがない場合、エンティティが投影されていないかキャプチャがバイパスされたことを示す |
| 「これはリグレッションか？」                                      | 健全なシーンのコミット済みスナップショット（`captureSnapshot`）を保持し、CIで `diffSnapshots` を実行する                                                                                                                                           |

## 設計ノート

- パネルシーンは `contentProjection: false` と `renderMode: 'onDemand'` で構築されます — 自身のDOMコンテンツを投影したり、アイドル中に毎フレーム再描画したりしてはいけません。
- 選択状態はホストではなくパネルに存在します：`select()`/`armPick()` は、ハイライトオーバーレイエンティティ（`showOverlay()` で追加され、`destroy()` で削除される）を除いて、検査対象のシーンを決して変更しません。
- 自動更新はSceneアニメーションではなくプレーンなインターバルです — ホストシーンが完全にアイドル状態（`onDemand`、ダーティなし）でも動作します。
- ドック（デフォルトでは`position: fixed; right: 0; width: 320px`、ビューポート全高）とそのキャンバスは`pointer-events: none`であり、メイン`Scene`の`a11yRoot`がオプトアウトし、個々のインタラクティブなシャドウ要素が`auto`（`@vectojs/devtools@0.6.0+`）でオプトインするのをミラーリングしています。これにより、ドックの空の背景/クローム上のクリックは、その下にあるホストコンテンツに透過します — ホストアプリの右端のコントロール（タブ閉じるボタン、ツールバーボタン）も含まれ、そうでなければドックの320px帯域の下に隠れてしまいます。パネル自身のa11y投影コントロール（ボタン、VMTツリー行）のみが、自身の`auto`オプトインを通じて独立してクリック可能です。
