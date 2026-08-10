---
title: 'UI: Text'
description: '具有換行、熱路徑最大寬度重排和語意標籤的 canvas 文字元件。'
order: 16
---

# `Text`

`Text` 在 canvas 上渲染單一樣式的多行文字。它是 VectoJS UI 中標籤、輔助文案、標題和簡短唯讀文字的預設選擇。它的透明內容投射會在軟換行、明確換行、CJK 文字、連字和 RTL 段落之間保留精確的邏輯來源文字，因此原生選取、複製、頁面內尋找和翻譯不會繼承視覺字形順序。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Text</span></div>
  <iframe src="/sandbox/ui/component.html?name=text&v=core-1.34.0-ui-2.15.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Text live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>調整頁面大小，在聚焦的視口中檢視熱路徑 `maxWidth` 重排。</figcaption>
</figure>

## 最小範例

```ts
import { Text } from '@vectojs/ui';

const heading = new Text('Mathematical canvas UI', {
  font: '700 24px Inter, system-ui',
  color: '#f8fafc',
  maxWidth: 360,
  lineHeight: 32,
  selectable: true,
});

scene.add(heading.setPosition(24, 24));
```

## 維護者檢查清單

- 對於響應式寬度變更使用 `setMaxWidth()`。
- 對於內容變更使用 `setText()` 或 `append()`。
- 當拖曳手勢應擁有文字區域而非瀏覽器選取時使用 `setSelectable(false)`。
- 讓應用程式來源保持邏輯 Unicode 順序；VectoJS 和瀏覽器會自動解析阿拉伯文/希伯來文方向。
- Core 1.8 在變換後的二維幾何中解析指標游標；不要為旋轉、鏡射或非均勻縮放的文字加入僅限視口 X 的選取處理常式。
- 當需要行內樣式或連結時，優先使用 `RichText`。
