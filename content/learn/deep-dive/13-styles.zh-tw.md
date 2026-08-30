---
title: '13 — 樣式與主題 — 數值 VMT 上的 CSS 一致性'
description: '為何 VectoJS 樣式位於 Virtual Math Tree、CSS 屬性名稱物件如何映射至數值實體欄位，以及使它們感覺像 CSS 而非 CSS 的每個機制 — token 與 var() 解析、css() 合併、字型組合、逐軸內距、原子主題切換，以及保持數值樹誠實的遷移陷阱。'
order: 33
---

# 13 — 樣式與主題 — 數值 VMT 上的 CSS 一致性

> VectoJS 沒有樣式表、沒有級聯、沒有瀏覽器。Virtual Math Tree 儲存的是數字 — `x`、`width`、`bg`、`font` — 而非 CSS 字串。`@vectojs/styles` 是讓你*以 CSS 的寫法*撰寫這些數字，卻仍使其以數字落地的橋樑：一個型別化物件、一個固定查表與一個在切換時重解析的扁平 token 主題。

- **你將學到**：為何樣式位於數值 VMT 上、`Style` 如何映射至實體欄位、`var(--token)` token 如何解析（錨定、內嵌、遞移與循環偵測）、`css()` 如何合併與 `style()` 如何型別化、`composeFont` 如何保持畫布簡寫有效、逐軸 `padding: {x,y}` 如何展開、`setTheme` 如何經 `WeakRef` 追蹤的配對原子交換，以及遷移 CSS 習慣可能大聲而非靜默失敗的每個方式。
- **你不會學到**：文字如何塑形或布局（Boss 02）、場景如何變髒與渲染（Boss 06/07）或 Markdown 如何為其程式碼區塊主題化（`packages/markdown/src/markdown-presets.ts:281` `resolvePresetTheme` — 獨立的 token 系統）。本文件是覆於數值樹上的輕量、具型別、具 CSS 命名的外皮。

## 1. 為何樣式位於 VMT — 而非 CSS

VMT 以數字儲存場景。`Entity.x: number`（`packages/core/src/tree/Entity.ts:1`）、`UIComponent.paddingX: number`（`packages/ui/src/UIComponent.ts:28`）、`Text.font: string`（`packages/ui/src/Text.ts:111`）仍為*有效的畫布字型簡寫*——而非樣式表規則。沒有可繼承的 DOM 元素、沒有可解析的級聯、沒有可匹配的選擇器。瀏覽器的樣式引擎因設計而缺席：VectoJS 自行擁有繪製、命中測試與投射，因此亦擁有尺寸。

`@vectojs/styles` 順應此約束而非對抗它：

- `Style` 為具**可選**鍵的純物件（`packages/styles/src/types.ts:16`）— `x?: CssLength`（`types.ts:18`）、`backgroundColor?: string`（`types.ts:28`）、`fontSize?:`${number}px``（`types.ts:46`）、`display?: 'flex'`（`types.ts:62`）。無類別、無代理、無註冊表。
- `applyStyle(entity, style)`（`packages/styles/src/apply.ts:294`）為**固定查表** `RULES: Record<string, Rule>`（`apply.ts:54`），將每個 CSS 命名的鍵轉為一次數值/字串/布林寫入。每個鍵皆被列舉；未知鍵拋出（`apply.ts:258`）。無解析、無繼承、無 `%`。
- Token 為扁平的 `Record<string, string|number>`（`packages/styles/src/theme.ts:38` `ThemeTokenSet`），在值中以 `var(--key)` 參考，並對活躍主題以字串替換解析——而非由 CSS 引擎解析。
- 套件僅依賴 `@vectojs/core`（`packages/styles/package.json:14`）且零執行期依賴；`@vectojs/ui` 零 `@vectojs/styles` 依賴（依賴圖為 `core → styles`，攝入為選擇加入）。

回報為遷移舒適度 — `backgroundColor: 'var(--accent)'` 讀起來像 CSS 卻仍落於 `entity.bg: string`（`apply.ts:63`）——而 VMT 保持為單一真值來源。代價是 CSS 所做而無數值後端欄位者*不存在*且必須大聲失敗（見 §10）。

## 2. `Style` 與 Rule 表 — 每個鍵皆為契約

`CssLength = number |`${number}px``（`packages/styles/src/types.ts:2`）— 裸數字為 px，`px` 字串解析為數字。區別僅對 `fontSize` 重要，其型別縮小為 `` `${number}px` ``（`types.ts:46`），因此裸`16` 為型別錯誤 — 組合的字型簡寫必須保持有效。

`Style`（`types.ts:16`）按其驅動對象分組鍵：

<!-- markdownlint-disable MD060 -->

