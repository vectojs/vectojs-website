+++
title = "00 — 概要: VectoJS の 16 の難題"
description = "VectoJS の 16 の deep-dive 難題を巡るナビゲーションガイド — 難題マップ、アーキテクチャ不変条件、パッケージ依存関係、そしてあらゆる初学者のための読む順序。"
weight = 20
+++

# 00 — 概要: VectoJS の 16 の難題

## 難題マップ

VectoJS は、ブラウザが担っていた責務を 1 枚の `<canvas>` 上に再実装します。レイアウト、ヒットテスト、イベント配送、テキスト整形、クリッピング、スクロール、アクセシビリティ、レンダリング — そのすべてを保持された Entity ツリー上の明示的な演算で実現します。この 16 編のシリーズは、かつて DOM が無償で提供していた各サブシステムを VectoJS が正確に再現するうえでの難題を整理したものです。順番通りに取り組む必要はありませんが、出発点を選ぶ前にマップを知っておく必要があります。

このドキュメントが、そのマップです。

- **ここで学べること**: ランタイムアーキテクチャを 1 枚の図で、パッケージ依存の骨格、各難題がどの不変条件を試すか、読む順序の選び方、そして既存の `content/learn/*` や `content/reference/*` に対する deep-dive の位置づけ。
- **ここでは学ばないこと**: 個々の難題の仕組み。各専門 deep-dive が 1 つの難題を担当します。この概要はそこへのリンクを張り、向かう前に最低限の見取り図を与えます。

## アーキテクチャ概観

```text
            Application state
                   │
                   ▼
         ┌─────────────────────┐
         │  Virtual Math Tree  │   Entity tree: transforms, bounds, events,
         │  (Scene + Entities) │   dirty/invalidation, worldMatrix. packages/core/tree/Scene.ts:1107
         └─────────┬───────────┘
                   │  dirty, transforms, culling
         ┌─────────▼───────────┐
         │  Layout  / HitTest  │   LayoutEngine (@vectojs/layout), HitTester (@vectojs/core),
         │  / Animation        │   Tween/Spring drivers (@vectojs/animation), physics (@vectojs/math)
         └─────────┬───────────┘
                   │  draw calls / glyph quads / animation frames
         ┌─────────▼───────────┐         ┌──────────────────────────┐
         │   Canvas + GPU      │         │   Thin DOM projection    │
         │  Canvas2D (default) │         │  a11y shadow elements:   │
         │  WebGL  / WebGPU    │◄───────►│  getA11yAttributes(),    │
         │  SVG / Three.js     │  sync   │  a11yProjection modes,   │
         └─────────────────────┘         │  syncA11y walk           │
                                         └──────────────────────────┘
                   │                              │
                   ▼                              ▼
              Visible pixels              Screen readers, IME, Playwright,
                                         copy/find, AT automation
```

ピクセルのソースは常に canvas です。DOM が担うのは **セマンティクスとネイティブ入力** のみであり、可視シーンの描画は行いません。2 つの世界は、レイアウト後・フレーム提示前の深さ優先 walk（`Scene.syncA11y` / `ContentProjectionManager`、詳細は `packages/core/src/tree/scene/A11yProjectionManager.ts:30`）によって同期が保たれます。

近接する図の参照レンダリングはすでにドキュメントに存在します。[Runtime Architecture](/learn/runtime-architecture/) と [Engine Concepts](/learn/engine-concepts/)（中心となる VMT ハブ図）です。このテキスト図は、コード参照可能で印刷しやすいことを意図しています。

## パッケージ依存の骨格

リーフエンジンを先に、上方へ合成していきます。グラフは非循環で、矢印は「ビルド時にここから import する」を意味します:

```text
  @vectojs/text ─┐
                 ├─► @vectojs/layout ─┐
  @vectojs/math ─┤                    │
                 └─► @vectojs/animation├─► @vectojs/core ─┬─► @vectojs/ui ─┬─► @vectojs/markdown
                                                          │                  └─► @vectojs/markdown-app
                                                          ├─► @vectojs/styles
                                                          ├─► @vectojs/table / @vectojs/node-editor
                                                          │
                                   @vectojs/tex ──────────┤  (consumed by markdown; public API)
                                                          │
           @vectojs/graph-layout ─► @vectojs/graph3d ─────┤  (@vectojs/knowledge-graph above graph3d)
           @vectojs/three / @vectojs/devtools /            │
           @vectojs/video-exporter / @vectojs/desktop      ┘  (host apps atop core+ui)

  crates/vectojs-core-rs (Rust → wasm32)  — invisible accelerator behind @vectojs/core
```

