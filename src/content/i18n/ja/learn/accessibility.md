---
title: 'アクセシビリティと自動化'
description: 'VectoJSがキャンバスコンテンツ上にセマンティックDOMを投影し、スクリーンリーダー・キーボードユーザー・Playwright自動化を実現する方法。'
order: 15
---

# アクセシビリティと自動化

CanvasやWebGLのピクセルは、それ自体では意味情報を持ちません。対象となるインタラクティブエンティティに対して、VectoJSは`a11yRoot`オーバーレイ内に実際の不可視DOM要素を維持します。スクリーンリーダー、キーボードナビゲーション、自動化ツールはこれらの要素とやり取りでき、キャンバスバックのレイヤーが視覚を提供します。これは投影レイヤーであり、ブラウザのShadow DOM APIではありません。アプリケーションは正しいセマンティクスとテストを自身で確保する必要があります。

## シャドウDOM投影の仕組み

`interactive = true`（かつ非ゼロのボックス）を持つエンティティがあると、`Scene`は実際のHTML要素（`<button>`、`<input>`、`<a>`など）を作成し、絶対CSSでキャンバスの上に配置します。この要素には`opacity: 0`と`pointer-events: auto`が設定され、目には見えませんがアクセシビリティツールには完全に機能します。

<figure>
  <img src="/images/shadow-dom-layers.svg" alt="3つの積層レイヤーを示す図：z-index 0のGPUレンダリングコンポーネントを持つキャンバス、z-index 9のDOMポータルレイヤー、z-index 10の透明な実際のDOM要素（buttonやinput）を含むA11yシャドウレイヤー。ポインターカーソルの矢印が最初に最上層に当たる。" class="diagram" />
  <figcaption>キャンバス親内の3つのレイヤー。a11yレイヤーのみが<code>pointer-events: auto</code>を持つため、クリックはキャンバスに到達する前に実際のシャドウ要素に届く。</figcaption>
</figure>

a11yレイヤーはキャンバスの親`<div>`内に配置され、`Scene`は自動的にそれを`position: relative`に強制します。

レンダリングフレームごとに（`a11ySyncInterval`で間引き）、Sceneは以下を行います：

1. 各インタラクティブエンティティの`getA11yAttributes()`を読み取る。
2. 対応するシャドウノードを作成または更新する（ダーティチェックでDOM書き込みを最小化）。
3. エンティティの完全なワールドアフィン行列とローカルの`width × height`を適用する。投影ルートは論理シーン座標をキャンバスのCSSボックスにマッピングする。

キャンバスのオフセットや非一様なCSSスケーリングはサポートされています。キャンバスの任意のCSS回転/スキュー下での位置合わせは想定せず、実際のページで`debugA11y`を使用して検証してください。

> [!NOTE]
> 同期はフレーム中に**決して削除を行いません**。コードがインタラクティブな子エンティティを頻繁に追加・削除する場合は、破棄する前に`scene.detachA11y(entity)`を呼び出すか、シャドウノードがリークします。`scene.remove(entity)`は再帰的に安全に削除します。

## オプトイン：`entity.interactive`

```typescript
entity.interactive = true; // シャドウノード + ポインター/キーボードイベントを有効化
entity.width = 120;
entity.height = 40; // width > 0 の場合のみシャドウノードが作成される
```

`interactive = true`を設定すると副作用があります：`a11yNeedsReorder`にフラグを立て、`scene.markDirty()`を呼び出します。

## シャドウノードの制御：`getA11yAttributes()`

`getA11yAttributes()`をオーバーライドして、要素タイプ、ARIAロール、およびセマンティック状態を指定します：

```typescript
import type { A11yAttributes } from '@vectojs/core';

class AccessibleBtn extends Entity {
  label = 'Submit';

  getA11yAttributes(): A11yAttributes {
    return {
      tag: 'button',
      role: 'button',
      label: this.label,
    };
  }
}
```

