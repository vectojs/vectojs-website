---
title: '@vectojs/video-exporter'
description: 'CLI and library for stepping a VectoJS scene frame-by-frame and encoding its canvas output as H.264 MP4 with Chromium and FFmpeg.'
order: 5
---

# `@vectojs/video-exporter`

`@vectojs/video-exporter` drives a VectoJS scene in headless Chromium one fixed time step at a time, captures its canvas as PNG frames, and pipes those frames to FFmpeg for H.264 MP4 encoding.

## Features

- **Fixed-step scene control**: Stops the normal Scene loop and calls `scene.step(1000 / fps)` before each capture. This makes the requested simulation time deterministic; it does not guarantee that application code using unrelated clocks, network input, or randomness is deterministic.
- **PNG image pipe**: Calls `canvas.toDataURL('image/png')` in Chromium, decodes the base64 result in Node, and writes each PNG to FFmpeg's stdin.
- **Standard MP4 output**: Uses FFmpeg's `libx264` encoder and `yuv420p` pixel format.
- **Local source helper**: For a local module path, starts an embedded Vite server and generates a temporary HTML entry next to that module. Hosted HTTP(S) pages are also accepted.

---

## Installation

```bash
bun add @vectojs/video-exporter
```

The current release expects Chromium at `/usr/bin/chromium` and `ffmpeg` on `PATH`. Verify both before starting a long export:

```bash
/usr/bin/chromium --version
ffmpeg -version
```

## Usage (CLI)

Pass a local JavaScript/TypeScript module directly:

```bash
bunx vecto-export ./my-animation.ts -o output.mp4 -f 60 -d 5
```

Or pass a pre-hosted URL:

```bash
bunx vecto-export http://localhost:5173 -o output.mp4 -f 60 -d 5
```

### Options

- `-o, --output` : Output file (default: out.mp4)
- `-w, --width` : Width in pixels (default: 1280)
- `-h, --height` : Height in pixels (default: 720)
- `-f, --fps` : Frames per second (default: 60)
- `-d, --duration`: Duration in seconds (default: 5)

## Internal API Usage

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

The rendered page must expose a started or startable VectoJS Scene as `window.vectoScene`. The exporter waits up to 10 seconds for it, calls `stop()`, then advances it with `step(dt)`. The first `<canvas>` in the page is captured.

```typescript
const scene = new Scene(document.querySelector('canvas')!);
// add entities...
(window as Window & { vectoScene?: Scene }).vectoScene = scene;
scene.start();
```

If FFmpeg exits non-zero, the Promise rejects with its captured stderr. Output duration is `fps × duration` fixed steps; encoding speed may be slower or faster than real time depending on scene and machine performance.
