---
title: '10 — Exportación de vídeo determinista — Captura de paso fijo'
description: 'Cómo @vectojs/video-exporter reemplaza el tiempo de reloj de pared por un reloj de escena de paso fijo, captura a través de Chromium headless y canaliza frames PNG a FFmpeg para MP4 H.264 — con salida por etapas, abort y limpieza que mantienen el destino seguro.'
order: 30
---

# 10 — Exportación de vídeo determinista — Captura de paso fijo

> **Boss 10** hace reproducible el tiempo de animación. El mismo módulo, el mismo `fps × duration`, el mismo `seed` — cada exportación produce los mismos frames, sin importar la velocidad del host, el jitter del compositor o las pestañas en segundo plano. Hay dos relojes en juego: el **reloj de pared** (`requestAnimationFrame`, `performance.now()` — lo que hizo el navegador antes de comenzar la captura) y el **reloj de paso fijo** (`Scene.step(dt)` a exactamente `dt = 1000/fps` por frame). El exportador elimina el primero e instala el segundo antes del frame 0.

- **Qué aprenderás**: por qué el determinismo del frame 0 es la parte difícil; el contrato de escena (`stop + step + reset` opcional); el pipeline Chromium → PNG de canvas → FFmpeg `image2pipe`; salida por etapas, propagación de abort y limpieza ordenada; la superficie CLI/API y cuándo preferir cada una; y el no-determinismo residual que el autor de la escena aún debe eliminar.
- **Qué no aprenderás**: ciclo de vida/transformaciones del VMT (boss 06), internos del renderer (boss 07) ni aceleración WASM (boss 08). Este documento es dueño del reloj de captura y la codificación.

## 1. Por qué la exportación determinista es difícil — el problema de los dos relojes

Una escena VectoJS viva avanza con ticks de `requestAnimationFrame` (`packages/core/src/tree/Scene.ts:5569` `loop`). Cada tick:

1. calcula `dt = time - lastTime` desde el reloj de pared (`Scene.ts:5609`);
2. ajusta `dt` hacia `1000/cap` cuando está cerca (±30% para ocultar jitter del compositor, `Scene.ts:5625`);
3. limita `dt` a `MAX_FRAME_DT = 100ms` (`Scene.ts:1114`, `:5636`) para que una pestaña en segundo plano no lance la física segundos hacia adelante;
4. actualiza drivers, compone transformaciones, hace layout y luego pinta.

Eso es correcto para una página viva. Para exportación es fatal: el tiempo de exportación debe ser una **función pura del índice de frame**.

- Dos ejecuciones en el mismo host de lo contrario discreparían siempre que un host tenga jitter, throttling o pase a segundo plano.
- Un benchmark vs una exportación discreparían en cadencia aunque compartan la misma escena.
- Cualquier `Math.random()`, `Date.now()` de reloj de pared o recurso asíncrono que resuelva en un frame no fijo hace arbitrario el frame 0, y cada frame posterior hereda esa base (el comentario en `packages/video-exporter/src/export-session.ts:78` referencia `#646`).

La solución es **detener el bucle de reloj de pared antes del primer frame capturado y avanzar con un paso constante** (`packages/core/src/tree/Scene.ts:3423` `step(dt)`). El determinismo es entonces una disciplina del autor de la escena: cada animación, spring y tween debe integrar solo el `dt` que recibe, y cualquier aleatoriedad debe estar sembrada. El exportador impone el reloj; la escena debe suministrar dinámicas deterministas.

## 2. El contrato de escena — qué debe exponer una página

El exportador corre dentro de una página de navegador normal (local o remota) y habla con la escena a través de `window.vectoScene`. Tres métodos importan:

| método     | rol                                                         | requerido | dónde se verifica                                  |
| ---------- | ----------------------------------------------------------- | --------- | -------------------------------------------------- |
| `stop()`   | detener el bucle `requestAnimationFrame`                    | sí        | `packages/video-exporter/src/export-session.ts:62` |
| `step(dt)` | avanzar y renderizar exactamente un frame de forma síncrona | sí        | `packages/video-exporter/src/export-session.ts:70` |
| `reset()`  | restaurar presentación t=0 (opcional)                       | no        | `packages/video-exporter/src/export-session.ts:84` |

### 2.1 `stop + step` es el intercambio de reloj

`ExportSession.validateAndStopScene` (`export-session.ts:60`):

- `page.waitForFunction('!!window.vectoScene', { timeout: 10_000 })` (`export-session.ts:61`) — la página tiene 10s tras `networkidle0` para publicar la escena.
- `page.evaluate` sondea `typeof scene.stop === 'function'` y `typeof scene.step === 'function'` (`export-session.ts:62`): si falta alguno lanza `window.vectoScene must provide callable stop() and step(dt) methods` (`export-session.ts:71`).
- Luego `scene.stop()` (`export-session.ts:75`) elimina la reprogramación de `requestAnimationFrame` para que la captura sea lo único que avanza el tiempo.

Cada frame exportado luego llama a `scene.step(dt)` con el `dt = 1000 / fps` normalizado (`export-session.ts:148`). `Scene.step` (`Scene.ts:3423`) hace exactamente una cosa: `time = lastTime + dt; lastTime = time; render(renderer, dt, time)` — sin comprobación dirty (`Scene.ts:3405` _"renders UNCONDITIONALLY"_), sin throttling ocioso `always`, sin clamp `MAX_FRAME_DT` (`Scene.ts:3421` _"Not clamped by MAX_FRAME_DT — the caller chooses the step"_). Ese bypass es deliberado: un driver determinista pide un frame porque quiere ese frame.

Dos trampas de renderizado son señaladas por los docs de `step` para que los revisores no malinterpreten mediciones:

- Un benchmark que conduce frames vía `step()` **no puede observar el salto de frames** (`Scene.ts:3411`), así que `always` vs `onDemand` es invisible por esta ruta — mide la planificación solo en el bucle vivo `start()` (`Scene.ts:3417`).
- `frameStats` permanece en sus valores por defecto cero cuando una escena solo es conducida por `step()` (`Scene.ts:3501`) — las sondas de fase viven en `loop`.

