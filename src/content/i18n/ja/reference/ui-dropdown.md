---
title: 'UI: Dropdown'
description: 'オーバーレイのリストボックスとキーボードナビゲーションを備えたコンボボックスコントロール。'
order: 27
---

# `Dropdown`

`Dropdown` はcanvasボタンをラップし、`role="combobox"` を投影し、オーバーレイのリストボックスを開きます。

## 試してみる

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Dropdown</span></div>
  <iframe src="/sandbox/ui/component.html?name=dropdown&v=core-1.32.6-ui-2.15.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Dropdown live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>ポインターまたはキーボードで開きます。メニューはシーンのオーバーレイパスを通じてマウントされます。</figcaption>
</figure>

## 最小限の例

```ts
import { Dropdown } from '@vectojs/ui';

const backend = new Dropdown(['Canvas', 'WebGL', 'WebGPU'], {
  label: 'Renderer backend',
  width: 220,
  onChange: (value) => setBackend(value),
});
```

> **`label` を設定してください。** アクセシブルな名前のない `role=\"combobox\"` は単なる「コンボボックス」として読み上げられます（WCAG 4.1.2）。選択された値だけでは、そのコントロールの目的は伝わりません。キャンバス上に描画された視覚的なラベルはセマンティックレイヤーに到達しないため、ここでもラベルを渡してください。`@vectojs/ui@2.2.0` 以降で利用可能です。

閉じたトリガーは `bg`/`color` を使用します。開いたメニューのオプション行は、すべて 2.7.0 で追加された独自の 5 つのプロパティを使用します：

| プロパティ        | デフォルト                  | 適用対象                       |
| ----------------- | --------------------------- | ------------------------------ |
| `menuBg`          | `'rgba(15, 23, 42, 0.95)'`  | すべてのオプション行           |
| `menuColor`       | `'#fff'`                    | オプション行のテキスト         |
| `menuSelectedBg`  | `'rgba(0, 240, 255, 0.25)'` | 選択された行                   |
| `menuHighlightBg` | `'rgba(0, 240, 255, 0.4)'`  | キーボードでハイライトされた行 |
| `focusColor`      | `'#00f0ff'`                 | トリガーとオプション行         |

```ts
new Dropdown(['1x', '1.5x', '2x'], {
  label: 'Playback rate',
  bg: 'rgba(18, 23, 34, 0.98)',
  menuBg: 'rgba(18, 23, 34, 0.98)',
  menuColor: '#e2e8f0',
  menuSelectedBg: 'rgba(244, 63, 94, 0.30)',
  menuHighlightBg: 'rgba(244, 63, 94, 0.55)',
  focusColor: '#60a5fa',
});
```

これらが存在する前は、トリガーはテーマ設定が可能でしたが、メニューはできませんでした。そのため、ライトまたはウォームパレット用にスタイルされたドロップダウンは、シアンの選択状態を持つダークスレートパネルを開きました — これはスタイルの選択ではなくレンダリングのバグのように見えます。

値を選ぶ際に知っておくべきことが 2 つあります：

- **両方の行状態が同時に適用されることがあります**。また、メニューを開くと選択された行がハイライトされるため、`menuHighlightBg` は 2 つのうちでより強い状態として読めるようにすべきです。
- **オプション行自体がフォーカス可能**（`role="option"`）なので、`focusColor` リングはハイライトされた行の_上に_描画されます。リングと `menuHighlightBg` の間には少なくとも 3:1（WCAG SC 1.4.11）のコントラストを確保してください — ハイライトのアルファを `menuSelectedBg` と区別できるほど上げると、リングがその下限を静かに下回る可能性があります。

ほぼ不透明なメニュー背景が通常は正解です：動くキャンバスコンテンツ上の半透明メニューは、コントラストで読み取れますが、ノイズのように見えます。

## メンテナー向けチェックリスト

- `expanded`、`controls`、`activedescendant` のメタデータを同期させ続けます。
- 外側クリックとEscapeでオーバーレイを閉じます。
- ArrowUp、ArrowDown、Enter、Space、Escapeをテストします。
