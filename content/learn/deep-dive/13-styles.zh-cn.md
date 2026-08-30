---
title: '13 — 样式与主题 — 数值 VMT 上的 CSS 对等'
description: '为何 VectoJS 样式位于 Virtual Math Tree、CSS 属性名对象如何映射到数值实体字段，以及使其像 CSS 却非 CSS 的每项机制——token 与 var() 解析、css() 合并、字体组合、按轴内边距、原子主题切换，以及让数值树保持诚实的迁移陷阱。'
order: 33
---

# 13 — 样式与主题 — 数值 VMT 上的 CSS 对等

> VectoJS 没有样式表、没有层叠、没有浏览器。Virtual Math Tree 存储数字——`x`、`width`、`bg`、`font`——而非 CSS 字符串。`@vectojs/styles` 是让你*像写 CSS 那样*书写这些数字却仍以数字落地的桥梁：一个类型化对象、一张固定查找表，以及在切换时重解析的扁平 token 主题。

- **你将学到**：为何样式位于数值 VMT、`Style` 如何映射到实体字段、`var(--token)` token 如何解析（锚定、嵌入、传递，带环检测）、`css()` 如何合并与 `style()` 如何定型、`composeFont` 如何保持 canvas 简写有效、按轴 `padding: {x,y}` 如何扇出、`setTheme` 如何经 `WeakRef` 跟踪的对原子交换，以及迁移 CSS 习惯可能大声失败而非静默的每种方式。
- **你不会学到**：文本如何塑形或布局（boss 02）、场景如何变脏与渲染（boss 06/07），或 Markdown 如何为代码块定主题（`packages/markdown/src/markdown-presets.ts:281` `resolvePresetTheme`——独立的 token 系统）。本文档是覆盖于数值树之上的薄、类型化、CSS 命名的外皮。

## 1. 为何样式位于 VMT——以及为何不是 CSS

VMT 将场景存为数字。`Entity.x: number`（`packages/core/src/tree/Entity.ts:1`）、`UIComponent.paddingX: number`（`packages/ui/src/UIComponent.ts:28`）、`Text.font: string`（`packages/ui/src/Text.ts:111`）虽为字符串却仍是*有效的 canvas 字体简写*——而非样式表规则。没有可继承的 DOM 元素、没有可解析的层叠、没有可匹配的选择器。浏览器样式引擎按设计缺席：VectoJS 自行拥有绘制、命中测试与投影，因此也自行拥有尺寸。

`@vectojs/styles` 顺应而非对抗该约束：

- `Style` 为普通对象（`packages/styles/src/types.ts:16`），键**可选**——`x?: CssLength`（`types.ts:18`）、`backgroundColor?: string`（`types.ts:28`）、`fontSize?:`${number}px``（`types.ts:46`）、`display?: 'flex'`（`types.ts:62`）。无类、无代理、无注册表。
- `applyStyle(entity, style)`（`packages/styles/src/apply.ts:294`）是**固定查找表** `RULES: Record<string, Rule>`（`apply.ts:54`），将每个 CSS 命名的键转为一次数值/字符串/布尔写入。每个键均被枚举；未知键抛出（`apply.ts:258`）。无解析、无继承、无 `%`。
- Token 为扁平 `Record<string, string|number>`（`packages/styles/src/theme.ts:38` `ThemeTokenSet`），在值中以 `var(--key)` 引用并对活动主题做字符串替换解析——而非经 CSS 引擎。
- 该包仅依赖 `@vectojs/core`（`packages/styles/package.json:14`）且零运行时依赖；`@vectojs/ui` 对 `@vectojs/styles` 零依赖（依赖图为 `core → styles`，接入为可选）。

回报是迁移舒适度——`backgroundColor: 'var(--accent)'` 读来像 CSS 却仍落在 `entity.bg: string`（`apply.ts:63`）——而 VMT 保持单一真相来源。代价是 CSS 能做而无数值后备字段的任何事*都不存在*且必须大声失败（见 §10）。

## 2. `Style` 与 Rule 表——每个键即契约

`CssLength = number |`${number}px``（`packages/styles/src/types.ts:2`）——裸数字为 px，`px` 字符串解析为数字。区分仅对 `fontSize` 重要，其类型收窄为 `` `${number}px` ``（`types.ts:46`），因此裸`16` 为类型错误——组合后的字体简写必须保持有效。

`Style`（`types.ts:16`）按驱动对象分组键：

<!-- markdownlint-disable MD060 -->

