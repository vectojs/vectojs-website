---
title: '05 — Zero-DOM TeX — 組版と SVG 出力'
description: 'なぜ KaTeX カーネル → VectoJS エミッター → 自己完結した SVG なのか、座標空間不変条件、伸縮形状の落とし穴、そして新しい TeX 構文への安全な道筋。'
order: 25
---

# 05 — Zero-DOM TeX — 組版と SVG 出力

> **ボス 05** は、TeX 文字列をブラウザなしで — DOM なし、CSS エンジンなし、Web フォントなしで — 自己完結した SVG に変換し、すべてのボックス、クリップ、伸縮グリフを KaTeX がブラウザでレンダリングしたものに幾何学的に忠実に保つ契約を担います。
>
> - **学習内容**: KaTeX がレイアウト カーネルとして販売される理由と、ブラウザの役割はどこで終了するのか。スパンツリー → SVG エミッション パイプライン。単一の間違ったフレームがすべてのストレッチを壊す 5 つの座標/変換スペース。これらのスペースに直接マッピングされる歴史的なバグ クラスター。新しい TeX 構造を追加する安全な方法。
> - **禁止事項**: Unicode/BiDi、アラビア語の整形、または `LayoutEngine` 改行 — ボス 02 がこれらを所有します。 Markdown ワーカーのトランスポートとストリーミングの調整 — ボス 04; `GlyphRasterAtlas`/`SVGRasterCache` DPR パス — ボス 07; `IRenderer` コントラクト自体。

## なぜ Zero-DOM TeX が存在するのか

KaTeX 独自の `buildHTML` (`packages/tex/src/kernel/VENDORED.md`) は、ジオメトリが 2 つの外部エンジンに依存するスパン ツリーを生成します。垂直配置の **CSS レイアウト** (`position: relative` + `top`、`display: table-cell` + `vertical-align`)、x の **インライン テキスト レイアウト**、およびインクの **Web フォント解像度** (CSS クラス → フォント ファイル → グリフ)。 `@vectojs/markdown` はこれらのいずれも支払うことができません。`SVGEntity` は `data URI → Image → createImageBitmap → drawImage` (`packages/tex/src/index.ts:8`) を介してラスタライズされます。データ URI からロードされた `Image` は外部 URL を解決せず、ページ CSS も継承しないため、KaTeX の HTML/CSS 出力も Web フォント ベースのアプローチも旅行後に残りません。 SVG は **独自のアウトライン**を保持する必要があります。

その結果、厳しい制約が生じます。出力された SVG には外部参照がありません。`<text>`、`font-family`、`url()`、`xlink:href` (`packages/tex/src/emit/svg.ts:1` ヘッダー) はありません。この制約により、KaTeX 構成ではなく新しいパッケージが正当化されます。

サイズは、代替案 (`vectojs-docs/forge/decisions/math-engine-2026-08.md:30`) よりもこの形状を選択したプログラムの予算です。`mathjax-full@3.2.2` の `bun build --splitting` 分解では、**SVG 出力 + 埋め込みフォントでは gzip の 84%** が測定されましたが、TeX 入力層ではわずか ~16% でした。そのため、レバーはパッケージ トリミングではなく **グリフ ホワイトリスト**です。 KaTeX は **SVG 出力がまったくない** (`src/kernel/Settings.ts:206` enum は正確に `["htmlAndMathml","html","mathml"]`) と測定され、最小の RaTeX `wasm32` ビルドは **1 010 901 gzip / 768 278 brotli — 置き換えられる MathJax チャンクの 1.47 倍** (`math-engine-2026-08.md:103`) と測定されたため、WASM はこの作業が存在する軸を獲得しません。

## 何が vendored で何が自前か

`packages/tex/package.json:14` ビルド順序は分割を文書化します。 `packages/tex/src/index.ts:25` はマップであり、再説明するのではなく読み取る必要がある契約行が含まれています。

- `src/kernel/` — KaTeX (MIT)。**ピン留めされたコミット** (`references/markdown/KaTeX@5a5bf206`、`forge/decisions/math-engine-2026-08.md:191`) から `scripts/vendor-katex.ts` によってコピーされ、MathML と DOM の出力が機械的に削除されます。 **再フォーマットやリント修正は行われていない**ため、ファイルはアップストリームに対して差分可能です。 `VENDORED.md` は、保持されたセットと削除されたセットに名前を付けます。 `.oxlintrc.json` と `tsconfig.build.json` は両方とも、まさにこの理由でカーネルを除外します (`math-engine-2026-08.md:312` 脚注)。
- `src/registry/` — 2 つの手書きファイル (`defineFunction`、`defineEnvironment`) では、式の位置 (`src/index.ts:30`) に `mathmlBuilder` が出現するため、トークン レベルの変換は生成できません。彼らの `sideEffects:false` トラップは、フェーズ 1 のバンドルを機能させない原因 (`math-engine-2026-08.md:294` 修正 5) であるため、`package.json` **は `sideEffects:false` であってはなりません**。インポートの副作用により `functions`/`environments` が設定され、ツリーシェイキングによりすべての組み込みが削除されます。
- `src/emit/` + `src/layout.ts` — 私たちのもの、エミットディスカッションが触れる唯一のファイル。
- `src/glyphs/glyphs.subset.json` — TTF アウトライン → `scripts/generate-glyphs.ts` 経由の SVG パス、`scripts/subset-glyphs.ts` で絞り込み、`scripts/encode-glyphs.ts` + `src/emit/glyphCodec.ts` (フェーズ 2 バイナリ形式、`math-engine-2026-08.md:282`) で再エンコード。出荷されたランタイム テーブルは、フェーズ 1 のエクストラクター (`glyphCodec.test.ts` ID アサーション) への **バイト同一** のパス文字列にデコードされ、**同じグリフのサブセット TTF** (`math-engine-2026-08.md:328`) よりも 12.0% 低くなります。

## パイプライン — ファイルマップ

```text
TeX string  ──►  layout(tex, opts)                         layout.ts:62
                 Settings(displayMode,maxSize,strict)  ·─► kernel/Settings.ts
                 parseTree → AST                       ·─► kernel/parseTree.ts + Parser.ts
                 buildHTML(tree, Options) → DomSpan    ·─► kernel/buildHTML.ts + buildCommon.ts:552 makeVList
                      │ height/depth/style.top already resolved
                      ▼
                 DomSpan tree                          layout.ts:84-89  (wrapped in vecto-tex root)
                      │
                      ▼
                 emitSVG(tree, {emPx,color,padEm})     emit/svg.ts:1567  EmitResult{svg,width,height,depth,missing,placements}
                   walk → EmitState{glyphs,rects,paths,lines}
                   viewBox = layout box ∪ ink union + pad
                   defs deduplication + grouped fills + clipPaths
                      │
                      ▼
                 MathRender{uri,widthEx,heightEx,depthEx}  markdown/src/markdown-math.ts:544 convertMathToSVGDataURI
                   bounded mathCache (256) + inlineMathRasters (LRU, 256)
                   lazy import via preloadMathJax()
                      │
                      ▼
                 InlineObject{width,height,depth,alt,paint}  markdown/src/markdown-inline.ts:287 inlineMath arm
                   InlineObjectBox in LayoutEngine lines, paint draws the raster
```

`layout` (`layout.ts:62`) は、ブラウザ専用の CSS セマンティクス (`layout.ts:5`) を運ぶ `.katex`/`.katex-display` ラッパーを除いた KaTeX の `buildTree` です。唯一の興味深い選択肢は `throwOnError:true` + `strict:false` (`layout.ts:68`) です。ハード解析エラーがスローされるため、呼び出し元は TeX ソースをそのまま表示することができます (不明なコマンドに対して `@vectojs/markdown` がすでに行っていること)。厳密性違反はありません。

`emit/svg.ts:1` は、ブラウザが実行するはずの 3 つの処理を実行します。これらの処理は、それぞれ実際のバグを伴うため、独自のヘッダーで指定されています。

