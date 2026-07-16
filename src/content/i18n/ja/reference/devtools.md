---
title: '@vectojs/devtools'
description: 'ページ内Virtual Math Treeインスペクター — エンティティピッキング、ライブツリービュー、トランスフォーム読み出し、キーボードナッジ編集。それ自体がVectoJSでレンダリングされています。'
order: 48
---

# `@vectojs/devtools`

文書化バージョン: **0.4.2**

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

- **ライブツリービュー** — `scene.rootEntity` と `scene.overlayRootEntity` を一定間隔（デフォルト500ms）で更新。各行にエンティティのコンストラクタ名、位置、サイズ、および2つのバッジ（**⚡** `interactive`、**▶** `hasPendingAnimations()`）を表示します。
- **ピックモード**：**Pick**をクリックし、ページ上の任意の場所をクリックします。インスペクターは、Sceneがポインター入力に使用するのと同じ走査順序（装飾用・非インタラクティブなエンティティにはAABBフォールバック）を使用して、クリックをそのポイント直下の最も深いエンティティに解決します。
- **選択ハイライト**：選択されたエンティティのワールド空間バウンディングボックスが、_ホスト_シーンのオーバーレイレイヤーにアウトラインとして描画されるため、ライブレンダリングに対して何が選択されているかが正確にわかります。
- **状態読み出し**：形状、スケール/回転/不透明度、完全なワールドトランスフォーム行列、およびアニメーション状態をプレーンテキストで表示 — スクリーンショットでは直接得られない数値です。
- **キーボードナッジ編集**：エンティティを選択した状態で、矢印キーで1px移動（Shift: 10px）、`+`/`-`で不透明度を0.1刻みで変更。コードに触れる前にレイアウトバグが_どの_エンティティに属するかを確認するのに便利です。

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

## 低レベルモデルユーティリティ

組み込みのパネルの代わりにカスタムインスペクターUIを構築したい場合、ツリー構築とピッキングのロジックは別途エクスポートされています：

```typescript
import { buildTreeModel, findEntityAt, describeEntity, pickInScene } from '@vectojs/devtools';

buildTreeModel(root: Entity): { nodes: TreeNode[]; index: Map<string, Entity> };
findEntityAt(root: Entity, x: number, y: number): Entity | null; // シーン空間の点 → エンティティ
describeEntity(entity: Entity): string[]; // 人間が読める状態行
pickInScene(scene: Scene, sceneX: number, sceneY: number): Entity | null; // オーバーレイ優先ピック
```

## 設計ノート

- パネルシーンは `contentProjection: false` と `renderMode: 'onDemand'` で構築されます — 自身のDOMコンテンツを投影したり、アイドル中に毎フレーム再描画したりしてはいけません。
- 選択状態はホストではなくパネルに存在します：`select()`/`armPick()` は、ハイライトオーバーレイエンティティ（`showOverlay()` で追加され、`destroy()` で削除される）を除いて、検査対象のシーンを決して変更しません。
- 自動更新はSceneアニメーションではなくプレーンなインターバルです — ホストシーンが完全にアイドル状態（`onDemand`、ダーティなし）でも動作します。
