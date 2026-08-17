+++
title = "@vectojs/video-exporter"
description = "用于逐帧步进 VectoJS 场景并使用 Chromium 和 FFmpeg 将其 canvas 输出编码为 H.264 MP4 的 CLI 和库。"
weight = 47
+++

# `@vectojs/video-exporter`

记录的版本：**0.2.3**

`@vectojs/video-exporter` 在无头 Chromium 中一次一个固定时间步进地驱动 VectoJS 场景，将其 canvas 捕获为 PNG 帧，并将这些帧管道传输给 FFmpeg 进行 H.264 MP4 编码。

## 特性

- **固定步进场景控制**：停止正常的 Scene 循环，并在每次捕获前调用 `scene.step(1000 / fps)`。这使得请求的模拟时间是确定性的；它不保证使用无关时钟、网络输入或随机性的应用代码是确定性的。
- **PNG 图像管道**：在 Chromium 中调用 `canvas.toDataURL('image/png')`，在 Node 中解码 base64 结果，并将每个 PNG 写入 FFmpeg 的 stdin。
- **标准 MP4 输出**：使用 FFmpeg 的 `libx264` 编码器和 `yuv420p` 像素格式。
- **本地源助手**：对于本地模块路径，启动一个嵌入式 Vite 服务器并提供一个内存中的 HTML 入口，而不修改源目录。也接受托管的 HTTP(S) 页面。
- **原子输出**：编码到目标旁边的一个唯一文件，仅在 FFmpeg 成功退出后才替换请求的 MP4。失败或中止的导出保留现有目标。
- **确定性清理**：停止进度输出，终止 FFmpeg，关闭 Chromium 和 Vite，并在成功、失败或中止时移除暂存文件。

---

## 安装

```bash
bun add @vectojs/video-exporter
```

导出器需要 `PATH` 上的 `ffmpeg`。Chromium 从 `PUPPETEER_EXECUTABLE_PATH` 解析，然后是存在时的 `/usr/bin/chromium`，然后是 Puppeteer 配置或捆绑的浏览器。

```bash
ffmpeg -version
PUPPETEER_EXECUTABLE_PATH=/opt/chrome/chrome bunx vecto-export ./scene.ts
```

Vite 是一个运行时依赖，会为本地 JavaScript 和 TypeScript 入口自动安装。

## 用法（CLI）

直接传递本地 JavaScript/TypeScript 模块：

```bash
bunx vecto-export ./my-animation.ts -o output.mp4 -f 60 -d 5
```

或传递一个预托管的 URL：

```bash
bunx vecto-export http://localhost:5173 -o output.mp4 -f 60 -d 5
```

### 选项

- `-o, --output` ：输出文件（默认：out.mp4）
- `-w, --width` ：宽度（像素）（默认：1280）
- `-h, --height` ：高度（像素）（默认：720）
- `-f, --fps` ：每秒帧数（默认：60）
- `-d, --duration`：持续时间（秒）（默认：5）

## 内部 API 用法

```typescript
import { exportVideo } from '@vectojs/video-exporter';

await exportVideo({
  url: 'my-animation.ts', // or a http URL
  outputPath: 'out.mp4',
  width: 1920,
  height: 1080,
  fps: 60,
  duration: 10,
});
```

渲染的页面必须将一个已启动或可启动的 VectoJS Scene 暴露为 `window.vectoScene`。导出器最多等待它 10 秒，要求可调用的 `stop()` 和 `step(dt)` 方法，然后以固定步进推进它。第一个 `<canvas>` 被调整为请求的输出尺寸并捕获。

```typescript
const scene = new Scene(document.querySelector('canvas')!);
// add entities...
(window as Window & { vectoScene?: Scene }).vectoScene = scene;
scene.start();
```

帧数为 `Math.ceil(fps × duration)`。如果 FFmpeg 以非零退出，Promise 会以一个有界的 stderr 尾部拒绝。错误区分验证、Vite、Chromium/页面约定、捕获、FFmpeg、输出提交和清理阶段。

## 取消与进程信号

用 `AbortController` 中止 API 导出。CLI 将 `SIGINT` 和 `SIGTERM` 映射到相同的清理路径，等待资源关闭，然后返回退出码 130 或 143。

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

## Chromium 沙盒策略

对于普通用户，沙盒保持启用。它仅对 root 或在显式设置 `VECTO*CHROMIUM*NO_SANDBOX=1` 时禁用，并且导出器在任一情况下都会警告。该环境标志旨在用于受约束的 CI 运行器；在其他地方优先使用普通的非 root 进程。
