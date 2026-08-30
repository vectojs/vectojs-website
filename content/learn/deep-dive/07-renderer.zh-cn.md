---
title: '07 — 渲染器 — 坐标 / 裁剪 / DPR 一致性'
description: '跨 Canvas2D、WebGL、WebGPU、SVG 与 Three 的多后端一致性：IRenderer 契约、坐标空间、裁剪语义、DPR/后备存储上限、视口剔除与绘制调用批处理——以及让同一场景在不同后端看起来不一样的每一个陷阱。'
order: 27
---

# 07 — 渲染器 — 坐标 / 裁剪 / DPR 一致性

> **Boss 07** 守卫最后一公里：将 Virtual Math Tree 的几何变为像素，无论后端是 `CanvasRenderingContext2D`、WebGL 点图层、WebGPU 计算通道、SVG 导出还是 Three.js 实例化网格——在任意 DPR、任意缩放、任意视口下看起来都一致。

- **你将学到**：`IRenderer` 契约及其为何——而非 `CanvasRenderingContext2D`——才是权威；一次绘制调用会穿越的五个坐标空间；裁剪、DPR、剔除与批处理各自如何破坏一致性；以及带 `file:line` 可验证的已归档、已修复与仍开放的陷阱。
- **你不会学到**：文本塑形与布局（boss 02）、VMT 脏标记与生命周期（boss 06）、WASM 加速（boss 08），或 Three/XR 桥接的双世界映射（boss 09）。本文档是每一项的渲染侧。

## 为何多后端一致性很难

VectoJS 承诺“同一场景，同一画面”跨五种后端：

| 后端               | 模块                                                          | 是否保留   | 像素去向                               |
| ------------------ | ------------------------------------------------------------- | ---------- | -------------------------------------- |
| Canvas2D           | `packages/core/src/renderer/CanvasRenderer.ts:1`              | 立即       | 单个 `<canvas>` 2D 上下文，经 DPR 缩放 |
| WebGL 点/精灵/字形 | `packages/core/src/renderer/WebGLPointRenderer.ts:1`          | 批处理     | 堆叠的全窗口 canvas，NDC 四边形        |
| WebGPU 粒子        | `packages/core/src/renderer/WebGPUParticleSystemManager.ts:1` | 计算       | 同一堆叠 canvas，计算→渲染             |
| SVG 导出           | `packages/core/src/renderer/SVGRenderer.ts:1`                 | 保留字符串 | `toXMLString()` 无 DOM 序列化          |
| Three.js           | `packages/three/src/ThreeRenderer.ts:216`                     | 保留场景图 | `THREE.WebGLRenderer` 正交相机         |

每个后端都以相同顺序、在相同 `save`/`restore`/`translate` 栈下接收**相同的 `Entity.render(r: IRenderer)` 调用**。一致性并非在遍历错误时失效，而是在后端对同一调用的_解释_不同时失效——在一个后端是路径操作的裁剪在另一个是剪刀矩形、在一个后端按 `window.devicePixelRatio` 定尺寸的后备存储在另一个按 `maxDPR` 限幅、在一个后端是 `lineWidth` 属性的描边在另一个是条带几何。每种分歧在 HiDPI 显示器、缩放、裁剪边缘或 4 万单元网格命中之前都不可见。

吸收这些分歧的契约是 `IRenderer`（`packages/core/src/renderer/IRenderer.ts:1`）。Entity 不得导入具体渲染器。该接口按设计是基于方法的：样式随绘制一起传递（`stroke(color, lineWidth)`、`fillText(text, x, y, font, color)`），因此批处理后端可合并批次，GPU 后端有明确边界。可变样式属性（`ctx.fillStyle = …`）被刻意缺席——开发陷阱会在它们上面警告（`IRenderer.ts:159`、`IRenderer.ts:301`），因为在未转译的 JS 中它们会作为扩展属性附着并以上下文默认值静默绘制。

## IRenderer 契约（先读这里）

```text
IRenderer.ts:41  — kind, pixelRatio, setDrawCounters / getDrawCounters
IRenderer.ts:134 — clip(x,y,w,h, radii?)
IRenderer.ts:149 — path: beginPath / moveTo / lineTo / bezierCurveTo / closePath / arc / roundRect
IRenderer.ts:193 — drawImage / drawImageRect? (optional)
IRenderer.ts:287 — fill / stroke / fillText / fillCircle / flush
IRenderer.ts:350 — createLinearGradient
IRenderer.ts:404 — present? / dispose? / isContextLost? / onContextRestored?
```