完全なインターフェース：

```typescript
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // デフォルト：'div'
  role?: string; // ARIAロール（例：'switch', 'slider', 'combobox'）
  label?: string; // aria-label / アクセシブル名
  tabIndex?: number; // 非コントロールキーボード領域の明示的フォーカス順
  href?: string; // tag='a' の場合 — 実際のリンクになる
  src?: string; // tag='img' の場合
  alt?: string; // tag='img' の場合
  inputType?: string; // tag='input' の場合 — 'text', 'checkbox' など
  placeholder?: string; // input/textareaのプレースホルダー
  value?: string; // input/textareaの現在値
  checked?: boolean; // input[type=checkbox] または aria-checked（role=switchの場合）
  disabled?: boolean;
  expanded?: boolean; // aria-expanded（コンボボックス、開示ウィジェット用）
  controls?: string; // aria-controls（別の要素のidを指す）
  haspopup?: string; // aria-haspopup
  selected?: boolean; // aria-selected（リストボックスオプション用）
  activedescendant?: string; // aria-activedescendant（複合ウィジェット用）
  valuemin?: string; // aria-valuemin（スライダー、メーター用）
  valuemax?: string; // aria-valuemax
}
```

ボタンやフォームコントロールではないがキーボードショートカットを所有する必要があるキャンバスワークスペースには、明示的な`tabIndex: 0`を使用します：

```typescript
getA11yAttributes(): A11yAttributes {
  return { role: 'region', label: 'Design canvas', tabIndex: 0 };
}
```

ネイティブのinput、textarea、編集可能コンテンツは、自身の編集ショートカットを管理させてください。Sceneは属性が変更されたときに明示的なタブインデックスを更新します。

### 組み込みコンポーネントの投影

| コンポーネント       | シャドウ要素              | 主なARIA属性                                                    |
| -------------------- | ------------------------- | --------------------------------------------------------------- |
| `Button`             | `<button>`                | `role="button"`, `aria-label`                                   |
| `Link`               | `<a href>`                | ネイティブリンク, `aria-label`                                  |
| `Image`              | `<img>`                   | `src`, `alt`                                                    |
| `Input`              | `<input type="text">`     | `placeholder`, `value`（リアルタイム）                          |
| `TextArea`           | `<textarea>`              | `placeholder`, `value`（リアルタイム）                          |
| `Checkbox`           | `<input type="checkbox">` | `checked`（リアルタイム）, `aria-label`                         |
| `Toggle`             | `<div role="switch">`     | `aria-checked`（リアルタイム）, `aria-label`                    |
| `Slider`             | `<div role="slider">`     | `aria-valuenow/min/max`（リアルタイム）                         |
| `Dropdown`           | `<div role="combobox">`   | `aria-expanded`, `aria-controls`, メニュー項目は`role="option"` |
| `Card`（ラベル付き） | `<div role="group">`      | `aria-label`                                                    |
| `Table`              | `<div role="grid">`       | 行/列数を含む`aria-label`                                       |
| `Text`               | `<div>`                   | `aria-label` = テキスト内容                                     |

## IME対応入力フィールド

`Input`と`TextArea`は、テキスト入力に**実際の透明なシャドウ`<input>`/`<textarea>`要素**を使用します。これにより：

- IME変換（中国語、日本語、韓国語、アラビア語）がネイティブに動作 — ブラウザが候補ウィンドウを処理します。
- テキスト選択、クリップボード（切り取り/コピー/貼り付け）、元に戻す/やり直しはすべてネイティブです。
- キャンバスは**純粋なビジュアルミラー**です：`change`イベントから`value`、`selectionStart`、`selectionEnd`、`composition`を読み取り、キャレット、選択ハイライト、IME下線を描画します。

入力がフォーカスされている間、同期は同じユーザー同期値を書き戻すことを避けます。アプリケーションの状態が真に異なる値を提供する場合は適用されます。そのため、制御コンポーネントはテキストを置き換える際に意図的に選択範囲を保持する必要があります。

