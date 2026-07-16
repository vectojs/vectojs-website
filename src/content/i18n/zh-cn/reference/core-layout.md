---
title: '布局引擎'
description: '@vectojs/core/layout 子路径：将昂贵的文本分段+测量与廉价的换行+定位算术分离的冷/热分离、流式记忆化、富文本和排除形状。'
order: 4
---

# 布局引擎（冷/热分离）—— `@vectojs/core/layout`

属于 [`@vectojs/core`](/reference/core-api/)。

`LayoutEngine` 将昂贵的**冷**过程（分段 + 测量，通过 `Intl.Segmenter`）与廉价的**热**过程（换行 + 定位算术）分离，因此调整大小/重排/动画不会重新测量。

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

- **流式记忆化。** `prepare`/`prepareRich` 按段落缓存结果，因此重新准备增长的文本（例如 LLM token 流）只测量新段落。
- **富文本。** `StyledSpan = { text, style?: TextStyle }`；`TextStyle = { fontSize?, color?, bold?, italic?, href? }`。词中样式变化按字形生效。`fontSize` 影响测量的宽度 + 行高；其余是携带到节点的渲染元数据（`PreparedGlyph.style` → `LayoutNode.style`）。
- **排除（排除形状）。** `computeLineSegments(top, bottom, maxWidth, exclusions: ExclusionRect[]): LineSegment[]` 是纯粹的、可测试的核心：在减去重叠矩形后，行带上的空闲 `[x0,x1)` 区间。O(n log n)。传递 `[]`/省略会使单列路径逐字节相同。

## 关键布局类型

- `GlyphAtlas` —— `{ [char]: { width, baseSize, ast } }` 预测量的度量。
- `GlyphMeasurer` —— `{ measure(char, fontSize): number }`；提供你自己的，或使用 `createCanvasMeasurer(fontFamily?, baseSize?)`（离屏 `measureText`，线性缩放 + 缓存；在无 DOM 环境中返回 `null` → 引擎保留 `0.5em` 回退）。
- `PreparedText` → `PreparedParagraph[]` → `PreparedWord[]` → `PreparedGlyph[]`。
- `LayoutResult` —— `{ nodes: LayoutNode[], totalWidth, totalHeight, fallbackToCanvas? }`；`LayoutNode` 是一个定位的字形。
- `LayoutResultBuffer` —— 扁平的类型化数组结果（`xs/ys/ws/hs`、`chars`、`count`、`CAPACITY = 16384`）；重用前 `reset()`，用 `toLayoutResult()` 实体化。
- `LayoutWorkerManager.getInstance()` —— 用于线程外布局的单例；`queueLayout(entityId, text, { fontId, fontSize, maxWidth, maxHeight, callback, ... })` / `cancelLayout(entityId)`。被 [`MSDFTextEntity`](/reference/core-text/#msdftextentity) 使用。

参见[文本与排版](/learn/text-typography/)了解用法，以及 [Text & Bidi](/reference/core-text/) 了解消费此引擎输出的字体/字形渲染层。

## 相关

[Text & Bidi](/reference/core-text/) · [`Entity`](/reference/core-entity/) ·
[`@vectojs/core` 概述](/reference/core-api/)
