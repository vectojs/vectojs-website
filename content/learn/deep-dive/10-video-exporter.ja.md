+++
title = "10 — 決定論的ビデオ書き出し — 固定ステップキャプチャ"
description = "@vectojs/video-exporter が壁時計を固定ステップのシーンクロックに置き換え、ヘッドレス Chromium 経由でキャプチャし、PNG フレームを FFmpeg にパイプして H.264 MP4 にする方法 — ステージング出力、中断、クリーンアップで出力先を安全に保つ仕組み。"
weight = 30
+++

# 10 — 決定論的ビデオ書き出し — 固定ステップキャプチャ

> **ボス 10** はアニメーション時間を再現可能にする。同じモジュール、同じ `fps × duration`、同じ `seed` — すべての書き出しが同じフレームを生成する。ホストの速度、コンポジタのジッター、バックグラウンド化されたタブに関係なく。2 つの時計が関わる：**壁時計**（`requestAnimationFrame`、`performance.now()` — キャプチャ開始前にブラウザが行っていたもの）と**固定ステップ時計**（`Scene.step(dt)` でフレームごとに正確に `dt = 1000/fps`）。エクスポータは前者を停止し、フレーム 0 の前に後者をインストールする。

- **学べること**: なぜフレーム 0 の決定性が難しい部分なのか、シーン契約（`stop + step + 任意の reset`）、Chromium → canvas PNG → FFmpeg `image2pipe` パイプライン、ステージング出力、中断伝播、順序立てられたクリーンアップ、CLI／API の使い分け、そしてシーン作者が依然として排除しなければならない残留非決定性。
- **学べないこと**: VMT ライフサイクル／transform（ボス 06）、レンダラー内部（ボス 07）、WASM 高速化（ボス 08）。本ドキュメントはキャプチャクロックとエンコードを担う。

## 1. なぜ決定論的な書き出しが難しいのか — 2 つの時計問題

ライブの VectoJS シーンは `requestAnimationFrame` tick で進む（`packages/core/src/tree/Scene.ts:5569` `loop`）。各 tick で：

1. 壁時計から `dt = time - lastTime` を計算する（`Scene.ts:5609`）；
2. 近ければ `dt` を `1000/cap` の公称値にスナップする（±30% でコンポジタのジッターを隠す、`Scene.ts:5625`）；
3. `dt` を `MAX_FRAME_DT = 100ms`（`Scene.ts:1114`、`:5636`）にクランプする。バックグラウンド化されたタブが物理演算を数秒先へ吹き飛ばさないようにするため；
4. ドライバを更新し、transform を合成し、レイアウトし、ペイントする。

これはライブページでは正しい。書き出しでは致命的である：書き出し時間はフレームインデックスの**純粋関数**でなければならない。

- 同じホストでの 2 回の実行が、一方がジッターしたりスロットルしたりバックグラウンド化したりするたびに不一致になる。
- ベンチマークと書き出しが同じシーンを共有しても、ケイデンスで不一致になる。
- `Math.random()`、壁時計の `Date.now()`、あるいは非固定フレームで解決する非同期リソースは、フレーム 0 を任意にし、以降のすべてのフレームはそのベースを継承する（`packages/video-exporter/src/export-session.ts:78` コメントは `#646` に言及）。

修正は、**最初のキャプチャフレームの前に壁時計ループを停止し、一定のステップで進める**ことである（`packages/core/src/tree/Scene.ts:3423` `step(dt)`）。決定性はシーン作者の規律となる：すべてのアニメーション、spring、tween は与えられた `dt` のみを積分しなければならず、ランダム性は seed されなければならない。エクスポータは時計を強制し、シーンは決定論的なダイナミクスを提供しなければならない。

## 2. シーン契約 — ページが公開しなければならないもの

エクスポータは通常のブラウザページ（ローカルまたはリモート）内で実行され、`window.vectoScene` を通じてシーンと対話する。重要なメソッドは 3 つである：

| method     | role                                          | required | where checked                                      |
| ---------- | --------------------------------------------- | -------- | -------------------------------------------------- |
| `stop()`   | `requestAnimationFrame` ループを停止          | yes      | `packages/video-exporter/src/export-session.ts:62` |
| `step(dt)` | 正確に 1 フレームを同期的に進めてレンダリング | yes      | `packages/video-exporter/src/export-session.ts:70` |
| `reset()`  | t=0 の表示に戻す（任意）                      | no       | `packages/video-exporter/src/export-session.ts:84` |

### 2.1 `stop + step` が時計の入れ替えである

`ExportSession.validateAndStopScene`（`export-session.ts:60`）：

- `page.waitForFunction('!!window.vectoScene', { timeout: 10_000 })`（`export-session.ts:61`）— ページは `networkidle0` の後 10 秒以内にシーンを公開しなければならない。
- `page.evaluate` で `typeof scene.stop === 'function'` と `typeof scene.step === 'function'` を probe する（`export-session.ts:62`）：どちらかが欠けていれば `window.vectoScene must provide callable stop() and step(dt) methods` を throw する（`export-session.ts:71`）。
- その後 `scene.stop()`（`export-session.ts:75`）で `requestAnimationFrame` の再スケジュールを停止し、キャプチャだけが時間を進めるようにする。

書き出される各フレームは、正規化された `dt = 1000 / fps`（`export-session.ts:148`）で `scene.step(dt)` を呼ぶ。`Scene.step`（`Scene.ts:3423`）は正確に 1 つのことを行う：`time = lastTime + dt; lastTime = time; render(renderer, dt, time)` — dirty チェックなし（`Scene.ts:3405`「無条件にレンダリングする」）、`always` アイドルスロットルなし、`MAX_FRAME_DT` クランプなし（`Scene.ts:3421`「MAX_FRAME_DT でクランプされない — 呼び出し元がステップを選ぶ」）。このバイパスは意図的である：決定論的なドライバは、そのフレームが欲しいからフレームを要求する。

`step` のドキュメントでは、レビュアが計測を誤読しないよう 2 つのレンダリング上の落とし穴が明記されている：

