---
title: '10 — Export vidéo déterministe — Capture à pas fixe'
description: "Comment @vectojs/video-exporter remplace le temps d'horloge murale par une horloge de scène à pas fixe, capture via Chromium headless et pipe les frames PNG vers FFmpeg pour un MP4 H.264 — avec sortie étagée, abort et cleanup qui gardent la destination sûre."
order: 30
---

# 10 — Export vidéo déterministe — Capture à pas fixe

> **Boss 10** rend le temps d'animation reproductible. Le même module, le même `fps × duration`, le même `seed` — chaque export produit les mêmes frames, quelle que soit la vitesse de l'hôte, le jitter du compositeur ou les onglets en arrière-plan. Deux horloges sont en jeu : l'**horloge murale** (`requestAnimationFrame`, `performance.now()` — ce que le navigateur faisait avant le début de la capture) et l'**horloge à pas fixe** (`Scene.step(dt)` à exactement `dt = 1000/fps` par frame). L'exporteur tue la première et installe la seconde avant la frame 0.

- **Ce que vous apprendrez** : pourquoi le déterminisme de la frame 0 est la partie difficile ; le contrat de scène (`stop + step + reset` optionnel) ; le pipeline Chromium → canvas PNG → `image2pipe` FFmpeg ; la sortie étagée, la propagation d'abort et le cleanup ordonné ; la surface CLI/API et quand préférer l'une ou l'autre ; et le non-déterminisme résiduel qu'un auteur de scène doit encore éliminer.
- **Ce que vous n'apprendrez pas** : cycle de vie/transforms VMT (boss 06), internals du renderer (boss 07) ou accélération WASM (boss 08). Ce doc possède l'horloge de capture et l'encode.

## 1. Pourquoi l'export déterministe est difficile — le problème des deux horloges

Une scène VectoJS live avance sur les ticks `requestAnimationFrame` (`packages/core/src/tree/Scene.ts:5569` `loop`). Chaque tick :

1. calcule `dt = time - lastTime` depuis l'horloge murale (`Scene.ts:5609`) ;
2. snap `dt` vers `1000/cap` quand proche (±30% pour masquer le jitter du compositeur, `Scene.ts:5625`) ;
3. clamp `dt` à `MAX_FRAME_DT = 100ms` (`Scene.ts:1114`, `:5636`) pour qu'un onglet en arrière-plan ne projette pas la physique en avant de plusieurs secondes ;
4. met à jour les drivers, compose les transforms, layoute, puis peint.

C'est correct pour une page live. Pour l'export c'est fatal : le temps d'export doit être une **fonction pure de l'index de frame**.

- Deux runs sur le même hôte divergeraient sinon dès que l'un jitter, throttle ou passe en arrière-plan.
- Un benchmark vs un export divergerait sur la cadence même s'ils partagent la même scène.
- Tout `Math.random()`, `Date.now()` d'horloge murale ou ressource async qui se résout à une frame non fixe rend la frame 0 arbitraire, et chaque frame ultérieure hérite de cette base (le commentaire `packages/video-exporter/src/export-session.ts:78` référence `#646`).

Le fix est de **stopper la boucle d'horloge murale avant la première frame capturée et avancer à pas constant** (`packages/core/src/tree/Scene.ts:3423` `step(dt)`). Le déterminisme est alors une discipline d'auteur de scène : chaque animation, spring et tween doit intégrer uniquement le `dt` qu'on lui donne, et tout aléatoire doit être seedé. L'exporteur impose l'horloge ; la scène doit fournir des dynamiques déterministes.

## 2. Le contrat de scène — ce qu'une page doit exposer

L'exporteur tourne dans une page navigateur normale (locale ou distante) et parle à la scène via `window.vectoScene`. Trois méthodes comptent :

| méthode    | rôle                                                   | requis | où vérifié                                         |
| ---------- | ------------------------------------------------------ | ------ | -------------------------------------------------- |
| `stop()`   | stoppe la boucle `requestAnimationFrame`               | oui    | `packages/video-exporter/src/export-session.ts:62` |
| `step(dt)` | avance et rend exactement une frame de façon synchrone | oui    | `packages/video-exporter/src/export-session.ts:70` |
| `reset()`  | restaure la présentation t=0 (optionnel)               | non    | `packages/video-exporter/src/export-session.ts:84` |

### 2.1 `stop + step` est le swap d'horloge

`ExportSession.validateAndStopScene` (`export-session.ts:60`) :

- `page.waitForFunction('!!window.vectoScene', { timeout: 10_000 })` (`export-session.ts:61`) — la page a 10s après `networkidle0` pour publier la scène.
- `page.evaluate` sonde `typeof scene.stop === 'function'` et `typeof scene.step === 'function'` (`export-session.ts:62`) : si l'une manque il lève `window.vectoScene must provide callable stop() and step(dt) methods` (`export-session.ts:71`).
- Puis `scene.stop()` (`export-session.ts:75`) tue le re-scheduling `requestAnimationFrame` pour que la capture soit la seule chose qui fait avancer le temps.

Chaque frame exportée appelle alors `scene.step(dt)` avec le `dt` normalisé `dt = 1000 / fps` (`export-session.ts:148`). `Scene.step` (`Scene.ts:3423`) fait exactement une chose : `time = lastTime + dt; lastTime = time; render(renderer, dt, time)` — pas de check dirty (`Scene.ts:3405` _"renders UNCONDITIONALLY"_), pas de throttle idle `always`, pas de clamp `MAX_FRAME_DT` (`Scene.ts:3421` _"Not clamped by MAX_FRAME_DT — the caller chooses the step"_). Ce bypass est délibéré : un driver déterministe demande une frame parce qu'il veut cette frame.

Deux footguns de rendu sont soulignés par les docs de `step` pour que les reviewers ne lisent pas mal les mesures :

- Un benchmark pilotant des frames via `step()` **ne peut observer le frame skipping** (`Scene.ts:3411`), donc `always` vs `onDemand` est invisible par ce chemin — mesurez le scheduling uniquement sur la boucle live `start()` (`Scene.ts:3417`).
- `frameStats` reste à ses zéros par défaut quand une scène est uniquement pilotée par `step()` (`Scene.ts:3501`) — les sondes de phase vivent sur `loop`.

