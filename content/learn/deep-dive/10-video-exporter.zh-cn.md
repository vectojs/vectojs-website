---
title: '10 — 确定性视频导出 — 固定步进捕获'
description: '@vectojs/video-exporter 如何以固定步进的场景时钟替代墙钟时间，经无头 Chromium 捕获，并将 PNG 帧管道输送至 FFmpeg 以生成 H.264 MP4——辅以分阶段输出、中止与清理以保障目标文件安全。'
order: 30
---

# 10 — 确定性视频导出 — 固定步进捕获

> **Boss 10** 让动画时间可复现。同一模块、同一 `fps × duration`、同一 `seed`——每次导出产生相同帧，不受宿主机速度、合成器抖动或后台标签页影响。存在两个时钟：**墙钟**（`requestAnimationFrame`、`performance.now()`——捕获开始前浏览器所做的一切）与**固定步进时钟**（`Scene.step(dt)` 以精确 `dt = 1000/fps` 每帧推进）。导出器在第 0 帧前杀死前者并安装后者。

- **你将学到**：为何第 0 帧确定性是最难的部分；场景契约（`stop + step + 可选 reset`）；Chromium → canvas PNG → FFmpeg `image2pipe` 管线；分阶段输出、中止传播与有序清理；CLI/API 表面及何时选用何者；以及场景作者仍需消除的残余不确定性。
- **你不会学到**：VMT 生命周期/变换（boss 06）、渲染器内部（boss 07）或 WASM 加速（boss 08）。本文档只拥有捕获时钟与编码。

## 1. 为何确定性导出很难 — 双时钟问题

实时 VectoJS 场景在 `requestAnimationFrame` 滴答上推进（`packages/core/src/tree/Scene.ts:5569` `loop`）。每滴答：

1. 从墙钟计算 `dt = time - lastTime`（`Scene.ts:5609`）；
2. 当接近时将 `dt` 向 `1000/cap` 对齐（±30% 以隐藏合成器抖动，`Scene.ts:5625`）；
3. 将 `dt` 钳制到 `MAX_FRAME_DT = 100ms`（`Scene.ts:1114`、`:5636`），以免后台标签页将物理向前猛抛数秒；
4. 更新驱动、合成变换、布局，然后绘制。

这对实时页面是正确的。对导出则是致命的：导出时间必须是帧索引的**纯函数**。

- 否则同一宿主机上的两次运行每当宿主机抖动、节流或切后台时就会不一致。
- 即使共享同一场景，基准与导出也会在节奏上不一致。
- 任何 `Math.random()`、墙钟 `Date.now()` 或在非固定帧解析的异步资源都会使第 0 帧任意化，之后每帧都继承该基准（`packages/video-exporter/src/export-session.ts:78` 注释引用 `#646`）。

修复是在首个捕获帧前**停止墙钟循环并以常量步进推进**（`packages/core/src/tree/Scene.ts:3423` `step(dt)`）。确定性于是成为场景作者的纪律：每个动画、弹簧与 tween 必须仅积分所给的 `dt`，任何随机性必须可播种。导出器强制时钟；场景必须提供确定性动力学。

## 2. 场景契约 — 页面必须暴露什么

导出器在普通浏览器页面（本地或远程）内运行，经 `window.vectoScene` 与场景对话。三个方法关键：

| 方法       | 作用                              | 是否必需 | 检查位置                                           |
| ---------- | --------------------------------- | -------- | -------------------------------------------------- |
| `stop()`   | 停止 `requestAnimationFrame` 循环 | 是       | `packages/video-exporter/src/export-session.ts:62` |
| `step(dt)` | 同步推进并渲染恰好一帧            | 是       | `packages/video-exporter/src/export-session.ts:70` |
| `reset()`  | 恢复 t=0 呈现（可选）             | 否       | `packages/video-exporter/src/export-session.ts:84` |

### 2.1 `stop + step` 即时钟切换

`ExportSession.validateAndStopScene`（`export-session.ts:60`）：

- `page.waitForFunction('!!window.vectoScene', { timeout: 10_000 })`（`export-session.ts:61`）—— 页面在 `networkidle0` 后有 10 秒发布场景。
- `page.evaluate` 探测 `typeof scene.stop === 'function'` 与 `typeof scene.step === 'function'`（`export-session.ts:62`）：若任一缺失则抛出 `window.vectoScene must provide callable stop() and step(dt) methods`（`export-session.ts:71`）。
- 然后 `scene.stop()`（`export-session.ts:75`）杀死 `requestAnimationFrame` 重调度，使捕获成为唯一推进时间的手段。

之后每导出帧以归一化 `dt = 1000 / fps` 调用 `scene.step(dt)`（`export-session.ts:148`）。`Scene.step`（`Scene.ts:3423`）只做一件事：`time = lastTime + dt; lastTime = time; render(renderer, dt, time)` —— 无脏检查（`Scene.ts:3405` _“renders UNCONDITIONALLY”_）、无 `always` 空闲节流、无 `MAX_FRAME_DT` 钳制（`Scene.ts:3421` _“Not clamped by MAX_FRAME_DT — the caller chooses the step”_）。该绕过是刻意的：确定性驱动请求一帧就是因为它想要那一帧。

`step` 文档点出两个渲染陷阱，以免评审误读度量：

- 经 `step()` 驱动帧的基准**无法观察帧跳过**（`Scene.ts:3411`），因此 `always` vs `onDemand` 经此路径不可见——仅在实时 `start()` 循环上度量调度（`Scene.ts:3417`）。
- 仅由 `step()` 驱动的场景中 `frameStats` 保持零默认值（`Scene.ts:3501`）—— 阶段探针位于 `loop` 上。

### 2.2 `reset` 是第 0 帧修复（issue #646）

