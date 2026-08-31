+++
title = "00 — 概覽：VectoJS 的十六個難題"
description = "VectoJS 十六篇難題深潛的導覽指南 — 難題地圖、架構不變量、套件依賴與每位新進者的閱讀路徑。"
weight = 20
+++

# 00 — 概覽：VectoJS 的十六個難題

## 難題地圖

VectoJS 在單一 `<canvas>` 上重新實作了瀏覽器的職責：布局、命中測試、事件分發、文字塑形、裁剪、滾動、無障礙與渲染——全部透過對保留式實體樹的明確數學運算完成。這個由十六篇文件組成的系列梳理了框架中最棘手的難題；每篇都聚焦一個過去由 DOM 免費提供、如今 VectoJS 必須精確實現的子系統。你不需要依序解決它們，但在選擇起點前必須先看懂這張地圖。

本文件就是那張地圖。

- **你將在這裡學到**：一張圖看懂執行期架構、套件依賴骨架、每個難題會檢驗哪個不變量、如何選擇閱讀順序，以及這些深潛系列相對於既有 `content/learn/*` 與 `content/reference/*` 文件的位置。
- **你不會學到**：任一難題的具體機制。每篇專題深潛各自負責一個難題。本概覽負責指路，並提供剛好足夠的脈絡讓你有方向地抵達。

## 架構一覽

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

像素的唯一來源永遠是畫布。DOM 僅承載**語意與原生輸入**，不負責渲染可見場景。兩個世界透過在布局之後、呈現影格之前執行的深度優先遍歷（`Scene.syncA11y` / `ContentProjectionManager`，參見 `packages/core/src/tree/scene/A11yProjectionManager.ts:30`）保持同步。

鄰近圖示的參考渲染已存在於文件中：[執行環境架構](/learn/runtime-architecture/) 與 [引擎概念](/learn/engine-concepts/)（中央 VMT 樞紐圖）。此文字圖刻意保持可被程式碼引用且可列印。

## 套件依賴骨架

葉引擎在前，向上組合。圖為有向無環圖；箭頭表示「在建構時匯入」：

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

已對照 `packages/*/package.json` 依賴驗證（`text`/`math`/`graph-layout`/`tex` 零 `@vectojs/*` 依賴；`layout→text`、`animation→math`、`core→{layout,text,math,animation}`、`markdown→{ui,tex,core}`）。建構順序遵循此依賴（`package.json:14`）。測試透過 `vitest.config.ts` 將同層套件別名指向 `src/`，因此該順序僅影響 `.d.ts` 產出，不影響測試執行。

追蹤依賴時需注意兩個消費端陷阱：`references/` 的虛假路徑被硬編碼於 `packages/tex/scripts/vendor-katex.ts`（`--source`）與 `scripts/compare-pretext.ts`（`VECTO_PRETEXT_PATH`）——移動該目錄會靜默中斷（依 `AGENTS.md`）。

## 十六個難題一覽

共 16 份文件：本概覽（00）加上 15 篇專題難題（01–15）。難度衡量的是「搞砸的難易度」，而非程式碼量。「首次閱讀」指通往*可用* VectoJS 工作的最快路徑；「深潛前置」則是處理此難題前應先讀的其他難題。

