+++
title = "样式 (@vectojs/styles)"
description = "基于数值 Virtual Math Tree 的 CSS 属性名样式对象：token 主题（var() + setTheme）、css() 合并与字体组合——无解析器、无级联、无选择器。"
weight = 55
+++

# `@vectojs/styles`

基于数值 Virtual Math Tree 的声明式样式层：使用**CSS 属性名和类 CSS 的值**编写样式，`applyStyle` 将它们映射到实体字段。重点是迁移的舒适性——读起来像 CSS 的代码仍然落在 VectoJS 开发者手写时会设置的同一组带类型、数值的字段上，canvas 保持为唯一事实来源。

这**不是**一个 CSS 引擎：没有解析器、没有选择器、没有级联、没有继承，也没有全局样式注册表。样式对象是一个普通的、带类型的、可选项键的对象；token 引用（`var(--key)`）针对扁平主题进行解析，切换主题会重新应用每个被跟踪的样式。

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

## 导出

- `style()` —— 将对象字面量类型化为 `Style` 的恒等工厂。
- `css(...styles)` —— 合并工厂（0.2.0）：后面的源胜出；`null`、`undefined`、`false` 源会被跳过，因此变体可以是条件式的。输入不会被修改。
- `applyStyle(entity, style)` —— 写入映射后的字段，返回 `{ applied: string[] }`（实际写入的 CSS 键，按对象顺序）。
- `tokens(set)` —— 从扁平 token 集合创建一个 `Theme`。
- `setTheme(theme)` / `getTheme()` —— 切换/读取当前主题；引用 `var()` 的样式在切换时会重新解析并重新应用。
- `PRESET_THEMES` —— `light`（默认主题）、`dark`、`github`、`dracula` token 集合。
- `Style` —— 样式接口。所有键都是可选的。
- `composeFont(current, changes)` —— 重新组合一个 CSS font 简写字符串（参见 [字体组合](#字体组合)）。
- `ThemeTokenSet` —— `Record<string, string | number>`；`tokens()` 集合的类型，也是 `Theme.tokens` 的类型。
- `Theme` —— `{ readonly tokens: ThemeTokenSet }`，由 `tokens()` 创建。

该包只依赖 `@vectojs/core`。

## 键映射

| CSS 键                                   | 实体字段                              | 值                                                                          |
| ---------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| `x`, `y`, `width`, `height`              | 相同                                  | 裸数字或 `px` 字符串                                                        |
| `opacity`, `scaleX`, `scaleY`            | 相同                                  | 数字                                                                        |
| `rotation`                               | 相同                                  | 数字，**弧度**（VectoJS 约定，而非 CSS 角度）                               |
| `backgroundColor`                        | `bg`                                  | 颜色字符串，原样传递                                                        |
| `color`, `borderColor`                   | 相同                                  | 颜色字符串，原样传递                                                        |
| `borderRadius`                           | `radius`                              | 裸数字或 `px` 字符串                                                        |
| `padding`                                | `padding`（或 `paddingX`/`paddingY`） | 单个值，或每轴的 `{ x, y }`（0.2.0）                                        |
| `font`                                   | `font`                                | CSS font 简写字符串，例如 `"16px Inter"`                                    |
| `fontFamily` / `fontSize` / `fontWeight` | 组合进 `font`                         | 0.2.0：替换存在的片段，其余保留                                             |
| `lineHeight`                             | `lineHeight`                          | 裸数字或 `px` 字符串                                                        |
| `textAlign`                              | `textAlign`                           | 仅 `"left"` \| `"justify"`                                                  |
| `display`                                | —（仅校验）                           | `"flex"`；断言实体是容器                                                    |
| `flexDirection`                          | `direction`                           | `"row"` → `"horizontal"`，`"column"` → `"vertical"`                         |
| `gap`                                    | `gap`                                 | 裸数字或 `px` 字符串                                                        |
| `alignItems`                             | `align`                               | `"flex-start"` → `"start"`，`"center"` → `"center"`，`"flex-end"` → `"end"` |
| `flexWrap`                               | `wrap`                                | `"wrap"` → `true`，`"nowrap"` → `false`                                     |

## Token 与主题

主题是一个扁平的 token 集合；键在书写时不含 `--` 前缀，并以 `var(--<key>)` 引用，镜像 CSS 自定义属性：

```ts
const theme = tokens({ accent: '#2563eb', 'radius-md': 8, gap: 10 });
setTheme(theme);
applyStyle(btn, style({ backgroundColor: 'var(--accent)', borderRadius: 'var(--radius-md)' }));
```

- `var(--key)` 在值转换器运行之前，针对当前主题的 token 进行**精确**（整体字符串）解析，因此一个 token 可以保存颜色、px 字符串或裸数字。未知的 token 会抛出异常并带有其名称。
- 引用 token 的样式会被**跟踪**（每个主题一个 WeakMap——无泄漏），并在 `setTheme(next)` 切换时重新应用，因此主题切换无需调用方做任何改动就能为整个场景重新着色。不含 `var()` 的样式不会被跟踪。如果某个 token 值在切换时无法通过映射属性的校验（例如 `--radius-md: "50%"`），`setTheme` 会抛出异常。
- 默认主题是 `light` 预设；`tokens()` 集合是普通对象，因此调用方的主题是一个展开：`tokens({ ...PRESET_THEMES.dark, accent: "#f00" })`。

## 字体组合

`fontFamily`、`fontSize` 和 `fontWeight` 不是独立字段——ui 组件将整个字体作为一个简写字符串携带。这些键解析实体当前的 `font`，只替换存在的片段，并写入重新组合后的字符串：

```ts
applyStyle(text, style({ font: '700 16px Inter' })); // entity font
applyStyle(text, style({ fontSize: '20px' })); // -> "700 20px Inter"
applyStyle(text, style({ fontFamily: 'ui-monospace' })); // -> "700 20px ui-monospace"
```

字体为空的实体从 `16px` 开始；缺少的字体会回退到 `sans-serif`。在没有 `font` 字段的实体上，这些键会被跳过。

底层的字符串助手被导出以供直接使用：

```ts
composeFont(
  current: string,                                       // e.g. "700 16px Inter"
  changes: { fontFamily?: string; fontSize?: string; fontWeight?: string },
): string                                               // -> "700 20px ui-monospace"
```

`composeFont` 解析一个 CSS font 简写，只替换 `changes` 中存在的片段并重新组合；缺失的大小/字体会用 `16px` / `sans-serif` 填充，因此结果始终是一个有效的 canvas 字体字符串。

## 语义

- **跨组件复用。** 字段在实体上不存在的键会被静默跳过，因此一个样式对象可以在 `Button`、`Text` 和 `Stack` 之间共享——每个都取用它所拥有的。`applied` 精确报告写入了什么。
- **类别错误的响亮失败。** 在不是容器的实体上使用布局键（`display`、`flexDirection`、`gap`、`alignItems`、`flexWrap`）会抛出 `TypeError`——将 `Text` 样式化为 flex 容器是一个错误，而不是无操作。未知的 CSS 键也会抛出异常。
- **无效值的响亮失败。** `"50%"`、`"8em"` 或 `textAlign: "center"` 会抛出异常并带有属性名。VectoJS 文本只实现 `left` 和 `justify`（`Text`、`RichText`、`TextEntity` 以及布局引擎都共享 `"left" | "justify"`），因此 `center`/`right` 无法被满足，也不能静默失败。值是裸数字（px）或 `px` 字符串；`%`、`em`、`rem` 会被拒绝。
- **脏标记通知。** 当至少写入一个键时，`applyStyle` 会调用一次 `entity.scene.markDirty()`，因此 `onDemand` 场景会重新绘制。

## 刻意超出范围的内容（v0.2.0）

- `transform`（CSS transform 字符串需要解析）、`justifyContent`（没有后备字段——Stack 子元素通过 `align` 对齐）、`border` 对象（还没有 canvas 边框渲染——只有 `borderColor`）、`%`/`em`/`rem` 长度、伪状态（`:hover`）、媒体查询、选择器和级联——这些都不作为实体字段存在，添加它们会重新引入数值 VMT 之所以存在所要移除的那套机制。

## 常见问题

**为什么 `applyStyle` 会在 `textAlign: "center"` 上抛出异常？** 因为在整个技术栈中 `textAlign` 都是 `"left" | "justify"`——ui 的 `Text`/`RichText`、核心的 `TextEntity` 以及布局引擎（`LayoutEngine.textAlign`）。没有任何实体有办法满足 `center`/`right`，因此抛出异常可以防止正在迁移的样式表静默渲染左对齐的文本。

**`rotation` 是角度的吗？** 不是——是弧度，与其他所有 VectoJS 旋转表面一致。从 CSS `rotate(30deg)` 迁移时必须转换为 `Math.PI / 6`。

**`padding: { x, y }` 会调整 Button 的大小吗？** 不会。Box 组件在构造函数中自行调整大小，因此之后设置的每轴 padding 会被实时检查 `paddingX`/`paddingY` 的消费者（例如 Card 布局）读取，而不是被内在尺寸计算读取。要在构造时调整大小，请在组件的选项中设置 `padding`。

**应用样式之后如何切换主题？** 应用引用 `var(--key)` token 的样式，然后调用 `setTheme(tokens({ ... }))`——每个被跟踪的样式都会针对新的 token 重新解析并重新绘制。带有字面量值的样式不会被改动。
