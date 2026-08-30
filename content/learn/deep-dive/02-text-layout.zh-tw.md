---
title: '02 — 文字與布局：從 Unicode 到像素'
description: '完整文字管線 — 分段、BiDi、阿拉伯文塑形、字型備援、Typography、斷行、LayoutEngine 冷/熱分離、Worker 執行緒化，以及保持繪製與度量一致的不變量。'
order: 22
---

# 02 — 文字與布局：從 Unicode 到像素

> VectoJS 重新實作了瀏覽器文字堆疊免費提供的能力：bidi、塑形、分段、字型備援、斷行與基線定位。本篇追溯從 Unicode `string` 到已定位字形的每個階段，並說明使 `measure` 與 `paint` 依構造保持一致的契約。

## 1. 管線一覽

```text
Unicode string
  │  Intl.Segmenter (word + grapheme)          packages/layout/src/LayoutEngine.ts:916
  ▼
 Grapheme segmentation ─┬─ ArabicShaper.shapeArabic  packages/text/src/ArabicShaper.ts:89
                        │  indexMap: shaped → source       :91
                        ▼
 BiDi resolution (bidi-js, UAX #9)            packages/text/src/BidiResolver.ts:27
  getBaseLevel / resolveLevels / reorderSegments
                        │
                        ▼
 Font fallback (atlas → measurer → 0.5em)     packages/layout/src/measure.ts:39
  createCanvasMeasurer / createMetricsMeasurer / resolveGlyphMeasurer
                        │
                        ▼
 Typography (baseline in line box)            packages/text/src/Typography.ts:93
  cssLineBoxBaseline / registeredBaseline / splitFontShorthand
                        │
                        ▼
 Line breaking + exclusion flow + justify     packages/layout/src/LayoutEngine.ts:1848
  computeLineSegments / suppressLineBreaks / LayoutEngine.layoutPrepared
                        │
                        ▼
 Paint / measure parity ─┬─ @vectojs/layout  (canvas Text/RichText)
                         └─ @vectojs/text    (MSDF: MSDFFont.layout)  packages/text/src/MSDFFont.ts:201
                         └─ @vectojs/core    (MSDFTextEntity → worker) packages/core/src/text/MSDFTextEntity.ts:25
```

兩條並行消費者共用同一度量契約：**畫布路徑**（`@vectojs/layout` + `measureContext`）與 **GPU/MSDF 路徑**（`MSDFFont.layout` + `LayoutWorker`）。結果僅在四邊形如何成為像素上分歧，絕不在每字族的斷行位置上分歧。

對於網格消費者（終端機、編輯器、`CodeBlock`），管線更早分岔至保留的網格路徑 `prepareContentGrid`（`packages/text/src/PreparedContentGrid.ts:243`）——一次編譯，兩個消費者（繪製 + 投射）。網格側的內容網格參見 `tmp/boss-research/01-selection.md` §3.3。

### 冷 / 熱分離（讓重設大小保持低成本的 2.68 倍）

```text
prepare(text) / prepareRich(spans)          ← cold:  Intl.Segmenter + Arabic shape + BiDi + glyphWidth
  └─→ PreparedText { paragraphs, fontSize }      memo'd by text+fontSize+styleSig (LayoutEngine.ts:829/833)
       │  independent of maxWidth / maxHeight / exclusions
       ▼
layoutPrepared(prepared, mask, exclusions)  ← hot:   computeLineSegments + suppressLineBreaks + shiftedExtent
measurePrepared(prepared)                   ← hot (no alloc): lineCount+height only
layoutPreparedIntoBuffer(prepared, buffer)  ← hot, zero-GC: typed arrays + reorderSegments
```

`benchmarks/text-layout-pretext` / `comparisons/text-layout-pretext` / `scripts/compare-pretext.ts:1` 確立了可公平比較的分離（`measurePrepared` vs `pretext.layout`）。在分離之前，`layoutText`（冷+熱）與 pretext 僅熱的 `layout` 進行計時比較——落差被回報為引擎成本，實則為分段成本。

### 分段器與其快取

`LayoutEngine`（`:916`）持有 `wordSegmenter` + `charSegmenter`（`Intl.Segmenter`，語系 `navigator.language ?? 'en-US'`）——自動偵測 CJK 與西方語系的詞邊界——加上 `wordCache: Map<string, …>`（`:821`，上限 500）與 `graphemeCache: Map<string,string[]>`（`:822`，上限 2000）。兩者皆在達上限時整批清空（`:921`/`950`），並透過 `cacheStats()`（`:1004`）觀測。`PreparedContentGrid` 對字素偏好同一 `Intl.Segmenter`（`:76`），但為無此環境攜帶 `fallbackGraphemes`（`:107`）：組合標記、VS16/VS15、膚色修飾符 `U+1F3FB–1F3FF`、區域指示符、ZWJ——足以保持 tab 停駐點與寬欄正確。`LayoutEngine.getGraphemes`（`:943`）與 `getWordSegments`（`:881`）為唯二呼叫點；`shapeSimpleRun`（`:1644`）僅在 `isComplexScript`（`:584`）證明安全後才繞過 `ArabicShaper`。

## 2. 逐模組深潛

### 2.1 `packages/text/src/BidiResolver.ts:27` — 透過 `bidi-js` 的 UAX #9

僅靜態類別（刻意為之——`BidiResolver.getBaseLevel(...)` 為公開 API）。對 `bidi-js` 的 `getEmbeddingLevels` / `getReorderedIndices` / `getReorderSegments` 的薄封裝；先前手寫的 L2 反轉僅處理單一尾隨空白執行的 L1 重置而被替換。

