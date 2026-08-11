+++
title = "Devtools: インスペクト"
description = "VectoJSシーンをデータとして読み取る — ツリーモデル、エンティティピッキング、エンティティ/a11y/テキスト状態、ハイライトジオメトリ、ヒットテストの説明、イベントルーティングトレース。"
weight = 49

[extra]
order = 49
+++

# Devtools: インスペクト

ここにあるものはすべて`@vectojs/devtools/headless`からの純粋な読み取りです。パネルをマウントするものはなく、`EventTrace`（ドキュメントリスナーをアタッチする唯一の例外）を除けば、後始末が必要なものもありません。

```ts
import { inspectEntity, pickInScene } from '@vectojs/devtools/headless';
```

---

## ツリーモデルとピッキング

```typescript
function buildTreeModel(root: Entity): {
  nodes: DevtoolsTreeNode[];
  index: Map<string, Entity>;
};
function findEntityAt(root: Entity, x: number, y: number): Entity | null;
function pickInScene(scene: Scene, sceneX: number, sceneY: number): Entity | null;
function describeEntity(entity: Entity): string[];

interface DevtoolsTreeNode {
  id: string;
  label: string;
  children?: DevtoolsTreeNode[];
}
```

`buildTreeModel`はルート自身ではなくルートの**子**を返します — `nodes`は直接の子ごとに1エントリで、それぞれが独自のサブツリーを持ちます。対照的に`index`マップは、あらゆる深さのすべての子孫をエンティティidをキーとして含み、それがidからライブエンティティへの往復を可能にします。`children`は葉では`[]`ではなく`undefined`になります。

`label`は`` `${type} (${x},${y}) ${W}×${H} ⚡ ▶` ``です — サイズは両次元とも0の場合は省略され、2つのバッジはそれぞれ`interactive`と`hasPendingAnimations()`のときにのみ表示されます。

`pickInScene`は「このピクセルを所有しているエンティティはどれか」を問うときに使いたい関数です。**オーバーレイツリーを先に**チェックし、次にメインツリーをチェックするため、開いたモーダルはその背後にあるコンテンツに正しく優先します。`findEntityAt`はその下にある単一ツリーの基本プリミティブです：子を逆順で、最深優先で走査するため、最も上に描画されたヒットを返し、`isPointInside`がnoと言ったときにはAABBテストにフォールバックします — つまり装飾用・非インタラクティブなエンティティでもピック可能です。

> [!IMPORTANT]
> `findEntityAt`は渡したエンティティ自身とその子孫の両方をテストするため、シーンルートを渡すとそのルートが返ることがあります。`pickInScene`の方が安全なデフォルトです。

`describeEntity`は人間可読な行を返します：汎用エンティティ状態の6つの固定行、次にエンティティが公開する`getDevtoolsDescriptor()`の出力を、最大12個のディスクリプタ行に制限して続けます。フィールド値は32文字、ノートは60文字で切り詰められます。スローするディスクリプタは、読み出しを中断する代わりに`— descriptor threw —`という行を追加します。

> [!NOTE]
> devtoolsモデルレイヤー全体で`type`は`entity.constructor.name`であり、ミニファイアが改名します。デバッグ用ラベルとして扱い、安定したキーとしては決して使わないでください — そしてプロダクションの分岐条件としても決して使わないでください。

---

## エンティティ状態

```typescript
function inspectEntity(entity: Entity): EntityInfo;
function entityPath(entity: Entity): string;
function textPreviewOf(entity: Entity): string | undefined;

interface EntityInfo {
  id: string;
  type: string;
  path: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  worldTransform: {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
  };
  worldBounds: Bounds;
  interactive: boolean;
  animating: boolean;
  clipChildren: boolean;
  childCount: number;
  text?: string;
  a11y?: { tag?: string; role?: string; label?: string };
  descriptor?: DevtoolsDescriptor;
  layoutControlled?: ReadonlyArray<LayoutControlledProperty>;
}
```

`inspectEntity`は`describeEntity`の構造化されたJSON安全な兄弟です。すべての数値は小数第2位に丸められます。4つのオプションフィールドは`undefined`に設定されるのではなく**省略される**ため、`'text' in info`で「テキストなし」と「空のテキスト」を区別できます — テキストが本当に`''`のエンティティは`text: ''`と報告します。