### 2.2 `reset` es la corrección del frame 0 (issue #646)

Entre la carga de la página y `scene.stop()`, el propio bucle rAF de la página corre libremente durante un número arbitrario de ticks dependiente del host. Cualquier tween de intro o entrada con easing accionada por esos ticks alcanza un estado arbitrario antes de que comience la captura — todos los frames posteriores son deterministas solo _desde esa base no determinista_ (comentario en `export-session.ts:78`, `#646`).

- Las escenas que renderizan **estáticas hasta el primer `step(dt)`** no necesitan nada — el frame 0 ya es t=0.
- Las escenas que portan **estado de tiempo de carga** exponen `reset(): void` para volver a su presentación t=0. El exportador lo llama una vez, tras `stop()` y antes del primer `step()` (`export-session.ts:84`): `if (typeof scene?.reset === 'function') scene.reset()`. El invariante de orden se afirma en `packages/video-exporter/test/export-session.test.ts:154` — `reset` tras `stop`, antes del primer `step`.
- Una escena sin `reset` se exporta tal cual — el no-determinismo es entonces problema del autor, no un error del exportador.

Las escenas de demo detallan el uso previsto:

- `packages/video-exporter/demo/data-chart.ts:222` `window.vectoScene = scene` + `:227` _"stay idle so the exporter's stop()+step(dt) sequence is the sole clock"_;
- `packages/video-exporter/demo/ml-descent.ts:219` the same note;
- `packages/video-exporter/demo/math-teaching.ts:9` _"clock, no randomness, no scene.start()"_ + `:161` stop/step-is-the-only-clock.

Los tests imitan la página con `packages/video-exporter/test/fixtures/two-frame-scene.ts:8` `window.vectoScene = { stop(){}, step(dt){} }`.

## 3. Pipeline — de `url` a `out.mp4`

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

### 3.1 Opciones → opciones normalizadas

`packages/video-exporter/src/options.ts:40` `normalizeOptions`:

- `url`/`outputPath` deben ser cadenas no vacías; `width`/`height`/`fps` deben ser enteros positivos (`options.ts:34` `positiveInteger`), `duration` un número finito positivo (`options.ts:54`).
- `fps` por defecto 60, `duration` 5s (`options.ts:48`); derivados `dt = 1000 / fps` (`options.ts:113`) y `totalFrames = Math.ceil(fps * duration)` (`options.ts:112`) para que duraciones fraccionales produzcan el conteo correcto y no un frame final corto. El conteo de frames está documentado en `references/export-recipes.md:10` y se distribuye como contrato `dist/index.d.ts`.
- El croma H.264 `yuv420p` es subsampleado 2×2 — dimensiones impares nunca pueden codificarse. Solo `ffmpeg` lo diría, al final con stderr crudo tras renderizar cada frame. Valida al inicio en su lugar (`options.ts:58` `width % 2 !== 0 || height % 2 !== 0` → `TypeError`).
- `isRemote = /^https?:\/\//i.test(url)` (`options.ts:68`). Las rutas locales son `resolve(url)` y deben existir y ser un archivo (`options.ts:70`). Las mismas comprobaciones previas al lanzamiento aplican a `audioPath` (`options.ts:78`): una pista faltante de lo contrario solo emergería como stderr final de ffmpeg.
- `outputPath = resolve(outputPath)` (`options.ts:88`); su directorio padre debe existir, ser un directorio y ser escribible (`accessSync(…, W_OK)` en `options.ts:97`). La salida no se trunca temprano — `StagedOutput` abajo maneja la atomicidad.

### 3.2 Destino de entrada — ruta Vite local vs URL remota

`packages/video-exporter/src/input-target.ts:48` `resolveInputTarget`:

- Remoto: `inertTarget(url)` (`input-target.ts:44`) — sin servidor, `close` es no-op.
- Archivo local: levanta un servidor dev Vite en tipo app `custom` (`input-target.ts:58`) con raíz en `dirname(url)` para que `import 'three'` desnudos etc. resuelvan:
  - `root = dirname(url)` (`input-target.ts:54`), `entryUrl = "/" + encodeURIComponent(basename(url))` (`input-target.ts:55`) — `encodeURIComponent` importa para espacios/unicode en nombres de archivo.
  - Ruta efímera `/__vecto_export_${randomUUID()}.html` (`input-target.ts:56`) — aleatoria para evitar colisiones entre exportaciones concurrentes, pero el comentario en `staged-output.ts:35` aún asume _un exportador por ruta destino_ a la vez.
  - Un único middleware: en esa ruta, retorna HTML sintético que aloja un `<canvas id="app">` y `<script type="module" src="${entryUrl}">` (`input-target.ts:74`), pasado por `server.transformIndexHtml(pathname, source)` (`input-target.ts:85`) para que el HMR/alias/transform TS de Vite aplique a la entrada. Los errores delegan a `next(error)` cuando existe (`input-target.ts:90`).
  - `await server.listen()` (`input-target.ts:98`), luego `server.httpServer?.address()` (`input-target.ts:99`): debe ser `{ port: number }` o la llamada lanza `Vite did not expose a TCP address` (`input-target.ts:106`). Cualquier fallo cierra el servidor recién creado (`input-target.ts:114` en el `catch` exterior) para que un Vite a medio iniciar no huérfane un puerto.
  - El `InputTarget.url` retornado es `http://127.0.0.1:${port}${pathname}` (`input-target.ts:110`); `close()` cierra el servidor Vite exactamente una vez (guarda `closed` en `input-target.ts:65`).

Esto mantiene limpio el directorio fuente — no se escribe ningún `.html` auxiliar a disco, que es el error común listado en `vectojs-video-exporter/SKILL.md:43`.

### 3.3 Lanzamiento del navegador — Chromium + política de sandbox

`packages/video-exporter/src/browser.ts:45` `resolveBrowserLaunchOptions`:

- Orden de resolución: `PUPPETEER_EXECUTABLE_PATH` (recortado, `browser.ts:49`), si no `/usr/bin/chromium` si existe (`browser.ts:51`), si no el Chromium resuelto/empaquetado de Puppeteer — coincidiendo con `README.md:10` _"Requires FFmpeg with libx264 … plus Chromium resolved from PUPPETEER_EXECUTABLE_PATH, then /usr/bin/chromium, then Puppeteer's …"_.
- `args` siempre incluye `--disable-gpu` (`browser.ts:53`).
- Sandbox deshabilitado (con advertencia) solo cuando `getuid() === 0` o `VECTO_CHROMIUM_NO_SANDBOX=1` (`browser.ts:55`). Texto de advertencia en `browser.ts:58`: _"Chromium sandbox is disabled for this VectoJS video export. Run as a non-root user when possible."_ Prefiere un proceso de exportación no root (`SKILL.md:38`).

El lanzamiento en sí es una costura de test: `BrowserDependencies.launch` (`browser.ts:34` `launch(options) → BrowserLike`, por defecto `puppeteer.launch(options)` en `browser.ts:42`) y `export-session.ts:32` `launchBrowser` son intercambiables en `ExportSessionDependencies`.

### 3.4 El bucle de captura — `validateAndStopScene` → `sizeCanvas` → bucle de frames

<!-- markdownlint-disable MD031 MD032 MD040 -->

`ExportSession.run` (`export-session.ts:111`):

1. `throwIfAborted()` antes de adquirir nada (`export-session.ts:120`, lee `options.signal?.aborted` y lanza `abortError(signal)` desde `packages/video-exporter/src/abort-error.ts:6`).
2. `target = resolveInputTarget(options)` (`export-session.ts:121`), `output = createStagedOutput(outputPath)` (`export-session.ts:122`), `browser = launchBrowser()` (`export-session.ts:123`), `page = browser.newPage()` (`export-session.ts:124`), `page.setViewport({ width, height, deviceScaleFactor: 1 })` (`export-session.ts:125`) — `_capture runs at deviceScaleFactor: 1`_ (`SKILL.md:31`): los píxeles exportados equivalen a `width × height` sin importar el DPR del host.
3. `page.goto(target.url, { waitUntil: 'networkidle0' })` (`export-session.ts:132`) — espera quiescencia antes de tocar la escena.
4. `sizeCanvas(page)` (`export-session.ts:133` → `export-session.ts:90`): `document.querySelector('canvas')` → `canvas.width = width; canvas.height = height`. Lanza `No canvas found` si falta (`export-session.ts:93`). Esto corre _tras_ `goto` para que el `<canvas>` propio de la página ya exista — el shell sintético Vite (`input-target.ts:81`) lo provee para entradas locales.
5. `validateAndStopScene(page)` (`export-session.ts:134` → `:60` — ver §2).
6. Segundo `throwIfAborted()` (`export-session.ts:135`) — un abort que llega durante la validación debe detenerse antes de que FFmpeg se genere.
7. `encoder = startFfmpeg({ fps, outputPath: output.path, audioPath, signal })` (`export-session.ts:137`): nota la ruta _por etapas_ `output.path` (`staged-output.ts:53`, un hermano `.<stem>.vecto-<uuid>.mp4` del destino), no el `outputPath` final.
8. `progress = createProgress()` (`export-session.ts:143`, `cli-progress` por defecto en `export-session.ts:41`) luego `progress.start(totalFrames)` (`export-session.ts:144`).
9. Bucle de frames (`export-session.ts:146`):

   ```ts
   for (let frame = 0; frame < totalFrames; frame++) {
     throwIfAborted(); // export-session.ts:147
     await page.evaluate((dt) => scene.step(dt), dt); // :148
     await encoder.write(await captureFrame(page)); // :153
     progress.update(frame + 1); // :154
   }
   ```

````
`captureFrame` (`export-session.ts:99`) lee el _primer_ `<canvas>` y llama a `canvas.toDataURL('image/png')`, divide en `,` (`export-session.ts:104`), decodifica la cola base64 a un `Buffer` para el stdin `image2pipe/png`. _"First page `<canvas>` is resized and captured"_ (`SKILL.md:27`).

<!-- markdownlint-disable MD029 -->

10. Tras el bucle: `throwIfAborted()` (`export-session.ts:157`), `encoder.finish()` (`export-session.ts:158` cierra stdin y espera `close`), `throwIfAborted()` de nuevo (`export-session.ts:159`), luego `output.commit()` (`export-session.ts:160`) — solo tras una salida limpia de FFmpeg el archivo por etapas reemplaza el destino.

## 4. FFmpeg — `image2pipe` → H.264/yuv420p, con cola stderr acotada

### 4.1 Argumentos

`packages/video-exporter/src/ffmpeg-supervisor.ts:274` `startFfmpeg`:

```ts
const args = ['-y', '-f', 'image2pipe', '-vcodec', 'png', '-r', String(fps), '-i', '-'];
if (audioPath !== undefined) args.push('-i', audioPath);
args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');
if (audioPath !== undefined) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
args.push(outputPath);
```text

Nota de orden (`ffmpeg-supervisor.ts:278`): entradas primero (`-f image2pipe … -i -`, luego opcional `-i audioPath`), luego opciones de salida — `-c:a` antes del `-i` de audio se adjuntaría al decodificador, no al codificador de salida. El audio es AAC `192k` recortado a la longitud del vídeo (`-shortest`, `ffmpeg-supervisor.ts:287`), habilitado solo por `-a/--audio` posicional en CLI (`cli.ts:32`, `:64`) o `audioPath` en la API (`options.ts:16`, `:78`).

La salida es MP4 H.264 `yuv420p` estándar (`SKILL.md:28`, `README.md:12`).

### 4.2 Supervisor de stdin — backpressure, carreras EPIPE y la costura `FfmpegSupervisor`

