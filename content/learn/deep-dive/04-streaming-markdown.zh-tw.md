+++
title = "04 — 串流 Markdown — 增量調和"
description = "為何任何前綴都可能是未完成語法、已提交前綴詞法器、Worker 差量協定、具原地變更器的 token→實體調和、O(C·N²) 與 wrapper-instanceof 陷阱，以及安全新增擴充的方法。"
weight = 24
+++

# 04 — 串流 Markdown — 增量調和

LLM 串流為**僅附加**且**按 token 粒度**（每塊約 4 字元）。VectoJS 必須在每個塊後呈現可讀文件——在 `close()` 前不留空白。顯而易見的策略——每次重詞法分析整個累積來源並重建實體樹——為每塊 `O(document)`，因此在整個串流上為 `O(N²)`。本章是使其成為 `O(不穩定尾部)` 的機制，以及使每個半部靜默失效的陷阱。

## 為何任何前綴都是未完成語法

`marked` 為**一次性**詞法器。它假設整個來源皆已存在。每個其終止符尚未到達的 Markdown 構造，都會在終止符到達時改變前綴的含義：

| 螢幕上的前綴                  | 目前外觀                                            | 下一塊可使其成為                                                                                             |
| ----------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 無尾隨 `\n` 的 `## Heading`   | `heading(depth:2)`                                  | 若前導 `#` 仍在傳輸中（`#` → `##`），則為 `heading(depth:1)`——深度在行結束前皆不穩定                         |
| `**bold`                      | `text("**bold")` + 字面 `**`                        | 一旦收尾 `**` 到達即為 `strong("bold")`                                                                      |
| `[label](https://ex`          | `text("[label](https://ex")` + 自動連結的裸 URL     | `link(label → https://example.com)`——URL 甚至尚未是完整 href                                                 |
| ` ```js\nconst a=1 `          | 具未封閉圍欄的 `code(lang:js, text:"const a=1")`    | 仍為 `code`——但圍欄亦可能成為 ` ```math ` 並接著被排版為展示數學                                             |
| `\| a \| b \|\n\| --- \| ---` | `table(header:[a,b], rows:[])` — 分隔列，零主體列   | `table(rows:[[…]])`——`marked` 將部分列具體化為具**空儲存格**的完整列，然後逐個填滿                           |
| `$$\nx`                       | `paragraph("$$\\nx")`（擴充裁剪 marked 的段落輸入） | 一旦 `$$` 封閉即為 `blockMath("x")`——加上 marked 的 `start()` 裁剪可**回溯合併**兩個先前的 `paragraph` token |

若無串流感知層，這些翻轉的每一個皆為已渲染實體的拆解。該層有兩個半部——詞法與調和——缺陷存在於其接縫處。

## 架構 — 詞法 · 傳輸 · 調和

```text
chunk ──► consumeFrontMatter ──► dispatchAppend ──► MarkdownWorker (off-thread)
                │                        │                    │
                │ rawMarkdown            │ postMessage         │ incrementalLex
                │ (body only)            │ {append,expectedLen}│ lexAppend / lexFull
                │                        │  or {text,oldRaws}  │ findStableCut + verify
                │                        │                    │
                ◄────── matchLen + tail ─┘                    │
                              │                               │
                     updateTokens(matchLen, tail)  ◄──────────┘
                              │
              ┌───────────────┼───────────────────┐
              │ prefix [0,matchLen) kept          │  entitiesReused++
              │ tail: reuse / rebuild / mutate    │  inPlaceUpdates vs entitiesRebuilt
              └───────────────┼───────────────────┘
                              │
                    content Stack + width/height republish
                              │
                    Scene.markDirty() + notifyLayoutUpdated()
```

三個模組擁有三個階段：

- **詞法** — `packages/markdown/src/incrementalLex.ts:446` `lexFull` / `packages/markdown/src/incrementalLex.ts:477` `lexAppend` 加上 `MarkdownWorker.ts:230` `self.onmessage`。快取為 `IncrementalLexCache`（`incrementalLex.ts:207`）：`source`、`tail = source.slice(stableOffset)`、`tokens`、`stableCount`、`stableOffset`、`degraded`。
- **傳輸** — `Markdown.ts:2244` `dispatchAppend` 與 `MarkdownWorker.ts:345` 差分。穩態發送 `{append, expectedLength}`（差量）；首次/重同步/復原發送 `{text, oldRaws}`（完整）。worker 差分計算 `matchLen` 並回傳 `tail = tokens.slice(matchLen)`。
- **調和** — `Markdown.ts:3674` `updateTokens(oldTokens → newTokens, knownMatchLen)`。經 `tokenChildPrefix`（`Markdown.ts:1030`，由 `Markdown.ts:1041` 處的 `setTokens` 增量維護）將 token 索引映射至子槽，然後每 token 三條路徑：**重用未觸及**、**原地變更**（`setSpans`/`setCode`/`appendRows`），或**銷毀 + 重建**。

Front matter 在詞法分析**之前**被剝離（`frontMatter.ts:94` `scanFrontMatter`、`Markdown.ts:1116` `initSource` / `Markdown.ts:1157` `consumeFrontMatter`），因此 worker 對其毫無概念——`workerSourceLen` 與 `expectedLength` 保持僅對本文的偏移。未解決的開頭最多保留至 `MAX_PENDING_CHARS = 4096`（`frontMatter.ts:62`），並由串流 `onClose` 中的 `finalizeFrontMatter()` 在 `waitForAppendSettled` 之前釋放（`Markdown.ts:1409`）。

### 舊路徑做了什麼

在 `incrementalLex` 之前，`MarkdownWorker` 持有 `{source, raws, version}`（`MarkdownWorker.ts:213` 舊形狀），附加差量，然後對**整個**累積來源做詞法分析。`99.5%` 原始前綴匹配在詞法*之後*執行，因此它節省實體重建，但永遠無法節省詞法分析——一個線性解析器在增長前綴上被呼叫 `N` 次。`postMessage` 接著重送整個 token 樹。兩個半部皆為每塊 `O(document)`；§ 數據中的基準在修正前使其可被引用。

