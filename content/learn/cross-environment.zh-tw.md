+++
title = "跨環境一致性"
description = "在不同作業系統、瀏覽器、縮放層級和像素密度下保持畫布UI一致——並保持文字選取與渲染輸出對齊。"
weight = 19
+++

# 跨環境一致性

DOM應用從瀏覽器的佈局引擎繼承一致性（和不一致性）。畫布原生應用則從**你**這裡繼承一致性：引擎根據自身測量的數值計算每個位置，因此故障模式發生了變化——從CSS怪癖轉向像素密度、縮放和字型度量。本文將每個環境變數映射到實際變化的內容、引擎已處理的內容以及應用程式必須處理的內容。

## 裝置像素比（HiDPI）

**引擎已處理。** 所有VectoJS座標都是邏輯CSS像素。渲染器將畫布後備儲存大小設定為`logical × devicePixelRatio`並縮放上下文，每次`scene.resize()`都會重新讀取目前DPR——渲染、命中測試和佈局共享一個統一的邏輯座標空間，在任何密度下都適用，包括分數DPR（Windows 125%/150%縮放）。

**你必須做的。** 執行時無需任何操作——但測試時需要：

> [!WARNING]
> 無頭瀏覽器預設為`deviceScaleFactor: 1`。大多數真實機器的DPR為2（或分數值）。隨DPR縮放的命中測試或文字投影偏移在預設無頭執行中**不可見**，但在第一台真實筆記型電腦上就會暴露。如果回報的偏移量與距離原點的距離成正比，請首先懷疑DPR。

在`deviceScaleFactor: 2`和1下執行指標和選取測試（Puppeteer/Playwright都在每個上下文中暴露此參數）。一個矩陣單元即可捕獲整類錯誤。

## 瀏覽器縮放和容器大小

縮放會同時改變有效DPR和CSS視埠。接下來發生什麼取決於誰擁有畫布大小：

- **全螢幕場景（預設）：** Scene監聽視窗`resize`事件——縮放會觸發此事件——並自動重新校準大小、後備儲存和DPR。
- **嵌入場景（`disableWindowResize: true`、自訂容器、祖先元素上的CSS縮放）：** 引擎故意不做猜測。自行將容器連接到場景：

```typescript
const scene = new Scene(canvas, { disableWindowResize: true });

const ro = new ResizeObserver(([entry]) => {
  scene.resize(entry.contentRect.width, entry.contentRect.height);
});
ro.observe(container);
// 在銷毀路徑中與scene.destroy()一起斷開連接。
```

`scene.resize(width, height)`是冪等的，並且足夠輕量，可以在典型的UI中從ResizeObserver呼叫而無需防抖。它也是**重新校準鉤子**：Firefox從佈局狀態計算原生`Range`選取度量，縮放和容器變化會使這些度量失效——如果從未告知場景發生了變化，場景會正確渲染但**選取**時使用過時的座標。如果在Firefox中縮放後選取高亮發生偏移而畫布正常，缺失`resize()`呼叫是首要懷疑對象。

## 字型：真正的跨作業系統變數

`'16px sans-serif'`在每個作業系統上都是不同的字型（Segoe UI、Roboto、San Francisco、DejaVu……）。VectoJS使用畫布的`measureText`自行測量文字，渲染器使用相同的字型字串繪製——因此佈局和像素在任何機器上**彼此之間**始終一致。不同機器之間變化的是**絕對幾何**：行寬、換行點、實體大小。

實際後果，按痛苦程度遞減排列：

1. **網頁字型競態。** 如果在網頁字型載入之前構造`Text`/`RichText`/`Markdown`，測量將使用後備字型，而後來的重繪會使用已載入的字型進行渲染——此時佈局和像素出現不一致（打破內部一致性的唯一情況）。將構造操作延遲到字型就緒後：

   ```typescript
   await document.fonts.ready;
   const label = new Text('Hello', { font: '16px Inter' });
   ```

   如果內容可能比字型載入更持久（懶載入字型），從`document.fonts.onloadingdone`處理程式中重新執行`setText`或`setMaxWidth`來重新測量。

2. **像素精確的測試期望。** 除非CI安裝了確切的字型（VectoJS倉庫在CI中安裝了Noto字型），否則絕不要斷言絕對的文字衍生幾何與硬編碼數值的值相等。優先使用關係斷言（「適合內部」、「在前一行下方」）——這正是`auditScene`自動化的內容。

