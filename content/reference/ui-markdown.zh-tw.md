+++
title = "Markdown"
description = "具有豐富文字、程式碼區塊、表格、串流附加和連結回呼的 canvas-native Markdown 渲染器 — 獨立的 @vectojs/markdown 套件。"
weight = 14
+++

# `Markdown` — `@vectojs/markdown`

`Markdown` 和 `CodeBlock` 位於獨立的 **`@vectojs/markdown`** 套件中（自 `@vectojs/ui@2.2.0` 起，它們不再是 `@vectojs/ui` 的一部分，因此 `marked` + `@vectojs/tex` 依賴只在你渲染 Markdown 時才載入）。它組合了 `@vectojs/ui` 元件，因此請將它與 `@vectojs/ui` 和 `@vectojs/core` 一起安裝：`bun add @vectojs/markdown @vectojs/ui @vectojs/core`。

`Markdown` 使用 `marked` 解析 Markdown，並將結果渲染為 VectoJS entity 子樹。段落和標題成為 `RichText`，圍欄程式碼成為 `CodeBlock`，而 GFM 表格成為 `Table`。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Markdown</span></div>
  <iframe src="/sandbox/ui/markdown.html?v=core-1.39.0-ui-2.20.1" class="sandbox-frame component-demo-frame component-demo-frame-xl" loading="eager" title="Markdown live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>此範例將文章、連結、行內程式碼和一個圍欄區塊保持在一個聚焦的視口中，讓布局缺陷清晰可見。</figcaption>
</figure>

## 最小範例

```ts
import { Markdown } from '@vectojs/markdown';

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
  userTiming?: boolean; // emit a `vecto:markdown:parse` measure, default false
  blockAffordances?: boolean; // copy/download controls on code blocks + tables, default false
  affordances?: BlockAffordanceConfig; // which controls + labels, e.g. { download: false }
  showCodeLanguage?: boolean; // fence language in a header band per code block, default false
  writeClipboard?: (text: string) => void; // injectable clipboard write (jsdom/tests)
  saveFile?: (filename: string, content: string, mimeType: string) => void; // injectable download
}
```

`selectable` 會傳播到當前和未來的標題、文章、列表、圍欄程式碼和表格儲存格。在執行階段使用 `markdown.setSelectable(false)` 變更它。瀏覽器擁有拖曳選取、Ctrl/Command+C 和頁面內尋找；VMT entity 仍擁有布局和像素。有序和無序列表項目使用可選取的 `RichText`；每個 GFM 表格儲存格擁有一個可選取的投射。邏輯來源順序和硬/軟分隔符在巢狀的 Markdown 輸出中維持完整。Core 1.8 透過二維游標幾何路由變換過的文章，並透過共用的預備網格路由圍欄程式碼，因此列表、GFM 表格、換行的阿拉伯文/RTL 文字和程式碼在分數 DPR 和縮放下保留邏輯複製順序。當應用程式擁有容器尺寸或 CSS 縮放時，使用 `scene.resize(width, height)` 通知 Scene，讓 Firefox 可以重新校準原生 Range 度量。

### 區塊操作控件（複製 / 下載）

`blockAffordances: true` 會在程式碼區塊和表格的右上角繪製複製 + 下載控件。它是刻意採用選擇加入設計的：每個控件都是 Tab 順序中的一個可聚焦節點，而含有大量圍欄區塊的文件若靠鍵盤逐個貼上會非常繁瑣（並且沒有剪貼簿/檔案系統權限的讀者也得不到任何好處）。`affordances` 會收窄或重新標記這一組控件——這些標籤是用戶可見的文字，也是螢幕閱讀器所播報的內容，因此請為非英語文件使用它。`writeClipboard` 和 `saveFile` 都是可注入的，因為 jsdom 中不存在這些平台路徑。`showCodeLanguage` 會預留一條頁首帶，它也能防止控件與第一行程式碼重疊——在同時啟用兩者時請打開它。