## 增量詞法 — 已提交前綴的想法

`marked` 無增量 API。修正追蹤**穩定的區塊邊界**——token 列表不再變化的字元偏移之前的邊界——僅對其後文字重做詞法分析。

### 穩定切割規則

`findStableCut`（`incrementalLex.ts:331`）向後掃描具**至少一個後續 token** 的 `space` token，絕不越過兩個相鄰 `paragraph` token 的第一個，且僅在已穩定時：

- 被推入的 `space` 永遠表示**真實空行**——單一 `\n` 被合併至前一 token 的 `raw`（`incrementalLex.ts:36`）。
- 對每個內建規則，僅鄰接來源結尾的 token 仍可變更。`nFollow >= 1` 形式經暴力掃描：對每個前驅型別（`blockquote`、`code`、`heading`、`hr`、`html`、`list`、`paragraph`、`table`）皆安全，而 `nFollow == 0` 對 `code`/`list`/`paragraph` 失敗（`incrementalLex.ts:39`）。
- **`list` 需要兩個 token 延遲。** `'- a\n\n- b\n'` 無論空行數量皆為一個 `list`；相同標記永遠合併。`cutIsSettled`（`incrementalLex.ts:314`）要求 `space` 後的 token 本身已穩定，才對穿過先前 `list` 的切割取值。
- **`blockMath` 前向可達**受詞法器中的空行限制：`(?:(?!\n[ \t]*\n)[\s\S])+?`（`Markdown.ts:294`，`MarkdownWorker.ts:122`）。先前的 `(?!\n\n)` 使僅空白行未被守衛——`'$$\nx\n   \n$$\n'` 仍為一個 `blockMath`（`incrementalLex.ts:67`）。
- **`blockMath` 後向可達**為 `paragraphPairCap`（`incrementalLex.ts:289`）：marked 的 `startBlock` 裁剪僅能融合**兩個相鄰**的 `paragraph` token，而穩定切割永遠在 `space` 之後結束，因此一對永遠無法橫跨邊界。舊解——在任何行首 `$$` 上退化——充分但永非必要；縮小至上限恢復 `139×`（見 § 數據）。
- **連結參考、`:::` 容器、`[^label]:` 註腳**直接退化（`incrementalLex.ts:225` 處的 `DegradeReason`）：`def` 回溯重寫先前的行內 token（`incrementalLex.ts:122`），容器圍欄與註腳延續掃描器（`markdown-footnote.ts` `consumeContinuation`）具無界前向可達。退化保持正確性；拒絕不平鋪的前進（`incrementalLex.ts:360` 處的 `advanceTiles`）使視窗增長一個塊的成本而非退化。

每個前進皆**經驗證**（`advanceTiles`，`incrementalLex.ts:360`）：`source.slice` 必須等於覆蓋它的 token 的串接 `raw`。以裸列表標記 `'- a\n- '` 結尾的來源被詞法分析為原始 `'- a\n-\n'`——`raw` 平鋪來源的假設通常為真但非總是（`incrementalLex.ts:130`），因此未驗證的前進被拒絕而非退化。

### 成本模型

- `tail = prev.tail + append`——僅掃描 `tail` 使檢查保持 `O(window)` 而非 `O(document)`（`incrementalLex.ts:490`）。
- `charsLexed`（`incrementalLex.ts:248`）回報實際交給 `marked.lexer()` 的字元——邊界節省的直接度量。`reusedTokens` 回報自快取取得的前導 token。
- 天真的 `sourceCharsLexed` 加總本身對每回應重加總 `matchLen` 的 raws——在 n 塊串流上為 `O(n²)`（#657）。現在 `IncrementalLexCache.stableOffset` 自詞法器發送並以 `O(1)` 相加（`Markdown.ts:989`，`Markdown.ts:2289`）。

### 熱路徑中的擴充 — 為何 PX-0524 重要

每個 `marked` 擴充註冊一個 `start()` 掃描 + 詞法器。增量路徑必須對其分類（見 § 新增擴充）或 `sourceCharsLexed` 退化至文件長度——`getDevtoolsDescriptor` 的 `Parser cost` 群組（`Markdown.ts:2112`）中此實例已退化的訊號。

## Worker 協定 — 為何傳輸亦重要

重做詞法並非唯一的 `O(N²)` 項。`postMessage` 在主執行緒上**同步結構化複製**其參數。即使在詞法被開窗後，每塊重送整個文件仍使傳輸為 `O(document)`——測得在 8 KB 時 `4 µs` 上升至 512 KB 時 `220 µs`，而塊大小投遞為平坦 `~2 µs`（`Markdown.ts:1017`）。

修正同時在 worker 中快取 token raws **與**來源（`MarkdownWorker.ts:213` `rawCache`），以 `workerInstanceId` + `tokenVersion` 為鍵（`Markdown.ts:1008`）。若無每次 `setTokens` 時遞增 `tokenVersion`（`Markdown.ts:1043`），`setContent` 後的附加將對陳舊 raws 做差分。

- **差量** — `append` + `expectedLength`（`Markdown.ts:2345`）。worker 以 `append` 擴展 `cached.lex.source`，檢查 `cached.lex.source.length + append.length === expectedLength`（`MarkdownWorker.ts:308`）——一個整數，無字串工作——並執行 `lexAppend`。
- **完整** — `text` + `oldRaws`（`Markdown.ts:2355`），用於首次請求、`setContent`、同步備援或 `needResync`。worker 要求一次重同步（`MarkdownWorker.ts:294`、`299`、`334`）而非對分歧來源做詞法分析——錯誤的 `matchLen` 將破壞呼叫者的 `updateTokens`。