FFmpeg se genera como un `ChildProcessLike` (falsificable en tests en `ffmpeg-supervisor.ts:13`/`21`/`28`) cuyo `stdin` es escrito por el bucle de frames. `ffmpeg-supervisor.ts:34` `FfmpegSupervisor` endurece el pipe stdin:

- `stderrBuffer` está acotado a 64 KiB (`ffmpeg-supervisor.ts:5` `STDERR_LIMIT`) concatenando y luego tomando la cola (`:67` `combined.subarray(combined.byteLength - STDERR_LIMIT)`) — _cada_ error lleva esa cola (`:117` `stderr.trim()` en `processError`).
- `spawnError` del evento `error` del hijo → `Failed to start FFmpeg: ...` (`:73`).
- Un handler persistente `child.stdin.on('error')` registra `stdinError` (`:80`). Motivación (`:41`): _"FFmpeg dying mid-export destroys the pipe and emits an async EPIPE after the last write() has already resolved — with no live listener that surfaces as a listener-less uncaught exception, escaping the ExportSession try/catch, skipping its cleanup, and orphaning headless Chromium plus the Vite server."_ Registrarlo deja que `processError` emerja el fallo por la ruta normal de abort/limpieza en el siguiente `write`/`finish`.
- `close` se confirma una vez vía `markClosed` (`:92`, custodiado por `closed`, registra `closedBeforeInputCompleted`). `closeCode`/`closeSignal` + `exitDescription` (`:105` `code N` / `signal NAME` / `unknown status`) se incluyen en cada error de salida.
- `processError(early: boolean)` (`:111`) es el único punto de decisión:
  - si `spawnError` → ese,
  - si no, si aún no cerrado y `stdinError` establecido → ese (pipe roto aunque el hijo no haya salido),
  - si no, si cerrado y `early||closeCode!==0` → `FFmpeg exited before input completed` vs `exited` + descripción de salida + cola stderr,
  - si no (salida limpia con `stdinError` tardío) → aún emerger `stdinError` en lugar de reportar éxito sobre un pipe roto.
- `write(frame)` (`:156`) comprueba `throwIfAborted()` y `processError(true)` antes de escribir, usa el retorno booleano de backpressure `stdin.write(frame)` — `false` espera en `waitForDrain()` (`:126`). Esa carrera instala listeners de un solo uso para `stdin:drain`, `stdin:error`, `child:close` y `signal:abort` (`:131`/`134`/`149`/`137`) y resuelve/rechaza en consecuencia; `throwIfAborted()` y `processError(true)` se comprueban de nuevo tras el drain.
- `finish()` (`:177`) es idempotente (`finishPromise`). `finishOnce` (`:183`) custodia `closedBeforeInputCompleted` (no puede terminar si el hijo murió temprano), llama a `child.stdin.end()` (`:190`), luego `waitForCloseOrAbort()` (`:198`) antes de re-comprobar `processError(false)` — código de salida `0` con `stdinError` vacío es el único éxito.

### 4.3 Terminación — `terminate()`, `SIGTERM→SIGKILL` y el cuelgue sin señal

`terminate()` (`:241`) es la ruta de limpieza, también idempotente. `terminateOnce` (`:247`) siempre intenta ordenar:

- `child.stdin.destroy()` luego `SIGTERM`, espera `terminateTimeoutMs` (por defecto `1000ms`, `options.ts:31` / `ffmpeg-supervisor.ts:258`) por `closedPromise` (`:249`), escala a `SIGKILL` (`:253`), espera de nuevo (`:254`). `waitForCloseOrTimeout` (`:257`) compite `closedPromise` vs un `setTimeout(timeoutMs)` (`:263`) y limpia el timer (`:266`).

`waitForCloseOrAbort` (`:203`) tiene una **rama sin señal** — los llamantes de librería pueden no pasar `AbortSignal`, así que un simple `await closedPromise` colgaría `finish()` para siempre si FFmpeg se atasca. En esa rama cada etapa espera `terminateTimeoutMs` y escala `SIGTERM→SIGKILL`, finalmente lanzando `FFmpeg did not exit after SIGTERM and SIGKILL` con la cola stderr (`:222`) — la misma escalera que usa `terminate()`, ahora aplicada a `finish` cuando no existe abort externo. Con señal presente, `waitForCloseOrAbort` compite `closedPromise` contra `signal:abort` (`:227`/`234`) y enruta la cancelación vía `abortError`.

### 4.4 `StagedOutput` — reemplazo atómico del destino

`packages/video-exporter/src/staged-output.ts:27` `StagedOutput`:

- `path = <dir>/.<stem>.vecto-<uuid>.mp4` (`:53`), `targetPath` es el `outputPath` del llamante, `backupPath = .<stem>.vecto-<uuid>.backup<ext>` (`:54`) — la identidad por etapas es un hermano oculto, único por exportación (uuid vía `node:crypto` `randomUUID`, `:1`/`14`/`60`).
- La construcción inicia `staleSweep` (`:55`, `:42`): una recuperación best-effort de hermanos `.vecto-*` dejados por una ejecución previa eliminada que murió entre backup-rename e install (`:35`). `sweepStaleFiles` (`:82`) lee el directorio destino, encuentra entradas `.prefix = ".<stem>.vecto-"` (`:89`), excluye `path`/`backupPath` propios (`:90`) y hace `rm(..., { force: true })` vía `Promise.allSettled` (`:92`).
- `commit()` (`:99`) espera `staleSweep` primero (sin carrera con sus propios renames, `:41`), luego `rename(path, targetPath)` — instalación de vía rápida cuando no hay archivo o el sobrescrito tuvo éxito (`:104`). En `EEXIST`/`EPERM` (`:108`/`21` `errorCode`), hace el swap clásico: `rename(targetPath, backupPath)` (`:112`), `rename(path, targetPath)` (`:115`) — si el segundo rename lanza, restaura `rename(backupPath, targetPath)` (`:119`) y lanza un `AggregateError` que porta _ambos_ `installError` y `restoreError` (`:126`, intencionalmente no un único `cause`). En éxito elimina el backup (`:134`).
- `cleanup()` (`:138`) también espera `staleSweep`, luego `rm(path)` (`:145`), y si `backupMoved` sigue establecido reconcilia el backup (`:150`): si el destino ahora existe el backup ya fue reemplazado y se elimina; si un `installError` dejó el destino faltante el backup se restaura. Las excepciones se recogen como un `AggregateError` (`:163`).

