+++
title = "流式傳輸與即時文本"
description = "建構聊天 UI、日誌檢視器和即時儀表板：逐幀區塊合併、附加 API、空閒節流交互以及長文本策略。"
weight = 18

[extra]
order = 18
+++

# 流式傳輸與即時文本

令牌流（LLM 聊天）、日誌尾部和即時資料饋送是樸素 VectoJS 程式碼最容易崩潰的場景。引擎提供了快速的原語——`Text.append()`、`Markdown.appendMarkdown()`、段落級佈局備忘錄、離執行緒 Markdown 解析——但如果按令牌而非按幀進行連接，大部分優勢都將喪失。本文提供端到端方案。

## 核心規則：按幀提交，而非按令牌

流的令牌送達速度遠快於顯示更新速度。每次直接呼叫 `appendMarkdown()` 都會觸發一次解析/佈局計算，而兩次渲染幀之間的所有佈局——除了最後一次——都是**不可見的工作**。請使用內建的 `StreamController`，而不要編寫第二個排程器：

```typescript
const stream = markdown.createStream();

try {
  for await (const token of llmStream) {
    await stream.write(token);
  }
  await stream.close(); // 強制執行最後一次提交；不要等待另一幀
} catch (error) {
  stream.abort(error); // 丟棄已接受但未提交的文本
  throw error;
}
```

預設模式將接受的區塊作為單獨的字串保留，然後在下一個動畫幀中最多連接並提交一次。`write()` 在區塊進入有界緩衝區時即 resolve，而不是在它變為可見時，因此一個非同步生產者仍然可以在同一幀內提供多個令牌。請 `await` 它：一旦 64 KiB 的高水位緩衝區填滿，一次寫入將等待容量釋放，任何額外的寫入都將 reject，而不是創建無界的佇列。

在 200 令牌/秒的流以 60 fps 運行時，這會將每秒約 200 次佈局計算減少到最多約 60 次。在負載下它能優雅地降級：主執行緒越繁忙，提交的區塊就越大（也越*稀少*）。固定的 `setInterval` 防抖則適得其反。

`appendMarkdown()` 仍然是同步的逃生艙。直接呼叫它會首先刷新所有先前提交的控制器文本（包括一個被背壓的寫入），然後附加其自身的區塊，因此呼叫順序保持精確。

> [!NOTE]
> `scene.markDirty()` 本身已經自然合併——同一幀內的三次附加只會設定一個標記並產生一次重繪。昂貴的部分在於解析/佈局，這就是為什麼批次處理必須包裹 `appendMarkdown()` 本身。`createStream()` 正是這樣做的；它沒有創建另一個解析器或協調路徑。

## 選擇合適的附加API

| 內容             | API                                                 | 每次提交的成本                                         |
| ---------------- | --------------------------------------------------- | ------------------------------------------------------ |
| 純文字           | `text.append(chunk)`                                | 冷遍歷，但段落備忘錄會重用每個已完成的 `\n` 結尾的段落 |
| 樣式化片段       | `richText.appendSpans(spans)`                       | 附加片段；先前的片段測量值會被重用                     |
| Markdown直接附加 | `markdown.appendMarkdown(chunk)`                    | 同步 API；每次呼叫產生一次附加提交                     |
| Markdown流式附加 | `createStream()` 後使用 `await stream.write(chunk)` | 每個動畫幀最多一次附加提交；有界生產者背壓             |
| 任何內容，替換式 | `setText` / `setContent`（流式反模式）              | 完全重建——切勿在逐令牌增長的文件上呼叫                 |

`appendMarkdown` 內部隱藏著兩項你應了解的開銷：

1. **詞法分析是 O(文件大小)，而非 O(區塊大小)。** 每次呼叫都會重新標記整個累積的原始碼。解析在可用的背景 Worker 中運行（在沒有 `Worker` 的環境中回退到同步詞法分析），實體更新會重用所有已完成的區塊——但一個 10 萬字元的轉錄每次刷新仍然需要付出 10 萬字元的詞法分析開銷。逐幀批次處理透過令牌/幀因子來分攤此開銷；文本分段（下文）則加以限制。

2. **段落備忘錄以 `\n` 為鍵。** `Text.append` 和 Markdown 段落更新器都只重新測量發生變化的段落。一個無休止的連續行會破壞備忘錄機制，使每次刷新退化為 O(文件大小) 的測量。LLM 輸出自帶自然段落分隔；日誌行以 `\n` 結尾——通常情況下你無需額外處理，但不要移除換行符。

## 打字機節調與生命週期

效能批次處理是預設行為。僅當產品需要打字機揭示效果時，才添加固定的掛鐘時間節調：

```typescript
const stream = markdown.createStream({
  pacing: { graphemesPerSecond: 48 },
  maxBufferedChars: 64 * 1024,
  signal: requestAbort.signal,
});
```

節調（pacing）絕不會切換到「每幀一個令牌」。它根據 rAF 時間戳累積 `graphemesPerSecond`（每秒字形數）額度，可能會在一幀中揭示多個字形，並且仍然最多執行一次附加提交。100ms 的時間戳上限可防止背景標籤頁突然傾瀉大量追趕內容。

切片使用 `Intl.Segmenter`，甚至跨越區塊/幀邊界，因此組合標記、表情符號 ZWJ 序列、標誌和代理對都能保持在一起。Unicode 允許單個字形無限制地增長；如果惡意輸入填滿了整個有界（已接受加已阻塞）窗口而未到達邊界，控制器會提交一個 Unicode 代碼點（絕不是代理對的一半），而不是陷入死結或無限制地增加記憶體。

