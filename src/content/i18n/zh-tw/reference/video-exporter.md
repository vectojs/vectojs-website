---
title: '@vectojs/video-exporter'
description: '用於逐幀步進 VectoJS 場景並將其 canvas 輸出編碼為 H.264 MP4 的 CLI 和函式庫，使用 Chromium 和 FFmpeg。'
order: 47
---

# `@vectojs/video-exporter`

文件版本：**0.2.2**

`@vectojs/video-exporter` 在無頭 Chromium 中以固定的時間步長驅動 VectoJS 場景，將其 canvas 捕獲為 PNG 幀，並將這些幀傳送給 FFmpeg 進行 H.264 MP4 編碼。

## 功能

- **固定步長場景控制**：停止正常的 Scene 迴圈，並在每次捕獲前呼叫 `scene.step(1000 / fps)`。這使得請求的模擬時間具有確定性；它不保證使用無關時鐘、網路輸入或隨機性的應用程式碼是確定性的。
- **PNG 圖片管線**：在 Chromium 中呼叫 `canvas.toDataURL('image/png')`，在 Node 中解碼 base64 結果，並將每個 PNG 寫入 FFmpeg 的 stdin。
- **標準 MP4 輸出**：使用 FFmpeg 的 `libx264` 編碼器和 `yuv420p` 畫素格式。
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

```typescript
const scene = new Scene(document.querySelector('canvas')!);
// 新增 entity...
(window as Window & { vectoScene?: Scene }).vectoScene = scene;
scene.start();
```

幀數為 `Math.ceil(fps × duration)`。如果 FFmpeg 非零退出，Promise 會以有限的 stderr 尾部拒絕。錯誤區分驗證、Vite、Chromium/頁面契約、捕獲、FFmpeg、輸出提交和清理階段。

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
