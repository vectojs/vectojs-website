+++
title = "@vectojs/video-exporter"
description = "用於逐幀步進 VectoJS 場景並將其 canvas 輸出編碼為 H.264 MP4 的 CLI 和函式庫，使用 Chromium 和 FFmpeg。"
weight = 47
+++

# `@vectojs/video-exporter`

文件版本：**0.2.4**

`@vectojs/video-exporter` 在無頭 Chromium 中以固定的時間步長驅動 VectoJS 場景，將其 canvas 捕獲為 PNG 幀，並將這些幀傳送給 FFmpeg 進行 H.264 MP4 編碼。

## 功能

- **固定步長場景控制**：停止正常的 Scene 迴圈，並在每次捕獲前呼叫 `scene.step(1000 / fps)`。這使得請求的模擬時間具有確定性；它不保證使用無關時鐘、網路輸入或隨機性的應用程式碼是確定性的。
- **PNG 圖片管線**：在 Chromium 中呼叫 `canvas.toDataURL('image/png')`，在 Node 中解碼 base64 結果，並將每個 PNG 寫入 FFmpeg 的 stdin。
- **標準 MP4 輸出**：使用 FFmpeg 的 `libx264` 編碼器和 `yuv420p` 畫素格式。
- **選用音訊混流（0.3.0+）**：將外部音訊檔案作為 AAC 音軌混入匯出，並裁剪至影片長度。未提供時匯出保持無聲。
- **本地原始碼輔助**：對於本地模組路徑，啟動嵌入式 Vite 伺服器並提供記憶體中的 HTML 入口，而不修改原始碼目錄。也接受託管的 HTTP(S) 頁面。
- **原子輸出**：編碼到目標旁邊的唯一檔案，僅在 FFmpeg 成功退出後才取代請求的 MP4。失敗或中止的匯出會保留現有目標。
- **確定性清理**：在成功、失敗或中止時停止進度輸出、終止 FFmpeg、關閉 Chromium 和 Vite，並移除暫存檔案。

---

## 安裝

```bash
bun add @vectojs/video-exporter
```

匯出器需要 `ffmpeg` 在 `PATH` 上。Chromium 從 `PUPPETEER_EXECUTABLE_PATH` 解析，然後在存在時從 `/usr/bin/chromium` 解析，然後從 Puppeteer 設定或捆綁的瀏覽器解析。

```bash
ffmpeg -version
PUPPETEER_EXECUTABLE_PATH=/opt/chrome/chrome bunx vecto-export ./scene.ts
```

Vite 是執行時依賴，會為本地 JavaScript 和 TypeScript 入口自動安裝。

## CLI 使用方式

直接傳遞本地 JavaScript/TypeScript 模組：

```bash
bunx vecto-export ./my-animation.ts -o output.mp4 -f 60 -d 5
```

或傳遞預先託管的 URL：

```bash
bunx vecto-export http://localhost:5173 -o output.mp4 -f 60 -d 5
```

### 選項

- `-o, --output`：輸出檔案（預設：out.mp4）
- `-w, --width`：寬度（畫素）（預設：1280）
- `-h, --height`：高度（畫素）（預設：720）
- `-f, --fps`：每秒幀數（預設：60）
- `-d, --duration`：持續時間（秒）（預設：5）
- `-a, --audio`（0.3.0+）：要混入匯出的音訊檔案（編碼為 AAC）

## 內部 API 使用方式

```typescript
import { exportVideo } from '@vectojs/video-exporter';

await exportVideo({
  url: 'my-animation.ts', // 或 http URL
  outputPath: 'out.mp4',
  width: 1920,
  height: 1080,
  fps: 60,
  duration: 10,
});
```

渲染的頁面必須將一個已啟動或可啟動的 VectoJS Scene 公開為 `window.vectoScene`。匯出器最多等待 10 秒，需要可呼叫的 `stop()` 和 `step(dt)` 方法，然後以固定步長推進它。第一個 `<canvas>` 會被調整為請求的輸出維度並捕獲。

**場景重置契約（`0.2.4+`）。** 在頁面載入與 `stop()` 之間，頁面自身的 rAF 迴圈自由執行，因此牆鐘狀態（入場補間、緩動進場）在擷取開始時已是任意的，之後的每一幀都只是從這個非確定性基線出發才可確定。匯出器現在會在 `stop()` 之後立即呼叫一次 `window.vectoScene` 上可選的 `reset()`，在第 0 幀被步進或擷取之前。渲染保持靜態直到第一次 `step(dt)` 的場景不受影響，無需 `reset()`；攜帶載入時狀態的場景**必須**公開它以回到其 t=0 呈現。沒有 `reset()` 的場景按原樣匯出。

```typescript
const scene = new Scene(document.querySelector('canvas')!);
// 新增 entity...
(window as Window & { vectoScene?: Scene }).vectoScene = scene;
scene.start();
```

幀數為 `Math.ceil(fps × duration)`。如果 FFmpeg 非零退出，Promise 會以有限的 stderr 尾部拒絕。錯誤區分驗證、Vite、Chromium/頁面契約、捕獲、FFmpeg、輸出提交和清理階段。

## 音訊（0.3.0+）

在 API 中傳入 `audioPath`（或在 CLI 中使用 `-a, --audio <file>`）即可將音訊軌道混入匯出：

```typescript
await exportVideo({
  url: 'my-animation.ts',
  outputPath: 'out.mp4',
  width: 1280,
  height: 720,
  fps: 60,
  duration: 6,
  audioPath: 'voice.wav', // encoded as AAC, trimmed to the video length
});
```

該音軌以 192 kbps 的 AAC 編碼，`-shortest` 會將其裁剪至影片長度，因此過長的音訊檔案絕不會延長匯出。缺失或指向非檔案的路徑會在選項校驗階段（Chromium 啟動之前）被拒絕。畫布擷取管線本身不會產生聲音：除非提供 `audioPath`，否則匯出保持無聲。

## 取消與行程訊號

使用 `AbortController` 中止 API 匯出。CLI 將 `SIGINT` 和 `SIGTERM` 映射到相同的清理路徑，等待資源關閉，然後以退出碼 130 或 143 回傳。

```typescript
const controller = new AbortController();
const exportPromise = exportVideo({
  url: './my-animation.ts',
  outputPath: './out.mp4',
  width: 1920,
  height: 1080,
  signal: controller.signal,
});

controller.abort();
await exportPromise;
```

## Chromium 沙箱策略

沙箱對一般用戶保持啟用。僅在 root 或明確設定 `VECTO*CHROMIUM*NO_SANDBOX=1` 時停用，且匯出器在任一種情況下都會發出警告。環境變數適用於受限的 CI 執行器；其他地方請使用一般的非 root 行程。