关键设计选择：

- **`kind`**（`IRenderer.ts:76`）是稳定的字符串判别（`'canvas2d' | 'svg' | 'three'`）—— `constructor.name` 会被压缩。
- **`pixelRatio`**（`IRenderer.ts:88`）是可选且_实时已应用_的值，而非 `window.devicePixelRatio` 的快照。需要光栅化 blit 源的调用方必须读取它，而非 window。
- **`drawImageRect?`**（`IRenderer.ts:232`）是可选的。`SVGRenderer` 刻意省略它：SVG blit 将源作为 data URL 嵌入，因此逐单元的子矩形会将整个图集内联数千次。调用方必须做特性检测并保留 `fillText` 回退。
- **`fillCircle` + `flush`**（`IRenderer.ts:328`、`:364`）是有序保序的批处理。连续同色、同透明度的圆会合并为一条路径并在 `flush()` 时一次 `fill()`。`Scene` 在每个兄弟边界与帧末刷新。
- **`present?`**（`IRenderer.ts:404`）仅面向保留式后端。`CanvasRenderer` 立即绘制；`ThreeRenderer` 将其唯一一次真正的 GL 渲染推迟到 `present()`（`ThreeRenderer.ts:957`），因此一帧开销为 `O(N)` 次添加 + `1` 次绘制，而非 `O(N²)` 次重渲染。

## 坐标空间（五个，而非一个）

写作 `fillCircle(cx, cy, …)` 的点会穿越：

1. **局部**——实体自身的 `(x, y)` 盒。`Entity.getBounds()` 与 `worldToLocal` 居于此。
2. **世界**——局部经每个祖先的 `translate` / `scale` / `rotate` 与场景 DPR 缩放变换后的空间。`HitTester` 与剔除在此测试。
3. **视口 / CSS px**——世界被裁剪到场景视口及任意 `clipChildren` 祖先。`Scene.ts:4335` `projectionBoxVisible`。
4. **后备存储 / 设备 px**——视口 × `appliedDPR`（`CanvasRenderer.ts:244` `pixelRatio`）。GPU 实际采样的地方。
5. **裁剪 / NDC**——仅 WebGL/WebGPU：`(pos / resolution)*2-1`，y 翻转（`WebGLPointRenderer.ts:320`），Three 的 y-down 正交（`ThreeRenderer.ts:250`）。

陷阱在于把一个空间当成另一个。`ComputeParticleEntity` 的 GPU 路径在**窗口**空间消费 `scene.mouseX/Y`，并绘制在忽略实体变换的堆叠全窗口 canvas 上；其 CPU 回退在**局部**空间消费 `entity.worldToLocal(mouse)`，并在 `renderer.translate(node.x, node.y)` 内绘制——一个缓冲，两种契约（`vectojs-docs/forge/findings/renderer-and-gpu.md:299`）。`WebGPUParticleSystemManager` 记录时将 `screen_size` 作为 `width / height` 传入（`WebGPUParticleSystemManager.ts:310`），而 CPU 路径绘制时已应用实体变换。

`ThreeRenderer` 在 NDC 边界处陷入同一陷阱：其正交相机为 y-down（`ThreeRenderer.ts:250`），因此每个 `FrontSide` 网格都是背面而被剔除——修复是在每个填充图元上使用 `side: DoubleSide`，而非仅文本（`ThreeRenderer.ts:596`，forge 2026-08-13）。

## 裁剪

`IRenderer.clip(x, y, w, h, radii?)`（`IRenderer.ts:134`）与当前裁剪求交。`radii` 是_渐进增强_：基于剪刀测试的 GPU 路径可忽略它。

- **Canvas2D** —— `ctx.roundRect` + `ctx.clip()` 在 `save`/`restore` 内（`CanvasRenderer.ts:373`）。有作用域、正确。
- **SVG** ——合成式：全新 `<clipPath id="clip-N"><rect|path …/>` 加 `<g clip-path="url(#clip-N)">`，在 `restore()` 时通过弹出 `clipDepth` 并在 `toXMLString()` 中闭合标签来结束（`SVGRenderer.ts:510`、`:543`）。开销是 DOM 大小，而非填充率。
- **Three** ——以当前矩阵变换并翻转至左下原点、与任意外层剪刀求交的后备存储像素剪刀矩形（`ThreeRenderer.ts:449`）。剪刀仅为矩形；圆角裁剪退化为其 AABB。
- **`clipChildren`** —— `Scene`/实体级标志，_而非_渲染器 `clip()` 调用，它虚拟化命中、无障碍与内容投影。`Scene.ts:254`（命中）与 `Scene.ts:4305`（剔除）皆与每个 `clipChildren` 祖先的世界盒求交；`isHitEligible` 以精确的旋转感知局部矩形重检。