### 2.2 `reset` est le fix de la frame 0 (issue #646)

Entre le chargement de la page et `scene.stop()`, la propre boucle rAF de la page tourne librement pendant un nombre arbitraire de ticks dépendant de l'hôte. Tout tween d'intro ou entrée easée pilotée par ces ticks atteint un état arbitraire avant le début de la capture — toutes les frames ultérieures ne sont déterministes qu'_à partir de cette base non déterministe_ (commentaire `export-session.ts:78`, `#646`).

- Les scènes qui rendent **statiques jusqu'au premier `step(dt)`** n'ont besoin de rien — la frame 0 est déjà à t=0.
- Les scènes qui portent un **état au chargement** exposent `reset(): void` pour revenir à leur présentation t=0. L'exporteur l'appelle une fois, après `stop()` et avant le premier `step()` (`export-session.ts:84`) : `if (typeof scene?.reset === 'function') scene.reset()`. L'invariant d'ordre est asserté dans `packages/video-exporter/test/export-session.test.ts:154` — `reset` après `stop`, avant le premier `step`.
- Une scène sans `reset` est exportée telle quelle — le non-déterminisme est alors le problème de l'auteur, pas une erreur de l'exporteur.

Les scènes de démo explicitent l'usage prévu :

- `packages/video-exporter/demo/data-chart.ts:222` `window.vectoScene = scene` + `:227` _"stay idle so the exporter's stop()+step(dt) sequence is the sole clock"_ ;
- `packages/video-exporter/demo/ml-descent.ts:219` même note ;
- `packages/video-exporter/demo/math-teaching.ts:9` _"clock, no randomness, no scene.start()"_ + `:161` stop/step-est-la-seule-horloge.

Les tests imitent la page avec `packages/video-exporter/test/fixtures/two-frame-scene.ts:8` `window.vectoScene = { stop(){}, step(dt){} }`.

## 3. Pipeline — de `url` à `out.mp4`

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

### 3.1 Options → options normalisées

`packages/video-exporter/src/options.ts:40` `normalizeOptions` :

- `url`/`outputPath` doivent être des strings non vides ; `width`/`height`/`fps` des entiers positifs (`options.ts:34` `positiveInteger`), `duration` un nombre fini positif (`options.ts:54`).
- `fps` défaut à 60, `duration` à 5s (`options.ts:48`) ; dérivés `dt = 1000 / fps` (`options.ts:113`) et `totalFrames = Math.ceil(fps * duration)` (`options.ts:112`) pour que les durées fractionnaires produisent le bon compte et non une dernière frame courte. Le compte de frames est documenté dans `references/export-recipes.md:10` et livré comme contrat `dist/index.d.ts`.
- Le chroma H.264 `yuv420p` est sous-échantillonné 2×2 — des dimensions impaires ne peuvent jamais encoder. Seul `ffmpeg` le dirait, à la fin avec stderr brut après avoir rendu chaque frame. Validez en amont à la place (`options.ts:58` `width % 2 !== 0 || height % 2 !== 0` → `TypeError`).
- `isRemote = /^https?:\/\//i.test(url)` (`options.ts:68`). Les chemins locaux sont `resolve(url)` et doivent exister et être un fichier (`options.ts:70`). Les mêmes checks pré-lancement s'appliquent à `audioPath` (`options.ts:78`) : un track manquant ne surgirait sinon qu'en stderr FFmpeg final.
- `outputPath = resolve(outputPath)` (`options.ts:88`) ; son répertoire parent doit exister, être un répertoire et être writable (`accessSync(…, W_OK)` à `options.ts:97`). La sortie n'est pas tronquée tôt — `StagedOutput` ci-dessous gère l'atomicité.

### 3.2 Input target — route Vite locale vs URL distante

`packages/video-exporter/src/input-target.ts:48` `resolveInputTarget` :

- Distant : `inertTarget(url)` (`input-target.ts:44`) — pas de serveur, `close` est no-op.
- Fichier local : lance un serveur dev Vite en app type `custom` (`input-target.ts:58`) rooté à `dirname(url)` pour que les `import 'three'` nus etc. résolvent :
  - `root = dirname(url)` (`input-target.ts:54`), `entryUrl = "/" + encodeURIComponent(basename(url))` (`input-target.ts:55`) — `encodeURIComponent` compte pour espaces/unicode dans les noms de fichiers.
  - Pathname éphémère `/__vecto_export_${randomUUID()}.html` (`input-target.ts:56`) — aléatoire pour éviter les collisions entre exports concurrents, mais le commentaire à `staged-output.ts:35` suppose encore _un exporteur par chemin cible_ à la fois.
  - Un seul middleware : sur ce pathname, retourne un HTML synthétique hébergeant un `<canvas id="app">` et `<script type="module" src="${entryUrl}">` (`input-target.ts:74`), passé via `server.transformIndexHtml(pathname, source)` (`input-target.ts:85`) pour que HMR/alias/transform TS de Vite s'applique à l'entrée. Les erreurs délèguent à `next(error)` quand présent (`input-target.ts:90`).
  - `await server.listen()` (`input-target.ts:98`), puis `server.httpServer?.address()` (`input-target.ts:99`) : doit être `{ port: number }` sinon l'appel lève `Vite did not expose a TCP address` (`input-target.ts:106`). Tout échec ferme le serveur nouvellement créé (`input-target.ts:114` dans le `catch` externe) pour qu'un Vite à moitié démarré n'orpheline pas un port.
  - `InputTarget.url` retournée est `http://127.0.0.1:${port}${pathname}` (`input-target.ts:110`) ; `close()` ferme le serveur Vite exactement une fois (garde `closed` `input-target.ts:65`).

Cela garde le répertoire source propre — aucun `.html` helper n'est écrit sur disque, ce qui est l'erreur commune listée dans `vectojs-video-exporter/SKILL.md:43`.

