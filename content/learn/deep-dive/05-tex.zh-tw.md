+++
title = "05 — 零 DOM TeX — 排版與 SVG 發射"
description = "為何 KaTeX 核心 → VectoJS 發射器 → 自包含 SVG，座標空間不變量、可拉伸幾何陷阱，以及新增 TeX 構造的安全路徑。"
weight = 25
+++

# 05 — 零 DOM TeX — 排版與 SVG 發射

> **Boss 05** 擁有將 TeX 字串轉為自包含 SVG 的契約——無需任何瀏覽器、無 DOM、無 CSS 引擎、無網頁字型——並使每個盒子、裁剪與可拉伸字形在幾何上忠於 KaTeX 在瀏覽器中的渲染結果。
>
> - **你將學到**：為何 KaTeX 作為版面核心被引入、瀏覽器的工作在哪裡結束；span 樹 → SVG 發射管線；五個座標/變換空間中單一錯誤框架如何破壞所有可拉伸元件；歷史缺陷叢集如何直接對應這些空間；以及安全新增 TeX 構造的方法。
> - **你不會學到**：Unicode/BiDi、阿拉伯文塑形或 `LayoutEngine` 斷行——Boss 02 擁有它們；Markdown worker 傳輸與串流調和——Boss 04；`GlyphRasterAtlas`/`SVGRasterCache` 的 DPR 路徑——Boss 07；`IRenderer` 契約本身。

## 為何需要零 DOM TeX

KaTeX 自身的 `buildHTML`（`packages/tex/src/kernel/VENDORED.md`）發射一棵 span 樹，其幾何依賴兩個外部引擎：**CSS 布局**（`position: relative` + `top`、`display: table-cell` + `vertical-align`）負責垂直定位，**行內文字布局**負責 x，而**網頁字型解析**（CSS 類別 → 字型檔案 → 字形）負責墨跡。`@vectojs/markdown` 無法支付其中任何一項：`SVGEntity` 經 `data URI → Image → createImageBitmap → drawImage` 光柵化（`packages/tex/src/index.ts:8`）。自 data URI 載入的 `Image` 不解析任何外部 URL，也不繼承頁面 CSS，因此 KaTeX 的 HTML/CSS 輸出與任何基於網頁字型的方法皆無法存活。SVG 必須攜帶**自身的外框**。

結果是一個硬性約束：發射的 SVG 零外部引用——無 `<text>`、無 `font-family`、無 `url()`、無 `xlink:href`（`packages/tex/src/emit/svg.ts:1` 表頭）。正是此約束證明需要一個新套件，而非 KaTeX 設定。

大小是選擇此形態而非替代方案的程式預算（`vectojs-docs/forge/decisions/math-engine-2026-08.md:30`）：對 `mathjax-full@3.2.2` 的 `bun build --splitting` 分解測得 **gzip 的 84% 位於 SVG 輸出 + 嵌入字型**，僅約 16% 在 TeX 輸入層，因此槓桿是**字形白名單**，而非套件裁剪。KaTeX 被測得**完全無 SVG 輸出**（`src/kernel/Settings.ts:206` 列舉恰為 `["htmlAndMathml","html","mathml"]`），而最小的 RaTeX `wasm32` 建構測得 **1 010 901 gzip / 768 278 brotli — 為其將取代的 MathJax 塊的 1.47 倍**（`math-engine-2026-08.md:103`），因此 WASM 在此工作存在的軸線上並未勝出。

## 哪些是引入的、哪些是自有的

`packages/tex/package.json:14` 的建構順序記錄了分工。`packages/tex/src/index.ts:25` 為對照表，以待閱讀而非重述的契約行為準：

- `src/kernel/` — KaTeX（MIT），由 `scripts/vendor-katex.ts` 自**固定的提交**（`references/markdown/KaTeX@5a5bf206`，`forge/decisions/math-engine-2026-08.md:191`）複製，並機械式剝除 MathML 與 DOM 發射。**未重新格式化或 lint 修正**，因此檔案保持可與上游對比。`VENDORED.md` 命名保留與丟棄的集合；`.oxlintrc.json` 與 `tsconfig.build.json` 皆因此排除核心（`math-engine-2026-08.md:312` 註腳）。
- `src/registry/` — 兩個手寫檔案（`defineFunction`、`defineEnvironment`），無 token 層級轉換可產生，因為 `mathmlBuilder` 在其中以表達式位置出現（`src/index.ts:30`）。其 `sideEffects:false` 陷阱使 Phase 1 的打包無法運作（`math-engine-2026-08.md:294` Correction 5），因此 `package.json` **絕不可**為 `sideEffects:false`——匯入副作用填充 `functions`/`environments`，tree-shaking 將刪除每個內建。
- `src/emit/` + `src/layout.ts` — 自有，為發射討論唯一觸及的檔案。
- `src/glyphs/glyphs.subset.json` — 經 `scripts/generate-glyphs.ts` 將 TTF 外框 → SVG 路徑，經 `scripts/subset-glyphs.ts` 縮減，經 `scripts/encode-glyphs.ts` + `src/emit/glyphCodec.ts` 重編碼（Phase 2 二進位格式，`math-engine-2026-08.md:282`）。發布的執行期表解碼為與 Phase 1 萃取器**位元組完全相同**的路徑字串（`glyphCodec.test.ts` 同一性斷言），並比相同字形的子集 TTF **低 12.0%**（`math-engine-2026-08.md:328`）。

## 管線 — 檔案對照

```text
TeX string  ──►  layout(tex, opts)                         layout.ts:62
                 Settings(displayMode,maxSize,strict)  ·─► kernel/Settings.ts
                 parseTree → AST                       ·─► kernel/parseTree.ts + Parser.ts
                 buildHTML(tree, Options) → DomSpan    ·─► kernel/buildHTML.ts + buildCommon.ts:552 makeVList
                      │ height/depth/style.top already resolved
                      ▼
                 DomSpan tree                          layout.ts:84-89  (wrapped in vecto-tex root)
                      │
                      ▼
                 emitSVG(tree, {emPx,color,padEm})     emit/svg.ts:1567  EmitResult{svg,width,height,depth,missing,placements}
                   walk → EmitState{glyphs,rects,paths,lines}
                   viewBox = layout box ∪ ink union + pad
                   defs deduplication + grouped fills + clipPaths
                      │
                      ▼
                 MathRender{uri,widthEx,heightEx,depthEx}  markdown/src/markdown-math.ts:544 convertMathToSVGDataURI
                   bounded mathCache (256) + inlineMathRasters (LRU, 256)
                   lazy import via preloadMathJax()
                      │
                      ▼
                 InlineObject{width,height,depth,alt,paint}  markdown/src/markdown-inline.ts:287 inlineMath arm
                   InlineObjectBox in LayoutEngine lines, paint draws the raster
```