已知裁剪缺口：`IRenderer.fill` 无法表达 `fillRule: 'evenodd'`（`forge/findings/renderer-and-gpu.md:38`）。`Canvas2D` 与 `SVG` 可以做 even-odd（`ctx.fill('evenodd')`、`<path fill-rule="evenodd">`），但接口仅暴露 `fill(colorOrGradient)`。因此含多于一个闭合分量的复合路径在所有后端都以 `nonzero` 填充。规定的形态是为 `fill` 添加向后兼容的可选 `fillRule` 参数，在消费者移除其诊断守卫前一致实现。

## DPR 缩放与后备存储上限

```text
CanvasRenderer.ts:219  effectiveDPR()  = min(real DPR, maxDPR)
CanvasRenderer.ts:244  pixelRatio      = appliedDPR (recorded, not live)
CanvasRenderer.ts:119  constructor / resize apply scale(dpr, dpr)
WebGLPointRenderer.ts:972  same clamp for the point layer
ThreeRenderer.ts:307   effectiveDPR() / pixelRatio via getPixelRatio()
Scene.ts:286           SceneOptions.maxDPR — syncs to every renderer on resize
```

三条不变量：

1. **限幅，别轻信。** `maxDPR`（`SceneOptions.maxDPR`，`CanvasRenderer.ts:66`）限制后备存储增长。`maxDPR: 2` 是合理默认，_而非_保证——对同一内容，带数千细线段的逐帧描边在 DPR1 测得 `16.7 ms`，在 DPR2 为 `140 ms`（`forge 2026-07-18` 后备存储上限）。昂贵通道即使引擎默认 2，也可能需要 `maxDPR: 1`。

2. **已应用，而非实时。** `pixelRatio` 报告上下文_当前已缩放_的比例（`appliedDPR`），而非每次访问重读的 `effectiveDPR()`（`CanvasRenderer.ts:234`）。实时 getter 会在缩放/DPR 变更与下一次 `resize` 之间的窗口内报告_未来_ DPR，调用方据此光栅化的纹理会被仍旧旧的上下文重采样。以 `pixelRatio` 为键的缓存（如 `GlyphRasterAtlas`、`Markdown` 代码图集池）因此仅在真正重分配的 resize 后才重建键。

3. **Resize 使样式缓存失效。** 设置 `canvas.width/height` 会按规范将整个 2D 上下文重置为 `10px sans-serif / #000`。`CanvasRenderer.resize` 丢弃 `_cachedFont/_cachedFill/_cachedStroke` 与批处理状态（`CanvasRenderer.ts:258`）并记录新的 `appliedDPR`。`contextrestored` 同理（`CanvasRenderer.ts:164`）；遗漏丢弃会在默认字体下以陈旧缓存重绘。对应的 `WatchDevicePixelRatio` 媒体查询循环在每次变更时重建（`ThreeRenderer.ts:338`，Scene 同理），因此跨显示器拖动或缩放会触发真正的 `resize`。

预光栅化位图必须立于此之上：

- `GlyphRasterAtlas` 与 `TextRasterCache` 在构造时 `dpr` 下光栅化（`GlyphRasterAtlas.ts:174`、`TextRasterCache.ts:88`），但其查找键历史上遗漏了它（`forge 2026-08-25`）：跨 DPR 变更复用同一图集会在相同键下提供陈旧密度位图并以重采样 blit（模糊）。文档契约称“图集以 DPR 为键，变更时替换”——除非键纳入 DPR，否则安全依赖调用方纪律。
- `SplineEntity.bake` 曾读取原始 `window.devicePixelRatio`（`SplineEntity.ts:433` 修复前），而其 blit 进入 `maxDPR` 限幅的上下文——每帧下采样的超分辨率位图。已修复为在渲染时读取 `renderer.pixelRatio` 并在变更时重烘焙（`SplineEntity.ts:504`）。

## 视口剔除

`Scene` 严格按视口剔除：_填充盒_完全在视口外的实体被跳过（`Scene.ts:7254` 剔除轨迹）。两项细化：

