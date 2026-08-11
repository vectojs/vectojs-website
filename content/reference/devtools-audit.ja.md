+++
title = "Devtools: 監査"
description = "VectoJSシーンが正しいことをアサートする — レイアウト、アクセシビリティ、テキストシェーピング、選択の監査が構造化された所見を返し、さらにリグレッションテスト用のスナップショットと差分を提供する。"
weight = 50

[extra]
order = 50
+++

# Devtools: 監査

監査はシーンを走査し、構造化されたJSON安全な所見を返します。それぞれがアサートできるCIゲートです：

```typescript
import { auditScene } from '@vectojs/devtools/headless';

expect(auditScene(scene)).toEqual([]);
```

これがこのパッケージの半分の要点です。スクリーンショットテストはページが変わったことを教えますが、監査は_どの_エンティティがコンテナをオーバーフローし、どの端で_何ピクセル_はみ出しているかを教えます。

| 監査                     | 検出するもの                                                                                        | ブラウザが必要 |
| ------------------------ | --------------------------------------------------------------------------------------------------- | -------------- |
| `auditScene`             | オーバーフロー、クリッピング、兄弟の重なり、ビューポートからの逸脱                                  | いいえ         |
| `auditA11y`              | 名前の欠落、ロールの競合、到達不能なフォーカスターゲット                                            | いいえ         |
| `auditTextShaping`       | アトラスにないグリフ                                                                                | いいえ         |
| `auditSceneSelection`    | キャンバスからずれたテキスト選択ジオメトリ                                                          | **はい**       |
| `auditGpu`               | バッチ処理、オーバードロー、不均衡な save/restore — [パフォーマンス参照](/reference/devtools-perf/) | いいえ         |
| `auditAccelerators`      | 引数を拒否するWASMカーネル — [パフォーマンス参照](/reference/devtools-perf/)                        | いいえ         |
| `auditMarkdownStreaming` | 低下するストリーミング再利用 — [パフォーマンス参照](/reference/devtools-perf/)                      | いいえ         |

---

## レイアウト監査

```typescript
function auditScene(scene: Scene, opts?: AuditOptions): AuditFinding[];
function auditTree(root: Entity, sceneBounds: Bounds | null, opts?: AuditOptions): AuditFinding[];

type AuditKind = 'text-overflow' | 'clip-overflow' | 'overlap' | 'viewport-overflow';

interface AuditOptions {
  tolerance?: number; // px slack before an escape/overlap counts. Default 0.5
  includeOverlay?: boolean; // modals/highlights excluded by default
  scrollableTypes?: string[]; // default ['ScrollView','VirtualList','TreeView','Table']
  ignore?: (entity: Entity) => boolean; // prune subtrees
  ignoreOverlap?: (a: Entity, b: Entity) => boolean; // allow intentional stacking
}

interface AuditFinding {
  kind: AuditKind;
  entityId: string;
  entityPath: string;
  worldBounds: Bounds;
  message: string;
  containerId?: string;
  containerPath?: string;
  containerBounds?: Bounds;
  overflow?: { left: number; right: number; top: number; bottom: number };
  otherId?: string;
  otherPath?: string;
  otherBounds?: Bounds;
  intersection?: Bounds;
}
```

```typescript
const findings = auditScene(scene, {
  tolerance: 0.5,
  includeOverlay: false,
  ignore: (e) => e.id.startsWith('debug-'),
  ignoreOverlap: (a, b) => a.id === 'badge',
});
```

4種類が検出されます：

- `text-overflow` — テキストを保持するエンティティの測定ボックスが、最も近いサイズ指定祖先を逃れます。
- `clip-overflow` — コンテンツが`clipChildren`祖先を逃れ、ピクセルが切り取られます。
- `overlap` — **兄弟のみ**；親子の包含は正常です。
- `viewport-overflow` — サイズ指定祖先を持たないエンティティがキャンバスの外に描画されます。

`auditScene`がエントリポイントで、`auditTree`はそれが呼ぶ単一ツリーのプリミティブで、`sceneBounds`を明示的に受け取ります。その境界に`null`を渡すと、逃げるべきビューポートがないため`viewport-overflow`を検出できなくなります。

所見は`kind`、次に`entityPath`、次に`otherPath`でソートされます — 実行をまたいで決定的であり、これがスナップショットしても安全な理由です。

> [!IMPORTANT]
> `includeOverlay: true`のとき、結果は**1つのグローバルソートリストではなく、2つの連結されたソート実行**です：メインツリーの所見、次にオーバーレイの所見。単一パスで`kind`ごとにグループ化すると、kindが繰り返されるのを見ることになります。1つの順序が必要なら再ソートしてください。

既知の盲点はすべて意図的です：