## 静的コンテンツ投影

インタラクティブコントロールはa11yノードを投影します。静的コンテンツ投影は非インタラクティブ側をカバーします：静的テキストをレンダリングするエンティティは`getContentProjection()`を介してそれを公開し、Sceneはそれを描画されたグリフの上に**透明で位置同期されたDOMノード**としてミラーリングします。スクリーンリーダー、Ctrl+F、クローラー、翻訳拡張機能は、キャンバス上に視覚的にレンダリングされたテキストを見ることができます。

```typescript
// 組み込み：TextEntityおよびMSDFTextEntityはコンテンツを公開。Text、RichText、
// Markdown、コードブロック、Tableセルのテキストはデフォルトで選択可能。

// カスタムエンティティも同じ方法でオプトイン：
class Caption extends Entity {
  label = 'Rendered on canvas, found by Ctrl+F';
  getContentProjection() {
    return { text: this.label, font: '16px sans-serif' };
  }
  // …render()は同じ文字列を描画…
}
```

これにより、追加作業なしで以下のことが可能になります：

- **ページ内検索** — Ctrl+Fで一致。ブラウザのハイライトボックスが透明グリフの背後にレンダリングされます。
- **スクリーンリーダーとクローラー** — ソース順に実際のテキストを読み取ります。
- **翻訳拡張機能とリーダーモード** — 投影レイヤー上で動作します。
- **`#:~:text=`** フラグメントリンクが解決されます。
- **ネイティブマウス選択** — カスタムエンティティごとに`selectable: true`でオプトイン（`::selection`ハイライトは透明グリフの背後に描画）。コア投影はデフォルトでオフになっているため、任意のテキストがキャンバス入力を妨害しません。UIのText/RichText/Markdown/Tableコンテンツはデフォルトで選択可能で、`setSelectable(boolean)`を公開します。

ピクセル精度の選択には、キャンバスのベースラインを信頼できる情報源として扱います：単一のランの場合は`baseline`（および`contentX`/`contentY`）を使用し、折り返し、インセット、または混合サイズのテキストの場合は明示的なビジュアル`lines`を使用します。Core 1.8はこれらのローカル座標をトランスフォームを通じてマッピングし、投影された各ランに同じCSSラインボックスを与えます。論理ソースが改行または保持されたソフトラップセパレーターで終わる場合、ビジュアル行に`separatorAfter`を設定します。Sceneはそのセパレーターを行の最終テキストノードにマージし、Firefoxがマルチライン選択の一部を投影ルートに配置できないようにします。`text`は信頼できる論理Unicodeソースのままであり、整形された視覚的なグリフ順序に置き換えてはなりません。ページレベルのCSSオフセットで補償しないでください。

選択可能な通常テキスト、明示的なビジュアル行、および行のないカスタム投影は、変換された2次元ジオメトリ内で書記素キャレットを解決します。回転、ミラートランスフォーム、非一様スケール、分数DPR、ブラウザズームは、ビューポートXへのポインタールーティングを低下させません。コード系エンティティはさらに、Canvasペイントと`ContentProjection.grid`の間で`prepareContentGrid()`の結果を共有する必要があります。これにより、タブ、絵文字/ZWJ、CJK幅、アラビア語、双方向テキスト、クリップボードソース、選択ジオメトリが同じ保持された計画上に維持されます。

ネイティブの`Input`/`TextArea`実装では、`getA11yAttributes()`を介して`textInputStyle: { font, lineHeight, padding }`を公開します。Sceneはそれを`box-sizing: border-box`で透明エディターに適用し、キャンバスは同じパディングとラインボックスのベースラインから描画する必要があります。

注意事項：