- **描边膨胀。** `Circle.getBounds()` / `Rect.getBounds()` 在带描边时现按 `strokeWidth/2` 膨胀（`Circle.ts:67`、`Rect.ts:54`，修复于 `@vectojs/core@2.18.3` CTX-0261）。此前，视口边缘的粗描边会丢失多达一半宽度。`-0` 后续（`-inflation` 对 `0` 取负）需要仅正数的取负（`forge 2026-08-08` `-0` 条目）。
- **感知裁剪的剔除**（`Scene.ts:4335`）。`projectionBoxVisible` 将视口与每个 `clipChildren` 祖先的 AABB 求交；视口外但被裁剪进来的内容会被虚拟化（boss 03）。无界的全视口覆盖被刻意永不裁剪（`Scene.ts:4238`）。

## 批处理与绘制调用经济

| 路径                          | 机制                                                         | 上限 / 开销                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `fillCircle` (Canvas2D)       | 同色、同透明度批次 → 一条路径、一次 `fill()` 于 `flush()` 时 | `MAX_BATCH = 64`（`CanvasRenderer.ts:88`）——超出后超线性                                                                                 |
| `fillCircle` (SVG)            | 每次 flush 一个 `<path d="… A … A …">`                       | 无 GPU 开销，DOM 大小                                                                                                                    |
| `fillCircle` (WebGL/Three)    | 实例化四边形 / `CircleGeometry`                              | 近常数；仅 flush 重要                                                                                                                    |
| `drawImage` / `drawImageRect` | 无——立即 `drawImage` / `<image>`                             | 图集（`GlyphRasterAtlas`）保持单一源纹理；`TextRasterCache` 逐 canvas 源在 4 万单元时测得 **0.87×**（`fillText` 基线）对比图集的 **~2×** |

`CanvasRenderer.flush`（`CanvasRenderer.ts:414`）从批处理前的值（而非 `1`）恢复 `globalAlpha`，并将 `_cachedFill` 更新为批次颜色——否则带陈旧缓存的下一次 `fill('red')` 会跳过赋值并以批次颜色绘制。待处理批次在 `drawImage`、`beginPath`、`save`/`restore`、`clip`、`fill`、`stroke` 与 `fillText` 之前提交。

`ThreeRenderer.flush`（`ThreeRenderer.ts:957`）_仅_标记 `frameDirty`。真正的 GL 渲染是 `present()`（`ThreeRenderer.ts:968`），由 `Scene` 在帧末调用一次；没有它，`O(N)` 次 flush 将付出 `O(N²)` 渲染。旧版从不调用 `present()` 的 `Scene` 构建由微任务回退覆盖。

WebGL 特有：`setTexture` 在源变更时于 `texImage2D` 前现提交精灵批次（`WebGLPointRenderer.ts:974`，修复于 `@vectojs/core@2.18.3`），镜像 `setMSDFTexture`。`ctx.filter = 'blur()'` 开销延迟到_下一次_像素读取（`forge 2026-07-18` `ctx.filter` 条目）——可能时在半分辨率下模糊。

## 文本光栅路径

`fillText` 为 CPU 塑形 + 颜色解析 + 光栅化，峰值 5000 次/帧；GPU 空闲（`(program)` 占主导）。两条可选缓存将塑形转为 blit：

- `GlyphRasterAtlas`（`GlyphRasterAtlas.ts:1`）——单 canvas，货架打包槽位，`drawImageRect` 子矩形。面向有界等宽集合（代码网格、终端）。需要 `drawImageRect`；`SVGRenderer` 非目标。
- `TextRasterCache`（`TextRasterCache.ts:1`）——每 `(font, color, text)` 段一个小 canvas，`drawImage` blit。面向有界短语集合（弹幕 395 码点 → 单张 `≤1024²` MSDF 图集）。两者皆限内存（图集货架 + 重置计数、缓存 `maxEntries` 带 10% 插入序驱逐）并在无头时回退到 `fillText`。5000 弹幕墙_并非_塑形而是绘制数 + 过绘制：将 `fillText→drawImage` 互换毫无变化；经 `MSDFTextEntity` / `pointRenderer.addGlyph` 将字形批为约 1 次 WebGL 绘制，将帧率从 `~28 fps` → `~130 fps`（`forge 2026-07-20` 更正，`bakudan` v0.5）。

