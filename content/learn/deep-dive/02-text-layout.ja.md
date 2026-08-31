+++
title = "02 — テキストとレイアウト: Unicode からピクセルまで"
description = "テキストパイプラインの全体像 — セグメンテーション、BiDi、アラビア語整形、フォントフォールバック、Typography、改行、LayoutEngine の cold/hot 分離、ワーカー、そして paint と measure のパリティを保つ不変条件。"
weight = 22
+++

# 02 — テキストとレイアウト: Unicode からピクセルまで

> VectoJS は、ブラウザのテキストスタックが無償で提供する bidi、整形、セグメンテーション、フォントフォールバック、改行、ベースライン配置を再実装します。このドキュメントは Unicode `string` から配置されたグリフまでのすべての段階を追い、`measure` と `paint` を構造的に一致させ続ける契約を説明します。

## 1. パイプライン概観

```text
Unicode string
  │  Intl.Segmenter (word + grapheme)          packages/layout/src/LayoutEngine.ts:916
  ▼
 Grapheme segmentation ─┬─ ArabicShaper.shapeArabic  packages/text/src/ArabicShaper.ts:89
                        │  indexMap: shaped → source       :91
                        ▼
 BiDi resolution (bidi-js, UAX #9)            packages/text/src/BidiResolver.ts:27
  getBaseLevel / resolveLevels / reorderSegments
                        │
                        ▼
 Font fallback (atlas → measurer → 0.5em)     packages/layout/src/measure.ts:39
  createCanvasMeasurer / createMetricsMeasurer / resolveGlyphMeasurer
                        │
                        ▼
 Typography (baseline in line box)            packages/text/src/Typography.ts:93
  cssLineBoxBaseline / registeredBaseline / splitFontShorthand
                        │
                        ▼
 Line breaking + exclusion flow + justify     packages/layout/src/LayoutEngine.ts:1848
  computeLineSegments / suppressLineBreaks / LayoutEngine.layoutPrepared
                        │
                        ▼
 Paint / measure parity ─┬─ @vectojs/layout  (canvas Text/RichText)
                         └─ @vectojs/text    (MSDF: MSDFFont.layout)  packages/text/src/MSDFFont.ts:201
                         └─ @vectojs/core    (MSDFTextEntity → worker) packages/core/src/text/MSDFTextEntity.ts:25
```

2 つの並列コンシューマが同じ計測契約を共有します。**canvas パス**（`@vectojs/layout` + `measureContext`）と **GPU/MSDF パス**（`MSDFFont.layout` + `LayoutWorker`）です。結果が分かれるのは quad がピクセルになる方法だけであり、ファミリごとの改行位置では決して分かれません。

グリッドコンシューマ（ターミナル、エディタ、`CodeBlock`）では、パイプラインはより早い段階で保持されたグリッドパス `prepareContentGrid`（`packages/text/src/PreparedContentGrid.ts:243`）へ分岐します — 一度コンパイルし、2 つのコンシューマ（描画 + 投影）で共有します。コンテンツグリッド側は `tmp/boss-research/01-selection.md` §3.3 を参照してください。

### Cold / hot 分離（リサイズを安くする 2.68 倍）

```text
prepare(text) / prepareRich(spans)          ← cold:  Intl.Segmenter + Arabic shape + BiDi + glyphWidth
  └─→ PreparedText { paragraphs, fontSize }      memo'd by text+fontSize+styleSig (LayoutEngine.ts:829/833)
       │  independent of maxWidth / maxHeight / exclusions
       ▼
layoutPrepared(prepared, mask, exclusions)  ← hot:   computeLineSegments + suppressLineBreaks + shiftedExtent
measurePrepared(prepared)                   ← hot (no alloc): lineCount+height only
layoutPreparedIntoBuffer(prepared, buffer)  ← hot, zero-GC: typed arrays + reorderSegments
```

`benchmarks/text-layout-pretext` / `comparisons/text-layout-pretext` / `scripts/compare-pretext.ts:1` は、リンゴとリンゴの分割 (`measurePrepared` 対 `pretext.layout`) を確立しました。分割前に、`layoutText` (コールド + ホット) は、プレテキストのホット専用 `layout` と比較して測定されました。実際にはセグメンテーション コストであるにもかかわらず、そのギャップはエンジン コストとして報告されていました。

### セグメンターとそのキャッシュ

`LayoutEngine` (`:916`) は、`wordSegmenter` + `charSegmenter` (`Intl.Segmenter`、ロケール `navigator.language ?? 'en-US'`) (CJK と西洋語の単語の境界を自動検出) に加えて、`wordCache: Map<string, …>` (`:821`、cap 500) および `graphemeCache: Map<string,string[]>` (`:822`、cap 2000) を保持します。どちらも上限 (`:921`/`950`) でホールセール フラッシュされ、`cacheStats()` (`:1004`) を通じて監視されます。 `PreparedContentGrid` は書記素 (`:76`) に対して同じ `Intl.Segmenter` を優先しますが、それがない環境では `fallbackGraphemes` (`:107`) を使用します。結合マーク、VS16/VS15、スキントーン修飾子 `U+1F3FB–1F3FF`、地域インジケーター、ZWJ — タブストップとワイドカラムを正しく保つのに十分です。 `LayoutEngine.getGraphemes` (`:943`) および `getWordSegments` (`:881`) が唯一の呼び出しサイトです。 `shapeSimpleRun` (`:1644`) は、`isComplexScript` (`:584`) が安全であると証明した場合にのみ `ArabicShaper` をバイパスします。

## 2. モジュールごとの深掘り

### 2.1 `packages/text/src/BidiResolver.ts:27` — UAX #9（`bidi-js` 経由）

static のみのクラスです（意図的に — `BidiResolver.getBaseLevel(...)` は公開 API です）。`bidi-js` の `getEmbeddingLevels` / `getReorderedIndices` / `getReorderSegments` に対する薄いラッパーです。以前の手書き L2 反転は、L1 リセットが末尾空白の単一ランのみを処理していたため置き換えられました。

