+++
title = "10 — 確定性影片匯出 — 固定步進擷取"
description = "如何以固定步進場景時鐘取代牆鐘時間，經由無頭 Chromium 擷取，並透過 PNG 影格管線至 FFmpeg 編碼為 H.264 MP4 — 具分階段輸出、中止與清理以保持目的地安全。"
weight = 30
+++

# 10 — 確定性影片匯出 — 固定步進擷取

> **Boss 10** 使動畫時間可重現。同一模組、同一 `fps × duration`、同一 `seed`——每次匯出皆產生相同影格，無論主機速度、合成器抖動或背景化分頁。兩個時鐘同時存在：**牆鐘**（`requestAnimationFrame`、`performance.now()`——擷取開始前瀏覽器所做的一切）與**固定步進時鐘**（`Scene.step(dt)` 以恰好 `dt = 1000/fps` 每影格）。匯出器在影格 0 之前殺掉前者並安裝後者。

- **你將學到**：為何影格 0 的確定性是最困難處；場景契約（`stop + step + 可選 reset`）；Chromium → 畫布 PNG → FFmpeg `image2pipe` 管線；分階段輸出、中止傳播與有序清理；CLI/API 介面與何時偏好何者；以及場景作者仍須消除的殘餘非確定性。
- **你不會學到**：VMT 生命週期/變換（Boss 06）、渲染器內部（Boss 07）或 WASM 加速（Boss 08）。本文件擁有擷取時鐘與編碼。

## 1. 為何確定性匯出困難 — 雙時鐘問題

即時的 VectoJS 場景在 `requestAnimationFrame` 節拍上前進（`packages/core/src/tree/Scene.ts:5569` `loop`）。每個節拍：

1. 自牆鐘計算 `dt = time - lastTime`（`Scene.ts:5609`）；
2. 當接近時將 `dt` 對齊至 `1000/cap` 的 ±30% 以隱藏合成器抖動（`Scene.ts:5625`）；
3. 將 `dt` 箝制至 `MAX_FRAME_DT = 100ms`（`Scene.ts:1114`、`:5636`），使背景化分頁不會將物理向前拋出數秒；
4. 更新驅動器、組合變換、布局，然後繪製。

這對即時頁面正確。對匯出則是致命：匯出時間必須為**影格索引的純函數**。

- 同一主機上的兩次執行，否則會在任一主機抖動、節流或背景化時不一致。
- 即使共用同一場景，基準與匯出在節奏上亦會不一致。
- 任何 `Math.random()`、牆鐘 `Date.now()` 或在非固定影格解析的非同步資源皆使影格 0 任意，其後每個影格皆繼承該基準（`packages/video-exporter/src/export-session.ts:78` 註解參照 `#646`）。

修正為**在第一個被擷取影格前停止牆鐘迴圈，並以常數步進前進**（`packages/core/src/tree/Scene.ts:3423` `step(dt)`）。確定性遂成為場景作者的紀律：每個動畫、彈簧與 tween 必須僅積分被給予的 `dt`，任何隨機性皆必須已播種。匯出器強制時鐘；場景必須提供確定性動態。

## 2. 場景契約 — 頁面必須暴露什麼

匯出器在一般瀏覽器頁面（本地或遠端）內執行，並透過 `window.vectoScene` 與場景對話。三個方法重要：

| 方法       | 角色                              | 是否必要 | 檢查位置                                           |
| ---------- | --------------------------------- | -------- | -------------------------------------------------- |
| `stop()`   | 停止 `requestAnimationFrame` 迴圈 | 是       | `packages/video-exporter/src/export-session.ts:62` |
| `step(dt)` | 同步前進並渲染恰好一影格          | 是       | `packages/video-exporter/src/export-session.ts:70` |
| `reset()`  | 還原至 t=0 的呈現（可選）         | 否       | `packages/video-exporter/src/export-session.ts:84` |

### 2.1 `stop + step` 即時鐘切換

`ExportSession.validateAndStopScene`（`export-session.ts:60`）：

- `page.waitForFunction('!!window.vectoScene', { timeout: 10_000 })`（`export-session.ts:61`）——頁面在 `networkidle0` 後有 10 秒發布場景。
- `page.evaluate` 探測 `typeof scene.stop === 'function'` 與 `typeof scene.step === 'function'`（`export-session.ts:62`）：若任一缺失則拋出 `window.vectoScene must provide callable stop() and step(dt) methods`（`export-session.ts:71`）。
- 然後 `scene.stop()`（`export-session.ts:75`）殺掉 `requestAnimationFrame` 重排，使擷取成為唯一推進時間者。

每個匯出影格接著以正規化 `dt = 1000 / fps`（`export-session.ts:148`）呼叫 `scene.step(dt)`。`Scene.step`（`Scene.ts:3423`）恰做一件事：`time = lastTime + dt; lastTime = time; render(renderer, dt, time)`——無 dirty 檢查（`Scene.ts:3405` _「無條件渲染」_）、無 `always` 閒置節流、無 `MAX_FRAME_DT` 箝制（`Scene.ts:3421` _「不被 MAX_FRAME_DT 箝制 — 呼叫者選擇步進」_）。該繞過刻意為之：確定性驅動器要求影格因為它想要該影格。

`step` 文件指出兩個渲染陷阱，使審查者不誤讀度量：

- 經 `step()` 驅動影格的基準**無法觀測影格跳過**（`Scene.ts:3411`），因此 `always` vs `onDemand` 經此路徑不可見——僅在即時的 `start()` 迴圈上度量排程（`Scene.ts:3417`）。
- 當場景僅被 `step()` 驅動時，`frameStats` 保持於其零預設值（`Scene.ts:3501`）——階段探針位於 `loop` 上。

### 2.2 `reset` 為影格 0 修正（議題 #646）

在頁面載入與 `scene.stop()` 間，頁面自身的 rAF 迴圈以任意、與主機相關的節拍數自由運行。任何由那些節拍驅動的 intro tween 或緩動進場在擷取開始前即達任意狀態——其後所有影格僅自該非確定基準起確定（`export-session.ts:78` 註解，`#646`）。