| 分组     | 键                                                                                        | 后备字段                                                           | 转换器                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 几何     | `x,y,width,height`                                                                        | 相同（`apply.ts:55`）                                              | `isCssLength`（`apply.ts:23`）——数字或 `/^[+-]?(\d+\.?\d*                                \| \.\d+)px$/` |
| 变换     | `scaleX,scaleY,rotation,opacity`                                                          | 相同（`apply.ts:59`）                                              | `isFiniteNumber`（`apply.ts:33`）；`rotation` 为**弧度**（`types.ts:25`）而非 CSS 度数                  |
| 盒模型   | `backgroundColor→bg`、`color`、`borderColor`、`borderRadius→radius`、`padding`            | `apply.ts:63`                                                      | `isString` / `isCssLength`                                                                              |
| 文本     | `font`、`lineHeight`、`textAlign`                                                         | 相同 / `textAlign` 经 `oneOf(['left','justify'])`（`apply.ts:70`） | `types.ts:55`——`center`/`right` 被大声拒绝                                                              |
| 布局     | `display→null`、`flexDirection→direction`、`gap→gap`、`alignItems→align`、`flexWrap→wrap` | `apply.ts:71`                                                      | `oneOf` + 枚举重映射（`row→horizontal`、`flex-start→start`、`wrap→true`）                               |
| 字体分段 | `fontFamily,fontSize,fontWeight`                                                          | 组合进 `font`（`apply.ts:101` `FONT_KEYS`）                        | `composeFont`（`packages/styles/src/font.ts:113`）                                                      |

关于这些转换器的三条规则：

1. **跨组件跳过为静默。** `write()` 检查 `field in entity`（`apply.ts:186`）；`Text` 无 `bg`，`Button` 无 `textAlign`——该键被跳过且不在 `AppliedStyle.applied: string[]`（`types.ts:71`）中出现。一个样式对象可跨组件共享。
2. **类别错误抛出。** 非容器上的布局键（`!('direction' in entity)` 于 `apply.ts:194` 或 `field===null && !('direction' in entity)` 于 `apply.ts:194`）为 `TypeError` 并命名属性与 `entity.constructor.name`（`apply.ts:189`）。将 `Text` 样式化为 `display: flex` 是错误而非无操作。
3. **`display` 不写字段。** `field: null`（`apply.ts:72`）——它校验实体*是*容器且值为 `'flex'`（`apply.ts:74`），随后在不触碰实体的情况下计入 `applied`。容器本身*已是* flex；该键存在是为了让误输的容器样式失败。

校验严格：`isCssLength` 拒绝 `'50%'`、`'8em'`（`packages/styles/test/styles.test.ts:35`），`oneOf` 拒绝 `stretch`/`row-reverse`/`block`（`styles.test.ts:150`），未知键抛出 `unknown style property 'position'`（`styles.test.ts:159`）。

## 3. `applyStyle` 管线——先解析，再写入

```ts
export function applyStyle(entity: Entity, s: Style): AppliedStyle {
  const { style: resolved } = resolveStyle(s, getTheme()); // theme.ts:96 getTheme / apply.ts:162 resolveStyle
  const result = applyStyleResolved(entity, resolved); // apply.ts:180
  trackVarKeys(entity, s); // theme.ts:175 — 在当前主题下注册 var() 键
  return result;
}
```

`resolveStyle`（`apply.ts:162`）遍历样式对象，对每个值调用 `resolveValue(value, theme)`（`apply.ts:137`）——对 `padding: {x,y}`（`apply.ts:166`）有特殊分支，对每轴独立解析。`resolveValue` 有四条分支：

1. 非字符串 → 透传。
2. 锚定 `var(--key)`（`theme.ts:6` `VAR_RE = /^var\(--([\w-]+)\)$/`）→ `resolveToken(key, theme, seen)`（`apply.ts:112`），查找 `theme.tokens[key]` 并经 `resolveValue(token, theme, seen)` 传递递归。
3. 回退形式 `var(--key, …)`（`theme.ts:24` `HAS_VAR_FALLBACK_RE = /var\(\s*--[\w-]+\s*,/`）→ 抛出命名该值的 `TypeError`（`apply.ts:148`）。在嵌入路径*之前*检查，因此复合值亦被覆盖。
4. 任意位置的嵌入 `var(--key)`（`theme.ts:11` `HAS_VAR_RE = /var\(--([\w-]+)\)/`）→ 经 `VAR_REPLACE_RE = /var\(--([\w-]+)\)/g`（`apply.ts:105`）全局替换，对每次出现替换 `String(resolveToken(key,…))`（`apply.ts:156`）。

`applyStyleResolved`（`apply.ts:180`）为数值写入。它先处理两种特殊形状——`FONT_KEYS`（`apply.ts:207`）经 `composeFont`，`padding` 对象（`apply.ts:242`）通过写入 `paddingX`/`paddingY`（`apply.ts:248` `isCssLength(v, 'padding.x')`）——随后经 `write()`（`apply.ts:185`）遍历 `RULES` 处理其余。触及字体的样式设置 `fontTouched` 并在末尾重组一次（`apply.ts:265` `composeFont(current, fontChanges)`）。当 `applied.length > 0` 时，`entity.scene?.markDirty()` 触发一次（`apply.ts:271`），恪守 `onDemand` 契约。无场景 → 无脏调用（`styles.test.ts:182`）。