`layoutControlled`は親のレイアウトコンテナが所有するプロパティを列挙します。アプリケーションコードからそのうちの1つに書き込むのはバグです：次のレイアウトパスが上書きします。`x`へのナッジやアニメーションがスナップバックを繰り返すなら、このフィールドがその理由です。

`entityPath`は祖先チェーンを`Scene > Card#a1b2c3d4 > Text#e5f6a7b8`のように描画し、idを8文字に切り詰めます。これはバグ報告で引用する識別子です。なぜなら`id`がそうでないところでも、実行をまたいで生き残るからです。

> [!IMPORTANT]
> `entityPath`は親のないエンティティをすべて`Scene`とラベル付けするため、**デタッチ**されたエンティティは本物のルートと見分けがつきません。パスが不自然に短い場合は、エンティティがまだツリー内にあるか確認してください。

`textPreviewOf`は`.text`、次に`.value`をダックタイプし、80文字プラス省略記号で切り詰めます。これは`EntityInfo.text`とa11y名前フォールバックに供給されるもので、長い文字列は全文ではなくプレビューとしてそこに届きます。

---

## アクセシビリティ状態

```typescript
function inspectA11y(scene: Scene, entity: Entity): A11yInfo;
function a11yReadingOrder(scene: Scene): A11yInfo[];

interface A11yInfo {
  entityId: string;
  entityPath: string;
  projected: boolean;
  tag?: string;
  role?: string;
  accessibleName?: string;
  nameSource?: 'label' | 'text' | 'none';
  tabIndex?: number;
  disabled?: boolean;
  focused?: boolean;
  readingOrder?: number;
  canvasBounds: Bounds;
  domBounds?: Bounds;
}
```

`inspectA11y`は常にレコードを返し、`null`にはなりません — 投影されていないエンティティは`projected: false`とそれ以外はほとんど何も報告しません。これが「なぜスクリーンリーダーがこれを読み上げないのか」に答える関数であり、通常それを答える2つのフィールドは`accessibleName`と`nameSource`です。

`nameSource`は常に存在し、`'none'`も含みます。解決順は`label`、次にテキストプレビュー、そして何もなしです。テキストパスは`textPreviewOf`を通るため、長いテキストから導かれた名前は**80文字で切り詰められて**届きます — 読み上げられる文字列は全文なので、長いコンテンツでは`accessibleName`を真実として読まないでください。

`readingOrder`は兄弟インデックスではなく、DOM順で投影レイヤー全体にわたる1始まりのインデックスです。`a11yReadingOrder`はそれでソートされたすべての投影エンティティを返し、これがスクリーンリーダーがたどる順序です。投影されているがDOMクエリに存在しないエンティティは末尾にソートされます。

`canvasBounds`はキャンバスがエンティティを描画する場所であり、`domBounds`はその投影ミラーが実際に置かれる場所です。**それらの間のギャップこそが欠陥です** — スクリーンリーダーのフォーカスリングやクリックターゲットがピクセルとは別の場所にあることを意味します。`domBounds`は要素がないか矩形がすべてゼロのときに省略されます。

---

## テキストとシェーピング

```typescript
function inspectText(entity: Entity): TextInspection | null;
function shapeProbe(
  text: string,
  options?: {
    font?: string;
    cellWidth?: number;
    lineHeight?: number;
    baseline?: number;
  },
): TextInspection;
function formatTextInspection(inspection: TextInspection): PluginRow[];
function isTextEntity(entity: Entity): boolean;
```

`inspectText`はエンティティが`.text`も`.value`も持たないときにのみ`null`を返します。それ以外では、解決されたbidiレベル、レベルラン、反転セグメント、視覚的順序、書記素クラスター、グリフごとの詳細が得られます — 「なぜこのアラビア文字列が間違った順序なのか」や「なぜこのグリフが空白ボックスなのか」の背後にあるデータです。

グリフごとの詳細は3つの階層のいずれかで届き、階層がどのフィールドが存在するかを決定します：