按種類覆寫（`0.20.x+`）：`affordances.code` / `affordances.table` 可為一種區塊類型停用複製/下載，而不影響另一種——如果表格自身的 UI 已經提供複製功能，它就不再需要兩個重疊的控件：

```ts
markdown.setOptions({
  blockAffordances: true,
  affordances: {
    table: { copy: false, download: false }, // keep code-block controls only
    code: { download: false }, // per-kind, inherits top-level defaults
  },
});
```

省略的種類鍵會繼承頂層 `copy`/`download`，而後者預設繼承 `true`。程式碼區塊還可以透過設定 `theme.codeBorderColor` 加上邊框（選用；未設定則維持先前無邊框的渲染）——在淺色頁面背景上程式碼填充色容易融入時很有用。

## 主題化：`setTheme()`

```ts
markdown.setTheme(theme: MarkdownThemePresetName | Partial<MarkdownTheme>): this
```

切換調色盤並重新渲染文件（`0.23.0+`）。接受一個預設名稱——`'githubDark' | 'githubLight' | 'dracula' | 'solarizedDark' | 'solarizedLight'`——或只包含要修改的鍵的部分主題物件，與建構函式 `theme` 選項相同的形狀。實體在建構時擷取顏色、字型和尺寸，因此現有區塊不會被即時重繪：重新渲染經由 `setContent` 進行，後者還會把新的 `blockGap` 套用到內容堆疊上。

直接指派 `markdown.theme` 是編譯期錯誤，現在對 JS 呼叫者也會在執行時拋出——建構後指派曾會把文件的一部分塗成每種調色盤。請在建構時傳入調色盤，或呼叫 `setTheme()`。

## 響應式寬度：`setMaxWidth()`

```ts
markdown.setMaxWidth(width: number): this
```

在新寬度下重新排布每個已渲染的區塊（`0.9.0+`）。請在調整尺寸時呼叫它，而非指派 `maxWidth`——後者只設定欄位而不會帶來任何可見變化：寬度是在每個區塊被**建構**時讀取的，因此指派會讓已存在的區塊仍按舊寬度量測。

```ts
window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
  markdown.setMaxWidth(window.innerWidth - INSET * 2);
});
```

它是就地重排而非重建，這正是它能在串流過程中使用的原因：