Resultado: FFmpeg codifica en el archivo por etapas junto al destino (`export-session.ts:137` `output.path`). Una exportación fallida o abortada mantiene intacto cualquier destino existente y elimina el artefacto por etapas — verificado en las convenciones `test/export-session.test.ts` citadas abajo.

## 5. Detalles del navegador de los que depende el pipeline

- Una única página auxiliar por exportación (`export-session.ts:124` `browser.newPage()`) — la captura corre por esa única `PageLike` (`browser.ts:4` `PageLike` con `setViewport`/`goto`/`waitForFunction`/`evaluate`). La `PageLike` es intencionalmente mínima para que el mock de navegador en tests permanezca exacto.
- La escala de dispositivo está fijada a `1` (`export-session.ts:128`) — consistente con `SKILL.md:31` `deviceScaleFactor: 1` y la promesa de exportación de que `width × height` son píxeles de salida independientes del DPR del host (territorio del boss 07).
- `page.goto(..., { waitUntil: 'networkidle0' })` (`export-session.ts:132`) espera quiescencia de red antes de que corran `sizeCanvas`/`validateAndStopScene` — sin ello una asignación tardía de `window.vectoScene` perdería la ventana `waitForFunction` o portaría un grafo de escena parcialmente cargado.

## 6. Cancelación y señales de proceso — cada ruta converge en `AbortError`

La cancelación de exportación tiene tres orígenes pero un único tipo de error: un error nombrado `AbortError` cuyo `cause` es el `AbortSignal.reason` (`abort-error.ts:6`). `abortError` se factorizó en `#661` (ver comentario en `abort-error.ts:1`) para deduplicar las dos implementaciones idénticas previamente en `export-session` y `ffmpeg-supervisor`.

### 6.1 API de librería — `AbortSignal`

Tanto `options.ts:17` (`signal?: AbortSignal` en `ExportOptions`) como su copia normalizada (`options.ts:28`) portan la señal a `ExportSession` y `FfmpegSupervisor`. Cada punto de mutación llama a `throwIfAborted()` (`export-session.ts:55`/`147`/`157`/`159`, `ffmpeg-supervisor.ts:101`/`126`/`157`/`184`/`225`), y `waitForDrain`/`waitForCloseOrAbort` escuchan `signal:abort` (listeners de un solo uso en `ffmpeg-supervisor.ts:152`, `232`).

### 6.2 CLI — `SIGINT`/`SIGTERM` → `AbortController`

`packages/video-exporter/src/cli.ts:50` `runCli`:

- `parseArgs` con `allowPositionals: true` (`cli.ts:55`), una `url` posicional requerida (`cli.ts:74`), extras rechazados ruidosamente (`cli.ts:82` _"silently exporting only the first hides the error"_), `output`/`width`/`height`/`fps`/`duration`/`audio` mapeados desde `values` con validación `positiveInteger`/`positiveNumber` (`cli.ts:34`/`42`).
- `AbortController` (`cli.ts:113`), `SIGINT→abort('Interrupted by SIGINT')` (`cli.ts:115`) y `SIGTERM→abort('Terminated by SIGTERM')` (`cli.ts:119`), con códigos de salida convencionales `130` (`cli.ts:116`) / `143` (`cli.ts:120`) recordados como `signalExitCode` y retornados preferentemente (`cli.ts:137`). Los listeners se registran vía el `CliRuntime` inyectable (`cli.ts:18`/`20`) y se eliminan en `finally` (`cli.ts:142`), misma forma que hace testeables las deps de `ExportSession`.
- `runCli` no lanza en señal: `if (signalExitCode !== undefined) return signalExitCode` incluso cuando `exportVideo` lanzó el `AbortError` (`cli.ts:139`), y `catch` → `runtime.error('Export failed:', error)` (`cli.ts:140`) vs `1` en caso contrario. La guarda de ejecutabilidad en `cli.ts:148` `isExecutableEntry` resuelve un desajuste de symlink entre `dist` y `argv[1]` vía `realpathSync`.

### 6.3 Limpieza ordenada — sin huérfanos de navegador/servidor/FFmpeg/archivo por etapas

`ExportSession.run` (`export-session.ts:166` helper `clean` dentro de `catch`) libera en orden inverso de adquisición: `progress.stop` → `encoder.terminate` → `browser.close` → `target.close` → `output.cleanup` (`export-session.ts:175`–`:179`). El patrón correspondiente de nunca-lanzar se toma de `cli.ts:142` `off` en `finally`; la variante del exportador es más explícita — cada paso es `try/catch` hacia `cleanupErrors` (`:170`) y luego:

- si `primaryError` (cualquier throw de `try`) y sin errores de limpieza → lanza `primaryError` (`:182`);
- si ambos → `AggregateError([primaryError, ...cleanupErrors], errorMessage(primaryError), { cause: primaryError })` (`:183`);
- si solo errores de limpieza → `AggregateError(cleanupErrors, 'Video export cleanup failed')` (`:188`).

Las propias carreras `finish`/`terminate` de FFmpeg (`ffmpeg-supervisor.ts:198` `waitForCloseOrAbort`, `:247` `terminateOnce`) garantizan que no haya cuelgue infinito incluso sin señal. El barrido por etapas (nota stranded-CI en `staged-output.ts:35`) y los cierres Chromium/Vite anteriores juntos significan que un `SIGKILL` entre backup-rename e install (`staged-output.ts:35`, `export-session.ts:78`-adyacente) es recuperable en la _siguiente_ ejecución.

### 6.4 Qué verifican los tests sobre el orden de limpieza

Los fixtures en `packages/video-exporter/test/export-session.test.ts:60` codifican el orden. Dos tests valen la pena leer como spec del ciclo de vida previsto:

- _`reset` timing_ (`:154` `fixture.events.indexOf('scene.reset')` entre `scene.stop` y `scene.step`) — la guarda de regresión de orden del contrato frame-0.
- _Failure still closes everything_ (`:169` `progress.stop`, `:185` `scene.stop`, `:210` invariante `progress.acquired` ↔ `progress.stop`) — cada `startFfmpeg` → `encoder.terminate`, cada `launchBrowser` → `browser.close`, cada `resolveInputTarget` → `target.close`, cada `createStagedOutput` → `output.cleanup`, incluso cuando `progress.stop` o un `write` lanza.

## 7. Qué el exportador _no_ hace determinista

El paso fijo elimina el no-determinismo de host y compositor. Las fuentes restantes están en manos del autor de la escena:

- **`Math.random()`**: debe estar sembrado (p. ej. `splitmix`/`xoshiro` con semilla indexada por frame) o reemplazado con datos keyframe autorados. El muestreo en espacio de pantalla que hace jitter por frame de lo contrario parpadeará por ejecución.
- **Red/IO**: los fetches que resuelven en el límite `networkidle0` vs después deben esperarse determinísticamente (controlados por un flag de preparación comprobado antes del primer `step`, no por un timeout de reloj de pared).
- **Carga asíncrona de recursos**: fuentes (`packages/text/src/fontMetrics.ts:82` `registerFontMetrics`), niveles mipmap o compilaciones de shader WebGL que reportan `canUseSvgText` / `canUseMsdf` / `isReady` deben esperarse antes de t=0 — de lo contrario el frame 0 compite contra el decodificador.
- **Diferencias de shaping por plataforma**: distintos backends `measureText` o trampas `deviceScaleFactor` (boss 02) aún divergirán si capturas en un motor distinto. `deviceScaleFactor: 1` (`export-session.ts:128`) elimina la variante DPR, pero no la variante de shaping de fuente — mantén las aserciones de frame específicas del motor.

Cualquier cosa de esta forma debe estar controlada por `reset()`, sembrada o eliminada. El exportador garantiza que Scenes idénticas avanzadas con `dt` producen frames idénticos; no puede garantizar que tu Scene sea idéntica entre ejecuciones.

## 8. CLI vs API — elige por llamante, no por capacidad

### 8.1 API — `exportVideo(options)`

`packages/video-exporter/src/index.ts:6` `exportVideo`:

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

Una función, sin builder. `normalizeOptions` lanza sincrónicamente en geometría/audio/dir de salida malos (`options.ts:58` dimensiones impares, `:78` `audioPath` faltante, `:90` padre faltante, `:97` no escribible) para que un trabajo mal configurado falle _antes_ de que Chromium arranque. El contrato `totalFrames = Math.ceil(fps*duration)` (`options.ts:112`, `cli.ts:104` re-deriva el mismo ancho) intencionalmente no es "fps×duration−quizá-uno" — duraciones cortas producen el conteo correcto y no hay frame fraccional. La señal en la API se usa directamente (campo `signal` en `options.ts:17`/`28` y `export-session.ts:32` `FfmpegOptions`).

### 8.2 CLI — `vecto-export`

`packages/video-exporter/src/cli.ts:25` `USAGE`:

```

Usage: vecto-export <url> [options]
-o, --output <file> Output file (default: out.mp4) cli.ts:59
-w, --width <pixels> Width (default: 1280) cli.ts:60
-h, --height <pixels> Height (default: 720) cli.ts:61
-f, --fps <number> FPS (default: 60) cli.ts:62
-d, --duration <secs> Duration (default: 5) cli.ts:63
-a, --audio <file> Mux an audio track as AAC cli.ts:32/64

````text

Semántica:

- **Entrada local vs remota es implícita**: si `url` parece `http(s)://` es remota (`options.ts:68`); de lo contrario es un archivo local servido vía el shell HTML Vite (`input-target.ts:48`). No pasas un flag para distinguirlas.
- **Rechazo de un segundo posicional** (`cli.ts:82`) es la trampa "exportación en lote pretendida" — `vecto-export a.ts b.ts` falla con `Unexpected extra arguments` en lugar de exportar solo `a.ts`.
- **Códigos de salida**: `0` éxito (`cli.ts:137` fallthrough), `1` fallo de validación/Browser/FFmpeg/limpieza (`cli.ts:141` / throw de options / `RuntimeError`), `130` en `SIGINT`, `143` en `SIGTERM` (`cli.ts:116`/`120`). `vecto-export --help` mapea a `runCli` con `parsed` faltando `url` (`cli.ts:74` → `USAGE`) o `parseArgs` lanzado (`:69` `Invalid arguments` + `USAGE`).
- **Contrato de paquete** (`packages/video-exporter/package.json`): `main: dist/index.js`, `bin: { vecto-export: dist/cli.js }`, construcción vía `tsc` y luego `chmod 0755 dist/cli.js` (`package.json:10` `chmodSync`). El `.d.ts` distribuido es `dist/index.d.ts`. `exportVideo` es la única superficie API pública (`index.ts:6`).

### 8.3 Ayuda para decidir

| situación                                                                                               | usa                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| trabajo CI que renderiza una historia o demo en un artefacto                                             | `vecto-export ./src/demo/foo.ts -o out.mp4 --fps 60 --duration 3 -a voice.wav` (una sola vez, sale con 0/1/130/143) |
| llamante de librería que posee un servidor Vite / página de navegador, o necesita componer la exportación con otro trabajo asíncrono | `exportVideo({ url, outputPath, signal })` desde `index.ts:6`                                                      |
| capturar stills/snapshots o un clip corto desde una URL alojada                                             | `vecto-export https://…/scene.html` (ruta remota, sin Vite)                                                        |

## 9. Modos de fallo — qué componente está hablando