`packages/*/package.json` の依存関係に対して検証済みです（`text`/`math`/`graph-layout`/`tex` は `@vectojs/*` 依存がゼロ、`layout→text`、`animation→math`、`core→{layout,text,math,animation}`、`markdown→{ui,tex,core}`）。ビルドはこの順序を尊重します（`package.json:14`）。テストでは `vitest.config.ts` 経由で兄弟パッケージを `src/` にエイリアスしているため、この順序が `.d.ts` の出力を支配し、テスト実行は支配しません。

依存関係をトレースする際に注意すべき 2 つの罠: `references/` への不正なパスが `packages/tex/scripts/vendor-katex.ts`（`--source`）と `scripts/compare-pretext.ts`（`VECTO_PRETEXT_PATH`）にハードコードされています — そのツリーを移動すると静かに壊れます（`AGENTS.md` 記載）。

## 16 の難題一覧

ドキュメントは計 16 本です。この概要（00）に加え、15 の専門的な難題（01–15）があります。難易度はコード量ではなく「間違えやすさ」で測っています。「最初に読む」は有用な VectoJS 作業に最速で到達する経路、「深い前提知識」はこの難題に取り組む前に読んでおくべき他の難題です。

| #   | 難題（deep-dive）                                                      | パッケージ                                                                    | 難易度 | 読むべき人                                              | 深い前提知識 | 最初に読むべき人                               |
| --- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------ | ------------------------------------------------------- | ------------ | ---------------------------------------------- |
| 00  | **概要とナビゲーション**（本ドキュメント）                             | — (meta)                                                                      | ☆      | 全員、最初に読む                                        | —            | オリエンテーション                             |
| 01  | **Canvas ネイティブな選択** — 二重世界同期                             | `core` (`ContentGridProjector`, `ContentProjectionManager`), `text`, `layout` | ★★★★   | テキスト/選択/IME、コピー/検索/翻訳                     | 02           | 選択可能なテキスト、ターミナル、コードエディタ |
| 02  | **テキスト + レイアウト** — Unicode/BiDi/整形/排版                     | `text`, `layout`, `core/text`                                                 | ★★★★   | レイアウトエンジン、i18n、タイポグラフィ                | —            | ASCII を超えるあらゆるテキスト                 |
| 03  | **セマンティック投影 + 仮想化** — マテリアライゼーションライフサイクル | `core/a11y`, `ui`, `markdown`, `table`                                        | ★★★    | a11y、仮想化、高密度ドキュメント                        | 06           | 大規模ドキュメント、リスト、ダッシュボード     |
| 04  | **ストリーミング Markdown** — インクリメンタルなリコンサイル           | `markdown`, `ui`, `layout`                                                    | ★★★    | ストリーミング/LLM UI                                   | 02           | チャット/ストリーミングリーダー                |
| 05  | **Zero-DOM TeX** — レイアウト + SVG 出力                               | `tex`                                                                         | ★★★    | 数式レンダリング                                        | 02           | Markdown 内の数式                              |
| 06  | **VMT ランタイム** — dirty/無効化/ライフサイクル/イベント              | `core/tree`, `core/layout`, `core`                                            | ★★★★   | Scene/Entity ライフサイクル、ヒット配送、パフォーマンス | —            | カスタム Entity、パフォーマンスデバッグ        |
| 07  | **レンダラー** — 座標/クリップ/DPR 一貫性                              | `core/renderer`, `core/performance`                                           | ★★★    | マルチバックエンド、HiDPI、カリング                     | 06           | canvas/WebGL/WebGPU 作業                       |
| 08  | **WASM トリプル — G1/G2/G3** — ビット同一の高速化                      | `crates/vectojs-core-rs`, `math`, `animation`, `graph-layout`, `core/wasm`    | ★★★    | パフォーマンス、Rust↔JS パリティ                        | 06, 07       | 大規模でのフレーム予算                         |
| 09  | **Three.js / XR ブリッジ** — 2 つの座標世界                            | `three`, `graph3d`                                                            | ★★     | 3D パネル、XR                                           | 06, 07       | Three.js 内の VectoJS                          |
| 10  | **決定論的ビデオ書き出し** — 固定ステップクロック                      | `video-exporter`                                                              | ★★     | オフラインキャプチャ、リプレイ                          | 06           | 画面収録、シミュレーション書き出し             |
| 11  | **グラフ配置** — 力指向 + WASM                                         | `graph-layout`, `graph3d`, `knowledge-graph`                                  | ★★     | グラフ可視化、配置チューニング                          | 06, 08       | ネットワーク/ナレッジグラフ                    |
| 12  | **DevTools** — ランタイム introspection と監査                         | `devtools`, `core` (`frameStats`, `syncA11y`)                                 | ★      | デバッグ、CI 監査                                       | 06           | 「なぜこの Entity はここにあるのか」           |
| 13  | **スタイルとテーマ** — 数値 VMT での CSS パリティ                      | `styles`, `core`                                                              | ★★     | スタイル、テーマ、CSS 移行                              | 06           | トークンとテーマ切り替え                       |
| 14  | **レスポンシブレイアウトと操作** — ビューポートと入力への適応          | `core`, `ui`, `layout`                                                        | ★★★    | レスポンシブアプリとレイアウトの作者                    | 03、06       | 適応型 Canvas UI                               |
| 15  | **垂直アプリ** — グラフ、エディター、デスクトップ、表の構成            | `knowledge-graph`, `node-editor`, `desktop`, `table`                          | ★★★    | プロダクトと統合の作者                                  | 06           | エンジンプリミティブの構成                     |

