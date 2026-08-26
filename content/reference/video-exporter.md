+++
title = "@vectojs/video-exporter"
description = "CLI and library for stepping a VectoJS scene frame-by-frame and encoding its canvas output as H.264 MP4 with Chromium and FFmpeg."
weight = 47
+++

# `@vectojs/video-exporter`

Version documented: **0.2.4**

`@vectojs/video-exporter` drives a VectoJS scene in headless Chromium one fixed time step at a time, captures its canvas as PNG frames, and pipes those frames to FFmpeg for H.264 MP4 encoding.

## Features

- **Fixed-step scene control**: Stops the normal Scene loop and calls `scene.step(1000 / fps)` before each capture. This makes the requested simulation time deterministic; it does not guarantee that application code using unrelated clocks, network input, or randomness is deterministic.
- **PNG image pipe**: Calls `canvas.toDataURL('image/png')` in Chromium, decodes the base64 result in Node, and writes each PNG to FFmpeg's stdin.
- **Standard MP4 output**: Uses FFmpeg's `libx264` encoder and `yuv420p` pixel format.
- **Optional audio muxing (`0.3.0+`)**: Attaches an external audio file as an AAC track, trimmed to the video length. Exports stay silent without it.
- **Local source helper**: For a local module path, starts an embedded Vite server and serves an in-memory HTML entry without modifying the source directory. Hosted HTTP(S) pages are also accepted.
- **Atomic output**: Encodes to a unique file beside the destination and replaces the requested MP4 only after FFmpeg exits successfully. Failed or aborted exports preserve an existing destination.
- **Deterministic cleanup**: Stops progress output, terminates FFmpeg, closes Chromium and Vite, and removes staged files on success, failure, or abort.

---

## Installation

```bash
bun add @vectojs/video-exporter
```

The exporter requires `ffmpeg` on `PATH`. Chromium is resolved from `PUPPETEER_EXECUTABLE_PATH`, then `/usr/bin/chromium` when present, then Puppeteer's configured or bundled browser.

```bash
ffmpeg -version
PUPPETEER_EXECUTABLE_PATH=/opt/chrome/chrome bunx vecto-export ./scene.ts
```

Vite is a runtime dependency and is installed automatically for local JavaScript and TypeScript entries.

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
- `-a, --audio` (`0.3.0+`): Audio file to mux into the export (encoded as AAC)

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

The rendered page must expose a started or startable VectoJS Scene as `window.vectoScene`. The exporter waits up to 10 seconds for it, requires callable `stop()` and `step(dt)` methods, then advances it with fixed steps. The first `<canvas>` is resized to the requested output dimensions and captured.

**Scene reset contract (`0.2.4+`).** Between page load and `stop()` the page's own rAF loop free-runs, so wall-clock state (intro tweens, eased entrances) was arbitrary by the time capture began, and every later frame was deterministic only from that nondeterministic base. The exporter now calls an optional `reset()` on `window.vectoScene` once right after `stop()`, before frame 0 is stepped or captured. Scenes that render static until their first `step(dt)` are unaffected and need no `reset()`; scenes that carry load-time state **must** expose it to return to their t=0 presentation. A scene without `reset()` is exported as-is.

```typescript
const scene = new Scene(document.querySelector('canvas')!);
// add entities...
(window as Window & { vectoScene?: Scene }).vectoScene = scene;
scene.start();
```

The frame count is `Math.ceil(fps × duration)`. If FFmpeg exits non-zero, the Promise rejects with a bounded stderr tail. Errors distinguish validation, Vite, Chromium/page contract, capture, FFmpeg, output commit, and cleanup phases.

## Audio (`0.3.0+`)

Pass `audioPath` in the API (or `-a, --audio <file>` in the CLI) to mux an audio track into the export:

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

The track is encoded with AAC at 192 kbps and `-shortest` trims it to the video length, so an over-long audio file never extends the export. A missing or non-file path is rejected during option validation, before Chromium launches. The canvas capture pipeline itself never produces sound: exports stay silent unless `audioPath` is provided.

## Cancellation and process signals

Abort API exports with an `AbortController`. The CLI maps `SIGINT` and `SIGTERM` to the same cleanup path, waits for resources to close, then returns exit code 130 or 143.

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

## Chromium sandbox policy

The sandbox stays enabled for normal users. It is disabled only for root or when `VECTO_CHROMIUM_NO_SANDBOX=1` is explicitly set, and the exporter warns in either case. The environment flag is intended for constrained CI runners; prefer a normal non-root process elsewhere.