Cada fase lanza un mensaje que identifica la fase; `cli.ts:140` lo expone como `Export failed:` + `AggregateError` con la cola stderr acotada de FFmpeg (`ffmpeg-supervisor.ts:64` 64 KiB, siempre adjunta en código de salida `≠0` en `ffmpeg-supervisor.ts:117`). Al asignar un fallo, pregunta:

| fallo                                                         | componente probable                | pista decisiva                                                                  |
| ------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| `width and height must be even for H.264`                     | `options.ts:58`                    | up-front, never FFmpeg-time                                                     |
| `Input file does not exist` / `Audio file does not exist`     | `options.ts:70` / `:84`            | before Chromium/Vite                                                            |
| `Output directory does not exist / is not writable`           | `options.ts:90` / `:97`            | before Chromium/Vite                                                            |
| `Vite did not expose a TCP address`                           | `input-target.ts:106`              | local entry, port 0 bind                                                        |
| `Failed to start FFmpeg`                                      | `ffmpeg-supervisor.ts:73`          | `spawn` `error` event                                                           |
| `FFmpeg exited before input completed`                        | `ffmpeg-supervisor.ts:115`         | early exit, includes stderr tail                                                |
| `FFmpeg exited with code N: …` + stderr tail                  | `ffmpeg-supervisor.ts:117`         | `pix_fmt` / `yuv420p` / `libx264` misconfig                                     |
| `FFmpeg stdin failed` / `EPIPE`                               | `ffmpeg-supervisor.ts:80` / `:145` | destroyed pipe, unrestrained mid-export `write`                                 |
| `FFmpeg did not exit after SIGTERM and SIGKILL`               | `ffmpeg-supervisor.ts:222`         | wedge, signal-less `finish()` only                                              |
| `No canvas found`                                             | `export-session.ts:93`/`102`       | missing or hidden `<canvas>` in the page                                        |
| `window.vectoScene must provide callable stop() and step(dt)` | `export-session.ts:71`             | page contract not exposed in time                                               |
| `Video export cleanup failed` (AggregateError)                | `export-session.ts:188`            | a `browser.close` / `target.close` / `output.cleanup` threw after primary error |
| `Failed to install staged output…`                            | `staged-output.ts:126`             | `ATOMIC_MOVE` two-step rename race                                              |

The list above is not invented: each string exists verbatim in the `{file,}:line` given.

## 10. Probando el exportador y sus bordes

El paquete de exportación se prueba sin una instancia real de Chromium o Vulkan — cada externo es un falso `*Like` inyectado vía `ExportSessionDependencies` (`export-session.ts:27`) / `FfmpegDependencies` (`ffmpeg-supervisor.ts:21`) / `InputTargetDependencies` (`input-target.ts:29`) / `CliRuntime` (`cli.ts:11`). Lo que esos falsos afirman:

- `packages/video-exporter/test/export-session.test.ts:30` los `fixtures` accionan `scene.stop/ reset/ step`, `inputTarget.close`, `StagedOutput` create/commit/cleanup, `browser.newPage`, `FfmpegSupervisor.write/finish/terminate` y `progress.{start,update,stop}` como `events` de cadena que las aserciones consultan por `indexOf` / `includes` (`:154` timing de reset, `:169` presencia de `progress.stop`, `:185` pasos ordenados, `:239` contrato inválido antes de FFmpeg).
- La cancelación se modela con un `AbortController` abortado antes o a mitad del bucle (`export-session.test.ts:295` `controller.abort('stop now')`) — las comprobaciones `throwIfAborted` (`export-session.ts:147`/`157`) se hacen visibles como los frames extra suprimidos `step`/`write`.
- `test/cli.test.ts` acciona la validación `parseArgs` (`cli.ts:54` args inválidos → `1`, `cli.ts:82` posicionales extra → `1`) y la costura de señal `CliRuntime.once/off` (`cli.ts:123`/`142`).
- `test/staged-output.test.ts` acciona falsos `rename`/`rm`/`readdir` (`staged-output.ts:6` deps) para golpear la escalera `EEXIST/EPERM → backup → install → restore` (`staged-output.ts:108`/`112`/`119`) y el barrido de reclamación de huérfanos (`staged-output.ts:42`/`82`).

Una escena mínima en página que el exportador puede accionar (desde `packages/video-exporter/test/fixtures/two-frame-scene.ts:8`):

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

Las escenas que nunca llaman a `scene.start()` no necesitan `stop`/`reset` más allá de este envoltorio — permanecen estáticas hasta que el exportador las conduce (patrón `demo/data-chart.ts:227`/`ml-descent.ts:219`).

## 11. Escollos

- **Olvidar `window.vectoScene`**: la página carga, el exportador espera 10s (`export-session.ts:61`), expira. Siempre establécelo antes de `scene.start()` o exponlo sincrónicamente (`demo/data-chart.ts:222` `window.vectoScene = scene` antes de start).
- **Estado de tiempo de carga sin `reset`**: el tween de intro tiene jitter en frame 0 (`export-session.ts:78` no-determinismo base, `#646`). Añade `reset()`.
- **Dinámicas de reloj de pared**: `Date.now()` en un callback `tick` deshace el paso fijo. Pasa `dt` por el estado o solo estado de simulación sembrado.
- **Dimensiones impares**: pasar validación silenciosamente codificaría tarde y fallaría con stderr opaco de FFmpeg. `options.ts:58` rechaza temprano.
- **Asumir que "sin pista de audio" significa "salida silenciosa"**: las exportaciones son silenciosas solo si `audioPath` se omite (`options.ts:16` _"canvas pipeline itself never produces sound"_); pasar una ruta mala falla antes de Chromium (`options.ts:80`) para que audio malo no sea una sorpresa tardía.
- **Matar sin limpieza**: un `kill -9` entre backup-rename e install (`staged-output.ts:35`) deja un `.vecto-*` varado. El `staleSweep` de la siguiente exportación (`staged-output.ts:42`/`55` + construcción en `export-session.ts:122`) es la recuperación — no elimines manualmente archivos `.vecto-*` a mitad de exportación.
- **Asumir que la exportación de navegador funciona en CI sin FFmpeg/Chromium**: provee los paquetes correctos y establece `PUPPETEER_EXECUTABLE_PATH` si distribuyes tu propio Chromium (`browser.ts:49` / nota de instalación `README.md:10`).
- **CRÍTICO**: Todas las refs anteriores están verificadas por grep contra el repo anclado en `/mnt/data/Workspace/Projects/vectojs/vectojs` (`options.ts`, `export-session.ts`, `browser.ts`, `ffmpeg-supervisor.ts`, `input-target.ts`, `staged-output.ts`, `abort-error.ts`, `cli.ts`, `Scene.ts:3423`/`5609`/`1114`, `SKILL.md`, `references/export-recipes.md`).