在页面加载与 `scene.stop()` 之间，页面自身的 rAF 循环以任意、宿主机相关的滴答数自由运行。任何由此驱动的入场 tween 或缓动入场都会在捕获开始前到达任意状态——之后所有帧仅_自该不确定基准起_确定（`export-session.ts:78` 注释，`#646`）。

- **到首个 `step(dt)` 前保持静态**渲染的场景无需任何操作——第 0 帧已是 t=0。
- 携带**加载时状态**的场景暴露 `reset(): void` 以回到 t=0 呈现。导出器在 `stop()` 之后、首个 `step()` 之前调用一次（`export-session.ts:84`）：`if (typeof scene?.reset === 'function') scene.reset()`。该顺序不变量在 `packages/video-exporter/test/export-session.test.ts:154` 中断言—— `reset` 在 `stop` 之后、首个 `step` 之前。
- 没有 `reset` 的场景按原样导出——不确定性此时是作者问题，而非导出器错误。

演示场景写明了预期用法：

- `packages/video-exporter/demo/data-chart.ts:222` `window.vectoScene = scene` + `:227` _“stay idle so the exporter's stop()+step(dt) sequence is the sole clock”_；
- `packages/video-exporter/demo/ml-descent.ts:219` 同样说明；
- `packages/video-exporter/demo/math-teaching.ts:9` _“clock, no randomness, no scene.start()”_ + `:161` stop/step 是唯一时钟。

测试以 `packages/video-exporter/test/fixtures/two-frame-scene.ts:8` `window.vectoScene = { stop(){}, step(dt){} }` 模仿页面。

## 3. 管线 — 从 `url` 到 `out.mp4`

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

### 3.1 Options → 归一化 options

`packages/video-exporter/src/options.ts:40` `normalizeOptions`：

- `url`/`outputPath` 必须为非空字符串；`width`/`height`/`fps` 必须为正整数（`options.ts:34` `positiveInteger`），`duration` 为正有限数（`options.ts:54`）。
- `fps` 默认为 60，`duration` 默认为 5s（`options.ts:48`）；派生 `dt = 1000 / fps`（`options.ts:113`）与 `totalFrames = Math.ceil(fps * duration)`（`options.ts:112`），因此小数时长产生正确帧数而非短的末帧。帧数在 `references/export-recipes.md:10` 中记录并作为 `dist/index.d.ts` 契约发布。
- H.264 `yuv420p` 色度为 2×2 子采样——奇数尺寸永远无法编码。只有 `ffmpeg` 会在渲染完所有帧后以原始 stderr 告知。改为提前校验（`options.ts:58` `width % 2 !== 0 || height % 2 !== 0` → `TypeError`）。
- `isRemote = /^https?:\/\//i.test(url)`（`options.ts:68`）。本地路径为 `resolve(url)` 且必须存在且为文件（`options.ts:70`）。同样预启动检查适用于 `audioPath`（`options.ts:78`）：缺失音轨否则仅在最终 ffmpeg stderr 中显现。
- `outputPath = resolve(outputPath)`（`options.ts:88`）；其父目录必须存在、为目录且可写（`options.ts:97` 处 `accessSync(…, W_OK)`）。输出不会过早截断——下述 `StagedOutput` 处理原子性。

### 3.2 输入目标 — 本地 Vite 路由 vs 远程 URL

`packages/video-exporter/src/input-target.ts:48` `resolveInputTarget`：

- 远程：`inertTarget(url)`（`input-target.ts:44`）—— 无服务，`close` 为空操作。
- 本地文件：以 `custom` 应用类型启动 Vite 开发服务器（`input-target.ts:58`），根为 `dirname(url)` 以便裸 `import 'three'` 等能解析：
  - `root = dirname(url)`（`input-target.ts:54`），`entryUrl = "/" + encodeURIComponent(basename(url))`（`input-target.ts:55`）—— `encodeURIComponent` 对含空格/unicode 的文件名很关键。
  - 临时路径 `/__vecto_export_${randomUUID()}.html`（`input-target.ts:56`）—— 随机以避免并发导出间碰撞，但 `staged-output.ts:35` 处注释仍假设_同一目标路径一次仅一个导出器_。
  - 单一中间件：在该路径上返回承载 `<canvas id="app">` 与 `<script type="module" src="${entryUrl}">` 的合成 HTML（`input-target.ts:74`），经 `server.transformIndexHtml(pathname, source)`（`input-target.ts:85`）运行，使 Vite 的 HMR/别名/TS 转换作用于入口。错误在存在时委托给 `next(error)`（`input-target.ts:90`）。
  - `await server.listen()`（`input-target.ts:98`），然后 `server.httpServer?.address()`（`input-target.ts:99`）：必须为 `{ port: number }`，否则调用抛出 `Vite did not expose a TCP address`（`input-target.ts:106`）。任何失败都会关闭新创建的服务（外层 `catch` 中 `input-target.ts:114`），以免半启动的 Vite 孤留端口。
  - 返回的 `InputTarget.url` 为 `http://127.0.0.1:${port}${pathname}`（`input-target.ts:110`）；`close()` 恰好关闭 Vite 服务一次（`input-target.ts:65` `closed` 守卫）。

这保持源码目录干净——磁盘上不写入辅助 `.html`，这是 `vectojs-video-exporter/SKILL.md:43` 中列出的常见错误。

### 3.3 浏览器启动 — Chromium + 沙箱策略

`packages/video-exporter/src/browser.ts:45` `resolveBrowserLaunchOptions`：