- `step()` 経由でフレームを駆動するベンチマークは**フレームスキップを観測できない**（`Scene.ts:3411`）ため、`always` と `onDemand` の違いはこのパスでは不可視である — スケジューリングはライブの `start()` ループでのみ計測すること（`Scene.ts:3417`）。
- シーンが `step()` 駆動のみの場合 `frameStats` はゼロのデフォルトのままである（`Scene.ts:3501`）— フェーズ probe は `loop` 上に存在する。

### 2.2 `reset` がフレーム 0 修正である（issue #646）

ページロードから `scene.stop()` までの間に、ページ自身の rAF ループはホスト依存の任意の tick 数だけフリーランする。それらの tick で駆動される intro tween やイーズインは、キャプチャ開始前に任意の状態に到達する — 以降のすべてのフレームは、その非決定論的なベースから**のみ**決定論的になる（`export-session.ts:78` コメント、`#646`）。

- **最初の `step(dt)` まで静止してレンダリングする**シーンは何も必要としない — フレーム 0 はすでに t=0 である。
- **ロード時状態を持つ**シーンは、t=0 の表示に戻す `reset(): void` を公開する。エクスポータは `stop()` の後、最初の `step()` の前に一度だけそれを呼ぶ（`export-session.ts:84`）：`if (typeof scene?.reset === 'function') scene.reset()`。順序不変条件は `packages/video-exporter/test/export-session.test.ts:154` でアサートされている — `reset` は `stop` の後、最初の `step` の前である。
- `reset` のないシーンはそのまま書き出される — 非決定性はエクスポータのエラーではなく作者の問題となる。

デモシーンは意図された使い方を明記している：

- `packages/video-exporter/demo/data-chart.ts:222` `window.vectoScene = scene` + `:227`「エクスポータの stop()+step(dt) シーケンスが唯一の時計となるようアイドル状態を保つ」；
- `packages/video-exporter/demo/ml-descent.ts:219` 同様の注意；
- `packages/video-exporter/demo/math-teaching.ts:9`「クロック、ランダム性なし、scene.start() なし」+ `:161` stop／step が唯一の時計である。

テストは `packages/video-exporter/test/fixtures/two-frame-scene.ts:8` `window.vectoScene = { stop(){}, step(dt){} }` でページを模倣する。

## 3. パイプライン — `url` から `out.mp4` まで

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

### 3.1 Options → 正規化された options

`packages/video-exporter/src/options.ts:40` `normalizeOptions`：

- `url`／`outputPath` は空でない文字列でなければならず、`width`／`height`／`fps` は正の整数（`options.ts:34` `positiveInteger`）、`duration` は正の有限数（`options.ts:54`）でなければならない。
- `fps` はデフォルト 60、`duration` はデフォルト 5 秒（`options.ts:48`）。導出される `dt = 1000 / fps`（`options.ts:113`）と `totalFrames = Math.ceil(fps * duration)`（`options.ts:112`）。小数 duration でも正しいカウントになり、最終フレームが短くなることはない。フレーム数は `references/export-recipes.md:10` に文書化され、`dist/index.d.ts` 契約として出荷される。
- H.264 `yuv420p` クロマは 2×2 サブサンプル — 奇数寸法は決してエンコードできない。`ffmpeg` だけが最後に生の stderr でそれを語る。すべてのフレームをレンダリングした後では遅すぎる。代わりに事前に検証する（`options.ts:58` `width % 2 !== 0 || height % 2 !== 0` → `TypeError`）。
- `isRemote = /^https?:\/\//i.test(url)`（`options.ts:68`）。ローカルパスは `resolve(url)` され、存在しファイルでなければならない（`options.ts:70`）。同じ事前起動チェックが `audioPath` にも適用される（`options.ts:78`）：欠落したトラックはさもなければ最終 FFmpeg stderr としてのみ表面化する。
- `outputPath = resolve(outputPath)`（`options.ts:88`）。その親ディレクトリは存在し、ディレクトリであり、書き込み可能でなければならない（`options.ts:97` で `accessSync(…, W_OK)`）。出力は早期に truncate されない — 原子性は下記の `StagedOutput` が扱う。

### 3.2 入力ターゲット — ローカル Vite ルート vs リモート URL

`packages/video-exporter/src/input-target.ts:48` `resolveInputTarget`：

- リモート：`inertTarget(url)`（`input-target.ts:44`）— サーバなし、`close` は no-op。
- ローカルファイル：`custom` app type で Vite dev サーバを起動する（`input-target.ts:58`）。`dirname(url)` を root とするため bare `import 'three'` などが解決する：
  - `root = dirname(url)`（`input-target.ts:54`）、`entryUrl = "/" + encodeURIComponent(basename(url))`（`input-target.ts:55`）— ファイル名の空白／unicode では `encodeURIComponent` が重要である。
  - 一時的なパス名 `/__vecto_export_${randomUUID()}.html`（`input-target.ts:56`）— 並行する書き出し間の衝突を避けるためランダムだが、`staged-output.ts:35` のコメントは依然としてターゲットパスごとに**一度に 1 つのエクスポータ**を想定している。
  - 単一ミドルウェア：そのパス名に対して `<canvas id="app">` と `<script type="module" src="${entryUrl}">` を持つ合成 HTML を返す（`input-target.ts:74`）。`server.transformIndexHtml(pathname, source)`（`input-target.ts:85`）を経由して Vite の HMR／alias／TS 変換がエントリに適用される。エラーは `next(error)` が存在すればそれに委譲する（`input-target.ts:90`）。
  - `await server.listen()`（`input-target.ts:98`）、その後 `server.httpServer?.address()`（`input-target.ts:99`）：`{ port: number }` でなければ `Vite did not expose a TCP address` を throw する（`input-target.ts:106`）。失敗時は新規作成されたサーバを閉じる（外側 `catch` 内の `input-target.ts:114`）。半起動の Vite がポートを孤立させないようにするためである。
  - 返される `InputTarget.url` は `http://127.0.0.1:${port}${pathname}`（`input-target.ts:110`）。`close()` は Vite サーバを正確に一度だけ閉じる（`input-target.ts:65` `closed` ガード）。

これによりソースディレクトリはクリーンに保たれる — ディスクにヘルパ `.html` は書き込まれない。これは `vectojs-video-exporter/SKILL.md:43` に挙げられたよくある間違いである。