`layout`（`layout.ts:62`）為 KaTeX 的 `buildTree` 去除攜帶僅瀏覽器 CSS 語意的 `.katex`/`.katex-display` 包裝（`layout.ts:5`）。其唯一有趣的選擇是 `throwOnError:true` + `strict:false`（`layout.ts:68`）：硬解析錯誤會拋出，使呼叫者可退化為逐字顯示 TeX 來源（`@vectojs/markdown` 對未知指令已如此）；嚴格性違規則不會。

`emit/svg.ts:1` 完成瀏覽器原本會做的三件事，在其自身表頭中命名，因為每件皆曾造成真實缺陷：

1. **解析字形 → 外框。** `SymbolNode` 攜帶文字加上度量，但**不含字型**（`fonts.ts:57` `CLASS_TO_FACE`）。`\left(` 產生在 `delimsizing size1` 祖先下具空類別列表的 `SymbolNode`——局部解析會選 `Main-Regular` 並在應為高括號處繪短括號（`math-engine-2026-08.md:444` 度量：經祖先鏈 105/105 正確，無則 97/105；`svg.ts:427` `walk` `classChain` 參數）。
2. **累積 x。** span 樹完全不攜帶 x——僅 `functions/rule.ts:44` 曾寫入 `Span.width`，且該處表示矩形。其餘每個 x 皆為行內文字布局，因此發射器自 TTF `hmtx` 表加總逐字形 advance（`svg.ts:492` `getGlyph` + `advance`；`math-engine-2026-08.md:432` 說明為何 `hmtx` 而非 `fontMetricsData.width`——組合重音為 0 advance 使標記覆蓋基底，而度量聲稱 1.0–2.33 em）。
3. **將 CSS 垂直定位 → 明確的 y。** `makeVList` 將每列編碼為 `style.top = -pstrutSize - currPos - elem.depth`，對應高度為 `pstrutSize` 的兄弟 `pstrut`；轉換自樹中讀回 `pstrutSize`（`svg.ts:1029`）並使用 `rowY = y - (-(top + pstrutSize)) * UPEM * scale`——它永不重推導 KaTeX 布局（`svg.ts:32`，`math-engine-2026-08.md:417` #1）。

發射器的單位為 **1/1000 em**（`svg.ts:52` `UPEM`），同時匹配字形表的 `UNITS_PER_EM`（`glyphTable.ts:49`）與 `svgGeometry.ts` 記錄的 1000:1 viewBox。`y` 為**自基線正向下**。字形外框以 y 向上發布，因此每個皆置於 `scale(1,-1)` 內，而非重寫其路徑（`svg.ts:1552` `transform` 字串；重寫將損失精度並破壞去重）。

Markdown 的包裝器（`markdown-math.ts`）接著**延遲**經此管線排版：`preloadMathJax`（`markdown-math.ts:85`，第 6 行僅型別的 `import type {emitSVG,layout}` 使值匯入不將引擎拉入每個消費者）動態 `import('@vectojs/tex')`，快取 `MathRender` 於 256 項加上同界的 LRU 光柵映射（`markdown-math.ts:218` `mathCache`，`markdown-math.ts:238` `inlineMathRasters`；`inlineMathRasters` 無界曾為 P3 發現——`forge/findings/text-richtext-and-markdown.md:1924`），並以 `exToPx`（`markdown-math.ts:143`，`markdown-inline.ts:305`）與 `paintInlineMath`（`markdown-math.ts:331`）將行內數學發射為具 px 單位 `width/height/depth` 的 `InlineObject`。展示數學為 `MathBlock extends MarkdownContainer`（`markdown-math.ts:598`）。兩檔案皆無對 `@vectojs/tex` 的靜態值邊——第二個（`KATEX_FONT_SCALE` 在 `markdown-math.ts:484` 中重宣告而非匯入即因此；相等性於 `test/mathBoxGeometry.test.ts` 中斷言）。

### 字型解析 — 完整鏈條

`fonts.ts:194` `resolveFont(classes)` 按優先級掃描累積的 `classChain` 經三個映射：

- `DELIM_SIZE_FONTS`（`fonts.ts:98` 例如 `delimsizing size1 → Size1-Regular`）— 最高，因為可拉伸分隔符在祖先而非 `SymbolNode` 上攜帶此。
- `DIRECT_FONT_CLASSES`（`fonts.ts:120` 例如 `mathbb → AMS-Regular`，`mathcal → Caligraphic-Regular`）。
- `CLASS_TO_FACE`（`fonts.ts:57` 例如 `mord textit → Main-Italic`，`mathbf → Main-Bold`）經 `AVAILABLE` 備援組合（`fonts.ts:135`——若 `Math-BoldItalic` 缺席則退回 `Math-Regular`）。

尺寸經 `SIZE_MULTIPLIERS`（`fonts.ts:263`，由引入漂移守衛對照 `katex.scss $sizes` 與 `kernel/Options.ts sizeMultipliers` 驗證——見 § 引入不變量守衛）透過 `sizingRatio`（`fonts.ts:265`）相乘。字型與縮放皆自**完整**鏈在每個節點解析，而非僅葉節點。

### 字形表與掛接 — 一張圖

一個 `SymbolNode` → 一個外框：`walk` 將其 `classChain` 傳遞至 `emitSymbol`（`svg.ts:427`），後者經 `resolveFont` 解析字型，經 `getGlyph(font, code)`（`glyphTable.ts:73`，`glyphCodec.ts:277` 中的後端 `GlyphTable`）查找外框，並或推送 `PlacedGlyph{x,y,scale,font,code}`（`svg.ts:132`）並以 `glyph.advance/UNITS_PER_EM * UPEM * scale`（`svg.ts:499`）前進，或——在缺失時——在 `state.missing`（`svg.ts:500`）中記錄 `font/U+XXXX` 並以引入的 `getCharacterMetrics` 寬度（`kernel/fontMetrics.ts`；為已發布外框的超集，`svg.ts:505`）前進。重複的 `SymbolNode.text` 字元**不會**經 `node.width` 融合（`buildCommon.ts:296` `tryCombineChars` 串接文字同時保持 `width` 為首字元者）——每個碼點個別度量，並在表與度量皆缺失時以一次警告的零 advance 備援（`svg.ts:514` `warnedMetricsMisses`，有界 `MAX_CACHED_MISSES = 1024` 於 `glyphCodec.ts:83`），使不良字形不污染 `penX`/`viewBox`。

## 座標空間不變量

每個放置皆在自 DOM 類別列表至 SVG `viewBox` 中最終像素的一趟旅程中穿越**五個空間**。任一處的錯誤會同時破壞所有可拉伸構造，而實際成簇破壞的兩個案例正好如此。