### 3.3 Lancement navigateur — Chromium + politique sandbox

`packages/video-exporter/src/browser.ts:45` `resolveBrowserLaunchOptions` :

- Ordre de résolution : `PUPPETEER_EXECUTABLE_PATH` (trimmed, `browser.ts:49`), sinon `/usr/bin/chromium` si présent (`browser.ts:51`), sinon le Chromium résolu/bundlé de Puppeteer — correspondant à `README.md:10` _"Requires FFmpeg with libx264 … plus Chromium resolved from PUPPETEER_EXECUTABLE_PATH, then /usr/bin/chromium, then Puppeteer's …"_.
- `args` inclut toujours `--disable-gpu` (`browser.ts:53`).
- Sandbox désactivée (avec warning) uniquement quand `getuid() === 0` ou `VECTO_CHROMIUM_NO_SANDBOX=1` (`browser.ts:55`). Texte du warning à `browser.ts:58` : _"Chromium sandbox is disabled for this VectoJS video export. Run as a non-root user when possible."_ Préférez un process d'export non-root (`SKILL.md:38`).

Le lancement lui-même est un seam de test : `BrowserDependencies.launch` (`browser.ts:34` `launch(options) → BrowserLike`, défaut `puppeteer.launch(options)` à `browser.ts:42`) et `export-session.ts:32` `launchBrowser` sont swappables dans `ExportSessionDependencies`.

### 3.4 La boucle de capture — `validateAndStopScene` → `sizeCanvas` → boucle de frames

<!-- markdownlint-disable MD031 MD032 MD040 -->

`ExportSession.run` (`export-session.ts:111`) :

1. `throwIfAborted()` avant d'acquérir quoi que ce soit (`export-session.ts:120`, lit `options.signal?.aborted` et lève `abortError(signal)` depuis `packages/video-exporter/src/abort-error.ts:6`).
2. `target = resolveInputTarget(options)` (`export-session.ts:121`), `output = createStagedOutput(outputPath)` (`export-session.ts:122`), `browser = launchBrowser()` (`export-session.ts:123`), `page = browser.newPage()` (`export-session.ts:124`), `page.setViewport({ width, height, deviceScaleFactor: 1 })` (`export-session.ts:125`) — `_capture runs at deviceScaleFactor: 1`_ (`SKILL.md:31`) : les pixels exportés égalent `width × height` quel que soit le DPR hôte.
3. `page.goto(target.url, { waitUntil: 'networkidle0' })` (`export-session.ts:132`) — attendre la quiescence avant de toucher la scène.
4. `sizeCanvas(page)` (`export-session.ts:133` → `export-session.ts:90`) : `document.querySelector('canvas')` → `canvas.width = width; canvas.height = height`. Lève `No canvas found` si manquant (`export-session.ts:93`). Ceci s'exécute _après_ `goto` pour que le propre `<canvas>` de la page existe déjà — le shell synthétique Vite (`input-target.ts:81`) le fournit pour les entrées locales.
5. `validateAndStopScene(page)` (`export-session.ts:134` → `:60` — voir §2).
6. Second `throwIfAborted()` (`export-session.ts:135`) — un abort arrivant pendant la validation doit stopper avant que FFmpeg ne spawn.
7. `encoder = startFfmpeg({ fps, outputPath: output.path, audioPath, signal })` (`export-session.ts:137`) : notez le chemin _étagé_ `output.path` (`staged-output.ts:53`, un sibling `.<stem>.vecto-<uuid>.mp4` de la destination), pas le `outputPath` final.
8. `progress = createProgress()` (`export-session.ts:143`, défaut `cli-progress` à `export-session.ts:41`) puis `progress.start(totalFrames)` (`export-session.ts:144`).
9. Boucle de frames (`export-session.ts:146`) :

   ```ts
   for (let frame = 0; frame < totalFrames; frame++) {
     throwIfAborted(); // export-session.ts:147
     await page.evaluate((dt) => scene.step(dt), dt); // :148
     await encoder.write(await captureFrame(page)); // :153
     progress.update(frame + 1); // :154
   }
   ```

````

`captureFrame` (`export-session.ts:99`) lit le _premier_ `<canvas>` et appelle `canvas.toDataURL('image/png')`, split sur `,` (`export-session.ts:104`), décode la queue base64 en `Buffer` pour le stdin `image2pipe/png`. _"First page `<canvas>` is resized and captured"_ (`SKILL.md:27`).

<!-- markdownlint-disable MD029 -->

10. Après la boucle : `throwIfAborted()` (`export-session.ts:157`), `encoder.finish()` (`export-session.ts:158` ferme stdin et attend `close`), `throwIfAborted()` à nouveau (`export-session.ts:159`), puis `output.commit()` (`export-session.ts:160`) — seulement après une sortie FFmpeg propre le fichier étagé remplace la destination.

## 4. FFmpeg — `image2pipe` → H.264/yuv420p, avec une queue stderr bornée

### 4.1 Arguments

`packages/video-exporter/src/ffmpeg-supervisor.ts:274` `startFfmpeg` :

```ts
const args = ['-y', '-f', 'image2pipe', '-vcodec', 'png', '-r', String(fps), '-i', '-'];
if (audioPath !== undefined) args.push('-i', audioPath);
args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');
if (audioPath !== undefined) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
args.push(outputPath);
```text

Note d'ordre (`ffmpeg-supervisor.ts:278`) : inputs d'abord (`-f image2pipe … -i -`, puis optionnel `-i audioPath`), puis options de sortie — `-c:a` avant le `-i` audio s'attacherait au décodeur, pas à l'encodeur de sortie. L'audio est AAC `192k` tronqué à la longueur vidéo (`-shortest`, `ffmpeg-supervisor.ts:287`), activé uniquement par `-a/--audio` positionnel sur la CLI (`cli.ts:32`, `:64`) ou `audioPath` dans l'API (`options.ts:16`, `:78`).

La sortie est du MP4 H.264 standard `yuv420p` (`SKILL.md:28`, `README.md:12`).