### 3.3 ブラウザ起動 — Chromium + サンドボックスポリシー

`packages/video-exporter/src/browser.ts:45` `resolveBrowserLaunchOptions`：

- 解決順序：`PUPPETEER_EXECUTABLE_PATH`（trim 済み、`browser.ts:49`）、なければ存在すれば `/usr/bin/chromium`（`browser.ts:51`）、さもなければ Puppeteer の解決／バンドルされた Chromium — `README.md:10`「FFmpeg と libx264 … に加え、PUPPETEER_EXECUTABLE_PATH、次に /usr/bin/chromium、次に Puppeteer の … から解決される Chromium が必要」と一致する。
- `args` は常に `--disable-gpu` を含む（`browser.ts:53`）。
- `getuid() === 0` または `VECTO_CHROMIUM_NO_SANDBOX=1` のときのみサンドボックスを無効化（警告付き）（`browser.ts:55`）。警告テキストは `browser.ts:58`：「Chromium sandbox is disabled for this VectoJS video export. Run as a non-root user when possible.」非 root の書き出しプロセスを優先すること（`SKILL.md:38`）。

起動自体はテスト用の seam である：`BrowserDependencies.launch`（`browser.ts:34` `launch(options) → BrowserLike`、デフォルトは `browser.ts:42` で `puppeteer.launch(options)`）と `export-session.ts:32` `launchBrowser` は `ExportSessionDependencies` で差し替え可能である。

### 3.4 キャプチャループ — `validateAndStopScene` → `sizeCanvas` → フレームループ

<!-- markdownlint-disable MD031 MD032 MD040 -->

`ExportSession.run`（`export-session.ts:111`）：

1. 何かを取得する前に `throwIfAborted()`（`export-session.ts:120`、`options.signal?.aborted` を読み `packages/video-exporter/src/abort-error.ts:6` からの `abortError(signal)` を throw）。
2. `target = resolveInputTarget(options)`（`export-session.ts:121`）、`output = createStagedOutput(outputPath)`（`export-session.ts:122`）、`browser = launchBrowser()`（`export-session.ts:123`）、`page = browser.newPage()`（`export-session.ts:124`）、`page.setViewport({ width, height, deviceScaleFactor: 1 })`（`export-session.ts:125`）— `_capture runs at deviceScaleFactor: 1`_（`SKILL.md:31`）：ホスト DPR に関係なく、書き出されたピクセルは `width × height` に等しい。
3. `page.goto(target.url, { waitUntil: 'networkidle0' })`（`export-session.ts:132`）— シーンに触れる前にネットワーク静穏を待つ。
4. `sizeCanvas(page)`（`export-session.ts:133` → `export-session.ts:90`）：`document.querySelector('canvas')` → `canvas.width = width; canvas.height = height`。見つからなければ `No canvas found` を throw する（`export-session.ts:93`）。これは `goto` の**後**に実行されるため、ページ自身の `<canvas>` はすでに存在する — Vite 合成シェル（`input-target.ts:81`）がローカルエントリ用にそれを提供する。
5. `validateAndStopScene(page)`（`export-session.ts:134` → `:60` — §2 を参照）。
6. 2 回目の `throwIfAborted()`（`export-session.ts:135`）— 検証中に到着した中断は FFmpeg 起動前に停止しなければならない。
7. `encoder = startFfmpeg({ fps, outputPath: output.path, audioPath, signal })`（`export-session.ts:137`）：最終的な `outputPath` ではなく**ステージングされた**パス `output.path`（`staged-output.ts:53`、出力先の兄弟である `.<stem>.vecto-<uuid>.mp4`）に注意。
8. `progress = createProgress()`（`export-session.ts:143`、`export-session.ts:41` でデフォルト `cli-progress`）、その後 `progress.start(totalFrames)`（`export-session.ts:144`）。
9. フレームループ（`export-session.ts:146`）：

   ```ts
   for (let frame = 0; frame < totalFrames; frame++) {
     throwIfAborted(); // export-session.ts:147
     await page.evaluate((dt) => scene.step(dt), dt); // :148
     await encoder.write(await captureFrame(page)); // :153
     progress.update(frame + 1); // :154
   }
   ```

````

`captureFrame`（`export-session.ts:99`）は最初の `<canvas>` を読み `canvas.toDataURL('image/png')` を呼び、`,` で split し（`export-session.ts:104`）、`image2pipe/png` stdin 用に base64 末尾を `Buffer` にデコードする。_「First page `<canvas>` is resized and captured」_（`SKILL.md:27`）。

<!-- markdownlint-disable MD029 -->

10. ループ後：`throwIfAborted()`（`export-session.ts:157`）、`encoder.finish()`（`export-session.ts:158` stdin を閉じて `close` を待つ）、再び `throwIfAborted()`（`export-session.ts:159`）、その後 `output.commit()`（`export-session.ts:160`）— クリーンな FFmpeg 終了の後にのみ、ステージングファイルが出力先を置換する。

## 4. FFmpeg — `image2pipe` → H.264/yuv420p、境界付き stderr テール付き

### 4.1 引数

`packages/video-exporter/src/ffmpeg-supervisor.ts:274` `startFfmpeg`：

```ts
const args = [
  "-y",
  "-f",
  "image2pipe",
  "-vcodec",
  "png",
  "-r",
  String(fps),
  "-i",
  "-",
];
if (audioPath !== undefined) args.push("-i", audioPath);
args.push("-c:v", "libx264", "-pix_fmt", "yuv420p");
if (audioPath !== undefined)
  args.push("-c:a", "aac", "-b:a", "192k", "-shortest");
args.push(outputPath);
```text

順序の注意（`ffmpeg-supervisor.ts:278`）：入力が先（`-f image2pipe … -i -`、次に任意の `-i audioPath`）、その後出力オプション — オーディオ `-i` の前に `-c:a` を置くとデコーダではなく出力エンコーダに付いてしまう。オーディオは動画長にトリムされた AAC `192k`（`-shortest`、`ffmpeg-supervisor.ts:287`）。CLI では `-a/--audio` の位置指定（`cli.ts:32`、`:64`）または API では `audioPath`（`options.ts:16`、`:78`）があるときのみ有効になる。