| #   | 空間                    | 定義                                                                                | Y 方向                                                   | 縮放                                                                                                            | 裁剪含義                                                  | 位置                                                                |
| --- | ----------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | **根局部 (em)**         | `state.x` 筆、`y` 基線，所有 `parseEm` 長度 × `UPEM × scale`                        | 向下，基線原點（`svg.ts:427` `walk` `y`）                | `sizingRatio(classChain)` 累積（`fonts.ts:265`）                                                                | —                                                         | `emitContainer` + `emitSymbol` 進入                                 |
| 2   | **列局部（重播）**      | `vlist-t > vlist > vlist-r > row` 具 `rowY = y - above`（`svg.ts:1080`）            | 向下，vlist 基線                                         | 相同                                                                                                            | 列縮排 `dx = startX + indent + marginLeft`                | `emitVList` 探測 + 重播（`svg.ts:1031-1180`）                       |
| 3   | **變換後（路徑局部）**  | `<path transform="translate(x,y) scale(sx,sy)">` 將局部 → 根使用者空間              | svg 使用者空間，y 向下於每字形 `scale(1,-1)` 外          | 字形：`scale / -scale`；可拉伸：`sx = scaleWidth/vbW, sy=heightEm/vbH`（`svg.ts:612`）                          | `400em` 寬的 `viewBox` 於 `sx` → `scaleWidth`             | `emitSvgNode` + 最終 `body` 變換字串（`svg.ts:584`，`svg.ts:1569`） |
| 4   | **ClipPath 局部**       | `<clipPath><rect>` 在參考元素的變換**之後**解析（SVG `userSpaceOnUse` 預設）        | **變換後**使用者空間                                     | 反向：`invSx=1/sx,invSy=1/sy`（`svg.ts:1555`）                                                                  | **必須在路徑自身框架中發射**                              | `svg.ts:1550-1562` `clipPath` 矩形                                  |
| 5   | **Markdown 盒 (ex/px)** | `MathRender{widthEx,heightEx,depthEx}` 然後 `exToPx(…,runSize)` → `InlineObjectBox` | LayoutEngine 行盒，基線 + 深度（`markdown-math.ts:566`） | `EX_PER_KATEX_EM = KATEX_FONT_SCALE/EX_PER_EM`（`markdown-math.ts:514`，相對 Chromium 中真實 KaTeX 驗證 0.02%） | 以 `MATH_PAD_EM=0.05`（`markdown-math.ts:481`）在四側填補 | `markdown-math.ts:544` + `markdown-inline.ts:305`                   |

**不變量**（在每個發射裁剪或覆蓋分支的路徑上必須成立）：`PlacedPath.clip` 視窗在**根空間**中記錄（`svg.ts:146-170`，`emitSvgNode` 自 `min-width` 播種），由任何 `aligned-vlist` 重播 `dx` 平移（`svg.ts:1196` `clip.x += dx`），然後以 `sx/sy` 反轉後發射（`svg.ts:1555`）。在 3 與 4 間差一個空間會使每個根式與上括號錯位 `p.x + sx·clip.x` 而非 `clip.x`（`CHANGELOG:31` #787）。

## 可拉伸幾何 — 三個家族

可拉伸元素的幾何**不在 `Span.width` 中**。僅 `functions/rule.ts:44` 曾寫入該值。三個家族，三種不同座標事實——混淆它們即為缺陷發生方式。

### 一般字形與規則

- `PlacedGlyph.x` 為絕對根 x；`width` 為 `advance/UPEM * scale`。無 viewBox、無切片、無 `clip`。
- `PlacedRect` 為三種形狀之一：在 `Span.width` 處的規則（`svg.ts:903`）、全寬規則/邊框（`borderBottomWidth` / `.angl` / `\boxed` 邊框於 `svg.ts:800` `fullWidth:true`，由 `svg.ts:1256` 處的 `placeRect` 解析），或垂直分隔符（`vertical-separator` 於 `svg.ts:718` → 描邊的 `PlacedLine`）。全寬形狀**無 advance**——`span.width` 缺席具意義。

### 單路徑 hide-tail 可拉伸

`\sqrt` 與 `\phase` 各在 `overflow:hidden`（`katex.scss:513` 處的 `hide-tail`）的包裝器下發射一個 400em 寬的 `SvgNode`。

- `\sqrt`：包裝器寫入**行內** `style.minWidth = 0.853em`（`kernel/delimiter.ts:533`），`emitContainer` 於 `svg.ts:969` 處讀取 `clipEm = parseEm(style.minWidth) || parseEm(style.width)`。因此 `emitSvgNode` 將 `state.x + clipEm*scale` 同時播種為 `widthEm` 與 `clip.w`（`svg.ts:590`）。400em 路徑的 `sx` 使用 `rawWidthEm`（非 `widthEm`），使 `slice` 以其宣告縮放渲染並被裁剪而非壓扁。
- `\phase`：包裝器**僅寫入 `style.height`**（`kernel/functions/enclose.ts:60`）。無行內 `minWidth/width`，因此 `clipEm` 保持 `undefined`，`hideTail` 為 `unclippedHideTail === true`（`svg.ts:971`）。子節點不作為 400em 前進（`svg.ts:966` 以 `FULL_WINDOW: 0..1 xMinYMin` 的 `emitOverlayPiece`）。改為整個容器範圍即為裁剪（`markdown-math.ts:92` 處的 `markdown` 類比無關；邏輯為 `svg.ts:966`）。

微妙處：`minWidth` **存在**處裁剪在行內播種，`emitSvgNode` 正確；**不存在**處裁剪待定，必須延遲至外層 vlist 範圍（見下方 #667）。同一包裝器類別的兩條碼路徑。

### 多片段覆蓋

`\overbrace`/`\underbrace`/`\xleftrightarrow`/`\xrightarrow` 將一個 400em 路徑拆分至 **2–3 個 span**，它們為 `position:absolute` 百分比視窗（`stretchy.ts:238` `widthClasses = brace-* / halfarrow-*`；`katex.scss:519` 處的 CSS）。

- 每個片段的 `SvgNode` 再次宣告 `width:"400em"`——按字面取值使 `\overbrace{x+y}` 度量為 **1200em**（3×400）（`CHANGELOG:31`）。
- 這些片段被記錄為**零 advance**的 `PlacedPath.overlay:{start,end,align,vw,vh}`（`svg.ts:195`，`svg.ts:629` 處的 `emitOverlayPiece`），僅在外層 vlist 列的 `width` 已知時解析：均勻覆蓋縮放 `s = max(boxW/vw, boxH/vh)`，逐片段 `preserveAspectRatio` 對齊（`svg.ts:1286` `placeOverlay` 處的 `xMinYMin / xMidYMin / xMaxYMin`），視窗裁剪至 `boxX = startX + start*width`。

## 發射器絕不可破壞的五個不變量

這些封閉了批次，自此成為最昂貴的回歸方式：