- 投影は**ビューポートとクリップに対して遅延評価**されます：Sceneまたは`clipChildren`祖先の外側にあるテキストは`display: none`となり、入力をインターセプトできません。
- 動的投影はVMTソース順に並び替えられます。サブツリーを削除すると、すべての子孫投影が削除されます。
- エンティティが`interactive`でもある場合、そのテキストコピーは`aria-hidden`になり、スクリーンリーダーが2回読み上げるのを防ぎます。
- 純粋に装飾的なシーンの場合は、`new Scene(canvas, { contentProjection: false })`でレイヤー全体を無効にします。
- ブラウザの検索は具体化されたコンテンツをカバーします。アプリケーションがマウントしていない仮想化エンティティを検索することはできません。
- グローバルショートカットルーターは、`window.getSelection()?.isCollapsed === false`の場合にネイティブコピーに譲らなければならず、アプリケーションが意図的にブラウザの検索を置き換えない限り、Ctrl/Command+Fを抑制してはいけません。

## `debugA11y`オプション

`SceneOptions`で`debugA11y: true`を有効にすると、シャドウノードが開発中に可視になります — 青い破線の枠線で表示されます：

```typescript
const scene = new Scene(canvas, { debugA11y: true });
```

ブラウザのDevTools → Elementsを開くと、キャンバス上に配置された実際の`<button>`、`<input>`、`<a>`要素が表示されます。これはロール、ラベル、位置が正しいことを確認する最も速い方法です。

## `a11yFullViewport` — 境界のないサーフェス

一部のエンティティはSceneビューポート全体をカバーします（無限キャンバス、ジェスチャ認識、背景クリックトラップ）。これらには意味のあるバウンディングボックスがありません。`a11yFullViewport = true`を設定すると、キャンバスのCSSボックスに追従するSceneサイズのシャドウノードが投影されます：

```typescript
class PanGesture extends Entity {
  constructor() {
    super();
    this.interactive = true;
    this.a11yFullViewport = true; // width/heightは不要
  }

  getA11yAttributes() {
    return { role: 'application', label: 'Pan and zoom canvas' };
  }
}
```

フルビューポートノードは他のすべてのシャドウノードの**背後**に配置されるため、上部のコンポーネント（ボタン、入力）はクリック可能なままです。

## `a11ySyncInterval` — アニメーション中のスロットリング

デフォルトでは、シャドウDOMはレンダリングフレームごとに同期されます。多数のインタラクティブエンティティが同時にアニメーションするUIでは、この同期がフレーム時間を支配する可能性があります。次のようにスロットルします：

```typescript
const scene = new Scene(canvas, { a11ySyncInterval: 100 });
// シャドウDOMはアニメーション中、最大でも100msに1回だけ更新される
```

インターバルはアニメーションの実行中にチェックされます。`a11ySyncInterval: 100`は同期を最大で約毎秒10回に制限し、モーションが収まった後に最終キャッチアップをスケジュールします。アクセシビリティのレイテンシーと測定されたDOMコストに基づいて間隔を選択してください。

## シャドウツリーのプログラムによる検査

```typescript
// すべての投影シャドウノードのネストされたスナップショットを取得
const tree = scene.getA11yTree();
// 戻り値：A11yTreeNode[] — { id, tag, role, label, value, children, ... }

// 特定のエンティティの実際のHTMLElementを取得
const el = scene.getA11yElement(entity.id);
el?.focus(); // プログラムでシャドウノードにフォーカス
```

## Playwright統合

すべてのインタラクティブエンティティが実際のDOM要素を投影するため、標準のPlaywrightセレクターが特別なアダプターなしで機能します：

```typescript
import { test, expect } from '@playwright/test';

test('toggle switches physics engine', async ({ page }) => {
  await page.goto('/demos/nexus');

  // Toggleが<div role="switch" aria-label="Physics">を投影するため動作
  const toggle = page.getByRole('switch', { name: 'Physics' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
});

test('search input filters results', async ({ page }) => {
  await page.goto('/');

  // Inputが実際の<input type="text" placeholder="Search…">を投影
  await page.getByPlaceholder('Search…').fill('spring');
  await expect(page.getByRole('option')).toHaveCount(3);
});

test('button is keyboard accessible', async ({ page }) => {
  await page.goto('/demos/chat');

  // Tabでボタンへ移動、Enterを押す
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
});
```