1. **グリフ→アウトラインを解決します。** `SymbolNode` はテキストとメトリックを保持しますが、**フォントは保持しません** (`fonts.ts:57` `CLASS_TO_FACE`)。 `\left(` は、`delimsizing size1` 祖先の下に空のクラス リストを持つ `SymbolNode` を生成します。ローカルで解決すると、`Main-Regular` が選択され、長い括弧が属する場所に短い括弧が描画されます (`math-engine-2026-08.md:444` 測定: 祖先チェーン経由で正しいのは 105/105、祖先チェーンなしの場合は 97/105、`svg.ts:427` `walk` `classChain` パラメーター)。
2. **x を累積します。** スパン ツリーには x がまったく含まれません。`functions/rule.ts:44` だけが `Span.width` を書き込み、そこでは四角形を意味します。 1 つおきの x はインライン テキスト レイアウトであるため、エミッターは TTF `hmtx` テーブルからグリフごとのアドバンスを合計します (`svg.ts:492` `getGlyph` + `advance`; `math-engine-2026-08.md:432` は、なぜ `hmtx` が `fontMetricsData.width` ではないのかを示しています。組み合わせアクセントは 0 アドバンスであるため、マークがそのベースをオーバーレイしますが、メトリクスは 1.0 ～ 2.33 em を主張します)。
3. **CSS の垂直配置 → 明示的な y に変換します。** `makeVList` は、高さ `pstrutSize` の兄弟 `pstrut` に対して、各行を `style.top = -pstrutSize - currPos - elem.depth` としてエンコードします。変換では、`pstrutSize` がツリー (`svg.ts:1029`) から読み取られ、`rowY = y - (-(top + pstrutSize)) * UPEM * scale` が使用されます。KaTeX レイアウト (`svg.ts:32`、`math-engine-2026-08.md:417` #1) が再導出されることはありません。

エミッターの単位は **1/1000 em** (`svg.ts:52` `UPEM`) で、グリフ テーブルの `UNITS_PER_EM` (`glyphTable.ts:49`) と `svgGeometry.ts` の文書化された 1000:1 viewBox の両方に一致します。 `y` は **ベースラインから下向きに正です**。グリフ アウトラインは y-up で出荷されるため、パスが書き換えられるのではなく、それぞれが `scale(1,-1)` 内に配置されます (`svg.ts:1552` `transform` 文字列。書き換えると精度が低下し、重複排除が無効になります)。

その後、Markdown のラッパー (`markdown-math.ts`) は、このパイプラインを介して **遅延**: `preloadMathJax` (`markdown-math.ts:85`、値のインポートによってエンジンがすべてのコンシューマーに引き込まれないように、6 行目に型のみの `import type {emitSVG,layout}`)、dynamic-`import('@vectojs/tex')`、256 エントリで `MathRender` と同じ境界の LRU ラスター マップをキャッシュします (`markdown-math.ts:218` `mathCache`、 `markdown-math.ts:238` `inlineMathRasters`; `inlineMathRasters` unbounded は P3 の発見でした — `forge/findings/text-richtext-and-markdown.md:1924`)、`exToPx` (`markdown-math.ts:143`、`markdown-inline.ts:305`) および `paintInlineMath` (`markdown-math.ts:331`) を介して px 内の `width/height/depth` を持つ `InlineObject` としてインライン演算を出力します。表示演算は `MathBlock extends MarkdownContainer` (`markdown-math.ts:598`) です。どちらのファイルも `@vectojs/tex` に対する静的な値エッジを保持していません。2 番目のファイルです (`KATEX_FONT_SCALE` は、この理由で `markdown-math.ts:484` にインポートされないと再宣言されました。`test/mathBoxGeometry.test.ts` では同等であることがアサートされています)。

### フォント解決 — 全チェーン

`fonts.ts:194` `resolveFont(classes)` は、次の 3 つのマップを優先して、蓄積された `classChain` をスキャンします。

- `DELIM_SIZE_FONTS` (`fonts.ts:98` 例: `delimsizing size1 → Size1-Regular`) — 伸縮性のある区切り記号が `SymbolNode` ではなく祖先にこれを伝えるため、最高です。
- `DIRECT_FONT_CLASSES` (`fonts.ts:120` 例: `mathbb → AMS-Regular`、`mathcal → Caligraphic-Regular`)。
- `CLASS_TO_FACE` (`fonts.ts:57` 例: `mord textit → Main-Italic`、`mathbf → Main-Bold`) は `AVAILABLE` フォールバック経由で構成されます (`fonts.ts:135` — `Math-BoldItalic` が存在しない場合は、`Math-Regular` になります)。

サイズ設定は、`SIZE_MULTIPLIERS` (`fonts.ts:263`、ベンダー ドリフト ガードによって `katex.scss $sizes` および `kernel/Options.ts sizeMultipliers` に対して検証されます — § ベンダー不変ガードを参照)、`sizingRatio` (`fonts.ts:265`) を介して乗算されます。フォントとスケールは両方とも、リーフだけでなくすべてのノードの **完全** チェーンから解決されます。

### グリフテーブルとフックアップ — 1 枚の図

1 つの `SymbolNode` → 1 つのアウトライン: `walk` は、その `classChain` を `emitSymbol` (`svg.ts:427`) に渡します。これにより、`resolveFont` を介してフォントが解決され、`getGlyph(font, code)` (`glyphTable.ts:73`、`glyphCodec.ts:277` の `GlyphTable` をサポート) を介してアウトラインが検索され、次のいずれかの方法で `PlacedGlyph{x,y,scale,font,code}` (`svg.ts:132`) がプッシュされます。 `glyph.advance/UNITS_PER_EM * UPEM * scale` (`svg.ts:499`)、またはミスの場合は、`font/U+XXXX` を `state.missing` (`svg.ts:500`) に記録し、ベンダーの `getCharacterMetrics` 幅 (`kernel/fontMetrics.ts`、出荷されたアウトラインのスーパーセット `svg.ts:505`) だけ進みます。 `SymbolNode.text` の繰り返し文字は、`node.width` を介して融合されません** (`buildCommon.ts:296` `tryCombineChars` は、最初の文字として `width` を残したままテキストを連結します) — 各コード ポイントは個別に測定され、テーブルとメトリクスの両方がミスした場合は、警告 1 回ゼロアドバンス フォールバックが行われます (`svg.ts:514` `warnedMetricsMisses`、境界付き `MAX_CACHED_MISSES = 1024` `glyphCodec.ts:83`) なので、不適切なグリフが `penX`/`viewBox` を汚染することはありません。

## 座標空間不変条件

すべての配置は、DOM クラス リストから SVG の `viewBox` の最後のピクセルまで 1 回の移動で **5 つのスペース**を通過します。どれか 1 つのバグでもすべての伸縮性のある構造が一度に壊れますが、一緒に壊れた 2 つの実際のクラスターはまさにそれを行いました。

| #   | 空間                              | 意味                                                                                              | Y方向                                                                      | 規模                                                                                                                     | クリップの意味                                                              | どこ                                                                     |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | **ルートローカル (em)**           | `state.x` ペン、`y` ベースライン、すべての `parseEm` 長 × `UPEM × scale`                          | +down、ベースライン原点 (`svg.ts:427` `walk` `y`)                          | `sizingRatio(classChain)` が蓄積されました (`fonts.ts:265`)                                                              | —                                                                           | `emitContainer` + `emitSymbol` エントリ                                  |
| 2   | **行ローカル (リプレイ)**         | `vlist-t > vlist > vlist-r > row` と `rowY = y - above` (`svg.ts:1080`)                           | +down、vlist ベースライン                                                  | 同じ                                                                                                                     | 行インデント `dx = startX + indent + marginLeft`                            | `emitVList` プローブ + リプレイ (`svg.ts:1031-1180`)                     |
| 3   | **変換後 (パスローカル)**         | `<path transform="translate(x,y) scale(sx,sy)">` はローカル→ルートユーザー空間をマップします      | SVG ユーザー空間、グリフごとに `scale(1,-1)` の外側で y-down               | グリフ: `scale / -scale`;伸縮性: `sx = scaleWidth/vbW, sy=heightEm/vbH` (`svg.ts:612`)                                   | `sx` → `scaleWidth` で幅 `400em` の `viewBox`                               | `emitSvgNode` + 最終的な `body` 変換文字列 (`svg.ts:584`、`svg.ts:1569`) |
| 4   | **ClipPath ローカル**             | `<clipPath><rect>` は参照要素の変換の **後** に解決されました (SVG `userSpaceOnUse` のデフォルト) | **ポスト** - ユーザー空間の変換                                            | 逆: `invSx=1/sx,invSy=1/sy` (`svg.ts:1555`)                                                                              | **パス独自のフレームで出力する必要があります**                              | `svg.ts:1550-1562` `clipPath` 四角形                                     |
| 5   | **マークダウン ボックス (ex/px)** | `MathRender{widthEx,heightEx,depthEx}`、次に `exToPx(…,runSize)` → `InlineObjectBox`              | LayoutEngine ライン ボックス、ベースライン + 深さ (`markdown-math.ts:566`) | `EX_PER_KATEX_EM = KATEX_FONT_SCALE/EX_PER_EM` (`markdown-math.ts:514`、Chromium の実際の KaTeX に対して 0.02% 検証済み) | すべての側面に `MATH_PAD_EM=0.05` (`markdown-math.ts:481`) が埋め込まれます | `markdown-math.ts:544` + `markdown-inline.ts:305`                        |

**不変条件** (クリップまたはオーバーレイ分岐を出力するすべてのパスに保持する必要があるもの): `PlacedPath.clip` ウィンドウは **ルート空間** (`svg.ts:146-170`、`emitSvgNode` が `min-width` からシード) に記録され、任意の `aligned-vlist` リプレイ `dx` (`svg.ts:1196` `clip.x += dx`) によって変換され、`sx/sy` (`svg.ts:1555`) によって反転された後に出力されます。 3 と 4 の間に 1 つずつずれたスペースがあると、すべての部首と上中括弧が `clip.x` ではなく `p.x + sx·clip.x` によって配置されます (`CHANGELOG:31` #787)。

## 伸縮形状 — 3 つのファミリー

伸縮性のある要素のジオメトリは **`Span.width`** にありません。 `functions/rule.ts:44` だけがそれを書いています。 3 つの家族、3 つの異なる座標事実、これらを混ぜ合わせるとバグが発生します。

### 通常のグリフと罫線

- `PlacedGlyph.x` は絶対ルート x です。 `width` は `advance/UPEM * scale` です。 viewBox、スライス、`clip` はありません。
- `PlacedRect` は 3 つの形状のいずれかです: `Span.width` (`svg.ts:903`) のルール、全幅ルール/境界線 (`svg.ts:800` `fullWidth:true` の `borderBottomWidth` / `.angl` / `\boxed` 境界線、`svg.ts:1256` の `placeRect` によって解決)、または垂直区切り記号 (`svg.ts:718` の `vertical-separator` → `PlacedLine`) をストロークしました。全幅の図形は **進歩なし** に寄与します — `span.width` が存在しないことには意味があります。

### 単一パス hide-tail 伸縮

`\sqrt` と `\phase` はそれぞれ、CSS が `overflow:hidden` (`katex.scss:513` の `hide-tail`) であるラッパーの下で 400em 幅の `SvgNode` を 1 つ出力します。

- `\sqrt`: ラッパーは **インライン** `style.minWidth = 0.853em` (`kernel/delimiter.ts:533`) を書き込み、`emitContainer` は `svg.ts:969` `clipEm = parseEm(style.minWidth) || parseEm(style.width)` で読み取ります。したがって、`emitSvgNode` は、`state.x + clipEm*scale` を `widthEm` と `clip.w` (`svg.ts:590`) の両方としてシードします。 400em パスの `sx` は `rawWidthEm` (`widthEm` ではない) を使用するため、`slice` は宣言されたスケールでレンダリングされ、潰されるのではなくトリミングされます。
- `\phase`: ラッパーは **`style.height`** (`kernel/functions/enclose.ts:60`) のみを書き込みます。インライン `minWidth/width` がないため、`clipEm` は `undefined` のままで、`hideTail` は `unclippedHideTail === true` (`svg.ts:971`) になります。子は 400em (`svg.ts:966` `emitOverlayPiece` と `FULL_WINDOW: 0..1 xMinYMin`) としては進められません。代わりに、コンテナー範囲全体がクリップになります (`markdown-math.ts:92` の `markdown` 類似物は無関係です。ロジックは `svg.ts:966` です)。

微妙な点: `minWidth` **が存在する**場合、クリップはインラインでシードされ、`emitSvgNode` は正しいです。 **そうでない**場合、クリップは保留中であり、それを囲んでいる vlist エクステントまで延期する必要があります (下記 #667 を参照)。同じラッパー クラスの 2 つのコード パス。

### 複数ピースのオーバーレイ

`\overbrace`/`\underbrace`/`\xleftrightarrow`/`\xrightarrow` は、`position:absolute` パーセンテージ ウィンドウ (`stretchy.ts:238` `widthClasses = brace-* / halfarrow-*`、`katex.scss:519` の CSS) である **2 ～ 3 のスパン** に 1 つの 400em パスを分割します。

- 各部分の `SvgNode` は再び `width:"400em"` を宣言します。文字通り、**1200em** (3×400) (`CHANGELOG:31`) で `\overbrace{x+y}` を測定します。
- ピースは **zero-advance** `PlacedPath.overlay:{start,end,align,vw,vh}` (`svg.ts:195`、`svg.ts:629` の `emitOverlayPiece`) として記録され、それを囲む vlist 行の `width` が判明した場合にのみ解決されます。均一なカバー スケール `s = max(boxW/vw, boxH/vh)`、ピースごとの `preserveAspectRatio` の位置合わせ (`svg.ts:1286` の `xMinYMin / xMidYMin / xMaxYMin` `placeOverlay`)、ウィンドウ クリップされます。 **コード14**。

## エミッターが決して壊してはならない 5 つの不変条件

これらはバッチを終了し、それ以来最もコストのかかる回帰方法となっています。

1. **`classChain` はフォントを保持します。** `SymbolNode` には空のクラス リストが含まれることがよくあります。フォントは先祖にあります。ローカル解決では、短い区切り文字が属する場所には長い区切り文字が、長い区切り文字が属する場所には短い括弧が自動的に描画されます。 **すべて**の区切られた数式 (`fonts.ts` + `svg.ts:427` + `math-engine-2026-08.md:443` の測定) に影響します。
2. **`state.x` はジオメトリではなくアドバンスです。** `parseEm(margin*)/hmtx advance/sizingRatio` sum が唯一の正しい x です。 2 番目のソースは二重にカウントされます。
3. **`top + pstrutSize` → `rowY` が唯一の垂直方向の真実です。** `pstrutSize` をツリーから読み取ります。再計算しないでください (`svg.ts:1029`)。
4. **`clip`/`overlay` は、それを囲んでいる vlist エクステントに従います。他には何もありません。** 全角ルール、末尾非表示部首、`\cancel` オーバーレイ、および中括弧部分はすべて、行の `width` (`svg.ts:1172` `rectStart/lineStart/pathStart` + `svg.ts:1230`) を囲む **独自の** に対して解決されます。数式の `state.x` に対して解決すると、先行するアドバンスによって `\cancel` の対角線が誤って配置され、ネストされた socpe が埋め込まれます。
5. **`clipPath` 四角形はパスローカル座標にあります。** `(clip.x - p.x)*invSx` (`svg.ts:1558`) を出力し、`clip.x` をそのままではなく、パス (`svg.ts:1196`) と同じ `dx` を使用して記録されたクリップを再生します。スペース 4 ≠ スペース 3。

## ケーススタディ — 座標としてのバグ

それぞれは明確なスペースの混合であり、行番号は固定状態です。

### #787 — `clipPath` 座標空間（`svg.ts:1550-1562`、`CHANGELOG:31`）

`clipPathUnits` のデフォルトは `userSpaceOnUse` です。つまり、`<clipPath>` 内の `<rect>` は、`<path>` の `transform` を参照した後**に解決されます。したがって、Rect はパス自身のローカル フレームに書き込む必要があります。修正前は、`svg.ts:1555` がルート空間 `clip.{x,w}` をそのまま出力していたため、SVG は `translate(p.x) ∘ scale(sx)` を 2 回適用し、ウィンドウは `p.x + sx·clip.x` に到達しました。クリップされたすべての伸縮性 (`\sqrt`、すべてのフェーズ) は、非 1 `sx`/`sy` の下でキャンバス外に消えました。同じコミットにより、aligned-vlist リプレイに `svg.ts:1196` `clip.x += dx` も追加されました。これは、クリップが境界を定めるパスと同様に絶対ルート空間ウィンドウであるためです。根号が中央の分子 (`CHANGELOG:57` `svgClipWindows.test.ts`) に位置する場合、パスを延期してもウィンドウは壊れませんでした `\frac{\sqrt{x}}{y}` が壊れました。

### #667 — `\phase` が 400em と計測された（`svg.ts:966`、`CHANGELOG:56`）

`\sqrt` は常にそのラッパーにインライン `min-width` を書き込むため、`emitSvgNode` はすぐにクリップできます。 `\phase` はそうではありません。エミッターは SvgNode で宣言された `widthEm: 400` を事前として信頼し、400em で `\phase{-120}` を報告しました。 `classes.includes('hide-tail') && clipEm===undefined` を `unclippedHideTail` (`svg.ts:971`) として検出し、その分岐を `emitOverlayPiece(FULL_WINDOW)` (表示されるウィンドウが周囲の行であるゼロアドバンス オーバーレイ) にルーティングすることで修正されました。

### #665 — `\overbrace` が 800–1200em と計測された（`svg.ts:859`、`CHANGELOG:58`）

同じ根本原因、マルチピース: `brace-left/center/right` と `halfarrow-left/right` は、囲んでいる行 (`katex.scss:519`) の `width:25/50/50%` を持つ `position:absolute` です。各 `SvgNode` は依然として 400em を宣言しており、それらを追加すると `\overbrace{x+y}` は 1200em で測定されます。 `OVERLAY_PIECES[class]` (`svg.ts:328`) を認識し、これらの SvgNodes をゼロ前進保留オーバーレイ (`svg.ts:867` の `emitOverlayPiece`) として扱い、関連する `.angl` の場合は境界線が CSS 内にのみ存在する場合は `CONTAINER_BORDER_CLASSES` (`svg.ts:308`) を使用することで修正されました。

### #825 — `\sqrt{b^2-4ac}` が `b²√4ac` とレンダリングされた（`svg.ts:1186`、`CHANGELOG:15`）

2 つの独立した断層。どちらもラジカンド幅を中心としています。

- `ROW_ALIGN_CLASSES.sqrt` は `left` (`svg.ts:266`) ではなく `center` になりました。 KaTeX には `.sqrt {text-align}` ルールがありません。イニシャルは`left`です。 `center` では、狭い 400em 部首が広い部首の中央に位置するため、ビンクルムは開始部分 `b²` の右側から始まるように見えました。
- Hide-tail クリップのサイズは `minWidth` のみに設定され、実際のラジカンド幅には設定されませんでした。 `width` (vlist の範囲、つまり、より広い場合の基数幅) が判明すると、`svg.ts:1186` は `p.w`/`p.clip.w` を `max(minWidth, radicandWidth)` に拡張しました。また、整数 `vlist` 本体 `classChain.includes('sqrt')` に対してのみ、祖先 (`svg.ts:1203` ガード) ではなく、それ以外の場合は、外側の `mfrac` が基数を小数部の幅まで拡張しました。

### #788 — non-1 スケールと整列されたリプレイでの固定 clip ウィンドウ（`svg.ts:1196`、`svgClipWindows.test.ts`）

以前、aligned-vlist シングルウォーク最適化に関する健全性の主張では、「`walk` が `state.x` でアフィンであるため、翻訳は健全である」と述べ、クリップの翻訳は `svg.ts:1196` でクリップ (`CHANGELOG:57`) を翻訳する **前** であると主張していました。回帰テストでは、**出力された SVG** から、有効にレンダリングされたウィンドウが、`sx=sy=0.7` の下と、再生された中央の `\frac` 分子内の両方で、配置されたパス自体のボックスと一致することがアサートされます。

さらに、2026 年 8 月 13 日の P2/P3 の 6 つの調査結果では、段落は圧縮されていますが、出力コードは依然として耐荷重ガード (`forge/findings/text-richtext-and-markdown.md:1789`) として保持されています。

- **#514 ファントム** — `style.color==="transparent"` (`kernel/Options.ts:306`) はファントム インク (`buildCommon.ts:96`) をマークします。インクをスキップして前進を維持する場合は、`svg.ts:479`/`svg.ts:744` (`phantom` フラグ) です。
- **#514 color** — TeX `\color` はすべてのノード (`functions/color.ts`) に `style.color` を書き込みます。エミッタは `walk` を通じて有効な色を継承し、それによってグループ化され (`svg.ts:1522` `grouped`)、`svg.ts:1542` の `escapeAttr` によってユーザー生成の文字列 (`&`→`&amp;`、`"` など) が強化されます。
- **#514 ルール/ボーダー** — すべての `borderBottomWidth`/`katex-sout`/`.angl`/`.boxed` スタイルは、単なる `frac-line` ではなく、`fullWidth` 四角形 (`svg.ts:800`、`svg.ts:834`) になります。
- **#514 `op-limits`/`x-arrow`/`mover`/`munder` センタリング** — `ROW_ALIGN_CLASSES` (`svg.ts:266`) に追加され、`katex.scss:405`/`563` に対して検証されるため、`\sum` 制限と `\xrightarrow` ラベルは演算子/矢印の中心の下に配置されます。
- **#521 ラップ (`\llap`/`\clap`)** — CSS `right:0`/`margin-left:-50%` (`katex.scss:293`) は、3 つのラップすべてを `rlap` として扱うのではなく、`lapWidth` を測定し、`state.x` を `-lapWidth`/`-lapWidth/2` (`svg.ts:982` `lapKind` 分岐) だけシフトすることによって実装されます。
- **#521 `\smash`/viewBox** — `functions/smash.ts:66` はノードの `height/depth` をゼロにしますが、子はサイズを維持します。エミッタは viewBox をレイアウト ボックスではなく、配置されたインクの **結合** (`svg.ts:1630` `minX/minY/maxX/maxY` 結合) に拡張するため、粉砕されたコンテンツは切り取られません。

### いまも emit 契約を制約するグリフ/テーブル履歴

- **空白のインクとしてグリフが欠落している** (`CHANGELOG:62` `ff79c58`): `U+2248`/`h*`/`l*` などの `569→662 (+87)` サブセットの追加 — 欠落しているアウトラインはメトリクスを介して正しく進められるため、**正しい幅の空白ギャップ**として表示され、目に見えませんがレイアウトは正しく表示されます。
- **表示バリアントのホワイトスペース ホール** (`CHANGELOG:9` set `U+2216`、`U+22C3` 表示バリアント、`U+005F`、オーバーライン テスト ブロック): `markdown-math.ts:559` の `convertMathToSVGDataURI` は、任意の `emitted.missing` で `null` を返すため、表示ブロックは植字ではなく **生の TeX ソース** (青色の CodeBlock) にダウングレードされます。
- **`vertical-separator` (`{c|c}` / `{c:c}`)** (`CHANGELOG:29` #697): 配列の列区切り文字は、ルールを `Span.width` ではなく `style.borderRightWidth`/`borderRightStyle` として書き込みます。修正前は `svg.ts:617` によって完全に削除されました。 `verticalAlign`/`height` → `(y1,y2)` (`svg.ts:718`) でこのペン位置にストローク線が出力されるようになりました。
- **クラスキャリーパディング** (`CHANGELOG:30` #696): `.x-arrow-pad`/`.cancel-pad` などは `katex.scss` にのみ存在するため、`CLASS_H_METRICS` (`svg.ts:366`) より前にそのパディングによって短く測定された行は、インライン `paddingLeft` と同じポイントで折り畳まれます。 `.cancel-lap` の `-0.2em` マージンは同じテーブル内でペアになっていたため、`\cancel` はネット アドバンスを維持しました。
- **境界付きイメージとラスターのキャップ** (`CHANGELOG:61`、`markdown-math.ts:1938` `destroy`、`workerCallbacks` の削除): 座標とは関係ありませんが、ストリームされたドキュメントの負荷に耐えます — 境界のない `inlineMathRasters` は、`mathCache` のエビクションを超えて URI ごとに `HTMLImageElement` を固定しました。

## ベンダー不変条件ガード

スタイルシートとカーネルは共謀してツリーから情報を隠します。以下のすべての値は `katex.scss` またはカーネル ファイル **には存在しますが、`DomSpan`** には存在しないため、エミッターはそれを定数として転記し、ベンダーが実行するたびに転記が検証されます (`scripts/vendor-katex.ts --check`)。

| 転写定数                                                              | 真実の情報源                                                          | ガードされた形状                                                                |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `MU = 1/18` (`svg.ts:60`)                                             | `katex.scss:$mu = 1em/18`                                             | ドリフト ガードは、チェックアウトされた `katex.scss` から `MU` を再導出します。 |
| `NULL_DELIMITER_SPACE = 0.12` (`svg.ts:69`)                           | `$nulldelimiterspace = 1.2em/10`                                      | 同じ                                                                            |
| `SIZE_MULTIPLIERS[11]` (`fonts.ts:263`)                               | `katex.scss $sizes` + `kernel/Options.ts sizeMultipliers`             | scss flattener は両方を再派生します                                             |
| `KATEX_FONT_SCALE = 1.21` (`svg.ts:77`)                               | `.katex {font-size:1.21em}` (`katex.scss:24`)                         | 同じ、`markdown-math.ts:514 ≈ markdown/test/mathBoxGeometry.test.ts` もアサート |
| `ROW_ALIGN_CLASSES` (`svg.ts:266`)                                    | `katex.scss` セクション 405/442/563 + 文書化された `sqrt:left` の偏差 | 同じフラットテナー                                                              |
| `CLASS_TO_FACE`/`DELIM_SIZE_FONTS`/`AVAILABLE` (`fonts.ts:57/98/135`) | `katex.scss` `font-family` ルール                                     | 同じ                                                                            |
| `CONTAINER_BORDER_CLASSES` (`svg.ts:308`, `.angl 0.049em`)            | `katex.scss:601` `.angl` 上部/右側のルール                            | 同じ                                                                            |
| `OVERLAY_PIECES` ウィンドウ (`svg.ts:328`)                            | `katex.scss:519` `.brace-*/halfarrow-*` 絶対ウィンドウ                | 同じ                                                                            |
| `CLASS_H_METRICS` パディング (`svg.ts:366`)                           | `katex.scss:555/569/579/583/601` パッド/ラップ/マージン               | 同じ                                                                            |

`defineEnvironment` のオプションの小道具 (`argTypes`、`allowedInText`、`numOptionalArgs`) は、固定またはドロップされず、**アップストリームのデフォルト** でパススルーされます** (`registry/defineEnvironment.ts`)。そのため、それらを宣言し始める将来の KaTeX バンプでは、それらをサイレントにドロップするのではなく (`forge/findings/text-richtext-and-markdown.md:2075`) 表面化します。

## レイアウト相互作用が実際にどう動くか

インライン計算は **`fillText` ではありません**。 `markdown-inline.ts:287` `inlineMath` は、px の `width/height/depth` が `exToPx(converted.{widthEx,heightEx,depthEx}, runSize)` である `InlineObject` (オブジェクト置換文字 + `InlineObjectBox`) を生成します。`runSize` は、スパン ツリーのその時点で **囲んでいる run** の `fontSize` であるため、見出し内の `$x$` は見出し (`markdown-inline.ts:292`) に合わせて調整されます。 `packages/layout/src/LayoutEngine.ts:808` の `LayoutEngine` は、インライン画像と同様に固定ボックスとして扱います。ボックスの `depth` (ベースラインから下の距離) は、幅/高さが共有する同じ `KATEX_FONT_SCALE/EX_PER_EM` スケールの `emitted.depth + padEm` です。座席の奥行きと幅は一緒に導出されるため、`KATEX_FONT_SCALE` への変更はすべての式のサイズを誤りますが、現在キャンセルされた `EX_PER_EM` への変更は何も変わりません (`markdown-math.ts:111` はペアでキャンセルされたメモ)。

表示演算は改行を完全にバイパスします。`MathBlock` は、コンテナ幅から `MATH_PAD_EM` パディングを差し引いたデータ URI の `SVGEntity` を子とする `MarkdownContainer` です。マージンとオーバーフローは、`LayoutEngine` の問題ではなく、`ScrollView` の問題です。

### `LayoutEngine` がインライン数式をどう扱うか

`LayoutEngine` (`packages/layout/src/LayoutEngine.ts:808` `LayoutEngine`、`README.md:24` 分離エンジン) は TeX を形作ることはありません。インライン計算は 1 つの `StyledSpan{ text: OBJECT_REPLACEMENT, object: InlineObject }` (`markdown-inline.ts:301`) として到着しますが、その `InlineObjectBox{width,height,depth}` はスパンコレクション時に、囲んでいる実行の `fontSize` から `exToPx` を介して修正されます。そのため、レイアウトではボックスがすでに px で表示されます。ホット `LayoutEngine.layout` パスは、他のインライン イメージと同様にそれをラップします (`packages/layout/src/LayoutEngine.ts:2321` `layoutPreparedIntoBuffer` `forge/findings/text-richtext-and-markdown.md:1762` の先頭のメモを保持します。`core/src/text/measureContext.ts:12` キャリブレーションと `core/src/text/Typography.ts:111` `ctx.measureText('Mg')` フォールバックは、同じボックスが依存するボス 02 のテキスト メトリック ガードです): `width` は改行に参加し、`depth` は行を削除します。ベースラインをその距離だけ拡大し、`height+depth` によってラインのボックスが拡大されるため、深さの大きい式 (分数、根号尾部、`\left(` の高い括弧) により、2 回目の測定を行わずにクリアランスが拡張されます。数式上の選択はレイアウトではなくデュアルワールド パリティです — `ContentGridProjector`/`ContentProjectionManager` (ボス 01/03) `InlineObject.alt = t.text` (`markdown-inline.ts:310`) をコピーすることで、読者が TeX ソースを検索/選択/コピーできるようにしますが、キャンバスのヒットは `InlineObjectBox` の四角形のままです。 `LayoutEngine` がキャッシュされた後に `InlineObjectBox` を変更したものはすべて、テキスト パスを汚す必要があります。同じ `measure-once, layout-many` の不変ボス 02 ガードです。

### ボックス形状 — なぜ `KATEX_FONT_SCALE` は残り `EX_PER_EM` は相殺されるのか

`EmitResult` は、**KaTeX** の em でレポートします (1.21 倍、コンシューマのフォント サイズ、`svg.ts:77` `KATEX_FONT_SCALE`、`katex.scss:24`)。 `markdown-math.ts:514` は `EX_PER_KATEX_EM = KATEX_FONT_SCALE / EX_PER_EM (0.4421)` を構成するため、`widthEx = (emitted.width + 2*pad)*EX_PER_KATEX_EM` と `depthEx = (emitted.depth + pad)*EX_PER_KATEX_EM` (`markdown-math.ts:566`) が構成されます。次に、`markdown-inline.ts:305` は px を `exToPx(ex, runSize) = ex * runSize * EX_PER_EM` として解決します。`EX_PER_EM` はキャンセルされ、`px = (em+pad)*1.21*runSize` が残ります。ゼロのテスト動作で `EX_PER_EM` を `0.31` に、3 回の失敗で `KATEX_FONT_SCALE` から `1.0` に変更することによって検証されます (`markdown-math.ts:111` に注意、`test/mathBoxGeometry.test.ts:39` 0.5% の許容誤差は小数第 2 位の四捨五入を吸収します)。 `padEm` は装飾的なものではありません。SVG `width/height` 属性にはすべての側面にそれが含まれていますが、`EmitResult.{width,height,depth}` には含まれておらず、`markdown-math.ts:338` の `drawImage(bitmap, x,y, box.width, box.height)` は SVG 全体をボックスに引き伸ばします。インク ボックスのみをレポートし、すべての数式は `padEm` によって潰され、それなしで深さをレポートし、すべての数式は `padEm` の高さに位置します。

## グリフサブセットとコーデック — バイトがどこにあるか

出荷された `glyphs.subset.ts` (`src/glyphs/glyphs.subset.ts`) は SVG パス テキストではなく、`src/emit/glyphCodec.ts:277` `GlyphTable` によってデコードされたバイナリです。 `scripts/generate-glyphs.ts` での抽出は、TTF `glyf` 二次等高線 (オンカーブ フラグ + 暗黙の中点) を読み取り、`scripts/encode-glyphs.ts` でその展開を逆にします。 `Q` エンドポイント 18 306 個のうち 5 256 個は正確に暗黙の中点であり、削除され、残りの座標はすべて整数になります (中点がなくなるとオフグリッドの 72 616 個のうち 0 個)。ジグザグ バリアント デルタは、72 616 のうち 60 637 を 1 バイト (`math-engine-2026-08.md:333`) にパックします。コーパス (`scripts/subset-glyphs.ts`) は、表示の失敗を制限するものです。`test/glyphCodec.test.ts` のカウント ガードによって固定された 666 個のグリフです。 **`fontMetricsData.js` には存在するがサブセットには存在しない** グリフは、正しい幅の空白ギャップとしてレンダリングされます (メトリクスからの拡張、アウトラインなし、`CHANGELOG:62`)。 **顔が完全に存在しない**グリフ (`\digamma` のような表示のみのクジラ) は、`markdown-math.ts:559` `emitted.missing.length>0 → null → CodeBlock` を通じて劣化します。2 つの障害モードは別個であり、所有者が異なります。

### `packages/core/src/text/*` — TeX がテキストスタックと出会う場所

TeX は **CODE0\__ 整形 (BiDi、アラビア語、OpenType 機能) を呼び出しません。 — グリフはすでに KaTeX のメトリクスによって整形されており、エミッターはアウトラインを直接書き込みます。 TeX が**行う** 共有部分はテキスト スタックの下半分です。`core/src/text/measureContext.ts:12` メジャーコンテキスト キャリブレーションと `core/src/text/Typography.ts:111` `ctx.measureText('Mg')` フォールバックは Web フォントの進歩に対する Boss 02 のガードですが、`svg.ts:499` における TeX の `hmtx` から派生した進歩は KaTeX の類似物です。両方とも同じテキストメトリクスの不変条件 (boss 02 → deep prereq) を満たす必要があります。つまり、実際のフォント、正しいコンテキスト、正しい DPR で測定するか、`InlineObjectBox` がキャンバスのヒット四角形と a11y プロジェクションからドリフトします。 `packages/text/src/fontMetrics.ts:82` `registerFontMetrics` は TeX フェイスに対して呼び出されることはありません。ベンダー提供の `fontMetricsData.js` が TeX メトリクス ソースであり、2 つのテーブルの所有者は異なります。

### 数式の出力 SVG を読む — ground truth としての配置

`EmitResult.placements` (em では `svg.ts:104` `GlyphPlacement[]`) はデバッグ サーフェスです (`markdown-math.ts:517` は、同じスパン ツリーの実際のブラウザ レイアウトに対して相互検証するために存在することに注意してください)。数式が間違っていると思われる場合は、SVG パス スープを読み取るのではなく、配置を比較してください。

```ts
import { layout, emitSVG } from '@vectojs/tex';
const { svg, width, placements, missing } = emitSVG(
  layout('\\sqrt{b^2-4ac}', { displayMode: true }),
);
// width is advance in em; placements[].{x,y,scale,font,code} in em; missing lists absent U+XXXX
```

`width` は、レイアウトを制御する唯一の数値です。過小報告すると `InlineObjectBox` が切り捨てられ、過大報告すると目に見えるギャップが挿入されます。一方、ベースラインからのプラスダウンの `placements[].y` は、KaTeX-in-Chromium DOM プローブを 0.0000 em (`math-engine-2026-08.md:423`) まで一致させる必要があります。失敗したクリップまたはオーバーレイは、パス文字列の違いとしてではなく、`PlacedPath.w/clip.w` と `placements` のエクステントの不一致として表示されます。

## 検証ハーネス — 何が各不変条件を green に保つか

- `test/emit.test.ts:37` — 自己完結型 SVG コントラクト (`<text>`/`font-family`/`url`/`xlink:href` が存在しません。データ URI フラグメントは解決されます)。伸縮性のあるオーバーレイのゼロアドバンスとスライス ウィンドウ処理 (`emit.test.ts:380` `treats multi-piece stretchy overlays as zero-advance`)。
- `test/svgClipWindows.test.ts:6` — #787/#788 のレンダラー ジオメトリの回帰: パスローカル フレームで放出されたクリップパス四角形と、非 1 `sy` (`svgClipWindows.test.ts:83` オーバーブレース タイリング) での整列された vlist 再生の同時ウィンドウ。
- `test/vendorCheck.test.ts:252` — 上流のチェックアウトからすべての `katex.scss` で転写された定数を再導出するドリフト ガード (コメント中括弧トラップはこのパッケージではなく MathJax インポートです)。
- `packages/markdown/test/mathBoxGeometry.test.ts:39` — KaTeX フォントスケール ブリッジ (`KATEX_FONT_SCALE` パッケージ間で同等) および Chromium の実際の KaTeX に対するボックス ジオメトリ (16 ピクセルで 19.3559 ピクセル/em、拡散率 0.02%)。

## 安全に新しい TeX 構文を追加する方法

TeX 構造は **カーネル ビルダー** (AST → スパン + スタイル/クラス) によって定義され、**1 つのエミット ブランチ** によって消費され、これらのスパン/スタイルを適切な範囲に対して配置されたインクに変換します。構成は、**7** サイトが一致した場合にのみ出荷されたとみなされます。どれか 1 つでも欠けていると、歴史的な障害モードになります。

### 1. カーネルビルダーを追加して検証する

`src/registry/defineFunction.ts` / `defineEnvironment.ts` を介して `src/kernel/functions/*.ts` または `src/kernel/environments/*.ts` を拡張します (カーネルの編集によるものではありません)。ビルダーの **出力コントラクト**: 設定するクラス (例: `.mover`、`.angl`、`.cancel-pad`)、書き込むインライン スタイル (`borderBottomWidth`、`paddingLeft`+`padLeftEm`、尾部非表示ラッパーの `minWidth`)、ラッパーが `Span`、`SvgNode`、または`LineNode` を含む `SvgNode` (パス カタログの場合は `kernel/stretchy.ts:69`、`svgGeometry.ts`)、および `style.top`/`style.left`/`style.color`/`transparent` が関係しているかどうか。カーネルの `fontMetricsData.js` 測定値はすでにツリーの `height/depth` に流れ込んでいます。それらを 2 番目のソースとして再導入しないでください。

### 2. エミッターにちょうど 1 つの新しい分岐を教える

ディスパッチは `svg.ts:427` `walk` → `emitSymbol`/`emitSvgNode`/`emitContainer`/`emitVList` にあります。新しいスパンに **ジオメトリに影響を与える新しい CSS クラス**が含まれている場合は、ハードコーディングするのではなく、適切なテーブルに登録します。

- インラインパッド/マージンの場合は `CLASS_H_METRICS` (例: `.x-arrow-pad`、#696) — それ以外の場合は行が短くなります。
- `CONTAINER_BORDER_CLASSES` は、厚さが `katex.scss` 内にのみ存在する境界エッジの場合 (例: `.angl`、`svg.ts:308`)。
- vlist 行の `text-align` が重要な場合は `ROW_ALIGN_CLASSES` (`.op-limits` など、`svg.ts:266`)。
- 新しいスパンが `position:absolute` パーセンテージ ウィンドウ (`svg.ts:328`) の場合は `OVERLAY_PIECES`。

コンストラクトの SVG が固定幅 (400em) を宣言しているが、**可視**の幅が周囲の行の範囲である場合、その SvgNode をリテラルのアドバンス (`svg.ts:859` `#665` / `svg.ts:966` `#667` の `\phase`/`\overbrace` パターン) ではなく、**ゼロアドバンスの保留中のオーバーレイ**として扱います。

### 3. 正しい座標空間に配置する

- コンテナにまたがる **ルールまたは境界線**は、`svg.ts:147` の `PlacedRect{fullWidth:true, edge?}` であり、数式の `state.x` ではなく、**それを囲む `vlist` 行** (`svg.ts:1230` `rectStart` の範囲) に対して `placeRect(startX,width)` によって解決されます。
- 可視幅が宣言された `width` ではない **伸縮性のある単一パス** は、`svg.ts:193` では `PlacedPath{clip?}` であり、`svg.ts:596` では `sliced` が処理されます (`widthEm` ではなく、`rawWidth` によってスケールされます)。また、`minWidth` なしの `hide-tail` の場合は、`FULL_WINDOW` (`svg.ts:966`) として保留されます。
- **マルチピース オーバーレイ**は、`placeOverlay` カバー スケール + `preserveAspectRatio` 位置合わせ (`svg.ts:1275`) およびウィンドウへのクリッピングを伴う `svg.ts:193` での `PlacedPath{overlay}` です (したがって、各ピースはコンテナーの一部を描画します)。
- **垂直区切り文字** (`vertical-separator`、#697) はストロークされた `PlacedLine` (`svg.ts:173`) であり、その `(x1,y1)→(x2,y2)` は `aboveEm = height + verticalAlign` を回復します。これと同じ導出 `svg.ts:718` がすでに行っています。

### 4. 色、phantom、エスケープを保持する

有効な `style.color` から `walk` (`svg.ts:132` `ColoredPlacement`、`svg.ts:479` `color=style.color ?? inheritedColor`、`svg.ts:744` その値のファントム テスト) を継承し、`color==="transparent"` (`\phantom`/`\vphantom`/`\hphantom`/`\mathstrut` の `rlap` を処理する) のときにインクをスキップしながら進み続けます。 `buildCommon.ts:96`、`svg.ts:479`)、同じ色のグループは `<g fill=…>` (`svg.ts:1522`) に達し、補間された色は `escapeAttr` (`svg.ts:1542`) を介してエスケープします。今日の呼び出し元はテーマから派生していますが、`\color{…}` のような TeX 入力からの値は、引数をそのまま `style.color` に書き込み、それ以外の場合は属性から抜け出します。

### 5. 正しいサイジング — 適切なしきい値を選ぶ

`KATEX_FONT_SCALE` と `sizingRatio` は、ペンの前進 (`parseEm` × ごとに `UPEM * scale`) と `PlacedGlyph.scale` (`fonts.ts:265`) の 2 つの場所で乗算的に構成されます。 `SIZE_MULTIPLIERS` の間違ったエントリにより、スクリプト サイズのグリフが最大 50% 誤って配置されますが、これは viewBox 修復では検出されません。

### 6. 計測契約を更新する

構成のジオメトリにコンテナーの範囲 (vlist `width`、radicand width、brace window) が含まれる場合、**幅がわかった後に解決する必要があります** (`svg.ts:1227` では `emitVList` `maxX-startX`、`emitSVG` では `svg.ts:1588` では式 `state.x` にフォールバックします)。 `svg.ts:1630` の以前の境界のない viewBox (レイアウト ボックスだけでなく、配置されたインクの結合) は負荷に耐えます。そのボックスの拡張は、`height/depth` がゼロであるが子はサイズを維持する `\smash`/`\hphantom` に対する #521 の修正でした。

### 7. 2 つのガードレールを green に保つ

- `scripts/subset-glyphs.ts` — コンストラクトが新しいコード ポイントを実行した場合、それらをサブセット コーパス (`src/glyphs/glyphs.subset.json`) に追加し、コーデック ガード (`test/glyphCodec.test.ts` が `package.json` 非 `sideEffects:false` と 666 グリフ数をピン留めする) を再実行します。これにより、コーパスは新しい範囲を黙って削除できなくなります。欠落しているがメトリックが存在するコード ポイントは **空白の正しい幅のギャップ**としてレンダリングされます (`CHANGELOG:62` #665)。表示専用のコード ポイントは **生の LaTeX ソース** (`CHANGELOG:9`) としてレンダリングされます。
- `scripts/vendor-katex.ts --check` — **新しい** CSS 転写定数 (`ROW_ALIGN_CLASSES`、`CLASS_H_METRICS`、`OVERLAY_PIECES` など) を、上流のチェックアウト (`test/vendorCheck.test.ts` SCSS フラットナー) から各値を再導出するドリフト ガードに追加します。そのため、次の KaTeX バンプでのスタイルシートの変更は、それに依存するすべての構成を静かにシフトするのではなく、大声で失敗します (`CHANGELOG:62` ドリフトガード)追加）。

## デバッグチェックリスト

<!-- markdownlint-disable MD056 MD060 -->

| symptom                                                                           | check first                                                                          | file:line                                                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| All stretchies off-canvas / `p.x+sx·clip.x` doubled                               | Clip path emitted in root space instead of path-local                                | `emit/svg.ts:1555` `invSx/invSy`                                            |
| `\overbrace`/`\xleftrightarrow` measures 400×N em; viewBox 400× too wide          | Multi-piece SVG taken as literal advance rather than zero-advance pending overlay    | `emit/svg.ts:859` `OVERLAY_PIECES` + `emitOverlayPiece`                     |
| `\phase` measures 400em while `\sqrt{x}` is correct                               | `hide-tail` with no inline `minWidth` still advances 400em                           | `emit/svg.ts:966` `unclippedHideTail`                                       |
| `\sqrt{b^2-4ac}` vinculum truncated to `0.853em`, radicand partly outside radical | Clip sized to `minWidth` not `max(minWidth, radicandWidth)`, or `sqrt: center`       | `emit/svg.ts:1186` `clip.w < width` + `svg.ts:266` `sqrt:left`              |
| `\sum_{i}` limits flush left; `\xrightarrow{label}` label at arrow left edge      | Row alignment class missing                                                          | `emit/svg.ts:266` `ROW_ALIGN_CLASSES`                                       |
| `\underline`/`\overline`/`\hline`/`\sout` missing                                 | Border span without width — dropped because only `frac-line` considered              | `emit/svg.ts:800` `borderBottomWidth/katex-sout`                            |
| `\boxed`/`\angl` box edge invisible                                               | Border thickness only in `katex.scss` (`.angl`) or `borderStyle` shorthand not read  | `emit/svg.ts:834` `CONTAINER_BORDER_CLASSES` + shorthand                    |
| `{c\|c}` rules invisible; `:` solid instead of dashed                             | `vertical-separator` span dropped; `borderRightStyle===dashed` not applied           | `emit/svg.ts:718` `dashed` + `svg.ts:1597` `stroke-dasharray`               |
| `\llap`/`\clap` ink to the right of the anchor                                    | All three laps using `rlap` (`left:0`) semantics                                     | `emit/svg.ts:982` `llap/clap` width probe + shift                           |
| `\smash`/`\hphantom` content clipped by viewBox                                   | ViewBox derived from zeroed `height/depth` not the union of placed ink               | `emit/svg.ts:1630` `minY/maxY` ink union                                    |
| Colours dropped; `\color{red}x` black or unknowns look valid                      | `style.color` not inherited; or known missing glyphs not gated via `emitted.missing` | `emit/svg.ts:479` + `markdown-math.ts:559` `missing.length>0` degrade path  |
| Narrow gap/overmeasure on `\xrightarrow{\text{…}}` / `\boxed` / `\cancel`         | Class-carried `padLeft/padRight/marginLeft` not folded into advance                  | `emit/svg.ts:366` `CLASS_H_METRICS`                                         |
| Tall delimiter a short paren / wrong italic (`\mathit{123}` normal)               | Font resolved without ancestor `classChain`                                          | `emit/svg.ts:427` + `fonts.ts:194` `resolveFont(chain)`                     |
| `Got group of unknown type` at `layout('x')` after `bun build`                    | `packages/tex/package.json` set to `sideEffects:false` — registries tree-shaken      | `packages/tex/package.json` + `test/glyphCodec.test.ts` guard on that field |

## ストリーミングとなぜ `layout → emit` が行の途中で再入可能ではないのか

インライン数学の `InlineObjectBox` は `LayoutEngine` が認識する前に修正されるため、レイアウト ホット パス内で TeX パイプラインが呼び出されることはありません。 `markdown-math.ts:85` の遅延 `import('@vectojs/tex')` は、`preloadMathJax()` が解決されるまで、ページ上の最初の数式がスタイル付きソース (`markdown-inline.ts:316` `theme.mathFallbackColor` の `else`) としてレンダリングされることを意味します。`ensureMathJax`/`retypesetFromTokens` (`markdown/src/Markdown.ts:3518`) は、同時読み込みを 1 つの Promise に結合し、すでに字句解析されたトークンから再構築し、`tokenChildPrefix` を簡単に正しい状態に保ちます。 `markdown-math.ts:238` の `inlineMathRasters` の LRU はペイントごとに再挿入されるため、まだ表示されているビットマップは削除されません。また、`mathCache` (256) と同じ境界のラスター キャップは、数千の個別の式をデコードする長寿命ドキュメントに対するストリーミング ガードになります (`forge 2026-08-13` 境界ラスター検出)。構築前の `await preloadMathJax()` による 2 番目の呼び出し元は、同期の最初の式の組版を取得します。同じコントラクト ボス 04 の `onStable` は、`waitForAppendSettled` の後に `Array.from(content.children)` のスナップショットを作成するタイミングに依存します。

その `degrade-to-source` コントラクトは、グリフミス コントラクトでもあります。`convertMathToSVGDataURI` の `emitted.missing.length>0 → null` (`markdown-math.ts:559`) は、部分的に欠落している数式を、黙ってギャップのある数式ではなく **コピーされた TeX ソース**としてレンダリングします。そのため、グリフを忘れたコーパスの追加は、間違った数式としてではなく、青い `CodeBlock` として表示されます。表示数学のフォールバック (`markdown/src/Markdown.ts:3520` `retypesetFromTokens` ホールセール) は同じ契約を尊重します。アウトラインのないブロック `\digamma` は、ギャップのある表示ブロックを生成することはなく、ソースのままです。

### `packages/core/src/text/*` とより深いテキスト不変条件

`core/src/text` (`core/src/text/Typography.ts:111`、`measureContext.ts:12`) は **Web** テキストを整形します — BiDi、アラビア語結合、可変フォント アドバンス — TeX ではありません。 2 つのスタックは `InlineObjectBox` でのみ出会います。どちらも `LayoutEngine` (`packages/layout/src/LayoutEngine.ts:808`) が同様にラップする `width/height/depth` ボックスです。したがって、Boss 02 の `measure-once, layout-many` 不変式は両方に適用されます。フォント、DPR、または幅の変更後の古い `InlineObjectBox` は、ボックスに TeX が入っているか `fillText` が入っているかにかかわらず、パリティ バグです。 TeX は `registerFontMetrics` (`packages/text/src/fontMetrics.ts:82`) を呼び出すことはありません。そのメトリクスはベンダーの `fontMetricsData.js` です。 2 つのテーブルの所有者は異なりますが、レイアウトの真実は 1 つあります。

## 不変条件 — PR 前のコピペチェックリスト

1. **深さ安定したクラス チェーン。** `resolveFont(classChain)` および `sizingRatio(classChain)` は、リーフ スライスではなく、実際の累積 (`walk` `chain=[…classChain,…classes]`) からスレッド化されます。
2. **すべてのインラインの長さは `parseEm * UPEM * localScale` です。** 再生時に 2 回目のスケーリングはありません。スケールは焼き付けられます。
3. **エクステントがコンテナ エクステントであるシェイプは、`place*(startX,width)` まで保留されます。** そうでない場合、別の vlist 内の同じ範囲を読み取る 2 番目のコンシューマは、ラジカルを分数の幅まで引き伸ばします。
4. **`100em` として `parseFloat("100%")` はありません。** `parseLength`/`parseEm` は `pct` と `em` を分割します。 `\cancel` オーバーレイのパーセント x は、全幅ルールと同様に vlist の幅に従います。
5. **グリフ ⇔ フォント不変。** 繰り返される同じ面の 2 つのグリフは、1 つの `<defs><path>` および `href="#gN"` を再利用します (`svg.ts:1639` `defId` マップ)。ミス セットは、`getGlyph` に供給したのと同じフォント解像度から計算されるため、`markdown-math.ts:559` の `convertMathToSVGDataURI` は、インクにギャップがある可能性のある式を正確に削除します。
6. **パディングは SVG とボックスに一緒に属します。** `EmitResult.{width,height,depth}` は **インク** です。 `Emitted.svg` `width/height` には、すべての面に `+padEm` が含まれます。 `convertMathToSVGDataURI` の `+pad2`/`+MATH_PAD_EM` の算術演算は、名前付きパッド定数に依存します。デカップリングとすべてのマークダウン式が間違っています。
7. **散文の省略記号/ダッシュは TeX またはコード内にありません。** `decodeProse`/`applyTypography` (`markdown-inline.ts:58`) は `emitProse` を介してのみルーティングされます。コード スパンと数学的失敗のフォールバック (`markdown-inline.ts:321`) はそれらをバイパスするため、`code` 内の `--` や劣化した `$$` が en ダッシュになることはありません。

---

## 参考文献

- `vectojs-docs/content/learn/text-typography.md` — `TextStyle.baselineShift`/`fontSize` が sub/sup (他のインライン数学のようなレイズド実行) のために購入するもの。
- `vectojs-docs/content/learn/streaming.md` + Boss 04 — `marked` 拡張機能が `findStableCut` に影響する理由、およびインライン数学の `InlineObjectBox` が `RichText` スパンと異なる理由。
- `vectojs-docs/forge/decisions/math-engine-2026-08.md` — 測定された決定、ベンダー スコープ、グリフ エンコーディングの選択、修正 5 (`sideEffects:false`)、および 4 つの部分からなる TeX 難易度ランキング。
- `vectojs-docs/forge/findings/text-richtext-and-markdown.md:1789-1924` — 9 つすべての 2026-08-13 P2/P3 テックス検出結果と境界ラスター検出結果が 1 か所にまとめられています。
- `vectojs-docs/forge/baselines/*.json` + `run-browsers.sh` — 引用可能な唯一の数値。ヘッドレス パスは回帰のトリップワイヤーです。
- `packages/tex/test/emit.test.ts` + `svgClipWindows.test.ts` + `vendorCheck.test.ts` — 新しい構造が緑色を維持する必要があるコントラクト (クリップとウィンドウの一致、複数ピースのウィンドウ処理、ドリフト ガード)。

---

_次へ: 06 VMT ランタイム — すべてのエミッターで構築された `SVGEntity` および `MathBlock` がマウントするライフサイクル、ダーティ伝播、およびイベント ディスパッチ。