| 方法                                      | ライン | 何をするのか                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getBaseLevel(text)`                      | `:29`  | 段落埋め込みレベル P2/P3 (0 LTR、1 RTL)。                                                                                                                                                                                                                                                                                          |
| `resolveLevels(text)`                     | `:34`  | キャラクターごとに解決されるレベル X1 ～ I2 (`Uint8Array`)。                                                                                                                                                                                                                                                                       |
| `reorderIndices(text)`                    | `:50`  | 視覚→論理順列 L1+L2 (`indices[v] = logical index at visual column v`)。権威 — 選択は論理範囲を視覚的な実行にマップします。                                                                                                                                                                                                         |
| `logicalToVisualRuns(text, start, end)`   | `:62`  | 1 つの論理 `[start,end)` → N つの視覚 `[visualStart,visualEnd)` が左から右にソートされて実行されます。単一の選択四角形が方向境界をまたぐと、複数の選択四角形になります。                                                                                                                                                           |
| `reorderVisual<T>(nodes, baseLevel)`      | `:89`  | 1 つのラインのノードのインプレース L1+L2 反転。 `str` + `levels` を再構築し、`reorderSegments` を繰り返します。ラップされたすべてのラインが熱くなります。                                                                                                                                                                          |
| `reorderSegments(str, levels, baseLevel)` | `:121` | 型付き配列 `[start,end]` ペア (`packages/layout/src/LayoutEngine.ts:2466` コメント) と同じ順列 — グリフごとに `BidiNode` オブジェクトを割り当てずに、ゼロ GC バッファー パス (`layoutPreparedIntoBuffer`) にそれを適用させます。 `embed = { levels, paragraphs:[{level: baseLevel}] }` を合成して、L1 を段落方向にリセットします。 |

コスト: 段落ごとに `bidi-js` 1 パス。`reorderVisual` 内の配列構築以外にグリフごとの処理はありません。

### 2.2 `packages/text/src/ArabicShaper.ts:18` — 文脈依存の整形

アラビア語ブロックにペルシャ語/ウルドゥー語拡張を加えた表示形置換です。`MAPPINGS: { [code]: GlyphForms }`（`:18`）は `isolated/initial/medial/final` のコードポイントと `joining: 'D'|'R'|'U'` をコードポイントごとに記録します。タトウィール `U+0640` は `'D'` ですがすべての形で同じコードポイントを出力するため（`:052`）、結合が透過します。

- `isHarakat(code)` (`:70`) — `U+064B–065F`、`U+0670`、`U+0610–061A` (敬称記号)、`U+06D6–06ED` (コーランの注釈) に加えて、ハラカットに隣接する 3 つのマーク範囲。すべての結合タイプは TRANSPARENT です。整形はそれらを越えてスキップするか、敬語テキストを切断する必要があります。 `MSDFFont.ts:isNonspacingMark` (`:132`) をミラーリングします。
- `getJoiningType(code)` (`:84`) — テーブル検索、存在しない場合は `'U'`。
- `shapeArabic(text)` (`:89`) — 単一の左から右へのウォーク: 合字先読み (`lam+alef` `U+0644` + `U+0627/0622/0623/0625` → プレゼンテーション合字、`k` ポインター `:105`)、後方/前方スキャンによって計算された `connectPrev`/`connectNext` (`:182`/`:187`)透明マーク、`glyph = forms.isolated/initial/medial/final`。 `{ shapedText, indexMap: Int32Array }` (`:1`) — `indexMap[visualIndex] = sourceOffset` を返すため、`LayoutEngine` は整形後に `sourceIndex/sourceLength` を回復できます。

選択の契約: 視覚的位置は並べ替えられますが、`sourceIndex` は常に元の論理文字列を指します。

### 2.3 `packages/text/src/measureContext.ts:41` — 描画するところで計測する

1 つの不変条件を強制するために存在するモジュールです。デタッチされた `HTMLCanvasElement` は、汎用ファミリ（`monospace`、`serif`）を Gecko 上でドキュメントのアタッチされた canvas とは**異なるフォント**に解決します。汎用→実フォントのマッピングはライブなスタイルコンテキストからのみ到達可能な言語ごとのフォント設定に存在するためです。

ヘッダー テーブル (`:1`): Firefox 153、`<html lang="zh">`、DPR 1.5789、`measureText('MMMMMMMMMM')` — デタッチされた `22px monospace` 109.7、アタッチされた 131.6、レイアウト 132.0。切り離された `serif` 109.7/205.5 — 両方とも 1 つのハードコードされたフォールバックに折りたたまれ、20 ～ 47% のエラーが発生しました。クロムは影響を受けません。 `OffscreenCanvas` の測定値は 132.0 (レイアウトと一致) ですが、使用されていません。**ペイントされた** キャンバスに同意することがより重要です。

- `createMeasuringContext()` (`:62`) — 1×1 キャンバス、`position:absolute;opacity:0;left:-9999px;top:0`、`aria-hidden`、`document.body` に追加されます。 `display:none` を実行すると、レイアウトから削除され、スタイル コンテキストが失われます。切り離された状態は故障モードです。
- `getSharedMeasuringContext()` (`:87`) — 単一の共有コンテキスト (`:41` `sharedCanvas`/`sharedContext`)。 `null` (`undefined` と `null` の区別、`:98`) をメモ化するため、SSR (`typeof document === 'undefined'`) はグリフごとに作成を再試行しません。 `ctx.font` はすべての読み取りの前に設定されます。幅キャッシュされたものはコンテキストとともに伝わりません。
- `isSharedMeasuringContextAttached()` (`:118`) / `resetSharedMeasuringContext()` (`:130`) — `document.body` が存在する前に作成されたコンテキストの診断と回復。現在、リポジトリ内の呼び出し元は自動再作成されません。呼び出しサイト パターンは `:111` に記載されています。

すべての測定者はこれを呼び出す必要があります。 `packages/layout/src/measure.ts:42` はそうです。 `packages/` で分離された `document.createElement('canvas')` を grep するのが監査です。

### 2.4 `packages/text/src/fontMetrics.ts:14` — DOM なしメトリクスレジストリ

canvas がまったく存在しない環境（SSR、`OffscreenCanvas` なしの worker、テスト）のためのものです。値は **em 単位** なので 1 回の登録ですべてのサイズに対応します。

- `FontMetricsSource` (`:14`) — `advanceEm(char)`、オプションの `measureEm(text)` (カーニング対応)、`ascenderEm`/`descenderEm`。 `measureEm` のフォールバックは `advanceEm` を加算しており、正しいですが、カーニングが低下します。
- `normalizeFamily` (`:45`) — 最初のファミリーのみ、引用符が取り除かれ、小文字になります。フォールバック チェーンはレンダラの問題であり、レジストリの問題ではありません。
- `registerFontMetrics(family, source)` (`:82`)、`registerMSDFFontMetrics(family, font)` (`:97`)、`createMSDFMetricsSource(font)` (`:114`) — `font.getGlyph(code)?.advance` からの `advanceEm`、`font.layout(text, 1).width` からの `measureEm` (カーニングできる唯一のパス。グリフごとの `GlyphMeasurer` には隣接パスがありません)。 `font.data.metrics` からの `ascenderEm`/`descenderEm`。 `hasFontMetrics` (`:154`) は、何も登録されていない場合にショートする安価なプローブです。
- `fontMetricsVersion()` (`:64`)、`getFontMetrics` (`:141`)、`clearFontMetrics` (`:163`)。バージョン カウンターを使用すると、呼び出し元は解決されたソースをキャッシュし、問題が発生した場合にのみ再解決できます。つまり、その時点で登録されていたピンをチェックせずにソースをキャプチャします (`measure.ts` の `:107`)。したがって、`createMetricsMeasurer` (`measure.ts:96`) は `baseVersion/runVersion` を遅延保持し、グリフごとに `normalizeFamily` を呼び出すのではなく、グリフごとに 1 回比較します (測定ホット パスでの `+13%` オーバーヘッドが回避されます)。

### 2.4b `packages/text/src/index.ts:1` — バレル

`ArabicShaper`、`BidiResolver`、`measureContext`、`PreparedContentGrid`、`MSDFFont`、`fontMetrics`、`Typography` を再エクスポートします (`:1`). `@vectojs/layout` imports from `@vectojs/text` (not relatively) — `LayoutEngine.ts:1` `import { ArabicShaper } from '@vectojs/text'` — so the package boundary is observable. The `LayoutWorkerManager` singleton also caches `MSDFFontData` (`LayoutWorkerManager.ts:043`) across worker death for exactly this reason: metric data crosses the thread boundary once and must remain available for the fallback path.

### 2.5 `packages/text/src/Typography.ts:4` — CSS 行ボックス内のベースライン

CSS はフォントの ascent+descent を行ボックス内で中央寄せし、canvas は明示的な y で描画します。両者は一致しなければならず、そうでなければ `fillText` とそのネイティブミラーが異なるベースラインに配置されます。

- `BASELINE_CACHE_MAX = 512` (`:12`)、`baselineCache: Map<string,number>` (`:4`)、`rememberBaseline` (`:14`) — 挿入オーダー LRU (ヒット時に削除 + 再設定、`:98`)。 512 は、リアルなドキュメント内のすべてのフォントをカバーします。ミスは 1 つの `'Mg'` を再測定します。
- `splitFontShorthand(font)` (`:33`) — `indexOf('px')` に固定され、`/(\d+)px/` (多項式 ReDoS、`js/polynomial-redos`、高) ではなく、数字の上を戻ります。 `@vectojs/ui`/`@vectojs/markdown` のパーサーを意図的に異なる失敗値でミラーリングします。
- `registeredBaseline(font, lineHeight)` (`:67`) — `getFontMetrics` からの DOM フリー パス。 `(lineHeight - ascent - descent)/2 + ascent` と `descent = -descenderEm * size`;フォールバック `lineHeight * 0.8`。
- `cssLineBoxBaseline(font, lineHeight)` (`:93`) — 順序付けられた選択: SSR→`registeredBaseline`;キャッシュヒット→リターン。 `getSharedMeasuringContext` (添付、`:107`) → `ctx.measureText('Mg')` → `fontBoundingBoxAscent/Descent || actualBoundingBoxAscent/Descent` (`:112`) → 同じセンタリング式。縮退メトリクス→`0.8` フォールバック。同じ `0.8` 定数が `LayoutEngine.ts:shiftedExtent` (`:668`) とラインボックス `1.5 * pMax`/`0.8 * pMax` ジオメトリを固定します。
- `clearCssLineBoxMetrics()` (`:122`) — Webフォントの読み込みが完了した後に呼び出します。

### 2.6 `packages/text/src/MSDFFont.ts:151` — GPU テキスト

`msdf-atlas-gen` の JSON（type `msdf`/`mtsdf`/`sdf`）をパースし、CSS ピクセルで quad をレイアウトし atlas UV を持ちます。レンダラーの規約: ローカル空間は y-down、原点は左上、UV は atlas 上端で `v=0`（アップロード時に Y 反転なし）。

- インターフェイス: `MSDFAtlasInfo` (`:16`、`distanceRange/size/width/height/yOrigin`)、`MSDFMetrics` (`:32`、`lineHeight/ascender/descender`)、`MSDFBounds` (`:45`)、`MSDFGlyphDef` (`:53`、`unicode/advance/planeBounds/atlasBounds`)、`MSDFKerning` (`:64`)、`MSDFFontData` (`:71`)、 `PositionedGlyph` (`:79`、`x/y/w/h + u0/v0/u1/v1`)、`MSDFLayoutResult` (`:96`、`glyphs/width/height`)、`MSDFLayoutOptions` (`:105`)。
- `kernKey(a,b)` (`:115`) — `a * 0x110000 + b`; `isNonspacingMark(code)` (`:132`) — 明示的な範囲リスト (グリフごとのループで安価、`\p{Mn}` 正規表現なし)、`LayoutEngine.ts:isComplexScript` (`:584`) をミラーリングします。
- `MSDFFont` (`:151`) — `id` (`font-${idCounter++}` `:164`)、`byCode: Map<number,MSDFGlyphDef>`、`kern: Map<number,number>`、`missingAdvance` (`:158`、スペース→`.notdef`→`0.5`)。 `parse` (`:173`)、`getGlyph` (`:178`)、`distanceRange`/`atlasWidth`/`atlasHeight` (`:183`)。
- `layout(text, fontSizePx, opts)` (`:201`) — コードポイント対応 (`Array.from(text)` `:212`)、`\r\n`/`\r` を 1 つのブレークとして尊重します (`:214`)、欠落グリフ → `missingAdvance * size` (決して 0、またはそれ以降のグリフは左にシフトします) ただし、0 (`:233`) を進める `isNonspacingMark` を除きます。 `prevCode` をカーニング (`:252`) に置き換えます。カーニング `k * fontSize` (`:242`)、`baseline = y + (ascender + line*lineHeight)*size` (`:246`)、`planeBounds`→クアッド (`:246`ff)、`yOrigin` は `v0/v1` (`:250`) を反転します。 `{ glyphs, width: maxAdvance, height: (line+1)*lineHeight*size }` を返します。

### 2.7 `packages/text/src/PreparedContentGrid.ts:38` — 保持されたグリッドプラン

グリッドテキストのための不変でソース対応の形状です。一度コンパイルし、canvas 描画と DOM 投影で共有します — 再セグメント化すると bidi、タブ、幅広グリフが異なる位置に配置されます。

- `PreparedContentGrid` (`:38`) — `{ kind:'content-grid', revision, source, font, cellWidth, lineHeight, baseline, tabSize, lines }`; `PrepareContentGridOptions` (`:50`); `MutableCell` (`:63`)。
- `graphemeSegmenter` (`:76`、`Intl.Segmenter`、`grapheme` 粒度) と `fallbackGraphemes` (`:107`) は、マーク、バリエーション セレクター、絵文字修飾子、キーキャップ、地域インジケーター、ZWJ の組み合わせをカバーします。 `graphemes()` (`:151`) は `Intl.Segmenter` を優先します。
- `isWideCluster` (`:170`) — `EAST_ASIAN_WIDE` (`:91`、CJK ブロック) + `VS16`/`VS15` 感度の `EXTENDED_PICTOGRAPHIC` + `EMOJI_PRESENTATION` + `REGIONAL_INDICATOR`/`0x20E3`。ワイド→2カラム。
- `sourceLines` (`:197`) — `\r\n`/`\r`/`\n` を所有します。 `sourceStart/sourceEnd/nextSourceStart` なので、以降のオフセットはすべて正しいです。
- `prepareContentGrid(source, opts)` (`:243`) — 行ごと: `graphemes(rawLine)` からの `rawCaretBoundaries`、`ArabicShaper.shapeArabic(rawLine)` (`:270`)、`graphemes(shaped)`、`BidiResolver.resolveLevels` (`:273`)、`sourceStart/sourceEnd` 経由の `indexMap` (`:278`)、`sourceCaretOffsets` 経由の形状書記素ごとのセル`lowerBound` (`:159`)、`columns = 0/ tabStop / wide?2:1` (`:298`)、`BidiResolver.reorderVisual(visualCells, getBaseLevel(shaped))` (`:315`)、`x` は合格 (`:317`)。返却前に冷凍しておきます。

### 2.8 `packages/layout/src/LayoutEngine.ts` — プローズレイアウトエンジン

約 3.4k 行、テキストスタックで最も重い単一ファイルです。アーキテクチャは型付き契約上の **cold/hot 分離** です。

**コールドハーフ** (高価、制約なし):

- `prepare(text, atlas, size)` (`:1080`) / `prepareRich(spans, atlas, size, baseStyle)` (`:1266`) — `Intl.Segmenter` (単語 `:916` + 書記素 `:917`) を実行し、`glyphWidth` (`:929`、アトラス→`GlyphMeasurer`→`0.5em`)、形状 (`ArabicShaper` `:1117`) を介してグリフ アドバンスを解決します。 (`BidiResolver` `:1123`/`:1524`)、`PreparedText` (`:462`) をビルドします。結果は `maxWidth`/`maxHeight`/除外から独立しています。段落メモ化: `paragraphCache: Map<string,PreparedParagraph>` (`:829`) は `${fontSize} ${paragraph}` によってキー化されます。 `${fontSize} ${text} ${styleSig}` をキーとするリッチ バリアント `richParagraphCache` (`:833`)。ここで、`styleSig` は、`TextStyle` フィールド + `InlineObject` ID (太字/斜体/カラー/href/fontFamily/baselineShift/highlightColor/abbrTitle とオブジェクト `width/height/depth/alt/key`) に対する RLE 値署名です。 Atlas ID の変更により、両方 (`:1095`/`:1275`) がクリアされます。

`prepareRich` 内の **ストリーミング高速パス**: `streamShapeCache` (`:839`、シングルスロット増分キャッシュ)。 `:1358` の条件: 単一段落、`\n`/`\r`、`!isComplexScript(fullText)` なし (`:584` — アラビア語/ヘブライ語/インド語/結合/bidi マーク/絵文字修飾子はフル シェイパーにフォールスルーされます)。 `fullText` が `cache.text` を厳密に拡張する場合、スタイルは接頭辞 (`styleRangeEquals` `:682`、`objectRangeEquals` `:628`) に対して等しく、接頭辞の単語をそのまま再利用し、接尾辞に対してのみ `shapeSimpleRun(fullText, reshapeFrom, ...)` (`:1644`) を呼び出します。 `reshapeFrom` は `cache.end` ではありませんが、後続の同じカテゴリ (空白文字と非空白文字) の実行の開始点であるため、次のチャンクが到着すると解消される `Intl.Segmenter` 境界 (例: `"3"+"."+"1"` → `"3.1"`) が正しく再構築されます。ステータス: 出荷済み、正確に測定されたエッジケースの勝利、現実的なドキュメントでは無視できる程度 (メモはすでに段落ごとのコストに上限を設けています) — `forge/findings/text-richtext-and-markdown.md:356` に従ってスタンドアロン `@vectojs/core` リリースから保持されています。

**ホットハーフ** (安価、制約あり):

- `layoutPrepared(prepared, exclusionMask?, exclusions?)` (`:1848`) / `measurePrepared` (`:1772`) / `layoutPreparedIntoBuffer(prepared, buffer, mask?)` (`:2241`) — `PreparedText` 単語を歩き、`currentX/currentY` にグリフを配置し、`maxWidth`/`maxHeight`、`exclusions: ExclusionRect[]`、`computeLineSegments(top,bottom,maxWidth,exclusions)` (`:504`、`O(n log n)` のマージを尊重) x 間隔、`[0,maxWidth]` 内の補数)、孤立句読点の抑制 (`suppressLineBreaks` `:721`、`'@'` 結合 + 終了句点マージ)、ハイフネーション (`U+00AD` または `this._hyphenate` フックからの `breakPoints`、`hyphenWidth` `:490`)、位置揃え (`textAlign:'justify'` は複数実行時のみ)行)、`shiftedExtent(gfs, shift, pMax)` (`:668`) は、共有の `0.8/0.2` 行ボックス分割を適用するため、上付き文字がボックスから出るときにのみ行を拡大します。 `layoutPrepared` は `LayoutNode[]` + `LayoutResult` を割り当てます。 `layoutPreparedIntoBuffer` は、割り当てなしでフラット型配列を書き込み、同じ BiDi `reorderSegments` パスを適用します。

その他の負荷がかかる部分: `EMPTY_GLYPH_ATLAS` (`:83`、固定定数 — `Text`/`RichText` は、新しい `{}` リテラルによる呼び出しごとに段落メモが無効にならないように、これを渡します。200×12 の段落再レイアウト `:64` で 2.68 倍を測定)。 `unmeasuredGlyphCount()`/`resetUnmeasuredGlyphCount()`/`setUnmeasuredGlyphWarning()` (`:8` — `0.5em` の製造はサイレントではなくカウントされます。`fallbackToCanvas` (`:380`、トライステート `undefined` 対 `true`) は欠落アトラスのみを報告し、欠落測定者は報告しません)。 `GlyphMeasurer` (`:92`、`measure(char,size,family,bold,italic)` — 実行ごとのファミリー/スタイルのオーバーライドにより、インライン `code` は独自のメトリックで測定し、`warnUnmeasured` (`:9`) は `unmeasuredGlyphCount` によってゲートされたワンショット警告); `TextStyle` (`:113`、~9 フィールド: `fontSize/color/bold/italic/fontFamily/lineThrough/baselineShift/underline/highlightColor/abbrTitle/href` — 事前に影響するものはすべて `styleSig` に存在する必要があります。`fontFamily` は 2026-07-30 まで欠落しており、`monospace` 段落が無限のキャッシュ ヒット率で提供されていました。プレフィックスの empty-atlas churn が維持されていたためのみ潜在的でした。ヒット数 0 の場合は `paragraphCache`); `InlineObject` (`:216`、`OBJECT_REPLACEMENT U+FFFC :198`、修正済み `width/height/depth/alt/key/paint` `:216`、`width/height/depth` はすでに px に解決されています、`paint` (`:301` `InlineObjectSurface { drawImage, drawImageRect } :315`) はエンジンによって呼び出されることはありません、`InlineObjectBox { x,y,width,height } :299` にはすでに `depth` が含まれています); `cacheStats()` (`:1004`) は、`word(500)/grapheme(2000)/paragraph(1000)/richParagraph(1000)` (`:831` キャップ) ごとに `hits/misses/evictions/hitRate/size/capacity` を公開し、`resetCacheStats()` (`:1030`) はエントリを保持します。 `LayoutResult` (`:378` `nodes/totalWidth/totalHeight/fallbackToCanvas`) は、すべてのホット パスの唯一の出力です。 `GridTextEntity` (`components/GridTextEntity.ts:4`、従来の `n`) と `PreparedContentGrid.ts:243` の分割により、どのグリッドが保持され、どのグリッドがダム `fillText` ループであるかが明確になります。

コード用語でのホットパス配置: `layoutPrepared` (`LayoutEngine.ts:2050`ff) 内では、まず段落ごとの `pMax` がオブジェクト用に拡張され (`objDescent`/`ascent > pMax*0.8` → `pMax = ascent/0.8`)、次に `lineHeight = max(pMax*1.5, pMax*0.8+objDescent)` が `computeLineSegments` / `startLine` (`:2004`) を駆動し、続いてハイフンプレフィックス分割による wordQueue ウォーク (`:2109`) が続きます。 (`:2123` `chosen`/`prefixWidth`/`hyphenWidth`) とグリフ ループ (`:2159`) の `y` 配置 (`:2183`) は、オブジェクト (`currentY + pMax*0.8 - (height-depth)`)、ベースライン シフト (`currentY + (pMax-gfs)*0.8 - baselineShift`)、プレーン (`currentY + (pMax-gfs)*0.8`) の 3 つのアームです。 `exclusionMask` (`:2155`) および先頭スペースの抑制 (`preserveLeadingSpaces` `:796`、`:2180`) はグリフごとです。 `msdfLayout.ts:154` は、同じ 3 つのアームから除外を除いたものをミラーリングします。

`file:line` で知っておく価値のあるサポート契約:

- `GlyphAtlas` (`LayoutEngine.ts:58`、`width/baseSize/ast`) および `EMPTY_GLYPH_ATLAS` と段落メモ ID (`:83`) の新しい `{}` リテラル。
- `PreparedGlyph` (`:402`、`char/width/style/object/level/sourceIndex/sourceLength/atlasMiss`) - `char.trim().length>0 && !hasGlyph` の場合のみ `atlasMiss:true` を使用するため、空白はフォールバックをマークしません (`prepare` の `:1134`)。
- `PreparedWord` (`:433`、`glyphs/width/isWordLike/isWhitespace/breakPoints`) — `width` はキャッシュされた合計、`breakPoints` はソフト ハイフンまたは `hyphenate` です。
- `ExclusionRect` (`:482`) + `computeLineSegments` (`:504`) — `O(n log n)` 対象となる x 間隔の補数 (行ごと)。
- `LayoutEngine.isComplexScript` (`:584`、保守的 — 過剰にレポートするため、単純にコンテキストフリーのテキストのみがサフィックスのみの整形の対象となる) および `splitParagraphs` (`:566`、`\r\n|\r|\n`、`consumed` はソース オフセットを正確に保つため、CRLF `\r` は決して豆腐グリフになりません)。
- `shiftedExtent` (`:668`) は 3 つの `pMax` ウォークすべてで共有されます。ライン拡張ロジックは決して分岐してはなりません。
- `suppressLineBreaks` (`:721`、GH-457 `'@'` 結合 + 終了句点 `.:,;)]}!?` と `breakPoints` リベースのマージ)。
- `LayoutBuffer` (`layoutPreparedIntoBuffer` `:2241` の場合は `:2449`、`{ glyphs: PositionedGlyph[], widths: Float32Array, levels: Uint8Array }`、呼び出しサイトでメジャー/ペイントの合意を強制する `V8_SMI_MAX` 境界付き型付き配列パス)。

### 2.8b 改行、exclusion フロー、ジャスティフィケーション — hot パスの配置ルール

ホット パスは、`PreparedText` が `x/y` になる場所です。エンジン外部の 3 つの純粋な関数と内部の 1 つのメソッドが、すべてのラップの決定を制御します。 `LayoutEngine` (`packages/layout/src/LayoutEngine.ts`) と `msdfLayout` (`packages/layout/src/msdfLayout.ts`) の間で一致する必要があります。そうしないと、GPU とキャンバスのブレークが分岐します。

- **`computeLineSegments(top, bottom, maxWidth, exclusions)` (`LayoutEngine.ts:504`)** — 除外フローのテスト可能なコア。 `ExclusionRect { x,y,width,height }` (`:482`) および `LineSegment { x0,x1 }` (`:490`) のみがタイプです。純粋な `O(n log n)` (ブロックの並べ替え) / `O(n)` スペース: `[0,maxWidth]` にクランプされた `[top,bottom)` と重複する `exclusions` の x 間隔を収集し、接触/重複する間隔をマージし、`[0,maxWidth]` 内で補完します。何も重なり合わない場合は `[{0,maxWidth}]` を返し、四角形 (または共用体) が幅にまたがる場合は `[]` を返します。グリフごとではなく、行ごとの時間 — `layoutPrepared` (`:2004` `segs = computeLineSegments(currentY, currentY+lineHeight, maxWidth, exclusions)`) 内で `currentY` が進むごとに 1 回呼び出されます。 `hasEx` ガード (`LayoutEngine.ts:1860`) は非除外パス (単一の全幅セグメント) を迂回するため、一般的なケースでは割り当ては発生しません。

- **`suppressLineBreaks(words)` (`LayoutEngine.ts:721`)** — GH-457 は配置前に事前マージされます。ルール 1: `'@'` (`glyphs.length===1 && char==='@'`) は、後続の空白以外のすべての単語とマージされます (`"@vectojs/core"` はアトミックのままです)。ルール 2: 終了句 `.:,; ) ] } ! ?` は決して行を開始しません。先行する非空白語単語に逆方向にマージされます (空白語をスキップするため、`"word !"` は `" !"` 擬似単語を作成しません)。マージ時に `breakPoints: number[]` をリベースする必要があります (`:732` `+ offset`、`:791` `+ prev.glyphs.length`)。そうしないと、ソフト ハイフンの機会がダウンストリームの間違ったグリフ インデックスに到達します。 `msdfLayout.ts:195` `isOrphanPunct` / `breakableAnywhere` (CJK `code >= 0x2e80`) ロジックに反映されます。

- **ハイフネーション** — 同じ `PreparedWord.breakPoints: number[]` (`LayoutEngine.ts:441`) を埋める 2 つのソース: ソース内のソフト ハイフン `U+00AD` は目に見えないブレーク機会 (事前なしで書記素ループ `:1134` `(breakPoints ??= []).push(glyphs.length)` で消費される) であり、プラグイン可能な `LayoutEngine.hyphenate: (word)=>string[]` (`:880`) は `isWordLike && glyphs.length>3` ワード (`:1144`) ごとに参照されます。コード単位ではなく書記素をカウントするために、`getGraphemes` を通じて再セグメント化されます。 `hyphenWidth` (`:490`、`glyphWidth` を介した `'-'` の前進) は、一部のワードが `breakPoints` を伝送する場合にのみ、`PreparedText` ごとに 1 回測定されます (ミスは測定コストがかからず、メトリクスのないノードでは `unmeasuredGlyphs` が増加しません)。ラップ時に、エンジンはソフト ブレーク (`msdfLayout.ts:131` の `softBreaks: {at,x}[]`) を優先し、`'-'` クワッド (`msdfLayout.ts:167` `emitHyphen`) を生成するハイフン付き分割に戻ります。 `MSDFTextEntity` は、注釈付き `layoutText` を介してメインスレッドでハイフネーションを駆動します。ワーカーがコールバックを呼び出すことはありません。

- **`shiftedExtent(gfs, shift, pMax)` (`LayoutEngine.ts:668`)** — 3 つの `pMax` ウォーク (`measurePrepared`、`layoutPrepared`、`layoutPreparedIntoBuffer`) すべてで共有されるため、行の高さが発散することはありません。ライン ボックスの高さは `1.5 * pMax`、ベースラインは `0.8 * pMax` (`Typography.ts:93` と同じ分割) です。発生した実行 (`shift>0`、CSS `vertical-align` ポジティブアップ、上付き文字): `need = shift + 0.8*gfs` は `0.8*pMax` に適合する必要があります。下げられました (`shift<0`、添え字、`InlineObject.depth` の逆符号): `need = -shift + 0.2*gfs` は `0.7*pMax` に適合する必要があります。例: `0.75em` スーパーシフト `~0.3em` は `0.8*(pMax-gfs)` スラック内に収まり、何も増加しません。はるかにシフトすると、`pMax` が `need/0.8` または `need/0.7` に増加します。すべての正当化パスと除外アドバンスは、最終的な `pMax` に対して再計算されます。

- **`justifyLines(wrapClosedLines, lineOf, xCoords, codePoints, advances, maxWidth, maxLineWidth)` (`msdfLayout.ts:11` + `LayoutEngine.ts:1937`)** — ソフトラップされたすべての行を `maxWidth` にフラッシュします。戦略: `indices` を `lineOf` でグループ化し、`wrapClosedLines` のミス (各段落の最終行、明示的な改行、および `hitMaxHeight` の切り捨て) をスキップし、次に `slack = maxWidth - (xCoords[lastIdx]+advances[lastIdx])` を行範囲の半分で制限します (非常に短い行でのグロテスクな伸びを防ぎます)。スペースいっぱいの行は、ワード間の `0x20` ギャップを均等に広げます (`extra = slack / spaceIdx.length`、`shift` アキュムレーター `:58`)。スペースのない CJK 行は、各グリフ (`:70`) の間に `slack / lastContent` を分散します。複数実行の除外行は正当化されません (`LayoutEngine.ts:1937` シングル実行ガード)。 `LayoutEngine` と `msdfLayout` の間でミラーリングする必要があります。両端揃えの幅は、`positionedRuns` と `logicalRuns` で再利用されるコントラクト コンテンツの投影です。

### 2.9 `packages/layout/src/measure.ts:39` — measurer の選択

- `createCanvasMeasurer(family, baseSize=100)` (`:39`) — `getSharedMeasuringContext()` (`:44`)、`baseSize` での `Map<string,number>` 書記素ごとのキャッシュ、線形スケーリング `base * (size/baseSize)` (`:68`)。実行ごとの `family/bold/italic` キーは毒を防ぎます。
- `createMetricsMeasurer(family)` (`:96`) — 登録された `FontMetricsSource` (バージョン化された `fontMetricsVersion` 比較による `:106` 遅延解決、すべての呼び出しで回避されるグリフごとの検索の `+13%` オーバーヘッドと `normalizeFamily` 内での割り当て)。実行ごとの `family` オーバーライドは、その実行の登録が解除されると、`0.5em` ではなくベース ソースにフォールバックします。太字/斜体は意図的に無視されます (ファミリーごとに 1 つの事前テーブル)。
- `resolveGlyphMeasurer` (`:161`) — キャンバスは、仕様により `null` よりもメトリクスに優れています。合成された重みを含め、レンダラーが描画するものを測定します。古い登録によってグラウンド トゥルースが上書きされてはなりません。

### 2.10 `packages/layout/src/msdfLayout.ts:93` — ワーカー向け MSDF ワードラップ

純粋な関数 `computeMSDFLayout(request, font)` (`:93`) はワーカーとメインスレッド フォールバックによって共有されます (実行時にインポートは行われません。esbuild はこれを `LayoutWorkerSource.ts` 経由で `LayoutWorker.ts` にインライン化します。そのため、メインスレッド フォールバックはワーカーから分岐できません)。除外なしの `LayoutEngine.layoutPrepared` のフラット配列対応物 / グリフごとの衝突コールバック / 豊富なスタイル: UV ジオメトリの `font.glyphs[].advance/kerning` (`byCode/kern`)、`metrics{ascender,descender,lineHeight}` (`:118` が存在しない場合のフォールバック `0.8/-0.2`)、`atlas` `aw/ah/yOrigin` (`:103`) を消費しますが、`planeBounds/atlasBounds` は決して読み取られません。 `MSDFFont.layout` をコア側に戻します。 `Array.from(text)` (`:176`、コードポイントセーフ) を実行し、`kernKey(prevCode,code)` (`:192` `+ k*fontSize`) + `letterSpacing` (`:121`) でグリフごとに `curX` を進め、ノンスペースマークゼロアドバンスミラーリング `MSDFFont.ts:132`、ハイフン/オーファンパンクト `isOrphanPunct` (`:201`、`suppressLineBreaks` と同じセット) および `breakableAnywhere` (`:195`、CJK `>=0x2e80`)、`wrapClosedLines: Set<number>`、`softBreaks: {at,x}[]` (`:131`)、`lineOf: number[]` (`:107`)、`xCoords/yCoords: number[]`、`packedStyles: number[]` (`:104`、パックされた `TextStyle`)ビット)、`advances: number[]` (`:110`)、`codePoints: number[]` (`:101`)、`maxLineWidth` (`:114`)。ラップ (`breakLine` `:140`、`dropFrom` `:155`、`emitHyphen` `:167`)、`justifyLines(wrapClosedLines, lineOf, xCoords, codePoints, advances, maxWidth, maxLineWidth)` (`:11`) では単語間の `SPACE(32)` ギャップ (`:44`) が拡張され、スペースのない CJK では各グリフ間で `slack/lastContent` が分散されます (`:70`)。両方ともキャップされています非常に短いラップでのグロテスクな伸びを避けるために、ライン スパンの半分に設定します。

### 2.11 ワーカーのオフスレッドモデル

**境界**: `LayoutWorker.ts:4` (`LayoutWorkerRequest`: `id/seqId/text/fontId/fontData/maxWidth/maxHeight/fontSize/lineHeight/letterSpacing/textAlign`) および `LayoutWorkerResponse` (`:24`: `id/seqId/width/height + Uint32Array codePoints / Float32Array xCoords/yCoords / Uint32Array packedStyles + error?:string`)。 `postMessage` (`LayoutWorker.ts:111`) の転送可能なバッファー。

**ワーカー**: `packages/layout/src/LayoutWorker.ts:1` — ~115 行、`fontCache: Map<string,MSDFFontData>` (`:42`)、`isLayoutWorkerRequest` 検証 (`:53`)、`isExpectedOrigin` (`:48`)、`self.onmessage` (`:76`) → `fontCache.set` → `computeMSDFLayout(request, font)` → `postMessage(response, [codePoints.buffer, xCoords.buffer, yCoords.buffer, packedStyles.buffer])`。不明なフォント → サイレントドロップではなく、エラー形式の長さゼロの応答 (`LayoutWorker.ts:92`)。

**マネージャー**: `packages/layout/src/LayoutWorkerManager.ts:28` — シングルトン (`getInstance` `:206`)、`new Blob([WORKER_SOURCE_STRING])` + `URL.createObjectURL` 経由の `createWorker` (`:67`) (`LayoutWorkerSource.ts`; `MarkdownWorker` CSP ガードをミラーリング: `typeof Worker/Blob/URL` が存在しない → `null` → スローではなくメインスレッドのフォールバック)。 `onmessage` は、`${id}-${seqId}` (`:99`) と `pendingCallbacks: Map<string,PendingLayout>` (`:34`) を照合し、`consecutiveWorkerFailures` (`:109`) をリセットします。 `onerror/onmessageerror` → `handleWorkerFailure` (`:120`)、`MAX_CONSECUTIVE_WORKER_FAILURES=2` (`:19`)、その後 `workerUnavailable=true` → メインスレッドに留まります (CSP `worker-src 'none'` は 2026 年 7 月 31 日に測定されました: 6 つの `queueLayout` 呼び出しで 6 つのワーカーが生成され、レイアウトはゼロでした)。 `fontDataById` (`:043`、生涯保持され、ワーカーの死亡時にクリアされる `registeredFonts` とは異なります) を使用すると、呼び出し元が `fontData` を 1 回だけ渡したときにフォールバック レイアウトが機能します。 `warnedUnknownFonts` (`:049`) は、繰り返されるコンソール警告を停止します。 `queueLayout(entityId, opts, callback)` (`:224`) は 50 ミリ秒 (`:314` `setTimeout(runLayout,50)`) をデバウンスし、`seqIdCounter` を比較するため、遅い応答は無視されます。 `cancelLayout/cancelLayoutForEntity` (`:220`/`:319`) はタイマーと `prefix === ${entityId}-` 保留中のマップ エントリを排出します。 `resolvePendingOnMainThread` (`:144`) は、ワーカーが死亡したときに、保留中のすべての `computeMSDFLayout` を直接再実行します。 `errorResponse` (`:176`) は、不明なフォントの応答形状を合成します。

**コンシューマ**: `packages/core/src/text/MSDFTextEntity.ts:25` — `queueLayout()` (`:204`) は `LayoutWorkerManager.getInstance().queueLayout(this.id, { id, seqId: ++seqId, text: layoutText, fontId: font.id, fontData: font.data, maxWidth/maxHeight/fontSize/lineHeight/letterSpacing/textAlign }, cb)` を呼び出します。 `seqId` はエンティティごとに単調で、`lastRenderedSeqId` (`:048`) は古い応答を削除し、`contentEpoch` (`:051`) は未変更の同期をスキップし、`rebuildProjectionLines()` (`:273`) は `getContentProjection()` (`:248`) 用に `projectionLines: ContentProjectionLine[]` を再構築します。ハイフネーターは、`layoutText` に `U+00AD` の注釈を付けることで、メイン スレッドで実行されます (ワーカーに複製することはできません)。 `watchAtlasDecode` (`:106`) はアトラス イメージのデコードを待機します。 `SVGEntity.ts` は兄弟の非テキスト エンティティです。

### 2.12 ベンチマーク、比較、そして数値の出し方

テキスト レイアウトには、**コールド** (セグメント+メジャー) と **ホット** (配置) という 2 つのコストがかかります。コールド + ホット コールを組み合わせたコールとホット コールを比較すると、ギャップが生じます。リポジトリは、次の 3 つの場所での Apple-to-Apple 分割を強制します。

- **`benchmarks/text-layout-pretext`** および **`comparisons/text-layout-pretext/*`** (`entry.ts:1`、`page/*`、`serve.ts`、`build.ts`) — `@vectojs/layout` と `@chenglou/pretext`。どちらも実際のブラウザで `canvas measureText` 経由で測定します (`comparisons/text-layout-pretext/entry.ts:1` ヘッダーを参照: V8 と Gecko は異なり、ヘッド付きの GPU 支援ウィンドウのみが引用可能です — `hyprland-browser-bench` がそのハーネスを所有しています)。 `prepare` 対 `prepareWithSegments` (コールド) および `measurePrepared` 対 `layout` (ホット) が唯一比較可能な半分です。 `layoutPrepared` / `layoutText` (すべてのグリフを配置します) には対応するプリテキストがなく、個別にレポートされます。
- **`scripts/compare-pretext.ts:1`** — `benchmarks/bench.ts` によって実行されるヘッドレス版。 `Bun.build` を介して `vectojs core` + `pretext` を IIFE にバンドルし、Playwright が制御する Chrome に挿入し、コーパス/フォントごとに `Range.getClientRects().length` を介して DOM の真実を確立し、行数エラーと真実とコールド/ホット スループットを報告します。独自の歴史を文書化します。2026 年 8 月 4 日までは、口実のホットな `layout()` に対して結合された `layoutText()` の時間を計測し、`vectojs-docs/testing-catalog.md:A6` で「まだ一致していない」というフラグが立てられていました。
- **`vectojs-docs/forge/baselines/*`** — ハーネスが生成する半公式のベースライン (`glyph-batch-*.json`、`content-projection-frontload-*.json` など)。すべてがテキスト レイアウトであるわけではありません。`glyph-batch` は `LayoutBuffer` 幅パスを共有する WebGL グリフ アップロード コストであり、`markdown-stream-*` はストリーミング中の lex+layout インタラクションをキャプチャします。それぞれは `commit`、CPU/GPU/ドライバー環境、および `benchmarks/run-browsers.sh` を介した `refreshHz` を伝送するため、後の比較で正規化できます。

**ローカルで再実行する方法** (ヘッドレス、引用不可だが回帰には便利): `bun run scripts/compare-pretext.ts` (Playwright + `google-chrome-stable`) はマークダウン テーブルを出力し、`scripts/.compare-results.json` を書き込みます。引用可能な数字の場合: ワークスペース ルートの `benchmarks/run-browsers.sh` (専用の Hyprland ワークスペース上で実際の Chrome/Firefox を駆動し、COOP/COEP、飢餓検出を検証します)。

## 3. `packages/core` 配下での合成

`MSDFTextEntity.text` → `rebuildLayoutText()` (`:187`、ソフトハイフンの注釈) → `queueLayout()` (50 ミリ秒デバウンス) → `LayoutWorkerManager` (ワーカーまたはメインスレッド) → `computeMSDFLayout` → 型付き配列 → `MSDFTextEntity.layoutResult` + `projectionLines` → WebGL `setMSDFTexture`/`addGlyph` (`PositionedGlyph`、`getContentProjection().lines` ごと) a11y、`CanvasGeometry` DPR 補正。

`Text`/`RichText` (`@vectojs/ui`) は `LayoutEngine` + `measureContext` を直接経由します (キャンバス パス)。同じ不変条件、異なる測定者。

### 2.13 `GridTextEntity` 補足 — 保持されたグリッド vs 保持されたプローズ

`packages/core/src/components/GridTextEntity.ts:4` (`class n extends Entity`、`GridTextEntity`) は、従来の等幅グリッド エンティティ (固定 `charWidth/charHeight`、`updateGrid(ascii[])` `:23`、`render` `:36`) です。これは `prepareContentGrid` よりも前のものであり、bidi のフロー、アラビア語の形成、または `PreparedContentGrid` の尊重**ではありません。これは、`ascii: string[]` に対する直接の `IRenderer.fillText` ループ (`:44`) です。 Bidi/CJK/grid a11y を必要とする最新の代替品は、コンテンツ グリッド投影 (`01-selection.md` §3.3) を備えた `prepareContentGrid` (`packages/text/src/PreparedContentGrid.ts:243`) です。 `GridTextEntity` は「等空間を描く最も愚かなもの」として残り、`packages/core/test/GridTextEntity.test.ts` と `packages/core/src/index.ts:n` で表面化します。

## 4. 難しいケース — 計測された失敗

### 4.1 デタッチされた canvas のフォント解決（Firefox のみ）

`Intl.Segmenter` で grep 可能です (word `:916` / grapheme `:917` in `LayoutEngine.ts`, `:76` in `PreparedContentGrid.ts`), `BidiResolver` / `BiDi` (`BidiResolver.ts:3` `bidi-js`), `registerFontMetrics` (`fontMetrics.ts:82`, called directly in `Typography.ts:67` via `getFontMetrics` and indirectly from `measure.ts:75`), `cold/hot split` (`LayoutEngine.ts:459`–`1848`, commented with ** and `measurePrepared` / `layoutPrepared` / `layoutPreparedIntoBuffer` triptych), and `zero-GC` (`LayoutEngine.ts:2241` `layoutPreparedIntoBuffer` + `msdfLayout.ts:1` flat arrays + `BidiResolver.reorderSegments` `:121`). Auditing exclusion flow is `computeLineSegments` `:504` and `ExclusionRect` `:482`; DPR quantization is `PAGE_SCALE_BASIS_PX = 256` (`ContentProjectionManager.ts:71`).

§2.3 の表（`packages/text/src/measureContext.ts:18`）を参照: モノリシックな advance は 20–47% 短くなります。修正はアタッチです。残差 0.3% (`131.579` vs `132.000`) is Gecko grid-fit to integer device px, not escapable (`text-rendering: geometricPrecision` measured identical, `:34`). Audit by searching for detached canvas creation (`grep -rn 'createElement.*canvas'` `packages/`). `OffscreenCanvas` is not the fix — it agrees with DOM layout (`132.000`) rather than the painted canvas (`131.579`).

### 4.2 CJK vs Latin のメトリクス

`0.5em` fallback measured `+125%` error on narrow glyphs and `-47%` on wide against Chrome at 32 px (`packages/layout/src/LayoutEngine.ts:973` comment). `EMPTY_GLYPH_ATLAS` (`:83`) with a real `resolveGlyphMeasurer` cures line-break error; `createMetricsMeasurer` with registered `MSDFFont` cures SSR/headless. 1 段落内の混合 `CJK | Latin` は同じ `layoutPrepared` 実行に着地します。`GlyphMeasurer` はランごとに `fontFamily/bold/italic` でキーを分けるため、プロポーショナル内の `monospace` は自身の advance を使い、`styleSig` は advance に影響するすべての `TextStyle` フィールドを含みます。

### 4.3 BiDi 並べ替え vs 選択順序

`reorderIndices` はブリッジです。ハイライト四角形の場合は論理→ビジュアル (`logicalToVisualRuns` `:62`)、ヒット テストの場合はビジュアル列→論理、ペイント順序の場合は `reorderVisual` (`:89`) です。 `PreparedContentGrid` は、視覚的な `x` (`packages/text/src/PreparedContentGrid.ts:315`) を使用して `cells` を論理的な順序に保ちます。選択オフセットはソース (論理) オフセットであり、視覚的なインデックスではありません。書記素ごとのキャリア + `shapedPaint` この契約の半分については `tmp/boss-research/01-selection.md` §3.2/§4.1 を、`buildVisualLineGroups` が `node.y + height*0.8` でグループ化され、チップを独自の行に分割する場所については `forge/findings/text-richtext-and-markdown.md:356` (InlineObject) を参照してください。

### 4.4 1 段落内の混合フォントフォールバック

`family:'monospace'` コード スパンを持つ `family: 'Noto Sans'` スタイルの段落。 `GlyphMeasurer.measure(char,size,'monospace')` (`packages/layout/src/measure.ts:60`) はそのファミリーで測定します。不明な実行ファミリーは、`0.5em` (`:138`) ではなく、ベース ソースにフォールバックします。段落メモ `styleSig` には `fontFamily` が含まれています (2026 年 7 月 30 日まで欠落していましたが、空のアトラス チャーンによってキャッシュが 0 ヒットに保たれたためのみ潜在していました)。テスト: `benchmarks/text-layout-pretext` / `comparisons/text-layout-pretext` および `scripts/compare-pretext.ts:1` (`Range.getClientRects` 行数の真実によるコールド/ホットのアップルツーアップル)。

### 4.5 DPR に依存する advance

Canvas の advance はデバイス px にグリッドフィットします。`LayoutEngine` の `shiftedExtent` / `cssLineBoxBaseline` は DPR に依存しない `0.8` の ascent 比を使います。 CodeBlock atlas once captured `devicePixelRatio` at first construction (`packages/markdown/src/Markdown.ts:1358`, `GlyphRasterAtlas.ts:139` `readonly dpr`) and blurred after zoom (`forge/findings/text-richtext-and-markdown.md:724`, `sceneDpr 4.286 / atlasDpr 1.579 → blitScale 2.71`). Fix: feed `Scene.watchDevicePixelRatio()` (`Scene.ts:2805`) into atlas DPR. Re-verify via `maxGradient` (peak edge), not mean luminance (confounded by thin mono glyphs, measured `0.216→0.251` the wrong way at a 2.71× mismatch). DPR clamping `min(dpr,3)` at `Atlas.ts:139` is a separate ceiling — even a correct rebuild cannot exceed 3 on a `4.286` panel.

### 4.6 行末の所有権と CRLF の幻のグリフ

`splitParagraphs` (`LayoutEngine.ts:566`) 正規表現 `/\r\n|[\r\n]/g` と `MSDFFont.layout` (`MSDFFont.ts:213`) は両方とも、`ArabicShaper`/`BidiResolver`/`glyphWidth` ステップの **前** に区切り文字を消費し、`sourceIndex` の連続性のために `consumed` (`:569` `m[0].length`) を記録します。単純な `text.split('\n')` は、段落の最後の文字として `\r` を残します。幅 `missingAdvance*size` の目に見える豆腐として整形、測定、配置され、その後の `sourceIndex` は CRLF ごとに 1 つずつずれます。 `PreparedContentGrid.sourceLines` (`:197`) は同じコントラクトを保持し (`sourceEnd` はブレークを除外し、`nextSourceStart` はブレークを所有します)、さらに、`source` がブレークで終わる場合 (`:217` `if (start===source.length)`) に明示的な末尾の空行を挿入します。テスト: `benchmarks/text-layout-pretext` は、DOM の真実性についてソースを `\n` に正規化しますが、生のソースを個別に測定します。パリティとは、生の `"\r\n"` ソースが `"\n"` ソースと同じ `totalHeight` および `sourceIndex` カバレッジを生成することを意味しますが、`sourceLength` ギャップが 1 行あたり 1 であるだけです。

### 4.7 ハイフネーション + 孤立句読点 + ジャスティフィケーションは順序通りに合成しなければならない

コールド: ソフト ハイフン `U+00AD` (`LayoutEngine.ts:1134`) と `hyphenate` コールバック (`:1144`) は両方とも `PreparedWord.breakPoints` (`:441`) に貢献します。 `hyphenWidth` (`:490`) は、any を含む単語に対して 1 回だけ測定されます。ホット: `suppressLineBreaks` (`:721`) はマージ時に `breakPoints` をリベースするため、`"@vectojs/core"` 内のハイフン分割がアトミックなトークンの途中に配置されなくなります。ワードキューウォーク (`:2109`ff) は、単語全体のラップに戻る前に、接頭辞ハイフン (`chosen` scan `:2133`) を優先します。結果: `wrapClosedLines` (`msdfLayout.ts:125`) と `justifyLines` (`:11`) はどちらも最終的なブレーク決定を読み取るため、一方を修正せずに他方を修正すると、測定された幅 (投影の場合) が配置された `x` (インクの場合) と一致しない位置揃えされたラインが生成されます。 `LayoutEngine` と `msdfLayout` は両方とも、ハイフン `+ letterSpacing` + 孤立ロジックを複製しています。一方を変更せずに他方を変更するのが一般的な回帰です。

## 5. 開発者が守るべき不変条件

1. **ペイントする場所を測定します。** `getSharedMeasuringContext()` (`packages/text/src/measureContext.ts:87`) を使用します。 `appendChild` を使用せずに野良 `document.createElement('canvas')` を grep します。
2. **ホットの前にコールド、DOM の再セグメント化は行わないでください。** `prepare`/`prepareRich` を 1 回、`layoutPrepared` を何度も (`packages/layout/src/LayoutEngine.ts:1080` `/` `:1266` `/` `:1848`)。シフトを再セグメント化すると、ブレークと双方向の順序が変わります。
3. **`styleSig` のすべての事前に影響するフィールド。** `glyphWidth` に達すると、`styleSig`/`fingerprint` (`:1266:styleSig`) に達します。 1 つを省略すると、段落キャッシュのヒット率が回復するまで潜在的になります。
4. **`InlineObject` のアイデンティティには `key` が含まれます。** 同じ `alt/width/height` を持つが、異なる `paint` を持つ 2 つの `U+FFFC` は、`key` 上で異なっていなければなりません。そうしないと、2 番目の `U+FFFC` が最初のイメージ (`packages/layout/src/LayoutEngine.ts:268`) を描画します。
5. **ワーカーは最適化であり、決して要件ではありません。** `LayoutWorkerManager` は、2 回連続して失敗するか、`Worker` が存在しない場合、呼び出しスレッド (`:144`) で `computeMSDFLayout` に低下します。不明なフォント → 入力エラー。コールバックがハングすることはありません (`:176`)。
6. **`indexMap` と `sourceIndex` はバイト忠実なままです。** アラビア語の整形インデックス マップ (`packages/text/src/ArabicShaper.ts:91`) が真実の情報源です。 `LayoutNode.sourceIndex/sourceLength` は整形されたテキストではなく、元の文字列にインデックスを付けるため、アクセシビリティは後のオフセット (`forge/findings/text-richtext-and-markdown.md:372`) をシフトすることなく `InlineObject.alt` を置き換えることができます。
7. **メトリクス レジストリのバージョンを確認します。** `FontMetricsSource` をキャッシュする前に、`fontMetricsVersion()` (`packages/text/src/fontMetrics.ts:64`) を読み取る必要があります。プロセスの途中でファミリーのメトリクスを置き換えることは、実際のコードパス (Web フォントの交換、データの修正) です。
8. **`0.5em` は未測定を意味します。数えてください。** テスト/SSR で `unmeasuredGlyphCount()` (`packages/layout/src/LayoutEngine.ts:31`) を確認してください。ゼロ以外の場合は、アトラスのグリフが欠落しているだけでなく、改ざんされた改行を意味します (`fallbackToCanvas` は、基本的にすべての `Text`/`RichText` 段落で true であり、品質については何も語られません)。

## 6. メトリクスパリティを壊さずに新しいスクリプトやスタイルを追加する方法

**新しい文字 (タイ語、デーバナーガリー文字など):**

1. コーパスに対して `isComplexScript` (`packages/layout/src/LayoutEngine.ts:584`) を実行します。述語はストリーミング `shapeSimpleRun` ショートカット (`:1358`) をゲートします。コンテキスト依存のスクリプトは、段落が完全な `shapeArabic`+`BidiResolver` パスを取るように、`true` を返す必要があります。それ以外の場合、接尾辞のみのリシェイパーは書記素を独立して整形し、結合しているテキストを静かに切断します。
2. マークが整形に関して透明である場合、それらを `ArabicShaper.isHarakat` (`:70`) と `MSDFFont.isNonspacingMark` (`:132`) に一緒に追加します。これらは一致する必要があるリーフ パッケージです。
3. 事前カバレッジを追加します: スクリプトの MSDF アトラス グリフまたは登録されたメトリクス (`registerMSDFFontMetrics`、`packages/text/src/fontMetrics.ts:97`)。どちらも指定しないと、`unmeasuredGlyphs` はすべての文字をカウントし、ブレークは `0.5em` の推測になります。
4. 新しいスクリプトと CJK+Latin を混合した行で `auditSceneSelection` (`packages/devtools/src/selectionAudit.ts`) を使用して検証します。ギャップ バジェットは `PAGE_SCALE_BASIS_PX = 256` 量子化 (`ContentProjectionManager.ts:71`) であるため、近隣ごとにアドバンスを変更するスクリプトはそこには表示されません。

**新しい `TextStyle` フィールド:**

1. 「`glyphWidth` は変わりますか?」と尋ねます。レンダラーが予約されたアドバンス (`underline`、`lineThrough`、`highlightColor`) を変更せずにオフセット/装飾としてペイントする場合、パリティは機能しません。測定された進みを変更する場合 (`fontSize`、`fontFamily`、`bold`、`italic`、別の `measure` パスを選択するもの) は、`styleSig`/`fingerprint` (`packages/layout/src/LayoutEngine.ts:1266`) および `styleRangeEquals` (`:682`) に含める必要があります。
2. フィールドをスタイルの等価性と署名に一緒に追加します。一方のみをテストすると、もう一方はメモ毒として残ります (異なる段落が衝突し、同じ段落はヒットしません)。
3. フィールドが `0.8 * pMax` (上昇) / `0.7 * pMax` (下降) の外側にグリフを垂直に移動する場合は、`shiftedExtent` (`:668`) を介して `baselineShift` スタイルの垂直方向の拡張を追加します。 3 つの `pMax` ウォークすべてでそれを呼び出す必要があります。

**新しい改行ルール:**

- `suppressLineBreaks` (`:721`) または `justifyLines` (`packages/layout/src/msdfLayout.ts:11`) に存在します。マージ時にハイフネーション `breakPoints` をシフトしたままにします (`:732` `+ offset`、`:791` `+ glyphs.length`)。ラップ状態 (`wrapClosedLines`、`lineOf`、`softBreaks`) が `LayoutEngine` と `msdfLayout` の間で重複しています。両方を変更してください。

### 4.8 垂直混合 — `baselineShift` とインラインオブジェクト

**`TextStyle.baselineShift` (`LayoutEngine.ts:146`、px、`positive = UP`、CSS `vertical-align` 規約)** — 水平方向にのみレンダリング (変更せずに進みます) しますが、測定値は垂直方向に変更されます。 `0.8/0.7 * pMax` のスラックに適合するほど控えめな値では、行の高さは変更されません (`0.75em` の上付き文字 `+0.22em` が一般的です)。行ボックスの外側にグリフを配置するシフトにより、`shiftedExtent` (`:668`) が `pMax` を拡張し、拡張された値がすべての `currentY` の進行と `computeLineSegments` の呼び出しに伝播します。そのため、_this_ 行と次の行の間のスペースが、まさに背の高いインライン オブジェクトが強制するのと同じように広がります。呼び出し元は自分で垂直方向のスペースを予約してはなりません。エンジンが 1 か所で 1 回実行するか、3 つの `pMax` ウォークが一致せず、`measurePrepared` が `layoutPrepared` ペイントとは異なる高さを報告します。

**`InlineObject` (`LayoutEngine.ts:216`、`StyledSpan.object` `:343` には `text===OBJECT_REPLACEMENT` が必要です)** — 3 つの数値、すべて **px が最終サイズ** (グリフの前進とは異なり、`fontSize` の実行によって拡大縮小されません): `width` (水平方向の前進)、`height` (合計ボックス)、`depth` (ベースラインより下、正下 — 反対の符号) **コード9**)。エンジンは `width` を予約し、`shiftedExtent` の増加に `height/depth` を考慮し、配置された `LayoutNode.object` ボックス (`x/y` にはすでに `depth` が含まれています) を報告します。 `object.paint(surface, box)` (`:301`) を呼び出すことはありません。テキスト レンダラーは `LayoutNode.object` ごとに 1 回呼び出します。落とし穴: `alt` は `RichText.accessibleText` (`collectSpans` は `alt` を `U+FFFC` に置き換えます) を介してアクセス可能になりますが、`copy/selection` は依然として `sourceText` 空間の 1 文字のセンチネルによってインデックス付けされるため、`alt` の長さは後の `sourceIndex` 演算でシフトされません。同じ症状の 2 番目の落とし穴: `paint` は段落メモ キーの**ではありません** (呼び出しごとにクロージャを使用すると、永久にヒット数が 0 のままになります) — `paint` が異なる場合、サロゲート `InlineObject.key` (`:259`) が異なる必要があるか、同じ `alt` を持つ 2 つのバッジがキャッシュされた段落を共有し、2 番目のバッジが最初の画像を描画します (`forge/findings/text-richtext-and-markdown.md` を再確認) a11y/InlineObject エントリ)。

### 4.9 ストリーミングコストとなぜサフィックスのみの整形がボトルネックではないのか

`LayoutEngine.streamShapeCache` (`:839`、`isComplexScript` `:584` ゲート、`shapeSimpleRun` `:1644`) は、増大する Markdown ブロック (`Markdown.ts:899` ストリーミング `appendMarkdown`) でチャンクあたりのコストを `O(length)` から `O(appended)` に削減するために、段落メモ (`:829`/`833`) とともに導入されました。 346 KB の合成ドキュメント (`forge/findings/text-richtext-and-markdown.md:356`) で測定: **同一コスト 2630 ミリ秒と 2639 ミリ秒**。 Real Markdown には段落の境界があり、既存のメモではすでに段落ごとの整形に制限が設けられているため、接尾辞のみの整形は病的な単一の巨大な段落にのみ役立ちます。この結果は、正確性の勝利として出荷されたままでしたが (`isComplexScript` 述語と `styleRangeEquals`/`objectRangeEquals` チェックによりサイレント結合テキスト切断が防止されました)、スタンドアロン `@vectojs/core` リリースのパフォーマンス修正として公開されませんでした**。ストリーミング時間を診断する場合、`prepareRich` + `measureText` + コンテンツ投影同期 (`forge/findings` 2026-07-20 エントリ: `perf.ts` `requestAnimationFrame` デルタ) が重要です。 MSDF はグリフ _drawing_ を変更し、`64fps→120Hz` は別のパスになります。

## 5b. 拡張された不変条件（§5 の拡張）

1. **ペイントする場所を測定します。** `getSharedMeasuringContext()` (`packages/text/src/measureContext.ts:87`) を使用します。 `appendChild` を使用せずに野良 `document.createElement('canvas')` を grep します。
2. **ホットの前にコールド、DOM の再セグメント化は行わないでください。** `prepare`/`prepareRich` を 1 回、`layoutPrepared` を何度も (`packages/layout/src/LayoutEngine.ts:1080` `/` `:1266` `/` `:1848`)。シフトを再セグメント化すると、ブレークと双方向の順序が変わります。
3. **`styleSig` のすべての事前に影響するフィールド。** `glyphWidth` に達すると、`styleSig`/`fingerprint` (`:1266:styleSig`) に達します。 1 つを省略すると、段落キャッシュのヒット率が回復するまで潜在的になります。
4. **`InlineObject` のアイデンティティには `key` が含まれます。** 同じ `alt/width/height` を持つが、異なる `paint` を持つ 2 つの `U+FFFC` は、`key` 上で異なっていなければなりません。そうしないと、2 番目の `U+FFFC` が最初のイメージ (`packages/layout/src/LayoutEngine.ts:268`) を描画します。
5. **ワーカーは最適化であり、決して要件ではありません。** `LayoutWorkerManager` は、2 回連続して失敗するか、`Worker` が存在しない場合、呼び出しスレッド (`:144`) で `computeMSDFLayout` に低下します。不明なフォント → 入力エラー。コールバックがハングすることはありません (`:176`)。
6. **`indexMap` と `sourceIndex` はバイト忠実なままです。** アラビア語の整形インデックス マップ (`packages/text/src/ArabicShaper.ts:91`) が真実の情報源です。 `LayoutNode.sourceIndex/sourceLength` は整形されたテキストではなく、元の文字列にインデックスを付けるため、アクセシビリティは後のオフセット (`forge/findings/text-richtext-and-markdown.md:372`) をシフトすることなく `InlineObject.alt` を置き換えることができます。
7. **メトリクス レジストリのバージョンを確認します。** `FontMetricsSource` をキャッシュする前に、`fontMetricsVersion()` (`packages/text/src/fontMetrics.ts:64`) を読み取る必要があります。プロセスの途中でファミリーのメトリクスを置き換えることは、実際のコードパス (Web フォントの交換、データの修正) です。
8. **`0.5em` は未測定を意味します。数えてください。** テスト/SSR で `unmeasuredGlyphCount()` (`packages/layout/src/LayoutEngine.ts:31`) を確認してください。ゼロ以外の場合は、アトラスのグリフが欠落しているだけでなく、改ざんされた改行を意味します (`fallbackToCanvas` は、基本的にすべての `Text`/`RichText` 段落で true であり、品質については何も語られません)。
9. **`\r` と CRLF は決して整形されません。** `splitParagraphs` (`LayoutEngine.ts:566`、`PreparedContentGrid.ts:197`) と `MSDFFont.layout` (`MSDFFont.ts:213`) はどちらも、整形/測定ステップの前に独自の行末を持ちます。すり抜けた迷子の `\r` は、ファントム幅と間違った `sourceIndex` を持つ位置決めされたグリフになります。
10. **ゼロ GC ミラーの割り当て — BiDi パスの同期を維持します。** `layoutPreparedIntoBuffer` (`:2241`) は、`layoutPrepared` の `reorderVisual` (`:89`) と同じ `BidiResolver.reorderSegments` (`BidiResolver.ts:121` 型付き配列) 順列を適用し、`shiftedExtent`/`computeLineSegments`/`justifyLines` をミラーリングする必要があります。ここでのドリフトは、双方向の段落がスクロールされるまで沈黙します。

## 6b. 拡張ガイド（§6 の拡張）

**新しい文字 (タイ語、デーバナーガリー文字など):**

1. コーパスに対して `isComplexScript` (`packages/layout/src/LayoutEngine.ts:584`) を実行します。述語はストリーミング `shapeSimpleRun` ショートカット (`:1358`) をゲートします。コンテキスト依存のスクリプトは、段落が完全な `shapeArabic`+`BidiResolver` パスを取るように、`true` を返す必要があります。それ以外の場合、接尾辞のみのリシェイパーは書記素を独立して整形し、結合しているテキストを静かに切断します。
2. マークが整形に関して透明である場合、それらを `ArabicShaper.isHarakat` (`:70`) と `MSDFFont.isNonspacingMark` (`:132`) に一緒に追加します。これらは一致する必要があるリーフ パッケージです。
3. 事前カバレッジを追加します: スクリプトの MSDF アトラス グリフまたは登録されたメトリクス (`registerMSDFFontMetrics`、`packages/text/src/fontMetrics.ts:97`)。どちらも指定しないと、`unmeasuredGlyphs` はすべての文字をカウントし、ブレークは `0.5em` の推測になります。
4. 新しいスクリプトと CJK+Latin を混合した行で `auditSceneSelection` (`packages/devtools/src/selectionAudit.ts`) を使用して検証します。ギャップ バジェットは `PAGE_SCALE_BASIS_PX = 256` 量子化 (`ContentProjectionManager.ts:71`) であるため、近隣ごとにアドバンスを変更するスクリプトはそこには表示されません。

**新しい `TextStyle` フィールド:**

1. 「`glyphWidth` は変わりますか?」と尋ねます。レンダラーが予約されたアドバンス (`underline`、`lineThrough`、`highlightColor`) を変更せずにオフセット/装飾としてペイントする場合、パリティは機能しません。測定された進みを変更する場合 (`fontSize`、`fontFamily`、`bold`、`italic`、別の `measure` パスを選択するもの) は、`styleSig`/`fingerprint` (`packages/layout/src/LayoutEngine.ts:1266`) および `styleRangeEquals` (`:682`) に含める必要があります。
2. フィールドをスタイルの等価性と署名に一緒に追加します。一方のみをテストすると、もう一方はメモ毒として残ります (異なる段落が衝突し、同じ段落はヒットしません)。
3. フィールドが `0.8 * pMax` (上昇) / `0.7 * pMax` (下降) の外側にグリフを垂直に移動する場合は、`shiftedExtent` (`:668`) を介して `baselineShift` スタイルの垂直方向の拡張を追加します。 3 つの `pMax` ウォークすべてでそれを呼び出す必要があります。

**新しい改行ルール:**

- `suppressLineBreaks` (`:721`) または `justifyLines` (`packages/layout/src/msdfLayout.ts:11`) に存在します。マージ時にハイフネーション `breakPoints` をシフトしたままにします (`:732` `+ offset`、`:791` `+ glyphs.length`)。ラップ状態 (`wrapClosedLines`、`lineOf`、`softBreaks`) が `LayoutEngine` と `msdfLayout` の間で重複しています。両方を変更してください。

## 7. 読む順序と検証チェックリスト

**この上司の新人が読む順番:**
`measureContext.ts:1` (それがなければ正直なものは何もない不変) → `fontMetrics.ts:14` → `Typography.ts:93` → `BidiResolver.ts:27` + `ArabicShaper.ts:18` → `PreparedContentGrid.ts:38` (保持グリッド対応物) vs `components/GridTextEntity.ts:4` (レガシー `n`) → `LayoutEngine.ts:916` (`Intl.Segmenter`) → `:929` (`glyphWidth`) → `:1080`/`1266` コールド → `:1848` ホット → `:504`/`:721`/`:668` 配置ルール → `measure.ts:39` → `MSDFFont.ts:151`/`msdfLayout.ts:93` → `LayoutWorker.ts:1`/`LayoutWorkerManager.ts:28` → `MSDFTextEntity.ts:25`。散文のホット パスに戻る前に、`PreparedContentGrid` の後の `01-selection.md` §§3–4 をクロスチェックしてください。

**グリフを移動する可能性のある変更後の迅速な監査:**

- [ ] `unmeasuredGlyphs` (`LayoutEngine.ts:31`) は、タッチされたワークロード上で依然として 0 (または、新しいマークが原因であり、`registerMSDFFontMetrics` によってカバーされています)。
- [ ] `cacheStats()` (`LayoutEngine.ts:1004`) `hitRate` は 0 に落ちませんでした。先進的な影響を与えるすべてのスタイルは `styleSig`/`fingerprint` および `styleRangeEquals`/`objectRangeEquals` に残ります。
- [ ] `auditEntitySelection` / `auditSceneSelection` (`packages/devtools/src/selectionAudit.ts`) カーニングの多い行 + CJK/絵文字混合行 + 双方向行 — デルタは `<0.5px` のままです。
- [ ] ワーカー フォールバックがカバーされました: `scripts/compare-pretext.ts:1` DOM の真実 (`Range.getClientRects` 行数) は依然としてコールド (`prepare` / `prepareWithSegments`) パスとホット (`measurePrepared` / `layout`) パスの両方に一致します。
- [ ] `\r\n` / 単独の `\r` ドキュメントは、その `\n` で正規化されたツインと同じ行数をレンダリングします。ファントム `\r` グリフと `sourceIndex` は CRLF にわたって連続しません。

## 8. ポインター

- ベンチマーク: `benchmarks/text-layout-pretext` (`bench.ts`)、`comparisons/text-layout-pretext/entry.ts:1` (`corpus()`、`buildAtlas()`、`preparePhase()`/`layoutPhase()`)、`comparisons/text-layout-pretext/page/*`、`scripts/compare-pretext.ts:1` (コールド/ホット スプリット、`Range.getClientRects` DOM の真実、リンゴ対リンゴの `measurePrepared` 対 `pretext.layout`、単一の `CanvasRenderer` カウントされた点灯ピクセルの健全性チェック、`forge/findings:text-richtext-and-markdown.md:564`、1 つの `Scene` で 2 番目の `CanvasRenderer` を二重にカウントしないように警告します)。
- ベースライン: `vectojs-docs/forge/baselines/*` (`glyph-batch-chrome-*.json`、`content-projection-frontload-*.json` など) および `vectojs/benchmarks/bench.ts`。それぞれに `commit`、CPU/GPU/ドライバー、および `benchmarks/run-browsers.sh` を介した `refreshHz` が含まれています。
- 調査結果 (追加のみ、書き換えなし): `vectojs-docs/forge/findings/text-richtext-and-markdown.md` (23 エントリ — デタッチされたキャンバス Firefox 2026-08-02 `:461`、`InlineObject.alt` は AT `:364` に到達しません、3 つの GFM 構造は黙って破棄されました `:508`、コードブロック DPR ブラー `:724`、ストリーミング re-lex 二次式 `:624`、接尾辞のみの整形の否定的な結果 `:356` — 現実的なドキュメント、境界のある段落では同一のコスト `2630ms vs 2639ms`)。
- グリッド パス: 端末/エディター半分の `tmp/boss-research/01-selection.md` および DPR 量子化/オーバーレイ/書記素キャリアごとの詳細はここでは繰り返しません。
- エンティティ レイヤー: `packages/core/src/text/MSDFTextEntity.ts:25` + `SVGEntity.ts`、`packages/core/src/components/GridTextEntity.ts:4` (レガシー `n`) vs `packages/text/src/PreparedContentGrid.ts:243` (保持されたグリッド)、`references/text/pretext` 読み取り専用クローン、`packages/layout/src/LayoutWorkerSource.ts` (生成、編集なし)、および `PositionedGlyph` クワッド上のキャンバス→GPU コントラクトの `SPEC.md`。直接ベンチマークは比較的なものであり、規範的なものではありません。口実はテキストのみで、VectoJS はグリフ + 選択 + a11y をフィードするため、「どちらの改行が速いか」は公平ですが、「どちらを使用すべきか」は公平ではありません。