1. **`classChain` 攜帶字型。** `SymbolNode` 頻繁具空類別列表；字型位於祖先。局部解析靜默地在應為高分隔符處繪短分隔符、在應為短括號處繪高括號。影響**所有**帶分隔符公式（`fonts.ts` + `svg.ts:427` + `math-engine-2026-08.md:443` 度量）。
2. **`state.x` 為 advance 而非幾何。** `parseEm(margin*)/hmtx advance/sizingRatio` 總和為唯一正確的 x。任何第二來源皆重複計數。
3. **`top + pstrutSize` → `rowY` 為唯一垂直真值。** 自樹中讀出 `pstrutSize`；勿重算（`svg.ts:1029`）。
4. **`clip`/`overlay` 延遲至外層 vlist 範圍；別無其他。** 全寬規則、hide-tail 根式、`\cancel` 覆蓋與括號片段皆對**自身**外層列的 `width` 解析（`svg.ts:1172` `rectStart/lineStart/pathStart` + `svg.ts:1230`）。對公式的 `state.x` 解析使 `\cancel` 對角線按前置 advance 錯位，並埋沒巢狀 socpe。
5. **`clipPath` 矩形位於路徑局部座標。** 發射 `(clip.x - p.x)*invSx`（`svg.ts:1558`），絕非原始 `clip.x`，並以與其路徑相同的 `dx` 重播已記錄裁剪（`svg.ts:1196`）。空間 4 ≠ 空間 3。

## 案例研究 — 作為座標的缺陷

每個皆為不同空間混淆，行號為修正後狀態。

### #787 — `clipPath` 座標空間（`svg.ts:1550-1562`，`CHANGELOG:31`）

`clipPathUnits` 預設為 `userSpaceOnUse`，意指 `<clipPath>` 內的 `<rect>` 在參考 `<path>` 的 `transform` **之後**解析。因此矩形必須寫於路徑自身局部框架。修正前，`svg.ts:1555` 逐字發射根空間的 `clip.{x,w}`，因此 SVG 第二次套用 `translate(p.x) ∘ scale(sx)`：視窗落在 `p.x + sx·clip.x`。每個被裁剪的可拉伸——`\sqrt`、每個 phase——在非 1 的 `sx`/`sy` 下自畫布外消失。同一提交亦新增 `svg.ts:1196` 處 `clip.x += dx` 的 aligned-vlist 重播，因為裁剪為如其邊界路徑般的絕對根空間視窗——延遲路徑而非其視窗破壞了當根式位於置中分子的 `\frac{\sqrt{x}}{y}`（`CHANGELOG:57` `svgClipWindows.test.ts`）。

### #667 — `\phase` 度量為 400em（`svg.ts:966`，`CHANGELOG:56`）

`\sqrt` 永遠在其包裝器上寫入行內 `min-width`，使 `emitSvgNode` 可立即裁剪；`\phase` 則不。發射器信任 SvgNode 宣告的 `widthEm: 400` 作為 advance，將 `\phase{-120}` 回報為 400em。透過偵測 `classes.includes('hide-tail') && clipEm===undefined` 為 `unclippedHideTail`（`svg.ts:971`）並將該分支路由至 `emitOverlayPiece(FULL_WINDOW)`——零 advance 覆蓋，其可見視窗為外層列——修正。

### #665 — `\overbrace` 度量為 800–1200em（`svg.ts:859`，`CHANGELOG:58`）

同根原因，多片段：`brace-left/center/right` 與 `halfarrow-left/right` 為 `position:absolute` 具 `width:25/50/50%` 的外層列（`katex.scss:519`）。每個 `SvgNode` 仍宣告 400em——相加使 `\overbrace{x+y}` 度量為 1200em。透過辨識 `OVERLAY_PIECES[class]`（`svg.ts:328`），將那些 SvgNode 視為零 advance 待定覆蓋（`svg.ts:867` 處的 `emitOverlayPiece`），並以 `CONTAINER_BORDER_CLASSES`（`svg.ts:308`）處理相關的 `.angl` 案例（其邊框僅存在於 CSS）修正。

### #825 — `\sqrt{b^2-4ac}` 渲染為 `b²√4ac`（`svg.ts:1186`，`CHANGELOG:15`）

兩個獨立故障，皆以被開方數寬度為中心：

- `ROW_ALIGN_CLASSES.sqrt` 為 `center` 而非 `left`（`svg.ts:266`）。KaTeX 無 `.sqrt {text-align}` 規則；初始為 `left`。在 `center` 下，窄的 400em 根式位於寬被開方數中間，因此 vinculum 看似自開頭 `b²` 右側開始。
- hide-tail 裁剪僅按 `minWidth` 定尺，永不按實際被開方數寬度。一旦 `width`（vlist 範圍，即更寬時的被開方數寬度）已知，`svg.ts:1186` 將 `p.w`/`p.clip.w` 擴展為 `max(minWidth, radicandWidth)`——且僅對整數 `vlist` 本體 `classChain.includes('sqrt')`，而非祖先（`svg.ts:1203` 守衛），否則外層 `mfrac` 將根式拉伸至分數寬度。

### #788 — 具非 1 縮放與對齊重播的固定裁剪視窗（`svg.ts:1196`，`svgClipWindows.test.ts`）

先前關於 aligned-vlist 單遍優化的健全性主張稱「平移健全，因為 `walk` 對 `state.x` 為仿射」，並在 `svg.ts:1196` 平移裁剪**之前**聲稱裁剪平移健全（`CHANGELOG:57`）。回歸測試現自**發射的 SVG** 斷言有效渲染視窗與兩個情況下放置路徑自身盒重合：`sx=sy=0.7` 下與重播的置中 `\frac` 分子內。

加上 2026-08-13 六個 P2/P3 發現的段落壓縮，但發射程式碼保留為仍具承載力的守衛（`forge/findings/text-richtext-and-markdown.md:1789`）：

- **#514 phantom** — `style.color==="transparent"`（`kernel/Options.ts:306`）標記幽靈墨跡（`buildCommon.ts:96`）；在 `svg.ts:479`/`svg.ts:744`（`phantom` 旗標）處跳過墨跡但保留 advance。
- **#514 color** — TeX `\color` 在每個節點寫入 `style.color`（`functions/color.ts`）；發射器經 `walk` 繼承有效色彩並按其分組（`svg.ts:1522` `grouped`），以 `svg.ts:1542` 處的 `escapeAttr` 加固任何使用者衍生字串（`&`→`&amp;`、`"` 等）。
- **#514 規則/邊框** — 每個 `borderBottomWidth`/`katex-sout`/`.angl`/`.boxed` 樣式成為 `fullWidth` 矩形（`svg.ts:800`，`svg.ts:834`），而非僅 `frac-line`。
- **#514 `op-limits`/`x-arrow`/`mover`/`munder` 置中** — 加入 `ROW_ALIGN_CLASSES`（`svg.ts:266`）並對照 `katex.scss:405`/`563` 驗證，使 `\sum` 上下限與 `\xrightarrow` 標籤落在運算子/箭頭中心下。
- **#521 lap（`\llap`/`\clap`）** — `katex.scss:293` 處的 CSS `right:0`/`margin-left:-50%`，透過度量 `lapWidth` 並將 `state.x` 位移 `-lapWidth`/`-lapWidth/2`（`svg.ts:982` `lapKind` 分支）實作，而非將三個 lap 皆視為 `rlap`。
- **#521 `\smash`/viewBox** — `functions/smash.ts:66` 將節點的 `height/depth` 歸零而子節點保持尺寸；發射器將 viewBox 擴展為已放置墨跡的**聯集**（`svg.ts:1630` `minX/minY/maxX/maxY` 聯集）而非布局盒，因此被 smash 的內容不會被裁掉。