返回值为 `{ applied: string[] }`（`types.ts:71`）——实际写入的 CSS 属性名，按对象顺序——因此调用方可基于 `applied.includes('padding')` 分支而无需重检实体。

## 4. Token 系统——`tokens()`、`PRESET_THEMES` 与 `var()` 语义

### 4.1 创建主题

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

按设计扁平——如 `MarkdownTheme`——一次展开，无深合并，无嵌套（`theme.ts:35`）。`PRESET_THEMES`（`packages/styles/src/presets.ts:12`）提供 `light | dark | github | dracula`（`presets.ts:12`），各自带 `accent/surface/surfaceAlt/text/muted/border/radius-sm/md/lg/font/fontFamily/fontSize/fontWeight/fontMono`（`presets.ts:13`）。调用方主题为展开：`tokens({ ...PRESET_THEMES.dark, accent: '#f00' })`（`vectojs-docs/content/reference/styles.md:136`）。键存储时不带 `--`；引用时写 `var(--key)`（`theme.ts:28`）。

### 4.2 锚定、嵌入与传递解析

- **锚定**——`backgroundColor: 'var(--accent)'` 直接解析 token 值（`apply.ts:140` 处 `resolveValue` 提前返回），保留其类型：数值 token `gap: 10` 保持 `number` 并无需字符串化即流入 `isCssLength`。整串同一性使 `gap: 'var(--gap)'` 在 `gap: 12` 时产生 `e.gap === 12` 的数字（`packages/styles/test/v2.test.ts:70`）。
- **嵌入**——`'rgba(var(--rgb), 0.4)'` 在 `rgb: '255, 0, 0'` 时经 `String(resolveToken(...))` 对每次出现替换（`apply.ts:157`），得到 `'rgba(255, 0, 0, 0.4)'`（`packages/styles/test/issue-608.test.ts:39`）。同一 token 的两次出现共享一次解析且不触发环检测（`issue-608.test.ts:99` 带两个 `var(--rgb)` 的 `shadow`）。
- **传递**——token `alias: 'var(--accent)'` 在 `accent: '#123456'` 时将 `var(--alias)` 解析为 `var(--accent)` 再到 `'#123456'`（`packages/styles/test/v2.test.ts:353`）。链经 `resolveToken` 内的 `resolveValue(token, theme, seen)` 跟随（`apply.ts:125`），因此复合 token `surface: 'rgba(var(--rgb), 1)'` 在 `rgb: '17, 34, 51'` 时以 `var(--surface)` 解引用得到 `'rgba(17, 34, 51, 1)'`（`issue-608.test.ts:78`）。

`resolveToken` 携带 `seen: Set<string>`（`apply.ts:112`）——当前解析路径上的键。`seen.has(key)` 意味着环；抛出 `circular var() reference: var(--a) → var(--b) → var(--a)`（`apply.ts:121`）。`finally` 中 `seen.delete(key)`（`apply.ts:127`）使对同一 token 的兄弟引用独立——否则 `rgba(var(--rgb), var(--rgb))` 会在第二次出现时误报。

### 4.3 何种情况抛出，以及为何静默永不正确

| 条件                                | 位置                                                                | 消息                                                                              | 为何必须抛出                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 未知 token                          | `resolveToken` `apply.ts:116`                                       | `unknown token 'var(--nope)'`                                                     | Canvas2D 在字段收到垃圾值时静默保留此前绘制（`v2.test.ts:253`、`issue-608.test.ts:16` 锚定缺失）                                                                                                         |
| 环形链                              | `resolveToken` `apply.ts:121`                                       | `circular var() reference: … → …`                                                 | 无限替换会挂起或输出字面 `var(--…)`                                                                                                                                                                      |
| `var(--k, fallback)` — 任意到达路径 | `resolveValue` `apply.ts:148` + `HAS_VAR_FALLBACK_RE` `theme.ts:24` | `var() fallbacks are not supported — '…' would reach the entity field unresolved` | `VAR_RE` 与 `HAS_VAR_RE` 均不匹配它（`)` 必须跟在键后），因此无此守卫时原始字符串会到达映射字段，而 Canvas2D 静默保留旧值且该键在主题切换时未被追踪（#645，`packages/styles/test/issue-645.test.ts:40`） |
| `fontSize` 裸数字或非 px            | `applyStyleResolved` `apply.ts:221` + `apply.ts:232`                | `fontSize resolved to the bare number …` / `expects a px string`                  | 裸 `16` 组合为 `'700 16 Inter'`——Canvas2D 静默丢弃（`v2.test.ts:254`）                                                                                                                                   |
| `fontFamily` 看似简写               | `applyStyleResolved` `apply.ts:214`                                 | `looks like a font shorthand — reference the 'font' token`                        | 泄漏到 `fontFamily` 的 `'16px Inter'` 会丢弃尺寸/字重                                                                                                                                                    |