### 4.2 Superviseur stdin — backpressure, courses EPIPE et le seam `FfmpegSupervisor`

FFmpeg est spawné comme un `ChildProcessLike` (fakeable en test à `ffmpeg-supervisor.ts:13`/`21`/`28`) dont `stdin` est écrit par la boucle de frames. `ffmpeg-supervisor.ts:34` `FfmpegSupervisor` durcit le pipe stdin :

- `stderrBuffer` est borné à 64 KiB (`ffmpeg-supervisor.ts:5` `STDERR_LIMIT`) en concaténant puis tailant (`:67` `combined.subarray(combined.byteLength - STDERR_LIMIT)`) — _chaque_ erreur porte cette queue (`:117` `stderr.trim()` dans `processError`).
- `spawnError` depuis l'événement child `error` → `Failed to start FFmpeg: ...` (`:73`).
- Un handler persistant `child.stdin.on('error')` enregistre `stdinError` (`:80`). Motivation (`:41`) : _"FFmpeg dying mid-export destroys the pipe and emits an async EPIPE after the last write() has already resolved — with no live listener that surfaces as a listener-less uncaught exception, escaping the ExportSession try/catch, skipping its cleanup, and orphaning headless Chromium plus the Vite server."_ L'enregistrer laisse `processError` surfacer l'échec via le chemin abort/cleanup normal au prochain `write`/`finish`.
- `close` est commité une fois via `markClosed` (`:92`, gardé par `closed`, enregistre `closedBeforeInputCompleted`). `closeCode`/`closeSignal` + `exitDescription` (`:105` `code N` / `signal NAME` / `unknown status`) sont inclus dans chaque erreur de sortie.
- `processError(early: boolean)` (`:111`) est le point de décision unique :
  - si `spawnError` → celui-là,
  - sinon si pas encore clos et `stdinError` posé → celui-là (broken pipe même si child pas encore exit),
  - sinon si clos et `early||closeCode!==0` → `FFmpeg exited before input completed` vs `exited` + description exit + queue stderr,
  - sinon (exit propre avec `stdinError` tardif) → surface quand même `stdinError` plutôt que rapporter succès sur un pipe cassé.
- `write(frame)` (`:156`) vérifie `throwIfAborted()` et `processError(true)` avant l'écriture, utilise le retour booléen `stdin.write(frame)` de backpressure — `false` attend dans `waitForDrain()` (`:126`). Cette course installe des listeners one-shot pour `stdin:drain`, `stdin:error`, `child:close` et `signal:abort` (`:131`/`134`/`149`/`137`) et résout/rejette en conséquence ; `throwIfAborted()` et `processError(true)` sont revérifiés après drain.
- `finish()` (`:177`) est idempotent (`finishPromise`). `finishOnce` (`:183`) garde `closedBeforeInputCompleted` (ne peut finir si le child est mort tôt), appelle `child.stdin.end()` (`:190`), puis `waitForCloseOrAbort()` (`:198`) avant de re-vérifier `processError(false)` — exit-code `0` avec `stdinError` vide est le seul succès.

### 4.3 Terminaison — `terminate()`, `SIGTERM→SIGKILL` et le hang sans signal

`terminate()` (`:241`) est le chemin de cleanup, aussi idempotent. `terminateOnce` (`:247`) tente toujours de ranger :

- `child.stdin.destroy()` puis `SIGTERM`, attend `terminateTimeoutMs` (défaut `1000ms`, `options.ts:31` / `ffmpeg-supervisor.ts:258`) pour `closedPromise` (`:249`), escalade à `SIGKILL` (`:253`), attend à nouveau (`:254`). `waitForCloseOrTimeout` (`:257`) race `closedPromise` vs `setTimeout(timeoutMs)` (`:263`) et clear le timer (`:266`).

`waitForCloseOrAbort` (`:203`) a une **branche sans signal** — les appelants lib peuvent ne passer aucun `AbortSignal`, donc un simple `await closedPromise` bloquerait `finish()` pour toujours si FFmpeg se coince. Dans cette branche chaque étape attend `terminateTimeoutMs` et escalade `SIGTERM→SIGKILL`, levant finalement `FFmpeg did not exit after SIGTERM and SIGKILL` avec la queue stderr (`:222`) — même échelle que `terminate()` utilise, désormais appliquée à `finish` quand aucun abort externe n'existe. Avec un signal présent, `waitForCloseOrAbort` race `closedPromise` contre `signal:abort` (`:227`/`234`) et route l'annulation via `abortError`.

### 4.4 `StagedOutput` — remplacement atomique de la destination

`packages/video-exporter/src/staged-output.ts:27` `StagedOutput` :

- `path = <dir>/.<stem>.vecto-<uuid>.mp4` (`:53`), `targetPath` est le `outputPath` de l'appelant, `backupPath = .<stem>.vecto-<uuid>.backup<ext>` (`:54`) — l'identité étagée est un sibling caché, unique par export (uuid via `node:crypto` `randomUUID`, `:1`/`14`/`60`).
- La construction lance `staleSweep` (`:55`, `:42`) : une réclamation best-effort des siblings `.vecto-*` laissés par un run précédent tué entre backup-rename et install (`:35`). `sweepStaleFiles` (`:82`) lit le répertoire destination, trouve les entrées `.prefix = ".<stem>.vecto-"` (`:89`), exclut `path`/`backupPath` propres (`:90`), et `rm(..., { force: true })` via `Promise.allSettled` (`:92`).
- `commit()` (`:99`) attend d'abord `staleSweep` (pas de course avec ses propres renames, `:41`), puis `rename(path, targetPath)` — install fast-path quand aucun fichier ou overwrite a réussi (`:104`). Sur `EEXIST`/`EPERM` (`:108`/`21` `errorCode`), il fait le swap classique : `rename(targetPath, backupPath)` (`:112`), `rename(path, targetPath)` (`:115`) — si le second rename throw, restaure `rename(backupPath, targetPath)` (`:119`) et lève une `AggregateError` portant _à la fois_ `installError` et `restoreError` (`:126`, intentionnellement pas un seul `cause`). Au succès il supprime le backup (`:134`).
- `cleanup()` (`:138`) attend aussi `staleSweep`, puis `rm(path)` (`:145`), et si `backupMoved` est encore posé réconcilie le backup (`:150`) : si la destination existe désormais le backup était déjà remplacé et est supprimé ; si une `installError` a laissé la destination manquante le backup est restauré. Les exceptions sont collectées en `AggregateError` (`:163`).