| 階層                       | `glyphs[].x` | `metrics` / `lines` | `atlasMiss`  |
| -------------------------- | ------------ | ------------------- | ------------ |
| 準備済みコンテンツグリッド | はい         | はい                | 設定されない |
| 準備済みテキスト           | いいえ       | いいえ              | はい         |
| どちらでもない             | グリフなし   | いいえ              | いいえ       |

`unavailable`配列は報告できなかったすべての能力とその理由を列挙するため、欠落フィールドは常に黙って省略されるのではなく説明されます。これは常に少なくとも3エントリを保持します — グリフid、スクリプトラン、フォントフォールバックスパンはエンジンがまったく公開しません。

`shapeProbe`はエンティティもシーンもなしに任意の文字列を同じパイプラインに通すため、ユニットテストでシェーピングの問題を確認する最速の方法です。常に位置付きの完全なインスペクションを返します。

> [!NOTE]
> クラスター境界はdevtoolsが`Intl.Segmenter`を使って再セグメント化するもので、エンジンから取られたものではありません。そのため`Intl.Segmenter`を持たないランタイムではコードポイント反復にフォールバックし、結合記号や国旗絵文字では間違っています。クラスター数を信頼する前に、エンジン出力と比較してください。

---

## ハイライトジオメトリ

```typescript
function highlightGeometry(
  scene: Scene,
  entity: Entity,
  options?: HighlightGeometryOptions,
): HighlightLayer[];
function sampleHitRegion(
  entity: Entity,
  options?: { step?: number; budget?: number },
): HighlightLayer;
function formatHighlightGeometry(layers: ReadonlyArray<HighlightLayer>): string[];

type HighlightLayerKind = 'aabb' | 'layout' | 'render' | 'clip' | 'content' | 'a11y' | 'hit';

interface HighlightLayer {
  kind: HighlightLayerKind;
  polygons: ReadonlyArray<HighlightPolygon>;
  divergesFromLayout?: boolean;
  unavailable?: string;
}

interface HighlightGeometryOptions {
  layers?: ReadonlyArray<HighlightLayerKind>;
  hitSampleStep?: number;
  hitSampleBudget?: number;
}
```

1つのエンティティは最大7つの異なるボックスを持ち、レイアウトバグはそれらの間のギャップに潜んでいます：

| 種類      | 意味                                                            |
| --------- | --------------------------------------------------------------- |
| `aabb`    | 変換されたレイアウトクワッドの軸平行境界ボックス。              |
| `layout`  | 回転とスキューを含む真のクワッド。基準。                        |
| `render`  | `getBounds()` — エンティティが実際に描画する場所。              |
| `clip`    | 最も近い`clipChildren`祖先のボックス。                          |
| `content` | 選択可能なDOMコンテンツミラーのボックス。                       |
| `a11y`    | a11yプロジェクション要素のボックス。                            |
| `hit`     | `isPointInside`のプローブでサンプリングされた実際のヒット領域。 |

どのレイヤーの`divergesFromLayout`もシグナルです — そのボックスがレイアウトクワッドと1ピクセル以上食い違うことを意味し、これはまさにクリックがユーザーの狙っていない場所に着地する条件です。発散する`render`レイヤーはコンテンツがボックスの外に描画されていることであり、`content`や`a11y`の発散は選択やフォーカスターゲットの位置ずれです。

`highlightGeometry`は決してスローしません。計算できないレイヤーはポリゴンなしで`unavailable`に理由が設定されて戻ります。そのため典型的なエンティティの`render`は`getBounds() returned null, so the layout box is the render box`と読み取れます。出力はリクエストした順序に関係なく、常に上記の固定順です。

`'hit'`は唯一の高コストなレイヤーであるため、デフォルトレイヤーセットには**含まれません**。グリッド上で`isPointInside`をサンプリングし — デフォルトステップ8シーン単位、デフォルト予算4096プローブ — 連続する水平ランごとに1つの矩形を返します。予算を超えると、ハングするのではなくサンプリングを拒否してその旨を伝えます：

```ts
// An inscribed circle: same extent as its box, ~79% of its area.
const hit = sampleHitRegion(circle, { step: 4 });
hit.divergesFromLayout; // true — coverage is below 90% of the box
```

