---
title: 'UI Components'
description: '@vectojs/uiコンポーネントライブラリの概要：フォーム、レイアウトコンテナ、オーバーレイ、リッチコンテンツ。'
order: 16
---

# UI Components

`@vectojs/ui`パッケージは、`@vectojs/core`の上に構築された、すぐに使えるプロダクション品質のコンポーネント一式を提供します。すべてのコンポーネントは完全にキャンバス上でレンダリングされます。アクセシビリティは自動的なA11yシャドウDOMレイヤーから得られます。

## すべてのコンポーネントは`UIComponent`を継承する

<figure>
  <img src="/images/entity-hierarchy.svg" alt="すべての組み込みUIコンポーネントを示すEntityクラス階層。" class="diagram" />
  <figcaption>すべてのコンポーネントは、位置、スケール、回転、animate()、そして完全なイベントシステムをEntityから継承します。</figcaption>
</figure>

`UIComponent`は`Entity`を拡張し、AABB hit-testingを備えた共有ボックスモデルを追加します。継承されたすべてのプロパティ（`x`、`y`、`width`、`height`、`opacity`、`interactive`、`animate`、`on`/`off`）は、すべてのコンポーネントで機能します。

> **`interactive`に関する注記：** ほとんどのフォームコンポーネント（`Button`、`Input`、`Text`など）は、コンストラクター内で`this.interactive = true`を設定します。`Card`はデフォルトで装飾的です——`label`オプションを渡したときにのみインタラクティブになります。

## レイアウトコンテナ

### `Stack`

flexboxのようなコンテナ——子を主軸に沿って順に配置します：

```typescript
import { Stack } from '@vectojs/ui';
import { Button, Text } from '@vectojs/ui';

const col = new Stack({ direction: 'vertical', gap: 12 });
col.add(new Text('Hello'));
col.add(new Button('Click me'));
scene.add(col.setPosition(40, 40));
```

`direction`、`gap`、`align`（交差軸）、そして`maxWidth`/`maxHeight`を伴う任意の`wrap`をサポートします。

### `Flow`

`{ direction: 'horizontal', wrap: true }`として事前配線された`Stack`——チップの行やタグクラウド向け：

```typescript
import { Flow } from '@vectojs/ui';

const tags = new Flow({ gap: 8, maxWidth: 400 });
for (const label of ['TypeScript', 'WebGPU', 'Canvas']) {
  tags.add(new Button(label, { bg: '#1e293b', padding: 6 }));
}
scene.add(tags.setPosition(20, 20));
```

### `Card`

角丸の背景パネル——上に子を追加します：

```typescript
import { Card } from '@vectojs/ui';

const card = new Card({
  width: 300,
  height: 200,
  bg: 'rgba(15, 23, 42, 0.8)',
  border: 'rgba(255, 255, 255, 0.1)',
  radius: 16,
  label: 'Settings panel', // makes it interactive + role="group"
});
card.add(toggle.setPosition(24, 24));
scene.add(card.setPosition(100, 100));
```

### `ResizablePanel`

ネストされたリサイズ分割（水平・垂直の両方）を可能にする分割パネルのレイアウトシステム：

```typescript
import { PanelGroup, Panel, PanelResizeHandle } from '@vectojs/ui';

const group = new PanelGroup({ direction: 'horizontal', width: 600, height: 400 });
const leftPanel = new Panel({ minSize: 100, defaultSize: 0.3 });
const rightPanel = new Panel({ minSize: 150 });

group.addPanel(leftPanel);
group.addPanel(rightPanel);
scene.add(group);
```

## フォームコントロール

すべてのフォームコントロールは、実際の透明なシャドウDOMノードを投影します。エージェントとスクリーンリーダーはそれらのネイティブ要素を通じて対話します。キャンバスはビジュアルをレンダリングします。すべてのフォームコントロールは、標準化された`change`イベントのバインディングと`onChange`コールバックの実行を備えています。

### `Button`

```typescript
import { Button } from '@vectojs/ui';

const btn = new Button('Save', {
  bg: '#2563eb',
  hoverBg: '#3b82f6',
  onClick: () => save(),
});
scene.add(btn.setPosition(20, 20));
```

ラベルに合わせて自動サイズ調整します。`<button>`を投影します → `getByRole('button', { name: 'Save' })`。

### `Input`（単一行）