- 渲染為**靜止直至首次 `step(dt)`** 的場景無需任何處置——影格 0 已為 t=0。
- 攜帶**載入時狀態**的場景暴露 `reset(): void` 以回到其 t=0 呈現。匯出器在 `stop()` 後、首次 `step()` 前呼叫它一次（`export-session.ts:84`）：`if (typeof scene?.reset === 'function') scene.reset()`。順序不變量於 `packages/video-exporter/test/export-session.test.ts:154` 中斷言——`reset` 在 `stop` 後、首次 `step` 前。
- 無 `reset` 的場景按原樣匯出——非確定性遂為作者問題，而非匯出器錯誤。

展示場景闡明預期用法：

- `packages/video-exporter/demo/data-chart.ts:222` `window.vectoScene = scene` + `:227` _「保持閒置，使匯出器的 stop()+step(dt) 序列成為唯一時鐘」_；
- `packages/video-exporter/demo/ml-descent.ts:219` 同樣註記；
- `packages/video-exporter/demo/math-teaching.ts:9` _「時鐘、無隨機、無 scene.start()」_ + `:161` stop/step 為唯一時鐘。

測試以 `packages/video-exporter/test/fixtures/two-frame-scene.ts:8` `window.vectoScene = { stop(){}, step(dt){} }` 模仿頁面。

## 3. 管線 — 自 `url` 至 `out.mp4`

```text
 ExportOptions ──► normalizeOptions ──► resolveInputTarget ──► launchBrowser ──► ExportSession.run
        │                │                       │                    │                  │
   options.ts:40   options.ts:102-114     input-target.ts:48    browser.ts:66     export-session.ts:111
   validate, dt,        isRemote,       local→ Vite HTML or  Puppeteer headless  validate → sizeCanvas
   totalFrames,      totalFrames,          remote→ inert        + sandbox args    → captureFrame loop
   even H.264 check   dt, audio checks     + ephemeral server
                                                                              │
                                        ┌─────────────────────────────────────┤
                                        │  for each frame: page.evaluate(step(dt))
                                        │  + canvas.toDataURL('image/png')       export-session.ts:148-154
                                        │  → encoder.write(pngBytes)
                                        └───────────┬─────────────────────────┘
                                                    ▼
                                        FfmpegSupervisor.write / finish  ffmpeg-supervisor.ts:156/177
                                        stdin = image2pipe png, fps = -r, yuv420p libx264
                                        + optional audio track as second -i, -c:a aac -shortest
                                                    │
                                        StagedOutput commit  staged-output.ts:99
                                        atomic rename: .vecto-*.mp4 → destination.mp4
```

### 3.1 選項 → 正規化選項

`packages/video-exporter/src/options.ts:40` `normalizeOptions`：

- `url`/`outputPath` 必須為非空字串；`width`/`height`/`fps` 必須為正整數（`options.ts:34` `positiveInteger`），`duration` 為正有限數（`options.ts:54`）。
- `fps` 預設 60，`duration` 5 秒（`options.ts:48`）；衍生 `dt = 1000 / fps`（`options.ts:113`）與 `totalFrames = Math.ceil(fps * duration)`（`options.ts:112`），使小數持續時間產生正確數量而非短的最終影格。影格數於 `references/export-recipes.md:10` 中記錄，並作為 `dist/index.d.ts` 契約發布。
- H.264 `yuv420p` 色度為 2×2 子取樣——奇數尺寸永遠無法編碼。唯有 `ffmpeg` 會在最後以原始 stderr 說明，且在渲染每個影格後。改為提前驗證（`options.ts:58` `width % 2 !== 0 || height % 2 !== 0` → `TypeError`）。
- `isRemote = /^https?:\/\//i.test(url)`（`options.ts:68`）。本地路徑為 `resolve(url)` 且必須存在且為檔案（`options.ts:70`）。相同啟動前檢查適用於 `audioPath`（`options.ts:78`）：遺漏音軌否則僅作為最終 FFmpeg stderr 呈現。
- `outputPath = resolve(outputPath)`（`options.ts:88`）；其父目錄必須存在、為目錄且可寫（`options.ts:97` 處的 `accessSync(…, W_OK)`）。輸出不提前截斷——下方 `StagedOutput` 處理原子性。

### 3.2 輸入目標 — 本地 Vite 路由 vs 遠端 URL

`packages/video-exporter/src/input-target.ts:48` `resolveInputTarget`：

- 遠端：`inertTarget(url)`（`input-target.ts:44`）——無伺服器，`close` 為無操作。
- 本地檔案：以 `custom` 應用型別啟動 Vite 開發伺服器（`input-target.ts:58`），根為 `dirname(url)` 使裸 `import 'three'` 等可解析：
  - `root = dirname(url)`（`input-target.ts:54`）、`entryUrl = "/" + encodeURIComponent(basename(url))`（`input-target.ts:55`）——`encodeURIComponent` 對檔名中的空白/unicode 重要。
  - 短暫路徑 `/__vecto_export_${randomUUID()}.html`（`input-target.ts:56`）——隨機以避免跨並行匯出的碰撞，但 `staged-output.ts:35` 處註解仍假設_每次一匯出器對應一目標路徑_。
  - 單一中介軟體：在該路徑上，回傳承載 `<canvas id="app">` 與 `<script type="module" src="${entryUrl}">` 的合成 HTML（`input-target.ts:74`），經 `server.transformIndexHtml(pathname, source)`（`input-target.ts:85`）使 Vite 的 HMR/別名/TS 轉換套用至進入點。錯誤在存在時委派至 `next(error)`（`input-target.ts:90`）。
  - `await server.listen()`（`input-target.ts:98`），然後 `server.httpServer?.address()`（`input-target.ts:99`）：必須為 `{ port: number }` 否則呼叫拋出 `Vite did not expose a TCP address`（`input-target.ts:106`）。任何失敗皆關閉新建立的伺服器（外部 `catch` 中的 `input-target.ts:114`），使半啟動的 Vite 不孤立埠。
  - 回傳的 `InputTarget.url` 為 `http://127.0.0.1:${port}${pathname}`（`input-target.ts:110`）；`close()` 恰關閉 Vite 伺服器一次（`input-target.ts:65` `closed` 守衛）。