### 仍約束發射契約的字形/表格歷史

- **遺漏字形作為空白墨跡**（`CHANGELOG:62` `ff79c58`）：`569→662 (+87)` 子集新增對應 `U+2248`/`h*`/`l*` 等——遺漏外框經度量正確前進，因此渲染為**正確寬度的空白間隙**，不可見但布局正確。
- **顯示變體空白孔**（`CHANGELOG:9` 設定 `U+2216`、`U+22C3` 顯示變體、`U+005F`、上線測試區塊）：顯示區塊**降級為原始 TeX 來源**（藍色 CodeBlock）而非排版，因為 `convertMathToSVGDataURI` 於 `markdown-math.ts:559` 在任何 `emitted.missing` 上回傳 `null`。
- **`vertical-separator`（`{c|c}` / `{c:c}`）**（`CHANGELOG:29` #697）：陣列欄分隔符將其規則寫為 `style.borderRightWidth`/`borderRightStyle`，而非 `Span.width`。修正前 `svg.ts:617` 完全丟棄它；現在於此筆位置以 `verticalAlign`/`height` → `(y1,y2)`（`svg.ts:718`）發射描邊線。
- **類別攜帶的內距**（`CHANGELOG:30` #696）：`.x-arrow-pad`/`.cancel-pad` 等僅存在於 `katex.scss`，因此在 `CLASS_H_METRICS`（`svg.ts:366`）於與行內 `paddingLeft` 相同點折入前，列因該內距而度量偏短。`.cancel-lap` 的 `-0.2em` 邊距在同一表中成對，使 `\cancel` 保持其淨 advance。
- **有界影像與光柵上限**（`CHANGELOG:61`，`markdown-math.ts:1938` `destroy` 丟棄 `workerCallbacks`）：與座標無關，但對串流文件具承載力——無界的 `inlineMathRasters` 在 `mathCache` 逐出後仍固定每 URI 一個 `HTMLImageElement`。

## 引入不變量守衛

樣式表與核心合謀向樹隱藏資訊。下方每個值皆存在於 `katex.scss` 或核心檔案**但不在 `DomSpan` 中**，因此發射器將其轉錄為常數——且轉錄在每次引入執行中被驗證（`scripts/vendor-katex.ts --check`）：

| 轉錄常數                                                               | 真值來源                                                  | 守衛形態                                                                    |
| ---------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `MU = 1/18`（`svg.ts:60`）                                             | `katex.scss:$mu = 1em/18`                                 | 漂移守衛自簽出的 `katex.scss` 重推導 `MU`                                   |
| `NULL_DELIMITER_SPACE = 0.12`（`svg.ts:69`）                           | `$nulldelimiterspace = 1.2em/10`                          | 同上                                                                        |
| `SIZE_MULTIPLIERS[11]`（`fonts.ts:263`）                               | `katex.scss $sizes` + `kernel/Options.ts sizeMultipliers` | scss 扁平器重推導兩者                                                       |
| `KATEX_FONT_SCALE = 1.21`（`svg.ts:77`）                               | `.katex {font-size:1.21em}`（`katex.scss:24`）            | 同上，亦斷言 `markdown-math.ts:514 ≈ markdown/test/mathBoxGeometry.test.ts` |
| `ROW_ALIGN_CLASSES`（`svg.ts:266`）                                    | `katex.scss` 第 405/442/563 節 + 記錄的 `sqrt:left` 偏離  | 同一扁平器                                                                  |
| `CLASS_TO_FACE`/`DELIM_SIZE_FONTS`/`AVAILABLE`（`fonts.ts:57/98/135`） | `katex.scss` `font-family` 規則                           | 同上                                                                        |
| `CONTAINER_BORDER_CLASSES`（`svg.ts:308`，`.angl 0.049em`）            | `katex.scss:601` `.angl` 上/右規則                        | 同上                                                                        |
| `OVERLAY_PIECES` 視窗（`svg.ts:328`）                                  | `katex.scss:519` `.brace-*/halfarrow-*` 絕對視窗          | 同上                                                                        |
| `CLASS_H_METRICS` 內距（`svg.ts:366`）                                 | `katex.scss:555/569/579/583/601` 內距/lap/邊距            | 同上                                                                        |

`defineEnvironment` 的可選屬性（`argTypes`、`allowedInText`、`numOptionalArgs`）以**上游預設值直通**（`registry/defineEnvironment.ts`），而非固定或丟棄，因此未來 KaTeX 開始宣告它們時會呈現而非靜默丟棄（`forge/findings/text-richtext-and-markdown.md:2075`）。

## 布局互動實際如何運作

行內數學**不是** `fillText`。`markdown-inline.ts:287` `inlineMath` 產生一個 `InlineObject`（物件替換字元 + `InlineObjectBox`），其 `width/height/depth` 以 px 為 `exToPx(converted.{widthEx,heightEx,depthEx}, runSize)`——`runSize` 為 span 樹中該點的外層執行的 `fontSize`，因此標題內的 `$x$` 隨標題縮放（`markdown-inline.ts:292`）。`LayoutEngine` 於 `packages/layout/src/LayoutEngine.ts:808` 將其視為固定盒，如同行內圖片。盒的 `depth`（基線以下的距離）為 `emitted.depth + padEm`，與 width/height 共用同一 `KATEX_FONT_SCALE/EX_PER_EM` 尺度——落座深度與寬度一同推導，因此對 `KATEX_FONT_SCALE` 的變更使每個公式尺寸錯誤，而對現已取消的 `EX_PER_EM` 變更則無移動（`markdown-math.ts:111` 成對取消註記）。

展示數學完全繞過斷行器：`MathBlock` 為 `MarkdownContainer`，其子為 data URI 的 `SVGEntity`，位於容器寬度減去 `MATH_PAD_EM` 內距處——邊距與溢出為 `ScrollView` 關切，而非 `LayoutEngine`。

### `LayoutEngine` 如何對待行內公式

`LayoutEngine`（`packages/layout/src/LayoutEngine.ts:808` `LayoutEngine`，`README.md:24` 解耦引擎）永不塑形 TeX。行內數學到達為一個 `StyledSpan{ text: OBJECT_REPLACEMENT, object: InlineObject }`（`markdown-inline.ts:301`），其 `InlineObjectBox{width,height,depth}` 在跨度收集時已自外層執行的 `fontSize` 經 `exToPx` 固定——因此布局已在 px 中看到盒。熱 `LayoutEngine.layout` 路徑如同任何其他行內圖片般包裝它（`packages/layout/src/LayoutEngine.ts:2321` `layoutPreparedIntoBuffer` 保留前導註記於 `forge/findings/text-richtext-and-markdown.md:1762`；`core/src/text/measureContext.ts:12` 校準與 `core/src/text/Typography.ts:111` `ctx.measureText('Mg')` 備援為同一盒依賴的 Boss 02 文字度量守衛）：`width` 參與斷行，`depth` 使行的基線下降該距離，`height+depth` 增長行的盒，使具大深度的公式（分數、根式尾、`\left(` 高括號）無需二次度量即可擴展間隙。公式上的選取為雙世界一致性而非布局——`ContentGridProjector`/`ContentProjectionManager`（Boss 01/03）複製 `InlineObject.alt = t.text`（`markdown-inline.ts:310`），使讀者可尋找/選取/複製 TeX 來源，而畫布命中保持為 `InlineObjectBox` 矩形。任何在 `LayoutEngine` 快取後改變 `InlineObjectBox` 者必須使文字路徑變髒——同一 `measure-once, layout-many` 不變量為 Boss 02 所守衛。