| 群組     | 鍵                                                                                        | 後端欄位                                                           | 轉換器                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 幾何     | `x,y,width,height`                                                                        | 相同（`apply.ts:55`）                                              | `isCssLength`（`apply.ts:23`）— 數字或 `/^[+-]?(\d+\.?\d*                                \| \.\d+)px$/` |
| 變換     | `scaleX,scaleY,rotation,opacity`                                                          | 相同（`apply.ts:59`）                                              | `isFiniteNumber`（`apply.ts:33`）；`rotation` 為**弧度**（`types.ts:25`）而非 CSS 度數                  |
| 盒模型   | `backgroundColor→bg`、`color`、`borderColor`、`borderRadius→radius`、`padding`            | `apply.ts:63`                                                      | `isString` / `isCssLength`                                                                              |
| 文字     | `font`、`lineHeight`、`textAlign`                                                         | 相同 / `textAlign` 經 `oneOf(['left','justify'])`（`apply.ts:70`） | `types.ts:55` — `center`/`right` 被大聲拒絕                                                             |
| 布局     | `display→null`、`flexDirection→direction`、`gap→gap`、`alignItems→align`、`flexWrap→wrap` | `apply.ts:71`                                                      | `oneOf` + 列舉重映射（`row→horizontal`、`flex-start→start`、`wrap→true`）                               |
| 字型片段 | `fontFamily,fontSize,fontWeight`                                                          | 組合至 `font`（`apply.ts:101` `FONT_KEYS`）                        | `composeFont`（`packages/styles/src/font.ts:113`）                                                      |

關於這些轉換器的三條規則：

1. **跨元件跳過為靜默。** `write()` 檢查 `field in entity`（`apply.ts:186`）；`Text` 無 `bg`，`Button` 無 `textAlign` — 鍵被跳過且缺席於 `AppliedStyle.applied: string[]`（`types.ts:71`）。一個樣式物件可在元件間共用。
2. **類別錯誤拋出。** 在非容器上的布局鍵（`apply.ts:194` 處的 `!('direction' in entity)` 或 `apply.ts:194` 處的 `field===null && !('direction' in entity)`）為 `TypeError`，命名屬性與 `entity.constructor.name`（`apply.ts:189`）。將 `Text` 樣式化為 `display: flex` 為錯誤而非無操作。
3. **`display` 不寫入欄位。** `field: null`（`apply.ts:72`）— 它驗證實體*為*容器且值為 `'flex'`（`apply.ts:74`），然後在不觸碰實體的情況下貢獻至 `applied`。容器本身已為 flex；該鍵存在使誤型的容器樣式失敗。

驗證嚴格：`isCssLength` 拒絕 `'50%'`、`'8em'`（`packages/styles/test/styles.test.ts:35`），`oneOf` 拒絕 `stretch`/`row-reverse`/`block`（`styles.test.ts:150`），未知鍵拋出 `unknown style property 'position'`（`styles.test.ts:159`）。

## 3. `applyStyle` 管線 — 先解析再寫入

```ts
export function applyStyle(entity: Entity, s: Style): AppliedStyle {
  const { style: resolved } = resolveStyle(s, getTheme()); // theme.ts:96 getTheme / apply.ts:162 resolveStyle
  const result = applyStyleResolved(entity, resolved); // apply.ts:180
  trackVarKeys(entity, s); // theme.ts:175 — 在目前主題下註冊 var() 鍵
  return result;
}
```

`resolveStyle`（`apply.ts:162`）走訪樣式物件，對每值呼叫 `resolveValue(value, theme)`（`apply.ts:137`）— 對 `padding: {x,y}`（`apply.ts:166`）有獨立解析每軸的特殊分支。`resolveValue` 有四個分支：

1. 非字串 → 直通。
2. 錨定的 `var(--key)`（`theme.ts:6` `VAR_RE = /^var\(--([\w-]+)\)$/`）→ `resolveToken(key, theme, seen)`（`apply.ts:112`），其查找 `theme.tokens[key]` 並經 `resolveValue(token, theme, seen)` 遞移遞迴。
3. 備援形式 `var(--key, …)`（`theme.ts:24` `HAS_VAR_FALLBACK_RE = /var\(\s*--[\w-]+\s*,/`）→ 拋出命名該值的 `TypeError`（`apply.ts:148`）。在內嵌路徑前檢查，使複合亦被涵蓋。
4. 任意位置的內嵌 `var(--key)`（`theme.ts:11` `HAS_VAR_RE = /var\(--([\w-]+)\)/`）→ 經 `VAR_REPLACE_RE = /var\(--([\w-]+)\)/g`（`apply.ts:105`）全域替換，以 `String(resolveToken(key,…))` 按出現替換（`apply.ts:156`）。

`applyStyleResolved`（`apply.ts:180`）為數值寫入。它先處理兩個特殊形態 — 經 `composeFont` 的 `FONT_KEYS`（`apply.ts:207`）與經寫入 `paddingX`/`paddingY`（`apply.ts:248` `isCssLength(v, 'padding.x')`）的 `padding` 物件（`apply.ts:242`）— 然後經 `write()`（`apply.ts:185`）對其餘遍歷 `RULES`。觸及字型的樣式設定 `fontTouched` 並在結尾重組一次（`apply.ts:265` `composeFont(current, fontChanges)`）。當 `applied.length > 0` 時，`entity.scene?.markDirty()` 觸發一次（`apply.ts:271`），遵守 `onDemand` 契約。無場景 → 無 dirty 呼叫（`styles.test.ts:182`）。