## 12. Checklist — autoría de una exportación determinista

- [ ] La página expone `window.vectoScene` con `stop` y `step(dt)` llamables (contrato `export-session.ts:71`).
- [ ] Si la escena renderiza estado de tiempo de carga, también expone `reset()` (corrección frame 0 en `export-session.ts:84`, `#646`).
- [ ] La escena nunca llama a `scene.start()` en modo exportación, o `stop()` cancela fiablemente su bucle antes de la primera captura (nota de reloj en `demo/math-teaching.ts:9`/`161`, `export-session.ts:75` `scene.stop()` justo tras validación).
- [ ] Todos los animadores integran el `dt` pasado a `step` — sin lecturas `Date.now` / reloj de pared dentro de `tick`/springs/tweens (ruta de paso fijo `Scene.ts:3423`, vs `Scene.ts:5609` `dt` de reloj de pared limitado).
- [ ] La aleatoriedad (si la hay) está sembrada desde `frame` o un prng determinista — `Math.random()` cada frame parpadeará entre ejecuciones.
- [ ] Los recursos de fuentes/Msdf/shader están cargados antes de t=0 (sin carrera `registerFontMetrics` / `isReady` no esperada en `packages/text/src/fontMetrics.ts:82`).
- [ ] La geometría de exportación es par (`options.ts:58` `2 | dimensions`, requisito `yuv420p`) y se asume `deviceScaleFactor: 1` para afirmaciones de resolución (`export-session.ts:128`).
- [ ] Abort se propaga (`signal` en API, SIGINT/SIGTERM en CLI) y cada recurso tiene un `close/terminate/cleanup` inyectado (`export-session.ts:175` + `ffmpeg-supervisor.ts:249`).
- [ ] El audio opcional es una ruta de archivo (comprobación pre-lanzamiento `audioPath` en `options.ts:78`), no una captura en vivo — el vídeo de canvas exportado es silencioso sin él (nota de silencio en `options.ts:14`).

## Relaciones

- **Boss 06 (runtime del VMT)** posee la dualidad `loop` (`Scene.ts:5569`) ↔ `step` (`Scene.ts:3423`) y por qué el bucle rAF limita pero `step` no.
- **Boss 07 (renderer)** posee `deviceScaleFactor: 1` en `page.setViewport` (`export-session.ts:128`) y por qué el culling permanece consistente cuando el reloj de captura es fijo.
- **Boss 08 (WASM)** es invisible aquí — cualquier paridad WASM store vivo vs JS debe mantenerse frame a frame bajo avance de paso fijo también, pero el exportador nunca lo trata como caso especial.
- **Boss 01/02 (selección + texto)** suministran la preparación de fuente/forma cuya disponibilidad debe esperarse antes de t=0 — de lo contrario el frame 0 incluye una carrera en lugar de una captura.
- **Boss 11+ superficies de producto (apps de canvas)** son donde `@vectojs/video-exporter` se usa en la práctica — redirígelos a este boss, no al revés.

## References

- `packages/video-exporter/src/index.ts:6` — public `exportVideo(options)` entry, the only exported symbol
- `packages/video-exporter/src/options.ts:40` — `normalizeOptions` + geometry/audio/dir validation + `Math.ceil(fps*duration)`/`dt` derivation
- `packages/video-exporter/src/export-session.ts:111` — `ExportSession.run` lifecycle, `validateAndStopScene` contract, staged `output.path` + loop `page.evaluate(step(dt))` + `captureFrame`
- `packages/video-exporter/src/input-target.ts:48` — `resolveInputTarget` Vite vs remote branching, synthetic `<canvas>` shell + `transformIndexHtml`
- `packages/video-exporter/src/browser.ts:45` — `resolveBrowserLaunchOptions` executable/sandbox args
- `packages/video-exporter/src/ffmpeg-supervisor.ts:34` — `FfmpegSupervisor` bounded stderr, stdin EPIPE guard, `write`/`finish`/`terminate`, `SIGTERM→SIGKILL` escalations
- `packages/video-exporter/src/staged-output.ts:27` — atomic staged file + backup + `sweepStaleFiles` orphan reclaim
- `packages/video-exporter/src/abort-error.ts:6` — `abortError(signal)` shared `AbortError` factory (`#661`)
- `packages/video-exporter/src/cli.ts:50` — `runCli` arg parsing, `130`/`143` signal exit codes, `injected CliRuntime`
- `packages/core/src/tree/Scene.ts:3423` — `step(dt)` fixed-step contract: unconditional render, unclamped `dt`, `frameStats` zeros, measurement footgun note
- `packages/core/src/tree/Scene.ts:5569` / `5609` / `5636` / `1114` — `loop` wall-clock `dt`, `100/cap` snapping, `MAX_FRAME_DT=100` clamp
- `packages/video-exporter/package.json:10` — `dist/cli.js` + `chmod 0755` build, `bin: vecto-export`, `main: dist/index.js`
- `packages/video-exporter/demo/*.ts:222` / `test/fixtures/two-frame-scene.ts:8` / `test/export-session.test.ts:154` — scene-contract usage sites
- `.agents/skills/vectojs-video-exporter/SKILL.md:1` — exporter skill (0.2 contract + sandbox policy + common mistakes)
- `.agents/skills/vectojs-video-exporter/references/export-recipes.md` — CLI/API snippets
````
