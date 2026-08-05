---
title: 'UI: RichText'
description: '具有連結熱點和串流附加支援的多樣式行內文字元件。'
order: 17
---

# `RichText`

`RichText` 在共用基線上流動混合的區段：粗體、斜體、顏色、大小和行內連結。此投射重建邏輯來源執行段而非塑形後的視覺字形，透過混合字型大小、連字、阿拉伯文/希伯來文文字、軟換行和硬換行保留精確的剪貼簿文字。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · RichText</span></div>
  <iframe src="/sandbox/ui/component.html?name=richtext&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="RichText live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>行內連結是 canvas 文字上方的透明錨點熱點。</figcaption>
</figure>

## 最小範例

```ts
import { RichText } from '@vectojs/ui';

const copy = new RichText(
  [
    { text: 'Mixed ' },
    { text: 'weight', style: { bold: true, color: '#22d3ee' } },
    { text: ' with ' },
    { text: 'links', style: { href: '/learn/accessibility/' } },
  ],
  {
    maxWidth: 420,
    selectable: true,
    onLinkClick: (href) => router.open(href),
  },
);
```

## 維護者檢查清單

- 讓連結回呼透過段落、標題和列表渲染器保持連接。
- 使用 `appendSpans()` 進行 token 串流。
- `getContentProjection()` 攜帶一個明確的視覺列，包含每個執行段的字型、
  共用的 Canvas 基線和實際的行進距。這讓混合大小的選取矩形保持對齊，
  而不是讓瀏覽器重新流動區段。邏輯分隔符屬於前一個已定位的列，
  因此多行選取永不建立多餘的根原點高亮片段。
  Core 1.8 從變換過的二維 Range 幾何解析合法的字素游標，
  包括旋轉、反射和非均勻縮放。
  當不需要原生拖曳選取時使用 `setSelectable(false)`。
- 當文字必須繞著區域矩形流動時使用 `setExclusions()`。
