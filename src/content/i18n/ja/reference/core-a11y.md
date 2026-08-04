---
title: 'a11yRoot & エージェント契約'
description: 'すべてのインタラクティブエンティティが透過的なARIAシャドウノードをDOMに投影する仕組み — A11yAttributesの形状、キャンバスパフォーマンスとDOMグレードのアクセシビリティ契約、そして古くなったり欠落したシャドウノードを引き起こす同期の注意点。'
order: 10
---

# a11yRoot & エージェント契約

[`@vectojs/core`](/reference/core-api/) の一部です。

ボックスを持つすべてのインタラクティブエンティティは、Sceneの `a11yRoot` div（キャンバスの上、`pointerEvents:auto` で自動化/ATが操作可能、`debugA11y` 以外は `opacity:0`）に**透過的なARIAシャドウノード**を投影します。各ノードは [`Entity.getA11yAttributes()`](/reference/core-entity/#a11y--バッチングフックオーバーライドしてオプトイン) からの `id` + `data-vecto-id`、およびロール/ラベル/状態を保持します。

投影ルートはキャンバスのCSSボックスを追跡します：キャンバスのオフセットと不均一なCSSスケーリングがシャドウおよびDOMポータルレイヤーに適用される一方、エンティティジオメトリは論理的なScene座標のままです。キャンバスの任意のCSS回転/スキューはこのマッピングの対象外です。

`A11yAttributes`:

```ts
{
  // Element + identity
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea';   // デフォルト 'div'
  role?: string;
  label?: string;                      // aria-label
  labelledby?: string;                 // aria-labelledby
  describedby?: string;                // aria-describedby

  // Focus & pointer
  tabIndex?: number;
  pointerEvents?: 'auto' | 'none';     // default 'auto'

  // Native element attributes (only for the matching `tag`)
  href?: string; target?: string;      // tag: 'a'
  src?: string; alt?: string;          // tag: 'img'
  inputType?: string; placeholder?: string; value?: string;
  textInputStyle?: TextInputStyle;     // native editor typography

  // State
  checked?: boolean; disabled?: boolean; selected?: boolean;
  expanded?: boolean; required?: boolean; invalid?: boolean;
  valuemin?: string; valuemax?: string;
  level?: number;                      // aria-level (headings, tree items)

  // Relationships & popups
  controls?: string; haspopup?: string; activedescendant?: string;
  ariaModal?: 'true' | 'false';        // aria-modal on a role="dialog"

  // Live regions
  live?: 'off' | 'polite' | 'assertive';
  atomic?: boolean;                    // aria-atomic
  relevant?: string;                   // aria-relevant
}
```

各フィールドは毎フレームダーティチェックで実際の属性に投影されます。`undefined` を返すと属性が**削除**されるため、適用されなくなった状態は古くなるのではなく消滅します——`false` と `undefined` はここでは異なる点に注意してください（`aria-invalid="false"` は「明示的に有効」として保持されます）。

同期はこれらを実際の要素（真の `<button>`、`<a href>`、`<img>`、IME対応の `change`/`focus`/`blur` を持つ `<input>`/`<textarea>` など）に適用します。これが「**キャンバスパフォーマンスとDOMグレードのアクセシビリティ**」の話です：ビジュアルは100% GPU/キャンバスである一方、Playwright/エージェントの `getByRole('button', { name })` はシャドウノードを解決してクリックできます。

## フォーカス順序

ネイティブでフォーカス不可のインタラクティブロール（`button`、`switch`、`checkbox`、`link`、`slider`、…）には `tabindex="0"` と Enter/Space → `click` が付与されます。

**複合ウィジェットは異なります。** `tree`、`grid`、`menu`、`radiogroup`、または `tablist` は子ごとに1つのタブストップではなく、1つのみです——そのため子は**ロービング tabindex**を使用します：正確に1つの子が `tabIndex: 0` を持ち、残りは `-1` で、矢印キーがそのストップを移動します。[複合ウィジェット](#複合ウィジェットロービング-tabindex)を参照してください。

タブ順序はシーングラフの挿入順ではなく、**ビジュアル**な読み取り順に従います——RTLについては [`Scene.readingDirection`](/reference/core-scene/#アクセシビリティと外観) を参照してください。

デザインキャンバスなどの非コントロール領域が順次フォーカス順序に入り、VMTの `keydown` イベントを受け取る必要がある場合は、`tabIndex: 0` を明示的に設定してください。プログラムによるフォーカスのみの場合は `-1` を使用し、`undefined` を返すと明示的な値が削除されます。

## 複合ウィジェット（ロービング tabindex）

ツリー、グリッド、メニュー、ラジオグループ、またはタブリストは、コンテナロールだけでなく各子に**1つのロール**を公開する必要があります——さもなければATは不透明なボックスとしてしか見ません。VectoJSは各可視な子の上に透過的でフォーカス可能な子エンティティ（「ホットスポット」）をプールすることでこれを実現します：子の `role` + 状態 + ロービング `tabIndex` を持ち、何もレンダリングせず、親がキーボードハンドラーを所有します。

重要なのは、これらのホットスポットが `pointerEvents: 'none'` を設定している点です。下位コンポーネントがすでにマウスを所有しているため（タップで切り替え、ドラッグでスクロール、選択可能なセルテキスト）、ホットスポットはそれらをインターセプトしてはなりません——キーボードフォーカスとAT合成の `click` は `pointer-events:none` の要素を通じて引き続き動作します。

| コンポーネント | 子ロール                                                       | キーボード操作                                                                                                                                             |
| -------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TreeView`     | `treeitem`（+ `aria-level`、`aria-expanded`、`aria-selected`） | Up/Down移動 · Right展開してから入る · Left折りたたんでから親に戻る · Home/End · Enter/Spaceアクティベート                                                  |
| `Table`        | `row` › `gridcell` / `columnheader`                            | 矢印キーで2D移動（ヘッダーはrow −1）· Home/End行の端 · Ctrl+Home/Ctrl+Endグリッドの角                                                                      |
| `ContextMenu`  | `menuitem`（+ `aria-haspopup`、`aria-expanded`）               | Up/Downでラップしセパレーターと無効をスキップ · Home/End · Rightでサブメニューを開く · Leftで親メニューに戻る · Enter/Spaceアクティベート · Escapeで閉じる |
| `RadioGroup`   | `radio`（+ `aria-checked`）                                    | 矢印キーで移動して選択 · Home/End · Spaceで選択                                                                                                            |
| `Tabs`         | `tab`（+ `aria-selected`）                                     | 矢印キーで移動 · Home/End · Space/Enterアクティベート                                                                                                      |

可視な子のみがプールされるため、バーチャライズされた `TreeView` や `Table` はデータセットの各行ではなくO(viewport)個のホットスポットを投影します。フォーカスされた行/セルはフォーカスが移動する前にビューにスクロールされます。

## 強制カラーハイコントラスト

キャンバスは不透明なピクセルであり、ブラウザの `forced-colors` リマッピングはVectoJSが描画するものに決して触れません——Windowsハイコントラストでは、コンポーネントが自身を再描画しない限り、テーマ付きコントロールは読めないままです。[`Scene.forcedColors`](/reference/core-scene/#アクセシビリティと外観) を参照し、CSSシステムカラー（`ButtonFace`、`ButtonText`、`Highlight`、`Canvas`、`CanvasText`）で描画してください。設定が切り替わるとシーンが自動的に再描画します。`Button`はすでにこれを行っています。

## 高いエンティティ数における投影コスト（`1.30.0+`）

ボックスを持つインタラクティブなエンティティは、インタラクティブである限りシャドウノードを得ます。これはボタンには正しく、粒子、danmaku コメント、グラフノードのような、数千個の一時的で個別には意味を持たないエンティティには誤っています。そこではエンティティごとに 1 つの DOM ノードが毎フレーム生成されるためです。

5,000 個の動くインタラクティブなエンティティで測定：

|                                        | Chrome        | Firefox        |
| -------------------------------------- | ------------- | -------------- |
| すべてのエンティティがインタラクティブ | 66.4 ms/frame | 114.7 ms/frame |
| `a11yProjection: 'onDemand'`           | 2.23 ms       | 1.69 ms        |
| シャドウノードがまったくない           | 1.35 ms       | 1.75 ms        |

eager の 2 行はどちらも 60 Hz の予算にすら届きません。`'onDemand'` は「何も投影しない」場合の下限に達しつつ、すべてのエンティティが個別に到達可能なままです。

`Entity.a11yProjection` はノードがいつ実体化されるかを選択します：

```ts
particle.a11yProjection = 'onDemand';
```

- **`'eager'`**（デフォルト）——エンティティがボックスを持ちインタラクティブである間、ノードが存在します。動作は変わりません。通常のコントロールではそのままにしてください。
- **`'onDemand'`**——エンティティが**関与されている**間のみノードが存在します。カーディナリティの高いインタラクティブなエンティティに使用します。
- **`'never'`**——ノードはまったくありません。エンティティが意味的な存在なしにポインターイベントを本当に必要とする場合を除き、`interactive = false` を優先してください。

### 何が関与とみなされるか

3 つのシグナルがあり、いずれか 1 つで十分です。意図的にホバー**だけ**にはしていません：キーボードやスクリーンリーダーの利用者はポインターイベントを発生させないため、ホバーで制御されるノードは、まさにそれが存在する理由である利用者から取り上げられてしまいます。

- **フォーカス。** フォーカスされたノードは決して刈り取られないため、操作の途中でフォーカスを奪われることはありません。
- **ポインターがエンティティの内部にあること。**
- **明示的なリクエスト**——以下を参照。

エンティティは全体を通じて canvas 上でヒットテスト可能なままなので、クリックは常にそれに到達し、昇格させます。

```ts
// Keep the selected item projected for as long as it is selected.
scene.requestA11yProjection(selected);
scene.releaseA11yProjection(previous);
```

どちらも `Entity` または id 文字列を受け取り、冪等です。リリースはノードを直ちに削除しません——フォーカスされている間やポインターの下にある間は存続し、関与されていないと判明した次の同期で刈り取られます。`'eager'` のエンティティでは常に投影されているため、どちらも何もしません。

アプリケーションだけが重要性を知っているものには、明示的なリクエストを使用してください：選択項目、検索ヒット、ライブリージョンでアナウンスされた直後の要素など。

> [!IMPORTANT]
> 自身で**選択可能なテキスト**を投影するエンティティは、ポインターによって昇格されることはありません。そのシャドウノードは `pointer-events: auto` を持ち、透明なテキストミラーの上に重なるため、ポインターの下でノードを実体化すると `mousedown` が飲み込まれ、ネイティブのドラッグ選択が始まらなくなります。フォーカスと明示的なリクエストは依然として到達します。これは [`Text`](/reference/ui-text/) と `RichText` をデフォルトで非インタラクティブにしているのと同じ衝突です。

カーディナリティそれ自体が `'onDemand'` に手を伸ばす判断基準ではなく、次のケースが最も誤られやすいものです：

> [!WARNING]
> **粒子との類推で `'onDemand'` を本文テキストに適用しないでください。** ボタンやグラフノードでは canvas のエンティティが主体で、シャドウノードは一時的な意味的プロキシなので、関与されるまで与えないことで失われるものはありません。しかし散文、Markdown、チャットのトランスクリプトでは、canvas のビットマップはスクリーンリーダーから**まったく読めず**、非視覚的な利用者にとって**読むことが主要なインタラクション**であり、時折の操作ではありません。テキストエンティティはデフォルトで非インタラクティブであり、その意味を担うのはシャドウノードではなく[コンテンツ投影](/reference/core-renderer/#entitygetcontentprojection)です。その投影は行単位で仮想化され、常駐したままになります。

また、個別に到達できることは、理解できることと同じではありません：

> [!NOTE]
> `'onDemand'` はそれ自体で完全なアクセシビリティの解決策ではありません。個別に到達可能な 1,000 件の danmaku も、全体としては何も語りません。1 つの集約されたライブリージョン（`role: 'status'`、`a11yFullViewport`）と、現在の選択のための少数の常駐ホットスポットのプールを組み合わせて、DOM ノード数がエンティティ数に比例せず一定に保たれるようにしてください。

## 制御と注意点

- 各シャドウノードの `data-vecto-id` はエンティティの `id` を反映します — 自動化セレクターの安定したハンドルです。
- `a11ySyncInterval`（[`SceneOptions`](/reference/core-scene/#sceneoptions) を参照）はアニメーション中の同期をスロットルし、保留中のモーションが落ち着いた後の最終キャッチアップを保証します；アニメーション全体を通してすべての同期を中断するわけではありません。
- `debugA11y: true` は開発用にノードを（青い破線で）表示します。
- `detachA11y(entity)` はエンティティを削除せずにサブツリーのシャドウノードを削除します；`remove()` は自動的に削除します。フレームごとの同期は**作成/更新を行いますが、削除は行わない**ため、インタラクティブな子エンティティの増減は明示的に管理してください。
- `getA11yTree()` はネストされた `A11yTreeNode[]` スナップショットをアサーション用に返します；`getA11yElement(id)` は特定のシャドウ要素を取得します。
- `a11yFullViewport` は他のすべての背後に境界のないインタラクション面をマウントします。
- Core 1.11.1 以降、新しく投影されたインタラクティブエンティティは、shadow node が作成される同じフレームで Canvas の描画順に対応する `z-index` を受け取ります。そのため、新しいオーバーレイの backdrop は次のレンダーパスを待たず、最初のポインター操作から既存のデザインコントロールより上に配置されます。

使用法とテストパターンについては [アクセシビリティ](/learn/accessibility/) を参照してください。

## 関連情報

[`Scene`](/reference/core-scene/)（`a11ySyncInterval`、`debugA11y`） ·
[`Entity`](/reference/core-entity/)（`getA11yAttributes()`、`interactive`、`width`/`height`） ·
[`@vectojs/core` 概要](/reference/core-api/)