Résultat : FFmpeg encode dans le fichier étagé à côté de la destination (`export-session.ts:137` `output.path`). Un export échoué ou aborté garde toute destination existante intacte et supprime l'artefact étagé — vérifié dans les conventions `test/export-session.test.ts` citées ci-dessous.

## 5. Détails navigateur dont le pipeline dépend

- Une seule page helper par export (`export-session.ts:124` `browser.newPage()`) — la capture passe par cette unique `PageLike` (`browser.ts:4` `PageLike` avec `setViewport`/`goto`/`waitForFunction`/`evaluate`). La `PageLike` est intentionnellement minimale pour que le mock navigateur en tests reste exact.
- L'échelle device est épinglée à `1` (`export-session.ts:128`) — cohérent avec `SKILL.md:31` `deviceScaleFactor: 1` et la promesse d'export que `width × height` est en pixels de sortie indépendants du DPR hôte (territoire boss 07).
- `page.goto(..., { waitUntil: 'networkidle0' })` (`export-session.ts:132`) attend la quiescence réseau avant que `sizeCanvas`/`validateAndStopScene` ne tournent — sans cela une assignation tardive `window.vectoScene` manquerait la fenêtre `waitForFunction` ou porterait un scene graph partiellement chargé.

## 6. Annulation et signaux process — chaque chemin converge vers `AbortError`

L'annulation d'export a trois origines mais un seul type d'erreur : une erreur nommée `AbortError` dont `cause` est `AbortSignal.reason` (`abort-error.ts:6`). `abortError` a été factorisé en `#661` (voir commentaire `abort-error.ts:1`) pour dé-dupliquer les deux implémentations identiques précédemment dans `export-session` et `ffmpeg-supervisor`.

### 6.1 API lib — `AbortSignal`

`options.ts:17` (`signal?: AbortSignal` sur `ExportOptions`) et sa copie normalisée (`options.ts:28`) portent le signal dans `ExportSession` et `FfmpegSupervisor`. Chaque point de mutation appelle `throwIfAborted()` (`export-session.ts:55`/`147`/`157`/`159`, `ffmpeg-supervisor.ts:101`/`126`/`157`/`184`/`225`), et `waitForDrain`/`waitForCloseOrAbort` écoutent `signal:abort` (listeners one-shot à `ffmpeg-supervisor.ts:152`, `232`).

### 6.2 CLI — `SIGINT`/`SIGTERM` → `AbortController`

`packages/video-exporter/src/cli.ts:50` `runCli` :

- `parseArgs` avec `allowPositionals: true` (`cli.ts:55`), un positionnel `url` requis (`cli.ts:74`), extras rejetés bruyamment (`cli.ts:82` _"silently exporting only the first hides the error"_), `output`/`width`/`height`/`fps`/`duration`/`audio` mappés depuis `values` avec validation `positiveInteger`/`positiveNumber` (`cli.ts:34`/`42`).
- `AbortController` (`cli.ts:113`), `SIGINT→abort('Interrupted by SIGINT')` (`cli.ts:115`) et `SIGTERM→abort('Terminated by SIGTERM')` (`cli.ts:119`), avec codes de sortie conventionnels `130` (`cli.ts:116`) / `143` (`cli.ts:120`) mémorisés comme `signalExitCode` et retournés préférentiellement (`cli.ts:137`). Les listeners sont enregistrés via `CliRuntime` injectable (`cli.ts:18`/`20`) et retirés dans `finally` (`cli.ts:142`), même forme qui rend les deps `ExportSession` testables.
- `runCli` ne throw pas sur signal : `if (signalExitCode !== undefined) return signalExitCode` même quand `exportVideo` a levé `AbortError` (`cli.ts:139`), et `catch` → `runtime.error('Export failed:', error)` (`cli.ts:140`) vs `1` sinon. Garde d'exécutabilité à `cli.ts:148` `isExecutableEntry` résout un mismatch symlink entre `dist` et `argv[1]` via `realpathSync`.

### 6.3 Cleanup ordonné — pas de browser/server/FFmpeg/fichier étagé orphelin

`ExportSession.run` (`export-session.ts:166` helper `clean` dans `catch`) libère en ordre inverse d'acquisition : `progress.stop` → `encoder.terminate` → `browser.close` → `target.close` → `output.cleanup` (`export-session.ts:175`–`:179`). Le pattern never-throw correspondant est pris de `cli.ts:142` `off` dans `finally` ; la variante exporteur est plus explicite — chaque étape est `try/catch` dans `cleanupErrors` (`:170`) puis :

- si `primaryError` (tout throw du `try`) et pas d'erreurs cleanup → lève `primaryError` (`:182`) ;
- si les deux → `AggregateError([primaryError, ...cleanupErrors], errorMessage(primaryError), { cause: primaryError })` (`:183`) ;
- si seulement erreurs cleanup → `AggregateError(cleanupErrors, 'Video export cleanup failed')` (`:188`).

Les propres races `finish`/`terminate` de FFmpeg (`ffmpeg-supervisor.ts:198` `waitForCloseOrAbort`, `:247` `terminateOnce`) garantissent aucun hang infini même sans signal. Le sweep étagé (`staged-output.ts:35` note CI stranded) et les closes Chromium/Vite ci-dessus ensemble signifient qu'un `SIGKILL` entre backup-rename et install (`staged-output.ts:35`, `export-session.ts:78`-adjacent) est récupérable au _prochain_ run.

### 6.4 Ce que les tests vérifient sur l'ordre du cleanup

Les fixtures `packages/video-exporter/test/export-session.test.ts:60` encodent l'ordre. Deux tests valent d'être lus comme spec du cycle de vie prévu :