### 盒幾何 — 為何 `KATEX_FONT_SCALE` 存活而 `EX_PER_EM` 抵消

`EmitResult` 以 **KaTeX 的** em 回報 em（為消費者字型大小的 1.21 倍，`svg.ts:77` `KATEX_FONT_SCALE`，`katex.scss:24`）。`markdown-math.ts:514` 組合 `EX_PER_KATEX_EM = KATEX_FONT_SCALE / EX_PER_EM (0.4421)`，使 `widthEx = (emitted.width + 2*pad)*EX_PER_KATEX_EM` 與 `depthEx = (emitted.depth + pad)*EX_PER_KATEX_EM`（`markdown-math.ts:566`）。然後 `markdown-inline.ts:305` 以 `exToPx(ex, runSize) = ex * runSize * EX_PER_EM` 解析 px——`EX_PER_EM` 抵消，留下 `px = (em+pad)*1.21*runSize`。經將 `EX_PER_EM` 變為 `0.31` 而零測試移動、將 `KATEX_FONT_SCALE` 變為 `1.0` 而 3 失敗驗證（`markdown-math.ts:111` 註記，`test/mathBoxGeometry.test.ts:39` 0.5% 容差吸收 2 位小數捨入）。`padEm` 非裝飾：SVG 的 `width/height` 屬性在四側皆包含它，而 `EmitResult.{width,height,depth}` 不包含，`markdown-math.ts:338` 處的 `drawImage(bitmap, x,y, box.width, box.height)` 將整個 SVG 拉伸至盒——僅回報墨跡盒使每個公式按 `padEm` 壓扁，無其回報深度使每個公式高 `padEm`。

## 字形子集與編解碼 — 位元組所在

已發布的 `glyphs.subset.ts`（`src/glyphs/glyphs.subset.ts`）並非 SVG 路徑文字，而是由 `src/emit/glyphCodec.ts:277` `GlyphTable` 解碼的二進位。`scripts/generate-glyphs.ts` 處的萃取讀取 TTF `glyf` 二次曲線（on-curve 旗標 + 隱含中點），`scripts/encode-glyphs.ts` 反轉該展開：18 306 個 `Q` 端點中 5 256 個恰為隱含中點並被丟棄，每個剩餘座標皆為整數（一旦去除中點，72 616 中 0 個離格），zigzag varint 差值將 72 616 中 60 637 個打包為一 byte（`math-engine-2026-08.md:333`）。語料（`scripts/subset-glyphs.ts`）為限制顯示失敗者——666 個字形由 `test/glyphCodec.test.ts` 的計數守衛固定。**存在於 `fontMetricsData.js` 但不在子集中**的字形渲染為正確寬度的空白間隙（來自度量的 advance，無外框；`CHANGELOG:62`）；**字面完全缺席**的字面（例如僅顯示的鯨魚如 `\digamma`）經 `markdown-math.ts:559` `emitted.missing.length>0 → null → CodeBlock` 退化——兩種失敗模式不同且擁有者不同。

### `packages/core/src/text/*` — TeX 與文字堆疊相會處

TeX **不會**呼叫 `packages/core/src/text` 塑形（BiDi、阿拉伯文、OpenType 特性）——字形已由 KaTeX 度量塑形，發射器直接寫入外框。TeX **確實**共用文字堆疊的下半部：`core/src/text/measureContext.ts:12` 度量上下文校準與 `core/src/text/Typography.ts:111` `ctx.measureText('Mg')` 備援為 Boss 02 對網頁字型 advance 的守衛，而 TeX 於 `svg.ts:499` 的 `hmtx` 衍生 advance 為 KaTeX 類比。兩者皆須滿足同一文字度量不變量（Boss 02 → 深層前置）：以真實字型、在正確上下文、以正確 DPR 度量，否則 `InlineObjectBox` 自畫布命中矩形與 a11y 投射漂移。`packages/text/src/fontMetrics.ts:82` `registerFontMetrics` 永不為 TeX 字面呼叫——引入的 `fontMetricsData.js` 為 TeX 度量來源，兩表擁有者不同。

### 讀取公式發射的 SVG — 以放置為真值

`EmitResult.placements`（`svg.ts:104` `GlyphPlacement[]` 以 em 為單位）為除錯面（`markdown-math.ts:517` 註記其存在以對同一 span 樹的真實瀏覽器布局做交叉驗證）。當公式看似錯誤時，對比 placements 而非閱讀 SVG 路徑湯：

```ts
import { layout, emitSVG } from '@vectojs/tex';
const { svg, width, placements, missing } = emitSVG(
  layout('\\sqrt{b^2-4ac}', { displayMode: true }),
);
// width 為 em 單位的 advance；placements[].{x,y,scale,font,code} 以 em 為單位；missing 列出缺席的 U+XXXX
```

`width` 為唯一門控布局的數值——低報會截斷 `InlineObjectBox`，高報會插入可見間隙——而 `placements[].y` 自基線正向下為必須與 Chromium 中 KaTeX 的 DOM 探針匹配至 0.0000 em 者（`math-engine-2026-08.md:423`）。失敗的裁剪或覆蓋顯示為 `PlacedPath.w/clip.w` 與 `placements` 範圍的不匹配，而非路徑字串差異。

## 驗證 harness — 使每個不變量保持綠燈者

- `test/emit.test.ts:37` — 自包含 SVG 契約（`<text>`/`font-family`/`url`/`xlink:href` 缺席；data-URI 片段可解析）；可拉伸覆蓋零 advance 與切片開窗（`emit.test.ts:380` `treats multi-piece stretchy overlays as zero-advance`）。
- `test/svgClipWindows.test.ts:6` — 針對 #787/#788 的渲染器幾何回歸：clipPath 矩形在路徑局部框架中發射，且在非 1 `sy` 下對齊 vlist 重播重合視窗（`svgClipWindows.test.ts:83` 上括號平鋪）。
- `test/vendorCheck.test.ts:252` — 自上游簽出重推導每個 `katex.scss` 轉錄常數的漂移守衛（註解括號陷阱為 MathJax 匯入，而非此套件）。
- `packages/markdown/test/mathBoxGeometry.test.ts:39` — KaTeX 字型縮放橋接（跨套件的 `KATEX_FONT_SCALE` 相等）與對 Chromium 中真實 KaTeX 的盒幾何（16px 時 19.3559 px/em，0.02% 離散）。