```typescript
import { Input } from '@vectojs/ui';

const input = new Input({
  width: 300,
  placeholder: 'Search…',
  onChange: (value) => console.log(value),
});
scene.add(input.setPosition(20, 80));
```

**実際の透明な`<input>`**に支えられています——ブラウザがすべてのタイピング、IME、クリップボード、取り消しをネイティブに処理します。キャンバスはビジュアルを描画するだけです。IME合成の下線、キャレットの点滅、RTLの選択がすべてレンダリングされます。

### `TextArea`（複数行）

`Input`と同じモデルで、`<textarea>`に支えられています。`lineHeight`、キャレットへの垂直スクロール、そしてキャレットから行へのマッピングのための`lineOfOffset(offset)`をサポートします。

### `Toggle`

```typescript
import { Toggle } from '@vectojs/ui';

const toggle = new Toggle({
  label: 'Dark mode',
  checked: false,
  accent: '#6366f1',
  onChange: (checked) => applyTheme(checked),
});
```

`aria-checked`を伴う`role="switch"`を投影します。キャンバスのクリックとキーボードの起動の両方が`onChange`コールバックを通じてルーティングされます。

### `Checkbox`

```typescript
import { Checkbox } from '@vectojs/ui';

const cb = new Checkbox({
  label: 'Subscribe to updates',
  checked: true,
  accent: '#2563eb',
  onChange: (checked) => setSubscribed(checked),
});
```

`<input type="checkbox">`に支えられています——キーボードと支援技術によってネイティブにトグル可能です。

### `RadioGroup`

ラベル付きの円としてレンダリングされる、相互排他的なオプション選択。キーボードナビゲーション（矢印キーでオプションを循環）をサポートし、選択時に`onChange`コールバックを発火します。

```typescript
import { RadioGroup } from '@vectojs/ui';

const radio = new RadioGroup({
  options: [
    { value: 'light', label: 'Light Mode' },
    { value: 'dark', label: 'Dark Mode', disabled: false },
    { value: 'system', label: 'System Default' },
  ],
  value: 'dark', // initially selected value
  gap: 28, // vertical spacing between options, default 28
  color: '#e2e8f0', // label text color
  accent: '#00f0ff', // fill color for the selected circle
  onChange: (val) => setTheme(val),
});
scene.add(radio.setPosition(40, 40));
```

主なオプション：

| オプション | 型                    | デフォルト  | 説明                                |
| ---------- | --------------------- | ----------- | ----------------------------------- |
| `options`  | `RadioOption[]`       | —           | `{ value, label, disabled? }`の配列 |
| `value`    | `string`              | `''`        | 最初に選択される値                  |
| `gap`      | `number`              | `28`        | 行間の垂直ギャップ                  |
| `accent`   | `string`              | `'#00f0ff'` | 選択された円の塗り                  |
| `onChange` | `(v: string) => void` | —           | 選択変更時のコールバック            |

いつでも`radio.setValue(val)`を呼んで、プログラム的に選択を変更できます。各オプションに`aria-checked`を伴う個々の`role="radio"`を持つ、`role="radiogroup"`を投影します。

### `Tabs`

タブ付きパネルコンテナ——水平のタブバーをレンダリングし、アクティブなペインの`Entity`のみをシーンにマウントします。タブを切り替えると前のペインがアンマウントされ次のペインがマウントされるため、VMTを最小限に保ちます。

```typescript
import { Tabs } from '@vectojs/ui';

const settingsPane = new Stack({ direction: 'vertical', gap: 12 });
const previewPane = new Stack({ direction: 'vertical', gap: 12 });

const tabs = new Tabs({
  width: 500,
  height: 360,
  tabs: [
    { id: 'settings', label: 'Settings', content: settingsPane },
    { id: 'preview', label: 'Preview', content: previewPane },
  ],
  activeTabId: 'settings', // default: first tab
  tabHeight: 36, // height of the tab bar, default 36
  selectedColor: '#00f0ff', // active tab underline / text color
  onChange: (tabId) => console.log('Active tab:', tabId),
});
scene.add(tabs.setPosition(20, 20));

// Switch tab programmatically:
tabs.setActiveTab('preview');
```

主なオプション：