回傳值為 `{ applied: string[] }`（`types.ts:71`）— 實際寫入的 CSS 屬性名稱，按物件順序 — 因此呼叫者可在不重檢查實體的情況下分支 `applied.includes('padding')`。

## 4. Token 系統 — `tokens()`、`PRESET_THEMES` 與 `var()` 語意

### 4.1 建立主題

```ts
export type ThemeTokenSet = Record<string, string | number>; // theme.ts:38
export interface Theme {
  readonly tokens: ThemeTokenSet;
} // theme.ts:41
export function tokens(set: ThemeTokenSet): Theme {
  return { tokens: set };
} // theme.ts:46
export const DEFAULT_THEME: Theme = tokens(PRESET_THEMES.light); // theme.ts:51
```

依設計扁平 — 如 `MarkdownTheme` — 單次展開，無深層合併、無巢狀（`theme.ts:35`）。`PRESET_THEMES`（`packages/styles/src/presets.ts:12`）提供 `light | dark | github | dracula`（`presets.ts:12`），各具 `accent/surface/surfaceAlt/text/muted/border/radius-sm/md/lg/font/fontFamily/fontSize/fontWeight/fontMono`（`presets.ts:13`）。呼叫者的主題為展開：`tokens({ ...PRESET_THEMES.dark, accent: '#f00' })`（`vectojs-docs/content/reference/styles.md:136`）。鍵儲存時不含 `--`；參考寫為 `var(--key)`（`theme.ts:28`）。

### 4.2 錨定、內嵌與遞移解析

- **錨定** — `backgroundColor: 'var(--accent)'` 直接解析 token 值（`apply.ts:140` 處的 `resolveValue` 提前回傳），保留其型別：數值 token `gap: 10` 保持 `number` 並流入 `isCssLength` 而無需字串化。整字串同一性使 `gap: 'var(--gap)'` 搭配 `gap: 12` 產生 `e.gap === 12` 的數字（`packages/styles/test/v2.test.ts:70`）。
- **內嵌** — `'rgba(var(--rgb), 0.4)'` 搭配 `rgb: '255, 0, 0'` 經 `String(resolveToken(...))`（`apply.ts:157`）替換每次出現，產生 `'rgba(255, 0, 0, 0.4)'`（`packages/styles/test/issue-608.test.ts:39`）。同一 token 的兩次出現共用一次解析遍歷，不觸發循環偵測器（`issue-608.test.ts:99` 具兩個 `var(--rgb)` 的 `shadow`）。
- **遞移** — token `alias: 'var(--accent)'` 搭配 `accent: '#123456'` 將 `var(--alias)` 解析為 `var(--accent)` 再至 `'#123456'`（`packages/styles/test/v2.test.ts:353`）。鏈經 `resolveToken` 內的 `resolveValue(token, theme, seen)`（`apply.ts:125`）跟隨，因此複合 token `surface: 'rgba(var(--rgb), 1)'` 搭配 `rgb: '17, 34, 51'` 在作為 `var(--surface)` 解參考時產生 `'rgba(17, 34, 51, 1)'`（`issue-608.test.ts:78`）。

`resolveToken` 攜帶 `seen: Set<string>`（`apply.ts:112`）— 目前解析中的鍵路徑。`seen.has(key)` 表示循環；拋出 `circular var() reference: var(--a) → var(--b) → var(--a)`（`apply.ts:121`）。`finally` 中的 `seen.delete(key)`（`apply.ts:127`）使對同一 token 的兄弟參考獨立 — `rgba(var(--rgb), var(--rgb))` 否則在第二次出現時誤判。

### 4.3 何者拋出，以及為何靜默永不正確

| 條件                                | 位置                                                                | 訊息                                                                              | 為何必須拋出                                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 未知 token                          | `resolveToken` `apply.ts:116`                                       | `unknown token 'var(--nope)'`                                                     | 當欄位收到垃圾時 Canvas2D 靜默保持先前繪製（`v2.test.ts:253`，`issue-608.test.ts:16` 錨定缺失）                                                                                                |
| 循環鏈                              | `resolveToken` `apply.ts:121`                                       | `circular var() reference: … → …`                                                 | 無限替換將懸掛或發射字面 `var(--…)`                                                                                                                                                            |
| `var(--k, fallback)` — 任何到達路徑 | `resolveValue` `apply.ts:148` + `HAS_VAR_FALLBACK_RE` `theme.ts:24` | `var() fallbacks are not supported — '…' would reach the entity field unresolved` | `VAR_RE` 與 `HAS_VAR_RE` 皆不匹配它（`)` 必須緊跟鍵），因此無此守衛時原始字串抵達映射欄位，而 Canvas2D 靜默保持舊值且鍵對主題切換未被追蹤（#645，`packages/styles/test/issue-645.test.ts:40`） |
| `fontSize` 裸數字或非 px            | `applyStyleResolved` `apply.ts:221` + `apply.ts:232`                | `fontSize resolved to the bare number …` / `expects a px string`                  | 裸 `16` 組合為 `'700 16 Inter'` — Canvas2D 靜默丟棄（`v2.test.ts:254`）                                                                                                                        |
| `fontFamily` 看似簡寫               | `applyStyleResolved` `apply.ts:214`                                 | `looks like a font shorthand — reference the 'font' token`                        | `'16px Inter'` 洩漏至 `fontFamily` 將丟棄尺寸/字重                                                                                                                                             |