3. **設計中的通用字型族。** 為`'14px sans-serif'`調整卡片大小在macOS上正常，在Windows上則不正確。要麼隨附字型，要麼讓測量驅動大小（自適應`Text`+容器佈局），而不是在假設的文字寬度周圍硬編碼盒子。

## 重要的瀏覽器差異

引擎的跨瀏覽器測試矩陣（Chrome + Firefox，DPR 1和2，字型替換）確定了以下內容；應用程式仍可能遇到的差異：

| 區域            | 差異                                                        | 應對方法                                           |
| --------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| 原生選取範圍    | Firefox在縮放/調整大小後從過時的佈局重新計算`Range`度量     | 在你擁有大小控制權時呼叫`scene.resize()`（見上文） |
| `Worker`可用性  | 某些嵌入器/測試執行器中缺失→Markdown同步解析                | 功能相同；在這些環境中需預算主執行緒時間           |
| WebGPU          | 可用性因環境而異；`ComputeParticleEntity`回退到CPU          | 將GPU計算視為漸進增強；也要測試CPU路徑             |
| 減少動畫        | OS層級設定，預設啟用時限制有效FPS（`respectReducedMotion`） | 不要對抗它；在啟用該設定的情況下測試動畫           |
| 背景分頁中的rAF | 任何地方都會暫停，但恢復時機不同                            | 引擎在恢復時鉗制动畫dt；自訂積分器應自行鉗制其dt   |

## 保持選取與像素對齊

可選取文字的工作原理是將**邏輯來源字串**投影到透明的DOM鏡像中，這些鏡像的幾何資料來自與畫布繪製器相同的佈局資料。對齊是構造性的——當它被破壞時，一定是違反了一系列簡短契約中的某一個：

1. **場景未被告知大小/縮放變化**——投影幾何過時（尤其是Firefox；參見上面的重新校準鉤子）。
2. **字型在測量之後載入**——畫布和投影都遵循測量後的佈局，但繪製的字形發生了移動（上面的網頁字型競態）。
3. **自訂元件繪製文字但未對其進行投影**——像素沒有可選取的鏡像，或者鏡像由與繪製路徑不同的數學計算定位。自訂文字實體應重複使用引擎準備好的佈局（`prepareContentGrid`/`LayoutEngine.prepare`）進行繪製和投影，絕不要進行兩次獨立的測量。

**驗證對齊**（使用數字，而非截圖）：

```typescript
// 1. 程式化選取是否複製了邏輯來源？
//    （選取API鏡像使用者拖曳會產生的效果。）
const text = window.getSelection()?.toString();
expect(text).toBe(expectedSourceSlice);

// 2. 哪個實體實際接收了瀏覽器的選取事件？
import { createEventTrace } from '@vectojs/devtools/headless';
const trace = createEventTrace(scene, { capacity: 50 });
// … 拖曳選取 …
// source === 'content' 的條目始於可選取投影；
// 其 targetPath 告訴你具體是哪一個，defaultPrevented 則表示
// 應用程式是否攔截了瀏覽器的預設選取行為。
```

在與命中測試相同的環境矩陣中執行拖曳選取測試：兩種瀏覽器、兩種DPR，以及至少一種非預設縮放層級。

## 可移植性檢查清單

要構建一個在任何地方外觀和行為都一致的UI：

- [ ] 隨附你測量時使用的字型；在`document.fonts.ready`之後構造文字。
- [ ] 全螢幕場景 **或** `ResizeObserver` → `scene.resize()`橋接——絕不可兩者皆無。
- [ ] 在DPR 1 **和** 2、Chrome **和** Firefox下進行指標+選取測試。
- [ ] CI中`auditScene(scene)`乾淨通過（關係型佈局正確性，與字型無關）。
- [ ] 對關鍵互動使用快照差異（`captureSnapshot`/`diffSnapshots`）而非像素比對截圖。
- [ ] 在啟用OS減少動畫設定的情況下驗證動畫。
- [ ] 如果啟用了WebGL/WebGPU後端，同時也要測試Canvas2D回退路徑。

> **下一篇：** [偵錯工作流程](/reference/devtools-inspect/#除錯工作流程)提供了此檢查清單所依賴的數值工具，以及[串流與即時文字](/learn/streaming/)用於即時UI。