## 如何安全新增 TeX 構造

TeX 構造由**核心建構器**（AST → span + 樣式/類別）定義，並由**單一發射分支**消費，後者將那些 span/樣式轉為對正確範圍的已放置墨跡。當**七個**位置一致時，構造才算發布——遺漏任一曾為歷史失敗模式。

### 1. 新增並驗證核心建構器

經 `src/registry/defineFunction.ts` / `defineEnvironment.ts` 擴充 `src/kernel/functions/*.ts` 或 `src/kernel/environments/*.ts`（而非編輯核心）。驗證建構器的**輸出契約**：它設定哪些類別（例如 `.mover`、`.angl`、`.cancel-pad`）、寫入哪些行內樣式（`borderBottomWidth`、`paddingLeft`+`padLeftEm`、hide-tail 包裝器上的 `minWidth`）、包裝器為 `Span`、`SvgNode` 或攜帶 `LineNode` 的 `SvgNode`（`kernel/stretchy.ts:69`，`svgGeometry.ts` 為路徑目錄），以及是否涉及 `style.top`/`style.left`/`style.color`/`transparent`。核心的 `fontMetricsData.js` 度量已流入樹的 `height/depth`——勿將其作為第二來源重引入。

### 2. 教導發射器恰好一個新分支

分發位於 `svg.ts:427` `walk` → `emitSymbol`/`emitSvgNode`/`emitContainer`/`emitVList`。若新 span 攜帶**影響幾何的新 CSS 類別**，將其註冊至正確表格而非硬編碼：

- `CLASS_H_METRICS` 用於行內內距/邊距（例如 `.x-arrow-pad`，#696）——否則列度量偏短。
- `CONTAINER_BORDER_CLASSES` 用於僅存在於 `katex.scss` 的邊框邊厚度（例如 `.angl`，`svg.ts:308`）。
- `ROW_ALIGN_CLASSES` 若 vlist 列的 `text-align` 重要（`.op-limits` 等，`svg.ts:266`）。
- `OVERLAY_PIECES` 若新 span 為 `position:absolute` 百分比視窗（`svg.ts:328`）。

若構造的 SVG 宣告固定寬度（400em）但其**可見**寬度為外層列範圍，將其 SvgNode 視為**零 advance 待定覆蓋**而非字面 advance（`svg.ts:859` `#665` / `svg.ts:966` `#667` 處的 `\phase`/`\overbrace` 模式）。

### 3. 置於正確座標空間

- 橫跨其容器的**規則或邊框**為 `svg.ts:147` 處的 `PlacedRect{fullWidth:true, edge?}`，由 `svg.ts:1230` 處的 `placeRect(startX,width)` 對**自身外層 `vlist` 列**（`rectStart` 範圍）解析，而非公式的 `state.x`。
- 可見寬度非其宣告 `width` 的**可拉伸單路徑**為 `svg.ts:193` 處的 `PlacedPath{clip?}`，在 `svg.ts:596` 處具 `sliced` 處理（按 `rawWidth` 而非 `widthEm` 縮放），若為無 `minWidth` 的 `hide-tail` 則待定為 `FULL_WINDOW`（`svg.ts:966`）。
- **多片段覆蓋**為 `svg.ts:193` 處的 `PlacedPath{overlay}`，具 `svg.ts:1275` 處的 `placeOverlay` 覆蓋縮放 + `preserveAspectRatio` 對齊並裁剪至視窗（使每片段繪其容器的分數）。
- **垂直分隔符**（`vertical-separator`，#697）為 `svg.ts:173` 處的描邊 `PlacedLine`，其 `(x1,y1)→(x2,y2)` 還原 `aboveEm = height + verticalAlign`——與 `svg.ts:718` 已做者相同推導。

### 4. 保留色彩、幽靈與逸出

經 `walk` 繼承有效 `style.color`（`svg.ts:132` `ColoredPlacement`，`svg.ts:479` `color=style.color ?? inheritedColor`，`svg.ts:744` 處對該值的幽靈測試），在 `color==="transparent"` 時保持 advance 而跳過墨跡（處理 `\phantom`/`\vphantom`/`\hphantom`/`\mathstrut` 的 `rlap`——`buildCommon.ts:96`，`svg.ts:479`），將同色執行分組至 `<g fill=…>`（`svg.ts:1522`），並經 `escapeAttr`（`svg.ts:1542`）逸出任何插值色彩——今日呼叫者為主題衍生，但來自 TeX 輸入如 `\color{…}` 的值逐字寫入 `style.color`，否則會跳出屬性。

### 5. 正確定尺 — 選對閾值

`KATEX_FONT_SCALE` 與 `sizingRatio` 在兩處相乘組合：筆 advance（每次 `parseEm` × 處的 `UPEM * scale`）與 `PlacedGlyph.scale`（`fonts.ts:265`）。`SIZE_MULTIPLIERS` 中錯誤條目使腳本尺寸字形錯位約 50%，無 viewBox 修復可捕捉。

### 6. 更新度量契約

若構造的幾何包含容器範圍（vlist `width`、被開方數寬度、括號視窗），它必須在寬度已知**後**解析（`svg.ts:1227` 處 `emitVList` 的 `maxX-startX`；`svg.ts:1588` 處 `emitSVG` 中退回公式 `state.x`）。先前於 `svg.ts:1630` 的無界 viewBox（已放置墨跡的聯集，而非僅布局盒）具承載力——擴展該盒為 #521 對 `\smash`/`\hphantom` 的修正，其中 `height/depth` 為零但子節點保持尺寸。

### 7. 保持兩個守衛為綠燈

- `scripts/subset-glyphs.ts` — 若構造演練新碼點，將其加入子集語料（`src/glyphs/glyphs.subset.json`）並重跑編解碼守衛（`test/glyphCodec.test.ts` 固定 `package.json` 非 `sideEffects:false` 與 666 字形計數），使語料無法靜默丟棄新範圍。缺失但具度量存在的碼點渲染為**空白正確寬度間隙**（`CHANGELOG:62` #665）；僅顯示碼點渲染為**原始 LaTeX 來源**（`CHANGELOG:9`）。
- `scripts/vendor-katex.ts --check` — 將任何**新的** CSS 轉錄常數（`ROW_ALIGN_CLASSES`、`CLASS_H_METRICS`、`OVERLAY_PIECES` 等）加入自上游簽出重推導每個值的漂移守衛（`test/vendorCheck.test.ts` SCSS 扁平器），使下次 KaTeX 提升時的樣式表變更大聲失敗而非靜默偏移依賴它的每個構造（`CHANGELOG:62` 漂移守衛新增）。

## 除錯檢查清單

<!-- markdownlint-disable MD056 MD060 -->