這保持來源目錄乾淨——無輔助 `.html` 被寫入磁碟，此為 `vectojs-video-exporter/SKILL.md:43` 中列出的常見錯誤。

### 3.3 瀏覽器啟動 — Chromium 與沙盒策略

`packages/video-exporter/src/browser.ts:45` `resolveBrowserLaunchOptions`：

- 解析順序：`PUPPETEER_EXECUTABLE_PATH`（已修剪，`browser.ts:49`），否則若存在則 `/usr/bin/chromium`（`browser.ts:51`），否則 Puppeteer 解析/綑綁的 Chromium——匹配 `README.md:10` _「需要具 libx264 的 FFmpeg … 加上自 PUPPETEER_EXECUTABLE_PATH 解析的 Chromium，然後 /usr/bin/chromium，然後 Puppeteer 的 …」_。
- `args` 恆含 `--disable-gpu`（`browser.ts:53`）。
- 僅當 `getuid() === 0` 或 `VECTO_CHROMIUM_NO_SANDBOX=1`（`browser.ts:55`）時才停用沙盒（並警告）。`browser.ts:58` 處警告文字：_「此 VectoJS 影片匯出的 Chromium 沙盒已停用。盡可能以非 root 使用者執行。」_ 偏好非 root 匯出處理程序（`SKILL.md:38`）。

啟動本身為測試接縫：`BrowserDependencies.launch`（`browser.ts:34` `launch(options) → BrowserLike`，預設 `browser.ts:42` 處的 `puppeteer.launch(options)`）與 `export-session.ts:32` `launchBrowser` 可在 `ExportSessionDependencies` 中替換。

### 3.4 擷取迴圈 — `validateAndStopScene` → `sizeCanvas` → 影格迴圈

<!-- markdownlint-disable MD031 MD032 MD040 -->

`ExportSession.run`（`export-session.ts:111`）：

1. 在取得任何資源前 `throwIfAborted()`（`export-session.ts:120`，讀取 `options.signal?.aborted` 並自 `packages/video-exporter/src/abort-error.ts:6` 拋出 `abortError(signal)`）。
2. `target = resolveInputTarget(options)`（`export-session.ts:121`）、`output = createStagedOutput(outputPath)`（`export-session.ts:122`）、`browser = launchBrowser()`（`export-session.ts:123`）、`page = browser.newPage()`（`export-session.ts:124`）、`page.setViewport({ width, height, deviceScaleFactor: 1 })`（`export-session.ts:125`）——_擷取以 deviceScaleFactor: 1 執行_（`SKILL.md:31`）：匯出像素等於 `width × height`，與主機 DPR 無關。
3. `page.goto(target.url, { waitUntil: 'networkidle0' })`（`export-session.ts:132`）——等待靜止後再觸碰場景。
4. `sizeCanvas(page)`（`export-session.ts:133` → `export-session.ts:90`）：`document.querySelector('canvas')` → `canvas.width = width; canvas.height = height`。若缺失則拋出 `No canvas found`（`export-session.ts:93`）。此在 `goto` _之後_執行，因此頁面自身的 `<canvas>` 已存在——Vite 合成外殼（`input-target.ts:81`）為本地進入點提供它。
5. `validateAndStopScene(page)`（`export-session.ts:134` → `:60`——見 §2）。
6. 第二次 `throwIfAborted()`（`export-session.ts:135`）——驗證期間到達的中止必須在 FFmpeg 產生前停止。
7. `encoder = startFfmpeg({ fps, outputPath: output.path, audioPath, signal })`（`export-session.ts:137`）：注意_分階段_路徑 `output.path`（`staged-output.ts:53`，目的地的 `.<stem>.vecto-<uuid>.mp4` 兄弟），而非最終 `outputPath`。
8. `progress = createProgress()`（`export-session.ts:143`，`export-session.ts:41` 處的 `cli-progress` 預設）然後 `progress.start(totalFrames)`（`export-session.ts:144`）。
9. 影格迴圈（`export-session.ts:146`）：

   ```ts
   for (let frame = 0; frame < totalFrames; frame++) {
     throwIfAborted(); // export-session.ts:147
     await page.evaluate((dt) => scene.step(dt), dt); // :148
     await encoder.write(await captureFrame(page)); // :153
     progress.update(frame + 1); // :154
   }
   ```

`captureFrame`（`export-session.ts:99`）讀取_第一個_ `<canvas>` 並呼叫 `canvas.toDataURL('image/png')`，以 `,` 分割（`export-session.ts:104`），將 base64 尾部解碼為供 `image2pipe/png` stdin 的 `Buffer`。_「第一個頁面 `<canvas>` 被重設大小並擷取」_（`SKILL.md:27`）。

<!-- markdownlint-disable MD029 -->

10. 迴圈後：`throwIfAborted()`（`export-session.ts:157`）、`encoder.finish()`（`export-session.ts:158` 關閉 stdin 並等待 `close`）、再次 `throwIfAborted()`（`export-session.ts:159`），然後 `output.commit()`（`export-session.ts:160`）——僅在乾淨的 FFmpeg 退出後，分階段檔案才替換目的地。

## 4. FFmpeg — `image2pipe` → H.264/yuv420p 與有界 stderr 尾部

### 4.1 參數

`packages/video-exporter/src/ffmpeg-supervisor.ts:274` `startFfmpeg`：