出力は標準 H.264 `yuv420p` MP4（`SKILL.md:28`、`README.md:12`）である。

### 4.2 stdin スーパーバイザ — バックプレッシャ、EPIPE 競合、`FfmpegSupervisor` seam

FFmpeg は `ChildProcessLike` として spawn される（`ffmpeg-supervisor.ts:13`／`21`／`28` でテスト fake 可能）。その `stdin` はフレームループによって書き込まれる。`ffmpeg-supervisor.ts:34` `FfmpegSupervisor` は stdin パイプを堅牢化する：

- `stderrBuffer` は 64 KiB に制限される（`ffmpeg-supervisor.ts:5` `STDERR_LIMIT`）。連結後に末尾を切り取る（`:67` `combined.subarray(combined.byteLength - STDERR_LIMIT)`）— **すべての**エラーがその末尾を運ぶ（`:117` `processError` 内の `stderr.trim()`）。
- 子の `error` イベントからの `spawnError` → `Failed to start FFmpeg: ...`（`:73`）。
- 永続的な `child.stdin.on('error')` ハンドラが `stdinError` を記録する（`:80`）。動機（`:41`）：_「FFmpeg dying mid-export destroys the pipe and emits an async EPIPE after the last write() has already resolved — with no live listener that surfaces as a listener-less uncaught exception, escaping the ExportSession try/catch, skipping its cleanup, and orphaning headless Chromium plus the Vite server.」_ それを記録することで `processError` が次の `write`／`finish` で通常の中断／クリーンアップパスを通じて失敗を表面化できる。
- `close` は `markClosed`（`:92`、`closed` でガードされ `closedBeforeInputCompleted` を記録）で一度だけ確定される。`closeCode`／`closeSignal` + `exitDescription`（`:105` `code N`／`signal NAME`／`unknown status`）はすべての exit エラーに含まれる。
- `processError(early: boolean)`（`:111`）が唯一の判断点である：
  - `spawnError` があればそれ、
  - さもなければまだ close しておらず `stdinError` が設定されていればそれ（子がまだ exit していなくても壊れたパイプ）、
  - さもなければ close 済みで `early||closeCode!==0` なら `FFmpeg exited before input completed` vs `exited` + exit 説明 + stderr 末尾、
  - さもなければ（遅い `stdinError` を伴うクリーン exit）→ 壊れたパイプ上で成功を報告するのではなく依然として `stdinError` を表面化する。
- `write(frame)`（`:156`）は書き込み前に `throwIfAborted()` と `processError(true)` をチェックし、boolean の `stdin.write(frame)` バックプレッシャ戻り値を使う — `false` なら `waitForDrain()`（`:126`）で待つ。その競合は `stdin:drain`、`stdin:error`、`child:close`、`signal:abort` に対するワンショットリスナー（`:131`／`134`／`149`／`137`）をインストールし、対応して解決／reject する。drain の後でも `throwIfAborted()` と `processError(true)` が再チェックされる。
- `finish()`（`:177`）は冪等（`finishPromise`）。`finishOnce`（`:183`）は `closedBeforeInputCompleted` をガードする（子が早期に死んでいれば finish できない）。`child.stdin.end()`（`:190`）を呼び、その後 `processError(false)` を再チェックする前に `waitForCloseOrAbort()`（`:198`）する — exit コード `0` かつ空の `stdinError` のみが成功である。

### 4.3 終了 — `terminate()`、`SIGTERM→SIGKILL`、シグナルなしハング

`terminate()`（`:241`）はクリーンアップパスであり、やはり冪等である。`terminateOnce`（`:247`）は常に tidy しようとする：

- `child.stdin.destroy()` の後に `SIGTERM`、 `closedPromise` に対して `terminateTimeoutMs`（デフォルト `1000ms`、`options.ts:31`／`ffmpeg-supervisor.ts:258`）待つ（`:249`）、`SIGKILL` にエスカレート（`:253`）、再び待つ（`:254`）。`waitForCloseOrTimeout`（`:257`）は `closedPromise` と `setTimeout(timeoutMs)`（`:263`）を競合させタイマーをクリアする（`:266`）。

`waitForCloseOrAbort`（`:203`）には**シグナルなし分岐**がある — ライブラリ呼び出し元は `AbortSignal` を渡さない場合があるため、素の `await closedPromise` では FFmpeg がハングしたときに `finish()` が永遠にハングする。その分岐では各ステージが `terminateTimeoutMs` 待って `SIGTERM→SIGKILL` にエスカレートし、最終的に stderr 末尾付きで `FFmpeg did not exit after SIGTERM and SIGKILL` を throw する（`:222`）— `terminate()` が使うのと同じラダーが、外部中断なしの `finish` にも適用される。シグナルがある場合、`waitForCloseOrAbort` は `closedPromise` と `signal:abort`（`:227`／`234`）を競合させ、キャンセルを `abortError` 経由でルーティングする。

### 4.4 `StagedOutput` — 原子的な出力先置換

`packages/video-exporter/src/staged-output.ts:27` `StagedOutput`：

- `path = <dir>/.<stem>.vecto-<uuid>.mp4`（`:53`）、`targetPath` は呼び出し元の `outputPath`、`backupPath = .<stem>.vecto-<uuid>.backup<ext>`（`:54`）— ステージングされた正体は出力先の隣にある隠し兄弟であり、書き出しごとに一意である（`node:crypto` `randomUUID` 経由、`:1`／`14`／`60`）。
- 構築時に `staleSweep` をキックする（`:55`、`:42`）：backup-rename と install の間で kill された前回実行が残した `.vecto-*` 兄弟のベストエフォートな回収（`:35`）。`sweepStaleFiles`（`:82`）は出力先ディレクトリを読み、`.prefix = ".<stem>.vecto-"` エントリ（`:89`）を探し、自身の `path`／`backupPath` を除外し（`:90`）、`rm(..., { force: true })` を `Promise.allSettled` 経由で実行する（`:92`）。
- `commit()`（`:99`）はまず `staleSweep` を await する（自身の rename との競合なし、`:41`）。その後 `rename(path, targetPath)` — ファイルがないか上書き成功時の高速パスインストール（`:104`）。`EEXIST`／`EPERM` 時（`:108`／`21` `errorCode`）、古典的なスワップを行う：`rename(targetPath, backupPath)`（`:112`）、`rename(path, targetPath)`（`:115`）— 2 回目の rename が throw したら `rename(backupPath, targetPath)` で復元し（`:119`）、_両方の_ `installError` と `restoreError` を抱えた `AggregateError` を throw する（`:126`、意図的に単一 `cause` ではない）。成功時はバックアップを削除する（`:134`）。
- `cleanup()`（`:138`）も `staleSweep` を await し、その後 `rm(path)`（`:145`）。`backupMoved` が依然設定されていればバックアップを調整する（`:150`）：出力先が今存在すればバックアップはすでに置換済みで削除される。`installError` で出力先が欠落したままならバックアップは復元される。例外は `AggregateError` として収集される（`:163`）。