回退检测器容忍 `var(` 后的空白（`HAS_VAR_FALLBACK_RE` 于 `theme.ts:24` 的 `/var\(\s*--/`），因此 `var( --accent, #fff)` 亦被捕获——多余空格常见，#753 前缺失它的检测器让值透传（`issue-645.test.ts:78`）。

类型层将 `fontSize` 收窄为 `` `${number}px` ``（`types.ts:46`）；JS 调用方与 token 值绕过类型，因此运行时亦强制——来自 token 的 `'2em'` 仍抛出（`issue-608.test.ts:141`）。

## 5. `css()` 合并与 `style()` 定型——变体模式

```ts
export function css<T extends Style>(...styles: Array<T | null | undefined | false>): T {
  // css.ts:17
  const merged: Record<string, unknown> = {};
  for (const s of styles) {
    if (!s) continue; // css.ts:20
    for (const [key, value] of Object.entries(s)) {
      merged[key] =
        key === 'padding' && typeof value === 'object' && value !== null
          ? { ...(value as object) } // css.ts:23 — 按轴内边距深拷贝
          : value;
    }
  }
  return merged as T;
}
export function style<T extends Style>(s: T): T {
  return s;
} // css.ts:32
```

`style()` 为恒等工厂——将字面量定型为 `Style`，原样返回（`packages/styles/test/styles.test.ts:18`）。`css()` 为变体合并：后者胜出，`null`/`undefined`/`false` 被跳过因此条件变体为 `css(base, isMuted && muted)`（`css.ts:11`），输入不被变更（`v2.test.ts:49`），且唯一嵌套形状——`padding: { x, y }`（`types.ts:34`）——被拷贝（`css.ts:23`）因此变更 `merged.padding.x` 永不触及源变体（GH-608，`issue-608.test.ts:153`）。整体替换 `padding` 亦被拷贝——`merged.padding !== override.padding`（`issue-608.test.ts:163`）。

## 6. 主题切换——原子、已追踪、弱持有

### 6.1 记账

```ts
const current = { theme: DEFAULT_THEME }; // theme.ts:53
const varPairs = new WeakMap<Theme, Map<WeakRef<Entity>, Map<string, unknown>>>(); // theme.ts:70
const entityRefs = new WeakMap<Entity, WeakRef<Entity>>(); // theme.ts:75
```

`varPairs` 以 `Theme` 为键（被丢弃的主题经 `WeakMap` 整体回收），值映射 `WeakRef<Entity>` → `Map<string, unknown>` 的已追踪样式*键*到其引用的 `var()` 表达式——而非整个样式对象（`theme.ts:59`）。同一实体上的多个 `var()` 样式累积；同一键上后续字面量替换引用而非在下次切换时被覆盖（`theme.ts:61`，`packages/styles/test/v2.test.ts:181`）。

实体经 `WeakRef` 而非强持有（`theme.ts:70`）：`Entity.destroy()` 无回到 styles 的钩子（`theme.ts:65`），因此强内部映射会在主题生命周期内保留每个已样式化实体，且 `setTheme` 会持续重解析已销毁实体（#644，`packages/styles/test/issue-644.test.ts:49`）。失效引用在遍历中清扫；`untrackVarStyles(entity)`（`theme.ts:160`）是知晓实体何时消失的框架的积极路径——幂等，对从未追踪的实体安全（`issue-644.test.ts:93`）。

`entityRefs: WeakMap<Entity, WeakRef<Entity>>`（`theme.ts:75`）为每实体提供稳定 `WeakRef`（`theme.ts:77` `refOf`），因此同一实体的重复样式命中同一追踪条目而非孤立不可达副本。引用对象本身被弱持有并随实体消亡。

`trackVarKeys(entity, style)`（`theme.ts:175`）由 `applyStyle` 以*原始*样式 `s`（而非解析后）调用，因此字面量覆盖语义得以保留（`apply.ts:300`）：

- `typeof value === 'string' && HAS_VAR_RE.test(value)` → `keys.set(key, value)`（`theme.ts:181`）——锚定或嵌入 `var()` 均追踪。
- 任一轴带 `HAS_VAR_RE` 的 `padding` 对象 → 追踪整键（`theme.ts:185`）。
- 否则 → `keys.delete(key)`（`theme.ts:195`）——字面量由调用方写入且不得重放。`keys.size === 0` 剪枝实体条目（`theme.ts:197`）。

### 6.2 `setTheme(next)`——先试运行，再提交