`'hit'`の発散は**範囲ではなく面積カバレッジ**で判定され、まさに正方形内の円が記録されるための仕組みです。固定ステップではコストはエンティティサイズに対して2乗になります：`step`を半分にするとプローブ数は4倍になるため、200×100エンティティ上の2pxステップは約5100プローブを必要とし、実行される前に`hitSampleBudget`を引き上げなければなりません。

---

## ヒットテストの説明

```typescript
function explainHitTest(scene: Scene, x: number, y: number): HitExplanation;
function formatHitExplanation(explanation: HitExplanation): string[];

type HitVerdict =
  'accepted' | 'invisible' | 'clipped' | 'pointer-transparent' | 'outside-shape' | 'occluded';

interface HitCandidate {
  entityId: string;
  entityPath: string;
  type: string;
  verdict: HitVerdict;
  reason: string;
  depth: number;
  worldBounds: Bounds;
  clipperId?: string;
  clipperPath?: string;
}

interface HitExplanation {
  x: number;
  y: number;
  hitId: string | null;
  hitPath?: string;
  candidates: HitCandidate[];
  root: 'overlay' | 'main' | 'none';
}
```

`pickInScene`はどのエンティティが勝ったかを教えます。`explainHitTest`は**他のすべてのエンティティがなぜ負けたか**を教え、これは答えが間違っているときに必要なものです。各候補は判定と一文の理由を保持します：

```ts
const why = explainHitTest(scene, 50, 50);
console.log(formatHitExplanation(why).join('\n'));
// hit test (50, 50) → Scene > Box#entity_d > Box#entity_k [main]
// ✗ OverlayRoot — point (50, 50) is outside its shape
//   ✗ Box — point (50, 50) is outside its shape
//     ✓ Box — inside its shape, unclipped, and accepts pointer input
//     · Box — would have been hit, but Box is drawn on top
```

グリフは`✓`がaccepted、`·`がoccluded、`✗`がそれ以外で、インデントは候補の深さです — 6段に制限されるため、より深いツリーは視覚的に平坦化されます。行はパスではなく`type`（コンストラクタ名）を保持し、兄弟エンティティは通常同じtypeを共有します：正確に特定したいときは`explanation.candidates[i].entityPath`を読んでください。

候補はエンジンがそれらを考慮するのと同じ最上位優先の順序で並びます。`occluded`は後処理で割り当てられることに注意してください：ポイントを受け入れていたであろう、勝者の下にあるエンティティは`accepted`から`occluded`に書き換えられます。つまり「このピクセルの下にいくつあるか」は数えることで答えられます。

`invisible`判定（`opacity <= 0`）は**サブツリーを刈り込みます** — 理由はスキップされた子孫の数を示すため、目に見えない枝全体が数十ではなく1つの候補として報告されます。

> [!IMPORTANT]
> これは診断であり、フレームごとの呼び出しではありません。エンジンが最初のヒットで戻るのに対し、`explainHitTest`は敗者を列挙するためにツリー全体を走査します。また常にJSの走査をミラーするため、WASMヒットグリッドを使うシーンでは1つのエッジケースで両者が食い違うことがあります：サイズゼロの`clipChildren`祖先は、WASMパスがヒットを登録している間、`clipped`として説明されます。

---

## イベントルーティングトレース

```typescript
function createEventTrace(scene: Scene, options?: EventTraceOptions): EventTrace;

class EventTrace {
  get entries(): readonly EventTraceEntry[];
  subscribe(listener: (entry: EventTraceEntry) => void): () => void;
  clear(): void;
  destroy(): void;
}

interface EventTraceOptions {
  capacity?: number; // retained records, default 50
  includeGlobalKeyboard?: boolean; // default true
}

type EventTraceType =
  'pointerdown' | 'pointerup' | 'pointercancel' | 'pointermove' | 'wheel' | 'keydown' | 'keyup';

type EventTraceSource = 'a11y' | 'content' | 'canvas' | 'document';
```

```ts
const trace = createEventTrace(scene, { capacity: 100 });
trace.subscribe((entry) => {
  console.log(entry.source, entry.targetPath, entry.defaultPrevented);
});
```

