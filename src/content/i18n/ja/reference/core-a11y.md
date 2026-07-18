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
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea';   // デフォルト 'div'
  role?, label?, tabIndex?, href?, src?, alt?, inputType?, placeholder?, value?,
  checked?, disabled?, expanded?, controls?, haspopup?, selected?,
  activedescendant?, valuemin?, valuemax?
}
```

同期はこれらを実際の要素（真の `<button>`、`<a href>`、`<img>`、IME対応の `change`/`focus`/`blur` を持つ `<input>`/`<textarea>` など）に適用し、ダーティチェックでDOM書き込みを最小限に抑えます。ネイティブでフォーカス不可のインタラクティブロール（`button`、`switch`、`checkbox`、`link`、`slider`、…）には `tabindex="0"` と Enter/Space → `click` が付与されます。これが「**キャンバスパフォーマンスとDOMグレードのアクセシビリティ**」の話です：ビジュアルは100% GPU/キャンバスである一方、Playwright/エージェントの `getByRole('button', { name })` はシャドウノードを解決してクリックできます。

デザインキャンバスなどの非コントロール領域を順次フォーカス順序に入れ、VMTの `keydown` イベントを受け取る必要がある場合は、`tabIndex: 0` を明示的に設定してください。プログラムによるフォーカスのみの場合は `-1` を使用し、`undefined` を返すと明示的な値が削除されます。

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