備援偵測器容忍 `var(` 後的空白（`theme.ts:24` 中 `HAS_VAR_FALLBACK_RE` 的 `/var\(\s*--/`），因此 `var( --accent, #fff)` 亦被捕捉 — 游離空白常見，先前缺失它們的 #753 前偵測器讓值通過（`issue-645.test.ts:78`）。

型別層將 `fontSize` 縮小為 `` `${number}px` ``（`types.ts:46`）；JS 呼叫者與 token 值繞過型別，因此執行期亦強制 — 來自 token 的 `'2em'` 仍拋出（`issue-608.test.ts:141`）。

## 5. `css()` 合併與 `style()` 型別化 — 變體模式

```ts
export function css<T extends Style>(...styles: Array<T | null | undefined | false>): T {
  // css.ts:17
  const merged: Record<string, unknown> = {};
  for (const s of styles) {
    if (!s) continue; // css.ts:20
    for (const [key, value] of Object.entries(s)) {
      merged[key] =
        key === 'padding' && typeof value === 'object' && value !== null
          ? { ...(value as object) } // css.ts:23 — 逐軸內距深拷貝
          : value;
    }
  }
  return merged as T;
}
export function style<T extends Style>(s: T): T {
  return s;
} // css.ts:32
```

`style()` 為恆等工廠 — 將字面量型別化為 `Style`，原樣回傳（`packages/styles/test/styles.test.ts:18`）。`css()` 為變體合併：後者來源勝出，`null`/`undefined`/`false` 被跳過使條件變體為 `css(base, isMuted && muted)`（`css.ts:11`），輸入不被變更（`v2.test.ts:49`），且唯一巢狀形態 — `padding: { x, y }`（`types.ts:34`）— 被複製（`css.ts:23`），因此變更 `merged.padding.x` 永不觸及來源變體（GH-608，`issue-608.test.ts:153`）。整體替換 `padding` 亦被複製 — `merged.padding !== override.padding`（`issue-608.test.ts:163`）。

## 6. 主題切換 — 原子、已追蹤、弱持有

### 6.1 帳務

```ts
const current = { theme: DEFAULT_THEME }; // theme.ts:53
const varPairs = new WeakMap<Theme, Map<WeakRef<Entity>, Map<string, unknown>>>(); // theme.ts:70
const entityRefs = new WeakMap<Entity, WeakRef<Entity>>(); // theme.ts:75
```

`varPairs` 以 `Theme` 為鍵（被丟棄的主題經 `WeakMap` 整體被回收），值映射 `WeakRef<Entity>` → `Map<string, unknown>`，記錄被追蹤樣式*鍵*至其參考的 `var()` 表達式 — 而非整個樣式物件（`theme.ts:59`）。多個 `var()` 樣式在一個實體上累積；同一鍵上的後續字面量取代參考而非在下次切換時被覆蓋（`theme.ts:61`，`packages/styles/test/v2.test.ts:181`）。

實體經 `WeakRef` 而非強持有（`theme.ts:70`）：`Entity.destroy()` 無回到樣式的鉤子（`theme.ts:65`），因此強內部映射在主題生命期內保留每個已樣式化實體，`setTheme` 持續重解析已銷毀者（#644，`packages/styles/test/issue-644.test.ts:49`）。失效參考在走訪期間掃除；`untrackVarStyles(entity)`（`theme.ts:160`）為框架知道實體何時消失時的積極路徑 — 具冪等性，對從未追蹤的實體安全（`issue-644.test.ts:93`）。

`entityRefs: WeakMap<Entity, WeakRef<Entity>>`（`theme.ts:75`）為每實體提供穩定的 `WeakRef`（`theme.ts:77` `refOf`），使一個實體上的重複樣式命中同一追蹤條目而非孤立無法到達的重複。參考物件本身被弱持有並隨實體死亡。

`trackVarKeys(entity, style)`（`theme.ts:175`）由 `applyStyle` 以*原始*樣式 `s`（而非已解析者）呼叫，因此字面覆寫語意被保留（`apply.ts:300`）：

- `typeof value === 'string' && HAS_VAR_RE.test(value)` → `keys.set(key, value)`（`theme.ts:181`）— 錨定或內嵌的 `var()` 皆追蹤。
- 具任一軸上 `HAS_VAR_RE` 的 `padding` 物件 → 追蹤整個鍵（`theme.ts:185`）。
- 否則 → `keys.delete(key)`（`theme.ts:195`）— 字面量由呼叫者寫入且絕不可重播。`keys.size === 0` 修剪實體條目（`theme.ts:197`）。

### 6.2 `setTheme(next)` — 先演練再提交