- _timing `reset`_ (`:154` `fixture.events.indexOf('scene.reset')` entre `scene.stop` et `scene.step`) — la garde de régression d'ordre du contrat frame-0.
- _échec ferme quand même tout_ (`:169` `progress.stop`, `:185` `scene.stop`, `:210` invariant `progress.acquired` ↔ `progress.stop`) — chaque `startFfmpeg` → `encoder.terminate`, chaque `launchBrowser` → `browser.close`, chaque `resolveInputTarget` → `target.close`, chaque `createStagedOutput` → `output.cleanup`, même quand `progress.stop` ou un `write` throw.

## 7. Ce que l'exporteur ne rend pas déterministe

Le pas fixe supprime le non-déterminisme hôte et compositeur. Les sources restantes sont entre les mains de l'auteur de scène :

- **`Math.random()`** : doit être seedé (ex. `splitmix`/`xoshiro` avec seed indexé par frame) ou remplacé par des données keyframe authored. Un échantillonnage screen-space qui jitter-échantillonne par frame scintillera sinon à chaque run.
- **Réseau/IO** : les fetches qui se résolvent à la frontière `networkidle0` vs plus tard devraient être attendus déterministiquement (gatés par un flag de readiness vérifié avant le premier `step`, pas par un timeout d'horloge murale).
- **Chargement de ressources asynchrones** : fontes (`packages/text/src/fontMetrics.ts:82` `registerFontMetrics`), niveaux mipmap ou compiles shader WebGL qui rapportent `canUseSvgText` / `canUseMsdf` / `isReady` doivent être attendus avant t=0 — sinon la frame 0 race contre le décodeur.
- **Différences de shaping par plateforme** : différents backends `measureText` ou pièges `deviceScaleFactor` (boss 02) divergeront encore si vous capturez sur un moteur différent. `deviceScaleFactor: 1` (`export-session.ts:128`) élimine la variante DPR, mais pas la variante de shaping de fonte — gardez les assertions de frames spécifiques au moteur.

Toute forme de ceci doit être soit gatée par `reset()`, soit seedée, soit supprimée. L'exporteur garantit que des Scenes identiques steppées avec `dt` produisent des frames identiques ; il ne peut garantir que votre Scene est identique à travers les runs.

## 8. CLI vs API — choisissez selon l'appelant, pas selon la capacité

### 8.1 API — `exportVideo(options)`

`packages/video-exporter/src/index.ts:6` `exportVideo` :

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

Une fonction, pas de builder. `normalizeOptions` lève synchroniquement sur mauvaise géométrie/audio/dir de sortie (`options.ts:58` dimensions impaires, `:78` `audioPath` manquant, `:90` parent manquant, `:97` non writable) pour qu'un job mal configuré échoue _avant_ que Chromium ne boot. Le contrat `totalFrames = Math.ceil(fps*duration)` (`options.ts:112`, `cli.ts:104` re-dérive la même width) n'est intentionnellement pas « fps×duration−peut-être-un » — les durées courtes produisent le bon compte et il n'y a pas de frame fractionnaire. Le signal sur l'API est utilisé directement (`options.ts:17`/`28` et `export-session.ts:32` champ `signal` dans `FfmpegOptions`).

### 8.2 CLI — `vecto-export`

`packages/video-exporter/src/cli.ts:25` `USAGE` :

```

Usage: vecto-export <url> [options]
-o, --output <file> Output file (default: out.mp4) cli.ts:59
-w, --width <pixels> Width (default: 1280) cli.ts:60
-h, --height <pixels> Height (default: 720) cli.ts:61
-f, --fps <number> FPS (default: 60) cli.ts:62
-d, --duration <secs> Duration (default: 5) cli.ts:63
-a, --audio <file> Mux an audio track as AAC cli.ts:32/64

````text

Sémantique :

- **Input local vs distant est implicite** : si `url` ressemble à `http(s)://` c'est distant (`options.ts:68`) ; sinon c'est un fichier local servi via le shell HTML Vite (`input-target.ts:48`). Vous ne passez pas de flag pour les distinguer.
- **Rejet d'un second positionnel** (`cli.ts:82`) est le piège « batch export voulu » — `vecto-export a.ts b.ts` échoue avec `Unexpected extra arguments` plutôt que d'exporter seulement `a.ts`.
- **Codes de sortie** : `0` succès (`cli.ts:137` fallthrough), `1` échec validation/Browser/FFmpeg/cleanup (`cli.ts:141` / throw options / `RuntimeError`), `130` sur `SIGINT`, `143` sur `SIGTERM` (`cli.ts:116`/`120`). `vecto-export --help` mappe vers `runCli` avec `parsed` manquant `url` (`cli.ts:74` → `USAGE`) ou `parseArgs` levé (`:69` `Invalid arguments` + `USAGE`).
- **Contrat package** (`packages/video-exporter/package.json`) : `main: dist/index.js`, `bin: { vecto-export: dist/cli.js }`, build via `tsc` puis `chmod 0755 dist/cli.js` (`package.json:10` `chmodSync`). Le `.d.ts` distribué est `dist/index.d.ts`. `exportVideo` est la seule surface API publique (`index.ts:6`).

### 8.3 Aide à la décision

| situation                                                                                               | utilisez                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Job CI qui rend une story ou démo en artifact                                                    | `vecto-export ./src/demo/foo.ts -o out.mp4 --fps 60 --duration 3 -a voice.wav` (one-shot, sort avec 0/1/130/143) |
| Appelant lib qui possède un serveur Vite / page navigateur, ou doit composer l'export avec autre async work | `exportVideo({ url, outputPath, signal })` depuis `index.ts:6`                                                      |
| Capture de stills/snapshots ou court clip depuis une URL hébergée                                            | `vecto-export https://…/scene.html` (chemin distant, pas de Vite)                                                        |

## 9. Modes d'échec — quel composant parle

Chaque phase lève un message qui identifie la phase ; `cli.ts:140` le surface comme `Export failed:` + `AggregateError` avec la queue stderr bornée de FFmpeg (`ffmpeg-supervisor.ts:64` 64 KiB, toujours attachée sur exit-code `≠0` à `ffmpeg-supervisor.ts:117`). Pour assigner un échec, demandez :

| échec                                                       | composant probable                   | indice décisif                                                                   |
| ------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| `width and height must be even for H.264`                     | `options.ts:58`                    | en amont, jamais à l'heure FFmpeg                                                     |
| `Input file does not exist` / `Audio file does not exist`     | `options.ts:70` / `:84`            | avant Chromium/Vite                                                            |
| `Output directory does not exist / is not writable`           | `options.ts:90` / `:97`            | avant Chromium/Vite                                                            |
| `Vite did not expose a TCP address`                           | `input-target.ts:106`              | entrée locale, bind port 0                                                        |
| `Failed to start FFmpeg`                                      | `ffmpeg-supervisor.ts:73`          | événement `spawn` `error`                                                           |
| `FFmpeg exited before input completed`                        | `ffmpeg-supervisor.ts:115`         | sortie anticipée, inclut queue stderr                                                |
| `FFmpeg exited with code N: …` + queue stderr                  | `ffmpeg-supervisor.ts:117`         | misconfig `pix_fmt` / `yuv420p` / `libx264`                                     |
| `FFmpeg stdin failed` / `EPIPE`                               | `ffmpeg-supervisor.ts:80` / `:145` | pipe détruit, `write` mid-export non retenu                                 |
| `FFmpeg did not exit after SIGTERM and SIGKILL`               | `ffmpeg-supervisor.ts:222`         | coin, `finish()` sans signal seulement                                              |
| `No canvas found`                                             | `export-session.ts:93`/`102`       | `<canvas>` manquant ou caché dans la page                                        |
| `window.vectoScene must provide callable stop() and step(dt)` | `export-session.ts:71`             | contrat page non exposé à temps                                               |
| `Video export cleanup failed` (AggregateError)                | `export-session.ts:188`            | un `browser.close` / `target.close` / `output.cleanup` a levé après erreur primaire |
| `Failed to install staged output…`                            | `staged-output.ts:126`             | course rename deux-étapes `ATOMIC_MOVE`                                              |

La liste ci-dessus n'est pas inventée : chaque chaîne existe verbatim dans le `{file,}:line` donné.

## 10. Tester l'exporteur et ses bords

Le package export est testé sans vraie instance Chromium ou Vulkan — chaque externe est un fake `*Like` injecté via `ExportSessionDependencies` (`export-session.ts:27`) / `FfmpegDependencies` (`ffmpeg-supervisor.ts:21`) / `InputTargetDependencies` (`input-target.ts:29`) / `CliRuntime` (`cli.ts:11`). Ce que ces fakes assertent :

- `packages/video-exporter/test/export-session.test.ts:30` fixtures pilotent `scene.stop/ reset/ step`, `inputTarget.close`, `StagedOutput` create/commit/cleanup, `browser.newPage`, `FfmpegSupervisor.write/finish/terminate` et `progress.{start,update,stop}` comme `events` string que les assertions interrogent par `indexOf` / `includes` (`:154` timing reset, `:169` présence `progress.stop`, `:185` étapes ordonnées, `:239` contrat invalide avant FFmpeg).
- L'annulation est modélisée par un `AbortController` aborté avant ou mid-loop (`export-session.test.ts:295` `controller.abort('stop now')`) — les checks `throwIfAborted` (`export-session.ts:147`/`157`) deviennent visibles comme les frames `step`/`write` supplémentaires supprimées.
- `test/cli.test.ts` pilote la validation `parseArgs` (`cli.ts:54` args invalides → `1`, `cli.ts:82` positionnels extra → `1`) et le seam signal `CliRuntime.once/off` (`cli.ts:123`/`142`).
- `test/staged-output.test.ts` pilote les fakes `rename`/`rm`/`readdir` (`staged-output.ts:6` deps) pour toucher l'échelle `EEXIST/EPERM → backup → install → restore` (`staged-output.ts:108`/`112`/`119`) et le sweep de réclamation d'orphelins (`staged-output.ts:42`/`82`).

Une scène minimale en page que l'exporteur peut piloter (depuis `packages/video-exporter/test/fixtures/two-frame-scene.ts:8`) :

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

Les scènes qui n'appellent jamais `scene.start()` n'ont besoin d'aucun `stop`/`reset` autre que ce wrapper — elles restent statiques jusqu'à ce que l'exporteur les pilote (`demo/data-chart.ts:227`/`ml-descent.ts:219` pattern).

## 11. Pièges

- **Oublier `window.vectoScene`** : la page charge, l'exporteur attend 10s (`export-session.ts:61`), timeout. Posez-le toujours avant `scene.start()` ou exposez-le synchroniquement (`demo/data-chart.ts:222` `window.vectoScene = scene` avant start).
- **État au chargement sans `reset`** : le tween d'intro a un jitter frame-0 (non-déterminisme de base `export-session.ts:78`, `#646`). Ajoutez `reset()`.
- **Dynamiques d'horloge murale** : `Date.now()` dans un callback `tick` défait le pas fixe. Threadez `dt` à travers l'état ou l'état de simulation seedé uniquement.
- **Dimensions impaires** : passer la validation silencieusement encoderait tard et échouerait avec stderr FFmpeg opaque. `options.ts:58` rejette tôt.
- **Supposer « pas de piste audio » signifie « sortie silencieuse »** : les exports sont silencieux seulement si `audioPath` est omis (`options.ts:16` _"canvas pipeline itself never produces sound"_) ; passer un mauvais chemin échoue avant Chromium (`options.ts:80`) pour que le mauvais audio ne soit pas une surprise tardive.
- **Tuer sans cleanup** : un `kill -9` entre backup-rename et install (`staged-output.ts:35`) laisse un `.vecto-*` stranded. Le `staleSweep` du prochain export (`staged-output.ts:42`/`55` + `export-session.ts:122` construction) est la récupération — ne supprimez pas manuellement les fichiers `.vecto-*` mid-export.
- **Supposer que l'export navigateur marche en CI sans FFmpeg/Chromium** : vendez les bons packages et posez `PUPPETEER_EXECUTABLE_PATH` si vous shippez votre propre Chromium (`browser.ts:49` / note install `README.md:10`).
- **CRITICAL** : Toutes les refs ci-dessus sont grep-vérifiées contre le repo épinglé à `/mnt/data/Workspace/Projects/vectojs/vectojs` (`options.ts`, `export-session.ts`, `browser.ts`, `ffmpeg-supervisor.ts`, `input-target.ts`, `staged-output.ts`, `abort-error.ts`, `cli.ts`, `Scene.ts:3423`/`5609`/`1114`, `SKILL.md`, `references/export-recipes.md`).

## 12. Checklist — rédiger un export déterministe

- [ ] La page expose `window.vectoScene` avec `stop` et `step(dt)` appelables (contrat `export-session.ts:71`).
- [ ] Si la scène rend un état au chargement, elle expose aussi `reset()` (fix frame-0 `export-session.ts:84`, `#646`).
- [ ] La scène n'appelle jamais `scene.start()` en mode export, ou `stop()` annule fiablement sa boucle avant première capture (note clock `demo/math-teaching.ts:9`/`161`, `export-session.ts:75` `scene.stop()` juste après validation).
- [ ] Tous les animateurs intègrent le `dt` passé à `step` — pas de lectures `Date.now` / horloge murale dans `tick`/springs/tweens (chemin pas fixe `Scene.ts:3423`, vs `Scene.ts:5609` `dt` clampé horloge murale).
- [ ] L'aléatoire (s'il y en a) est seedé depuis `frame` ou un prng déterministe — `Math.random()` chaque frame scintillera entre runs.
- [ ] Fontes/Msdf/ressources shader chargées avant t=0 (pas de race `registerFontMetrics` / `isReady` non awaitée à `packages/text/src/fontMetrics.ts:82`).
- [ ] La géométrie d'export est paire (`options.ts:58` `2 | dimensions`, exigence `yuv420p`) et `deviceScaleFactor: 1` est assumé pour les claims de résolution (`export-session.ts:128`).
- [ ] L'abort se propage (`signal` sur API, SIGINT/SIGTERM en CLI) et chaque ressource a un `close/terminate/cleanup` injecté (`export-session.ts:175` + `ffmpeg-supervisor.ts:249`).
- [ ] L'audio optionnel est un file-path (check pré-lancement `options.ts:78` `audioPath`), pas une capture live — la vidéo canvas exportée est silencieuse sans lui (note silence `options.ts:14`).