各エントリは解決されたターゲットエンティティ、シーン座標とローカル座標、修飾キー、そして最終的な`defaultPrevented`を記録します。`source`はブラウザイベントがどのサーフェスに到着したかを示します：`canvas`、`a11y`投影、選択可能な`content`ミラー、またはグローバルキーボード用の`document`。

レコードは**マイクロタスクで確定**するため、`defaultPrevented`はアプリケーションの最終的なショートカットや選択の決定を反映し、ディスパッチ途中の値ではありません。実際的な結果として、イベントをディスパッチした直後は`entries`が空です — テストはアサート前にマクロタスクを待たなければなりません。

ポインタートレースには`pointercancel`が含まれ、中断されたドラッグや選択トランザクションが`pointerdown`の後の診断ギャップになる代わりに見えるようになります。`pointerdown` → 移動 → ちょうど1つの`pointerup`（コミット）**または**`pointercancel`（ロールバック）を期待してください；欠落した終端エントリは、エンティティが投影されなかったかキャプチャが迂回されたことを意味します。

> [!IMPORTANT]
> `EventTrace`は14個のドキュメントリスナーをアタッチし、モデルレイヤーで**必ず**破棄しなければならない唯一のオブジェクトです。診断サーフェスがアンマウントされたら`trace.destroy()`を呼んでください。また`entries`はコピーではなくライブの内部配列を返すことにも注意してください — レコードが到着してキャパシティで退避されるにつれて、あなたの下で変化します。安定したビューが必要ならコピーしてください。

ブラウザの外ではコンストラクタは何もアタッチせずインスタンスは不活性なので、共有テストヘルパーは無条件に1つ構築できます。

---

## デバッグワークフロー

| 症状                                                    | ワークフロー                                                                                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 「このピクセルを所有しているエンティティは？」          | `pickInScene(scene, x, y)` → `inspectEntity(hit)`                                                                                             |
| 「このピクセルを間違ったエンティティが所有している」    | `explainHitTest(scene, x, y)` — 負けた理由とともにすべての敗者                                                                                |
| 「なぜこのエンティティの位置/サイズが間違っているのか」 | ワールド境界+トランスフォームを`inspectEntity`で取得し、`entityPath`を上にたどる — 境界が最初に間違っている祖先がバグの持ち主                 |
| "`x`への書き込みが元に戻り続ける"                       | `inspectEntity(e).layoutControlled` — そのプロパティは親コンテナが所有                                                                        |
| 「クリックターゲットが視覚からずれている」              | `highlightGeometry(scene, e)`を実行し、`a11y`または`content`で`divergesFromLayout`を探す                                                      |
| 「この図形のクリック可能領域が間違っている」            | `sampleHitRegion(e)` — ボックスではなく実際のヒット領域                                                                                       |
| 「スクリーンリーダーが何も/間違ったことを言う」         | `accessibleName`+`nameSource`は`inspectA11y(scene, e)`で；読み上げ順序は`a11yReadingOrder(scene)`で                                           |
| 「このテキストが間違った順序で描画される」              | `inspectText(e)` — bidiレベル、レベルラン、視覚的順序                                                                                         |
| 「グリフが空白ボックスとして描画される」                | `inspectText(e).glyphs` — `atlasMiss`とフラグ付けされたエントリ                                                                               |
| 「クリック/ホイール/キー押下が間違った場所に行く」      | `createEventTrace(scene)` — source、ターゲットパス、座標、最終的な`defaultPrevented`                                                          |
| 「テキストのドラッグ選択やコピーが横取りされる」        | `entry.source === 'content'`のイベントトレース — イベントは選択可能な投影上で始まった                                                         |
| 「ドラッグが固まる/決してコミットされない」             | ポインタートレースはトランザクショナル：`pointerup`/`pointercancel`の欠落は、エンティティが投影されなかったかキャプチャが迂回されたことを意味 |

---

[Devtools概要](/reference/devtools/) · [監査](/reference/devtools-audit/) · [パフォーマンス](/reference/devtools-perf/) · [ブリッジとプラグイン](/reference/devtools-extend/)