- 相同的區塊實體**實例**得以保留，因此任何持有其參照的東西（捲動錨點、命中目標、devtools 選擇）都繼續有效；
- 開啟的 [`createStream()`](#chuan-liu) 寫入器不受影響並繼續附加；
- 不會重新進行詞法分析。

在兩個引擎上對一份五個區塊的文件實測：520 → 260 px 使投影行數從 2 變為 4、高度從 88 變為 160，且落在相同的兩個段落實例上，寫入器仍為 `open`，交給詞法分析器的字元數增加量為**零**。

寬度未變時它是空操作，因此僅高度變化的尺寸調整不產生成本，呼叫方也無需自行加保護判斷。負寬度會被箝制為 0。當 `blockAffordances: true` 時，程式碼區塊和表格被包在操作控件外殼中送達——重排會看穿這層包裝，調整內部區塊的尺寸並重新整理其控件，因此被封裝的區塊和其他內容一樣跟隨新寬度（`0.23.0+`；在此之前它們會默默保持舊寬度）。

> [!NOTE]
> 在 `0.9.0` 之前，唯一正確的替代做法是完整重建——釋放串流、把已揭示的原始碼透過 `setContent()` 重播、開啟一個新的寫入器，並手工把捲動偏移搬過去。它確實能正確複現文件，這也正是它容易被保留下來的原因：重建同樣會產出正確的幾何。它的代價是每次調整尺寸都要對整篇文件重新做詞法分析，並丟棄每一個實體實例。

展示型公式被刻意保留其自身寬度：`@vectojs/tex` 是依據相對於 `ex` 的度量而非可用寬度來決定排版盒子的尺寸，因此拉伸它會使公式變形。圍欄程式碼同樣不會被重新排布——程式碼使用固定的等寬網格，過長的行按設計溢出——只有它的背景會被調整尺寸。

從 [`onStable`](#dan-ci-wan-cheng-onstable) 回呼中呼叫它會擲出例外，原因與 `setContent()` 相同：該回呼執行在它將要使之失效的那次提交內部。

## GFM 覆蓋範圍

除了段落、標題、列表、圍欄程式碼和表格之外：

| 建構式              | 渲染為                                                                       |
| ------------------- | ---------------------------------------------------------------------------- |
| `~~strikethrough~~` | 帶刪除線的文字 — 每個合併的文字段一道線，線寬按字級縮放（`0.8.0+`）          |
| `- [ ]` / `- [x]`   | 用 ☐ 或 ☑ 字形加一個空格取代項目符號；有序列表時為 `1.` 加該字形（`0.8.0+`） |
| `\|:--\|--:\|:-:\|` | 欄對齊，轉發給 `Table.align`（`0.8.0+`）                                     |
| `$…$` / ` ```math ` | 由 `@vectojs/tex` 排版的公式（行內 / 區塊），僅在定界符閉合後才轉換          |

## 前置元資料（Front matter）

文件開頭由 `---` 界定的 YAML 區塊是元資料，而非內容（`0.8.0+`）：

```ts
const md = new Markdown('---\ntitle: Release notes\ndate: 2026-08-03\n---\n# Body');

md.frontMatter; // 'title: Release notes\ndate: 2026-08-03\n'
md.frontMatterFields; // { title: 'Release notes', date: '2026-08-03' }
```

在 `0.8.0` 之前，該區塊會作為內容渲染：`marked` 沒有前置元資料的概念，因此開頭的 `---` 命中了分隔線規則，而結尾的那個則**把這些鍵當作 setext 標題來加底線**。於是帶元資料的文件會繪製出一條水平分隔線，加上一個由其自身鍵構成的 28px 粗體標題。

`frontMatterFields` 是一個狹義的便利功能，而非 YAML — 縮排行會被跳過，因此巢狀的映射和序列絕不會作為頂層鍵洩漏出來（父鍵會存在，但值為空）。若需要更豐富的能力，請把 `md.frontMatter` 交給一個真正的解析器。`scanFrontMatter(text, complete)` 和 `parseFrontMatterFields(raw)` 都已匯出，可用於原始文字。

識別是刻意保守的，因為一次誤判會靜默地刪掉文件的開頭部分。開頭的 `---` 只有在下一行是一個 YAML 映射條目（`key: value`，且按 YAML 的要求在冒號後帶空白字元）**並且**後面跟著一個結尾的 `---` 或 `...` 時，才是前置元資料。因此 `---\n\n# Title`、`---\n# Title\n---`、`----\nkey: v\n----` 和 `---\n- a\n---` 都仍然渲染為一條分隔線。

在串流過程中，落在未閉合區塊內部的區塊會被暫存而不是被詞法分析，這樣文件就不會先繪製出一條分隔線、再由結尾定界符把它拆掉。當串流關閉時仍然處於開啟狀態的區塊會被釋放為內容，而暫存是有界的，因此一篇長文件開頭的一條分隔線無法讓它停滯。

## 串流 {#chuan-liu}

`createStream()` 為該 `Markdown` 綁定一個按幀合併的寫入器。消費來源資料時 await
`write()`；`close()` 會強制提交尾端內容，無需再等待一個動畫幀：

```ts
const stream = markdown.createStream();

try {
  for await (const token of llmStream) {
    await stream.write(token);
  }
  await stream.close();
} catch (error) {
  stream.abort(error);
  throw error;
}
```

```ts
interface StreamControllerOptions {
  maxBufferedChars?: number; // default 64 * 1024 UTF-16 code units
  pacing?: {
    graphemesPerSecond: number;
  };
  signal?: AbortSignal;
  incompleteMode?: IncompleteMarkdownMode; // default 'literal'
  onStable?: (blocks: readonly Entity[]) => void;
}

type IncompleteMarkdownMode = 'literal' | 'optimistic';

type StreamControllerState = 'open' | 'closed' | 'aborted';

interface StreamController {
  readonly state: StreamControllerState;
  readonly bufferedChars: number; // accepted + one blocked write
  write(chunk: string): Promise<void>;
  flush(): void;
  close(): Promise<void>;
  abort(reason?: unknown): void;
  destroy(): void;
}
```

預設模式會把下一個 rAF 之前接受的所有區塊合併為一次解析/版面配置提交。`write()`
在有界緩衝區接納時解析，而不是在可見時解析。容量不足時，一次寫入會等待；若在該等待者
存在期間再寫入則會拒絕，因此忽略背壓的生產者無法讓佇列無限增長。

`close()` 的完成恰好被觀察一次：如果宿主的 close 攔截器拋出或拒絕，重試的 `close()` 會報告原始失敗，而不是經由已關閉的短路路徑直接解決（`0.23.0+`——成功關閉之後的重試仍會解決）。

`pacing.graphemesPerSecond` 在保持每幀一次提交上限的同時，加入固定的掛鐘打字機節奏。
`Intl.Segmenter` 會讓普通組合序列、emoji ZWJ 叢集、旗幟和代理對在區塊/幀邊界上保持完整。
完整的生命週期、有界的病態叢集回退、底部跟隨模式與轉錄策略見[串流與即時文字](/learn/streaming/)。

### 尾部未閉合語法：`incompleteMode`

串流在 token 中途不斷被截斷，因此一個區塊的最後幾個字元通常是半個建構式。`incompleteMode` 決定了當控制器開啟時，這個尾部該如何渲染：

| 模式                 | 串流 `a **bo` 時                         |
| -------------------- | ---------------------------------------- |
| `'literal'` _(預設)_ | 文字 `a **bo` — 星號為一般文字           |
| `'optimistic'`       | 文字 `a bo`，其中 `bo` 為粗體 — 隱藏語法 |

`'optimistic'` 猜測尾部段落最後一個未閉合的粗體（strong）/強調（emphasis）/行內程式碼（inline-code）/連結（link）建構式將會閉合。這個猜測**僅用於顯示** — token 狀態從未被改變 — 並且在 `close()` 時會被還原，因此相同來源的 `'literal'` 和 `'optimistic'` 串流最終會產生位元組完全相同的文件。`'literal'` 是這個選項推出之前每個版本的行為。

該模式由 `Markdown` 解析，而非由控制器解析：控制器負責緩衝和節奏，而這個猜測是在尾部段落上進行的渲染時轉換。

### 單次完成：`onStable` {#dan-ci-wan-cheng-onstable}

```ts
const stream = markdown.createStream({
  onStable: (blocks) => {
    // 執行一次，帶有已完成的文件。在此進行若在串流中途進行會被浪費的工作是安全的。
    console.log(`settled with ${blocks.length} top-level blocks`);
  },
});
```

在 `close()` 提交了最終文字**並且**任何處理中的背景 worker 解析已套用之後，**精確地觸發一次**，並帶有該瞬間文件頂層區塊實體的快照。獨立於 `incompleteMode`，因此它可以與 `'literal'` 預設值一起使用。

這刻意不是一個一般的「串流進行中」掛鉤：

- **絕不會由 `flush()`、`abort()` 或 `destroy()` 觸發。** 這些都不意味著內容已經停止變更。
- 從回呼中呼叫 `appendMarkdown()` 或 `setContent()` 會**同步拋出錯誤** — 重新進入的改變會使它剛收到的快照失效。
- 回呼拋出錯誤會拒絕 `close()` 的 promise。無論如何，控制器都會被釋放。

串流結束後的一次性工作 —— 烘焙高亮快取、啟動入場動畫 —— 適合放在這裡，
這類工作不該在內容仍可能變化的串流過程中執行。

一個 `Markdown` 同時只能開啟一個控制器。`setContent()` 會在替換前中止它；
`destroy()` 會中止它並移除 rAF/`AbortSignal` 監聽器。終態控制器會註銷。公開的
`appendMarkdown()` 仍是同步的：它先沖刷此前提交的每個控制器區塊，再按精確的呼叫
順序套用直接區塊。

避免為每個 token 呼叫 `setContent(fullDocumentSoFar)`；那會重建整個子樹。

## 效能模型

每次呼叫的實際開銷，以便可以理性分析串流程式碼：

- **解析預設在背景執行緒進行。** `appendMarkdown` 將累積的原始碼發佈到由內嵌 bundle 建構的 `Worker`（無網路請求）；當解析返回時，套用 token 差異和實體更新。沒有 `Worker` 的環境（某些測試執行器、SSR）回退到同步詞法分析 — 相同的結果，主執行緒成本。
- **每次附加的詞法分析是 O(文件大小)**，而非 O(區塊大小)：每次呼叫都會重新標記化整個累積的原始碼。使用 `createStream()` 按幀批次處理，並將長篇轉錄分段為每則訊息一個 `Markdown` 實體，以使即時文件保持較小。
- **已完成的區塊會被重複使用，而非重建。** `appendMarkdown` 透過原始原始碼將新 token 列表與舊列表進行前綴匹配；每個已渲染的區塊保持其實體實例。常見的串流情況 — 最後一個段落增長 — 原地更新該段落的跨度。
- **`setContent()` 不重複使用任何內容。** 它移除所有子元素並重新渲染完整的 token 列表。它是_替換_文件的正確呼叫，而_增長_文件的錯誤呼叫。

## 擴充點

存在兩個擴充面：

- **`renderToken(token)`** 是受保護的，因此自訂渲染器可以子類化 `Markdown` 以處理應用專屬的區塊，同時仍將一般 token 委派給內建渲染器。
- **圍欄區塊註冊表（Fenced block registry）** —— 針對程式碼圍欄的可插拔渲染，以資訊字串為鍵（code、math、mermaid、graphviz……）。渲染器在首次 `render()` 時懶載入並進行快取；`'error'` 會回退到預設的程式碼區塊渲染器。

```ts
import { FencedBlockRegistry } from '@vectojs/markdown';

FencedBlockRegistry.register('mermaid', {
  async load() {
    const mermaid = await import('mermaid');
    return (source, lang, options) => {
      /* render → Entity */
    };
  },
});
FencedBlockRegistry.unregister('mermaid');
```

`FencedBlockRenderOptions` 攜帶 `{ theme, availableWidth, selectable }`。相關匯出：用於主題解析的 `isFencedBlockRendererReady`、`renderFencedBlock`，以及 `PRESET_THEMES` / `resolvePresetTheme` / `isPresetName`，還有輔助函式 `tableToCsv` / `tableToMarkdown` / `extensionForLanguage` / `mimeForLanguage`（即操作控件和匯出功能的內部實作）。

其他實用工具面：`Markdown.setUserTiming(on)`（解析度量的執行階段開關）、`codeAtlas` / `codeAtlasStats` / `highlightedLanguages`（atlas 診斷），以及用於選用 TeX 數學渲染器的 `MathBlock` / `preloadMathJax()` / `isMathJaxReady`（懶載入，預設不會引入）。

## 維護者檢查清單

- 連結回呼必須轉發到段落、標題和列表的 `RichText` 節點。
- 程式碼區塊應保持為單一葉 entity，而非每個 token 或行段一個 entity。
- 圍欄程式碼必須投射其精確的來源文字和換行。
- 表格 header 使用標題顏色/粗體樣式，而每個邏輯儲存格恰好擁有一個內容投射。
- 指標擁有權保留於葉文字/程式碼投射；結構性列表和表格 entity 不得攔截原生選取。
- 串流附加應重複使用未變更的前綴 entity。

相關：[`RichText`](/reference/ui-components/#richtext)、[`CodeBlock`](/reference/ui-components/#codeblock)、[`Table`](/reference/ui-components/#table)。