- `flush()` 同步提交已提交的文本並保持流打開。
- `close()` 允許被阻塞的寫入，釋放保持的字形尾部，執行最後一次有序的提交，並關閉流。
- `abort(reason)` 丟棄未提交的文本。未完成及未來的操作會因保留的拒絕原因（reason）而拒絕。
- `Markdown.setContent()` 在替換前會中止活動的控制器。
- `Markdown.destroy()` 會中止控制器並移除 rAF/`AbortSignal` 監聽器。
- 一個 `Markdown` 最多擁有一個打開的控制器；終止的控制器會註銷，以便可以啟動後續的流。

## 渲染模式與空閒節流

流式 UI 應使用 `renderMode: 'onDemand'`：

```typescript
const scene = new Scene(canvas, { renderMode: 'onDemand' });
```

每次附加都會將場景標記為髒，因此幀僅在內容流動時渲染，並在流空閒時立即停止——不會出現 2 fps 自動節流的意外，也不會在響應間隔期間消耗電池。附加 API 和內建滾動容器都會報告其進行中的動畫（`hasPendingAnimations()`），因此在最後一個令牌落地後，平滑滾動到底部仍會繼續動畫。

如果在流期間從 `update()` 驅動任何**自訂的**每幀運動（如打字指示器、閃爍游標），請記住[空閒節流契約](/learn/performance/#空閒自動節流隱藏陷阱)：重寫 `hasPendingAnimations()` 或使用 `animate()`/`springTo()` 來驅動。

## 跟隨底部

`ScrollView.scrollToBottom()` **快照**到內容末尾——特意繞過滾動彈簧，因為每秒多次重新定位彈簧會讓其永遠無法穩定，導致視口抖動而非跟蹤最新內容。`Markdown.onLayoutUpdated` 在每次流提交之後運行，此時新高度已可用：

```typescript
let stickToBottom = true;

function nearBottom(sv: ScrollView, slack = 24): boolean {
  const maxScroll = Math.max(0, sv.content.height - sv.height);
  return -sv.content.y >= maxScroll - slack;
}

markdown.onLayoutUpdated = () => {
  if (stickToBottom) transcript.scrollToBottom();
};

for await (const token of llmStream) {
  // 在提交改變內容高度之前讀取意圖。
  stickToBottom = nearBottom(transcript);
  await stream.write(token);
}
await stream.close();
```

還應從應用程式的用戶滾動處理中設定 `stickToBottom = false`；否則，在最後一個掛起幀期間滾動的用戶可能會被過時的意圖拉回底部。排序是這裡的關鍵：在內容增長之前讀取「是否在底部」，僅在 `onLayoutUpdated` 之後進行吸附。

> [!NOTE]
> `scrollTo(y)` 重新定位滾動**彈簧**，而 `scrollToBottom()` 則是**快照**。在 `scrollTo` 之後立即讀取基於位置的衍生狀態仍會看到舊位置——請在隨後的提交/幀中讀取。

## 長文本：分段，然後虛擬化

附加成本和詞法分析成本都隨文件大小增長，因此需限制文件大小。聊天/日誌 UI 的兩層策略：

1. **按訊息分段。** 每個助手訊息使用一個 `Markdown` 實體，而不是整個對話共用一個。流式實體始終保持小型（僅當前正在傳輸的訊息），因此無論對話長度如何，每次刷新的詞法分析成本都保持低廉。已完成的訊息完全不需要重新詞法分析。
2. **虛擬化歷史。** 一旦訊息成為獨立實體，[`VirtualList`](/reference/ui-virtuallist/) 只渲染可見部分。一條包含數千條訊息的文本記錄，其成本僅取決於視口顯示的內容，而非會話累積的總量。

```typescript
function startAssistantMessage(): Markdown {
  const md = new Markdown('', { maxWidth: 640 });
  messages.push(md); // 你的 VirtualList 資料源
  return md; // 僅向此實體流式寫入
}
```

這同時也限制了記憶體：已完成訊息的靜態佈局可被剔除，而向後滾動到較遠位置不會觸發即時尾部的重新佈局。

## 衡量流式UI

症狀及其信號，按排查順序列出：

| 症狀                     | 診斷手段                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| 流式傳輸時卡頓           | DevTools `Streaming/appends` 超過了渲染幀數——為每條即時訊息使用一個 `createStream()`                      |
| 負載下 `write()` 被拒絕  | 在一個寫入被背壓時，第二個寫入到達了——請 `await` 每次寫入                                                 |
| 卡頓隨文本長度增加而加劇 | 你在向一個不斷增長的實體流式寫入——應按訊息分段                                                            |
| 整個UI在長段落時阻塞     | 流中沒有 `\n`——段落備忘錄無法拆分；檢查源文本的格式                                                       |
| 滾動與用戶操作衝突       | 無條件呼叫 `scrollToBottom()`——應透過「是否在底部」吸附判斷來限制                                         |
| 流空閒時 CPU 仍繁忙      | 場景留在了 `'always'` 模式，或者存在未使用 `hasPendingAnimations()` 的自訂動畫；控制器的 rAF 處於空閒狀態 |

如需真實資料，請使用[測量真實效能](/learn/performance/#測量實際效能)中介紹的面內測量模式——無頭模式的 FPS 不具代表性。

> **下一篇：** [效能](/learn/performance/) 提供完整的最佳化工具箱，[`Markdown`](/reference/ui-markdown/) 是流式 API 參考。
