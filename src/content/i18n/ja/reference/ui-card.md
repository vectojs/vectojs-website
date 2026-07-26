---
title: 'UI: Card'
description: 'オプションの role=group セマンティクスを備えた角丸canvasパネルコンポーネント。'
order: 20
---

# `Card`

`Card` は `@vectojs/ui` の例全体で使用される基本の視覚パネルです。デフォルトでは装飾的です。`label` を渡すとセマンティックなグループになります。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Card</span></div>
  <iframe src="/sandbox/ui/component.html?name=card&v=core-1.17.0-ui-2.2.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Card live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>カードは背景とボーダーを所有します。子要素はカードのローカル空間に配置されます。</figcaption>
</figure>

## 最小限の例

```ts
import { Card, Text } from '@vectojs/ui';

const card = new Card({
  width: 320,
  height: 180,
  radius: 18,
  border: 'rgba(148,163,184,0.2)',
  label: 'Settings panel',
});

card.add(new Text('Settings').setPosition(24, 24));
scene.add(card);
```

## カード全体のクリックターゲット

`onClick`を渡すと、カード全体を押下可能にします — 透明な`Button`を`Card`の上に重ねてクリック可能にする必要がなくなり、従来は空ラベルのボタンでa11yプロジェクションを汚染し、シーン監査で`overlap`ノイズを発生させていました。`onClick`には`label`が必要です：アクセシブルな名前のないインタラクティブ領域では同じ問題が1レベル上で再現されるため、`Card`は黙って受け入れる代わりにエラーをスローします。

```ts
const card = new Card({
  width: 320,
  height: 96,
  label: 'Open settings',
  onClick: () => openSettingsPanel(),
});
```

## ホストされるコンテンツのサイズ設定（`setContent`）

`Card.setContent(content, fit?)`は、カード内に単一のコンテンツエンティティを配置し、デフォルトでその`width`/`height`をカード自身のボックスに同期させます — `Panel.setContent`が使用するのと同じ`fitContent`契約です（[`ResizablePanel`](/reference/ui-resizable-panel/)を参照）。`fit`のデフォルトは`true`（両軸追跡）です。`false`または軸ごとに`{ width, height }`を渡すと、従来の位置のみの動作にフォールバックします。

```ts
const card = new Card({ width: 320, height: 180 });
card.setContent(new SomeContentEntity()); // 320×180にサイズ設定、card.width/heightの変更時に再同期
```

これは通常の`add()`とは別です：手動で配置するデコレーション（アイコン、ラベル）には`add()`を使用し、カードのリサイズに関係なく開発者が指定したサイズを維持します。カードを常に埋めるべき単一のエンティティには`setContent()`を使用します。

自己サイズ設定コンテンツには`fit: false`を渡してください — 自身の`width`/`height`が開発者設定ではなくコンテンツから導出されるエンティティ（例：`maxWidth`なしの裸の`Text`）です。デフォルトの`fit: true`はそのエンティティの自己計算されたボックスを毎フレーム上書きします。カード内で中央揃え/フィルさせたい場合は、先に`Stack`/`Flow`でラップするか、`fit: false`で自分でサイズ設定してください。詳細は[Resizable panels](/reference/ui-resizable-panel/)の完全な説明を参照してください — 同じ`fitContent`契約、同じ注意点です。

## メンテナー向けチェックリスト

- 領域を発見可能にすべき場合のみ `label` を使用します。
- `padding` が子要素を自動レイアウトすると想定しないでください。
- メンテナンスしやすいレイアウトのために、カード内では `Stack` または `Flow` を推奨します。
- カード全体のクリックターゲットには、オーバーレイ`Button`を重ねるよりも`onClick`を優先します。
- カードを埋める単一のエンティティには、`add()` + 手動サイズ同期よりも`setContent()`を優先します。
