+++
title = "@vectojs/video-exporter"
description = "VectoJSシーンをフレーム単位で進め、そのキャンバス出力をChromiumとFFmpegでH.264 MP4にエンコードするCLIおよびライブラリ。"
weight = 47

[extra]
order = 47
+++

# `@vectojs/video-exporter`

文書化バージョン: **0.2.2**

`@vectojs/video-exporter` は、ヘッドレスChromiumでVectoJSシーンを固定時間ステップで駆動し、そのキャンバスをPNGフレームとしてキャプチャし、それらのフレームをFFmpegにパイプしてH.264 MP4エンコードを行います。

## 機能

- **固定ステップシーン制御**：通常のSceneループを停止し、各キャプチャの前に `scene.step(1000 / fps)` を呼び出します。これにより要求されたシミュレーション時間は決定論的になりますが、無関係なクロック、ネットワーク入力、またはランダム性を使用するアプリケーションコードが決定論的であることは保証しません。
- **PNG画像パイプ**：Chromiumで `canvas.toDataURL('image/png')` を呼び出し、Nodeでbase64結果をデコードし、各PNGをFFmpegのstdinに書き込みます。
- **標準MP4出力**：FFmpegの `libx264` エンコーダーと `yuv420p` ピクセル形式を使用します。
- **ローカルソースヘルパー**：ローカルモジュールパスの場合、埋め込みViteサーバーを起動し、ソースディレクトリを変更せずにインメモリHTMLエントリを提供します。ホストされたHTTP(S)ページも受け付けます。
- **アトミック出力**：宛先の横の一意のファイルにエンコードし、FFmpegが正常に終了した後にのみ要求されたMP4を置き換えます。失敗または中断されたエクスポートは既存の宛先を保持します。
- **決定論的クリーンアップ**：進行状況出力を停止し、FFmpegを終了し、ChromiumとViteを閉じ、成功・失敗・中断時にステージングファイルを削除します。

---

## インストール

```bash
bun add @vectojs/video-exporter
```

エクスポーターは`PATH`に`ffmpeg`が必要です。Chromiumは `PUPPETEER_EXECUTABLE_PATH`、次に `/usr/bin/chromium`（存在する場合）、その後Puppeteerの設定またはバンドルされたブラウザから解決されます。

```bash
ffmpeg -version
PUPPETEER_EXECUTABLE_PATH=/opt/chrome/chrome bunx vecto-export ./scene.ts
```

Viteはランタイム依存関係であり、ローカルのJavaScriptおよびTypeScriptエントリに対して自動的にインストールされます。

## 使用法（CLI）

ローカルのJavaScript/TypeScriptモジュールを直接渡します：

```bash
bunx vecto-export ./my-animation.ts -o output.mp4 -f 60 -d 5
```

または、事前ホストされたURLを渡します：

```bash
bunx vecto-export http://localhost:5173 -o output.mp4 -f 60 -d 5
```

### オプション

- `-o, --output` : 出力ファイル（デフォルト: out.mp4）
- `-w, --width` : ピクセル単位の幅（デフォルト: 1280）
- `-h, --height` : ピクセル単位の高さ（デフォルト: 720）
- `-f, --fps` : 1秒あたりのフレーム数（デフォルト: 60）
- `-d, --duration`: 秒単位の時間（デフォルト: 5）

## 内部APIの使用法

```typescript
import { exportVideo } from '@vectojs/video-exporter';

await exportVideo({
  url: 'my-animation.ts', // またはhttp URL
  outputPath: 'out.mp4',
  width: 1920,
  height: 1080,
  fps: 60,
  duration: 10,
});
```

レンダリングされたページは、開始済みまたは開始可能なVectoJS Sceneを `window.vectoScene` として公開する必要があります。エクスポーターは最大10秒間待機し、呼び出し可能な `stop()` および `step(dt)` メソッドを要求し、固定ステップでそれを進めます。最初の `<canvas>` が要求された出力寸法にリサイズされ、キャプチャされます。

```typescript
const scene = new Scene(document.querySelector('canvas')!);
// エンティティを追加...
(window as Window & { vectoScene?: Scene }).vectoScene = scene;
scene.start();
```

フレーム数は `Math.ceil(fps × duration)` です。FFmpegが非ゼロで終了した場合、Promiseは制限されたstderr末尾とともに拒否されます。エラーは検証、Vite、Chromium/ページ契約、キャプチャ、FFmpeg、出力コミット、およびクリーンアップのフェーズを区別します。

## キャンセルとプロセスシグナル

`AbortController` でAPIエクスポートをキャンセルします。CLIは `SIGINT` および `SIGTERM` を同じクリーンアップパスにマッピングし、リソースが閉じるのを待ってから終了コード130または143を返します。

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

## Chromiumサンドボックスポリシー

通常のユーザーではサンドボックスは有効のままです。rootの場合、または `VECTO*CHROMIUM*NO_SANDBOX=1` が明示的に設定されている場合にのみ無効になり、エクスポーターはいずれの場合も警告を表示します。この環境フラグは制約されたCIランナーを対象としています；それ以外の場所では通常の非rootプロセスを推奨します。