`matchLen` 依**同一**先前列表計算，呼叫者即對其做差分。當 worker 重用詞法的 `reusedTokens` 時，掃描自 `reusedTokens` 開始（`MarkdownWorker.ts:385`）——`O(window)`；退回自 0 掃描將再次為 `O(document)`。逐出有界（`RAW_CACHE_MAX = 256` 於 `MarkdownWorker.ts:228`），按最舊條目丟棄。

呼叫者在分發時快照 `this.tokens` 與 `this.tokenVersion`（`Markdown.ts:2252`），並在 `appendInFlight` 為 true 時合併（`Markdown.ts:2220`）。`dispatchedAt` 時間戳饋入 `streamStats.workerMs / workerMsMax`（`Markdown.ts:2273`），其最差值為掉幀訊號。

## 調和 — token 樹 → 實體樹，無需重建未變更者

### 已提交前綴想法 — 直覺

將文件想作在 `stableOffset` 處分割的兩個區域：

```text
[████████████ stable █████████████████] [ unstable tail ]
 |  already committed — never re-lexed  |  may still change |
 |  raw-equal, entity-reused            |  this chunk's work |
```

附加至**僅尾部**的文字永遠無法影響穩定前綴——這正是 `findStableCut` 經暴力取得的不變量。尾部為 `O(window)`——受空行間距離加上任何開放容器限制——因此每塊工作隨開放區域縮放，而非文件長度。

### DevTools — 即時觀測

`getDevtoolsDescriptor`（`Markdown.ts:1989`）呈現上方敘事引用的串流計數器：

- `Streaming` — `appends` / `workerResponses` / `workerMsAvg` / `workerMsMax`（掉幀為 `max` 而非 `avg`）。
- `Delta shape` — `stablePrefixChars` / `changedTailChars` 比值（接近 1 表示高重用）與 `entitiesReused` / `entitiesRebuilt` / `inPlaceUpdates`（快速路徑）。
- `Incremental reuse` — `tokensPrefixMatched` / `tokensReturned` / `tokenPrefixReuseRatio`。
- `Parser cost` — `lexerMs` / `sourceCharsLexed`。若 `sourceCharsLexed` 追蹤文件長度，則此實例已退化。

### 將 token 映射至子槽

並非每個區塊 token 皆渲染實體（`space`、非 SVG `html`、類註解 token 渲染 `null`）。`producesEntity`（`Markdown.ts:4044`）為謂詞；`tokenChildPrefix` 為其前綴和，僅對被 `setTokens(validFrom)`（`Markdown.ts:1041`）改變的後綴重建。`updateTokens` 接著：

1. 推導 `matchLen`——原始相等的前綴長度。當 worker 提供 `knownMatchLen` 時，驗證（`0 ≤ knownMatchLen ≤ minLen`）而非盲信（`Markdown.ts:3689`）。
2. 若 `abbreviations` 已變更則將 `matchLen` 上限為 `0`（`Markdown.ts:3711` 對 `collectAbbreviations` 的 `mapsEqual`）——遲到的 `*[TERM]: …` 儘管 `raw` 未變更仍可影響先前段落的行內 token（`markdown-abbr.ts` 平行於 `hasLinkDefinitions`）。
3. 當 `matchLen === oldTokens.length - 1` 且型別匹配時嘗試**原地**快速路徑（`Markdown.ts:3760` `lastTokenSameType`）。否則對後綴退回銷毀 + 重建。

注意：`updateTokens` 的銷毀迴圈**自** `matchLen` 開始——它曾自 `0` 以 `i >= matchLen` 守衛走訪，即使前綴完全被重用仍使每塊為 `O(total blocks)`（`Markdown.ts:3956`）。

### 原地變更器 — 增長尾部的情況

串流現實為**僅附加且尾部增長**。七個變更器涵蓋串流實際產生的尾部形狀：

| 尾部 token            | 變更器                                                                | file:line                                                      |
| --------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| `paragraph`（無圖片） | `RichText.setSpans(literalSpans)`                                     | `Markdown.ts:3833`                                             |
| `paragraph`（含圖片） | `Stack` 含 `[RichText, Image, …]`：經 `setSpans` 擴展尾隨 `RichText`  | `Markdown.ts:3846` `updateImageParagraph` (`Markdown.ts:3085`) |
| `code`（未封閉圍欄）  | `CodeBlock.setCode(text, lang)`                                       | `Markdown.ts:3796`                                             |
| `heading`             | 具深度守衛的 `RichText.setSpans(headingSpans)`                        | `Markdown.ts:3875`                                             |
| `blockquote`          | 下降至 `innerStack` 尾部包裝器，重寫其單一子節點                      | `Markdown.ts:3900` `updateBlockquoteTail` (`Markdown.ts:3306`) |
| `list`                | 重寫最後保留項目的 `setSpans`，`append` 新項目                        | `Markdown.ts:3914` `updateStreamedList` (`Markdown.ts:2987`)   |
| `table`               | 對最後保留列儲存格的 `RichText.setSpans`，對新列的 `Table.appendRows` | `Markdown.ts:3932` `updateStreamedTable` (`Markdown.ts:3203`)  |

每個尾部重同步皆為 `resizeLastChild`（`Stack.ts` 快速路徑）— `O(1)`——而非完整 `Stack.layout()`（`Markdown.ts:3843`、`3859`、`3886`、`3904`、`3945`）。屬性分支 `reflowToken`（`Markdown.ts:1520`）為 `setMaxWidth` 的非串流對應物——與 `renderToken` 逐分支保持，使寬度變更亦無需重建。

`renderToken`（`Markdown.ts:4150`）為建構點；`producesEntity` 與 `reflowToken` 必須在其新增的分支上保持**三方同步**——缺少任一的新分支對三個呼叫點之一為靜默錯誤。

### Markdown 區塊的布局

