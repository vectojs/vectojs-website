---
title: '串流與即時文字'
description: '構建聊天UI、日誌檢視器和即時儀表板：逐幀區塊合併、附加API、閒置節流交互以及長文稿策略。'
order: 18
---

# 串流與即時文字

令牌流（LLM聊天）、日誌尾部和即時資料饋送是樸素VectoJS程式碼最容易崩潰的場景。引擎提供了快速的原語——`Text.append()`、`Markdown.appendMarkdown()`、段落級佈局備忘錄、離執行緒Markdown解析——但如果按令牌而非按幀進行連接，大部分優勢都將喪失。本文提供端到端方案。

## 核心規則：按幀批次處理，而非按令牌

串流的令牌送達速度遠快於顯示重新整理速度。每次`append()`/`appendMarkdown()`呼叫都會觸發一次佈局計算，而兩次渲染幀之間的所有佈局——除了最後一次——都是**不可見的工作**。解決方案只需要四行程式碼：緩衝到達的令牌，每幀重新整理一次。

```typescript
let pending = '';
let scheduled = false;

function pushToken(token: string) {
  pending += token;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const chunk = pending;
    pending = '';
    markdown.appendMarkdown(chunk); // 整幀令牌只做一次佈局
    transcript.scrollToBottom();
  });
}

for await (const token of llmStream) pushToken(token);
```

在200令牌/秒的串流以60fps執行時，這會將每秒約200次佈局計算減少到約60次——並且在負載下能優雅地降級：主執行緒越繁忙，重新整理區塊就越大（也越**稀少**）。這種模式是自我調節的；固定的`setInterval`防抖則不然。

> [!NOTE]
> `scene.markDirty()`本身已經自然合併——同一幀內的三次追加只會設定一個標記並產生一次重繪。追加的開銷在於**佈局**，而非骯髒標記，這就是為什麼批次處理必須包裹追加本身。

## 選擇合適的追加API

| 內容             | API                                | 每次呼叫的成本                                                                                 |
| ---------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| 純文字           | `text.append(chunk)`               | 冷遍歷，但段落備忘錄會重用每個已完成的`\n`結尾的段落                                           |
| 樣式化片段       | `richText.appendSpans(spans)`      | 追加片段；先前的片段測量值會被重用                                                             |
| Markdown         | `markdown.appendMarkdown(chunk)`   | 重新詞法分析原始原始碼（存在`Worker`時在離執行緒處理），重用已完成的區塊實體，原地擴展最後一段 |
| 任何內容，取代式 | `setText` / `setContent`（反模式） | 完全重建——切勿在逐令牌增長的文件上呼叫                                                         |

`appendMarkdown`內部隱藏著兩項你應了解的開銷：

1. **詞法分析是O(文件長度)，而非O(區塊長度)。** 每次呼叫都會重新標記整個累積的原始碼。解析在可用的背景Worker中執行（在沒有`Worker`的環境中回退到同步詞法分析），實體更新會重用所有已完成的區塊——但一個10萬字元的文件每次重新整理仍然需要付出10萬字元的詞法分析開銷。逐幀批次處理透過令牌/幀因子來分攤此開銷；文件分段（下文）則加以限制。

2. **段落備忘錄以`\n`為鍵。** `Text.append`和Markdown段落更新器都只重新測量發生變化的段落。一個無休止的連續行會破壞備忘錄機制，使每次重新整理退化為O(文件長度)的測量。LLM輸出自帶自然段落分隔；日誌行以`\n`結尾——通常情況下你無需額外處理，但不要移除換行符。

## 打字機節奏與生命週期

效能批次處理是預設行為。僅在產品需要打字機般揭露效果時，才加入固定的掛鐘時間節奏（wall-clock pacing）：

```typescript
const stream = markdown.createStream({
  pacing: { graphemesPerSecond: 48 },
  maxBufferedChars: 64 * 1024,
  signal: requestAbort.signal,
});
```

節奏控制從不會切換成「每幀一個 token」。它會從 rAF 時間戳記累積 `graphemesPerSecond` 的額度，可能會在同一幀內揭露多個字素（grapheme），並且仍然最多執行一次附加提交。100ms 的時間戳記上限可防止背景分頁傾瀉出大量追趕累積的輸出。

切片使用 `Intl.Segmenter`，甚至跨越區塊/幀的邊界，因此結合標記（combining marks）、表情符號 ZWJ 序列、旗幟和代理對（surrogate pairs）都能保持在一起。Unicode 允許單一字素無限制增長；如果惡意輸入填滿了整個有界限的「已接受加上已阻擋」視窗，而未達到邊界，控制器會提交一個 Unicode 碼位（永遠不會是半個代理對），而不是死鎖或使記憶體無限制增長。