Three 的文本路径在 `dpr` 下光栅化（`ThreeRenderer.ts:747`）并以 `dpr|font|color|text|gradient-definition` 加对渐变圆整后的 `x,y` 相位为键缓存纹理（`ThreeRenderer.ts:806`）。字号由 `parseFontSize`（`ThreeRenderer.ts:274`）解析，_而非_ `parseInt` ——样式简写将字重放前面（`'700 16px Inter'`），因此朴素 `parseInt` 会读到 `700`。基线：字母基线落在 `y`；Three 的 `PlaneGeometry` 中心偏移 `-fontSize + h/2`（`ThreeRenderer.ts:831`）。

## Scene 接线（渲染器开关在哪里设置）

```text
Scene.ts:226  SceneOptions.pointBackend: 'canvas' | 'webgl'   (glyphs/sprites)
Scene.ts:233  SceneOptions.particleBackend: 'auto'|'webgpu'|'cpu' (compute particles)
Scene.ts:286  SceneOptions.maxDPR               → syncs to pr.maxDPR on every resize
Scene.ts:398  SceneOptions.renderMode: 'always' | 'onDemand'
Scene.ts:1142 Scene.renderMode + DirtyTracker + RenderScheduler (maxFPS / autoThrottle)
Scene.ts:2284 full-window viewport adoption (once) + disableWindowResize
Scene.ts:2781 clientToScene viewport mapping
```

- **`pointBackend` 与 `particleBackend` 是不同特性**（`forge 2026-08-26`）。`pointBackend: 'webgl'` 批处理字形/精灵四边形；`particleBackend: 'webgpu'` 驱动 `WebGPUParticleSystemManager` 用于 `ComputeParticleEntity`。不存在 WebGPU 字形/MSDF 路径；翻转 `particleBackend` 对弹幕毫无作用。
- **`WebGPUParticleSystemManager` 经静态方法 opt-in**（`forge 2026-08-02`）：`Scene.registerWebGPUParticleSystemManager(...)`。在默认 `'auto'` 且未注册时既不抛也不 `console.warn` —— CPU 回退运行，而 `initWebGPUContext` 仍分配未使用的堆叠 canvas。
- **`renderMode: 'always'`**（默认）驱动连续 rAF 循环；`autoThrottle` 在静态时降至 `idleFPS`。**`'onDemand'`** 仅在 `markDirty()` 或活跃动画/物理 tick 后绘制。`render()` 自身无条件渲染—— `renderMode` 仅影响循环调度器（`Scene.ts:3405`）。

## 已知陷阱（附 file:line）

| 陷阱                                                                                          | 位置                                                                                          | 状态                            |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------- |
| Even-odd 填充不可表达（`IRenderer.fill` 无 `fillRule`）                                       | `IRenderer.ts:287`，forge 2026-07-18                                                          | 开放                            |
| 无阴影/发光原语（`shadowBlur` 缺席；`ctx.filter` 模糊开销延迟）                               | `IRenderer.ts:159` 提示，forge 2026-07-18 / 2026-08-25                                        | 开放                            |
| 无用于壁纸采样的 backdrop blur/material                                                       | forge 2026-08-25                                                                              | 开放（stretch）                 |
| 字形/文本光栅键遗漏 DPR —— DPR 变更后陈旧密度位图                                             | `GlyphRasterAtlas.ts:174`、`TextRasterCache.ts:88`，forge 2026-08-25                          | 开放（契约=调用方必须替换图集） |
| `WebGPUParticleSystemManager` 需 `Scene.register…` 静态；`'auto'` 上静默 CPU 回退             | `Scene.ts:256` 注册门控，forge 2026-08-02                                                     | 开放                            |
| CPU 与 GPU 粒子坐标空间不一致（窗口 vs 局部）                                                 | `WebGPUParticleSystemManager.ts:310`、`ComputeParticleEntity.ts`，forge 2026-08-02 相关       | 应用侧补偿                      |
| 后备存储按窗口 DPR 而非限幅 `appliedDPR` 定尺寸                                               | `CanvasRenderer.ts:244`、`ThreeRenderer.ts:318`、`SplineEntity.ts:504`                        | 已修复                          |
| `resize` 在上下文重置间遗留字体/填充缓存陈旧                                                  | `CanvasRenderer.ts:258`，forge 2026-08-13 `CanvasRenderer.resize`                             | 已修复 #463                     |
| `flush` 在未更新缓存时变更 `fillStyle`/`globalAlpha`                                          | `CanvasRenderer.ts:414`，forge 2026-08-13                                                     | 已修复 #469                     |
| `parseColorToRGBA` 在无效输入上返回上次解析                                                   | `renderer/colorParse.ts:60`，forge 2026-08-13                                                 | 已修复 #492                     |
| `SplineEntity.bake` 使用原始 `window.devicePixelRatio`                                        | `SplineEntity.ts:433` 修复前，forge 2026-08-13                                                | 已修复 #492                     |
| `WebGLPointRenderer.setTexture` 遗漏批处理刷新                                                | `WebGLPointRenderer.ts:974`，forge 2026-08-13                                                 | 已修复 #520                     |
| `ThreeRenderer.fillText` 将字重解析为尺寸；基线偏移 `fontSize/2`                              | `ThreeRenderer.ts:274`、`:831`，forge 2026-08-13 / #486                                       | 已修复 #511                     |
| 镜像正交下 `FrontSide` 填充/圆/渐变/图像被剔除                                                | `ThreeRenderer.ts:250`，forge 2026-08-13                                                      | 已修复 #519                     |
| `drawImage` 垂直翻转（`flipY = true`）于 y-down 相机                                          | `ThreeRenderer.ts:478`，forge 2026-08-23 #603                                                 | 已修复 #613                     |
| 细线描边（`LineBasicMaterial.linewidth` 被忽略）；DPR 被忽略；GL 上下文泄漏；渐变 >8 档重采样 | `ThreeRenderer.ts:110` ribbon、`:307`、`ThreeRenderer.ts:1044` dispose，forge 2026-08-23 #604 | 已修复 #623                     |
| `getBounds()` 排除描边 → 剔除裁掉 `strokeWidth/2`                                             | `Circle.ts:67`、`Rect.ts:54`，forge 2026-08-08                                                | 已修复 2.18.3                   |
| `getBounds()` `-0` 产物被固化进测试                                                           | forge 2026-08-08 `-0` 条目                                                                    | 已修复 2.18.3                   |