````ts
const args = ['-y', '-f', 'image2pipe', '-vcodec', 'png', '-r', String(fps), '-i', '-'];
if (audioPath !== undefined) args.push('-i', audioPath);
args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');
if (audioPath !== undefined) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
args.push(outputPath);
```text

順序註記（`ffmpeg-supervisor.ts:278`）：輸入在前（`-f image2pipe … -i -`，然後可選 `-i audioPath`），然後輸出選項——在音訊 `-i` 前的 `-c:a` 將附加至解碼器而非輸出編碼器。音訊為 AAC `192k`，修剪至影片長度（`-shortest`，`ffmpeg-supervisor.ts:287`），僅由 CLI 上的位置 `-a/--audio`（`cli.ts:32`、`:64`）或 API 中的 `audioPath`（`options.ts:16`、`:78`）啟用。

輸出為標準 H.264 `yuv420p` MP4（`SKILL.md:28`，`README.md:12`）。

### 4.2 Stdin 監管 — 背壓、EPIPE 競爭與 `FfmpegSupervisor` 接縫

FFmpeg 作為 `ChildProcessLike` 產生（於 `ffmpeg-supervisor.ts:13`/`21`/`28` 可測試偽造），其 `stdin` 由影格迴圈寫入。`ffmpeg-supervisor.ts:34` `FfmpegSupervisor` 加固 stdin 管線：

- `stderrBuffer` 有界至 64 KiB（`ffmpeg-supervisor.ts:5` `STDERR_LIMIT`），透過串接後取尾（`:67` `combined.subarray(combined.byteLength - STDERR_LIMIT)`）——*每個*錯誤皆攜帶該尾部（`:117` `processError` 中的 `stderr.trim()`）。
- 來自子行程 `error` 事件的 `spawnError` → `Failed to start FFmpeg: ...`（`:73`）。
- 持久的 `child.stdin.on('error')` 處理器記錄 `stdinError`（`:80`）。動機（`:41`）：*「FFmpeg 在匯出中途死亡會摧毀管線並在最後 write() 已解析後發射非同步 EPIPE——若無即時監聽器，該錯誤作為無監聽器的未捕捉例外呈現，逃脫 ExportSession try/catch，跳過其清理，並孤立無頭 Chromium 加上 Vite 伺服器。」* 記錄它使 `processError` 能在下次 `write`/`finish` 上經正常中止/清理路徑呈現失敗。
- `close` 經 `markClosed` 一次提交（`:92`，受 `closed` 守衛，記錄 `closedBeforeInputCompleted`）。`closeCode`/`closeSignal` + `exitDescription`（`:105` `code N` / `signal NAME` / `unknown status`）包含於每個退出錯誤。
- `processError(early: boolean)`（`:111`）為單一決策點：
  - 若 `spawnError` → 該錯誤，
  - 否則若尚未關閉且 `stdinError` 已設定 → 該錯誤（即使子行程尚未退出亦為斷裂管線），
  - 否則若已關閉且 `early||closeCode!==0` → `FFmpeg exited before input completed` vs `exited` + 退出描述 + stderr 尾部，
  - 否則（具遲到 `stdinError` 的乾淨退出）→ 仍呈現 `stdinError` 而非在斷裂管線上回報成功。
- `write(frame)`（`:156`）在寫入前檢查 `throwIfAborted()` 與 `processError(true)`，使用布林 `stdin.write(frame)` 背壓回傳——`false` 在 `waitForDrain()`（`:126`）中等待。該競爭安裝對 `stdin:drain`、`stdin:error`、`child:close` 與 `signal:abort` 的一次性監聽器（`:131`/`134`/`149`/`137`）並相應解析/拒絕；排空後再次檢查 `throwIfAborted()` 與 `processError(true)`。
- `finish()`（`:177`）具冪等性（`finishPromise`）。`finishOnce`（`:183`）守衛 `closedBeforeInputCompleted`（若子行程早期死亡則無法完成）、呼叫 `child.stdin.end()`（`:190`），然後 `waitForCloseOrAbort()`（`:198`）再重檢查 `processError(false)`——退出碼 `0` 且 `stdinError` 為空為唯一成功。

### 4.3 終止 — `terminate()`、`SIGTERM→SIGKILL` 與無訊號懸掛

`terminate()`（`:241`）為清理路徑，亦具冪等性。`terminateOnce`（`:247`）恆嘗試整理：

- `child.stdin.destroy()` 然後 `SIGTERM`，等待 `terminateTimeoutMs`（預設 `1000ms`，`options.ts:31` / `ffmpeg-supervisor.ts:258`）的 `closedPromise`（`:249`），升級至 `SIGKILL`（`:253`），再次等待（`:254`）。`waitForCloseOrTimeout`（`:257`）競爭 `closedPromise` vs `setTimeout(timeoutMs)`（`:263`）並清除計時器（`:266`）。

`waitForCloseOrAbort`（`:203`）具**無訊號分支**——函式庫呼叫者可能不傳 `AbortSignal`，因此裸 `await closedPromise` 若 FFmpeg 卡住將使 `finish()` 永遠懸掛。在該分支中，每階段等待 `terminateTimeoutMs` 並升級 `SIGTERM→SIGKILL`，最終以 stderr 尾部拋出 `FFmpeg did not exit after SIGTERM and SIGKILL`（`:222`）——同一階梯為 `terminate()` 所用，現套用至無外部中止時的 `finish`。具訊號時，`waitForCloseOrAbort` 競爭 `closedPromise` 與 `signal:abort`（`:227`/`234`）並經 `abortError` 路由取消。

### 4.4 `StagedOutput` — 原子目的地替換

`packages/video-exporter/src/staged-output.ts:27` `StagedOutput`：

- `path = <dir>/.<stem>.vecto-<uuid>.mp4`（`:53`），`targetPath` 為呼叫者的 `outputPath`，`backupPath = .<stem>.vecto-<uuid>.backup<ext>`（`:54`）——分階段識別為隱藏兄弟，每匯出唯一（經 `node:crypto` `randomUUID` 的 uuid，`:1`/`14`/`60`）。
- 建構啟動 `staleSweep`（`:55`、`:42`）：對被殺的前次執行留下的 `.vecto-*` 兄弟的最佳努力回收，該執行死於備份重命名與安裝間（`:35`）。`sweepStaleFiles`（`:82`）讀取目的地目錄、尋找 `.prefix = ".<stem>.vecto-"` 條目（`:89`）、排除自身的 `path`/`backupPath`（`:90`），並經 `Promise.allSettled` 以 `rm(..., { force: true })`（`:92`）處理。
- `commit()`（`:99`）先等待 `staleSweep`（與自身重命名無競爭，`:41`），然後 `rename(path, targetPath)`——當無檔案或覆寫成功時的快速路徑安裝（`:104`）。在 `EEXIST`/`EPERM`（`:108`/`21` `errorCode`）上，執行經典交換：`rename(targetPath, backupPath)`（`:112`）、`rename(path, targetPath)`（`:115`）——若第二次重命名拋出，則還原 `rename(backupPath, targetPath)`（`:119`）並拋出攜帶*兩者* `installError` 與 `restoreError` 的 `AggregateError`（`:126`，刻意非單一 `cause`）。成功時移除備份（`:134`）。
- `cleanup()`（`:138`）亦等待 `staleSweep`，然後 `rm(path)`（`:145`），若 `backupMoved` 仍設定則調和備份（`:150`）：若目的地現已存在則備份已替換並被刪除；若 `installError` 使目的地缺失則還原備份。例外收集為 `AggregateError`（`:163`）。

結果：FFmpeg 編碼至目的地旁的分階段檔案（`export-session.ts:137` `output.path`）。失敗或中止的匯出保持任何既有目的地完整並移除分階段成品——於 `test/export-session.test.ts` 慣例中驗證。

## 5. 管線所依賴的瀏覽器細節

- 每匯出一個輔助頁面（`export-session.ts:124` `browser.newPage()`）——擷取經該單一 `PageLike`（`browser.ts:4` `PageLike` 具 `setViewport`/`goto`/`waitForFunction`/`evaluate`）執行。`PageLike` 刻意最小，使測試中的瀏覽器模擬保持精確。
- 裝置縮放固定為 `1`（`export-session.ts:128`）——與 `SKILL.md:31` `deviceScaleFactor: 1` 一致，匯出承諾 `width × height` 為輸出像素，與主機 DPR 無關（Boss 07 領域）。
- `page.goto(..., { waitUntil: 'networkidle0' })`（`export-session.ts:132`）在 `sizeCanvas`/`validateAndStopScene` 執行前等待網路靜止——無此則遲到的 `window.vectoScene` 指派將錯過 `waitForFunction` 視窗或攜帶部分載入的場景圖。

## 6. 取消與行程訊號 — 每條路徑皆收斂至 `AbortError`

匯出取消有三個來源但一種錯誤種類：具 `cause` 為 `AbortSignal.reason` 的 `AbortError` 命名錯誤（`abort-error.ts:6`）。`abortError` 於 `#661` 中抽取（見 `abort-error.ts:1` 註解），以去重先前於 `export-session` 與 `ffmpeg-supervisor` 中相同的兩個實作。