```ts
export function setTheme(next: Theme): void {
  if (next === current.theme) return; // theme.ts:117 — 同一性而非深相等
  const previous = current.theme;
  const pairs = varPairs.get(previous);
  const resolved = new Map<WeakRef<Entity>, Style>();
  if (pairs) {
    for (const [ref, keys] of pairs) {
      const entity = ref.deref();
      if (entity === undefined) {
        pairs.delete(ref);
        continue;
      } // 掃除已回收 (#644) theme.ts:129
      const style: Style = {};
      for (const [key, expr] of keys) (style as Record<string, unknown>)[key] = expr;
      resolved.set(ref, resolveStyle(style, next).style); // 對 next 演練 — 在仍處 previous 時拋出
    }
  }
  current.theme = next; // theme.ts:139 — 僅在每次演練成功後
  if (pairs) {
    const nextPairs = pairsOf(next);
    for (const [ref, style] of resolved) {
      const entity = ref.deref();
      if (entity === undefined) continue; // 在遍歷間被回收 theme.ts:144
      applyStyleResolved(entity, style); // 不重追蹤 — 已於下方遷移
      nextPairs.set(ref, pairs.get(ref)!); // 遷移參考至下一主題 theme.ts:146
    }
    varPairs.delete(previous); // theme.ts:148
  }
}
```

原子性保證（`theme.ts:107`）：每個被追蹤樣式皆在 `current.theme` 移動*前*對 `next` 解析。遺漏 token 或無效值（例如 `v2.test.ts:126` 處的 `--gap: '50%'`、`v2.test.ts:139` GH-485 處缺失的 `--radius-md`）在場景、活躍主題與配對帳務仍完全一致於先前主題下拋出 — 永不半重樣式。由 GH-485 測試驗證：缺失 `radius-md` 的 `partial` 主題拋出，`getTheme() === themeA` 仍成立，兩實體皆未重樣式，後續有效切換仍重解析每對（`v2.test.ts:137`）。

`getTheme(): Theme`（`theme.ts:96`）讀取 `current.theme`；`untrackVarStyles`（`theme.ts:160`）在活躍主題下丟棄實體條目，使下次 `setTheme` 停止重播它。

## 7. 字型組合與逐軸內距 — 兩個非平凡寫入

### 7.1 `composeFont` — 對簡寫字串的手術

UI 元件以 `font: string` 攜帶整個字型（經 `Entity` 的 `packages/ui/src/UIComponent.ts:1`，`packages/ui/src/Text.ts:111` `font: string`）。三個 CSS 命名的鍵並非獨立欄位 — `applyStyleResolved` 解析目前簡寫、替換樣式變更的段並寫入重組的字串（`apply.ts:207` `FONT_KEYS` 迴圈，`apply.ts:267` `composeFont(current, fontChanges)`）。

`composeFont(current, changes)`（`packages/styles/src/font.ts:113`）委派至 `parse(font)`（`font.ts:73`），其以空白分詞（`font.ts:74` `split(/\s+/).filter(Boolean)`）、消耗前導 `style`/`variant`/`weight` 關鍵字（`font.ts:40` `parsePrefixes` 具 `font.ts:18` 處的 `WEIGHT_RE = /^(normal|bold|bolder|lighter|[1-9]00)$/`、`STYLE_RE` `:19`、`VARIANT_RE` `:20`）、在尺寸槽匹配 `SIZE_SLOT_RE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:rem|em|px|pt))(?:\/([^\s/]+))?$/`（`font.ts:26`）並將餘下視為 `family`。重組連接 `[style, variant, weight, size[/lineHeight], family]`（`font.ts:103`）。

為何重要：

- 前綴語法：`italic 700 16px Georgia` 或 `16px/24px Inter` 曾將尺寸周圍的一切折疊至 family（`font.ts:14`），因此後續段變更重組為 Canvas2D 靜默丟棄的無效字串。現在 `italic 700 16px Georgia` 上的 `fontSize: '20px'` 產生 `italic 700 20px Georgia`（`issue-608.test.ts:107`）並保留 `16px/24px` 行高（`issue-608.test.ts:112`）。
- `normal` 歧義：`font: normal normal 16px Inter` 為有效 CSS；第一個 `normal` 填入 `weight`，其餘填入 `style` 再 `variant`（`font.ts:48`）而非落入尺寸槽並拋出。
- 大聲失敗：尺寸前的 `ultra-condensed 700 16px serif` 拋出並命名違規段（`issue-608.test.ts:124`）。無法放置的類尺寸段在 `font.ts:91`（`unrecognized segment '…' before the font size`）失敗而非埋於 family。
- 缺失尺寸/family 預設：`parts.size ??= '16px'` 與 `family ??= 'sans-serif'`（`font.ts:121`），因此空 `font: ''` 加上 `fontFamily: 'Inter'` 產生 `'16px Inter'`（`v2.test.ts:239`），裸樣式前綴簡寫 `italic Georgia` 正規化為 `italic 18px Georgia`（`issue-608.test.ts:129`）。
- 執行期單位強制：作為 `12`（來自 token 的裸數字）到達的 `fontSize` 拋出 `unit-bearing token (e.g. '16px')`（`apply.ts:223`），`'2em'` 拋出 `fontSize expects a px string`（`apply.ts:233`），含數字的 `fontFamily` 觸發 `looks like a font shorthand`（`apply.ts:214`，`v2.test.ts:272`）。`fontSize:`${number}px`` 型別（`types.ts:46`）捕捉靜態情況；執行期捕捉 token 與 JS 呼叫者。