順序に関する補足:

- 00 の次にまず読むなら 02 と 06 が最適です — 他のほとんどの難題はどちらかを前提にしています。
- 03 は 06 の dirty/ライフサイクル機構に依存し、04 は 02 の整形/レイアウトに依存します。07 と 08 はともに 06 に依存するため、自然にその後にまとまります。
- 08 の難しさは Rust の構文ではなく、**ビット同一のフォールバック契約** とそのビルドトラップ（`crates/vectojs-core-rs/build.sh` 内の `RUSTFLAGS`）にあります。
- チームのトラッカーではすでに `CTX-0566→…→CTX-0578→CTX-0579` と順序付けされていますが、上表は読む順序であり、ビルド/リリース順序と異なっても構いません。

## すべての難題を支配する 3 つの不変条件

各難題はこれらのいずれかを壊す可能性があります。他に何も覚えていなくても、この不変条件だけは覚えておいてください。

### 1. VMT ライフサイクル不変条件

> Entity の **dirty フラグ、worldMatrix、子リスト** は、すべての `Scene` ステップの後に一致している。

破れたときの症状: ドライバー登録解除なしに `remove(child)` した後の古い境界（`Entity:1582`）、部分的な `markDirty` 後の幻のヒットターゲット、JS と WASM SoA ストア間で乖離する transform（`crates/vectojs-core-rs/src/*.rs`、G1）。ガード: `Scene.ts:532` の `renderMode` / `DirtyTracker.ts:33` 契約、`DriverTicker.ts:40` walk、`Entity.ts:782` サブクラス契約。「謎のレンダリング不具合」の 90% はここに起因します。

### 2. 二重世界パリティ不変条件

> すべての **可視かつインタラクティブ** な Entity は、形状、role/name/state、フォーカス/ポインター経路が canvas の真実と一致する **同期された a11y 対応物** を持つ。

破れたときの症状: Playwright の `getByRole` が何も見つけない、スクリーンリーダーが古いテキストを読み上げる、クリックが誤った Entity にヒットする、IME が誤ったボックスに着地する。ガード: `Entity.ts:295` の `A11yAttributes`、`Entity.ts:968` の `a11yProjection` モード（`eager`/`onDemand`/`never`）、`Entity.ts:1937` の `getA11yAttributes()` デフォルト、共有 `syncA11y` walk（`A11yProjectionManager.ts:30`、`ContentProjectionManager.ts:26`）、および `A11yProjectionManager.ts:227` の stale-memo 無効化。`onDemand` マテリアライゼーションとビューポート仮想化が難しい部分であり（難題 03）— 現実の VectoJS が停滞するのも大半がここです。

### 3. テキストメトリクス不変条件

> **一度計測し、何度でもレイアウトする** — そして **本物の** フォントで、**正しい** コンテキスト上で、**正しい** DPR で計測する。

破れたときの症状: テキストがヒットボックスからずれる、選択帯が 1 行ずれる、CJK のサブピクセル隙間が白線として描画される、Web フォントのフォールバックが密かに advance を変える、DPR ズームで一方のサブシステムだけがぼやける。ガード: `packages/text/src/fontMetrics.ts:82` の `registerFontMetrics`、`packages/text/src/Typography.ts:111` の DOM なしフォールバック 0.5em 付き `ctx.measureText('Mg')`、`packages/text/src/measureContext.ts:12` の計測コンテキスト較正、`packages/layout/src/LayoutEngine.ts:808` の `LayoutEngine` cold/hot 分離と段落メモ化。テキストに触れるすべての難題（01、02、04、05）は、異なる角度からこの不変条件に再び立ち入ります。

レビュー時にはこの 3 つをチェックリストとして使ってください。変更を承認する前に「どの不変条件を壊しうるか、そしてそれが最初にどこで表面化するか」を自問してください。

## 既存ドキュメントとの関係