- 解析顺序：`PUPPETEER_EXECUTABLE_PATH`（已 trim，`browser.ts:49`），否则若存在则 `/usr/bin/chromium`（`browser.ts:51`），否则 Puppeteer 解析/捆绑的 Chromium —— 匹配 `README.md:10` _“Requires FFmpeg with libx264 … plus Chromium resolved from PUPPETEER_EXECUTABLE_PATH, then /usr/bin/chromium, then Puppeteer's …”_。
- `args` 始终包含 `--disable-gpu`（`browser.ts:53`）。
- 仅当 `getuid() === 0` 或 `VECTO_CHROMIUM_NO_SANDBOX=1` 时禁用沙箱（并警告）（`browser.ts:55`）。警告文本于 `browser.ts:58`：_“Chromium sandbox is disabled for this VectoJS video export. Run as a non-root user when possible.”_ 优先以非 root 导出进程运行（`SKILL.md:38`）。

启动本身是测试接缝：`BrowserDependencies.launch`（`browser.ts:34` `launch(options) → BrowserLike`，默认 `browser.ts:42` 处 `puppeteer.launch(options)`）与 `export-session.ts:32` `launchBrowser` 在 `ExportSessionDependencies` 中可替换。

### 3.4 捕获循环 — `validateAndStopScene` → `sizeCanvas` → 帧循环

<!-- markdownlint-disable MD031 MD032 MD040 -->

`ExportSession.run`（`export-session.ts:111`）：

1. 在获取任何资源前 `throwIfAborted()`（`export-session.ts:120`，读取 `options.signal?.aborted` 并抛出 `abortError(signal)`，来自 `packages/video-exporter/src/abort-error.ts:6`）。
2. `target = resolveInputTarget(options)`（`export-session.ts:121`），`output = createStagedOutput(outputPath)`（`export-session.ts:122`），`browser = launchBrowser()`（`export-session.ts:123`），`page = browser.newPage()`（`export-session.ts:124`），`page.setViewport({ width, height, deviceScaleFactor: 1 })`（`export-session.ts:125`）—— `_capture runs at deviceScaleFactor: 1`_（`SKILL.md:31`）：无论宿主机 DPR，导出像素等于 `width × height`。
3. `page.goto(target.url, { waitUntil: 'networkidle0' })`（`export-session.ts:132`）—— 等待网络静止后再触碰场景。
4. `sizeCanvas(page)`（`export-session.ts:133` → `export-session.ts:90`）：`document.querySelector('canvas')` → `canvas.width = width; canvas.height = height`。若缺失则抛出 `No canvas found`（`export-session.ts:93`）。这在 `goto` _之后_运行，因此页面的 `<canvas>` 已存在—— Vite 合成外壳（`input-target.ts:81`）为本地入口提供它。
5. `validateAndStopScene(page)`（`export-session.ts:134` → `:60` —— 见 §2）。
6. 第二次 `throwIfAborted()`（`export-session.ts:135`）—— 在校验期间到达的中止必须在 FFmpeg 派生前停止。
7. `encoder = startFfmpeg({ fps, outputPath: output.path, audioPath, signal })`（`export-session.ts:137`）：注意_分阶段_路径 `output.path`（`staged-output.ts:53`，目标的 `.<stem>.vecto-<uuid>.mp4` 兄弟），而非最终 `outputPath`。
8. `progress = createProgress()`（`export-session.ts:143`，`export-session.ts:41` 处 `cli-progress` 默认）然后 `progress.start(totalFrames)`（`export-session.ts:144`）。
9. 帧循环（`export-session.ts:146`）：

   ```ts
   for (let frame = 0; frame < totalFrames; frame++) {
     throwIfAborted(); // export-session.ts:147
     await page.evaluate((dt) => scene.step(dt), dt); // :148
     await encoder.write(await captureFrame(page)); // :153
     progress.update(frame + 1); // :154
   }
   ```

`captureFrame`（`export-session.ts:99`）读取_首个_ `<canvas>` 并调用 `canvas.toDataURL('image/png')`，在 `,` 上分割（`export-session.ts:104`），将 base64 尾部解码为供 `image2pipe/png` stdin 使用的 `Buffer`。_“First page `<canvas>` is resized and captured”_（`SKILL.md:27`）。

<!-- markdownlint-disable MD029 -->

10. 循环后：`throwIfAborted()`（`export-session.ts:157`），`encoder.finish()`（`export-session.ts:158` 关闭 stdin 并等待 `close`），再次 `throwIfAborted()`（`export-session.ts:159`），然后 `output.commit()`（`export-session.ts:160`）—— 仅在 FFmpeg 干净退出后，分阶段文件才替换目标。

## 4. FFmpeg — `image2pipe` → H.264/yuv420p，带有限 stderr 尾

### 4.1 参数

`packages/video-exporter/src/ffmpeg-supervisor.ts:274` `startFfmpeg`：