區塊幾何由 `LayoutEngine`（`packages/layout/src/LayoutEngine.ts:808`）驅動。`RichText` 經垂直 `Stack` 間隙 `theme.blockGap` 於 `availableWidth`（`Markdown.ts:4158`）處換行；引言與 `:::` 容器以 `quoteIndent`/`containerIndent` 縮排其 `innerStack`，並將 `QuoteBorder`/`ContainerBackground` 掛於所得 `Stack` 高度（`Markdown.ts:3403`，`Markdown.ts:4402`）。用於可供性按鈕的 `measureText` 使用文件字型（`blockAffordances.ts:379`），使控制項在繪製前定尺。`LayoutEngine.prepareRich` 為 `RichText` 的斷行器；其 memo 以內容而非寬度為鍵，因此 `setMaxWidth` 經形狀重繞而非重度量——`reflowToken` 存在的相同原因。

### 捲動與選取鉤子

非虛擬化的 `Markdown` 為 `ScrollView`（`packages/ui/src/ScrollView.ts:219` 彈簧驅動器）的一般子節點：宿主透過設定 `content.y` 捲動，並在重布局移動圖片下方區塊時呼叫 `notifyLayoutUpdated`（`Markdown.ts:2643`）。啟用 `virtualize` 時，`Markdown.setVisibleRange`（`Markdown.ts:1265`）為捲動驅動器；螢幕外高度位於 `RowHeights` 而非作為分離實體。選取位於 `RichText` 跨度；`updateTokens` 的前綴重用使已穩定行的 `InlineObject` 載體（圖片/數學 `OBJECT_REPLACEMENT`）保持於合成器路徑之外，而增長尾部的 `setSpans` 在不重建行幾何的情況下保留其中的選取。

## O(C·N²) 陷阱與 wrapper-instanceof 錯誤

### O(C·N²) — 測試未產生的形狀

`table` token 攜帶**每列**；`list` token 攜帶**每項**；`blockquote` 攜帶**每個內部區塊**。天真的調和在每塊上重建全部：

- `N` 項列表，逐項串流：`1 + 2 + … + N = Θ(N²)` 次 `RichText` 建構——對 32 項列表測得 `528` 對 `32`（`Markdown.ts:3908` 註解）。
- `N` 列、`C` 欄的表格：`Θ(C·N²)` 次儲存格建構**加上** `Table.layout()` 對每個儲存格重跑 `fitCell`——額外 `2×`。

聚合轉錄基準顯示 `mixed` 仍在每個後續散文塊上重建剛到達的完整列表——對任何單一構造形狀不可見（`benchmarks/markdown-transcript/corpus.ts`）。

### wrapper-instanceof 遺漏 — 為何串流在可選旗標下回歸

`blockAffordances: true` 將程式碼與表格包裝於 `BlockWithAffordances`（`blockAffordances.ts:433`）——一個擁有區塊加上其複製/下載 `BlockAffordanceButton` 子節點的 `UIComponent`，自區塊定尺（`blockAffordances.ts:457`），並投射為 `role: group`（`blockAffordances.ts:488`）。包裝器修正 DOM 順序 = tab 順序，並避免自 `Stack`/`Table` 竊取布局。

串流快速路徑直接測試 `existingEntity instanceof Table` / `instanceof CodeBlock`。啟用包裝器時，這些測試**永遠回傳 false**，因此每塊皆支付完整重建。

修正前的受影響位置：`updateTokens`（`Markdown.ts:3781`，`Markdown.ts:3209`）、`updateBlockquoteTail` 尾部萃取（`Markdown.ts:3348`）、`reflowToken` `code`/`table` 分支（`Markdown.ts:1557`，`Markdown.ts:1651`）、`updateStreamedTable`（`Markdown.ts:3212`）。模式為：

```ts
const target = entity instanceof BlockWithAffordances ? entity.block : entity;
if (!(target instanceof Table)) return false;
// … 寬度/內容變更後：
if (entity instanceof BlockWithAffordances) entity.refreshAffordances();
```

`#789` / `#795`（`vectojs` 議題）即為此錯誤。`code-review-2026-08.md:167` 將所有位置記錄在一起，因為它們成簇。

### 為何快照測試遺漏它

markdown 套件由基於 `setContent` 的快照主導。`setContent` **永遠重建**（`Markdown.ts:1740`）：它重置 `tokenVersion`、清除子節點並呼叫 `renderMarkdown`。它**永不演練**串流調和路徑（`updateTokens` + `inPlaceUpdates`/`entitiesRebuilt`/`tokenChildPrefix` + 包裝器解包）。僅破壞重用路徑的擴充或選項因此通過每個快照，僅在按 token 粒度的 `appendMarkdown` 下失敗。驅動 `setContent` 並宣稱守衛重用的 `1/11` 破壞為典型範例（`forge/findings/text-richtext-and-markdown.md:552`）。

門控規則：任何串流變更必須包含**串流等價破壞**——以 `marked.lexer()` 在每個前綴上以深 `toEqual` 逐字元串流語料（`incrementalLex.test.ts` 模式），並以 `appendMarkdown` 粒度進行調和。

### PX-0524 擴充爆炸 — 當增量仍非免費

新增語法覆蓋（註腳、容器、emoji、abbr、ins/mark、上標 — `markdown-footnote.ts` `FOOTNOTE_EXTENSIONS`、`markdown-container.ts` `CONTAINER_EXTENSIONS`、`markdown-emoji.ts` `EMOJI_EXTENSIONS`、`markdown-abbr.ts` `ABBR_EXTENSIONS`、`markdown-ins-mark.ts`、`markdown-superscript.ts`）使共用的 `marked` 實例自 `faeeb0b7` 的 `2` 個擴充增至 `2a4bd52` 的 `12` 個。每個皆為 `marked` 按**每區塊與每行內跨度**諮詢的 `start()`/`tokenizer` 對——因此即使以 `incrementalLex` 將詞法開窗至 `O(tail)`，每塊成本仍為 `O(tail × extensions)`。§ 數據中 `1.67×` 的解析上升為此叢集按塊計價，從未在發布時度量。`markdown-math.ts:258` `blockMath`/`inlineMath` 為兩個已支付者；其餘十個為階躍變化。教訓：任何擴充新增必須重跑 `markdown-transcript` 與 `stream-markdown-smd` 一致性門控——來自增量的常數因子勝利可被來自擴充數量的常數因子損失吞噬。