結果：FFmpeg は出力先の隣にあるステージングファイルにエンコードする（`export-session.ts:137` `output.path`）。失敗または中断された書き出しは既存の出力先をそのまま保ち、ステージング成果物を削除する — `test/export-session.test.ts` の慣例で検証されている。

## 5. パイプラインが依存するブラウザ詳細

- 書き出しごとに 1 つのヘルパーページ（`export-session.ts:124` `browser.newPage()`）— キャプチャはその 1 つの `PageLike`（`browser.ts:4` `PageLike` with `setViewport`／`goto`／`waitForFunction`／`evaluate`）を通じて実行される。`PageLike` は意図的に最小限であり、テストでのブラウザモックを正確に保つ。
- デバイススケールは `1` に固定される（`export-session.ts:128`）— `SKILL.md:31` `deviceScaleFactor: 1` と、ホスト DPR に関係なく `width × height` が出力ピクセルであるという書き出しの promise と一貫する（ボス 07 領域）。
- `page.goto(..., { waitUntil: 'networkidle0' })`（`export-session.ts:132`）は `sizeCanvas`／`validateAndStopScene` 実行前にネットワーク静穏を待つ — これがなければ遅い `window.vectoScene` 代入が `waitForFunction` ウィンドウを逃すか、部分的にロードされたシーングラフを抱えることになる。

## 6. キャンセルとプロセスシグナル — すべてのパスが `AbortError` に収束する

書き出しキャンセルは 3 つの発生源を持つが、エラーの種類は 1 つである：`cause` が `AbortSignal.reason` である `AbortError` という名前のエラー（`abort-error.ts:6`）。`abortError` は `#661` で抽出された（`abort-error.ts:1` コメントを参照）。以前は `export-session` と `ffmpeg-supervisor` にあった 2 つの同一実装を重複排除するためである。

### 6.1 ライブラリ API — `AbortSignal`

`options.ts:17`（`ExportOptions` 上の `signal?: AbortSignal`）とその正規化コピー（`options.ts:28`）の両方がシグナルを `ExportSession` と `FfmpegSupervisor` に運ぶ。すべての変更点で `throwIfAborted()` を呼ぶ（`export-session.ts:55`／`147`／`157`／`159`、`ffmpeg-supervisor.ts:101`／`126`／`157`／`184`／`225`）。`waitForDrain`／`waitForCloseOrAbort` は `signal:abort` を listen する（`ffmpeg-supervisor.ts:152`、 `232` でのワンショットリスナー）。

### 6.2 CLI — `SIGINT`／`SIGTERM` → `AbortController`

`packages/video-exporter/src/cli.ts:50` `runCli`：

- `allowPositionals: true` で `parseArgs`（`cli.ts:55`）、1 つの位置引数 `url` が必須（`cli.ts:74`）、余分は大きな声で拒否される（`cli.ts:82`「静かに最初だけを書き出すのはエラーを隠す」）、`output`／`width`／`height`／`fps`／`duration`／`audio` は `positiveInteger`／`positiveNumber` 検証付きで `values` からマップされる（`cli.ts:34`／`42`）。
- `AbortController`（`cli.ts:113`）、`SIGINT→abort('Interrupted by SIGINT')`（`cli.ts:115`）と `SIGTERM→abort('Terminated by SIGTERM')`（`cli.ts:119`）。従来の exit コード `130`（`cli.ts:116`）／`143`（`cli.ts:120`）を `signalExitCode` として記憶し優先して返す（`cli.ts:137`）。リスナーは注入可能な `CliRuntime`（`cli.ts:18`／`20`）経由で登録され、`finally` で削除される（`cli.ts:142`）。`ExportSession` の deps をテスト可能にするのと同じ形状である。
- `runCli` はシグナルで throw しない：`exportVideo` が `AbortError` を throw しても `if (signalExitCode !== undefined) return signalExitCode`（`cli.ts:139`）。`catch` → `runtime.error('Export failed:', error)`（`cli.ts:140`）vs それ以外は `1`。`cli.ts:148` `isExecutableEntry` での実行可能性ガードは、`dist` と `argv[1]` 間の symlink ミスマッチを `realpathSync` 経由で解決する。

### 6.3 順序立てられたクリーンアップ — 孤立した browser／server／FFmpeg／ステージングファイルなし

`ExportSession.run`（`export-session.ts:166` `clean` helper inside `catch`）は取得の逆順で解放する：`progress.stop` → `encoder.terminate` → `browser.close` → `target.close` → `output.cleanup`（`export-session.ts:175`–`:179`）。対応する never-throw パターンは `cli.ts:142` の `finally` での `off` から取られている。エクスポータ版はより明示的 — 各ステップは `try/catch` で `cleanupErrors` に入る（`:170`）。その後：

- `primaryError`（`try` からの throw）とクリーンアップエラーなしなら → `primaryError` を throw（`:182`）；
- 両方あれば → `AggregateError([primaryError, ...cleanupErrors], errorMessage(primaryError), { cause: primaryError })`（`:183`）；
- クリーンアップエラーのみなら → `AggregateError(cleanupErrors, 'Video export cleanup failed')`（`:188`）。

FFmpeg 自身の `finish`／`terminate` 競合（`ffmpeg-supervisor.ts:198` `waitForCloseOrAbort`、`:247` `terminateOnce`）は、シグナルなしでも無限ハングしないことを保証する。ステージングされた sweep（`staged-output.ts:35` stranded-CI note）と上記の Chromium／Vite close を合わせると、backup-rename と install の間の `SIGKILL`（`staged-output.ts:35`、`export-session.ts:78` 付近）は**次の**実行で回復可能である。