| オプション      | 型                     | デフォルト  | 説明                             |
| --------------- | ---------------------- | ----------- | -------------------------------- |
| `tabs`          | `TabItem[]`            | —           | `{ id, label, content: Entity }` |
| `activeTabId`   | `string`               | 最初のタブ  | 最初に表示されるタブ             |
| `tabHeight`     | `number`               | `36`        | バー行のピクセル高さ             |
| `selectedColor` | `string`               | `'#00f0ff'` | アクティブなタブのアクセント色   |
| `onChange`      | `(id: string) => void` | —           | タブ切り替え時に発火             |

バーに`role="tablist"`を、各ボタンに`aria-selected`を伴う`role="tab"`を投影します。コンテンツ領域は`role="tabpanel"`を得ます。

### `Slider`

```typescript
import { Slider } from '@vectojs/ui';

const slider = new Slider({ min: 0, max: 100, value: 50, width: 200 });
slider.on('change', (e) => console.log(e.value));
```

ドラッグ可能なつまみ。値は最も近い整数に丸められます。`role="slider"`を投影します。

### `Dropdown`

```typescript
import { Dropdown } from '@vectojs/ui';

const dd = new Dropdown(['Small', 'Medium', 'Large'], { value: 'Medium' });
dd.on('change', (e) => setSize(e.value));
scene.add(dd.setPosition(20, 160));
```

`scene.showOverlay()`を介してフローティングのオーバーレイメニューを開きます。選択またはEscapeで閉じます。完全なARIA combobox/listboxの配線。

## テキストとタイポグラフィ

### `Text`

cold/hotのレイアウト分割を備えた折り返し複数行テキスト：

```typescript
import { Text } from '@vectojs/ui';

const label = new Text('Hello, VectoJS!', {
  font: '600 18px "Outfit", sans-serif',
  color: '#e2e8f0',
  maxWidth: 400,
  lineHeight: 28,
});
```

- `setText(text)` — 再測定します（コールドパス）。
- `append(text)` — ストリーミングパス。変更された最後の段落のみを再測定します。
- `setMaxWidth(w)` — リフローのみ、再測定なし（ホットパス）。

### `RichText`

太字/斜体/色/サイズのラン、リンクのホットスポット、除外形状を伴う複数スタイルのインラインテキスト：

```typescript
import { RichText } from '@vectojs/ui';

const rich = new RichText(
  [
    { text: 'Zero DOM, ' },
    { text: 'accessible', style: { bold: true, color: '#38bdf8' } },
    { text: ' and agent-native.' },
  ],
  { maxWidth: 500 },
);
```

ストリーミングには：`appendSpans(newSpans)`を使ってください——O(変更された段落)。

## オーバーレイとビューポート

### `Overlay`

絶対配置オーバーレイの基底クラス。自動的なビューポート衝突検出と方向の反転により、ターゲットエンティティに対してフローティングコンテンツをアンカーします：

```typescript
import { Overlay } from '@vectojs/ui';

const overlay = new Overlay({
  target: button,
  content: popoverCard,
  placement: 'bottom-start',
});
```

### `Tooltip`

ターゲットエンティティに対してアンカーされる、ホバーでトリガーされるラベル：

```typescript
import { Tooltip } from '@vectojs/ui';

const tooltip = new Tooltip({
  target: helpIcon,
  content: 'More information',
  delay: 200,
});
```

### `Popover`

任意の子レイアウトコンテンツを含む、クリックでトリガーされるオーバーレイ：

```typescript
import { Popover } from '@vectojs/ui';

const popover = new Popover({
  target: settingsButton,
  width: 200,
  height: 150,
});
```

### `ContextMenu`

キーボードショートカット、アイコン、区切り、ネストされたサブメニューをサポートする、右クリックでトリガーされるメニュー：

```typescript
import { ContextMenu } from '@vectojs/ui';

const menu = new ContextMenu({
  items: [
    { label: 'Undo', shortcut: 'Ctrl+Z', onClick: () => undo() },
    { separator: true },
    { label: 'Settings', children: [{ label: 'Export', onClick: () => export() }] }
  ]
});
scene.add(menu);
```

### `VirtualList`

ビューポート内の要素のみをレンダリングする高性能なリストコンテナ。固定および可変の行高をサポートします：

```typescript
import { VirtualList } from '@vectojs/ui';

const list = new VirtualList({
  width: 300,
  height: 500,
  itemHeight: (idx) => measuredHeights[idx], // or number for fixed heights
  itemRenderer: (idx) => createListItemEntity(idx),
});
```