### 銷毀與遲到光柵

另兩個生命週期鉤子與串流競爭。`Markdown.destroy()`（`Markdown.ts:1938`）丟棄每個透過其閉包固定 `this` 的 `workerCallbacks` 條目——無此則串流中銷毀將使整個子樹保持活躍直至 worker 回覆。`isDestroyed` 門控 `mathLoadPending` 續體（`Markdown.ts:1952`），使被拆解的樹不會重渲染至已分離子樹。

行內圖片與數學有其自身串流後修正。段落圖片的 `onLoad` 於 `Markdown.ts:2562` 自 `naturalWidth`/`naturalHeight` 重度量並呼叫 `reflowAfterImageResize`（`Markdown.ts:2604`），其自底向上重推導包裝器盒（`Markdown.ts:2674` 處的 `resyncWrapperBox`）——裸 `content.layout()` 將重讀陳舊父快取（`Markdown.ts:2591` 註解）。標題或表格儲存格內的行內圖片無法以相同方式重設大小——其盒烘焙於 `LayoutEngine` 的行中；改為 `subscribeInlineImageRemeasure`（`Markdown.ts:1819`）在 `inlineImageBoxesStale`（`Markdown.ts:1855`）回報非方形解碼時重排版，但每 URL 僅一次（`Markdown.ts:1894` 處的 `inlineImagesMeasured`）。數學類似：`ensureMathJax`（`Markdown.ts:3518`）將並行載入合併至單一 `preloadMathJax` promise，而 `retypesetFromTokens`（`Markdown.ts:3551`）自已詞法分析的 token 整體重建——唯一使 `tokenChildPrefix` 平凡正確的路徑。

## 五方張力 — 設計必須同時滿足全部

| 作用力         | 要求                                                                                                                          | 所在位置                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **正確性**     | `lexFull(source)` 與串流附加與 `marked.lexer(source)` 在每個前綴長度上**深度相同**；`updateTokens` 結果等於 `setContent` 結果 | `incrementalLex.test.ts` 逐字元模糊、`markdownWorkerProtocol.test.ts` 差分門控強化至**樹相等**                                 |
| **增量性**     | 每塊工作為 `O(window)`（不穩定尾部）而非 `O(document)`——無界尾部增長為回歸                                                    | `stableOffset` / `charsLexed` / `changedTailChars` 計數器；`sourceCharsLexed` 必須追蹤酬載占比而非文件長度                     |
| **選取穩定性** | 附加絕不可移動或銷毀已穩定、靜止螢幕上區塊內的選取                                                                            | `tokenChildPrefix` + 重用 `matchLen` 前綴實體；`updateTokens` 永不觸碰前綴子節點（`Markdown.ts:3956`）                         |
| **布局穩定性** | 無螢幕外區塊應在串流中偏移已繪製螢幕上區塊的布局                                                                              | 無 `finalizeFrontMatter` 對 `rawMarkdown` 的縮小（協定要求）；`resizeLastChild` 僅尾部重同步；無重讀陳舊父盒的圖片重設大小重排 |
| **效能**       | 增量勝利後每塊渲染/布局工作保持於影格預算內                                                                                   | § 數據 — 調和現為總量的 `~5%`；渲染 `61%` 與解析 `33%` 占主導                                                                  |

違反其一以幫助另一為反覆出現的模式：顯而易見的 front-matter 修正（先詞法再移除）縮小 `rawMarkdown` 並破壞 worker 協定的 `expectedLength`；僅自 `content` 重布局而未重同步包裝器的圖片修正留下陳舊父盒（`Markdown.ts:2595` `reflowAfterImageResize`）。

## StreamController — 節奏、背壓與誰擁有 close

`Markdown.appendMarkdown(chunk)` 為原始附加。`Markdown.createStream(opts)`（`Markdown.ts:1384`）以 `StreamController`（`StreamController.ts:129`）包裝它，新增原始路徑所無的三件事——皆可選、皆僅顯示、皆不允許丟棄字元：

- **影格合併。** 無節奏時，每個 `write()` 將投遞至 worker 並排程調和。控制器批次至 `requestAnimationFrame` 節拍（`StreamController.ts:351` `schedule` / `onFrame`）。最簡單的呼叫者不使用 `pacing` 選項——僅 RAF 批次——此為常見的 ChatGPT 風格 SSE 情況。
- **字素節奏。** `pacing: { graphemesPerSecond }`（`StreamController.ts:22`）經 `commitPaced`（`StreamController.ts:378`）以 `Intl.Segmenter` 字素計數排空內部 `chunks` 佇列，使打字機效果按節拍每 tick 前進一個字素簇，而非一個 UTF-16 碼元（emoji 保持完整）。
- **背壓。** `maxBufferedChars`（`StreamController.ts:29`，預設 `64 KiB`）限制佇列；滿時 `write()` 產生背壓（`StreamController.ts:183` `canAdmit` / `blocked`）。此為流量控制而非增量正確性——有界緩衝永不截斷文件。

生命週期為 `createStream → write* → close() → onStable`。`createStream` 在 `virtualize` 啟用時（`Markdown.ts:1385`）或串流已存在時（`Markdown.ts:1388`）拋出——每實例最多一個控制器；`updateTokens` 的單槽 `appendInFlight` + `appendPending` 合併假設此。`close()` 同步提交任何待處理塊（`StreamController.ts:244` `commitAllSubmitted`），翻轉狀態為 `closed`，然後等待宿主的 `onClose` 鉤（`Markdown.ts:1404`），其執行 `finalizeFrontMatter` 與 `waitForAppendSettled`（`Markdown.ts:1413`——最後 worker 回覆 + 任何 `mathLoadPending` `preloadMathJax` + `fencedRebuildPending`）。僅接著 `onStable` 觸發（`Markdown.ts:1419`），帶 `Array.from(content.children)`——快照而非即時參考（`incompleteMode.test.ts:313`）。`onStable` 絕不可呼叫 `appendMarkdown`/`setContent`/`setMaxWidth`（`Markdown.ts:3669` `assertNotInStableCallback`）——它被交予完成的文件以供一次性工作如烘焙高亮快取。