### 7.2 逐軸內距 — `padding: { x, y }`

`padding?: CssLength | { x?: CssLength; y?: CssLength }`（`types.ts:34`）。盒元件（`Button`、`Link`、`Card`）攜帶 `padding`（均勻）加上 `paddingX`/`paddingY`（`packages/ui/src/UIComponent.ts:21` / `:28`）：當存在時套用層寫入逐軸欄位（`apply.ts:248` 經 `isCssLength(v, 'padding.x')` 的 `paddingX`/`paddingY`）、保持 `padding` 不動，並以整體回報 `applied: ['padding']`。在無逐軸欄位的實體上樣式被跳過（`v2.test.ts:329`）— 元件選項中建構時的 `padding` 仍支配固有尺寸；建構後的 `padding: {x,y}` 由檢查 `paddingX`/`paddingY` 的消費者（例如 `Card` 布局）即時讀取，而非重度量盒。

物件內的 Token 參考按軸解析（`apply.ts:168` `resolveValue(pad.x, theme)`），`trackVarKeys` 在任一軸參考 token 時將鍵整體追蹤（`theme.ts:189`）。無效的軸值拋出並命名 `padding.x`（`v2.test.ts:336`）。

## 8. UI 與核心如何消費它

無 UI 元件在執行期匯入 `@vectojs/styles` — 樣式被*套用至*它們而非*由*它們套用。元件暴露恰為 Rule 表寫入目標的型別化數值欄位：

- **幾何** — 每個 `Entity` 皆有 `x/y/width/height/opacity/scaleX/scaleY/rotation` — `Text` 與 `Button` 直接建立於其上。
- **盒模型** — `UIComponent`（`packages/ui/src/UIComponent.ts:19`）擁有 `padding`、`paddingX`、`paddingY`；`Button`（`packages/ui/src/Button.ts:19`）擁有 `bg`（`backgroundColor` → `bg` 於 `apply.ts:63`）、`color`、`borderColor`、`radius`（`borderRadius`），加上供其標籤置中的 `font`（`Button.ts:80` `measureText(label, font)`）。`Card`、`Link`、`Tabs` 遵循相同盒欄位。
- **文字** — `Text`（`packages/ui/src/Text.ts:18` `TextOptions`）擁有 `font`、`color`、`lineHeight`、`textAlign`（`'left'|'justify'` — `Text.ts:42`）；其 `fontSize` 經 `fontSizePx(font)`（`packages/ui/src/measure.ts:27`）萃取，後者以 `indexOf('px')` 而非具相鄰數字類別量詞的正則掃描 `px` token（與 `font.ts:26` `SIZE_SLOT_RE` 相同的 ReDoS 衛生）。`familyOf(font)`（`measure.ts:57`）為按字族度量分解相同簡寫。
- **布局** — `Stack`（`packages/ui/src/Stack.ts:10`）擁有 `direction→flexDirection`、`gap`、`align→alignItems`、`wrap→flexWrap`；`Flow` 為兄弟容器。僅此兩者接受僅容器鍵 — 任何其他實體皆拋出（`packages/styles/test/styles.test.ts:144`）。

核心文字實體（`packages/core/src/text/MSDFTextEntity.ts:1` `MSDFTextEntity`、`SVGEntity`）在目前程式碼庫中不經此套件樣式化 — 其 `font`/`maxWidth`/`lineHeight` 由 `MSDFFont` 與 `LayoutWorkerManager` 驅動（Boss 02）。對 `MSDFTextEntity` 套用 `fontSize: '20px'` 仍會命中 `composeFont`，但今日無 `applyStyle` 呼叫點；本章的文字互動在度量契約層面（在繪製處度量，`packages/text/src/measureContext.ts:87` `getSharedMeasuringContext`）。

`measure.ts` 亦擁有樣式間接互動的字型度量失效：網頁字型載入觸發 `notifyFontMetricsChanged`（`measure.ts:111`），其清除 LRU 並通知 `UIComponent.watchFontMetrics(handler)`（`UIComponent.ts:128`）訂閱者 — `Text` 與 `Button` 重度量其固有寬度並 `markDirty`。樣式在網頁字型載入後無需重套用；實體自身的 `watchFontMetrics` 處理器保持幾何正確。

## 9. 自 CSS 習慣遷移至 VMT — 每個靜默失敗皆大聲

套件的教條（GH-608，`packages/styles/src/theme.ts:20`「GH-608 教條」）為未識別的 `var()` 形式絕不可靜默通過 — 此套件唯一絕不可做的事是將 Canvas2D 靜默忽略的字串交給它。該教條延伸至每個無 VMT 對應的 CSS 習慣：