| 症狀                                                               | 優先檢查                                                                      | file:line                                                              |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 所有可拉伸離畫布 / `p.x+sx·clip.x` 加倍                            | 裁剪路徑在根空間而非路徑局部發射                                              | `emit/svg.ts:1555` `invSx/invSy`                                       |
| `\overbrace`/`\xleftrightarrow` 度量為 400×N em；viewBox 寬 400 倍 | 多片段 SVG 被視為字面 advance 而非零 advance 待定覆蓋                         | `emit/svg.ts:859` `OVERLAY_PIECES` + `emitOverlayPiece`                |
| `\phase` 度量為 400em 而 `\sqrt{x}` 正確                           | 無行內 `minWidth` 的 `hide-tail` 仍前進 400em                                 | `emit/svg.ts:966` `unclippedHideTail`                                  |
| `\sqrt{b^2-4ac}` vinculum 截斷為 `0.853em`，被開方數部分位於根式外 | 裁剪按 `minWidth` 而非 `max(minWidth, radicandWidth)` 定尺，或 `sqrt: center` | `emit/svg.ts:1186` `clip.w < width` + `svg.ts:266` `sqrt:left`         |
| `\sum_{i}` 上下限齊左；`\xrightarrow{label}` 標籤位於箭頭左緣      | 列對齊類別缺失                                                                | `emit/svg.ts:266` `ROW_ALIGN_CLASSES`                                  |
| `\underline`/`\overline`/`\hline`/`\sout` 缺失                     | 無寬度的邊框 span——因僅考慮 `frac-line` 而丟棄                                | `emit/svg.ts:800` `borderBottomWidth/katex-sout`                       |
| `\boxed`/`\angl` 盒邊不可見                                        | 邊框厚度僅在 `katex.scss`（`.angl`）或 `borderStyle` 簡寫未讀                 | `emit/svg.ts:834` `CONTAINER_BORDER_CLASSES` + 簡寫                    |
| `{c\|c}` 規則不可見；`:` 實線而非虛線                              | `vertical-separator` span 被丟棄；`borderRightStyle===dashed` 未套用          | `emit/svg.ts:718` `dashed` + `svg.ts:1597` `stroke-dasharray`          |
| `\llap`/`\clap` 墨跡位於錨點右側                                   | 三個 lap 皆使用 `rlap`（`left:0`）語意                                        | `emit/svg.ts:982` `llap/clap` 寬度探測 + 位移                          |
| `\smash`/`\hphantom` 內容被 viewBox 裁剪                           | viewBox 自歸零的 `height/depth` 而非已放置墨跡聯集推導                        | `emit/svg.ts:1630` `minY/maxY` 墨跡聯集                                |
| 色彩丟棄；`\color{red}x` 黑色或未知看似有效                        | `style.color` 未被繼承；或已知缺失字形未經 `emitted.missing` 門控             | `emit/svg.ts:479` + `markdown-math.ts:559` `missing.length>0` 退化路徑 |
| `\xrightarrow{\text{…}}` / `\boxed` / `\cancel` 上窄間隙/過度量    | 類別攜帶的 `padLeft/padRight/marginLeft` 未折入 advance                       | `emit/svg.ts:366` `CLASS_H_METRICS`                                    |
| 高分隔符為短括號 / 錯誤斜體（`\mathit{123}` 一般）                 | 字型解析未含祖先 `classChain`                                                 | `emit/svg.ts:427` + `fonts.ts:194` `resolveFont(chain)`                |
| `layout('x')` 時 `Got group of unknown type` 於 `bun build` 後     | `packages/tex/package.json` 設為 `sideEffects:false`——註冊表被 tree-shake     | `packages/tex/package.json` + `test/glyphCodec.test.ts` 對該欄位的守衛 |

## 串流與為何 `layout → emit` 非行中可重入

行內數學的 `InlineObjectBox` 在 `LayoutEngine` 看到前即已固定，因此 TeX 管線永不在布局熱路徑內被呼叫。`markdown-math.ts:85` 的延遲 `import('@vectojs/tex')` 意指頁面上首個公式在 `preloadMathJax()` 解析前渲染為樣式化來源（`markdown-inline.ts:316` 處 `theme.mathFallbackColor` 的 `else`）——`ensureMathJax`/`retypesetFromTokens`（`markdown/src/Markdown.ts:3518`）將並行載入合併至單一 promise 並自已詞法分析的 token 重建，保持 `tokenChildPrefix` 平凡正確。`inlineMathRasters` 於 `markdown-math.ts:238` 的 LRU 在每次繪製時重插入，使仍可見點陣圖不被逐出，`mathCache`（256）加上同界的光柵上限為對解碼數千個相異公式的長壽文件的串流守衛（`forge 2026-08-13` 有界光柵發現）。第二個在建構前 `await preloadMathJax()` 的呼叫者取得同步的首公式排版——同一契約為 Boss 04 的 `onStable` 在 `waitForAppendSettled` 後快照 `Array.from(content.children)` 時所依賴。

該 `degrade-to-source` 契約亦為字形缺失契約：`convertMathToSVGDataURI` 的 `emitted.missing.length>0 → null`（`markdown-math.ts:559`）將部分缺失公式渲染為**複製的 TeX 來源**而非靜默缺口的等式，因此忘記字形的語料新增顯示為藍色 `CodeBlock` 而非錯誤等式。展示數學的備援（`markdown/src/Markdown.ts:3520` 整體 `retypesetFromTokens`）遵守同一契約——缺乏外框的區塊 `\digamma` 永不產生缺口的展示區塊，它保持為來源。

### `packages/core/src/text/*` 與更深的文字不變量

`core/src/text`（`core/src/text/Typography.ts:111`，`measureContext.ts:12`）塑形**網頁**文字——BiDi、阿拉伯文連接、可變字型 advance——而非 TeX。兩堆疊僅在 `InlineObjectBox` 相會：兩者皆為 `LayoutEngine`（`packages/layout/src/LayoutEngine.ts:808`）相同包裝的 `width/height/depth` 盒。Boss 02 的 `measure-once, layout-many` 不變量因此支配兩者：字型、DPR 或寬度變更後陳舊的 `InlineObjectBox` 無論盒承載 TeX 或 `fillText` 皆為一致性缺陷。TeX 永不呼叫 `registerFontMetrics`（`packages/text/src/fontMetrics.ts:82`）——其度量為引入的 `fontMetricsData.js`；兩表擁有者不同但布局真值唯一。

## 不變量 — PR 前可複製檢查清單

1. **深度穩定的類別鏈。** `resolveFont(classChain)` 與 `sizingRatio(classChain)` 自真實累積（`walk` `chain=[…classChain,…classes]`）執行緒化，而非葉切片。
2. **每個行內長度皆為 `parseEm * UPEM * localScale`。** 重播時無二次縮放——縮放已烘焙。
3. **任何其範圍為容器範圍的形狀皆待定直至 `place*(startX,width)`。** 第二個在不同 vlist 中讀取相同範圍的消費者否則會將根式拉伸至分數寬度。
4. **無 `parseFloat("100%")` 作為 `100em`。** `parseLength`/`parseEm` 分割 `pct` vs `em`；`\cancel` 覆蓋中的百分比 x 如同全寬規則般延遲至 vlist 寬度。