### 6.1 函式庫 API — `AbortSignal`

`options.ts:17`（`ExportOptions` 上的 `signal?: AbortSignal`）與其正規化副本（`options.ts:28`）皆將訊號攜入 `ExportSession` 與 `FfmpegSupervisor`。每個變更點皆呼叫 `throwIfAborted()`（`export-session.ts:55`/`147`/`157`/`159`，`ffmpeg-supervisor.ts:101`/`126`/`157`/`184`/`225`），`waitForDrain`/`waitForCloseOrAbort` 監聽 `signal:abort`（於 `ffmpeg-supervisor.ts:152`、`232` 的一次性監聽器）。

### 6.2 CLI — `SIGINT`/`SIGTERM` → `AbortController`

`packages/video-exporter/src/cli.ts:50` `runCli`：

- 具 `allowPositionals: true` 的 `parseArgs`（`cli.ts:55`），要求一個位置 `url`（`cli.ts:74`），大聲拒絕額外項（`cli.ts:82` *「靜默僅匯出第一個會隱藏錯誤」*），`output`/`width`/`height`/`fps`/`duration`/`audio` 自 `values` 以 `positiveInteger`/`positiveNumber` 驗證映射（`cli.ts:34`/`42`）。
- `AbortController`（`cli.ts:113`）、`SIGINT→abort('Interrupted by SIGINT')`（`cli.ts:115`）與 `SIGTERM→abort('Terminated by SIGTERM')`（`cli.ts:119`），具傳統結束碼 `130`（`cli.ts:116`）/ `143`（`cli.ts:120`），記憶為 `signalExitCode` 並優先回傳（`cli.ts:137`）。監聽器經可注入的 `CliRuntime`（`cli.ts:18`/`20`）註冊並在 `finally` 中移除（`cli.ts:142`），與使 `ExportSession` 相依可測試的形態相同。
- `runCli` 在訊號上不拋出：即使 `exportVideo` 拋出 `AbortError`（`cli.ts:139`），`if (signalExitCode !== undefined) return signalExitCode`，`catch` → `runtime.error('Export failed:', error)`（`cli.ts:140`）vs 否則為 `1`。`cli.ts:148` `isExecutableEntry` 處的可執行守衛經 `realpathSync` 解析 `dist` 與 `argv[1]` 間的 symlink 不匹配。

### 6.3 有序清理 — 無孤立的瀏覽器/伺服器/FFmpeg/分階段檔

`ExportSession.run`（`export-session.ts:166` `catch` 內的 `clean` 輔助）以反向取得順序釋放：`progress.stop` → `encoder.terminate` → `browser.close` → `target.close` → `output.cleanup`（`export-session.ts:175`–`:179`）。匹配的永不拋出模式取自 `cli.ts:142` `finally` 中的 `off`；匯出器變體更明確——每步驟為 `try/catch` 至 `cleanupErrors`（`:170`）然後：

- 若 `primaryError`（來自 `try` 的任何拋出）且無清理錯誤 → 拋出 `primaryError`（`:182`）；
- 若兩者皆有 → `AggregateError([primaryError, ...cleanupErrors], errorMessage(primaryError), { cause: primaryError })`（`:183`）；
- 若僅清理錯誤 → `AggregateError(cleanupErrors, 'Video export cleanup failed')`（`:188`）。

FFmpeg 自身的 `finish`/`terminate` 競爭（`ffmpeg-supervisor.ts:198` `waitForCloseOrAbort`、`:247` `terminateOnce`）即使無訊號亦保證永不無限懸掛。分階段掃描（`staged-output.ts:35` 擱淺 CI 註記）與上述 Chromium/Vite 關閉共同意味在備份重命名與安裝間的 `SIGKILL`（`staged-output.ts:35`，`export-session.ts:78` 相鄰）可在*下次*執行時復原。

### 6.4 測試對清理順序的驗證

`packages/video-exporter/test/export-session.test.ts:60` 夾具編碼順序。兩個測試值得作為預期生命週期規格閱讀：