| CSS 習慣                                                                     | 發生什麼                                                                                                                         | 原因                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `width: '50%'`、`gap: '8em'`、`radius: '50%'`                                | `TypeError: width expects a bare number or a px string`（`apply.ts:29`）                                                         | VMT 上僅存在 px 單位；`%`/`em`/`rem` 無後端欄位（見 `vectojs-docs/content/reference/styles.md:193`）。百分比間隙將需要 VMT 永不計算的包含塊。                                                                                                           |
| `textAlign: 'center' \| 'right'`                                             | `TypeError: textAlign expects one of left \| justify`（`apply.ts:50`，`styles.test.ts:87`）                                      | `Text`/`RichText`/`TextEntity` 與布局引擎（`packages/layout/src/LayoutEngine.ts:1` 處的 `LayoutEngine.textAlign`）僅實作 `left` 與 `justify` — `center`/`right` 無法被尊重且絕不可靜默渲染為 `left`（`vectojs-docs/content/reference/styles.md:208`）。 |
| `var(--token, fallback)`                                                     | `TypeError: var() fallbacks are not supported — 'var(--accent, #fff)' would reach the entity field unresolved`（`apply.ts:149`） | 備援解析未實作；原始字串將抵達 Canvas2D，後者靜默保持先前繪製，且鍵將對 `setTheme` 未被追蹤（#645，`issue-645.test.ts:33`）。                                                                                                                           |
| `rotation: '30deg'` 或裸 `30`                                                | 僅以數字寫入（`apply.ts:33` 處的 `isFiniteNumber`）並解譯為**弧度**（`types.ts:25`）。`rotate(30deg)` 必須為 `Math.PI/6`。       | VectoJS 的每個其他旋轉介面皆為弧度；樣式層不引入第二單位。                                                                                                                                                                                              |
| `display: 'block'`、`flexDirection: 'row-reverse'`                           | `TypeError: display expects one of flex`（`apply.ts:50`，`styles.test.ts:152`）                                                  | 僅存在 `flex` 容器；`block`/`grid` 對*已為* flex 的 `Stack`/`Flow` 無意義。                                                                                                                                                                             |
| `gap` / `alignItems` 於 `Text` 上                                            | `TypeError: 'gap' is a container-only property and Text is not a container`（`apply.ts:189`，`styles.test.ts:144`）              | 類別錯誤而非靜默無操作。                                                                                                                                                                                                                                |
| `position: 'absolute'`、`transform`、`justifyContent`、`border: '1px solid'` | `unknown style property 'position'`（`apply.ts:258`，`styles.test.ts:159`）                                                      | 無可寫入欄位；新增它們將重引入 VMT 存在以移除的級聯/邊距折疊機制（`vectojs-docs/content/reference/styles.md:198`）。                                                                                                                                    |
| `fontSize: 16`（裸數字）或 `fontSize: '2em'`                                 | `bare number` / `expects a px string like '16px'`（`apply.ts:223` / `:233`）                                                     | 畫布字型簡寫需要具單位的尺寸；裸數字組合為 Canvas2D 靜默丟棄的無效簡寫（`v2.test.ts:244`，`issue-608.test.ts:137`）。                                                                                                                                   |
| `fontFamily: '16px Inter'`                                                   | `looks like a font shorthand — reference the 'font' token`（`apply.ts:214`，`v2.test.ts:272`）                                   | 防止完整簡寫洩漏至 family 槽並丟棄尺寸/字重。                                                                                                                                                                                                           |

共同主線：每個拋出皆命名 CSS 屬性並回顯值（`apply.ts:29` `JSON.stringify(value)`），因此對訊息的 grep 可找到遷移呼叫點。通過驗證的樣式恆產生有效的畫布字型簡寫與 VMT 可繪製的數字 — 無不良值靜默繪製前一影格狀態的路徑。

## 10. 困難之處 — 附憑據