```ts
export function setTheme(next: Theme): void {
  if (next === current.theme) return; // theme.ts:117 — 同一性，而非深相等
  const previous = current.theme;
  const pairs = varPairs.get(previous);
  const resolved = new Map<WeakRef<Entity>, Style>();
  if (pairs) {
    for (const [ref, keys] of pairs) {
      const entity = ref.deref();
      if (entity === undefined) {
        pairs.delete(ref);
        continue;
      } // 清扫已回收（#644） theme.ts:129
      const style: Style = {};
      for (const [key, expr] of keys) (style as Record<string, unknown>)[key] = expr;
      resolved.set(ref, resolveStyle(style, next).style); // 对 next 试运行——仍在 previous 时抛出
    }
  }
  current.theme = next; // theme.ts:139 — 仅在每次试运行成功后
  if (pairs) {
    const nextPairs = pairsOf(next);
    for (const [ref, style] of resolved) {
      const entity = ref.deref();
      if (entity === undefined) continue; // 在两遍之间被回收 theme.ts:144
      applyStyleResolved(entity, style); // 不重追踪——已在下方迁移
      nextPairs.set(ref, pairs.get(ref)!); // 迁移引用到下一主题 theme.ts:146
    }
    varPairs.delete(previous); // theme.ts:148
  }
}
```

原子性保证（`theme.ts:107`）：每个已追踪样式在 `current.theme` 移动*之前*对 `next` 解析。缺失 token 或无效值（如 `v2.test.ts:126` 处 `--gap: '50%'`、`v2.test.ts:139` GH-485 处缺失 `--radius-md`）在场景、活动主题与对记账仍完全一致于此前主题时抛出——永不半重样式。由 GH-485 测试验证：缺失 `radius-md` 的 `partial` 主题抛出，`getTheme() === themeA` 仍成立，两实体均未重样式，后续有效切换仍重解析每对（`v2.test.ts:137`）。

`getTheme(): Theme`（`theme.ts:96`）读取 `current.theme`；`untrackVarStyles`（`theme.ts:160`）丢弃活动主题下实体的条目，使下次 `setTheme` 停止重放它。

## 7. 字体组合与按轴内边距——两处非平凡写入

### 7.1 `composeFont`——对简写字符串的手术

UI 组件将整字体承载为单一 `font: string`（`packages/ui/src/UIComponent.ts:1` 经 `Entity`，`packages/ui/src/Text.ts:111` `font: string`）。三个 CSS 命名的键非独立字段——`applyStyleResolved` 解析当前简写，替换样式所改段，并写入重组字符串（`apply.ts:207` `FONT_KEYS` 循环，`apply.ts:267` `composeFont(current, fontChanges)`）。

`composeFont(current, changes)`（`packages/styles/src/font.ts:113`）委托给 `parse(font)`（`font.ts:73`），其按空白分词（`font.ts:74` `split(/\s+/).filter(Boolean)`），消费前导 `style`/`variant`/`weight` 关键字（`font.ts:40` `parsePrefixes` 带 `font.ts:18` 处 `WEIGHT_RE = /^(normal|bold|bolder|lighter|[1-9]00)$/`、`STYLE_RE` `:19`、`VARIANT_RE` `:20`），在尺寸槽匹配 `SIZE_SLOT_RE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:rem|em|px|pt))(?:\/([^\s/]+))?$/`（`font.ts:26`），并将剩余视为 `family`。重组连接 `[style, variant, weight, size[/lineHeight], family]`（`font.ts:103`）。

为何重要：

- 前缀文法：`italic 700 16px Georgia` 或 `16px/24px Inter` 曾将尺寸周围一切坍缩进 family（`font.ts:14`），因此后续段变更重组出 Canvas2D 静默丢弃的无效字符串。现在 `italic 700 16px Georgia` 上的 `fontSize: '20px'` 得到 `italic 700 20px Georgia`（`issue-608.test.ts:107`）并保留 `16px/24px` 行高（`issue-608.test.ts:112`）。
- `normal` 歧义：`font: normal normal 16px Inter` 为有效 CSS；首个 `normal` 填充 `weight`，后续填充 `style` 再 `variant`（`font.ts:48`），而非落入尺寸槽并抛出。
- 大声失败：尺寸前的 `ultra-condensed 700 16px serif` 抛出并命名违规段（`issue-608.test.ts:124`）。无法安置的类尺寸段在 `font.ts:91`（`unrecognized segment '…' before the font size`）失败，而非埋入 family。
- 缺失尺寸/family 默认：`parts.size ??= '16px'` 与 `family ??= 'sans-serif'`（`font.ts:121`），因此空 `font: ''` 加 `fontFamily: 'Inter'` 得到 `'16px Inter'`（`v2.test.ts:239`），而裸样式前缀简写 `italic Georgia` 归一为 `italic 18px Georgia`（`issue-608.test.ts:129`）。
- 运行时单位强制：以 `12`（来自 token 的裸数字）到达的 `fontSize` 抛出 `unit-bearing token (e.g. '16px')`（`apply.ts:223`），`'2em'` 抛出 `fontSize expects a px string`（`apply.ts:233`），含数字的 `fontFamily` 触发 `looks like a font shorthand`（`apply.ts:214`，`v2.test.ts:272`）。`fontSize:`${number}px`` 类型（`types.ts:46`）捕获静态情况；运行时捕获 token 与 JS 调用方。