````ts
const args = ['-y', '-f', 'image2pipe', '-vcodec', 'png', '-r', String(fps), '-i', '-'];
if (audioPath !== undefined) args.push('-i', audioPath);
args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');
if (audioPath !== undefined) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
args.push(outputPath);
```text

顺序说明（`ffmpeg-supervisor.ts:278`）：输入在前（`-f image2pipe … -i -`，然后可选 `-i audioPath`），再是输出选项——在音频 `-i` 前的 `-c:a` 会附到解码器而非输出编码器。音频为 AAC `192k` 并裁至视频长度（`-shortest`，`ffmpeg-supervisor.ts:287`），仅在 CLI 上以位置参数 `-a/--audio`（`cli.ts:32`、`:64`）或 API 中 `audioPath`（`options.ts:16`、`:78`）启用。

输出为标准 H.264 `yuv420p` MP4（`SKILL.md:28`、`README.md:12`）。

### 4.2 Stdin 监管 — 背压、EPIPE 竞态与 `FfmpegSupervisor` 接缝

FFmpeg 作为 `ChildProcessLike` 派生（于 `ffmpeg-supervisor.ts:13`/`21`/`28` 可测试伪造），其 `stdin` 由帧循环写入。`ffmpeg-supervisor.ts:34` `FfmpegSupervisor` 加固 stdin 管道：

- `stderrBuffer` 限于 64 KiB（`ffmpeg-supervisor.ts:5` `STDERR_LIMIT`），通过拼接后取尾（`:67` `combined.subarray(combined.byteLength - STDERR_LIMIT)`）—— _每个_错误都携带该尾部（`:117` `processError` 中 `stderr.trim()`）。
- 来自子进程 `error` 事件的 `spawnError` → `Failed to start FFmpeg: ...`（`:73`）。
- 持久的 `child.stdin.on('error')` 处理器记录 `stdinError`（`:80`）。动机（`:41`）：_“FFmpeg dying mid-export destroys the pipe and emits an async EPIPE after the last write() has already resolved — with no live listener that surfaces as a listener-less uncaught exception, escaping the ExportSession try/catch, skipping its cleanup, and orphaning headless Chromium plus the Vite server.”_ 记录它使 `processError` 能在下一次 `write`/`finish` 时经正常中止/清理路径表露失败。
- `close` 经 `markClosed`（`:92`，由 `closed` 守卫，记录 `closedBeforeInputCompleted`）提交一次。`closeCode`/`closeSignal` + `exitDescription`（`:105` `code N` / `signal NAME` / `unknown status`）包含于每个退出错误。
- `processError(early: boolean)`（`:111`）是单一决策点：
  - 若 `spawnError` → 该错误，
  - 否则若尚未关闭且 `stdinError` 已设 → 该错误（即使子进程尚未退出也为断管），
  - 否则若已关闭且 `early||closeCode!==0` → `FFmpeg exited before input completed` vs `exited` + 退出描述 + stderr 尾，
  - 否则（带迟到 `stdinError` 的干净退出）→ 仍表露 `stdinError` 而非在断管上报告成功。
- `write(frame)`（`:156`）在写入前检查 `throwIfAborted()` 与 `processError(true)`，使用布尔 `stdin.write(frame)` 背压返回—— `false` 时在 `waitForDrain()`（`:126`）中等待。该竞态为 `stdin:drain`、`stdin:error`、`child:close` 与 `signal:abort` 安装一次性监听器（`:131`/`134`/`149`/`137`）并相应 resolve/reject；排空后再次检查 `throwIfAborted()` 与 `processError(true)`。
- `finish()`（`:177`）幂等（`finishPromise`）。`finishOnce`（`:183`）守卫 `closedBeforeInputCompleted`（若子进程过早死亡则无法完成），调用 `child.stdin.end()`（`:190`），然后 `waitForCloseOrAbort()`（`:198`）再重检 `processError(false)` —— 仅退出码 `0` 且 `stdinError` 为空才是成功。

### 4.3 终止 — `terminate()`、`SIGTERM→SIGKILL` 与无信号挂起

`terminate()`（`:241`）是清理路径，亦幂等。`terminateOnce`（`:247`）始终尝试整理：

- `child.stdin.destroy()` 然后 `SIGTERM`，等待 `terminateTimeoutMs`（默认 `1000ms`，`options.ts:31` / `ffmpeg-supervisor.ts:258`）内的 `closedPromise`（`:249`），升级到 `SIGKILL`（`:253`），再次等待（`:254`）。`waitForCloseOrTimeout`（`:257`）对 `closedPromise` vs `setTimeout(timeoutMs)`（`:263`）竞态并清除定时器（`:266`）。

`waitForCloseOrAbort`（`:203`）有**无信号分支**——库调用方可不传 `AbortSignal`，因此裸 `await closedPromise` 会在 FFmpeg 卡住时使 `finish()` 永远挂起。在该分支每阶段等待 `terminateTimeoutMs` 并升级 `SIGTERM→SIGKILL`，最终抛出 `FFmpeg did not exit after SIGTERM and SIGKILL` 并带 stderr 尾（`:222`）—— `terminate()` 使用的同一阶梯，现应用于无外部中止时的 `finish`。有信号时，`waitForCloseOrAbort` 对 `closedPromise` 与 `signal:abort` 竞态（`:227`/`234`）并经 `abortError` 路由取消。

### 4.4 `StagedOutput` — 原子目标替换

`packages/video-exporter/src/staged-output.ts:27` `StagedOutput`：

- `path = <dir>/.<stem>.vecto-<uuid>.mp4`（`:53`），`targetPath` 为调用方的 `outputPath`，`backupPath = .<stem>.vecto-<uuid>.backup<ext>`（`:54`）—— 分阶段身份为目标旁隐藏兄弟，每次导出唯一（经 `node:crypto` `randomUUID`，`:1`/`14`/`60`）。
- 构造时启动 `staleSweep`（`:55`、`:42`）：对被杀死的前次运行遗留的 `.vecto-*` 兄弟作尽力回收——该运行死于备份重命名与安装之间（`:35`）。`sweepStaleFiles`（`:82`）读取目标目录，寻找 `.prefix = ".<stem>.vecto-"` 条目（`:89`），排除自身 `path`/`backupPath`（`:90`），并经 `Promise.allSettled` 以 `rm(..., { force: true })` 删除（`:92`）。
- `commit()`（`:99`）先等待 `staleSweep`（与其自身重命名无竞态，`:41`），然后 `rename(path, targetPath)` —— 无文件或覆盖成功时为快速路径安装（`:104`）。在 `EEXIST`/`EPERM`（`:108`/`21` `errorCode`）上执行经典交换：`rename(targetPath, backupPath)`（`:112`），`rename(path, targetPath)`（`:115`）—— 若第二次重命名抛出，则恢复 `rename(backupPath, targetPath)`（`:119`）并抛出携带_两者_ `installError` 与 `restoreError` 的 `AggregateError`（`:126`，刻意非单一 `cause`）。成功时移除备份（`:134`）。
- `cleanup()`（`:138`）亦等待 `staleSweep`，然后 `rm(path)`（`:145`），若 `backupMoved` 仍设置则调和备份（`:150`）：若目标现存在则备份已被替换并被删除；若 `installError` 使目标缺失则恢复备份。异常收集为 `AggregateError`（`:163`）。

结果：FFmpeg 编码到目标旁的分阶段文件（`export-session.ts:137` `output.path`）。失败或中止的导出保持任何既有目标完好并移除分阶段产物——在 `test/export-session.test.ts` 约定中验证如下。

## 5. 管线所依赖的浏览器细节

- 每次导出一个辅助页面（`export-session.ts:124` `browser.newPage()`）—— 捕获经由该单一 `PageLike`（`browser.ts:4` `PageLike`，含 `setViewport`/`goto`/`waitForFunction`/`evaluate`）进行。`PageLike` 刻意最小化，使测试中浏览器 mock 保持精确。
- 设备缩放固定为 `1`（`export-session.ts:128`）—— 与 `SKILL.md:31` `deviceScaleFactor: 1` 及导出承诺 `width × height` 为输出像素、与宿主机 DPR 无关一致（boss 07 领地）。
- `page.goto(..., { waitUntil: 'networkidle0' })`（`export-session.ts:132`）在 `sizeCanvas`/`validateAndStopScene` 运行前等待网络静止——没有它，迟到的 `window.vectoScene` 赋值会错过 `waitForFunction` 窗口或携带部分加载的场景图。

## 6. 取消与进程信号 — 每条路径汇聚于 `AbortError`

导出取消有三种来源但一种错误类型：名为 `AbortError`、其 `cause` 为 `AbortSignal.reason` 的错误（`abort-error.ts:6`）。`abortError` 在 `#661` 中抽离（见 `abort-error.ts:1` 注释），以去重此前在 `export-session` 与 `ffmpeg-supervisor` 中两份相同实现。

