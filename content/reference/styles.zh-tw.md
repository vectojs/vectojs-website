+++
title = "樣式 (@vectojs/styles)"
description = "基於數值 Virtual Math Tree 的 CSS 屬性名稱樣式物件：權杖主題（var() + setTheme）、css() 合併與字型組成 — 沒有剖析器、沒有層疊、沒有選擇器。"
weight = 55
+++

# `@vectojs/styles`

基於數值 Virtual Math Tree 的宣告式樣式層：使用**CSS 屬性名稱與 CSS 風格的值**撰寫樣式，`applyStyle` 會將它們對應到 entity 欄位上。重點在於遷移的便利性 — 讀起來像 CSS 的程式碼仍會落在 VectoJS 開發者手動設定的相同、型別化數值欄位上，而 canvas 仍是唯一的真實來源。

這**不是** CSS 引擎：沒有剖析器、沒有選擇器、沒有層疊、沒有繼承，也沒有全域樣式註冊表。樣式物件是普通的、型別化的、可選鍵的物件；權杖參考（`var(--key)`）會解析到一個扁平的主題，而切換主題會重新套用每個受追蹤的樣式。

```ts
import { style, css, applyStyle, tokens, setTheme, PRESET_THEMES } from '@vectojs/styles';

setTheme(tokens(PRESET_THEMES.dark));

const primary = css(
  style({
    backgroundColor: 'var(--accent)',
    color: '#fff',
    borderRadius: 'var(--radius-md)',
  }),
  {
    padding: 12,
    fontFamily: 'Inter',
  },
);
const muted = css(primary, { backgroundColor: 'var(--muted)' });

applyStyle(button, muted);
applyStyle(stack, style({ flexDirection: 'row', gap: '8px', alignItems: 'center' }));
```

## 匯出