| 方法                                      | 行號   | 功能                                                                                                                                                                                                                                                                  |
| ----------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getBaseLevel(text)`                      | `:29`  | 段落嵌入層級 P2/P3（0 為 LTR，1 為 RTL）。                                                                                                                                                                                                                            |
| `resolveLevels(text)`                     | `:34`  | 每字元解析層級 X1–I2（`Uint8Array`）。                                                                                                                                                                                                                                |
| `reorderIndices(text)`                    | `:50`  | 視覺→邏輯排列 L1+L2（`indices[v] = 視覺欄位 v 處的邏輯索引`）。權威來源——選取透過此將邏輯範圍映射至視覺執行。                                                                                                                                                         |
| `logicalToVisualRuns(text, start, end)`   | `:62`  | 一個邏輯 `[start,end)` → N 個視覺 `[visualStart,visualEnd)` 執行，依左至右排序。單一選取矩形在跨越方向邊界時會變為多個。                                                                                                                                              |
| `reorderVisual<T>(nodes, baseLevel)`      | `:89`  | 對一行節點的原地 L1+L2 反轉。重建 `str` + `levels` 並迭代 `reorderSegments`。在每個換行中皆為熱路徑。                                                                                                                                                                 |
| `reorderSegments(str, levels, baseLevel)` | `:121` | 與型別化陣列 `[start,end]` 對相同的排列（`packages/layout/src/LayoutEngine.ts:2466` 註解）——讓零 GC 緩衝路徑（`layoutPreparedIntoBuffer`）無需為每字形配置 `BidiNode` 物件即可套用。合成 `embed = { levels, paragraphs:[{level: baseLevel}] }` 使 L1 重置為段落方向。 |

成本：每段落一次 `bidi-js` 遍歷。除 `reorderVisual` 中的陣列建構外，無逐字形成本。

### 2.2 `packages/text/src/ArabicShaper.ts:18` — 上下文塑形

針對阿拉伯區塊加上波斯/烏都文擴充的呈現形式替換。`MAPPINGS: { [code]: GlyphForms }`（`:18`）記錄每碼點的 `isolated/initial/medial/final` 碼點與 `joining: 'D'|'R'|'U'`。Tatweel `U+0640` 為 `'D'`，但在每種形式皆發射同一碼點（`:052`），因此連接可貫穿。

- `isHarakat(code)`（`:70`）— `U+064B–065F`、`U+0670`、`U+0610–061A`（尊稱符號）、`U+06D6–06ED`（古蘭經註記）加上三個 harakat 相鄰標記範圍。皆具連接型別 TRANSPARENT——塑形必須跨過它們，否則尊稱文字會斷開。鏡像 `MSDFFont.ts:isNonspacingMark`（`:132`）。
- `getJoiningType(code)`（`:84`）— 查表，缺席時為 `'U'`。
- `shapeArabic(text)`（`:89`）— 單次由左至右走訪：連字前瞻（`lam+alef` `U+0644` + `U+0627/0622/0623/0625` → 呈現連字，`k` 指標 `:105`）、`connectPrev`/`connectNext`（`:182`/`:187`）透過在透明標記上向前/向後掃描計算，`glyph = forms.isolated/initial/medial/final`。回傳 `{ shapedText, indexMap: Int32Array }`（`:1`）— `indexMap[visualIndex] = sourceOffset`，使 `LayoutEngine` 在塑形後可還原 `sourceIndex/sourceLength`。

選取契約：視覺位置重排，但 `sourceIndex` 永遠索引原始邏輯字串。

### 2.3 `packages/text/src/measureContext.ts:41` — 在繪製處度量

為強制單一不變量而存在的模組。分離的 `HTMLCanvasElement` 在 Gecko 上對通用字族（`monospace`、`serif`）解析為與文件已附加畫布**不同字型**，因為通用→真實的映射存在於僅能自即時樣式上下文取得的每語系字型偏好中。

表頭（`:1`）：Firefox 153、`<html lang="zh">`、DPR 1.5789、`measureText('MMMMMMMMMM')`——分離的 `22px monospace` 為 109.7，已附加為 131.6，布局為 132.0；分離的 `serif` 為 109.7/205.5——兩者皆收斂至同一硬編碼備援，誤差 20–47%。Chromium 不受影響。`OffscreenCanvas` 度量為 132.0（與布局一致）但未被使用——與**已繪製**畫布一致更重要。

- `createMeasuringContext()`（`:62`）— 1×1 畫布，`position:absolute;opacity:0;left:-9999px;top:0`，`aria-hidden`，附加至 `document.body`。`display:none` 會將其自布局移除並失去樣式上下文；分離即為失敗模式。
- `getSharedMeasuringContext()`（`:87`）— 單一共用上下文（`:41` `sharedCanvas`/`sharedContext`）。對 `null` 做 memo（`undefined` vs `null` 區別，`:98`），使 SSR（`typeof document === 'undefined'`）不會每字形重試建立。每次讀取前設定 `ctx.font`；無寬度快取隨上下文攜帶。
- `isSharedMeasuringContextAttached()`（`:118`）/ `resetSharedMeasuringContext()`（`:130`）— 對在 `document.body` 存在前建立的上下文的診斷 + 復原。今日無倉庫內呼叫者自動重建；呼叫點模式記錄於 `:111`。

每個度量器皆須呼叫此。`packages/layout/src/measure.ts:42` 已如此做。在 `packages/` 中搜尋分離的 `document.createElement('canvas')` 即為稽核。

### 2.4 `packages/text/src/fontMetrics.ts:14` — 無 DOM 度量註冊表

適用於完全無畫布的環境（SSR、無 `OffscreenCanvas` 的 worker、測試）。數值以 **em 單位**，使一次註冊可服務所有尺寸。

- `FontMetricsSource`（`:14`）— `advanceEm(char)`，可選的 `measureEm(text)`（具字距感知），`ascenderEm`/`descenderEm`。`measureEm` 的備援為加總 `advanceEm`，正確但失去字距。
- `normalizeFamily`（`:45`）— 僅第一字族，引號去除、小寫。備援鏈為渲染器關切，而非註冊表關切。
- `registerFontMetrics(family, source)`（`:82`）、`registerMSDFFontMetrics(family, font)`（`:97`）、`createMSDFMetricsSource(font)`（`:114`）— `advanceEm` 來自 `font.getGlyph(code)?.advance`，`measureEm` 來自 `font.layout(text, 1).width`（唯一可處理字距的路徑——逐字形的 `GlyphMeasurer` 無鄰居）。`ascenderEm`/`descenderEm` 來自 `font.data.metrics`。`hasFontMetrics`（`:154`）為低成本探針，用於在無註冊時短路。
- `fontMetricsVersion()`（`:64`）、`getFontMetrics`（`:141`）、`clearFontMetrics`（`:163`）。版本計數器讓呼叫者快取已解析來源，僅在遞增時重解析——在未檢查的情況下擷取來源會固定註冊當時的內容（`measure.ts` 中的 `:107`）。`createMetricsMeasurer`（`measure.ts:96`）因此以惰性持有 `baseVersion/runVersion`，並每字形比較一次，而非每字形呼叫 `normalizeFamily`（在度量器熱路徑上避免 +13% 開銷）。

### 2.4b `packages/text/src/index.ts:1` — barrel

重新匯出 `ArabicShaper`、`BidiResolver`、`measureContext`、`PreparedContentGrid`、`MSDFFont`、`fontMetrics`、`Typography`（`:1`）。`@vectojs/layout` 自 `@vectojs/text` 匯入（非相對路徑）— `LayoutEngine.ts:1` `import { ArabicShaper } from '@vectojs/text'`——因此套件邊界可觀測。`LayoutWorkerManager` 單例亦跨 worker 死亡快取 `MSDFFontData`（`LayoutWorkerManager.ts:043`），原因完全相同：度量資料跨執行緒邊界僅傳遞一次，必須為備援路徑保持可用。

### 2.5 `packages/text/src/Typography.ts:4` — CSS 行盒中的基線

CSS 將字型 ascent+descent 置中於行盒；畫布在明確的 y 處繪製。兩者必須一致，否則 `fillText` 與其原生鏡像位於不同基線。

- `BASELINE_CACHE_MAX = 512`（`:12`）、`baselineCache: Map<string,number>`（`:4`）、`rememberBaseline`（`:14`）— 插入順序 LRU（命中時 delete+re-set，`:98`）。512 涵蓋實際文件中所有字型；未命中時重測一次 `'Mg'`。
- `splitFontShorthand(font)`（`:33`）— 錨定於 `indexOf('px')` 並向後走訪數字，而非 `/(\d+)px/`（多項式 ReDoS，`js/polynomial-redos`，高）。鏡像 `@vectojs/ui`/`@vectojs/markdown` 中的解析器，刻意具有不同的失敗值。
- `registeredBaseline(font, lineHeight)`（`:67`）— 來自 `getFontMetrics` 的無 DOM 路徑。`(lineHeight - ascent - descent)/2 + ascent`，其中 `descent = -descenderEm * size`；備援 `lineHeight * 0.8`。
- `cssLineBoxBaseline(font, lineHeight)`（`:93`）— 有序選擇：SSR→`registeredBaseline`；快取命中→回傳；`getSharedMeasuringContext`（已附加，`:107`）→ `ctx.measureText('Mg')` → `fontBoundingBoxAscent/Descent || actualBoundingBoxAscent/Descent`（`:112`）→ 同一置中公式；退化度量→`0.8` 備援。同一 `0.8` 常數錨定 `LayoutEngine.ts:shiftedExtent`（`:668`）與行盒 `1.5 * pMax`/`0.8 * pMax` 幾何。
- `clearCssLineBoxMetrics()`（`:122`）— 在網頁字型載入完成後呼叫。

### 2.6 `packages/text/src/MSDFFont.ts:151` — GPU 文字

解析 `msdf-atlas-gen` JSON（型別 `msdf`/`mtsdf`/`sdf`），以 CSS 像素布局四邊形並附 atlas UV。渲染器慣例：局部空間 y 向下、左上角原點；UV 的 `v=0` 在 atlas 頂部（上傳時無 Y 翻轉）。

- 介面：`MSDFAtlasInfo`（`:16`，`distanceRange/size/width/height/yOrigin`）、`MSDFMetrics`（`:32`，`lineHeight/ascender/descender`）、`MSDFBounds`（`:45`）、`MSDFGlyphDef`（`:53`，`unicode/advance/planeBounds/atlasBounds`）、`MSDFKerning`（`:64`）、`MSDFFontData`（`:71`）、`PositionedGlyph`（`:79`，`x/y/w/h + u0/v0/u1/v1`）、`MSDFLayoutResult`（`:96`，`glyphs/width/height`）、`MSDFLayoutOptions`（`:105`）。
- `kernKey(a,b)`（`:115`）— `a * 0x110000 + b`；`isNonspacingMark(code)`（`:132`）— 明確範圍列表（在逐字形迴圈中低成本，無 `\p{Mn}` 正則），鏡像 `LayoutEngine.ts:isComplexScript`（`:584`）。
- `MSDFFont`（`:151`）— `id`（`font-${idCounter++}` `:164`）、`byCode: Map<number,MSDFGlyphDef>`、`kern: Map<number,number>`、`missingAdvance`（`:158`，space→`.notdef`→`0.5`）。`parse`（`:173`）、`getGlyph`（`:178`）、`distanceRange`/`atlasWidth`/`atlasHeight`（`:183`）。
- `layout(text, fontSizePx, opts)`（`:201`）— 具碼點感知（`Array.from(text)` `:212`），將 `\r\n`/`\r` 視為一次換行（`:214`），遺漏字形 → `missingAdvance * size`（永不為 0，否則後續字形左移），唯 `isNonspacingMark` 前進 0（`:233`）且不為字距替換 `prevCode`（`:252`）。字距 `k * fontSize`（`:242`），`baseline = y + (ascender + line*lineHeight)*size`（`:246`），`planeBounds`→四邊形（`:246` 起），`yOrigin` 翻轉 `v0/v1`（`:250`）。回傳 `{ glyphs, width: maxAdvance, height: (line+1)*lineHeight*size }`。

### 2.7 `packages/text/src/PreparedContentGrid.ts:38` — 保留的網格方案

不可變、具來源感知的網格文字幾何。一次編譯，在畫布繪製與 DOM 投射間共用——重新分段會使 bidi、tab 與寬字形位置不同。

- `PreparedContentGrid`（`:38`）— `{ kind:'content-grid', revision, source, font, cellWidth, lineHeight, baseline, tabSize, lines }`；`PrepareContentGridOptions`（`:50`）；`MutableCell`（`:63`）。
- `graphemeSegmenter`（`:76`，`Intl.Segmenter` 具 `grapheme` 粒度）與 `fallbackGraphemes`（`:107`）涵蓋組合標記、變體選擇器、emoji 修飾符、按鍵帽、區域指示符、ZWJ。`graphemes()`（`:151`）偏好 `Intl.Segmenter`。
- `isWideCluster`（`:170`）— `EAST_ASIAN_WIDE`（`:91`，CJK 區塊）+ `EXTENDED_PICTOGRAPHIC` 具 `VS16`/`VS15` 感知 + `EMOJI_PRESENTATION` + `REGIONAL_INDICATOR`/`0x20E3`。寬 → 2 欄。
- `sourceLines`（`:197`）— 擁有 `\r\n`/`\r`/`\n`；`sourceStart/sourceEnd/nextSourceStart` 使其後每個偏移皆正確。
- `prepareContentGrid(source, opts)`（`:243`）— 逐行：`rawCaretBoundaries` 自 `graphemes(rawLine)`、`ArabicShaper.shapeArabic(rawLine)`（`:270`）、`graphemes(shaped)`、`BidiResolver.resolveLevels`（`:273`）、每塑形字素一個單元，其 `sourceStart/sourceEnd` 透過 `indexMap`（`:278`）、`sourceCaretOffsets` 透過 `lowerBound`（`:159`）、`columns = 0/ tabStop / wide?2:1`（`:298`）、`BidiResolver.reorderVisual(visualCells, getBaseLevel(shaped))`（`:315`）、`x` 遍歷（`:317`）。回傳前凍結。

### 2.8 `packages/layout/src/LayoutEngine.ts` — 散文布局引擎

約 3.4k 行，文字堆疊中最重的單一檔案。架構為**冷/熱分離**於型別化契約之上。

**冷半部**（昂貴、無約束）：

- `prepare(text, atlas, size)`（`:1080`）/ `prepareRich(spans, atlas, size, baseStyle)`（`:1266`）— 執行 `Intl.Segmenter`（詞 `:916` + 字素 `:917`）、經 `glyphWidth`（`:929`，atlas→`GlyphMeasurer`→`0.5em`）解析字形 advance、塑形（`ArabicShaper` `:1117`）、解析 bidi（`BidiResolver` `:1123`/`:1524`）、建立 `PreparedText`（`:462`）。結果獨立於 `maxWidth`/`maxHeight`/exclusions。段落 memo：`paragraphCache: Map<string,PreparedParagraph>`（`:829`）以 `${fontSize} ${paragraph}` 為鍵；富文本變體 `richParagraphCache`（`:833`）以 `${fontSize} ${text} ${styleSig}` 為鍵，其中 `styleSig` 為對 `TextStyle` 欄位 + `InlineObject` 識別的 RLE 值簽名（bold/italic/color/href/fontFamily/baselineShift/highlightColor/abbrTitle 加上物件 `width/height/depth/alt/key`）。Atlas 識別變更時兩者皆清空（`:1095`/`:1275`）。

**串流快速路徑**位於 `prepareRich` 內：`streamShapeCache`（`:839`，單槽增量快取）。條件位於 `:1358`：單一段落、無 `\n`/`\r`、`!isComplexScript(fullText)`（`:584`——阿拉伯/希伯來/印度語系/組合/bidi 標記/emoji 修飾符會退回完整塑形器）。當 `fullText` 嚴格擴展 `cache.text`、樣式在前綴上相等（`styleRangeEquals` `:682`、`objectRangeEquals` `:628`），逐字重用前綴詞，僅對後綴呼叫 `shapeSimpleRun(fullText, reshapeFrom, ...)`（`:1644`）。`reshapeFrom` 非 `cache.end`，而是尾隨同類別（空白 vs 非空白）執行的起點，使 `Intl.Segmenter` 在下一塊到達時會溶解的邊界（例如 `"3"+"."+"1"` → `"3.1"`）被正確重建。狀態：已發布，經度量為正確的邊界情況勝利，在實際文件上可忽略（memo 已限制每段落成本）——依 `forge/findings/text-richtext-and-markdown.md:356` 保留，未在獨立的 `@vectojs/core` 版本中發布。

**熱半部**（低成本、受約束）：

- `layoutPrepared(prepared, exclusionMask?, exclusions?)`（`:1848`）/ `measurePrepared`（`:1772`）/ `layoutPreparedIntoBuffer(prepared, buffer, mask?)`（`:2241`）— 走訪 `PreparedText` 詞、於 `currentX/currentY` 放置字形、遵守 `maxWidth`/`maxHeight`、`exclusions: ExclusionRect[]`、`computeLineSegments(top,bottom,maxWidth,exclusions)`（`:504`，`O(n log n)` 合併 x 區間、於 `[0,maxWidth]` 內取補集）、孤字標點抑制（`suppressLineBreaks` `:721`，`'@'` 連接 + 結尾標點合併）、連字（來自 `U+00AD` 或 `this._hyphenate` 鉤的 `breakPoints`，`hyphenWidth` `:490`）、對齊（`textAlign:'justify'` 僅在多執行行上）、`shiftedExtent(gfs, shift, pMax)`（`:668`）套用共用的 `0.8/0.2` 行盒分割，使升高的上標僅在會離開盒子時才增長行。`layoutPrepared` 配置 `LayoutNode[]` + `LayoutResult`；`layoutPreparedIntoBuffer` 無配置地寫入扁平型別化陣列，並套用同一 BiDi `reorderSegments` 遍歷。

其他關鍵組件：`EMPTY_GLYPH_ATLAS`（`:83`，凍結常數——`Text`/`RichText` 傳遞它，使段落 memo 不會因全新 `{}` 字面量而每呼叫失效；於 200×12 段落重排上測得 2.68× `:64`）；`unmeasuredGlyphCount()`/`resetUnmeasuredGlyphCount()`/`setUnmeasuredGlyphWarning()`（`:8`——`0.5em` 虛構被計數而非靜默；`fallbackToCanvas`（`:380`，三態 `undefined` vs `true`）僅回報遺漏 atlas，而非遺漏度量器）；`GlyphMeasurer`（`:92`，`measure(char,size,family,bold,italic)`——逐執行字族/樣式覆寫，使行內 `code` 以自身度量度量，`warnUnmeasured`（`:9`）一次性警告，受 `unmeasuredGlyphCount` 門控）；`TextStyle`（`:113`，約 9 欄位：`fontSize/color/bold/italic/fontFamily/lineThrough/baselineShift/underline/highlightColor/abbrTitle/href`——每個影響 advance 者皆須在 `styleSig` 中；`fontFamily` 直至 2026-07-30 缺席，導致 `monospace` 段落以無限快取命中率被提供 `serif` 度量，僅因修復前的空 atlas 擾動使 `paragraphCache` 保持 0 命中而潛伏）；`InlineObject`（`:216`，`OBJECT_REPLACEMENT U+FFFC :198`，固定 `width/height/depth/alt/key/paint` `:216`，`width/height/depth` 已解析為 px，`paint`（`:301` `InlineObjectSurface { drawImage, drawImageRect } :315`）永不由引擎呼叫，`InlineObjectBox { x,y,width,height } :299` 已包含 `depth`）；`cacheStats()`（`:1004`）揭露 `hits/misses/evictions/hitRate/size/capacity` 於 `word(500)/grapheme(2000)/paragraph(1000)/richParagraph(1000)`（`:831` 上限）並以 `resetCacheStats()`（`:1030`）保留條目；`LayoutResult`（`:378` `nodes/totalWidth/totalHeight/fallbackToCanvas`）為每個熱路徑的唯一輸出；`GridTextEntity`（`components/GridTextEntity.ts:4`，舊版 `n`）vs `PreparedContentGrid.ts:243` 分割明確哪個網格被保留、哪個為單純 `fillText` 迴圈。

熱遍歷的放置以程式碼而言：於 `layoutPrepared`（`LayoutEngine.ts:2050` 起）中，每段落的 `pMax` 先為物件增長（`objDescent`/`ascent > pMax*0.8` → `pMax = ascent/0.8`），然後 `lineHeight = max(pMax*1.5, pMax*0.8+objDescent)` 驅動 `computeLineSegments` / `startLine`（`:2004`），接著詞佇列走訪（`:2109`）含連字前綴分割（`:2123` `chosen`/`prefixWidth`/`hyphenWidth`）與字形迴圈（`:2159`），其 `y` 放置（`:2183`）為三分支：物件（`currentY + pMax*0.8 - (height-depth)`）、基線偏移（`currentY + (pMax-gfs)*0.8 - baselineShift`）、一般（`currentY + (pMax-gfs)*0.8`）。`exclusionMask`（`:2155`）與前導空白抑制（`preserveLeadingSpaces` `:796`，`:2180`）為逐字形；`msdfLayout.ts:154` 鏡像相同三分支，唯無 exclusions。

值得以 `file:line` 認識的支援契約：

- `GlyphAtlas`（`LayoutEngine.ts:58`，`width/baseSize/ast`）與 `EMPTY_GLYPH_ATLAS` vs 全新 `{}` 字面量的段落 memo 識別（`:83`）。
- `PreparedGlyph`（`:402`，`char/width/style/object/level/sourceIndex/sourceLength/atlasMiss`）— `atlasMiss:true` 僅當 `char.trim().length>0 && !hasGlyph`，因此空白永不標記備援（`prepare` 中的 `:1134`）。
- `PreparedWord`（`:433`，`glyphs/width/isWordLike/isWhitespace/breakPoints`）— `width` 為快取總和，`breakPoints` 來自軟連字或 `hyphenate`。
- `ExclusionRect`（`:482`）+ `computeLineSegments`（`:504`）— `O(n log n)` 的每行受覆蓋 x 區間補集。
- `LayoutEngine.isComplexScript`（`:584`，保守——過度回報，使僅明顯無上下文文字符合後綴塑形）與 `splitParagraphs`（`:566`，`\r\n|\r|\n`，`consumed` 保持來源偏移精確，使 CRLF 的 `\r` 永不成為 tofu 字形）。
- `shiftedExtent`（`:668`）為三個 `pMax` 走訪共用——行增長邏輯絕不可分歧。
- `suppressLineBreaks`（`:721`，GH-457 `'@'` 連接 + 結尾標點 `.:,;)]}!?` 合併與 `breakPoints` 重定基）。
- `LayoutBuffer`（`:2449`，`{ glyphs: PositionedGlyph[], widths: Float32Array, levels: Uint8Array }` 供 `layoutPreparedIntoBuffer` `:2241`，受 `V8_SMI_MAX` 限制的型別化陣列路徑，在呼叫點強制度量/繪製一致）。

### 2.8b 斷行、排除流與對齊 — 熱遍歷放置規則

熱遍歷是 `PreparedText` 成為 `x/y` 之處。三個外部純函式與一個內部方法支配每個換行決策；它們必須在 `LayoutEngine`（`packages/layout/src/LayoutEngine.ts`）與 `msdfLayout`（`packages/layout/src/msdfLayout.ts`）間一致，否則 GPU 與畫布斷行分歧。

- **`computeLineSegments(top, bottom, maxWidth, exclusions)`（`LayoutEngine.ts:504`）** — 排除流的可測試核心。`ExclusionRect { x,y,width,height }`（`:482`）與 `LineSegment { x0,x1 }`（`:490`）為唯二型別。純 `O(n log n)`（排序區塊）/ `O(n)` 空間：收集與 `[top,bottom)` 重疊且箝制於 `[0,maxWidth]` 的 `exclusions` 的 x 區間，合併接觸/重疊區間，於 `[0,maxWidth]` 內取補集。無重疊時回傳 `[{0,maxWidth}]`，當矩形（或聯集）橫跨寬度時回傳 `[]`。按行計時而非按字形——於 `layoutPrepared` 內每次 `currentY` 前進時呼叫一次（`:2004` `segs = computeLineSegments(currentY, currentY+lineHeight, maxWidth, exclusions)`）。`hasEx` 守衛（`LayoutEngine.ts:1860`）分流非排除路徑（單一全寬段），使常見情況無配置。

- **`suppressLineBreaks(words)`（`LayoutEngine.ts:721`）** — GH-457 放置前合併。規則 1：`'@'`（`glyphs.length===1 && char==='@'`）與其後每個非空白詞合併（`"@vectojs/core"` 保持原子）。規則 2：結尾標點 `.:,; ) ] } ! ?` 永不作為行首——向後合併至前一非空白詞（跳過空白詞，因此 `"word !"` 不會產生 `" !"` 偽詞）。合併時必須重定 `breakPoints: number[]`（`:732` `+ offset`，`:791` `+ prev.glyphs.length`），否則軟連字機會落在下游錯誤的字形索引。鏡像於 `msdfLayout.ts:195` `isOrphanPunct` / `breakableAnywhere`（CJK `code >= 0x2e80`）邏輯。

- **連字** — 兩個來源填充同一 `PreparedWord.breakPoints: number[]`（`LayoutEngine.ts:441`）：來源中的軟連字 `U+00AD` 為不可見斷行機會（在字素迴圈 `:1134` `(breakPoints ??= []).push(glyphs.length)` 中消費，無 advance），而可插拔的 `LayoutEngine.hyphenate: (word)=>string[]`（`:880`）對每 `isWordLike && glyphs.length>3` 詞被諮詢（`:1144`）——其部分透過 `getGraphemes` 重分段以計數位素而非碼元。`hyphenWidth`（`:490`，經 `glyphWidth` 的 `'-'` advance）對每個 `PreparedText` 僅度量一次，且僅當某詞攜帶 `breakPoints`（未命中時無度量，且在無度量節點中不遞增 `unmeasuredGlyphs`）。換行時，引擎偏好軟斷行（`msdfLayout.ts:131` 中的 `softBreaks: {at,x}[]`），然後退回至發射 `'-'` 四邊形的連字分割（`msdfLayout.ts:167` `emitHyphen`）。`MSDFTextEntity` 在主執行緒透過註解的 `layoutText` 驅動連字；worker 永不呼叫回呼。

- **`shiftedExtent(gfs, shift, pMax)`（`LayoutEngine.ts:668`）** — 為三個 `pMax` 走訪共用（`measurePrepared`、`layoutPrepared`、`layoutPreparedIntoBuffer`），使行高永不分歧。行盒高 `1.5 * pMax`，基線 `0.8 * pMax`（與 `Typography.ts:93` 相同分割）。升高的執行（`shift>0`，CSS `vertical-align` 正向上，上標）：`need = shift + 0.8*gfs` 必須容納於 `0.8*pMax`；降低的（`shift<0`，下標，與 `InlineObject.depth` 相反符號）：`need = -shift + 0.2*gfs` 必須容納於 `0.7*pMax`。範例：`0.75em` 上標位移 `~0.3em` 容納於 `0.8*(pMax-gfs)` 餘裕內，無需增長；遠距位移將 `pMax` 增長至 `need/0.8` 或 `need/0.7`。每個對齊遍歷與排除前進皆對最終 `pMax` 重算。

- **`justifyLines(wrapClosedLines, lineOf, xCoords, codePoints, advances, maxWidth, maxLineWidth)`（`msdfLayout.ts:11` + `LayoutEngine.ts:1937`）** — 將每個軟換行拉伸至 `maxWidth` 對齊。策略：按 `lineOf` 分組 `indices`，跳過 `wrapClosedLines` 未命中（每段落末行、明確換行與 `hitMaxHeight` 截斷），然後 `slack = maxWidth - (xCoords[lastIdx]+advances[lastIdx])` 箝制於行跨度的一半（防止極短行上的怪異拉伸）。含空白行等分擴寬詞間 `0x20` 間隙（`extra = slack / spaceIdx.length`，`shift` 累加器 `:58`）；無空白的 CJK 行在每字形間分配 `slack / lastContent`（`:70`）。多執行排除行不對齊（`LayoutEngine.ts:1937` 單執行守衛）。必須在 `LayoutEngine` 與 `msdfLayout` 間鏡像——對齊寬度是內容投射對 `positionedRuns` vs `logicalRuns` 重用的契約。

### 2.9 `packages/layout/src/measure.ts:39` — 度量器選擇

- `createCanvasMeasurer(family, baseSize=100)`（`:39`）— `getSharedMeasuringContext()`（`:44`），`Map<string,number>` 逐字素快取於 `baseSize`，線性縮放 `base * (size/baseSize)`（`:68`）。逐執行 `family/bold/italic` 鍵防止污染。
- `createMetricsMeasurer(family)`（`:96`）— 已註冊的 `FontMetricsSource`（`:106` 惰性解析，具版本化 `fontMetricsVersion` 比較，每呼叫避免 `+13%` 開銷 vs 在 `normalizeFamily` 內配置）。逐執行 `family` 覆寫在該執行未註冊時退回基礎來源，而非 `0.5em`。粗體/斜體刻意忽略（每字族單一 advance 表）。
- `resolveGlyphMeasurer`（`:161`）— 依設計畫布勝過度量勝過 `null`：它度量渲染器繪製的內容，包含合成字重；陳舊註冊絕不可覆蓋真值。

### 2.10 `packages/layout/src/msdfLayout.ts:93` — 供 worker 的 MSDF 斷詞

純函式 `computeMSDFLayout(request, font)`（`:93`）由 worker 與主執行緒備援共用（執行期無匯入——esbuild 經 `LayoutWorkerSource.ts` 將其內聯至 `LayoutWorker.ts`——因此主執行緒備援無法與 worker 分歧）。`LayoutEngine.layoutPrepared` 的扁平陣列對應物，無排除 / 逐字形碰撞回呼 / 富樣式：消費 `font.glyphs[].advance/kerning`（`byCode/kern`）、`metrics{ascender,descender,lineHeight}`（缺席時備援 `0.8/-0.2` `:118`）、`atlas` `aw/ah/yOrigin`（`:103`）用於 UV 幾何，但永不讀取 `planeBounds/atlasBounds`——那些屬於核心側的 `MSDFFont.layout`。走訪 `Array.from(text)`（`:176`，具碼點安全），每字形以 `kernKey(prevCode,code)`（`:192` `+ k*fontSize`）+ `letterSpacing`（`:121`）前進 `curX`，非間距標記零前進鏡像 `MSDFFont.ts:132`，連字/孤字標點 `isOrphanPunct`（`:201`，與 `suppressLineBreaks` 相同集合）與 `breakableAnywhere`（`:195`，CJK `>=0x2e80`），`wrapClosedLines: Set<number>`、`softBreaks: {at,x}[]`（`:131`）、`lineOf: number[]`（`:107`）、`xCoords/yCoords: number[]`、`packedStyles: number[]`（`:104`，打包的 `TextStyle` 位元）、`advances: number[]`（`:110`）、`codePoints: number[]`（`:101`）、`maxLineWidth`（`:114`）。換行時（`breakLine` `:140`、`dropFrom` `:155`、`emitHyphen` `:167`），`justifyLines(wrapClosedLines, lineOf, xCoords, codePoints, advances, maxWidth, maxLineWidth)`（`:11`）拉伸詞間 `SPACE(32)` 間隙（`:44`）或在無空白 CJK 上於每字形間分配 `slack/lastContent`（`:70`），兩者皆箝制於行跨度一半，避免極短換行上的怪異拉伸。

### 2.11 Worker 離執行緒模型

**邊界**：`LayoutWorker.ts:4`（`LayoutWorkerRequest`：`id/seqId/text/fontId/fontData/maxWidth/maxHeight/fontSize/lineHeight/letterSpacing/textAlign`）與 `LayoutWorkerResponse`（`:24`：`id/seqId/width/height + Uint32Array codePoints / Float32Array xCoords/yCoords / Uint32Array packedStyles + error?:string`）；`postMessage` 中的可轉移緩衝（`LayoutWorker.ts:111`）。

**Worker**：`packages/layout/src/LayoutWorker.ts:1`——約 115 行，`fontCache: Map<string,MSDFFontData>`（`:42`）、`isLayoutWorkerRequest` 驗證（`:53`）、`isExpectedOrigin`（`:48`）、`self.onmessage`（`:76`）→ `fontCache.set` → `computeMSDFLayout(request, font)` → `postMessage(response, [codePoints.buffer, xCoords.buffer, yCoords.buffer, packedStyles.buffer])`。未知字型 → 錯誤形狀的零長回應（`LayoutWorker.ts:92`），而非靜默丟棄。

**Manager**：`packages/layout/src/LayoutWorkerManager.ts:28`——單例（`getInstance` `:206`）、`createWorker`（`:67`）經 `new Blob([WORKER_SOURCE_STRING])` + `URL.createObjectURL`（`LayoutWorkerSource.ts`；鏡像 `MarkdownWorker` CSP 守衛：`typeof Worker/Blob/URL` 缺席 → `null` → 主執行緒備援，而非拋出）。`onmessage` 對 `${id}-${seqId}`（`:99`）匹配 `pendingCallbacks: Map<string,PendingLayout>`（`:34`），重置 `consecutiveWorkerFailures`（`:109`）。`onerror/onmessageerror` → `handleWorkerFailure`（`:120`），`MAX_CONSECUTIVE_WORKER_FAILURES=2`（`:19`）然後 `workerUnavailable=true` → 留在主執行緒（CSP `worker-src 'none'` 於 2026-07-31 度量：六次 `queueLayout` 呼叫產生六個 Worker，零布局）。`fontDataById`（`:043`，生命期保留，與 worker 死亡時清除的 `registeredFonts` 區分）使僅傳遞一次 `fontData` 時備援布局仍可運作。`warnedUnknownFonts`（`:049`）壓制重複主控台警告。`queueLayout(entityId, opts, callback)`（`:224`）去抖 50 ms（`:314` `setTimeout(runLayout,50)`）並比較 `seqIdCounter` 使晚到回覆被忽略；`cancelLayout/cancelLayoutForEntity`（`:220`/`:319`）排空計時器與 `prefix === ${entityId}-` 待處理映射條目。`resolvePendingOnMainThread`（`:144`）在 worker 死亡時直接重播每個待處理的 `computeMSDFLayout`。`errorResponse`（`:176`）合成未知字型的回覆形狀。

**消費者**：`packages/core/src/text/MSDFTextEntity.ts:25`——`queueLayout()`（`:204`）呼叫 `LayoutWorkerManager.getInstance().queueLayout(this.id, { id, seqId: ++seqId, text: layoutText, fontId: font.id, fontData: font.data, maxWidth/maxHeight/fontSize/lineHeight/letterSpacing/textAlign }, cb)`；`seqId` 每實體單調，`lastRenderedSeqId`（`:048`）丟棄陳舊回覆，`contentEpoch`（`:051`）跳過未變更同步，`rebuildProjectionLines()`（`:273`）重建 `projectionLines: ContentProjectionLine[]` 供 `getContentProjection()`（`:248`）。連字器在主執行緒透過以 `U+00AD` 註解 `layoutText` 運行。`watchAtlasDecode`（`:106`）等待 atlas 影像解碼；`SVGEntity.ts` 為姊妹非文字實體。

### 2.12 基準、比較與數據如何產生

文字布局有兩個誠實成本：**冷**（分段+度量）與**熱**（放置）。將合併的冷+熱呼叫與僅熱的比較會虛構落差。倉庫在三處強制公平比較的分離：

- **`benchmarks/text-layout-pretext`** 與 **`comparisons/text-layout-pretext/*`**（`entry.ts:1`、`page/*`、`serve.ts`、`build.ts`）— `@vectojs/layout` vs `@chenglou/pretext`。兩者皆經由真實瀏覽器中的 `canvas measureText` 度量（見 `comparisons/text-layout-pretext/entry.ts:1` 表頭：V8 vs Gecko 不同，僅有頭且具 GPU 支援的視窗可被引用——`hyprland-browser-bench` 擁有該 harness）。`prepare` vs `prepareWithSegments`（冷）與 `measurePrepared` vs `layout`（熱）為唯二可比較的一半；`layoutPrepared` / `layoutText`（定位每字形者）無 pretext 對應物，分開回報。
- **`scripts/compare-pretext.ts:1`** — 由 `benchmarks/bench.ts` 執行的無頭對應物。經 `Bun.build` 將 `vectojs core` + `pretext` 打包為 IIFE，注入 Playwright 控制的 Chrome，經 `Range.getClientRects().length` 對每語料/字型建立 DOM 真值，然後回報相對真值的行數誤差加上冷/熱吞吐量。記錄其自身歷史：直至 2026-08-04，它將我們合併的 `layoutText()` 與 pretext 僅熱的 `layout()` 計時，並在 `vectojs-docs/testing-catalog.md:A6` 中被標記為「尚未公平比較」。
- **`vectojs-docs/forge/baselines/*`** — harness 產生的半官方基線（`glyph-batch-*.json`、`content-projection-frontload-*.json` 等）。並非皆為文字布局：`glyph-batch` 為與 `LayoutBuffer` 寬度路徑共用的 WebGL 字形上傳成本，而 `markdown-stream-*` 捕捉串流期間的 lex+布局互動。每個皆攜帶 `commit`、CPU/GPU/driver 環境與 `refreshHz`，經 `benchmarks/run-browsers.sh`，使後續比較可正規化。

**如何本地重跑**（無頭、不可引用但對回歸有用）：`bun run scripts/compare-pretext.ts`（Playwright + `google-chrome-stable`）印出 markdown 表格並寫入 `scripts/.compare-results.json`。欲取得可引用數據：自工作區根執行 `benchmarks/run-browsers.sh`（在專用 Hyprland 工作區驅動真實 Chrome/Firefox，驗證 COOP/COEP、飢餓偵測）。

## 3. 如何在 `packages/core` 下組合

`MSDFTextEntity.text` → `rebuildLayoutText()`（`:187`，註解軟連字）→ `queueLayout()`（50 ms 去抖）→ `LayoutWorkerManager`（worker 或主執行緒）→ `computeMSDFLayout` → 型別化陣列 → `MSDFTextEntity.layoutResult` + `projectionLines` → 每 `PositionedGlyph` 的 WebGL `setMSDFTexture`/`addGlyph`、`getContentProjection().lines` 供 a11y、`CanvasGeometry` DPR 補償。

`Text`/`RichText`（`@vectojs/ui`）經 `LayoutEngine` + `measureContext` 直接走（畫布路徑）。相同不變量，不同度量器。

### 2.13 `GridTextEntity` 註腳 — 保留網格 vs 保留散文

`packages/core/src/components/GridTextEntity.ts:4`（`class n extends Entity`，`GridTextEntity`）為舊版等寬網格實體（固定 `charWidth/charHeight`，`updateGrid(ascii[])` `:23`，`render` `:36`）。它早於 `prepareContentGrid`，**不**流通 bidi、塑形阿拉伯文或遵守 `PreparedContentGrid`——它是對 `ascii: string[]` 的直接 `IRenderer.fillText` 迴圈（`:44`）。任何需要 bidi/CJK/網格 a11y 者，現代替代為具內容網格投射的 `prepareContentGrid`（`packages/text/src/PreparedContentGrid.ts:243`）（`01-selection.md` §3.3）。`GridTextEntity` 作為「繪製等寬最簡單事物」保留，並出現於 `packages/core/test/GridTextEntity.test.ts` 與 `packages/core/src/index.ts:n`。

## 4. 困難案例 — 已度量的失敗

### 4.1 分離畫布字型解析（僅 Firefox）

可藉 `Intl.Segmenter`（`LayoutEngine.ts` 中詞 `:916` / 字素 `:917`，`PreparedContentGrid.ts` 中 `:76`）、`BidiResolver` / `BiDi`（`BidiResolver.ts:3` `bidi-js`）、`registerFontMetrics`（`fontMetrics.ts:82`，在 `Typography.ts:67` 經 `getFontMetrics` 直接呼叫，並自 `measure.ts:75` 間接）、`cold/hot split`（`LayoutEngine.ts:459`–`1848`，以 ** 註解與 `measurePrepared` / `layoutPrepared` / `layoutPreparedIntoBuffer` 三聯畫）、與 `zero-GC`（`LayoutEngine.ts:2241` `layoutPreparedIntoBuffer` + `msdfLayout.ts:1` 扁平陣列 + `BidiResolver.reorderSegments` `:121`）搜尋。稽核排除流為 `computeLineSegments` `:504` 與 `ExclusionRect` `:482`；DPR 量化為 `PAGE_SCALE_BASIS_PX = 256`（`ContentProjectionManager.ts:71`）。

見 §2.3 表（`packages/text/src/measureContext.ts:18`）：單體 advance 短 20–47%。修正為附加；殘差 0.3%（`131.579` vs `132.000`）為 Gecko 對整數裝置 px 的網格擬合，不可逃避（`text-rendering: geometricPrecision` 度量相同，`:34`）。透過搜尋分離畫布建立（`grep -rn 'createElement.*canvas'` `packages/`）稽核。`OffscreenCanvas` 並非修正——它與 DOM 布局（`132.000`）而非已繪製畫布（`131.579`）一致。

### 4.2 CJK vs 拉丁度量

`0.5em` 備援在 32 px 時對窄字形測得 `+125%` 誤差、對寬字形 `-47%`（`packages/layout/src/LayoutEngine.ts:973` 註解）。具真實 `resolveGlyphMeasurer` 的 `EMPTY_GLYPH_ATLAS`（`:83`）治癒斷行誤差；具已註冊 `MSDFFont` 的 `createMetricsMeasurer` 治癒 SSR/無頭。混合 `CJK | Latin` 於一段落中落在同一 `layoutPrepared` 執行；`GlyphMeasurer` 按執行鍵 `fontFamily/bold/italic`，使等寬於比例字中內部使用自身 advance，而 `styleSig` 包含每個影響 advance 的 `TextStyle` 欄位。

### 4.3 BiDi 重排 vs 選取順序

`reorderIndices` 為橋樑：邏輯→視覺（`logicalToVisualRuns` `:62`）用於高亮矩形，視覺欄→邏輯用於命中測試，`reorderVisual`（`:89`）用於繪製順序。`PreparedContentGrid` 以邏輯順序保持 `cells`，以視覺 `x`（`packages/text/src/PreparedContentGrid.ts:315`）；選取偏移為來源（邏輯）偏移，而非視覺索引。見 `tmp/boss-research/01-selection.md` §3.2/§4.1 中逐字素載體 + `shapedPaint` 的契約一半，以及 `forge/findings/text-richtext-and-markdown.md:356`（InlineObject）中 `buildVisualLineGroups` 按 `node.y + height*0.8` 分組並將晶片切為獨立行的位置。

### 4.4 一段落中的混合字型備援

一段落樣式為 `family: 'Noto Sans'`，其 `family:'monospace'` 程式碼片段。`GlyphMeasurer.measure(char,size,'monospace')`（`packages/layout/src/measure.ts:60`）以該字族度量；未知執行字族退回基礎來源，而非 `0.5em`（`:138`）。段落 memo 的 `styleSig` 包含 `fontFamily`（直至 2026-07-30 缺席，僅因空 atlas 擾動使快取保持 0 命中而潛伏）。測試：`benchmarks/text-layout-pretext` / `comparisons/text-layout-pretext` 與 `scripts/compare-pretext.ts:1`（公平比較的冷/熱，以 `Range.getClientRects` 行數真值）。

### 4.5 DPR 敏感的 advance

畫布 advance 對裝置 px 做網格擬合；`LayoutEngine` `shiftedExtent` / `cssLineBoxBaseline` 使用獨立於 DPR 的 `0.8` 上升比。CodeBlock atlas 曾在首次建構時擷取 `devicePixelRatio`（`packages/markdown/src/Markdown.ts:1358`，`GlyphRasterAtlas.ts:139` `readonly dpr`），縮放後模糊（`forge/findings/text-richtext-and-markdown.md:724`，`sceneDpr 4.286 / atlasDpr 1.579 → blitScale 2.71`）。修正：將 `Scene.watchDevicePixelRatio()`（`Scene.ts:2805`）饋入 atlas DPR。經 `maxGradient`（峰值邊緣）而非平均亮度（受細等寬字形混淆，在 2.71× 失配時測得 `0.216→0.251` 反向）重驗證。`Atlas.ts:139` 處 `min(dpr,3)` 的 DPR 箝制為獨立上限——即使正確重建亦無法在 `4.286` 面板上超過 3。

### 4.6 行結尾歸屬與 CRLF 幽靈字形

`splitParagraphs`（`LayoutEngine.ts:566`）正則 `/\r\n|[\r\n]/g` 與 `MSDFFont.layout`（`MSDFFont.ts:213`）皆在任何 `ArabicShaper`/`BidiResolver`/`glyphWidth` 步驟**之前**消費分隔符，並記錄 `consumed`（`:569` `m[0].length`）以保持 `sourceIndex` 連續。天真的 `text.split('\n')` 將 `\r` 留作段落最後字元：它被塑形、度量並作為可見 tofu 放置，寬度為 `missingAdvance*size`，且其後每個 `sourceIndex` 每個 CRLF 偏移 1。`PreparedContentGrid.sourceLines`（`:197`）攜帶相同契約（`sourceEnd` 排除中斷，`nextSourceStart` 擁有它），並在 `source` 以中斷結尾時額外插入明確的尾隨空行（`:217` `if (start===source.length)`）。測試：`benchmarks/text-layout-pretext` 為 DOM 真值將來源正規化為 `\n`，但分開度量原始來源；一致性表示原始 `"\r\n"` 來源產生與 `"\n"` 來源相同的 `totalHeight` 與 `sourceIndex` 覆蓋，僅每行 `sourceLength` 差距 1。

### 4.7 連字 + 孤字標點 + 對齊必須按序組合

冷：軟連字 `U+00AD`（`LayoutEngine.ts:1134`）與 `hyphenate` 回呼（`:1144`）皆貢獻至 `PreparedWord.breakPoints`（`:441`）；`hyphenWidth`（`:490`）僅對具有任何的詞每 `PreparedText` 度量一次。熱：`suppressLineBreaks`（`:721`）在合併時重定 `breakPoints`，使 `"@vectojs/core"` 內的連字分割不落在現為原子的標記中間；詞佇列走訪（`:2109` 起）偏好前綴連字（`chosen` 掃描 `:2133`），然後退回整詞換行。結果：`wrapClosedLines`（`msdfLayout.ts:125`）與 `justifyLines`（`:11`）皆讀取最終中斷決策，因此僅修正其一會產生其度量寬度（供投射）與其放置 `x`（供墨跡）不一致的對齊行。`LayoutEngine` 與 `msdfLayout` 皆複製連字 `+ letterSpacing` + 孤字邏輯——僅改其一為常見回歸。

## 5. 開發者必須保持的不變量

1. **在繪製處度量。** 使用 `getSharedMeasuringContext()`（`packages/text/src/measureContext.ts:87`）。搜尋無 `appendChild` 的 `document.createElement('canvas')`。
2. **冷在熱之前，絕不為 DOM 重分段。** `prepare`/`prepareRich` 一次，`layoutPrepared` 多次（`packages/layout/src/LayoutEngine.ts:1080` `/` `:1266` `/` `:1848`）。重分段會偏移中斷與 bidi 順序。
3. **每個影響 advance 的欄位皆在 `styleSig` 中。** 若它抵達 `glyphWidth`，即抵達 `styleSig`/`fingerprint`（`:1266:styleSig`）。遺漏者在段落快取恢復命中率前潛伏。
4. **`InlineObject` 識別包含 `key`。** 兩個 `U+FFFC` 具相同 `alt/width/height` 但不同 `paint` 者，必須在 `key` 上不同，否則第二個繪製第一個影像（`packages/layout/src/LayoutEngine.ts:268`）。
5. **Worker 為優化，絕非必要。** `LayoutWorkerManager` 在連續兩次失敗或缺席 `Worker` 後退化至呼叫執行緒上的 `computeMSDFLayout`（`:144`）。未知字型 → 型別化錯誤，永不懸掛回呼（`:176`）。
6. **`indexMap` 與 `sourceIndex` 保持位元忠實。** 阿拉伯塑形的索引映射（`packages/text/src/ArabicShaper.ts:91`）為真值來源；`LayoutNode.sourceIndex/sourceLength` 索引原始字串而非塑形文字，使無障礙可替代 `InlineObject.alt` 而不偏移後續偏移（`forge/findings/text-richtext-and-markdown.md:372`）。
7. **為度量註冊表做版本控管。** `fontMetricsVersion()`（`packages/text/src/fontMetrics.ts:64`）必須在快取 `FontMetricsSource` 前讀取；中途替換字族度量為真實程式碼路徑（網頁字型交換、修正資料）。
8. **`0.5em` 表示未度量 — 對其計數。** 在測試/SSR 中觀察 `unmeasuredGlyphCount()`（`packages/layout/src/LayoutEngine.ts:31`）；非零表示虛構中斷，而非僅遺漏 atlas 字形（每 `Text`/`RichText` 段落 `fallbackToCanvas` 為 true，對品質無言）。

## 6. 如何在不破壞度量一致性的情況下新增腳本或樣式

**新腳本（例如泰文、天城文）：**

1. 對語料執行 `isComplexScript`（`packages/layout/src/LayoutEngine.ts:584`）——該謂詞門控串流的 `shapeSimpleRun` 捷徑（`:1358`）。任何具上下文敏感的腳本必須回傳 `true`，使段落走完整 `shapeArabic`+`BidiResolver` 路徑；否則後綴塑形器獨立塑形字素並靜默斷開連接文字。
2. 若標記對塑形為 TRANSPARENT，將它們同時加入 `ArabicShaper.isHarakat`（`:70`）與 `MSDFFont.isNonspacingMark`（`:132`）——它們是必須一致的葉套件。
3. 新增 advance 覆蓋：MSDF atlas 字形或已註冊度量（`registerMSDFFontMetrics`，`packages/text/src/fontMetrics.ts:97`）。無任一者時，`unmeasuredGlyphs` 對每個字元計數，斷行為 `0.5em` 猜測。
4. 以 `auditSceneSelection`（`packages/devtools/src/selectionAudit.ts`）在混合新腳本與 CJK+Latin 的行上驗證——間隙預算為 `PAGE_SCALE_BASIS_PX = 256` 量化（`ContentProjectionManager.ts:71`），因此改變每鄰居 advance 的腳本在此不可見。

**新 `TextStyle` 欄位：**

1. 問：「它是否改變 `glyphWidth`？」若渲染器將其繪為偏移 / 裝飾而不改變保留的 advance（`underline`、`lineThrough`、`highlightColor`），則無需一致性工作。若它改變度量的 advance（`fontSize`、`fontFamily`、`bold`、`italic`，任何選擇不同 `measure` 路徑者），則必須包含於 `styleSig`/`fingerprint`（`packages/layout/src/LayoutEngine.ts:1266`）與 `styleRangeEquals`（`:682`）中。
2. 同時將欄位加入樣式相等性與簽名——僅測試其一會留下另一作為 memo 毒藥（不同段落碰撞，同一段落永不命中）。
3. 若欄位將字形垂直移出 `0.8 * pMax`（上升）/ `0.7 * pMax`（下降）外，經 `shiftedExtent`（`:668`）加入 `baselineShift` 風格的垂直增長；三個 `pMax` 走訪皆須呼叫它。

**新斷行規則：**

- 位於 `suppressLineBreaks`（`:721`）或 `justifyLines`（`packages/layout/src/msdfLayout.ts:11`）。在合併時保持連字的 `breakPoints` 位移（`:732` `+ offset`，`:791` `+ glyphs.length`）。換行狀態（`wrapClosedLines`、`lineOf`、`softBreaks`）在 `LayoutEngine` 與 `msdfLayout` 間重複——兩者皆改。

### 4.8 垂直混合 — `baselineShift` 與行內物件

**`TextStyle.baselineShift`（`LayoutEngine.ts:146`，px，`positive = UP`，CSS `vertical-align` 慣例）** — 水平上僅渲染（advance 不變），但垂直上為度量變更。適度到可容納於 `0.8/0.7 * pMax` 餘裕內的值保持行高不變（`0.75em` 上標 `+0.22em` 為常見情況）；會將字形置於行盒外的位移驅動 `shiftedExtent`（`:668`）增長 `pMax`，增長值傳播至每個 `currentY` 前進與 `computeLineSegments` 呼叫——因此*此*行與下一行間的間距變寬，恰如高行內物件所迫使。呼叫者絕不可自行保留垂直空間；引擎在唯一一處一次性完成，否則三個 `pMax` 走訪不一致，`measurePrepared` 回報與 `layoutPrepared` 繪製不同的高度。

**`InlineObject`（`LayoutEngine.ts:216`，`StyledSpan.object` `:343` 要求 `text===OBJECT_REPLACEMENT`）** — 三個數字，皆為**最終尺寸下的 px**（不按執行 `fontSize` 縮放，不同於字形 advance）：`width`（水平 advance）、`height`（總盒）、`depth`（基線以下，正向下——與 `baselineShift` 相反符號）。引擎保留 `width`，在 `shiftedExtent` 增長中計入 `height/depth`，並回報已定位的 `LayoutNode.object` 盒（`x/y` 已包含 `depth`）；它永不呼叫 `object.paint(surface, box)`（`:301`）——文字渲染器對每 `LayoutNode.object` 呼叫一次。陷阱：`alt` 經 `RichText.accessibleText`（`collectSpans` 以 `alt` 替代 `U+FFFC`）抵達無障礙，但 `copy/selection` 仍以 `sourceText` 空間中的單字元哨兵索引，因此 `alt` 長度不偏移後續 `sourceIndex` 運算。第二個同症狀陷阱：`paint` **不**為段落 memo 鍵的一部分（每呼叫一個閉包會使其永遠 0 命中）——代理 `InlineObject.key`（`:259`）在 `paint` 不同時必須不同，否則兩個具相同 `alt` 的徽章共用快取段落，第二個繪製第一個影像（於 `forge/findings/text-richtext-and-markdown.md` a11y/InlineObject 條目中重觀測）。

### 4.9 串流成本與為何僅後綴塑形非時間所在

`LayoutEngine.streamShapeCache`（`:839`，`isComplexScript` `:584` 門控，`shapeSimpleRun` `:1644`）與段落 memo（`:829`/`833`）一同引入，以在增長的 Markdown 區塊上將每塊成本自 `O(length)` 降至 `O(appended)`（`Markdown.ts:899` 串流 `appendMarkdown`）。在 346 KB 合成文件上度量（`forge/findings/text-richtext-and-markdown.md:356`）：**成本相同 2630 ms vs 2639 ms**。真實 Markdown 具有限段落——既有 memo 已限制每段落重塑——因此僅後綴塑形僅對病態單一大段落有幫助。該發現作為正確性勝利保留發布（其 `isComplexScript` 謂詞與 `styleRangeEquals`/`objectRangeEquals` 檢查防止靜默的連接文字斷開），但**未**作為獨立 `@vectojs/core` 版本中的效能修正發布。當診斷串流時間時，`prepareRich` + `measureText` + 內容投射同步（`forge/findings` 2026-07-20 條目：`perf.ts` `requestAnimationFrame` 差值）重要；MSDF 改變字形*繪製*，`64fps→120Hz` 為獨立路徑。

## 5b. 擴充不變量（自 §5 展開）

1. **在繪製處度量。** 使用 `getSharedMeasuringContext()`（`packages/text/src/measureContext.ts:87`）。搜尋無 `appendChild` 的 `document.createElement('canvas')`。
2. **冷在熱之前，絕不為 DOM 重分段。** `prepare`/`prepareRich` 一次，`layoutPrepared` 多次（`packages/layout/src/LayoutEngine.ts:1080` `/` `:1266` `/` `:1848`）。重分段會偏移中斷與 bidi 順序。
3. **每個影響 advance 的欄位皆在 `styleSig` 中。** 若它抵達 `glyphWidth`，即抵達 `styleSig`/`fingerprint`（`:1266:styleSig`）。遺漏者在段落快取恢復命中率前潛伏。
4. **`InlineObject` 識別包含 `key`。** 兩個 `U+FFFC` 具相同 `alt/width/height` 但不同 `paint` 者，必須在 `key` 上不同，否則第二個繪製第一個影像（`packages/layout/src/LayoutEngine.ts:268`）。
5. **Worker 為優化，絕非必要。** `LayoutWorkerManager` 在連續兩次失敗或缺席 `Worker` 後退化至呼叫執行緒上的 `computeMSDFLayout`（`:144`）。未知字型 → 型別化錯誤，永不懸掛回呼（`:176`）。
6. **`indexMap` 與 `sourceIndex` 保持位元忠實。** 阿拉伯塑形的索引映射（`packages/text/src/ArabicShaper.ts:91`）為真值來源；`LayoutNode.sourceIndex/sourceLength` 索引原始字串而非塑形文字，使無障礙可替代 `InlineObject.alt` 而不偏移後續偏移（`forge/findings/text-richtext-and-markdown.md:372`）。
7. **為度量註冊表做版本控管。** `fontMetricsVersion()`（`packages/text/src/fontMetrics.ts:64`）必須在快取 `FontMetricsSource` 前讀取；中途替換字族度量為真實程式碼路徑（網頁字型交換、修正資料）。
8. **`0.5em` 表示未度量 — 對其計數。** 觀察 `unmeasuredGlyphCount()`（`packages/layout/src/LayoutEngine.ts:31`）；非零表示虛構中斷，而非僅遺漏 atlas 字形（每 `Text`/`RichText` 段落 `fallbackToCanvas` 為 true，對品質無言）。
9. **`\r` 與 CRLF 永不被塑形。** `splitParagraphs`（`LayoutEngine.ts:566`，`PreparedContentGrid.ts:197`）與 `MSDFFont.layout`（`MSDFFont.ts:213`）皆在任何塑形/度量步驟前擁有行結尾；溜過的 stray `\r` 會成為具幽靈寬度與錯誤 `sourceIndex` 的已定位字形。
10. **零 GC 鏡像配置 — 保持 BiDi 遍歷同步。** `layoutPreparedIntoBuffer`（`:2241`）必須套用與 `layoutPrepared` 的 `reorderVisual`（`:89`）相同的 `BidiResolver.reorderSegments`（`BidiResolver.ts:121` 型別化陣列）排列，並鏡像 `shiftedExtent`/`computeLineSegments`/`justifyLines`。此處漂移直至 bidi 段落被捲動前皆靜默。

## 6b. 擴充指南（自 §6 展開）

**新腳本（例如泰文、天城文）：**

1. 對語料執行 `isComplexScript`（`packages/layout/src/LayoutEngine.ts:584`）——該謂詞門控串流的 `shapeSimpleRun` 捷徑（`:1358`）。任何具上下文敏感的腳本必須回傳 `true`，使段落走完整 `shapeArabic`+`BidiResolver` 路徑；否則後綴塑形器獨立塑形字素並靜默斷開連接文字。
2. 若標記對塑形為 TRANSPARENT，將它們同時加入 `ArabicShaper.isHarakat`（`:70`）與 `MSDFFont.isNonspacingMark`（`:132`）——它們是必須一致的葉套件。
3. 新增 advance 覆蓋：MSDF atlas 字形或已註冊度量（`registerMSDFFontMetrics`，`packages/text/src/fontMetrics.ts:97`）。無任一者時，`unmeasuredGlyphs` 對每個字元計數，斷行為 `0.5em` 猜測。
4. 以 `auditSceneSelection`（`packages/devtools/src/selectionAudit.ts`）在混合新腳本與 CJK+Latin 的行上驗證——間隙預算為 `PAGE_SCALE_BASIS_PX = 256` 量化（`ContentProjectionManager.ts:71`），因此改變每鄰居 advance 的腳本在此不可見。

**新 `TextStyle` 欄位：**

1. 問：「它是否改變 `glyphWidth`？」若渲染器將其繪為偏移 / 裝飾而不改變保留的 advance（`underline`、`lineThrough`、`highlightColor`），則無需一致性工作。若它改變度量的 advance（`fontSize`、`fontFamily`、`bold`、`italic`，任何選擇不同 `measure` 路徑者），則必須包含於 `styleSig`/`fingerprint`（`packages/layout/src/LayoutEngine.ts:1266`）與 `styleRangeEquals`（`:682`）中。
2. 同時將欄位加入樣式相等性與簽名——僅測試其一會留下另一作為 memo 毒藥（不同段落碰撞，同一段落永不命中）。
3. 若欄位將字形垂直移出 `0.8 * pMax`（上升）/ `0.7 * pMax`（下降）外，經 `shiftedExtent`（`:668`）加入 `baselineShift` 風格的垂直增長；三個 `pMax` 走訪皆須呼叫它。

**新斷行規則：**

- 位於 `suppressLineBreaks`（`:721`）或 `justifyLines`（`packages/layout/src/msdfLayout.ts:11`）。在合併時保持連字的 `breakPoints` 位移（`:732` `+ offset`，`:791` `+ glyphs.length`）。換行狀態（`wrapClosedLines`、`lineOf`、`softBreaks`）在 `LayoutEngine` 與 `msdfLayout` 間重複——兩者皆改。

## 7. 閱讀 + 驗證檢查清單

**本 Boss 新進者閱讀順序：**
`measureContext.ts:1`（無此不變量則其餘皆不誠實）→ `fontMetrics.ts:14` → `Typography.ts:93` → `BidiResolver.ts:27` + `ArabicShaper.ts:18` → `PreparedContentGrid.ts:38`（保留網格對應物）vs `components/GridTextEntity.ts:4`（舊版 `n`）→ `LayoutEngine.ts:916`（`Intl.Segmenter`）→ `:929`（`glyphWidth`）→ `:1080`/`1266` 冷 → `:1848` 熱 → `:504`/`:721`/`:668` 放置規則 → `measure.ts:39` → `MSDFFont.ts:151`/`msdfLayout.ts:93` → `LayoutWorker.ts:1`/`LayoutWorkerManager.ts:28` → `MSDFTextEntity.ts:25`。在 `PreparedContentGrid` 後與 `01-selection.md` §§3–4 交叉檢查，再回到散文熱路徑。

**任何可能移動字形的變更後快速稽核：**

- [ ] 觸及工作負載上 `unmeasuredGlyphs`（`LayoutEngine.ts:31`）仍為 0（或新標記為原因，現已由 `registerMSDFFontMetrics` 覆蓋）。
- [ ] `cacheStats()`（`LayoutEngine.ts:1004`）`hitRate` 未降至 0——每個影響 advance 的樣式仍在 `styleSig`/`fingerprint` 與 `styleRangeEquals`/`objectRangeEquals` 中。
- [ ] 在字距密集行 + 混合 CJK/emoji 行 + bidi 行上 `auditEntitySelection` / `auditSceneSelection`（`packages/devtools/src/selectionAudit.ts`）——差值保持 `<0.5px`。
- [ ] Worker 備援涵蓋：`scripts/compare-pretext.ts:1` DOM 真值（`Range.getClientRects` 行數）仍同時匹配冷（`prepare` / `prepareWithSegments`）與熱（`measurePrepared` / `layout`）路徑。
- [ ] `\r\n` / 單獨 `\r` 文件渲染與其 `\n` 正規化雙胞胎相同行數——無幽靈 `\r` 字形且 `sourceIndex` 跨 CRLF 連續。

## 8. 指引

- 基準：`benchmarks/text-layout-pretext`（`bench.ts`）、`comparisons/text-layout-pretext/entry.ts:1`（`corpus()`、`buildAtlas()`、`preparePhase()`/`layoutPhase()`）、`comparisons/text-layout-pretext/page/*`、`scripts/compare-pretext.ts:1`（冷/熱分離、`Range.getClientRects` DOM 真值、公平比較的 `measurePrepared` vs `pretext.layout`；亦有單一 `CanvasRenderer` 計數的亮像素健全性檢查，`forge/findings:text-richtext-and-markdown.md:564`，警告勿對一個 `Scene` 重複計數第二個 `CanvasRenderer`）。
- 基線：`vectojs-docs/forge/baselines/*`（`glyph-batch-chrome-*.json`、`content-projection-frontload-*.json` 等）與 `vectojs/benchmarks/bench.ts`。每個皆攜帶 `commit`、CPU/GPU/driver 與 `refreshHz`，經 `benchmarks/run-browsers.sh`。
- 發現（僅附加，永不重寫）：`vectojs-docs/forge/findings/text-richtext-and-markdown.md`（23 條——分離畫布 Firefox 2026-08-02 `:461`、`InlineObject.alt` 永不抵達 AT `:364`、三個 GFM 構造靜默丟棄 `:508`、程式碼區塊 DPR 模糊 `:724`、串流重詞法二次 `:624`、僅後綴塑形否定結果 `:356`——實際文件上成本相同 `2630ms vs 2639ms`，段落有限）。
- 網格路徑：`tmp/boss-research/01-selection.md` 供終端/編輯器一半與 DPR 量化 / 覆蓋層 / 逐字素載體細節，此處不重複。
- 實體層：`packages/core/src/text/MSDFTextEntity.ts:25` + `SVGEntity.ts`、`packages/core/src/components/GridTextEntity.ts:4`（舊版 `n`）vs `packages/text/src/PreparedContentGrid.ts:243`（保留網格）、`references/text/pretext` 唯讀複本、`packages/layout/src/LayoutWorkerSource.ts`（已產生，勿編輯）與 `SPEC.md` 供 `PositionedGlyph` 四邊形的畫布→GPU 契約。直接基準為比較性而非規範性——pretext 僅文字，VectoJS 供給字形 + 選取 + a11y，因此「何者在斷行上更快」公平，「我該用何者」則否。