### `TreeView`

ディレクトリスタイルのツリーノードナビゲーター。ノード展開時に子項目を非同期に遅延読み込みすることをサポートします：

```typescript
import { TreeView } from '@vectojs/ui';

const tree = new TreeView({
  nodes: [
    {
      id: 'src',
      label: 'src',
      children: async () => [{ id: 'index.ts', label: 'index.ts' }],
    },
  ],
});
```

### `Modal`

```typescript
import { Modal } from '@vectojs/ui';

const modal = new Modal('Confirm Delete', {
  modalWidth: 420,
  modalHeight: 200,
});
scene.showOverlay(modal);

// From within: modal.close() animates and self-removes.
```

ばねでアニメーションするスケールイン。組み込みのCloseボタンを含みます。

### `ScrollView`

ばね物理スクロールを備えた、クリップされたビューポート：

```typescript
import { ScrollView } from '@vectojs/ui';

const feed = new ScrollView({ width: 360, height: 600 });
for (const item of items) feed.add(new Card({ ... }));
scene.add(feed.setPosition(20, 20));
feed.scrollToBottom();  // e.g. for a chat log
```

ホイール、タッチドラッグ、そしてプログラム的な`scrollTo(y)`がすべてサポートされています。

## リッチコンテンツ

### `Markdown`

Markdown文字列をVMTサブツリーへとレンダリングします——見出し、段落、シンタックスハイライト付きのコードブロック、テーブル、ブロッククォート、リンク、インラインフォーマット：

```typescript
import { Markdown } from '@vectojs/markdown';

const doc = new Markdown('## Hello\n\nThis is **bold** and `code`.', {
  maxWidth: 700,
});
scene.add(doc.setPosition(40, 40));
```

LLMストリーミングには、`appendMarkdown(chunk)`を使ってください——完全なソースを再レキシングし、その後トークンを差分し、すべてのエンティティを再構築する代わりに、変更されていないレンダリング済みの接頭辞を再利用します。

```typescript
const md = new Markdown('', { maxWidth: 600 });
scene.add(md);
for await (const token of llmStream) {
  md.appendMarkdown(token);
}
```

### `ProgressBar`

読み取り専用の進捗インジケーター——角丸のトラック背景と、`value`に比例した塗りつぶしのアクセントバーをレンダリングします。任意で、中央揃えのパーセンテージラベルを表示します。

```typescript
import { ProgressBar } from '@vectojs/ui';

const progress = new ProgressBar({
  value: 0.45, // 0–1 fraction
  width: 300,
  height: 16,
  showText: true, // render '45%' centered
  accent: '#00f0ff', // fill color
});
scene.add(progress.setPosition(40, 40));

// Update during an async operation:
for await (const chunk of stream) {
  progress.setValue(bytesReceived / totalBytes);
}
```

主なオプション：

| オプション | 型        | デフォルト                | 説明                |
| ---------- | --------- | ------------------------- | ------------------- |
| `value`    | `number`  | —                         | 進捗の割合`0`–`1`   |
| `width`    | `number`  | `200`                     | トラックの総幅      |
| `height`   | `number`  | `16`                      | トラックの高さ      |
| `radius`   | `number`  | `8`                       | 角の半径            |
| `bg`       | `string`  | `'rgba(255,255,255,0.1)'` | トラックの背景      |
| `accent`   | `string`  | `'#00f0ff'`               | 塗りつぶしバーの色  |
| `showText` | `boolean` | `false`                   | `"45%"`ラベルを表示 |

更新するには`progress.setValue(fraction)`を呼んでください——値は`[0, 1]`にクランプされ、値が実際に変わったときにのみ再描画をトリガーします。`aria-valuenow`を丸められたパーセンテージに設定した`role="progressbar"`を投影します。

<figure>
  <img src="/images/component-gallery.svg" alt="Button、Text、Input、Card、ScrollView、Slider、Toggle、Checkbox、Dropdownを示すVectoJSコンポーネントギャラリー。" class="diagram" />
  <figcaption>すべてのコンポーネントは完全にキャンバス上でレンダリングされます。（不可視の）シャドウDOMノードが、ネイティブなアクセシビリティと自動化のサポートを提供します。</figcaption>
</figure>

完全なオプションのシグネチャについては、[UI Components Reference](/reference/ui-components/)を参照してください。