- **スクロール可能コンテナは垂直軸を免除します。** `ScrollView`より高いコンテンツこそが`ScrollView`の存在意義です。水平方向の逃げは引き続き報告されます。タイプリストは`scrollableTypes`で上書きできます — コンストラクタ名で照合され、エンティティは実際にクリップもしなければなりません。
- **`opacity: 0`はサブツリー全体を刈り込みます。** 意図的に隠されたコンテンツはレイアウト欠陥ではありません。
- **`viewport-overflow`にはサイズ指定祖先がまったく必要ありません。** 単一のサイズ指定された非クリップ祖先があれば抑制されます。なぜならその祖先が意味のあるコンテナになるからです。
- **オーバーラップは直接の兄弟のみを比較し**、枝をまたぐことは決してなく、交差が_両方_の軸で`tolerance`を超えることを要求します。
- `Input`はテキスト的と数えられます。なぜならテキストらしさは読み取れるテキストの存在に対してダックタイプされるからです。

> [!NOTE]
> `worldBounds`は`kind`に応じて2つの異なる意味を持ちます。オーバーフロー種別はレンダー範囲（`getWorldBounds()`）を報告し、`overlap`は宣言されたレイアウトクワッドを報告します。ボックスの外に描画するエンティティは、したがって2つの種別で異なる数値で現れます — 意図的です。なぜならオーバーラップはレイアウトの問題であり、オーバーフローはペイントの問題だからです。

---

## A11y監査

```typescript
function auditA11y(scene: Scene, opts?: A11yAuditOptions): A11yFinding[];

type A11yAuditKind =
  | 'no-accessible-name'
  | 'role-tag-conflict'
  | 'disabled-divergence'
  | 'focusable-but-clipped'
  | 'duplicate-label';

interface A11yAuditOptions {
  includeOverlay?: boolean; // default: included
  tolerance?: number; // px slack for the clipping check. Default 0.5
  skip?: ReadonlyArray<A11yAuditKind>;
}

interface A11yFinding {
  kind: A11yAuditKind;
  entityId: string;
  entityPath: string;
  message: string;
  otherId?: string;
  otherPath?: string;
  containerId?: string;
  containerPath?: string;
}
```

- `no-accessible-name` — 名前のないフォーカス可能エンティティで、ロールがそれを要求するかエンティティが`interactive`の場合。最も一般的な実欠陥：「button」としか読み上げないアイコンボタン。
- `role-tag-conflict` — 明示的な`role`がタグの暗黙ロールと矛盾する場合。例：`tag: 'button'`と`role: 'link'`。
- `disabled-divergence` — エンティティが_見た目は_無効なのに_宣言は_していない、またはその逆。暗くされたがフォーカス可能、が罠です：マウスユーザーには利用不可と見えるものに、キーボードユーザーがタブで入ってしまいます。
- `focusable-but-clipped` — `clipChildren`祖先の完全に外にあるフォーカス可能エンティティ。Tabがフォーカスを見えないものへ移動させます。
- `duplicate-label` — アクセシブル名を共有する2つのエンティティ。2番目以降に対して報告され、`otherId`が最初のものを指します。

レイアウト監査と違い、これは**デフォルトでオーバーレイツリーを含みます** — フォーカストラップが存在するのはまさにモーダルだからです。`a11yHidden`がサブツリー全体を刈り込みます。

> [!NOTE]
> 所見はソートされずに走査順で、すべての`duplicate-label`所見は最後に追加されます。`disabled-divergence`にも意図的な不感帯があります：0.6から0.9の間の不透明度はどちらでも報告されません。なぜならその範囲は間違いではなく曖昧だからです。

---

## テキストシェーピング監査

```typescript
function auditTextShaping(scene: Scene): Array<{
  kind: string;
  entityId: string;
  message: string;
  severity: 'info' | 'warn';
}>;
```

1つの種別`atlas-miss`を発行します：グリフがフォントアトラスにないエンティティで、それが空白ボックスとして描画される理由です。メッセージは最大5つの異なる欠落グリフをサンプリングします。

> [!IMPORTANT]
> この監査は、テキストが**準備済みテキスト**パスを通ったエンティティしか見ません。準備済みコンテンツグリッド経由で検査されたエンティティは、実際にいくつグリフが欠けていても`atlas-miss`所見を決して生成できません。なぜならグリッドパスはそのフラグを保持しないからです。特定のエンティティを確認するには`inspectText(entity).glyphs`を直接使ってください。

これは`scene.rootEntity`のみを走査します — オーバーレイツリーは監査されません。

---

## 選択監査