## 樂觀未完成語法 — 在尾緣猜測

以 `**bo` 結尾的串流前綴應立即顯示**粗體**，而非原始 `**`。`StreamControllerOptions.incompleteMode`（`StreamController.ts:43`）控制此；`Markdown.streamIncompleteMode`（`Markdown.ts:853`）持有策略，而 `StreamController` 僅擁有緩衝。

- `'literal'`（預設）— 此選項前每個版本發布的內容：未封閉語法渲染為 `marked.lexer` 的純文字，因此 `**bo` 保持 `**bo` 直至封閉符到達。
- `'optimistic'` — `optimisticParagraphSpans`（`Markdown.ts:3415`）僅掃描**尾隨**段落的**最後行內 token**（已封閉構造已為其自身 `strong`/`em`/`codespan`/`link` token，因此僅最終純文字執行可持有開啟符）。`findUnclosedInline`（`markdown-inline.ts:546`）按優先級檢查三種語法：反引號（直接勝出——程式碼跨度內無其他語法）、強調 `*`/`_`（`\*{1,2}(?!\*)` 整標記加上非空白守衛；`_` 在 `markdown-inline.ts:570` 處排除 `snake_case`），與 `[label](url`（`markdown-inline.ts:581`）。猜測以猜測的格式渲染該執行（`Markdown.ts:3484` 處的 `optimisticStyle`）並追蹤於 `optimisticTail`（`Markdown.ts:866`）。合併的附加可使被猜測段落非尾隨——`dropStaleOptimisticTail`（`Markdown.ts:3611`）立即回繞它而非等待 `close()`。在 `close()` 時，任何剩餘猜測回繞為字面跨度（`Markdown.ts:3574` `unwindOptimisticTail`），使 `literal` 與 `optimistic` 串流最終相同。數學（`$…$`）不被猜測——其 `InlineObject`（`markdown-inline.ts:301`）經 `exToPx`（`markdown-math.ts`）保留 `width/height/depth`，而非跨度樣式。

## 虛擬化 vs 串流 — 互斥並非政策選擇

`virtualize`（`Markdown.ts:760`）經 `virtualTokens`/`virtualHeights`（`RowHeights`）與 `reconcileVirtual`（`Markdown.ts:1340`）將頂層區塊作為實體開窗，由宿主的 `setVisibleRange` 驅動（`ScrollView` 自動為之）。它**無法**與串流組合（`Markdown.ts:1385`，`Markdown.ts:2187` 皆拋出）：螢幕外區塊的實體不存在，因此 `updateTokens` 的 `tokenChildPrefix` + `matchLen` 前綴重用將定址未掛載的子槽。

`tableViewportHeight`（`Markdown.ts:771`）為逃生艙——它經 `Table.appendRows` + `reconcileVirtualRows`（`Table.ts:334`）與 `bodyClip` 固定，虛擬化**每個表格內的列**，且在串流時*確實*有效，因為 `updateStreamedTable` 經已延遲掛載的同一 `appendRows` 附加列。對巨大靜態文件選擇 `virtualize`；對以寬表格為主的串流文件選擇 `tableViewportHeight`。

### 段落形狀陷阱 — 為何 `producesEntity` 不僅是優化

`producesEntity` 經 `paragraphHasImage`（`Markdown.ts:3807` 守衛）判定 `text → image` 為正確性而非速度：無此則獲得首張圖片的段落保持其 `RichText`，圖片被靜默丟棄（`collectSpans` 對 `image` token 不發射任何內容）。列表項類似為 `itemIsInlineOnly`（`Markdown.ts:2759`）——將 `checkbox` 踢出 `INLINE_ITEM_TOKENS`（`Markdown.ts:2738`）迫使每個任務項走區塊路徑並破壞任務列表渲染；allowlist 是使未來區塊型別不被扁平化為 `RichText` 的關鍵。

## 已度量數據 — 引用時附基線

僅 `benchmarks/run-browsers.sh` 數據（真實有頭 Chrome/Firefox、真實 GPU、`calibrateRefreshRate()`、專用 Hyprland 工作區，依 `hyprland-browser-bench` skill）可被引用。無頭 `script/benchmark.ts` 與 `benchmarks/debug-page.ts` 為絆線/除錯。

### 調和勝利 — 聚合轉錄（`markdown-transcript-aggregate-2026-07-30`，CTX-0148，PR #296，提交 `0e4a4233`）

工作負載：`6` 輪、`176` 區塊、`27,882` 字元、`6,543` 塊、**`token` 粒度**——粒度主導：同一文件在 `token` vs `48` 字元下為 `151` vs `14` 塊，`7×` 重用差異（`markdown-transcript-aggregate-2026-07-30.md:111`）。每分支兩次執行；僅翻轉 `lastTokenSameType`。

|               | 無重用    | 今日      | 差值       |
| ------------- | --------- | --------- | ---------- |
| 調和，Chrome  | 1635.2 ms | 319.5 ms  | **−80.5%** |
| 調和，Firefox | 992.2 ms  | 245.0 ms  | **−75.3%** |
| 渲染，Chrome  | 3626.8 ms | 3393.7 ms | −6.4%      |
| 解析，Chrome  | 1978.3 ms | 1826.2 ms | −7.7%      |
| 總計，Chrome  | 7240.4 ms | 5539.4 ms | **−23.5%** |
| 總計，Firefox | 6334.1 ms | 5404.3 ms | **−14.7%** |