- *`reset` 時機*（`:154` `fixture.events.indexOf('scene.reset')` 介於 `scene.stop` 與 `scene.step` 間）——影格 0 契約的順序回歸守衛。
- *失敗仍關閉一切*（`:169` `progress.stop`、`:185` `scene.stop`、`:210` `progress.acquired` ↔ `progress.stop` 不變量）——每個 `startFfmpeg` → `encoder.terminate`、每個 `launchBrowser` → `browser.close`、每個 `resolveInputTarget` → `target.close`、每個 `createStagedOutput` → `output.cleanup`，即使 `progress.stop` 或 `write` 拋出亦然。

## 7. 匯出器*未*使其確定者

固定步進移除主機與合成器非確定性。剩餘來源在場景作者手中：

- **`Math.random()`**：必須已播種（例如具影格索引種子的 `splitmix`/`xoshiro`）或以作者關鍵影格資料替換。否則每影格抖動取樣的螢幕空間取樣將按執行閃爍。
- **網路/IO**：在 `networkidle0` 邊界 vs 稍後解析的提取應確定性等待（由首次 `step` 前檢查的就緒旗標門控，而非牆鐘逾時）。
- **非同步資源載入**：字型（`packages/text/src/fontMetrics.ts:82` `registerFontMetrics`）、mipmap 層級或回報 `canUseSvgText` / `canUseMsdf` / `isReady` 的 WebGL 著色器編譯必須在 t=0 前等待——否則影格 0 與解碼器競爭。
- **平台塑形差異**：若在不同引擎上擷取，不同的 `measureText` 後端或 `deviceScaleFactor` 陷阱（Boss 02）仍會分歧。`deviceScaleFactor: 1`（`export-session.ts:128`）消除 DPR 變體，但非字型塑形變體——保持影格斷言按引擎區分。

此類任何形式必須或為 `reset()` 門控、已播種或移除。匯出器保證以 `dt` 步進的相同 Scene 產生相同影格；它無法保證你的 Scene 跨執行皆相同。

## 8. CLI vs API — 按呼叫者選擇，而非按能力

### 8.1 API — `exportVideo(options)`

`packages/video-exporter/src/index.ts:6` `exportVideo`：

````

import { exportVideo } from '@vectojs/video-exporter';
await exportVideo({
url,
outputPath,
width,
height,
fps,
duration,
audioPath,
signal,
});

```text

一個函式，無建構器。`normalizeOptions` 在不良幾何/音訊/輸出目錄上同步拋出（`options.ts:58` 奇數尺寸、`:78` 缺失 `audioPath`、`:90` 缺失父目錄、`:97` 不可寫），使錯誤設定工作在 Chromium 啟動*前*失敗。`totalFrames = Math.ceil(fps*duration)` 契約（`options.ts:112`，`cli.ts:104` 重推導相同寬度）刻意非「fps×duration−maybe-one」——短持續時間產生正確數量且無小數影格。API 上的訊號直接使用（`options.ts:17`/`28` 與 `export-session.ts:32` `FfmpegOptions` 中的 `signal` 欄位）。

### 8.2 CLI — `vecto-export`

`packages/video-exporter/src/cli.ts:25` `USAGE`：

```

Usage: vecto-export <url> [options]
-o, --output <file> Output file (default: out.mp4) cli.ts:59
-w, --width <pixels> Width (default: 1280) cli.ts:60
-h, --height <pixels> Height (default: 720) cli.ts:61
-f, --fps <number> FPS (default: 60) cli.ts:62
-d, --duration <secs> Duration (default: 5) cli.ts:63
-a, --audio <file> Mux an audio track as AAC cli.ts:32/64

````text

語意：

- **本地 vs 遠端輸入為隱含**：若 `url` 看似 `http(s)://` 則為遠端（`options.ts:68`）；否則為經 Vite HTML 外殼服務的本地檔案（`input-target.ts:48`）。你不傳旗標區分它們。
- **對第二個位置參數的拒絕**（`cli.ts:82`）為「意圖批次匯出」陷阱——`vecto-export a.ts b.ts` 以 `Unexpected extra arguments` 失敗，而非僅匯出 `a.ts`。
- **結束碼**：`0` 成功（`cli.ts:137` 落空）、`1` 驗證/瀏覽器/FFmpeg/清理失敗（`cli.ts:141` / 選項拋出 / `RuntimeError`）、`130` 於 `SIGINT`、`143` 於 `SIGTERM`（`cli.ts:116`/`120`）。`vecto-export --help` 映射至具缺失 `url` 的 `runCli`（`cli.ts:74` → `USAGE`）或拋出的 `parseArgs`（`:69` `Invalid arguments` + `USAGE`）。
- **套件契約**（`packages/video-exporter/package.json`）：`main: dist/index.js`、`bin: { vecto-export: dist/cli.js }`，經 `tsc` 然後 `chmod 0755 dist/cli.js` 建構（`package.json:10` `chmodSync`）。發布的 `.d.ts` 為 `dist/index.d.ts`。`exportVideo` 為唯一公開 API 面（`index.ts:6`）。

### 8.3 決策輔助

| 情境                                                                                               | 使用                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 將故事或展示渲染為成品的 CI 工作                                                    | `vecto-export ./src/demo/foo.ts -o out.mp4 --fps 60 --duration 3 -a voice.wav`（一次性，以 0/1/130/143 退出） |
| 擁有 Vite 伺服器 / 瀏覽器頁面，或需與其他非同步工作組合匯出的函式庫呼叫者 | `exportVideo({ url, outputPath, signal })` 自 `index.ts:6`                                                      |
| 自託管 URL 擷取靜態/快照或短片段                                            | `vecto-export https://…/scene.html`（遠端路徑，無 Vite）                                                        |

## 9. 失敗模式 — 哪個元件在發言

每個階段皆拋出識別階段的訊息；`cli.ts:140` 將其呈現為 `Export failed:` + `AggregateError` 並附有界 FFmpeg stderr 尾部（`ffmpeg-supervisor.ts:64` 64 KiB，在結束碼 `≠0` 時恆附加於 `ffmpeg-supervisor.ts:117`）。指派失敗時，請問：