### 6.4 クリーンアップ順序についてテストが検証すること

`packages/video-exporter/test/export-session.test.ts:60` fixtures は順序をエンコードする。ライフサイクル仕様として読む価値のある 2 つのテスト：

- _`reset` タイミング_（`:154` `fixture.events.indexOf('scene.reset')` が `scene.stop` と `scene.step` の間）— フレーム 0 契約の順序リグレッションガード。
- _失敗してもすべてを閉じる_（`:169` `progress.stop`、`:185` `scene.stop`、`:210` `progress.acquired` ↔ `progress.stop` 不変条件）— 各 `startFfmpeg` → `encoder.terminate`、各 `launchBrowser` → `browser.close`、各 `resolveInputTarget` → `target.close`、各 `createStagedOutput` → `output.cleanup`。`progress.stop` や `write` が throw しても同様である。

## 7. エクスポータが決定論的にしないもの

固定ステップはホストとコンポジタの非決定性を除去する。残る発生源はシーン作者の手にある：

- **`Math.random()`**：seed されなければならない（例：フレームインデックスで seed された `splitmix`／`xoshiro`）か、オーサリングされたキーフレームデータに置換する。フレームごとにジッターサンプリングするスクリーン空間サンプリングは、さもなければ実行ごとにちらつく。
- **ネットワーク／IO**：`networkidle0` 境界 vs それ以降で解決する fetch は、壁時計タイムアウトではなく最初の `step` 前にチェックされる readiness フラグでゲートして、決定論的に await すべきである。
- **非同期リソースロード**：フォント（`packages/text/src/fontMetrics.ts:82` `registerFontMetrics`）、mipmap レベル、あるいは `canUseSvgText`／`canUseMsdf`／`isReady` を報告する WebGL シェーダコンパイルは、t=0 の前に await されなければならない — さもなければフレーム 0 はキャプチャではなくデコーダとの競合になる。
- **プラットフォーム整形差異**：異なる `measureText` バックエンドや `deviceScaleFactor` の罠（ボス 02）は、異なるエンジンでキャプチャすれば依然として乖離する。`deviceScaleFactor: 1`（`export-session.ts:128`）は DPR バリアントを排除するが、フォント整形バリアントは排除しない — フレームアサーションはエンジン固有に保つこと。

この形式のものはすべて、`reset()` でゲートするか、seed するか、削除しなければならない。エクスポータは `dt` でステップされた同一 Scene が同一フレームを生成することを保証する。Scene が実行を跨いで同一であることは保証できない。

## 8. CLI vs API — 機能ではなく呼び出し元で選ぶ

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

1 つの関数、ビルダーなし。`normalizeOptions` は不正なジオメトリ／オーディオ／出力ディレクトリで同期的に throw する（`options.ts:58` 奇数寸法、`:78` 欠落 `audioPath`、`:90` 欠落 parent、`:97` 書き込み不可）。そのため誤設定されたジョブは Chromium 起動**前**に失敗する。`totalFrames = Math.ceil(fps*duration)` 契約（`options.ts:112`、`cli.ts:104` 同じ幅を再導出）は意図的に「fps×duration−たぶん 1」ではない — 短い duration でも正しいカウントになり、小数フレームは存在しない。API 上のシグナルは直接使われる（`options.ts:17`／`28` と `export-session.ts:32` `signal` フィールド in `FfmpegOptions`）。

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

セマンティクス：

- **ローカル vs リモート入力は暗黙的**：`url` が `http(s)://` のように見えればリモート（`options.ts:68`）、さもなければ Vite HTML シェル経由で提供されるローカルファイル（`input-target.ts:48`）。区別するためのフラグを渡す必要はない。
- **2 つ目の位置引数の拒否**（`cli.ts:82`）は「バッチ書き出し意図」トラップである — `vecto-export a.ts b.ts` は `a.ts` だけを書き出すのではなく `Unexpected extra arguments` で失敗する。
- **Exit コード**：`0` 成功（`cli.ts:137` フォールスルー）、`1` 検証／Browser／FFmpeg／クリーンアップ失敗（`cli.ts:141`／options throw／`RuntimeError`）、`130` on `SIGINT`、`143` on `SIGTERM`（`cli.ts:116`／`120`）。`vecto-export --help` は `parsed` に `url` が欠ける場合（`cli.ts:74` → `USAGE`）または throw された `parseArgs`（`:69` `Invalid arguments` + `USAGE`）で `runCli` にマップされる。
- **パッケージ契約**（`packages/video-exporter/package.json`）：`main: dist/index.js`、`bin: { vecto-export: dist/cli.js }`、`tsc` の後に `chmod 0755 dist/cli.js` でビルド（`package.json:10` `chmodSync`）。配布される `.d.ts` は `dist/index.d.ts`。`exportVideo` が唯一の公開 API サーフェスである（`index.ts:6`）。

### 8.3 判断の助け

| situation                                                                                                 | use                                                                                                                   |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| ストーリーやデモを成果物にレンダリングする CI ジョブ                                                      | `vecto-export ./src/demo/foo.ts -o out.mp4 --fps 60 --duration 3 -a voice.wav`（ワンショット、0／1／130／143 で終了） |
| Vite サーバ／ブラウザページを所有するか、書き出しを他の非同期処理と合成する必要があるライブラリ呼び出し元 | `exportVideo({ url, outputPath, signal })` from `index.ts:6`                                                          |
| ホストされた URL からの静止画／スナップショットや短いクリップのキャプチャ                                 | `vecto-export https://…/scene.html`（リモートパス、Vite なし）                                                        |

## 9. 失敗モード — どのコンポーネントが語っているか

各フェーズはフェーズを識別するメッセージを throw する。`cli.ts:140` はそれを `Export failed:` + 境界付き FFmpeg stderr 末尾（`ffmpeg-supervisor.ts:64` 64 KiB、exit コード `≠0` で常に付与 at `ffmpeg-supervisor.ts:117`）を持つ `AggregateError` として表面化する。失敗を割り当てるときは次を問う：