**按發布時的階段占比**（發布總計 `5539 ms` Chrome / `5404 ms` Firefox，`0.86 / 0.82 ms` 每塊）：渲染 `61.3 / 61.4%`，解析 `32.9 / 34.1%`，**調和 `5.8 / 4.6%`**——調和現為**最小**階段；按型別的剩餘重用空間受該上限限制。

### 面板速率重跑（2026-08-08，`2a4bd52`，Firefox 現為面板 Hz）

| 引擎    | Hz              | 解析        | 調和      | 渲染        | 總計        |
| ------- | --------------- | ----------- | --------- | ----------- | ----------- |
| Chrome  | 240.09 / 239.95 | 2826 / 2830 | 459 / 456 | 3386 / 3388 | 6670 / 6674 |
| Firefox | 229.01 / 241.26 | 3190 / 3282 | 311 / 315 | 3581 / 3691 | 7082 / 7288 |

每塊渲染 `0.517 / 0.556 ms` = `4.16 ms` 影格的 `12.4 / 13.3%`；每塊總計 `1.02 / 1.10 ms` = `24.5 / 26.4%`。原始執行中 `≈60 Hz` 的 Firefox 數據（`58.75 Hz`）**並非**未聚焦視窗假象——它為 `layout.frame_rate = -1`（`forge/findings/devtools-and-telemetry.md:2026-08-03`）。

**浮現的真實回歸：** 解析在兩引擎上上升 `1.67×`。對同一 `6543` 塊語料以裸 `marked` vs 共用 12 擴充實例做詞法：`1871 → 3127 ms`（`1.671×`）。成本為每塊每擴充 `start()`/`tokenizer`。在 `faeeb0b7` 時實例攜帶 `2` 個擴充；在 `2a4bd52` 時攜帶 `12` 個——**未度量的 PX-0524 叢集價格**。解析占比自 `33% → 42–45%` 移動。`incrementalLex` 數據已在詞法被開窗*後*——無此會更糟。

### 增量詞法勝利 — 散文夾具（`comparisons/stream-markdown-smd`，Chrome 150 / Firefox 153，784 塊）

之前：每塊完整重詞法，`419.6 / 440.2 ms`，指數 `1.98`，交給詞法器的字元 `9,847,040`。之後：`6.02 / 9.06 ms`，**`69.8× / 48.6×`**，指數 `0.94 / 1.21`，字元 `63,806`，指數 `1.00`（`forge/findings/text-richtext-and-markdown.md:2026-08-03`）。

### 縮小上限後的數學串流（`markdown-stream-math`，vectojs#398）

全面 `blockMath` 退化 → 僅上限：**`139.3× Chrome / 96.5× Firefox`** 於 `26,760` 字元、`200` 節數學文件；至詞法器的字元 `215.9×` 減少；邊界在文件的 `99.84%` 處穩定；每個尺寸的最大單塊詞法 `105` 字元（`forge/baselines/markdown-stream-math-findings.md`）。

## 在不使串流回歸的情況下新增 Markdown 擴充

擴充為兩個註冊（`Markdown.ts:240` 與 `MarkdownWorker.ts:95`——相同 `marked.use` 呼叫，**兩側**，相同詞法器——漂移破壞 worker 對 `marked` 的視圖）。四項檢查，依序：

### 1. 分類擴充的可達性

- **無 `start()` 且受空行限制** → 安全；無邊界變更。範例：行內規則（`abbr` `markdown-abbr.ts`、`emoji` `markdown-emoji.ts`、註腳參考 `markdown-footnote.ts` 一半）無需退化。
- **提供 `start()`** → 後向可達；`paragraphPairCap` 已對其設限，但**驗證**——任何新 `start()` 皆被覆蓋，因為裁剪為 marked 的而非 `blockMath` 的（`incrementalLex.ts:103`）。
- **橫跨空行** → 前向無界可達；`hasContainerOpener` / `hasFootnoteDefOpener` 模式（`markdown-container.ts: hasContainerOpener`，`markdown-footnote.ts: hasFootnoteDefOpener`）。經 `DegradeReason` **退化**（`incrementalLex.ts:225`）——切割上限無法對其設限。
- **收集遲到定義**（`marked` `def` 模式，`abbrDef` 為迫使 `Markdown.ts:3711` 處 `abbreviationsChanged` 歸零 `matchLen` 的窄案例）→ 迫使重建或退化；記錄原因。

若不確定，**退化**——它永遠正確，僅對實際包含開啟符的串流文件付出成本。

### 2. 同步註冊並驗證守衛

- `Markdown.ts:294` 與 `MarkdownWorker.ts:122` 中相同的 `blockMath` 詞法器副本已漂移一次（`[\s\S]+?` vs 空行守衛），而 worker 經 `scripts/build-worker.js` → `MarkdownWorkerSource.ts` 產生。若第三次漂移則抽取共用模組（`markdown-stream-math-findings.md: Also fixed`）。
- 對空行守衛的詞法器，守衛必須為 `(?!\n[ \t]*\n)`（含僅空白行），而非 `(?!\n\n)`（`incrementalLex.ts:67`，#398）。

### 3. 教導每個實體感知位置

對於你的擴充新增的 token 型別：

- `renderToken` — 建構（`Markdown.ts:4150`）。
- `producesEntity`（`Markdown.ts:4044`）— 當且僅當它渲染實體時為 `true`；恰對渲染 `null` 的 token 為 `false`（否則 `tokenChildPrefix` 漂移）。
- `reflowToken`（`Markdown.ts:1520`）— 寬度變更路徑；遺漏分支使區塊保持舊寬度。
- `updateTokens` 原地分支（`Markdown.ts:3760`）— 僅當具變更器（`setSpans`/`setCode`/`appendRows`）的尾部增長形狀才選擇加入；容器型別（`blockquote`、`list`、`table`）經尾部下降而非直接變更。
- 若區塊可被可供性包裝，解包：`instanceof BlockWithAffordances ? .block : entity`——並在變更內部尺寸後呼叫 `refreshAffordances()`（`Markdown.ts:3209`，`Markdown.ts:3781` 模式）。
- 若行內圖片/數學可出現於新區塊內，涵蓋 `containsImage`/`containsInlineMath` 訂閱（`Markdown.ts:4166`）與 `reflowAfterImageResize` 包裝器重同步。

