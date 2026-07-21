---
title: 'Overlay'
description: 'Tooltip、Popover、ContextMenu のためのフローティングUIプリミティブ。Sceneのオーバーレイルートを通じてマウントされます。'
order: 15
---

# Overlay

オーバーレイファミリーは、通常のエンティティツリーの上に一時的なUIをレンダリングします。オーバーレイは `scene.overlayRoot` を通じてマウントされるため、シーン座標と同じアニメーションシステムを使用しながら、クリップされたコンテナから抜け出すことができます。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Overlay</span></div>
  <iframe src="/sandbox/ui/overlay.html?v=core-1.15.0-ui-2.0.0" class="sandbox-frame component-demo-frame component-demo-frame-tall" loading="eager" title="Overlay live demo" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>ランチャーにホバーまたはクリックします。PopoverとContextMenuは、巨大なギャラリーでは捉えにくいオーバーフローの欠陥を避けるように配置されています。</figcaption>
</figure>

## 最小限の例

```ts
import { Button, Popover, Text } from '@vectojs/ui';

const target = new Button('Click · Popover').setPosition(40, 40);
const popover = new Popover({
  target,
  width: 220,
  height: 92,
  placement: 'right',
});

popover.add(new Text('Popover content').setPosition(14, 18));
scene.add(target);
scene.add(popover);
```

## コンポーネント

| コンポーネント | トリガー                                 | 使用ケース                              |
| -------------- | ---------------------------------------- | --------------------------------------- |
| `Tooltip`      | オプションの遅延付きでターゲットにホバー | 軽量な説明テキスト                      |
| `Popover`      | ターゲットのクリック                     | 子ノードを持つ小さな一時パネル          |
| `ContextMenu`  | 通常は右クリックまたはクリック           | セパレーター/項目付きのコマンドメニュー |
| `Overlay`      | 手動の `showAt()`/`showAtPoint(source?)` | カスタムのフローティングコンポーネント  |

## メンテナー向けチェックリスト

- 変換されたターゲットには `target.getWorldBounds()` を使用します。
- 例は、ビューポートまたは示されているカードの境界のいずれかに制約します。
- ターゲットがツリーから離れたら一時的なUIを非表示にするか破棄します。
- オーバーレイのコンテンツを下層のコントロールの上でも読みやすく保ちます。十分に不透明な背景を使用します。

関連情報: [`Button`](/reference/ui-button/)、[`ScrollView`](/reference/ui-components/#scrollview)、[`Modal`](/reference/ui-components/#modal)。
