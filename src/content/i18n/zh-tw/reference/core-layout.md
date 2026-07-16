---
title: 'Layout engine'
description: '@vectojs/core/layout 子路徑：將昂貴的文字分段+測量與廉價的換行+定位運算分離的冷/熱分割、串流記憶化、豐富文字和排除形狀。'
order: 4
---

# Layout engine（冷/熱分割）— `@vectojs/core/layout`

屬於 [`@vectojs/core`](/reference/core-api/) 的一部分。

`LayoutEngine` 將昂貴的**冷**傳遞（透過 `Intl.Segmenter` 分段 + 測量）與廉價的**熱**傳遞（換行 + 定位運算）分離，因此調整大小/重排/動畫不會重新測量。

```ts
new LayoutEngine(maxWidth: number, maxHeight: number, measurer?: GlyphMeasurer | null)

// Cold: segment + measure once → reusable PreparedText
prepare(text, fontAtlas, fontSize = 32): PreparedText
prepareRich(spans: StyledSpan[], fontAtlas, baseFontSize = 32, baseStyle?: TextStyle): PreparedText

// Hot: place a PreparedText into positioned glyphs (reads engine maxWidth/maxHeight)
layoutPrepared(prepared, exclusionMask?, exclusions?: ExclusionRect[]): LayoutResult
layoutPreparedIntoBuffer(prepared, buffer: LayoutResultBuffer, exclusionMask?): void   // reuses typed coordinate storage

// One-shot (cold+hot together)
layoutText(text, fontAtlas, fontSize = 32, exclusionMask?): LayoutResult
layoutTextIntoBuffer(text, fontAtlas, fontSize, buffer, exclusionMask?): void
```

- **串流記憶化。** `prepare`/`prepareRich` 快取每個段落的結果，
  因此重新準備成長中的文字（例如 LLM token 串流）只會測量新段落。
- **豐富文字。** `StyledSpan = { text, style?: TextStyle }`；`TextStyle =
{ fontSize?, color?, bold?, italic?, href? }`。字詞中途的樣式變更會逐字形遵守。
  `fontSize` 影響測量的寬度 + 行高；其餘是攜帶到節點的渲染中繼資料
  （`PreparedGlyph.style` → `LayoutNode.style`）。
- **排除（排除形狀）。** `computeLineSegments(top, bottom, maxWidth,
exclusions: ExclusionRect[]): LineSegment[]` 是純粹、可測試的核心：
  在減去重疊矩形後，某行帶上的空閒 `[x0,x1)` 區間。
  O(n log n)。傳入 `[]`/省略會讓單欄路徑保持逐位元組相同。

## 主要 layout 類型

- `GlyphAtlas` — `{ [char]: { width, baseSize, ast } }` 預先測量的度量。
- `GlyphMeasurer` — `{ measure(char, fontSize): number }`；提供你自己的或使用
  `createCanvasMeasurer(fontFamily?, baseSize?)`（離螢幕 `measureText`，
  線性縮放 + 快取；在無 DOM 的環境中回傳 `null` → 引擎保留
  `0.5em` 後備值）。
- `PreparedText` → `PreparedParagraph[]` → `PreparedWord[]` → `PreparedGlyph[]`。
- `LayoutResult` — `{ nodes: LayoutNode[], totalWidth, totalHeight,
fallbackToCanvas? }`；`LayoutNode` 是一個已定位的字形。
- `LayoutResultBuffer` — 平坦的 typed-array 結果（`xs/ys/ws/hs`、`chars`、
  `count`、`CAPACITY = 16384`）；重複使用前 `reset()`，`toLayoutResult()` 以
  具現化。
- `LayoutWorkerManager.getInstance()` — 用於離執行緒 layout 的單例；
  `queueLayout(entityId, text, { fontId, fontSize, maxWidth, maxHeight, callback,
... })` / `cancelLayout(entityId)`。由 [`MSDFTextEntity`](/reference/core-text/#msdftextentity) 使用。

使用方式請參閱 [Text & Typography](/learn/text-typography/)，消耗此引擎輸出的字型/字形渲染層請參閱 [Text & Bidi](/reference/core-text/)。

## 相關

[Text & Bidi](/reference/core-text/) · [`Entity`](/reference/core-entity/) ·
[`@vectojs/core` 概覽](/reference/core-api/)