| 陷阱                                                               | 位置                                                         | 狀態                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `rgba(var(--rgb), 0.4)` 寫為原始字串 — Canvas2D 靜默保持舊填充     | `apply.ts:133` (GH-608)，`issue-608.test.ts:37`              | 已修正：經 `VAR_REPLACE_RE` 替換內嵌 `var()`（`apply.ts:105`）                                             |
| `italic 700 16px` 尺寸前綴在重組時折疊至 family                    | `font.ts:14` (GH-608)                                        | 已修正：完整 `[style\|variant\|weight]? size[/line-height]? family` 解析器（`font.ts:40` `parsePrefixes`） |
| `16px/24px` 行高段在 `fontSize` 變更時遺失                         | `font.ts:26` `SIZE_SLOT_RE`                                  | 已修正：`size/lineHeight` 擷取並重發射（`font.ts:80` / `:102`）                                            |
| `fontSize` 接受 `'2em'`/`2rem` 並組合為 Canvas2D 丟棄的簡寫        | `apply.ts:232` (GH-608)                                      | 已修正：執行期 `px` 強制（`apply.ts:232`，`issue-608.test.ts:137`）                                        |
| `css()` 在變體間共用同一 `padding: {x,y}` 物件                     | `css.ts:23` (GH-608)                                         | 已修正：逐軸複製（`css.ts:23`，`issue-608.test.ts:153`）                                                   |
| `var(--token, fallback)` 未解析地通過                              | `theme.ts:24` `HAS_VAR_FALLBACK_RE` (#645)                   | 已修正：在內嵌替換前偵測並拋出（`apply.ts:147`，`issue-645.test.ts:30`）                                   |
| `var( --token, fb)` 具游離空白逃脫備援守衛                         | `theme.ts:24` `/var\(\s*--/` (#753)                          | 已修正：允許 `var(` 後空白（`issue-645.test.ts:78`）                                                       |
| Token-ref→token 鏈將字面 `var(--…)` 洩漏至字串欄位                 | `apply.ts:112` `resolveToken` (GH-452/608)                   | 已修正：具 `seen` 循環集合的遞移 `resolveValue`（`apply.ts:125`）                                          |
| `setTheme` 在缺失 token 上半重樣式                                 | `theme.ts:107` 演練 (GH-485，`v2.test.ts:137`)               | 已修正：全部解析後才提交，`current.theme` 僅在每次演練後移動                                               |
| 已樣式化實體永遠保留 — `WeakMap<Theme, Map<Entity,…>>` 強持有      | `theme.ts:70` `WeakRef` (#644)                               | 已修正：`WeakMap<Theme, Map<WeakRef<Entity>,…>>` + `refOf`（`theme.ts:77`）+ 走訪時掃除（`theme.ts:129`）  |
| `css()` 共用同一 `padding` 物件而 `var()` 追蹤鍵在字面覆寫時被刪除 | `theme.ts:195` `keys.delete(key)` (GH-451，`v2.test.ts:181`) | 已修正：逐鍵 `Map<string,unknown>` 而非逐物件追蹤                                                          |
| `fontSize` 裸數字 token `bad-size: 12` 靜默組合為 `'700 12 Inter'` | `apply.ts:221` 裸數字守衛                                    | 已修正：`fontSize resolved to the bare number 12 — use a unit-bearing token`（`v2.test.ts:244`）           |
| `SIZE_SLOT_RE` 在 `\d+\.?\d*` 相鄰數字類別上的多項式 ReDoS         | `font.ts:26` 分支安全的 `SIZE_SLOT_RE`（`v2.test.ts:258`）   | 已修正：無相鄰同類別量詞，較長單位替代優先（`font.ts:22`）                                                 |
| `Text` 自遷移樣式表硬編碼 `textAlign: 'center'`                    | `styles.test.ts:87`                                          | 依設計：拋出 — `center`/`right` 無實體後端；遷移至 `left`+布局或 `justify`                                 |

## 11. 交付樣式變更前的檢查清單

1. **永不對巢狀形態取別名。** `Style` 最多攜帶一個巢狀物件（`types.ts:34` 處的 `padding: {x,y}`）；`css()` 必須複製它（`css.ts:23`），任何新巢狀鍵需相同處理否則變體合併洩漏。
2. **在執行期而非僅型別中強制單位。** `` fontSize: `${number}px` ``（`types.ts:46`）在編譯時捕捉 `16`，但 token 與 JS 呼叫者繞過它 — `apply.ts:221` / `232` 仍須拋出。
3. **保持 token 解析原子性。** `setTheme` 的演練（`theme.ts:124` `resolveStyle(style, next)`）必須在 `current.theme` 移動前涵蓋每個被追蹤鍵；在切換時驗證失敗的值絕不可半重樣式場景（`v2.test.ts:137` GH-485）。
4. **弱持有實體。** `varPairs` 必須保持 `WeakMap<Theme, Map<WeakRef<Entity>,…>>`（`theme.ts:70`）並掃除 `ref.deref() === undefined`（`theme.ts:129`）— `Entity.destroy()` 因 `core` 對 `styles` 無依賴而無法呼叫 `untrackVarStyles`（`theme.ts:65`）。
5. **逐鍵而非逐物件追蹤。** `trackVarKeys`（`theme.ts:175`）將*目前*樣式的鍵與儲存的 `Map<string,unknown>` 比較 — 同一鍵上的後續字面量必須 `delete` 它（`theme.ts:195`）否則 var 重播覆蓋它（`v2.test.ts:181` GH-451）。
6. **保持字型解析器與 `isCssLength` 守衛同步。** `SIZE_SLOT_RE`（`font.ts:26`）與 `isCssLength`（`apply.ts:23`）共用相同 `px` 字串形態；分歧使一者接受另一者拒絕者並組合為 Canvas2D 靜默丟棄的無效簡寫。
7. **對未知形式大聲失敗。** 任何新 `var()` 語法、新 CSS 鍵或僅容器屬性必須以屬性名稱與值拋出（`apply.ts:29` `JSON.stringify(value)`）— GH-608 教條：靜默為此套件對未識別形式唯一絕不可做之事。

---

*Series: 00 Overview → 01 Selection → 02 Text+Layout → 03 Projection+Virtualization → 04 Streaming Markdown → 05 TeX → 06 VMT Runtime → 07 Renderer → 08 WASM G1/G2/G3 → 09 Three/XR → 10 Video Export → 11 Graph Layout → 12 DevTools → **13 Styles & Theming** → 99 Synthesis.*
