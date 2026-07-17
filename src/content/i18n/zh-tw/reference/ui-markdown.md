---
title: 'Markdown'
description: '具有豐富文字、程式碼區塊、表格、串流附加和連結回呼的 canvas-native Markdown 渲染器。'
order: 14
---

# `Markdown`

`Markdown` 使用 `marked` 解析 Markdown，並將結果渲染為 VectoJS entity 子樹。段落和標題成為 `RichText`，圍欄程式碼成為 `CodeBlock`，而 GFM 表格成為 `Table`。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Markdown</span></div>
  <iframe src="/sandbox/ui/markdown.html?v=core-1.9.2-ui-1.9.5" class="sandbox-frame component-demo-frame component-demo-frame-xl" loading="eager" title="Markdown live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>此範例將文章、連結、行內程式碼和一個圍欄區塊保持在一個聚焦的視口中，讓布局缺陷清晰可見。</figcaption>
</figure>

## 最小範例

```ts
import { Markdown } from '@vectojs/ui';

const md = new Markdown(source, {
  maxWidth: 640,
  selectable: true,
  onLinkClick(href) {
    router.open(href);
  },
});

scene.add(md.setPosition(24, 24));
```

## 建構函式

```ts
new Markdown(markdownText: string, opts?: MarkdownOptions)

interface MarkdownOptions {
  maxWidth?: number;
  theme?: MarkdownTheme;
  onLinkClick?: (href: string) => void;
  selectable?: boolean; // default true
}
```

`selectable` 會傳播到當前和未來的標題、文章、列表、圍欄程式碼和表格儲存格。在執行階段使用 `markdown.setSelectable(false)` 變更它。瀏覽器擁有拖曳選取、Ctrl/Command+C 和頁面內尋找；VMT entity 仍擁有布局和像素。有序和無序列表項目使用可選取的 `RichText`；每個 GFM 表格儲存格擁有一個可選取的投射。邏輯來源順序和硬/軟分隔符在巢狀的 Markdown 輸出中維持完整。Core 1.8 透過二維游標幾何路由變換過的文章，並透過共用的預備網格路由圍欄程式碼，因此列表、GFM 表格、換行的阿拉伯文/RTL 文字和程式碼在分數 DPR 和縮放下保留邏輯複製順序。當應用程式擁有容器尺寸或 CSS 縮放時，使用 `scene.resize(width, height)` 通知 Scene，讓 Firefox 可以重新校準原生 Range 度量。

## 串流

對於 token 串流，只附加新的差異：

```ts
for await (const token of llmStream) {
  markdown.appendMarkdown(token);
  scrollView.scrollToBottom();
}
```

避免為每個 token 呼叫 `setContent(fullDocumentSoFar)`；那會重建整個子樹。

## 擴充點

`renderToken(token)` 是 protected 的，因此自訂渲染器可以為應用程式特定的區塊建立 `Markdown` 的子類別，同時仍將一般 token 委派給內建渲染器。

## 維護者檢查清單

- 連結回呼必須轉發到段落、標題和列表的 `RichText` 節點。
- 程式碼區塊應保持為單一葉 entity，而非每個 token 或行段一個 entity。
- 圍欄程式碼必須投射其精確的來源文字和換行。
- 表格 header 使用標題顏色/粗體樣式，而每個邏輯儲存格恰好擁有一個內容投射。
- 指標擁有權保留於葉文字/程式碼投射；結構性列表和表格 entity 不得攔截原生選取。
- 串流附加應重複使用未變更的前綴 entity。

相關：[`RichText`](/reference/ui-components/#richtext)、[`CodeBlock`](/reference/ui-components/#codeblock)、[`Table`](/reference/ui-components/#table)。