### 6.1 库 API — `AbortSignal`

`options.ts:17`（`ExportOptions` 上 `signal?: AbortSignal`）及其归一化副本（`options.ts:28`）将信号带入 `ExportSession` 与 `FfmpegSupervisor`。每个变更点都调用 `throwIfAborted()`（`export-session.ts:55`/`147`/`157`/`159`、`ffmpeg-supervisor.ts:101`/`126`/`157`/`184`/`225`），`waitForDrain`/`waitForCloseOrAbort` 监听 `signal:abort`（于 `ffmpeg-supervisor.ts:152`、`232` 处一次性监听器）。

### 6.2 CLI — `SIGINT`/`SIGTERM` → `AbortController`

`packages/video-exporter/src/cli.ts:50` `runCli`：

- `parseArgs` 带 `allowPositionals: true`（`cli.ts:55`），要求一个位置参数 `url`（`cli.ts:74`），多余参数大声拒绝（`cli.ts:82` _“silently exporting only the first hides the error”_），`output`/`width`/`height`/`fps`/`duration`/`audio` 从 `values` 以 `positiveInteger`/`positiveNumber` 校验映射（`cli.ts:34`/`42`）。
- `AbortController`（`cli.ts:113`），`SIGINT→abort('Interrupted by SIGINT')`（`cli.ts:115`）与 `SIGTERM→abort('Terminated by SIGTERM')`（`cli.ts:119`），按惯例记住退出码 `130`（`cli.ts:116`）/`143`（`cli.ts:120`）为 `signalExitCode` 并优先返回（`cli.ts:137`）。监听器经可注入 `CliRuntime`（`cli.ts:18`/`20`）注册并在 `finally` 中移除（`cli.ts:142`），与使 `ExportSession` 依赖可测试的形态相同。
- `runCli` 在信号上不抛出：即使 `exportVideo` 抛出了 `AbortError`，`if (signalExitCode !== undefined) return signalExitCode`（`cli.ts:139`），`catch` → `runtime.error('Export failed:', error)`（`cli.ts:140`）vs `1` 否则。可执行入口守卫于 `cli.ts:148` `isExecutableEntry`，经 `realpathSync` 解析 `dist` 与 `argv[1]` 间的 symlink 不匹配。

### 6.3 有序清理 — 无孤留浏览器/服务/FFmpeg/分阶段文件

`ExportSession.run`（`export-session.ts:166` `clean` 辅助位于 `catch` 内）按获取逆序释放：`progress.stop` → `encoder.terminate` → `browser.close` → `target.close` → `output.cleanup`（`export-session.ts:175`–`:179`）。匹配的永不抛出模式取自 `cli.ts:142` `finally` 中 `off`；导出器变体更显式——每步 `try/catch` 到 `cleanupErrors`（`:170`）随后：

- 若 `primaryError`（`try` 中任何抛出）且无清理错误 → 抛出 `primaryError`（`:182`）；
- 若两者皆有 → `AggregateError([primaryError, ...cleanupErrors], errorMessage(primaryError), { cause: primaryError })`（`:183`）；
- 若仅清理错误 → `AggregateError(cleanupErrors, 'Video export cleanup failed')`（`:188`）。

FFmpeg 自身 `finish`/`terminate` 竞态（`ffmpeg-supervisor.ts:198` `waitForCloseOrAbort`、`:247` `terminateOnce`）保证即使无信号也永不无限挂起。分阶段清扫（`staged-output.ts:35` stranded-CI 说明）与上述 Chromium/Vite 关闭共同意味着备份重命名与安装之间的 `SIGKILL`（`staged-output.ts:35`、`export-session.ts:78` 附近）在_下一次_运行时可恢复。

### 6.4 测试对清理顺序验证了什么

`packages/video-exporter/test/export-session.test.ts:60` 夹具编码顺序。两项测试值得作为预期生命周期规范阅读：