- `style()` — 識別工廠，將物件字面值型別化為 `Style`。
- `css(...styles)` — 合併工廠（0.2.0）：後面的來源優先；`null`、`undefined`、`false` 來源會被略過，因此變體可以是條件式的。不會修改輸入——按軸的 `padding` 物件也會被複製，因此「全新普通物件」契約對巢狀值同樣成立。
- `applyStyle(entity, style)` — 寫入對應的欄位，回傳 `{ applied: string[] }`（實際寫入的 CSS 鍵，依物件順序）。
- `tokens(set)` — 從扁平的權杖集合建立 `Theme`。
- `setTheme(theme)` / `getTheme()` — 切換／讀取現用主題；參考 `var()` 的樣式會在切換時重新解析並重新套用。
- `untrackVarStyles(entity)` — 立即丟棄該實體的 `var()` 追蹤（0.3.x）；在銷毀清理中呼叫它以確定性地釋放，而不是等待下一次主題切換時的弱引用清掃。
- `PRESET_THEMES` — `light`（預設主題）、`dark`、`github`、`dracula` 權杖集合。
- `Style` — 樣式介面。所有鍵皆為可選。
- `composeFont(current, changes)` — 重新組成 CSS font 簡寫字串（參見[字型組成](#zi-xing-zu-cheng)）。
- `ThemeTokenSet` — `Record<string, string | number>`；`tokens()` 集合與 `Theme.tokens` 的型別。
- `Theme` — `{ readonly tokens: ThemeTokenSet }`，由 `tokens()` 建立。

此套件僅依賴 `@vectojs/core`。

## 鍵對應

| CSS 鍵                                   | Entity 欄位                          | 值                                                                          |
| ---------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| `x`, `y`, `width`, `height`              | same                                 | 裸數字或 `px` 字串                                                          |
| `opacity`, `scaleX`, `scaleY`            | same                                 | 數字                                                                        |
| `rotation`                               | same                                 | 數字，**弧度**（VectoJS 慣例，非 CSS 度數）                                 |
| `backgroundColor`                        | `bg`                                 | 色彩字串，直接傳遞                                                          |
| `color`, `borderColor`                   | same                                 | 色彩字串，直接傳遞                                                          |
| `borderRadius`                           | `radius`                             | 裸數字或 `px` 字串                                                          |
| `padding`                                | `padding` (or `paddingX`/`paddingY`) | 單一值，或 `{ x, y }` 逐軸（0.2.0）                                         |
| `font`                                   | `font`                               | CSS font 簡寫字串，例如 `"16px Inter"`                                      |
| `fontFamily` / `fontSize` / `fontWeight` | composed into `font`                 | 0.2.0：取代片段，其餘保留                                                   |
| `lineHeight`                             | `lineHeight`                         | 裸數字或 `px` 字串                                                          |
| `textAlign`                              | `textAlign`                          | 僅 `"left"` \| `"justify"`                                                  |
| `display`                                | — (validation only)                  | `"flex"`；斷言該 entity 是容器                                              |
| `flexDirection`                          | `direction`                          | `"row"` → `"horizontal"`、`"column"` → `"vertical"`                         |
| `gap`                                    | `gap`                                | 裸數字或 `px` 字串                                                          |
| `alignItems`                             | `align`                              | `"flex-start"` → `"start"`、`"center"` → `"center"`、`"flex-end"` → `"end"` |
| `flexWrap`                               | `wrap`                               | `"wrap"` → `true`、`"nowrap"` → `false`                                     |

## 權杖與主題

主題是扁平的權杖集合；鍵以不含 `--` 前綴的方式撰寫，並以 `var(--<key>)` 方式參考，鏡像 CSS 自訂屬性：

```ts
const theme = tokens({ accent: '#2563eb', 'radius-md': 8, gap: 10 });
setTheme(theme);
applyStyle(btn, style({ backgroundColor: 'var(--accent)', borderRadius: 'var(--radius-md)' }));
```

- `var(--key)` 會在數值轉換器執行前，針對現用主題的權杖解析，因此權杖可能保存色彩、px 字串或裸數字。整串參考（`backgroundColor: "var(--accent)"`）精確解析；嵌入在更大字串中的參考（`color: "rgba(var(--rgb), 0.4)"`）以替換方式解析，權杖參考權杖的鏈會藉助基於路徑的環偵測傳遞解析，且被參考的鍵會被追蹤，以便主題切換時重新解析組合值。未知的權杖會連同其名稱擲出例外；環也是如此，並附上違規鏈。
- `var(--token, fallback)` **沒有回退解析**，也絕不會靜默通過：無論該形式從何處抵達（直接值、嵌在複合字串中、padding 軸內或透過權杖鏈），都會被偵測到並擲出指明違規值的 `TypeError`。偵測器容忍 `var(` 之後的空白，因此 `var( --accent, #fff)` 同樣會被捕獲。靜默正是缺陷所在：未解析的字串曾會抵達映射欄位，而 Canvas2D 悄悄保留了上一次的繪製。
- 參考權杖的樣式會按主題被**追蹤**（被銷毀的實體不再被保留——追蹤以弱引用持有它們，並提供 `untrackVarStyles(entity)` 用於銷毀清理中的即時釋放），並在 `setTheme(next)` 切換時重新套用，因此主題交換會在呼叫端零修改的情況下重新著色整個場景。不含 `var()` 的樣式不會被追蹤。若權杖值在切換時未通過對應屬性的驗證（例如 `--radius-md: "50%"`），`setTheme` 會擲出例外。
- 預設主題是 `light` 預設集；`tokens()` 集合是普通物件，因此呼叫端主題是展開：`tokens({ ...PRESET_THEMES.dark, accent: "#f00" })`。

## 字型組成 {#zi-xing-zu-cheng}

`fontFamily`、`fontSize` 與 `fontWeight` 不是獨立的欄位 — ui 元件將整個字型作為單一簡寫字串攜帶。這些鍵會剖析 entity 目前的 `font`，僅取代存在的片段，並寫入重新組成的字串：

```ts
applyStyle(text, style({ font: '700 16px Inter' })); // entity font
applyStyle(text, style({ fontSize: '20px' })); // -> "700 20px Inter"
applyStyle(text, style({ fontFamily: 'ui-monospace' })); // -> "700 20px ui-monospace"
```

具有空字型的 entity 從 `16px` 開始；缺少 family 時會回退到 `sans-serif`。在沒有 `font` 欄位的 entity 上，這些鍵會被略過。

底層的字串輔助工具已匯出以供直接使用：

```ts
composeFont(
  current: string,                                       // e.g. "700 16px Inter"
  changes: { fontFamily?: string; fontSize?: string; fontWeight?: string },
): string                                               // -> "700 20px ui-monospace"
```

`composeFont` 剖析 CSS font 簡寫，僅取代 `changes` 中存在的片段，並重新組成；缺少的大小／family 會以 `16px` / `sans-serif` 填補，因此結果永遠是有效的 canvas font 字串。

剖析器理解完整的 canvas 前綴語法（`[style || variant || weight]? size[/line-height]? family`），因此 `italic 700 16px Georgia` 和 `16px/24px Inter` 都能正確組成，且後續片段變更不會重新組成出無效字串——無法安放的大小樣片段會明確失敗而不是悄悄通過。在 weight 槽位取得第一個 `normal` 之後（這是有文件記載的相容選擇），後續的 `normal` 依次填充 style 和 variant，因此合法的 CSS 形式 `normal normal 16px Inter` 會被剖析而不是擲出例外。`fontSize` 在執行時強制其 `${number}px` 形狀：經由權杖或 JS 呼叫者抵達的非 px 單位會擲出例外，而不是悄悄組成一個 Canvas2D 會丟棄的簡寫。

## 語意

- **跨元件重用。** 欄位不存在於 entity 上的鍵會被靜默略過，因此單一樣式物件可在 `Button`、`Text` 與 `Stack` 之間共享 — 每個各取所需。`applied` 會精確回報寫入了什麼。
- **類別錯誤的明確失敗。** 在不是容器的 entity 上的版面鍵（`display`、`flexDirection`、`gap`、`alignItems`、`flexWrap`）會擲出 `TypeError` — 將 `Text` 樣式化為 flex 容器是錯誤，而非無操作。未知的 CSS 鍵也會擲出例外。
- **無效值的明確失敗。** `"50%"`、`"8em"` 或 `textAlign: "center"` 會以屬性名稱擲出例外。VectoJS 文字僅實作 `left` 與 `justify`（`Text`、`RichText`、`TextEntity` 與版面引擎都共享 `"left" | "justify"`），因此無法支援 `center`/`right`，且不得靜默失敗。數值為裸數字（px）或 `px` 字串；`%`、`em`、`rem` 會被拒絕。
- **髒訊號。** 當至少寫入一個鍵時，`applyStyle` 會呼叫一次 `entity.scene.markDirty()`，因此 `onDemand` 場景會重新繪製。

## 刻意不在範圍內的部分（v0.2.0）

- `transform`（CSS transform 字串需要剖析）、`justifyContent`（沒有底層欄位 — Stack 子項透過 `align` 對齊）、`border` 物件（尚無 canvas 邊框渲染 — 只有 `borderColor`）、`%`/`em`/`rem` 長度、偽狀態（`:hover`）、媒體查詢、選擇器與層疊 — 這些都不存在於 entity 欄位中，而新增它們會重新引入數值 VMT 存在的目的就是要移除的那套機制。

## 常見問題（FAQ）

**為什麼 `applyStyle` 會在 `textAlign: "center"` 上擲出例外？** 因為 `textAlign` 在整個堆疊中都是 `"left" | "justify"` — ui `Text`/`RichText`、core `TextEntity` 與版面引擎（`LayoutEngine.textAlign`）。沒有任何 entity 能支援 `center`/`right`，因此擲出例外可防止遷移中的樣式表靜默地渲染為靠左對齊的文字。

**`rotation` 是度數嗎？** 不 — 是弧度，與所有其他 VectoJS 旋轉介面一致。CSS `rotate(30deg)` 遷移必須轉換為 `Math.PI / 6`。

**`padding: { x, y }` 會調整 Button 的大小嗎？** 不會。Box 元件在它們的建構函式中自我設定大小，因此之後設定的逐軸 padding 會由即時檢查 `paddingX`/`paddingY` 的消費者（例如 Card 版面）讀取，而非由內在大小計算。請在元件的選項中設定 `padding` 以用於建構時的大小設定。

**套用樣式後如何切換主題？** 套用參考 `var(--key)` 權杖的樣式，然後呼叫 `setTheme(tokens({ ... }))` — 每個受追蹤的樣式都會針對新權杖重新解析並重新繪製。具有字面值的樣式不會被更動。