| failure                                                       | likely component                   | decisive clue                                                                 |
| ------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| `width and height must be even for H.264`                     | `options.ts:58`                    | 事前に、決して FFmpeg 時ではない                                              |
| `Input file does not exist` / `Audio file does not exist`     | `options.ts:70` / `:84`            | Chromium／Vite の前                                                           |
| `Output directory does not exist / is not writable`           | `options.ts:90` / `:97`            | Chromium／Vite の前                                                           |
| `Vite did not expose a TCP address`                           | `input-target.ts:106`              | ローカルエントリ、port 0 bind                                                 |
| `Failed to start FFmpeg`                                      | `ffmpeg-supervisor.ts:73`          | `spawn` `error` イベント                                                      |
| `FFmpeg exited before input completed`                        | `ffmpeg-supervisor.ts:115`         | 早期 exit、stderr 末尾を含む                                                  |
| `FFmpeg exited with code N: …` + stderr tail                  | `ffmpeg-supervisor.ts:117`         | `pix_fmt` / `yuv420p` / `libx264` misconfig                                   |
| `FFmpeg stdin failed` / `EPIPE`                               | `ffmpeg-supervisor.ts:80` / `:145` | 破壊されたパイプ、書き出し途中で抑制されない `write`                          |
| `FFmpeg did not exit after SIGTERM and SIGKILL`               | `ffmpeg-supervisor.ts:222`         | ウェッジ、シグナルなし `finish()` のみ                                        |
| `No canvas found`                                             | `export-session.ts:93`／`102`      | ページ内の `<canvas>` 欠落または非表示                                        |
| `window.vectoScene must provide callable stop() and step(dt)` | `export-session.ts:71`             | ページ契約が時間内に公開されなかった                                          |
| `Video export cleanup failed` (AggregateError)                | `export-session.ts:188`            | primary エラー後の `browser.close`／`target.close`／`output.cleanup` が throw |
| `Failed to install staged output…`                            | `staged-output.ts:126`             | `ATOMIC_MOVE` 2 ステップ rename 競合                                          |

上記リストは創作ではない：各文字列は与えられた `{file,}:line` に逐語的に存在する。

## 10. エクスポータとその境界をテストする

export パッケージは実際の Chromium や Vulkan インスタンスなしでテストされる — すべての外部は `ExportSessionDependencies`（`export-session.ts:27`）／`FfmpegDependencies`（`ffmpeg-supervisor.ts:21`）／`InputTargetDependencies`（`input-target.ts:29`）／`CliRuntime`（`cli.ts:11`）を通じて注入される `*Like` fake である。それらの fake がアサートすること：

- `packages/video-exporter/test/export-session.test.ts:30` `fixtures` は `scene.stop/ reset/ step`、`inputTarget.close`、`StagedOutput` create／commit／cleanup、`browser.newPage`、`FfmpegSupervisor.write/finish/terminate`、`progress.{start,update,stop}` を文字列 `events` として駆動し、アサーションは `indexOf`／`includes` でクエリする（`:154` reset タイミング、`:169` `progress.stop` 存在、`:185` 順序付けられたステップ、`:239` FFmpeg 前の不正契約）。
- キャンセルは、ループ前またはループ途中で abort された `AbortController` でモデル化される（`export-session.test.ts:295` `controller.abort('stop now')`）— `throwIfAborted` チェック（`export-session.ts:147`／`157`）は抑制された余分な `step`／`write` フレームとして可視になる。
- `test/cli.test.ts` は `parseArgs` 検証（`cli.ts:54` 不正引数 → `1`、`cli.ts:82` 余分な位置引数 → `1`）と `CliRuntime.once/off` シグナル seam（`cli.ts:123`／`142`）を駆動する。
- `test/staged-output.test.ts` は `rename`／`rm`／`readdir` fake（`staged-output.ts:6` deps）を駆動して `EEXIST/EPERM → backup → install → restore` ラダー（`staged-output.ts:108`／`112`／`119`）と孤児回収 sweep（`staged-output.ts:42`／`82`）をヒットさせる。

エクスポータが駆動できる最小のページ内シーン（`packages/video-exporter/test/fixtures/two-frame-scene.ts:8` から）：

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

`scene.start()` を呼ばないシーンは、エクスポータが駆動するまで静止したままであるため、このラッパー以外に `stop`／`reset` は不要である（`demo/data-chart.ts:227`／`ml-descent.ts:219` パターン）。

## 11. 落とし穴

- **`window.vectoScene` を忘れる**：ページがロードされ、エクスポータは 10 秒待つ（`export-session.ts:61`）、タイムアウトする。常に `scene.start()` の前または同期的に公開すること（`demo/data-chart.ts:222` `window.vectoScene = scene` before start）。
- **`reset` なしのロード時状態**：intro tween がフレーム 0 ジッターを持つ（`export-session.ts:78` ベース非決定性、`#646`）。`reset()` を追加すること。
- **壁時計ダイナミクス**：`tick` コールバック内の `Date.now()` は固定ステップを無効化する。`dt` を状態にスレッドするか、seed されたシミュレーション状態のみを使うこと。
- **奇数寸法**：検証を通過すると遅れてエンコード失敗し、不透明な FFmpeg stderr になる。`options.ts:58` は早期に拒否する。
- **「オーディオトラックなし」が「無音出力」を意味すると仮定する**：`audioPath` が省略された場合のみ書き出しは無音である（`options.ts:16`「canvas パイプライン自体は決して音を生成しない」）。不正なパスを渡すと Chromium の前で失敗する（`options.ts:80`）。そのため不正なオーディオが遅い驚きになることはない。
- **クリーンアップなしで kill する**：backup-rename と install の間の `kill -9`（`staged-output.ts:35`）は孤立した `.vecto-*` を残す。次の書き出しの `staleSweep`（`staged-output.ts:42`／`55` + `export-session.ts:122` 構築）が回復である — 書き出し途中で `.vecto-*` ファイルを手動で削除しないこと。
- **FFmpeg／Chromium なしで CI 上でブラウザ書き出しが動くと仮定する**：正しいパッケージをベンダし、独自 Chromium を出荷する場合は `PUPPETEER_EXECUTABLE_PATH` を設定すること（`browser.ts:49`／`README.md:10` インストール注意）。
- **CRITICAL**: 上記のすべての参照は `/mnt/data/Workspace/Projects/vectojs/vectojs` にピン留めされたリポジトリに対して grep 検証されている（`options.ts`、`export-session.ts`、`browser.ts`、`ffmpeg-supervisor.ts`、`input-target.ts`、`staged-output.ts`、`abort-error.ts`、`cli.ts`、`Scene.ts:3423`／`5609`／`1114`、`SKILL.md`、`references/export-recipes.md`）。