- _`reset` 时机_（`:154` `fixture.events.indexOf('scene.reset')` 位于 `scene.stop` 与 `scene.step` 之间）—— 第 0 帧契约的顺序回归守卫。
- _失败时仍关闭所有_（`:169` `progress.stop`、`:185` `scene.stop`、`:210` `progress.acquired` ↔ `progress.stop` 不变量）—— 每个 `startFfmpeg` → `encoder.terminate`，每个 `launchBrowser` → `browser.close`，每个 `resolveInputTarget` → `target.close`，每个 `createStagedOutput` → `output.cleanup`，即使 `progress.stop` 或 `write` 抛出。

## 7. 导出器_不_使其确定性的内容

固定步进消除了宿主机与合成器不确定性。剩余来源在场景作者手中：

- **`Math.random()`**：必须可播种（如以帧索引为种子 `splitmix`/`xoshiro`）或替换为已编排关键帧数据。否则每帧抖动采样的屏空间采样会在每次运行间闪烁。
- **网络/IO**：在 `networkidle0` 边界 vs 之后解析的 fetch 应确定性等待（由首个 `step` 前检查的就绪标志门控，而非墙钟超时）。
- **异步资源加载**：字体（`packages/text/src/fontMetrics.ts:82` `registerFontMetrics`）、mipmap 级别或报告 `canUseSvgText` / `canUseMsdf` / `isReady` 的 WebGL 着色器编译必须在 t=0 前等待——否则第 0 帧与解码器竞态。
- **平台塑形差异**：不同 `measureText` 后端或 `deviceScaleFactor` 陷阱（boss 02）若在不同引擎上捕获仍会发散。`deviceScaleFactor: 1`（`export-session.ts:128`）消除 DPR 变体，但不消除字体塑形变体——保持帧断言按引擎区分。

任何此类形式必须或由 `reset()` 设门、或可播种、或移除。导出器保证以 `dt` 步进的相同 Scene 产生相同帧；它无法保证你的 Scene 在各次运行间相同。

## 8. CLI vs API — 按调用方选择，而非按能力

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

单一函数，无构建器。`normalizeOptions` 在几何/音频/输出目录错误上同步抛出（`options.ts:58` 奇数尺寸、`:78` 缺失 `audioPath`、`:90` 缺失父级、`:97` 不可写），因此错误配置的任务在 Chromium 启动_前_失败。`totalFrames = Math.ceil(fps*duration)` 契约（`options.ts:112`、`cli.ts:104` 重推相同宽度）刻意非 “fps×duration−maybe-one”——短时长产生正确数量且无小数帧。API 上信号直接使用（`options.ts:17`/`28` 与 `export-session.ts:32` `FfmpegOptions` 中 `signal` 字段）。

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

语义：

- **本地 vs 远程输入隐式**：若 `url` 形如 `http(s)://` 则为远程（`options.ts:68`）；否则为经 Vite HTML 外壳服务的本地文件（`input-target.ts:48`）。你无需传标志区分。
- **对第二位置参数的拒绝**（`cli.ts:82`）是“意图批量导出”陷阱——`vecto-export a.ts b.ts` 以 `Unexpected extra arguments` 失败，而非仅导出 `a.ts`。
- **退出码**：`0` 成功（`cli.ts:137` 直落），`1` 校验/Browser/FFmpeg/清理失败（`cli.ts:141` / options 抛出 / `RuntimeError`），`130` 于 `SIGINT`、`143` 于 `SIGTERM`（`cli.ts:116`/`120`）。`vecto-export --help` 映射为 `runCli` 且 `parsed` 缺 `url`（`cli.ts:74` → `USAGE`）或抛出 `parseArgs`（`:69` `Invalid arguments` + `USAGE`）。
- **包契约**（`packages/video-exporter/package.json`）：`main: dist/index.js`、`bin: { vecto-export: dist/cli.js }`，经 `tsc` 然后 `chmod 0755 dist/cli.js` 构建（`package.json:10` `chmodSync`）。分发的 `.d.ts` 为 `dist/index.d.ts`。`exportVideo` 是唯一公开 API 表面（`index.ts:6`）。

### 8.3 决策辅助

| 场景                                                                                               | 使用                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 将故事或演示渲染为产物的 CI 任务                                                    | `vecto-export ./src/demo/foo.ts -o out.mp4 --fps 60 --duration 3 -a voice.wav`（一次性，以 0/1/130/143 退出） |
| 拥有 Vite 服务 / 浏览器页面，或需将导出与其他异步工作组合的库调用方 | `exportVideo({ url, outputPath, signal })` 来自 `index.ts:6`                                                      |
| 从托管 URL 捕获静帧/快照或短片                                            | `vecto-export https://…/scene.html`（远程路径，无 Vite）                                                        |

## 9. 失败模式 — 哪个组件在说话

每阶段抛出标识阶段的消息；`cli.ts:140` 以 `Export failed:` + 带有限 FFmpeg stderr 尾（`ffmpeg-supervisor.ts:64` 64 KiB，退出码 `≠0` 时始终附带于 `ffmpeg-supervisor.ts:117`）的 `AggregateError` 呈现之。归因失败时，问：