### 4. 新增破壞而非僅快照

- `incrementalLex.test.ts` 逐字元模糊：以逐字元串流包含新構造的語料，在每個前綴上以深 `toEqual` 對 `marked.lexer()`。保持對 `14 docs × 每前綴 × 每切割` 的暴力掃描，其證明 `findStableCut`；在有無擴充的情況下執行以證明 `nFollow >= 1` 仍成立。
- **串流調和破壞**：以 **token 粒度**經 `appendMarkdown`（非 `setContent`）串流包含該構造的文件，斷言 `inPlaceUpdates`/`entitiesRebuilt`/`charsLexed` 按預期方向移動，並對 `setContent` 斷言深 token 樹 + 像素相等——驅動 `setContent` 的破壞無法使重用路徑失敗。
- 在**深樹相等**外於計時迴圈外重跑 `comparisons/stream-markdown-smd` 一致性門控與兩引擎上的閾值門控——依 `forge/findings/text-richtext-and-markdown.md:2026-08-03`，僅樹相等可捕捉對破壞解析的快速數據。

### 時間軸 — 一塊經兩個區域

```text
chunk " world": "Hello **bo" → "Hello **world**"
  before: stable="Hello "  tail="**bo"        (paragraph, trailing plain run)
   lex:   tail re-lex → [text("Hello "), strong("world")]  charsLexed = tail.length
   diff:  matchLen=0 (paragraph raw changed), tail = [paragraph(strong)]
   reconcile: heading/paragraph didn't match → destroy old RichText, add new one
  after:  stable="Hello **world**\n\n"  tail=""  (blank line committed, entitiesReused++)
```

提交發生於空行到達且 `findStableCut` 可前進時。在此之前每塊皆重訪同一尾部——有界，而非隨文件長度增長。

## 除錯串流 — 優先檢查什麼

1. **`sourceCharsLexed` 追蹤文件長度** → 已退化（`incrementalLex.ts:225` 處的 `DegradeReason`）；檢查文件中的 `:::`/`[^`/`def`/`\r` 或遺漏的僅尾部掃描（`incrementalLex.ts:490`）。
2. **`inPlaceUpdates` 平坦而 `entitiesRebuilt` 攀升** → 原地遺漏；搜尋無 `BlockWithAffordances` 解包的 `instanceof RichText`/`CodeBlock`/`Table`——典型包裝器錯誤（`code-review-2026-08.md:167`）。
3. **快照通過，串流失敗** → `setContent` 路徑（`Markdown.ts:1740`）永不演練 `updateTokens`；撰寫逐字元破壞。
4. **`close()` 後最後塊遺漏** → `waitForAppendSettled` 未等待；檢查 `Markdown.ts:2429` 處的 `appendInFlight`/`mathLoadPending`/`fencedRebuildPending` 門控。
5. **附加時選取跳動** → 前綴未被重用；檢查 `Markdown.ts:1041` 處的 `tokenChildPrefix` 有效範圍（`validFrom`）與 `Markdown.ts:3689` 處的 `matchLen` 驗證。
6. **圖片解碼後螢幕外區塊重排** → `reflowAfterImageResize` 包裝器路徑（`Markdown.ts:2604`）陳舊；檢查 `resyncWrapperBox` 是否涵蓋包裝器型別。

## 不變量 — PR 前檢查清單

1. **深詞法同一性。** `incrementalLex(charByChar(S))` 在每個前綴上深度等於 `marked.lexer(S)`，含僅空白的空行與裸列表標記。
2. **傳輸同一性。** `matchLen` 前綴 raws 相等，且 `[...oldTokens.slice(0,matchLen), ...tail]` 等於完整詞法——於 `Markdown.ts:3689` 與 worker 的 `MarkdownWorker.ts:308` 處驗證。
3. **實體索引一致。** `producesEntity ↔ renderToken null ↔ reflowToken 分支 ↔ tokenChildPrefix` 四方；以 **啟用** `BlockWithAffordances` 測試。
4. **僅尾部變更。** 無原地路徑觸碰前綴子節點；每個提前回傳保持實體未觸及，因此被拒的重用非半更新。
5. **配額線性於串流成本。** 每塊配額（若強制）線性於 `append` 成本（`charsLexed` 視窗），且僅平滑輸入被節流——緩衝發送整體提交（`StreamController.ts` 節奏僅顯示；正確性永不丟棄字元）。
6. **深度穩定的標題。** `heading` 原地重用僅當 `oldDepth === newDepth`（`Markdown.ts:3875`）；否則 `font` 將陳舊（`RichText` 僅建構子）。

## 參考

- `vectojs-docs/content/learn/streaming.md` — 面向使用者的串流 API 與 `createStream` 生命週期。
- `vectojs-docs/content/learn/text-typography.md` — 為何行內數學/圖片與 `RichText`/`LayoutEngine` 與串流互動。
- `vectojs-docs/forge/findings/text-richtext-and-markdown.md` — 為上方每行取得度量的每個串流錯誤的現場筆記。
- `vectojs-docs/forge/baselines/markdown-transcript-aggregate-2026-07-30.md` 與 `markdown-stream-math-findings.md` — 兩個可引用基線及其引擎/提交。
- `vectojs-docs/forge/code-review-2026-08.md:167,170` — `BlockWithAffordances` `instanceof` + `refreshAffordances` 叢集（`#789`/`#795`，`#701`）。
- `packages/markdown/test/incrementalLex.test.ts` 與 `markdownWorkerProtocol.test.ts` — 任何新擴充必須保持綠燈的串流等價與協定契約。

---

*Next: 05 Zero-DOM TeX — the typesetting kernel, `InlineObject` and `SVGEntity` emission that streaming math and tables measure against.*