| #   | 難題（深潛）                                | Package(s)                                                                    | 難度 | 適合閱讀對象                          | 深潛前置 | 首次閱讀適用…                    |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------- | ---- | ------------------------------------- | -------- | -------------------------------- |
| 00  | **概覽與導覽**（本文件）                    | — (meta)                                                                      | ☆    | 所有人，首站                          | —        | 定向                             |
| 01  | **畫布原生選取** — 雙世界同步               | `core` (`ContentGridProjector`, `ContentProjectionManager`), `text`, `layout` | ★★★★ | 文字/選取/IME、複製/尋找/翻譯         | 02       | 可選取文字、終端機、程式碼編輯器 |
| 02  | **文字與布局** — Unicode/BiDi/塑形/排版     | `text`, `layout`, `core/text`                                                 | ★★★★ | 布局引擎、i18n、字體排印              | —        | 任何超出 ASCII 的文字            |
| 03  | **語意投射與虛擬化** — 具體化生命週期       | `core/a11y`, `ui`, `markdown`, `table`                                        | ★★★  | a11y、虛擬化、密集文件                | 06       | 大型文件、列表、儀表板           |
| 04  | **串流 Markdown** — 增量調和                | `markdown`, `ui`, `layout`                                                    | ★★★  | 串流/LLM UI                           | 02       | 聊天/串流閱讀器                  |
| 05  | **零 DOM TeX** — 布局與 SVG 發射            | `tex`                                                                         | ★★★  | 數學渲染                              | 02       | Markdown 中的公式                |
| 06  | **VMT 執行期** — dirty/失效/生命週期/事件   | `core/tree`, `core/layout`, `core`                                            | ★★★★ | Scene/Entity 生命週期、命中分發、效能 | —        | 自訂實體、效能除錯               |
| 07  | **渲染器** — 座標/裁剪/DPR 一致性           | `core/renderer`, `core/performance`                                           | ★★★  | 多後端、HiDPI、剔除                   | 06       | canvas/WebGL/WebGPU 工作         |
| 08  | **WASM 三重奏 — G1/G2/G3** — 位元一致的加速 | `crates/vectojs-core-rs`, `math`, `animation`, `graph-layout`, `core/wasm`    | ★★★  | 效能、Rust↔JS 一致性                  | 06, 07   | 大規模影格預算                   |
| 09  | **Three.js / XR 橋接** — 兩個座標世界       | `three`, `graph3d`                                                            | ★★   | 3D 面板、XR                           | 06, 07   | Three.js 內的 VectoJS            |
| 10  | **確定性影片匯出** — 固定步進時鐘           | `video-exporter`                                                              | ★★   | 離線擷取、重播                        | 06       | 螢幕錄製、模擬匯出               |
| 11  | **圖佈局** — 力導向與 WASM                  | `graph-layout`, `graph3d`, `knowledge-graph`                                  | ★★   | 圖視覺化、布局調校                    | 06, 08   | 網路/知識圖譜                    |
| 12  | **DevTools** — 執行期檢視與稽核             | `devtools`, `core` (`frameStats`, `syncA11y`)                                 | ★    | 除錯、CI 稽核                         | 06       | 「這個實體為何在這裡」           |
| 13  | **樣式與主題** — 數值 VMT 上的 CSS 對等能力 | `styles`, `core`                                                              | ★★   | 樣式、主題與 CSS 遷移                 | 06       | 權杖與主題切換                   |
| 14  | **響應式布局與互動** — 適應視埠與輸入       | `core`, `ui`, `layout`                                                        | ★★★  | 響應式應用與布局作者                  | 03、06   | 自適應 Canvas UI                 |
| 15  | **垂直應用** — 圖譜、編輯器、桌面與表格組合 | `knowledge-graph`, `node-editor`, `desktop`, `table`                          | ★★★  | 產品與整合作者                        | 06       | 組合引擎原語                     |

排序說明：

- 若只能選兩篇作為 00 之後的「第二讀」，02 與 06 是最佳選擇——多數其他難題都假設你已讀過其中之一。
- 03 依賴 06 的 dirty/生命週期機制；04 依賴 02 的塑形/布局；07 與 08 皆依賴 06，因此自然聚集於其後。
- 08 的難度不在 Rust 語法，而在**位元一致的備援契約**與其建構陷阱（`crates/vectojs-core-rs/build.sh` 中的 `RUSTFLAGS`）。
- 團隊追蹤器已依序安排 `CTX-0566→…→CTX-0578→CTX-0579`；上表為閱讀順序，允許與建構/發版順序不同。

## 統御所有難題的三個不變量

每個難題都可能破壞其中之一。若什麼都記不住，請記住這些不變量。

### 1. VMT 生命週期不變量

> 實體的 **dirty 旗標、worldMatrix 與子列表** 在每次 `Scene` 步進後保持一致。

破壞時的症狀：`remove(child)` 後未註銷 driver 導致邊界陳舊（`Entity:1582`）、部分 `markDirty` 後出現幽靈命中目標、JS 與 WASM SoA 儲存間變換分歧（`crates/vectojs-core-rs/src/*.rs`，G1）。守衛：`Scene.ts:532` `renderMode` / `DirtyTracker.ts:33` 契約、`DriverTicker.ts:40` 遍歷、`Entity.ts:782` 子類別契約。90% 的「神祕渲染異常」皆可追溯至此。

### 2. 雙世界一致性不變量

> 每個**可見且可互動**的實體都有一個**已同步的 a11y 對應物**，其幾何、角色/名稱/狀態與焦點/指標路由皆與畫布真實一致。

破壞時的症狀：Playwright `getByRole` 找不到東西、螢幕閱讀器播報陳舊文字、點擊命中錯誤實體、IME 落在錯誤的輸入框。守衛：`Entity.ts:295` `A11yAttributes`、`Entity.ts:968` `a11yProjection` 模式（`eager`/`onDemand`/`never`）、`Entity.ts:1937` `getA11yAttributes()` 預設值、共用的 `syncA11y` 遍歷（`A11yProjectionManager.ts:30`、`ContentProjectionManager.ts:26`）與 `A11yProjectionManager.ts:227` 陳舊 memo 失效。`onDemand` 具體化與視埠虛擬化是困難所在（難題 03）——也是多數真實 VectoJS 卡頓的所在。

### 3. 文字度量不變量

> **量一次，多處布局**——並以**真實**字型、在**正確**上下文、以**正確** DPR 進行度量。