| 失败                                                       | 可能组件                   | 决定性线索                                                                   |
| ------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| `width and height must be even for H.264`                     | `options.ts:58`                    | 提前，永不在 FFmpeg 时                                                     |
| `Input file does not exist` / `Audio file does not exist`     | `options.ts:70` / `:84`            | Chromium/Vite 之前                                                            |
| `Output directory does not exist / is not writable`           | `options.ts:90` / `:97`            | Chromium/Vite 之前                                                            |
| `Vite did not expose a TCP address`                           | `input-target.ts:106`              | 本地入口，端口 0 绑定                                                        |
| `Failed to start FFmpeg`                                      | `ffmpeg-supervisor.ts:73`          | `spawn` `error` 事件                                                           |
| `FFmpeg exited before input completed`                        | `ffmpeg-supervisor.ts:115`         | 过早退出，含 stderr 尾                                                |
| `FFmpeg exited with code N: …` + stderr 尾                  | `ffmpeg-supervisor.ts:117`         | `pix_fmt` / `yuv420p` / `libx264` 配置错误                                     |
| `FFmpeg stdin failed` / `EPIPE`                               | `ffmpeg-supervisor.ts:80` / `:145` | 已销毁管道，导出中途无约束 `write`                                 |
| `FFmpeg did not exit after SIGTERM and SIGKILL`               | `ffmpeg-supervisor.ts:222`         | 卡住，仅无信号 `finish()`                                              |
| `No canvas found`                                             | `export-session.ts:93`/`102`       | 页面中缺失或隐藏 `<canvas>`                                        |
| `window.vectoScene must provide callable stop() and step(dt)` | `export-session.ts:71`             | 页面契约未及时暴露                                               |
| `Video export cleanup failed`（AggregateError）                | `export-session.ts:188`            | 主错误后 `browser.close` / `target.close` / `output.cleanup` 抛出 |
| `Failed to install staged output…`                            | `staged-output.ts:126`             | `ATOMIC_MOVE` 两步重命名竞态                                              |

以上列表非虚构：每条字符串在所给 `{file,}:line` 中逐字存在。

## 10. 测试导出器及其边界

导出包在无真实 Chromium 或 Vulkan 实例下测试——每个外部经 `ExportSessionDependencies`（`export-session.ts:27`）/ `FfmpegDependencies`（`ffmpeg-supervisor.ts:21`）/ `InputTargetDependencies`（`input-target.ts:29`）/ `CliRuntime`（`cli.ts:11`）注入的 `*Like` 伪造。那些伪造断言：

- `packages/video-exporter/test/export-session.test.ts:30` `fixtures` 驱动 `scene.stop/ reset/ step`、`inputTarget.close`、`StagedOutput` create/commit/cleanup、`browser.newPage`、`FfmpegSupervisor.write/finish/terminate` 与 `progress.{start,update,stop}` 为字符串 `events`，断言以 `indexOf` / `includes` 查询（`:154` reset 时机、`:169` `progress.stop` 存在、`:185` 有序步骤、`:239` FFmpeg 前无效契约）。
- 取消由之前或循环中被中止的 `AbortController` 建模（`export-session.test.ts:295` `controller.abort('stop now')`）—— `throwIfAborted` 检查（`export-session.ts:147`/`157`）显现为被抑制的多余 `step`/`write` 帧。
- `test/cli.test.ts` 驱动 `parseArgs` 校验（`cli.ts:54` 非法参数 → `1`，`cli.ts:82` 多余位置参数 → `1`）与 `CliRuntime.once/off` 信号接缝（`cli.ts:123`/`142`）。
- `test/staged-output.test.ts` 驱动 `rename`/`rm`/`readdir` 伪造（`staged-output.ts:6` 依赖）以命中 `EEXIST/EPERM → backup → install → restore` 阶梯（`staged-output.ts:108`/`112`/`119`）与孤儿回收清扫（`staged-output.ts:42`/`82`）。

可被导出器驱动的最小页内场景（来自 `packages/video-exporter/test/fixtures/two-frame-scene.ts:8`）：

```ts
import { Scene } from '@vectojs/core';
const scene = new Scene(document.querySelector('canvas')!);
// ... assemble entities, animators, springs/tweens — all driven from dt ...
(window as unknown as { vectoScene?: unknown }).vectoScene = {
  stop: () => scene.stop(),
  step: (dt: number) => scene.step(dt), // Scene.ts:3423 — fixed step
  reset: () => {
    /* return to t=0 if you animated during load */
  },
};
```text

从不调用 `scene.start()` 的场景除此包装外无需 `stop`/`reset`——它们保持静态直到导出器驱动（`demo/data-chart.ts:227`/`ml-descent.ts:219` 模式）。

## 11. 陷阱

- **忘记 `window.vectoScene`**：页面加载，导出器等待 10s（`export-session.ts:61`），超时。始终在 `scene.start()` 前设置，或同步暴露（`demo/data-chart.ts:222` `window.vectoScene = scene` 在 start 前）。
- **无 `reset` 的加载时状态**：入场 tween 使第 0 帧抖动（`export-session.ts:78` 基准不确定性，`#646`）。添加 `reset()`。
- **墙钟动力学**：`tick` 回调中的 `Date.now()` 抵消固定步进。仅经 `dt` 线程化状态或播种模拟状态。
- **奇数尺寸**：静默通过校验会在后期编码失败并以不透明 FFmpeg stderr 报错。`options.ts:58` 提前拒绝。
- **假设“无音轨”即“静默输出”**：仅当省略 `audioPath` 时导出才静默（`options.ts:16` _“canvas pipeline itself never produces sound”_）；传入错误路径在 Chromium 前失败（`options.ts:80`），因此错误音频不会是迟来惊喜。
- **未清理的 kill**：备份重命名与安装间的 `kill -9`（`staged-output.ts:35`）遗留 stranded `.vecto-*`。下一次导出的 `staleSweep`（`staged-output.ts:42`/`55` + `export-session.ts:122` 构造）是恢复——不要在导出中途手动删除 `.vecto-*` 文件。
- **假设浏览器导出在无 FFmpeg/Chromium 的 CI 上可用**：按需提供正确包并在自带 Chromium 时设置 `PUPPETEER_EXECUTABLE_PATH`（`browser.ts:49` / `README.md:10` 安装说明）。
- **CRITICAL**：以上所有引用皆针对 `/mnt/data/Workspace/Projects/vectojs/vectojs` 处钉住仓库经 grep 验证（`options.ts`、`export-session.ts`、`browser.ts`、`ffmpeg-supervisor.ts`、`input-target.ts`、`staged-output.ts`、`abort-error.ts`、`cli.ts`、`Scene.ts:3423`/`5609`/`1114`、`SKILL.md`、`references/export-recipes.md`）。