## 发布渲染器变更前的检查清单

1. **读取 `pixelRatio`，而非 `window.devicePixelRatio`。** 若光栅化将 blit 的纹理，以 `renderer.pixelRatio` 为缓存键并在 `resize` 后重光栅化。
2. **DoubleSide 并取消翻转。** 在 y-down 正交下，每个 `Mesh`/`PlaneGeometry` 需要 `side: DoubleSide` 与 `texture.flipY = false`（`ThreeRenderer.ts:596`、`:478`）。
3. **感知 flush 的缓存。** 任何变更 `fillStyle` 或 `globalAlpha` 的路径必须更新对应缓存；任何重置上下文的必须丢弃它（`CanvasRenderer.ts:258`）。
4. **尊重批次。** 若希望同样式 `fillCircle` 合并，不要在它们之间穿插非批处理绘制；剪刀/纹理/透明度变更前 `flush()`。
5. **裁剪有三处。** 渲染器 `clip()` 用于绘制、`clipChildren` 用于命中/无障碍/内容（`Scene.ts:254`、`:4335`），视口带用于虚拟化。改一处而不审计另两处即是缺陷。
6. **在真实 DPR 下分析。** `maxDPR: 2` 不是描边密集通道的性能保证——在真实硬件原生 DPR 下以 `benchmarks/run-browsers.sh` 度量（双引擎、headed）。

## 关联

- **Boss 03（投影与虚拟化）**拥有 `clipChildren` 与本 boss 剔除所镜像的 `projectionBoxVisible` / 内容层级策略。
- **Boss 06（VMT 运行时）**拥有 `Scene.render`、`RenderScheduler` / `DirtyTracker` 策略，以及每个渲染器所消费的 `worldMatrix`。
- **Boss 02（文本/布局）**拥有本 boss 所光栅化的度量。**Boss 09（Three/XR）**复用本文所有陷阱——条带描边、剪刀裁剪、DPR 与 DoubleSide 是其起步套件。**Boss 08（WASM）**复用相同 `Scene` 视口与 DPR 值；跨内存增长的陈旧类型化数组视图是下一 boss 的陈旧光栅缓存版本。

---

_系列：00 总览 → 01 选区 → 02 文本+布局 → 03 投影+虚拟化 → 04 流式 Markdown → 05 TeX → 06 VMT 运行时 → **07 渲染器** → 08 WASM G1/G2/G3 → 09 Three/XR → 10 视频导出 → 11 图布局 → 12 DevTools → 99 综合。_