破壞時的症狀：文字自其命中框漂移、選取帶按行偏移、CJK 次像素縫隙繪成白線、網頁字型備援靜默改變 advance、DPR 縮放使一個子系統模糊而另一個不模糊。守衛：`packages/text/src/fontMetrics.ts:82` `registerFontMetrics`、`packages/text/src/Typography.ts:111` `ctx.measureText('Mg')` 及其 DOM-free 備援 0.5em、`packages/text/src/measureContext.ts:12` 度量上下文校準、`packages/layout/src/LayoutEngine.ts:808` `LayoutEngine` 冷/熱分離與段落 memo。所有觸及文字的難題（01、02、04、05）皆從不同角度重入此不變量。

在審查期間將此三者作為檢查清單：在核准任何變更前，先問「這可能破壞哪個不變量，又會最先在哪裡顯現？」

## 本系列與既有文件的關係

| 既有文件                                                                                                                           | 深潛（本系列） | 關係                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `content/learn/*`（introduction、runtime-architecture、engine-concepts、text-typography、core-scene、accessibility、streaming 等） | 00–15          | **Learn 教你如何*使用* VectoJS**；深潛教你 VectoJS 在該用法*內部如何運作*。先讀對應的 learn 章節會讓對應的難題更容易理解。建議配對：`text-typography` → 難題 02；`core-scene` + `events` → 難題 06；`accessibility` → 難題 03；`streaming` → 難題 04。 |
| `content/reference/*`（core-a11y、core-entities、core-layout、core-text、ui-markdown、three-adapter、graph-layout 等）             | 00–15          | **Reference 是 API 真相**（props、型別、子路徑）。深潛會引用參考頁面但不重述它們。有疑慮時，以參考簽名為準。                                                                                                                                           |
| `forge/findings/*` + `forge/baselines/*`                                                                                           | 每個深潛的附錄 | Findings 是**現場筆記**；baselines 是**已度量的證據**。深潛將 findings 綜合成每個難題的單一敘事，並回鏈至取得該主張的 `file:line` 條目。                                                                                                               |
| `vectojs/AGENTS.md` + `vectojs/README.md`                                                                                          | 00（本文件）   | 套件地圖、建構順序與渲染/互動模型**按字面意義抄自 AGENTS.md 與 README.md**，並對照 `package.json` 驗證——非憑空捏造。                                                                                                                                   |

規則：**權威方優先**。若同一事實同時出現在 learn/reference 頁面與深潛中，則 learn/reference 頁面為修正目標。切勿在 `vectojs-docs/content` 與 `vectojs-website/src/content` 之間執行 `cp -r`（依 `AGENTS.md`——格式漂移 + 408 個 i18n 檔案）。

## 閱讀路徑 — 選擇你的路線

**「我剛加入」** — 00 → 02（文字/布局）→ 06（VMT 生命週期）→ 07（渲染器）→ 最接近你首個任務的難題。兩個下午，足以交付一個真實 PR。

**「我負責某個功能」** — 00 → 你的難題 → 其深潛前置列 → 對應的 `content/learn/*` 章節 → 該難題的 `forge/findings/<area>.md`。審查前再瀏覽一次不變量章節。

**「我負責效能」** — 00 → 06 → 07 → 08（WASM G1/G2/G3）→ 11（圖）— 接著 `benchmarks/run-browsers.sh` 與 `forge/baselines/*.json`。只有 `run-browsers.sh` 的數字可被引用。

**「我負責 a11y / 密集文件 / 表格」** — 00 → 06 → 03 →（若選取/複製對你的介面重要則 01）。

**「我負責 3D / XR / 圖視覺化」** — 00 → 06 → 09 → 11 →（若布局計算是你的預算則 08）。

每個深潛的前言皆宣告其 `order`、`package` 集合與 `prereq` 列表，讓 Zola 與側邊欄即使讀者中途跳入也能保持有序。

## 約定與驗證標準

- 所有程式碼引用皆經 `ctxctl outline` → `grep -rn` → `read` 驗證為 `file:line`（絕非憑記憶）。含糊的引用會包含函式/類別名稱。
- 每份文件皆需 Zola 前言（`title`、`description`、`order`）。標題使用 H2/H3 + 圍欄程式碼區塊（依全域 AGENTS.md）。
- 令牌/lint 關卡：在提交 PR 前，對文件變更執行等效的 `just fmt` / `just check`；在 `vectojs-docs` 端，推送前執行 `scripts/sync-content.py` 漂移檢查。
- 每個深潛保持在約 600 行以內；本概覽在約 400 行以內。精煉勝於冗長；多用連結，少重複。

## 下一步

依上方選擇你的路徑。常見的下一讀是 **難題 01 — 畫布原生選取**（若你觸及文字），或 **難題 06 — VMT 執行期**（若你觸及生命週期/事件）——兩者皆是通往較難配對（02、08）的短捷徑。

---

*系列：00 概覽 → 01 選取 → 02 文字+布局 → 03 投影+虛擬化 → 04 串流 Markdown → 05 TeX → 06 VMT 執行期 → 07 渲染器 → 08 WASM G1/G2/G3 → 09 Three/XR → 10 影片匯出 → 11 圖布局 → 12 DevTools → 13 樣式 → 14 響應式 → 15 垂直應用 → 99 綜合。*