### `data-vecto-id`による選択

各シャドウノードは`entity.id`に等しい`data-vecto-id`属性を持ちます。ラベルテキストの変更後も安定したセレクターを使用する場合：

```typescript
const entity = new Button('Submit');
entity.id = 'submit-btn'; // またはコンストラクタでsuperにidを渡して設定

// Playwright内：
await page.locator('[data-vecto-id="submit-btn"]').click();
```

## スクリーンリーダーテストチェックリスト

- [ ] すべてのインタラクティブエンティティに`interactive = true`と非ゼロのボックスがある。
- [ ] `getA11yAttributes()`が意味のある`tag`と`label`を返す。
- [ ] `Input`/`TextArea`に`placeholder`がある（`aria-label`として使用）。
- [ ] `Checkbox`/`Toggle`の`checked`状態が`getA11yAttributes()`にリアルタイムで反映されている。
- [ ] `Slider`に`valuemin`、`valuemax`、`value`がすべてのレンダリングで設定されている。
- [ ] `Card`グループが論理領域を表す場合に`label`を持っている。
- [ ] Tab順序が妥当である（シャドウノードはDOM順に配置され、追加順と一致する）。
- [ ] `scene.getA11yTree()`を実行し、出力を検査して欠落ラベルを確認する。
- [ ] `debugA11y: true`を有効にし、ノード位置がキャンバスコンポーネントと一致することを目視確認する。

## トラブルシューティング

### シャドウノードの位置がキャンバスコンポーネントからずれている

2つの一般的な原因：

1. **キャンバスの親が`position: relative`でない** — `Scene`はこれを毎フレーム自動設定しますが、より高い特異度で`position: static`を強制するCSSルールがあると上書きされます。キャンバスの親要素の計算済みスタイルを確認してください。
2. **キャンバス親にCSS `transform`がある** — シャドウノードの絶対配置は最も近い位置指定祖先を基準にしますが、`transform`は新しいスタッキングコンテキストを作成し、オフセットを引き起こす可能性があります。`transform`を親ではなくキャンバス要素自体に移動してください。

以前に`a11yOffsetX` / `a11yOffsetY`を回避策として使用していた場合は、それらを削除し、代わりに根本的な位置の問題を修正してください。

### Playwrightの`getByRole()`が何も見つけない

以下を確認してください：

1. `entity.interactive`が`true`で、`entity.width > 0`である必要があります。
2. `getA11yAttributes()`が正しい`tag`と`role`を返す必要があります。`page.getByRole('button')`が動作するには、タグが`'button'`であるかロールが`'button'`である必要があります。
3. ラベルが一致している必要があります：`page.getByRole('button', { name: 'Submit' })`には属性で`label: 'Submit'`が必要です。
4. シーンが`start()`を呼び出している必要があります — a11y同期はレンダーループ中に行われます。

`scene.getA11yTree()`を使用して現在投影されているもののスナップショットを出力します：

```typescript
console.log(JSON.stringify(scene.getA11yTree(), null, 2));
```

### `scene.getA11yTree()`が空の配列を返す

a11yツリーは、`scene.start()`が少なくとも1フレーム実行された後にのみ生成されます。構築直後に同期的に`getA11yTree()`を呼び出すと空になります。`setTimeout`でラップするか、ユーザー操作の後に確認してください。

また、`entity.interactive = true`が設定されていることを確認してください — `interactive`なしのエンティティは決して投影されません。

> **次へ：** [UIコンポーネント](/learn/ui-components/) — すぐに使えるインタラクティブコンポーネントの完全セット。