### 7.2 按轴内边距——`padding: { x, y }`

`padding?: CssLength | { x?: CssLength; y?: CssLength }`（`types.ts:34`）。盒组件（`Button`、`Link`、`Card`）承载统 `padding` 外加 `paddingX`/`paddingY`（`packages/ui/src/UIComponent.ts:21` / `:28`）：apply 层在存在时写入按轴字段（`apply.ts:248` 经 `isCssLength(v, 'padding.x')` 的 `paddingX`/`paddingY`），`padding` 保持不动，并整体报告 `applied: ['padding']`。在无按轴字段的实体上该样式被跳过（`v2.test.ts:329`）——构造时组件选项中的 `padding` 仍支配固有尺寸；构造后 `padding: {x,y}` 由检查 `paddingX`/`paddingY` 的消费者实时读取（如 `Card` 布局），而非重测盒子。

对象内的 token 引用按轴解析（`apply.ts:168` `resolveValue(pad.x, theme)`），`trackVarKeys` 在任一轴引用 token 时整体追踪该键（`theme.ts:189`）。无效轴值抛出并命名 `padding.x`（`v2.test.ts:336`）。

## 8. UI 与 core 如何消费它

无 UI 组件在运行时导入 `@vectojs/styles`——样式被*应用到*它们，而非*由*它们应用。组件暴露恰为 Rule 表写入目标的类型化数值字段：

- **几何**——每个 `Entity` 拥有 `x/y/width/height/opacity/scaleX/scaleY/rotation`——`Text` 与 `Button` 直接构建其上。
- **盒模型**——`UIComponent`（`packages/ui/src/UIComponent.ts:19`）拥有 `padding`、`paddingX`、`paddingY`；`Button`（`packages/ui/src/Button.ts:19`）拥有 `bg`（`backgroundColor` → `bg` 于 `apply.ts:63`）、`color`、`borderColor`、`radius`（`borderRadius`），外加用于标签居中的 `font`（`Button.ts:80` `measureText(label, font)`）。`Card`、`Link`、`Tabs` 遵循相同盒字段。
- **文本**——`Text`（`packages/ui/src/Text.ts:18` `TextOptions`）拥有 `font`、`color`、`lineHeight`、`textAlign`（`'left'|'justify'`——`Text.ts:42`）；其 `fontSize` 经 `fontSizePx(font)`（`packages/ui/src/measure.ts:27`）提取，后者以 `indexOf('px')` 扫描 `px` 记号而非带相邻数字类量词的正则（与 `font.ts:26` `SIZE_SLOT_RE` 相同的 ReDoS 卫生）。`familyOf(font)`（`measure.ts:57`）为按族度量分解同一简写。
- **布局**——`Stack`（`packages/ui/src/Stack.ts:10`）拥有 `direction→flexDirection`、`gap`、`align→alignItems`、`wrap→flexWrap`；`Flow` 为兄弟容器。仅此二者接受容器独有键——其他实体抛出（`packages/styles/test/styles.test.ts:144`）。

核心文本实体（`packages/core/src/text/MSDFTextEntity.ts:1` `MSDFTextEntity`、`SVGEntity`）在当前代码库中不经此包样式化——其 `font`/`maxWidth`/`lineHeight` 由 `MSDFFont` 与 `LayoutWorkerManager` 驱动（boss 02）。对 `MSDFTextEntity` 应用 `fontSize: '20px'` 仍会命中 `composeFont`，但今日尚无 `applyStyle` 调用点；本章的文本交互位于度量契约层（在何处绘制就在何处度量，`packages/text/src/measureContext.ts:87` `getSharedMeasuringContext`）。

`measure.ts` 亦拥有样式间接交互的字体度量失效：webfont 加载触发 `notifyFontMetricsChanged`（`measure.ts:111`），清空 LRU 并通知 `UIComponent.watchFontMetrics(handler)`（`UIComponent.ts:128`）订阅者——`Text` 与 `Button` 重测固有宽度并 `markDirty`。webfont 加载后无需重应用样式；实体自身的 `watchFontMetrics` 处理器保持几何正确。

## 9. 将 CSS 习惯迁移到 VMT——每个静默失败皆大声化

该包的信条（GH-608，`packages/styles/src/theme.ts:20`“GH-608 信条”）是未识别的 `var()` 形式永不得静默透传——该包唯一不能做的就是将 Canvas2D 静默忽略的字符串交给它。该信条扩展到无 VMT 对应的每个 CSS 习惯：