| 既存ドキュメント                                                                                                                     | Deep-dive（本シリーズ） | 関係                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content/learn/*`（introduction、runtime-architecture、engine-concepts、text-typography、core-scene、accessibility、streaming など） | 00–15                   | **Learn は VectoJS の _使い方_ を教えます**。deep-dive はその使い方の **内部で VectoJS が _どう動くか_ を教えます**。対応する難題の前に learn の章を読んでおくと理解が早くなります。推奨ペア: `text-typography` → 難題 02、`core-scene` + `events` → 難題 06、`accessibility` → 難題 03、`streaming` → 難題 04。 |
| `content/reference/*`（core-a11y、core-entities、core-layout、core-text、ui-markdown、three-adapter、graph-layout など）             | 00–15                   | **Reference は API の真実** です（props、型、サブパス）。Deep-dive は参照ページを引用しますが、再記述はしません。迷ったら参照のシグネチャが正です。                                                                                                                                                              |
| `forge/findings/*` + `forge/baselines/*`                                                                                             | 各 deep-dive の付録     | Findings は **フィールドノート**、baselines は **計測された証拠** です。Deep-dive は finding を難題ごとに 1 つの物語へ統合し、その主張を裏付ける `file:line` エントリへリンクします。                                                                                                                            |
| `vectojs/AGENTS.md` + `vectojs/README.md`                                                                                            | 00（本ドキュメント）    | パッケージマップ、ビルド順序、レンダー/インタラクションモデルは **AGENTS.md と README.md から意味の上で逐語的にコピー** され、`package.json` に対して検証されています — 創作ではありません。                                                                                                                     |

ルール: **正典は常に authoritative 側が先**。ある事実が learn/参照ページと deep-dive の両方に現れる場合、修正対象は learn/参照ページです。`vectojs-docs/content` と `vectojs-website/src/content` の間で `cp -r` しないでください（`AGENTS.md` 記載 — フォーマット差分 + 408 の i18n ファイル）。

## 読む順序 — 自分に合ったものを選ぶ

**「入ったばかり」** — 00 → 02（テキスト/レイアウト）→ 06（VMT ライフサイクル）→ 07（レンダラー）→ 最初のタスクに最も近い難題。午後 2 回分で、実際の PR を出せるだけの土台ができます。

**「機能を担当する」** — 00 → 自分の難題 → その深い前提知識の行 → 対応する `content/learn/*` の章 → その難題の `forge/findings/<area>.md`。レビュー前に不変条件の節をもう一度ざっと読んでください。

**「パフォーマンスを担当する」** — 00 → 06 → 07 → 08（WASM G1/G2/G3）→ 11（グラフ）— その後 `benchmarks/run-browsers.sh` と `forge/baselines/*.json`。引用可能な数値は `run-browsers.sh` からのものだけです。

**「a11y / 高密度ドキュメント / テーブルを担当する」** — 00 → 06 → 03 →（選択/コピーが対象面で重要なら 01）。

**「3D / XR / グラフ可視化を担当する」** — 00 → 06 → 09 → 11 →（配置計算が予算なら 08）。

各 deep-dive の frontmatter は `order`、`package` セット、`prereq` リストを宣言しているため、読者がシリーズの途中から飛び込んでも Zola とサイドバーは順序を保ちます。

## 規約と検証基準

- すべてのコード参照は `file:line` で `ctxctl outline` → `grep -rn` → `read` を経て検証されています（記憶に頼りません）。曖昧な参照には関数/クラス名を含めます。
- Zola の frontmatter はすべてのドキュメントで必須です（`title`、`description`、`order`）。見出しは H2/H3 + フェンスされたコードブロックを使います（グローバル AGENTS.md 準拠）。
- トークン/lint ゲート: 該当する場合は PR 前にドキュメント変更に対して `just fmt` / `just check` 相当を実行します。`vectojs-docs` 側では push 前に `scripts/sync-content.py` の差分チェックを行います。
- 各 deep-dive は ~600 行以内、この概要は ~400 行以内に収めます。冗長より高密度に、重複せずリンクします。

## 次のステップ

上から自分の経路を選んでください。定番の次の一冊は、テキストに触れるなら **難題 01 — Canvas ネイティブな選択**、ライフサイクル/イベントに触れるなら **難題 06 — VMT ランタイム** です — どちらも、より難しいペア（02、08）への短い導入になります。

---

_シリーズ：00 概要 → 01 選択 → 02 テキスト+レイアウト → 03 投影+仮想化 → 04 ストリーミング Markdown → 05 TeX → 06 VMT ランタイム → 07 レンダラー → 08 WASM G1/G2/G3 → 09 Three/XR → 10 動画エクスポート → 11 グラフレイアウト → 12 DevTools → 13 スタイル → 14 レスポンシブ → 15 垂直アプリ → 99 総合。_