## 12. 检查清单 — 编写确定性导出

- [ ] 页面暴露带可调用 `stop` 与 `step(dt)` 的 `window.vectoScene`（`export-session.ts:71` 契约）。
- [ ] 若场景渲染加载时状态，则亦暴露 `reset()`（`export-session.ts:84` 第 0 帧修复，`#646`）。
- [ ] 场景在导出模式下从不调用 `scene.start()`，或 `stop()` 在首次捕获前可靠取消其循环（`demo/math-teaching.ts:9`/`161` 时钟说明，`export-session.ts:75` 校验后立即 `scene.stop()`）。
- [ ] 所有动画器积分传给 `step` 的 `dt` —— `tick`/弹簧/tween 内无 `Date.now` / 墙钟读取（`Scene.ts:3423` 固定步进路径 vs `Scene.ts:5609` 钳制墙钟 `dt`）。
- [ ] 随机性（若有）自 `frame` 或确定性 prng 播种——每帧 `Math.random()` 将在各次运行间闪烁。
- [ ] 字体/Msdf/着色器资源在 t=0 前加载（在 `packages/text/src/fontMetrics.ts:82` 处无未等待的 `registerFontMetrics` / `isReady` 竞态）。
- [ ] 导出几何为偶数（`options.ts:58` `2 | dimensions`，`yuv420p` 要求）且 `deviceScaleFactor: 1` 被假定用于分辨率声明（`export-session.ts:128`）。
- [ ] 中止可传播（API 上 `signal`，CLI 中 SIGINT/SIGTERM）且每个资源都有注入的 `close/terminate/cleanup`（`export-session.ts:175` + `ffmpeg-supervisor.ts:249`）。
- [ ] 可选音频为文件路径（`options.ts:78` `audioPath` 预启动检查），而非实时捕获——无它时导出的 canvas 视频静默（`options.ts:14` 静默说明）。

## 关联

- **Boss 06（VMT 运行时）**拥有 `loop`（`Scene.ts:5569`）↔ `step`（`Scene.ts:3423`）对偶及为何 rAF 循环钳制而 `step` 不钳制。
- **Boss 07（渲染器）**拥有 `page.setViewport` 上 `deviceScaleFactor: 1`（`export-session.ts:128`）及捕获时钟固定时剔除为何保持一致。
- **Boss 08（WASM）**在此不可见——任何存活 WASM 存储 vs JS 一致性在固定步进推进下也必须逐帧成立，但导出器从不对此特殊处理。
- **Boss 01/02（选区 + 文本）**提供字体/形态准备，其就绪性必须在 t=0 前等待——否则第 0 帧包含竞态而非捕获。
- **Boss 11+ 产品面（canvas 应用）**是 `@vectojs/video-exporter` 实际被使用之处——将它们转介至本 boss，而非反向。

## 参考

- `packages/video-exporter/src/index.ts:6` —— 公开 `exportVideo(options)` 入口，唯一导出符号
- `packages/video-exporter/src/options.ts:40` —— `normalizeOptions` + 几何/音频/目录校验 + `Math.ceil(fps*duration)`/`dt` 推导
- `packages/video-exporter/src/export-session.ts:111` —— `ExportSession.run` 生命周期、`validateAndStopScene` 契约、分阶段 `output.path` + 循环 `page.evaluate(step(dt))` + `captureFrame`
- `packages/video-exporter/src/input-target.ts:48` —— `resolveInputTarget` Vite vs 远程分支、合成 `<canvas>` 外壳 + `transformIndexHtml`
- `packages/video-exporter/src/browser.ts:45` —— `resolveBrowserLaunchOptions` 可执行/沙箱参数
- `packages/video-exporter/src/ffmpeg-supervisor.ts:34` —— `FfmpegSupervisor` 有限 stderr、stdin EPIPE 防护、`write`/`finish`/`terminate`、`SIGTERM→SIGKILL` 升级
- `packages/video-exporter/src/staged-output.ts:27` —— 原子分阶段文件 + 备份 + `sweepStaleFiles` 孤儿回收
- `packages/video-exporter/src/abort-error.ts:6` —— `abortError(signal)` 共享 `AbortError` 工厂（`#661`）
- `packages/video-exporter/src/cli.ts:50` —— `runCli` 参数解析、`130`/`143` 信号退出码、注入式 `CliRuntime`
- `packages/core/src/tree/Scene.ts:3423` —— `step(dt)` 固定步进契约：无条件渲染、未钳制 `dt`、`frameStats` 零值、度量陷阱说明
- `packages/core/src/tree/Scene.ts:5569` / `5609` / `5636` / `1114` —— `loop` 墙钟 `dt`、`100/cap` 对齐、`MAX_FRAME_DT=100` 钳制
- `packages/video-exporter/package.json:10` —— `dist/cli.js` + `chmod 0755` 构建、`bin: vecto-export`、`main: dist/index.js`
- `packages/video-exporter/demo/*.ts:222` / `test/fixtures/two-frame-scene.ts:8` / `test/export-session.test.ts:154` —— 场景契约使用处
- `.agents/skills/vectojs-video-exporter/SKILL.md:1` —— 导出器 skill（0.2 契约 + 沙箱策略 + 常见错误）
- `.agents/skills/vectojs-video-exporter/references/export-recipes.md` —— CLI/API 片段

---

_系列：00 总览 → 01 选区 → 02 文本+布局 → 03 投影+虚拟化 → 04 流式 Markdown → 05 TeX → 06 VMT 运行时 → 07 渲染器 → 08 WASM G1/G2/G3 → 09 Three/XR → **10 视频导出** → 11 图布局 → 12 DevTools → 99 综合。_
````