```typescript
function auditSceneSelection(scene: Scene, opts?: SelectionAuditOptions): SelectionAuditFinding[];
function auditEntitySelection(
  scene: Scene,
  entity: Entity,
  opts?: SelectionAuditOptions,
): SelectionAuditFinding[];

interface SelectionAuditOptions {
  tolerance?: number; // px of left-edge drift allowed. Default 2
  rightTolerance?: number; // defaults to `tolerance`
  entityIds?: string[]; // audit only these entities
}

interface SelectionAuditFinding {
  kind: 'selection-drift';
  entityId: string;
  entityPath: string;
  line: number;
  expectedLeft: number;
  expectedRight: number;
  actualLeft: number;
  actualRight: number;
  leftDrift: number;
  rightDrift: number;
  message: string;
}
```

ここでの「選択」とは**ネイティブブラウザのテキスト選択**を意味します — 透明なDOMコンテンツ投影の上でテキストをドラッグして選択することです。この監査は、キャンバスが描画元とするエンティティ自身の行ジオメトリを、ブラウザがハイライトするライブDOM `Range`矩形と比較します。逸脱は、青い選択帯がグリフ以外の場所に着地することを意味します。

どちらもエンティティのローカル論理ピクセルに正規化されるため、このチェックはデバイスピクセル比やブラウザのズームに依存しません。両端揃えテキスト、RTL/bidi、小数DPRの逸脱を捉えます。

`auditSceneSelection`はツリーを走査し、`entityPath`次に`line`でソートします。`auditEntitySelection`は1つのエンティティをチェックします。

> [!IMPORTANT]
> この監査は実行中に**ユーザーの現在のテキスト選択をクリア**し、実際のブラウザを要求します — `document`を無防備に参照するため、Nodeや素のテストランナーでは`[]`を返すのではなくスローします。ユニットテストではなくブラウザe2eに入れてください。また`scene.rootEntity`のみを走査し、オーバーレイオプションはありません。

`entityIds`は_監査される_エンティティをフィルタリングしますが、_走査される_エンティティはフィルタリングしないため、フィルタリング除外された親の子は引き続きチェックされます。

---

## スナップショットと差分

```typescript
function captureSnapshot(scene: Scene): SceneSnapshot;
function diffSnapshots(a: SceneSnapshot, b: SceneSnapshot): SnapshotDiff[];

interface SceneSnapshot {
  width: number;
  height: number;
  root: SnapshotNode[];
  overlay: SnapshotNode[];
}

interface SnapshotDiff {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  changes?: Record<string, { from: unknown; to: unknown }>;
}
```

```typescript
const before = captureSnapshot(scene); // deterministic JSON tree
// … perform an interaction …
const diffs = diffSnapshots(before, captureSnapshot(scene));
// -> [{ path: 'root > GridEntity[0]', kind: 'changed', changes: { x: {from,to} } }]
```

スクリーンショットを撮る代わりに、インタラクションが**ちょうど**変更すべきエンティティを変更したことをアサートします。これで「ページが違って見える」を「この1つのエンティティが、動いてはいけないのに4px動いた」に変えられます。

差分はエンティティidではなく**構造パス**（`type[index]`チェーン）をキーにします。なぜならidは実行ごとにランダムだからです。`devtoolsKey`を公開するエンティティ — それがなければa11yラベル — は代わりにそのキーで照合されるため、キー付きリストの並べ替えはすべての行が変わるのではなく移動として報告されます。キー付き照合は、キーがレベルの両側で一意のときにのみ適用されます；衝突すると、そのレベルはインデックス整列にフォールバックします。

デフォルト値のプロパティはスナップショットから省略されるため、差分は静かでいられます。

> [!NOTE]
> 比較されるのは固定のプロパティセットのみです：`type`、`x`、`y`、`width`、`height`、`worldBounds`、`opacity`、`interactive`、`animating`、`clipChildren`、そして`text`。注目すべきは、**`scene.width`/`scene.height`の変更は差分をまったく生み出さず**、`id`も`key`の変更も報告されないことです。`added`と`removed`は再帰しないため、削除されたサブツリーは子孫ごとに1つではなく1つの所見になります。

---

## CIでの監査の組み合わせ

すべての監査はプレーンなデータを返すプレーンな関数なので、1つのゲートが表面全体をアサートできます：

```typescript
import { auditA11y, auditScene, auditTextShaping } from '@vectojs/devtools/headless';

test('the scene is structurally sound', () => {
  buildDashboard(scene);
  scene.step(16.67); // let layout settle before asserting

  expect(auditScene(scene, { includeOverlay: true })).toEqual([]);
  expect(auditA11y(scene)).toEqual([]);
  expect(auditTextShaping(scene)).toEqual([]);
});
```

> [!IMPORTANT]
> シーンがレイアウトされる前に監査すると、すべてが空虚に通り抜けます。最初に少なくとも1回の`scene.step()`を駆動してください — 空のシーンからの空の所見配列は何の証拠にもなりません。

---

[Devtools概要](/reference/devtools/) · [インスペクト](/reference/devtools-inspect/) · [パフォーマンス](/reference/devtools-perf/) · [ブリッジとプラグイン](/reference/devtools-extend/)