| 失敗                                                       | 可能的元件                   | 決定性線索                                                                   |
| ------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| `width and height must be even for H.264`                     | `options.ts:58`                    | 提前，從非 FFmpeg 時                                                               |
| `Input file does not exist` / `Audio file does not exist`     | `options.ts:70` / `:84`            | 在 Chromium/Vite 之前                                                            |
| `Output directory does not exist / is not writable`           | `options.ts:90` / `:97`            | 在 Chromium/Vite 之前                                                            |
| `Vite did not expose a TCP address`                           | `input-target.ts:106`              | 本地進入點，埠 0 綁定                                                        |
| `Failed to start FFmpeg`                                      | `ffmpeg-supervisor.ts:73`          | `spawn` `error` 事件                                                           |
| `FFmpeg exited before input completed`                        | `ffmpeg-supervisor.ts:115`         | 提早退出，包含 stderr 尾部                                                |
| `FFmpeg exited with code N: …` + stderr 尾部                  | `ffmpeg-supervisor.ts:117`         | `pix_fmt` / `yuv420p` / `libx264` 錯誤設定                                     |
| `FFmpeg stdin failed` / `EPIPE`                               | `ffmpeg-supervisor.ts:80` / `:145` | 已摧毀管線，匯出中無節制的 `write`                                 |
| `FFmpeg did not exit after SIGTERM and SIGKILL`               | `ffmpeg-supervisor.ts:222`         | 楔住，僅無訊號的 `finish()`                                              |
| `No canvas found`                                             | `export-session.ts:93`/`102`       | 頁面中遺漏或隱藏的 `<canvas>`                                        |
| `window.vectoScene must provide callable stop() and step(dt)` | `export-session.ts:71`             | 頁面契約未及時暴露                                               |
| `Video export cleanup failed` (AggregateError)                | `export-session.ts:188`            | 主要錯誤後 `browser.close` / `target.close` / `output.cleanup` 拋出 |
| `Failed to install staged output…`                            | `staged-output.ts:126`             | `ATOMIC_MOVE` 兩步重命名競爭                                              |

上方列表並非捏造：每個字串皆逐字存在於給定的 `{file,}:line`。

## 10. 測試匯出器及其邊緣

匯出套件在無真實 Chromium 或 Vulkan 實例下測試——每個外部皆為經 `ExportSessionDependencies`（`export-session.ts:27`）/ `FfmpegDependencies`（`ffmpeg-supervisor.ts:21`）/ `InputTargetDependencies`（`input-target.ts:29`）/ `CliRuntime`（`cli.ts:11`）注入的 `*Like` 偽造。那些偽造所斷言：

- `packages/video-exporter/test/export-session.test.ts:30` `fixtures` 驅動 `scene.stop/ reset/ step`、`inputTarget.close`、`StagedOutput` create/commit/cleanup、`browser.newPage`、`FfmpegSupervisor.write/finish/terminate` 與 `progress.{start,update,stop}` 作為字串 `events`，斷言以 `indexOf` / `includes` 查詢（`:154` 重置時機、`:169` `progress.stop` 存在、`:185` 有序步驟、`:239` FFmpeg 前的無效契約）。
- 取消由在之前或迴圈中中止的 `AbortController` 建模（`export-session.test.ts:295` `controller.abort('stop now')`）——`throwIfAborted` 檢查（`export-session.ts:147`/`157`）作為被抑制的額外 `step`/`write` 影格可見。
- `test/cli.test.ts` 驅動 `parseArgs` 驗證（`cli.ts:54` 無效參數 → `1`，`cli.ts:82` 額外位置參數 → `1`）與 `CliRuntime.once/off` 訊號接縫（`cli.ts:123`/`142`）。
- `test/staged-output.test.ts` 驅動 `rename`/`rm`/`readdir` 偽造（`staged-output.ts:6` 相依）以觸及 `EEXIST/EPERM → backup → install → restore` 階梯（`staged-output.ts:108`/`112`/`119`）與孤兒回收掃描（`staged-output.ts:42`/`82`）。

匯出器可驅動的最小頁內場景（來自 `packages/video-exporter/test/fixtures/two-frame-scene.ts:8`）：

```ts
import { Scene } from '@vectojs/core';
const scene = new Scene(document.querySelector('canvas')!);
// ... 組裝實體、動畫器、彈簧/tween — 皆自 dt 驅動 ...
(window as unknown as { vectoScene?: unknown }).vectoScene = {
  stop: () => scene.stop(),
  step: (dt: number) => scene.step(dt), // Scene.ts:3423 — 固定步進
  reset: () => {
    /* 若你在載入期間動畫則回到 t=0 */
  },
};
```text

從未呼叫 `scene.start()` 的場景除此包裝器外無需 `stop`/`reset`——它們保持靜止直至匯出器驅動它們（`demo/data-chart.ts:227`/`ml-descent.ts:219` 模式）。

## 11. 陷阱

- **忘記 `window.vectoScene`**：頁面載入，匯出器等待 10 秒（`export-session.ts:61`），逾時。永遠在 `scene.start()` 前設定它或同步暴露它（`demo/data-chart.ts:222` `window.vectoScene = scene` 於 start 前）。
- **無 `reset` 的載入時狀態**：intro tween 具影格 0 抖動（`export-session.ts:78` 基準非確定性，`#646`）。新增 `reset()`。
- **牆鐘動態**：`tick` 回呼中的 `Date.now()` 抵消固定步進。僅經狀態或已播種模擬狀態貫穿 `dt`。
- **奇數尺寸**：靜默通過驗證將遲後編碼並以不透明 FFmpeg stderr 失敗。`options.ts:58` 提前拒絕。
- **假設「無音軌」表示「靜默輸出」**：僅在省略 `audioPath` 時匯出為靜默（`options.ts:16` *「畫布管線本身永不產生聲音」*）；傳遞錯誤路徑在 Chromium 前失敗（`options.ts:80`），因此不良音訊非遲來驚喜。
- **無清理的終止**：在備份重命名與安裝間的 `kill -9`（`staged-output.ts:35`）留下擱淺的 `.vecto-*`。下次匯出的 `staleSweep`（`staged-output.ts:42`/`55` + `export-session.ts:122` 建構）為復原——勿在匯出中手動刪除 `.vecto-*` 檔案。
- **假設瀏覽器匯出在無 FFmpeg/Chromium 的 CI 上可運作**：供應正確套件並在自行發布 Chromium 時設定 `PUPPETEER_EXECUTABLE_PATH`（`browser.ts:49` / `README.md:10` 安裝註記）。
- **關鍵**：上方所有參考皆對固定於 `/mnt/data/Workspace/Projects/vectojs/vectojs` 的倉庫經 grep 驗證（`options.ts`、`export-session.ts`、`browser.ts`、`ffmpeg-supervisor.ts`、`input-target.ts`、`staged-output.ts`、`abort-error.ts`、`cli.ts`、`Scene.ts:3423`/`5609`/`1114`、`SKILL.md`、`references/export-recipes.md`）。