- `flush()` 同步提交已送出的文字並保持串流開啟。
- `close()` 允許已阻擋的寫入，釋放保留的字素尾部，執行一次有序的最終提交，然後關閉。
- `abort(reason)` 捨棄未提交的文字。擱置中和未來的操作都會以保留的理由拒絕。
- `Markdown.setContent()` 在取代之前中止活動中的控制器。
- `Markdown.destroy()` 中止它並移除 rAF/`AbortSignal` 監聽器。
- 一個 `Markdown` 最多擁有一個開啟的控制器；終端控制器會取消註冊，以便後續的串流可以開始。

## 渲染模式與閒置節流

串流UI應使用`renderMode: 'onDemand'`：

```typescript
const scene = new Scene(canvas, { renderMode: 'onDemand' });
```

每次追加都會將場景標記為骯髒，因此幀僅在內容流動時渲染，並在串流空閒時立即停止——不會出現2fps自動節流的意外，也不會在響應間隔期間消耗電池。追加API和內建滾動容器都會報告其進行中的動畫（`hasPendingAnimations()`），因此在最後一個令牌落地後，平滑滾動到底部仍會繼續動畫。

如果在串流期間從`update()`驅動任何自訂的**每幀**運動（如打字指示器、閃爍游標），請記住[閒置節流契約](/learn/performance/#空閒自動節流隱藏陷阱)：覆寫`hasPendingAnimations()`或使用`animate()`/`springTo()`來驅動。

## 跟隨底部

`ScrollView.scrollToBottom()`**快照**到內容末尾——特意繞過滾動彈簧，因為每秒多次重新定位彈簧會讓其永遠無法穩定，導致視口抖動而非跟蹤最新內容。在與追加相同的rAF重新整理中呼叫它（如上文的方案），這樣目標會在**新佈局之後**計算。

對於聊天UI，遵循使用者意圖：僅在使用者原本就在底部時才保持吸附到底部。`content`是公開的，其`y`儲存負向滾動偏移量，因此「在底部」的判斷方式為：

```typescript
function nearBottom(sv: ScrollView, slack = 24): boolean {
  const maxScroll = Math.max(0, sv.content.height - sv.height);
  return -sv.content.y >= maxScroll - slack;
}

// 在重新整理中：在追加前讀取吸附狀態，在追加後應用。
const stick = nearBottom(transcript);
markdown.appendMarkdown(chunk);
if (stick) transcript.scrollToBottom();
```

在一次重新整理內執行「讀取-追加-滾動」的排序是關鍵所在：在追加後測量「是否在底部」總是會因內容增長而回答「否」。

> [!NOTE]
> 兩個滾動API設計上不對稱：`scrollTo(y)`重新定位滾動**彈簧**（因此`content.y`會在接下來的若干幀中動畫到達），而`scrollToBottom()`是**快照**。在`scrollTo`之後立即讀取基於位置的衍生狀態會得到舊位置——在下次重新整理時讀取（正如上面的吸附模式自然做到的）。

## 長文稿：分段，然後虛擬化

追加成本和詞法分析成本都隨文件大小增長，因此需限制文件大小。聊天/日誌UI的兩層策略：

1. **按訊息分段。** 每個助理訊息使用一個`Markdown`實體，而不是整個對話共用一個。串流實體始終保持小型（僅當前正在傳輸的訊息），因此無論對話長度如何，每次重新整理的詞法分析成本都保持低廉。已完成的訊息完全不需要重新詞法分析。
2. **虛擬化歷史。** 一旦訊息成為獨立實體，[`VirtualList`](/reference/ui-virtuallist/)只渲染可見部分。一條包含數千則訊息的文字記錄，其成本僅取決於視口顯示的內容，而非會話累積的總量。

```typescript
function startAssistantMessage(): Markdown {
  const md = new Markdown('', { maxWidth: 640 });
  messages.push(md); // 你的VirtualList資料來源
  return md; // 僅向此實體串流寫入
}
```

這同時也限制了記憶體：已完成的靜態佈局可被剔除，而向後滾動到較遠位置不會觸發即時尾部的重新佈局。

## 衡量串流UI

症狀及其訊號，按排查順序列出：

| 症狀                     | 診斷手段                                                                 |
| ------------------------ | ------------------------------------------------------------------------ |
| 串流時卡頓               | 統計每秒追加次數與每秒幀數——如果追加數 ≫ 幀數，說明缺少rAF批次處理       |
| 卡頓隨文稿長度增加而加劇 | 你在向一個不斷增長的實體串流寫入——應按訊息分段                           |
| 整個UI在長段落時阻塞     | 串流中沒有`\n`——段落備忘錄無法拆分；檢查來源文字的格式                   |
| 滾動與使用者操作衝突     | 無條件呼叫`scrollToBottom()`——應透過「是否在底部」吸附判斷來限制         |
| 串流空閒時CPU仍繁忙      | 場景處於`'always'`模式，或者存在未使用`hasPendingAnimations()`的自訂動畫 |

如需真實資料，請使用[衡量實際效能](/learn/performance/#測量實際效能)中介紹的頁內測量模式——無頭模式的FPS不具代表性。

> **下一篇：** [效能](/learn/performance/)提供完整的優化工具箱，[`Markdown`](/reference/ui-markdown/)是串流API參考。