## Relations

- **Boss 06 (VMT runtime)** possède la dualité `loop` (`Scene.ts:5569`) ↔ `step` (`Scene.ts:3423`) et pourquoi la boucle rAF clamp mais `step` non.
- **Boss 07 (renderer)** possède `deviceScaleFactor: 1` sur `page.setViewport` (`export-session.ts:128`) et pourquoi le culling reste cohérent quand l'horloge de capture est fixe.
- **Boss 08 (WASM)** est invisible ici — toute parité store WASM live vs JS doit tenir frame-par-frame sous avance à pas fixe aussi, mais l'exporteur ne le special-case jamais.
- **Boss 01/02 (sélection + texte)** fournissent la préparation fonte/shape dont la readiness doit être awaitée avant t=0 — sinon la frame 0 inclut une race plutôt qu'une capture.
- **Boss 11+ surfaces produit (canvas apps)** sont où `@vectojs/video-exporter` est utilisé en pratique — forward vers ce boss, pas l'inverse.

## Références

- `packages/video-exporter/src/index.ts:6` — entrée publique `exportVideo(options)`, le seul symbole exporté
- `packages/video-exporter/src/options.ts:40` — `normalizeOptions` + validation géométrie/audio/dir + dérivation `Math.ceil(fps*duration)`/`dt`
- `packages/video-exporter/src/export-session.ts:111` — lifecycle `ExportSession.run`, contrat `validateAndStopScene`, `output.path` étagé + boucle `page.evaluate(step(dt))` + `captureFrame`
- `packages/video-exporter/src/input-target.ts:48` — branchement `resolveInputTarget` Vite vs distant, shell `<canvas>` synthétique + `transformIndexHtml`
- `packages/video-exporter/src/browser.ts:45` — `resolveBrowserLaunchOptions` executable/args sandbox
- `packages/video-exporter/src/ffmpeg-supervisor.ts:34` — `FfmpegSupervisor` stderr borné, garde EPIPE stdin, `write`/`finish`/`terminate`, escalades `SIGTERM→SIGKILL`
- `packages/video-exporter/src/staged-output.ts:27` — fichier étagé atomique + backup + réclamation orpheline `sweepStaleFiles`
- `packages/video-exporter/src/abort-error.ts:6` — fabrique `abortError(signal)` `AbortError` partagée (`#661`)
- `packages/video-exporter/src/cli.ts:50` — `runCli` parsing args, codes sortie signal `130`/`143`, `CliRuntime` injecté
- `packages/core/src/tree/Scene.ts:3423` — contrat `step(dt)` à pas fixe : rendu inconditionnel, `dt` non clampé, zéros `frameStats`, note footgun mesure
- `packages/core/src/tree/Scene.ts:5569` / `5609` / `5636` / `1114` — `loop` `dt` horloge murale, snapping `100/cap`, clamp `MAX_FRAME_DT=100`
- `packages/video-exporter/package.json:10` — build `dist/cli.js` + `chmod 0755`, `bin: vecto-export`, `main: dist/index.js`
- `packages/video-exporter/demo/*.ts:222` / `test/fixtures/two-frame-scene.ts:8` / `test/export-session.test.ts:154` — sites d'usage contrat scène
- `.agents/skills/vectojs-video-exporter/SKILL.md:1` — skill exporteur (contrat 0.2 + politique sandbox + erreurs communes)
- `.agents/skills/vectojs-video-exporter/references/export-recipes.md` — snippets CLI/API
````