## 12. 檢查清單 — 撰寫確定性匯出

- [ ] 頁面暴露具可呼叫 `stop` 與 `step(dt)` 的 `window.vectoScene`（`export-session.ts:71` 契約）。
- [ ] 若場景渲染載入時狀態，它亦暴露 `reset()`（`export-session.ts:84` 影格 0 修正，`#646`）。
- [ ] 場景在匯出模式下永不呼叫 `scene.start()`，或 `stop()` 在首次擷取前可靠取消其迴圈（`demo/math-teaching.ts:9`/`161` 時鐘註記，`export-session.ts:75` 驗證後立即的 `scene.stop()`）。
- [ ] 所有動畫器積分傳遞至 `step` 的 `dt`——`tick`/彈簧/tween 內無 `Date.now` / 牆鐘讀取（`Scene.ts:3423` 固定步進路徑 vs `Scene.ts:5609` 箝制的牆鐘 `dt`）。
- [ ] 隨機性（若有）自 `frame` 或確定性 prng 播種——`Math.random()` 每影格將跨執行閃爍。
- [ ] 字型/Msdf/著色器資源在 t=0 前載入（在 `packages/text/src/fontMetrics.ts:82` 處無未等待的 `registerFontMetrics` / `isReady` 競爭）。
- [ ] 匯出幾何為偶數（`options.ts:58` `2 | dimensions`，`yuv420p` 要求）且 `deviceScaleFactor: 1` 被假設用於解析度主張（`export-session.ts:128`）。
- [ ] 中止傳播（API 上的 `signal`、CLI 中的 SIGINT/SIGTERM）且每個資源皆具注入的 `close/terminate/cleanup`（`export-session.ts:175` + `ffmpeg-supervisor.ts:249`）。
- [ ] 可選音訊為檔案路徑（`options.ts:78` `audioPath` 啟動前檢查），而非即時擷取——無它則匯出的畫布影片為靜默（`options.ts:14` 靜默註記）。

## 關聯

- **Boss 06（VMT 執行期）**擁有 `loop`（`Scene.ts:5569`）↔ `step`（`Scene.ts:3423`）對偶性，以及為何 rAF 迴圈箝制而 `step` 不。
- **Boss 07（渲染器）**擁有 `page.setViewport` 上的 `deviceScaleFactor: 1`（`export-session.ts:128`）以及為何當擷取時鐘固定時剔除保持一致。
- **Boss 08（WASM）**在此不可見——任何即時 WASM 儲存 vs JS 一致性必須在固定步進前進下逐影格保持，但匯出器永不對其特例處理。
- **Boss 01/02（選取 + 文字）**提供字型/形狀準備，其就緒必須在 t=0 前等待——否則影格 0 包含競爭而非擷取。
- **Boss 11+ 產品介面（畫布應用）**為 `@vectojs/video-exporter` 實際使用處——將它們轉介至此 Boss，而非相反。

## 參考

- `packages/video-exporter/src/index.ts:6` — 公開 `exportVideo(options)` 進入點，唯一匯出符號
- `packages/video-exporter/src/options.ts:40` — `normalizeOptions` + 幾何/音訊/目錄驗證 + `Math.ceil(fps*duration)`/`dt` 推導
- `packages/video-exporter/src/export-session.ts:111` — `ExportSession.run` 生命週期、`validateAndStopScene` 契約、分階段 `output.path` + 迴圈 `page.evaluate(step(dt))` + `captureFrame`
- `packages/video-exporter/src/input-target.ts:48` — `resolveInputTarget` Vite vs 遠端分支、合成 `<canvas>` 外殼 + `transformIndexHtml`
- `packages/video-exporter/src/browser.ts:45` — `resolveBrowserLaunchOptions` 可執行檔/沙盒參數
- `packages/video-exporter/src/ffmpeg-supervisor.ts:34` — `FfmpegSupervisor` 有界 stderr、stdin EPIPE 守衛、`write`/`finish`/`terminate`、`SIGTERM→SIGKILL` 升級
- `packages/video-exporter/src/staged-output.ts:27` — 原子分階段檔案 + 備份 + `sweepStaleFiles` 孤兒回收
- `packages/video-exporter/src/abort-error.ts:6` — `abortError(signal)` 共用 `AbortError` 工廠（`#661`）
- `packages/video-exporter/src/cli.ts:50` — `runCli` 參數解析、`130`/`143` 訊號結束碼、`注入 CliRuntime`
- `packages/core/src/tree/Scene.ts:3423` — `step(dt)` 固定步進契約：無條件渲染、無箝制 `dt`、`frameStats` 零、度量陷阱註記
- `packages/core/src/tree/Scene.ts:5569` / `5609` / `5636` / `1114` — `loop` 牆鐘 `dt`、`100/cap` 對齊、`MAX_FRAME_DT=100` 箝制
- `packages/video-exporter/package.json:10` — `dist/cli.js` + `chmod 0755` 建構、`bin: vecto-export`、`main: dist/index.js`
- `packages/video-exporter/demo/*.ts:222` / `test/fixtures/two-frame-scene.ts:8` / `test/export-session.test.ts:154` — 場景契約使用處
- `.agents/skills/vectojs-video-exporter/SKILL.md:1` — 匯出器 skill（0.2 契約 + 沙盒策略 + 常見錯誤）
- `.agents/skills/vectojs-video-exporter/references/export-recipes.md` — CLI/API 片段
````