## 12. チェックリスト — 決定論的な書き出しをオーサリングする

- [ ] ページが呼び出し可能な `stop` と `step(dt)` を持つ `window.vectoScene` を公開している（`export-session.ts:71` 契約）。
- [ ] シーンがロード時状態をレンダリングする場合、同時に `reset()` も公開している（`export-session.ts:84` フレーム 0 修正、`#646`）。
- [ ] シーンは書き出しモードで `scene.start()` を呼ばないか、`stop()` が最初のキャプチャの前に確実にループをキャンセルする（`demo/math-teaching.ts:9`／`161` クロック注意、`export-session.ts:75` 検証直後の `scene.stop()`）。
- [ ] すべてのアニメータが `step` に渡された `dt` を積分する — `tick`／spring／tween 内で `Date.now`／壁時計読み取りはない（`Scene.ts:3423` 固定ステップパス、vs `Scene.ts:5609` クランプされた壁時計 `dt`）。
- [ ] ランダム性（あれば）は `frame` または決定論的 prng から seed される — フレームごとに `Math.random()` は実行を跨いでちらつく。
- [ ] フォント／Msdf／シェーダリソースは t=0 の前にロードされる（`packages/text/src/fontMetrics.ts:82` で await されない `registerFontMetrics`／`isReady` 競合なし）。
- [ ] 書き出しジオメトリは偶数である（`options.ts:58` `2 | dimensions`、`yuv420p` 要件）。`deviceScaleFactor: 1` が解像度主張で想定される（`export-session.ts:128`）。
- [ ] 中断が伝播する（API 上の `signal`、CLI での SIGINT／SIGTERM）。すべてのリソースが注入された `close/terminate/cleanup` を持つ（`export-session.ts:175` + `ffmpeg-supervisor.ts:249`）。
- [ ] 任意のオーディオはファイルパスである（`options.ts:78` `audioPath` 事前起動チェック）。ライブキャプチャではない — 書き出された canvas ビデオはそれなしでは無音である（`options.ts:14` 無音注意）。

## 関連

- **ボス 06（VMT ランタイム）**は `loop`（`Scene.ts:5569`）↔ `step`（`Scene.ts:3423`）双対性と、なぜ rAF ループはクランプするが `step` はしないのかを所有する。
- **ボス 07（レンダラー）**は `page.setViewport` 上の `deviceScaleFactor: 1`（`export-session.ts:128`）と、キャプチャクロックが固定されてもカリングが一貫し続ける理由を所有する。
- **ボス 08（WASM）**はここでは不可視である — ライブ WASM ストアと JS パリティは固定ステップ前進の下でもフレームごとに保たれなければならないが、エクスポータがそれを特別扱いすることは決してない。
- **ボス 01／02（選択 + テキスト）**は、t=0 の前に readiness が await されなければならないフォント／形状準備を提供する — さもなければフレーム 0 はキャプチャではなく競合を含む。
- **ボス 11+ プロダクトサーフェス（canvas アプリ）**は `@vectojs/video-exporter` が実際に使われる場所である — そちらからこのボスへ転送し、逆ではない。

## 参考文献

- `packages/video-exporter/src/index.ts:6` — 公開 `exportVideo(options)` エントリ、唯一エクスポートされるシンボル
- `packages/video-exporter/src/options.ts:40` — `normalizeOptions` + ジオメトリ／オーディオ／ディレクトリ検証 + `Math.ceil(fps*duration)`／`dt` 導出
- `packages/video-exporter/src/export-session.ts:111` — `ExportSession.run` ライフサイクル、`validateAndStopScene` 契約、ステージングされた `output.path` + ループ `page.evaluate(step(dt))` + `captureFrame`
- `packages/video-exporter/src/input-target.ts:48` — `resolveInputTarget` Vite vs リモート分岐、合成 `<canvas>` シェル + `transformIndexHtml`
- `packages/video-exporter/src/browser.ts:45` — `resolveBrowserLaunchOptions` 実行ファイル／サンドボックス引数
- `packages/video-exporter/src/ffmpeg-supervisor.ts:34` — `FfmpegSupervisor` 境界付き stderr、stdin EPIPE ガード、`write`／`finish`／`terminate`、`SIGTERM→SIGKILL` エスカレーション
- `packages/video-exporter/src/staged-output.ts:27` — 原子的なステージングファイル + バックアップ + `sweepStaleFiles` 孤児回収
- `packages/video-exporter/src/abort-error.ts:6` — `abortError(signal)` 共有 `AbortError` ファクトリ（`#661`）
- `packages/video-exporter/src/cli.ts:50` — `runCli` 引数解析、`130`／`143` シグナル exit コード、注入された `CliRuntime`
- `packages/core/src/tree/Scene.ts:3423` — `step(dt)` 固定ステップ契約：無条件レンダリング、クランプされない `dt`、`frameStats` ゼロ、計測上の落とし穴注意
- `packages/core/src/tree/Scene.ts:5569` ／ `5609` ／ `5636` ／ `1114` — `loop` 壁時計 `dt`、`100/cap` スナッピング、`MAX_FRAME_DT=100` クランプ
- `packages/video-exporter/package.json:10` — `dist/cli.js` + `chmod 0755` ビルド、`bin: vecto-export`、`main: dist/index.js`
- `packages/video-exporter/demo/*.ts:222` ／ `test/fixtures/two-frame-scene.ts:8` ／ `test/export-session.test.ts:154` — シーン契約使用箇所
- `.agents/skills/vectojs-video-exporter/SKILL.md:1` — エクスポータスキル（0.2 契約 + サンドボックスポリシー + よくある間違い）
- `.agents/skills/vectojs-video-exporter/references/export-recipes.md` — CLI／API スニペット
````