| CSS 习惯                                                                     | 发生什么                                                                                                                         | 为何                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `width: '50%'`、`gap: '8em'`、`radius: '50%'`                                | `TypeError: width expects a bare number or a px string`（`apply.ts:29`）                                                         | VMT 上仅存在 px 单位；`%`/`em`/`rem` 无后备字段（见 `vectojs-docs/content/reference/styles.md:193`）。百分比间隙需要 VMT 从未计算的包含块。                                                                                                        |
| `textAlign: 'center' \| 'right'`                                             | `TypeError: textAlign expects one of left \| justify`（`apply.ts:50`，`styles.test.ts:87`）                                      | `Text`/`RichText`/`TextEntity` 与布局引擎（`LayoutEngine.textAlign` 于 `packages/layout/src/LayoutEngine.ts:1`）仅实现 `left` 与 `justify`——`center`/`right` 不能被兑现且不得静默渲染为 `left`（`vectojs-docs/content/reference/styles.md:208`）。 |
| `var(--token, fallback)`                                                     | `TypeError: var() fallbacks are not supported — 'var(--accent, #fff)' would reach the entity field unresolved`（`apply.ts:149`） | 回退解析未实现；原始字符串会到达 Canvas2D 并静默保留此前绘制，且该键在 `setTheme` 时未被追踪（#645，`issue-645.test.ts:33`）。                                                                                                                     |
| `rotation: '30deg'` 或裸 `30`                                                | 仅以数字写入（`apply.ts:33` 处 `isFiniteNumber`）并解释为**弧度**（`types.ts:25`）。`rotate(30deg)` 必须为 `Math.PI/6`。         | VectoJS 的其他旋转表面均为弧度；样式层不引入第二单位。                                                                                                                                                                                             |
| `display: 'block'`、`flexDirection: 'row-reverse'`                           | `TypeError: display expects one of flex`（`apply.ts:50`，`styles.test.ts:152`）                                                  | 仅存在 `flex` 容器；`block`/`grid` 对*已是* flex 的 `Stack`/`Flow` 无意义。                                                                                                                                                                        |
| `Text` 上的 `gap` / `alignItems`                                             | `TypeError: 'gap' is a container-only property and Text is not a container`（`apply.ts:189`，`styles.test.ts:144`）              | 类别错误而非静默无操作。                                                                                                                                                                                                                           |
| `position: 'absolute'`、`transform`、`justifyContent`、`border: '1px solid'` | `unknown style property 'position'`（`apply.ts:258`，`styles.test.ts:159`）                                                      | 无可写字段；添加它们会重引入 VMT 旨在移除的层叠/外边距坍塌机制（`vectojs-docs/content/reference/styles.md:198`）。                                                                                                                                 |
| `fontSize: 16`（裸数字）或 `fontSize: '2em'`                                 | `bare number` / `expects a px string like '16px'`（`apply.ts:223` / `:233`）                                                     | Canvas 字体简写需要带单位尺寸；裸数字组合出 Canvas2D 静默丢弃的无效简写（`v2.test.ts:244`，`issue-608.test.ts:137`）。                                                                                                                             |
| `fontFamily: '16px Inter'`                                                   | `looks like a font shorthand — reference the 'font' token`（`apply.ts:214`，`v2.test.ts:272`）                                   | 防止完整简写泄漏到 family 槽并丢弃尺寸/字重。                                                                                                                                                                                                      |

共同点：每个抛出均命名 CSS 属性并回显值（`apply.ts:29` `JSON.stringify(value)`），因此对消息 grep 即可找到迁移调用点。通过校验的样式始终产生有效 canvas 字体简写与 VMT 可绘制的数字——不存在坏值静默绘制前一帧状态的路径。

## 10. 难点——有据可查

| 陷阱                                                                 | 位置                                                          | 状态                                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `rgba(var(--rgb), 0.4)` 以原始字符串写入——Canvas2D 静默保留旧填充    | `apply.ts:133`（GH-608），`issue-608.test.ts:37`              | 已修复：经 `VAR_REPLACE_RE` 替换嵌入 `var()`（`apply.ts:105`）                                             |
| `italic 700 16px` 尺寸前缀在重组时坍缩进 family                      | `font.ts:14`（GH-608）                                        | 已修复：完整 `[style\|variant\|weight]? size[/line-height]? family` 解析器（`font.ts:40` `parsePrefixes`） |
| `16px/24px` 行高段在 `fontSize` 变更时丢失                           | `font.ts:26` `SIZE_SLOT_RE`                                   | 已修复：`size/lineHeight` 捕获并重发（`font.ts:80` / `:102`）                                              |
| `fontSize` 接受 `'2em'`/`2rem` 并组合出 Canvas2D 丢弃的简写          | `apply.ts:232`（GH-608）                                      | 已修复：运行时 `px` 强制（`apply.ts:232`，`issue-608.test.ts:137`）                                        |
| `css()` 在变体间共享同一 `padding: {x,y}` 对象                       | `css.ts:23`（GH-608）                                         | 已修复：按轴拷贝（`css.ts:23`，`issue-608.test.ts:153`）                                                   |
| `var(--token, fallback)` 未解析透传                                  | `theme.ts:24` `HAS_VAR_FALLBACK_RE`（#645）                   | 已修复：在嵌入替换前检测并抛出（`apply.ts:147`，`issue-645.test.ts:30`）                                   |
| `var( --token, fb)` 带多余空格逃过回退守卫                           | `theme.ts:24` `/var\(\s*--/`（#753）                          | 已修复：允许 `var(` 后空白（`issue-645.test.ts:78`）                                                       |
| Token-ref→token 链将字面 `var(--…)` 泄漏到字符串字段                 | `apply.ts:112` `resolveToken`（GH-452/608）                   | 已修复：带 `seen` 环集合的传递 `resolveValue`（`apply.ts:125`）                                            |
| `setTheme` 在缺失 token 时半重样式                                   | `theme.ts:107` 试运行（GH-485，`v2.test.ts:137`）             | 已修复：全部解析后才提交，`current.theme` 仅在每次试运行后移动                                             |
| 已样式化实体被永久保留——`WeakMap<Theme, Map<Entity,…>>` 强持有       | `theme.ts:70` `WeakRef`（#644）                               | 已修复：`WeakMap<Theme, Map<WeakRef<Entity>,…>>` + `refOf`（`theme.ts:77`）+ 遍历时清扫（`theme.ts:129`）  |
| `css()` 共享同一 `padding` 对象而 `var()` 追踪键在字面量覆盖时被删除 | `theme.ts:195` `keys.delete(key)`（GH-451，`v2.test.ts:181`） | 已修复：按键 `Map<string,unknown>` 而非按对象追踪                                                          |
| `fontSize` 裸数字 token `bad-size: 12` 静默组合为 `'700 12 Inter'`   | `apply.ts:221` 裸数字守卫                                     | 已修复：`fontSize resolved to the bare number 12 — use a unit-bearing token`（`v2.test.ts:244`）           |
| `SIZE_SLOT_RE` 在 `\d+\.?\d*` 相邻数字类上的多项式 ReDoS             | `font.ts:26` 分支安全 `SIZE_SLOT_RE`（`v2.test.ts:258`）      | 已修复：无相邻同类量词，较长单位候选优先（`font.ts:22`）                                                   |
| `Text` 硬编码 `textAlign: 'center'` 来自迁移样式表                   | `styles.test.ts:87`                                           | 按设计：抛出——`center`/`right` 无实体支撑；迁移到 `left`+布局或 `justify`                                  |

## 11. 检查清单——落地样式改动前

1. **永不别名嵌套形状。** `Style` 至多携带一个嵌套对象（`types.ts:34` 处 `padding: {x,y}`）；`css()` 必须拷贝它（`css.ts:23`），任何新嵌套键需同样处理否则变体合并泄漏。
2. **在运行时而非仅类型中强制单位。** `` fontSize: `${number}px` ``（`types.ts:46`）在编译时捕获 `16`，但 token 与 JS 调用方绕过它——`apply.ts:221` / `232` 仍须抛出。
3. **保持 token 解析原子性。** `setTheme` 的试运行（`theme.ts:124` `resolveStyle(style, next)`）必须在 `current.theme` 移动前覆盖每个已追踪键；切换时校验失败的值不得半重样式场景（`v2.test.ts:137` GH-485）。
4. **弱持有实体。** `varPairs` 必须保持 `WeakMap<Theme, Map<WeakRef<Entity>,…>>`（`theme.ts:70`）并清扫 `ref.deref() === undefined`（`theme.ts:129`）——`Entity.destroy()` 无法调用 `untrackVarStyles` 因为 `core` 不依赖 `styles`（`theme.ts:65`）。
5. **按键而非按对象追踪。** `trackVarKeys`（`theme.ts:175`）将*当前*样式的键与已存 `Map<string,unknown>` 对比——同一键上后续字面量必须 `delete` 它（`theme.ts:195`）否则 var 重放覆盖它（`v2.test.ts:181` GH-451）。
6. **保持字体解析器与 `isCssLength` 守卫同步。** `SIZE_SLOT_RE`（`font.ts:26`）与 `isCssLength`（`apply.ts:23`）共享相同 `px` 字符串形状；分歧会让一方接受另一方拒绝并组合出 Canvas2D 静默丢弃的无效简写。
7. **对未知形式大声失败。** 任何新 `var()` 语法、新 CSS 键或新容器独有属性必须带属性名与值抛出（`apply.ts:29` `JSON.stringify(value)`）——GH-608 信条即对此类未识别形式的静默是该包唯一不能做的事。

---

*系列：00 总览 → 01 选区 → 02 文本+布局 → 03 投影+虚拟化 → 04 流式 Markdown → 05 TeX → 06 VMT 运行时 → 07 渲染器 → 08 WASM G1/G2/G3 → 09 Three/XR → 10 视频导出 → 11 图布局 → 12 DevTools → **13 样式与主题** → 99 综合。*
