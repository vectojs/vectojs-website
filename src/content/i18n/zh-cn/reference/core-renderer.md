---
title: '渲染器'
description: '@vectojs/core/renderer 子路径：后端无关的 IRenderer 约定、CanvasRenderer、SVGRenderer、WebGL point/rect/sprite/MSDF 层、Entity 内容投影，以及 parseColorToRGBA。'
order: 5
---

# 渲染器 —— `@vectojs/core/renderer`

属于 [`@vectojs/core`](/reference/core-api/)。

## IRenderer

每个 `Entity.render` 都会接收的后端无关绘制表面。

```ts
interface IRenderer {
  clear(): void;
  save(): void;
  restore(): void;
  translate(x, y): void;
  scale(x, y): void;
  rotate(angle): void; // radians, clockwise
  setGlobalAlpha(alpha): void; // [0,1]
  clip(x, y, width, height): void; // intersect clip rect (wrap in save/restore)

  beginPath(): void;
  moveTo(x, y): void;
  lineTo(x, y): void;
  bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y): void;
  closePath(): void;
  arc(x, y, radius, startAngle, endAngle, counterclockwise?): void;
  roundRect(x, y, width, height, radii: number | number[]): void;

  drawImage(source: CanvasImageSource, dx, dy, dw, dh): void;
  fill(colorOrGradient: string | any): void;
  stroke(colorOrGradient: string | any, lineWidth = 1): void;
  fillText(text, x, y, font, color): void; // font = CSS shorthand, e.g. '16px monospace'

  fillCircle(cx, cy, radius, color, alpha = 1): void; // order-preserving same-style batch
  flush(): void; // commit pending batch (no-op when idle)
  present?(): void; // optional end-of-frame commit
  createLinearGradient(x0, y0, x1, y1, colorStops: { stop; color }[]): any;
  dispose?(): void; // idempotent backend cleanup; Scene.destroy() calls it

  // GPU context loss (optional; implement for a GPU-backed renderer)
  isContextLost?(): boolean; // Scene skips the render pass while true
  onContextRestored?(cb: () => void): void; // Scene repaints the cleared surface
}
```

### 应对 GPU 上下文丢失

GPU 重置或内存压力驱逐会夺走绘图上下文；如果不处理它，表面将永久空白。拥有 GPU 上下文的渲染器应该：

1. 监听其丢失事件并 `preventDefault()` 它 —— 否则浏览器永远不会触发相应的恢复事件；
2. 报告 `isContextLost() === true`，这样 `Scene.render` 会跳过渲染过程，而不是对着失效的上下文发出绘制调用；
3. 在恢复时，重新获取上下文，重新应用 DPR 变换/尺寸，并触发 `onContextRestored` 回调，让 Scene 重新绘制新清空的表面。

`CanvasRenderer` 为 Canvas2D 执行此操作，`ThreeRenderer` 为 WebGL 执行此操作 —— 参见 [`@vectojs/three`](/reference/three-renderer/)。

`fillCircle` 将连续的相同 `color`/`alpha` 调用合并为一条路径，在 `flush()` 时（或样式变化时）提交。Scene 在每个兄弟组结束时和每帧结束时 flush，保留画家顺序。

## `Entity.getContentProjection()`

```ts
getContentProjection(): ContentProjection | null // default null
// ContentProjection: {
//   text: string; font?: string; lineHeight?: number; selectable?: boolean;
//   contentX?: number; contentY?: number; baseline?: number;
//   lines?: Array<{ text; x; y; baseline; font?; lineHeight?; runs? }>;
//   grid?: PreparedContentGrid;
// }
```

为渲染静态文本的实体提供的选入钩子：Scene 将返回的字符串镜像为一个透明的、位置同步的 DOM 节点（视口惰性、脏检查、当实体可交互时 `aria-hidden`），使 canvas 文本可查找、屏幕阅读器/爬虫可见、可翻译，并且 —— 在 `selectable: true` 时 —— 原生可选择。`TextEntity`/`MSDFTextEntity`（参见 [Text & Bidi](/reference/core-text/)）实现了它。场景级关闭开关：`new Scene(canvas, { contentProjection: false })`。

Scene 在投影节点出现或消失时保留 VMT 顺序，随其实体子树移除后代投影，并在投影完全在视口外或位于 `clipChildren` 祖先内时隐藏它。工具可以检查当前已实体化的镜像而无需查询 DOM：

```ts
scene.getContentElement(entityId): HTMLElement | undefined;
```

虚拟化或未实体化的视口外文本在应用将其带入活动场景之前不可搜索。

> 需要 Core 1.6.0 或更高版本：Canvas 接受文本位置作为基线，而 CSS 接受行盒。为了精确的选择几何，为简单的文本运行提供 `contentX`/`contentY` 和 `baseline`，或当组件已经拥有换行、缩进或混合排版时，每个视觉行提供一个显式的 `lines` 条目。Scene 将这些局部坐标通过实体变换映射，并将 CSS 行盒与 Canvas 字体度量同步。

```ts
getContentProjection() {
  return {
    text: 'small large',
    selectable: true,
    lines: [{
      text: 'small large', x: 18, y: 12, baseline: 25,
      font: '28px sans-serif', lineHeight: 42,
      runs: [
        { text: 'small ', font: '16px sans-serif' },
        { text: 'large', font: 'bold 28px sans-serif' },
      ],
    }],
  };
}
```

当同一文本必须与原生控件或内容投影对齐时，在自定义 Canvas 原生编辑器中使用 `cssLineBoxBaseline(font, lineHeight)`。

> Core 1.8 为类代码渲染器添加了 `prepareContentGrid(source, metrics)`。将其不可变结果作为 `ContentProjection.grid` 返回，并对 Canvas 绘制使用相同的单元格。该网格保留 UTF-16 源范围、合法字素光标、CR/LF/CRLF 分隔符、制表符、宽 CJK 和 emoji 进距、阿拉伯文成形和 Unicode bidi 位置，同时投影的 DOM 保持精确的逻辑源用于复制和查找。

```ts
const grid = prepareContentGrid(source, {
  font: codeFont,
  cellWidth,
  lineHeight: 24,
  baseline: 18,
});

getContentProjection() {
  return { text: source, selectable: true, grid };
}
```

Core 在字体加载后校准保留的载体，并在局部网格空间中路由指针选择。因此 Firefox 字体替换、DPR、浏览器缩放、旋转、镜像变换和非均匀缩放使用一个几何方案。校准探测继承投影的缩放上下文并考虑 Firefox 缺失字形的回退度量；自定义调整大小/缩放的所有者必须调用 `scene.resize()` 以使保留的校准失效。普通的 `lines` 投影和无行的自定义投影也使用变换后的二维字素光标几何。

`present()` 由 Scene 在每个渲染过程结束时恰好调用**一次**。一次提交整帧的保留式后端（例如来自 [`@vectojs/three`](/reference/three-renderer/) 的 `ThreeRenderer`）应在此处进行其单次昂贵的提交，并保持 `flush()` 廉价 —— Scene 在每个非批处理节点周围调用 `flush()`，因此昂贵的 `flush()` 会使帧成本随实体数量呈平方增长。

## CanvasRenderer

```ts
new CanvasRenderer(canvas: HTMLCanvasElement)
```

默认 `IRenderer`。在构造时应用 `devicePixelRatio` 缩放。将每个批处理的 `fill()` 上限设为 `MAX_BATCH = 64` 个子路径（单个 Canvas2D `fill()` 在子路径数量上是超线性的）。通过 `scene.getRenderer()` 获取句柄。

## TextRasterCache

_自 Core 1.12.0 起。_

```ts
new TextRasterCache(options?: { maxEntries?: number; dpr?: number })
cache.get(font: string, color: string, text: string): TextRaster | null
cache.clear(): void
cache.stats: { hits: number; misses: number; size: number }
```

一个预栅格化文本段的缓存，用于**每帧绘制相同的短字符串数千次**的视图（弹幕、聊天/日志尾部、数据网格单元格、粒子标签）。`ctx.fillText()` 在大规模下的开销出人意料地高：每次调用都会重新塑形字符串、重新解析 CSS 颜色，并在 CPU 主线程上栅格化字形 —— 性能分析显示主线程被钉在原生（`(program)`）代码上，而 GPU 却在饥饿中空闲。

`get()` 将每个不同的 `(font, color, text)` 文本段一次性栅格化到一个小的离屏 canvas 上；此后每一帧你都用 `drawImage` 位块传输它，而不是重新塑形。通过减去返回的偏移量在 `fillText` 基线处进行位块传输：

```ts
const r = cache.get('600 24px system-ui', '#38bdf8', label);
if (r) renderer.drawImage(r.canvas, x - r.offsetX, baselineY - r.offsetY, r.width, r.height);
else renderer.fillText(label, x, baselineY, '600 24px system-ui', '#38bdf8'); // headless fallback
```

`TextRaster` 是 `{ canvas, width, height, offsetX, offsetY }`（尺寸以 CSS px 为单位）。实例是相互隔离的（没有共享的全局状态）；`dpr > 1` 在保持位块传输尺寸以 CSS px 为单位的同时让文本在 HiDPI 上保持清晰；一个按插入顺序的淘汰上限（`maxEntries`，默认 4096）针对无界的（用户输入的）内容限制内存；`get()` 在 headless/非 DOM 环境中返回 `null`，因此你要保留一个 `fillText` 回退。收益来自**重用** —— 只绘制一次的文本段纯粹是开销。

## SVGRenderer

```ts
new SVGRenderer(width: number, height: number)
toXMLString(): string
```

将绘制记录到一个扁平 SVG 字符串中的软件 `IRenderer`（矩阵/alpha/裁剪栈、渐变去重）。文本和属性值经过 XML 转义，外部图像 URL 拒绝可执行/data/file/自定义方案（Canvas 生成的栅格 data URL 仍受支持）。支撑 `scene.toSVG()`。`SVGLinearGradient` 是渐变描述符类型。

## WebGL point 层

```ts
createWebGLPointRenderer(canvas: HTMLCanvasElement): PointRenderer | null   // null if WebGL2 / shader unavailable

interface PointRenderer {
  resize(width, height): void;                 // logical size; applies DPR
  begin(): void;                               // reset per-frame buffers
  addCircle(x, y, radius, color, alpha?): void;        // world coords
  addRect(x, y, width, height, color, alpha?, rotation?): void;
  setTexture(source: TexImageSource): void;
  addSprite(x, y, width, height, u0, v0, u1, v1, color?, alpha?, rotation?): void;
  setMSDFTexture(source: TexImageSource, distanceRange: number): void;
  addGlyph(x, y, width, height, u0, v0, u1, v1, color?, alpha?, rotation?): void;
  flush(): void;                               // clear + draw all accumulated primitives
  destroy(): void;
}
```

一个 WebGL2 canvas，四个批处理程序：点（圆形，通过 `gl_PointSize` 抗锯齿）、矩形（展开的三角形）、带纹理的 sprite，以及 MSDF 字形（3 中值距离重建，在任何缩放下都清晰）。`color` 着色；白色纹素原样通过。在设置纹理之前，sprite/glyph 的添加是空操作。当 `pointBackend: 'webgl'` 时，Scene 将 `getBatchCircle`/`getBatchRect`（以及 CPU 粒子、MSDF 文本）路由到这里。位于 GPU 图元无法精确表示的变换下的叶子（例如非均匀缩放或剪切）会回退到普通渲染器。

> Entity 钩子 `getBatchCircle()` → `{ radius, color }` 和 `getBatchRect()` → `{ width, height, color }`（参见 [`Entity`](/reference/core-entity/#a11y--批处理钩子覆盖以选入)）是馈入此层的每实体选入项。

`flush()` **每种图元类型最多一次绘制调用**，因此绘制调用次数不是扩展限制 —— 上传的字节数才是。自 core 1.16.2 起，每个四边形批次（矩形、sprite、字形、圆形）上传 **4 个顶点**，并使用 `drawElements` 针对一个共享的静态 32 位索引缓冲区进行绘制，而不是扩展为 6 个顶点交给 `drawArrays`。这移除了每个四边形重复的两个角点，将上传量减少了三分之一；索引缓冲区构建一次并按几何级数增长，每帧从不重新发送。索引是 32 位的，因为 `Uint16Array` 会将批次限制在 16,383 个四边形，而实际场景会超过这个数值。

在实际硬件（RTX 4060 笔记本，测量包含 `gl.finish()`，12 次取中位数）上与之前的 6 顶点路径对比：

| quads/frame | Chrome         | Firefox         |
| ----------- | -------------- | --------------- |
| 12,000      | 0.61 → 0.09ms  | 2.66 → 1.47ms   |
| 50,000      | 2.22 → 0.87ms  | 9.02 → 6.24ms   |
| 100,000     | 12.62 → 3.12ms | 16.81 → 10.88ms |

大约低于 **35,000–50,000 quads/frame** 时，填充顶点缓冲区的 JS 开销超过了 GPU 提交；高于这个数值时 GPU 提交占主导，有效的杠杆变为减少绘制（淘汰、虚拟化）而不是调整填充。Firefox 保持近 ~1 GB/s 的有效上传带宽，与顶点布局无关，因此在那个引擎上减少字节是唯一可靠的杠杆。

## parseColorToRGBA

```ts
parseColorToRGBA(css: string): RGBA           // RGBA = [number, number, number, number] in [0,1]
```

为 `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa` 和 `rgb()`/`rgba()` 提供快速路径；其他形式（命名、`hsl()` 等）在存在 DOM 时通过缓存的 1×1 canvas 解析。结果**按标识缓存和共享 —— 将返回的数组视为只读。** 无 DOM 的不可解析输入 → 不透明黑色 `[0,0,0,1]`。

该缓存保存 1,000 个条目并按**插入顺序（FIFO）**淘汰。缓存命中故意**不**提升其条目：此函数每个四边形调用一次，在 ~25,000 quads/frame 时，真正的 LRU 所需的 `Map.delete` + re-`set` 组合的开销超过了函数中其他所有部分的总和。实际结果是，如果场景的不同颜色工作集超过 1,000，一个早期插入的热门颜色可能会被淘汰并重新解析；对于典型场景，工作集小而稳定，因此 FIFO 和 LRU 淘汰相同的条目。

## 相关

[`Entity`](/reference/core-entity/)（批处理钩子、内容投影）·
[`ComputeParticleEntity`](/reference/core-particles/)（WebGL/WebGPU 消费者）·
[Text & Bidi](/reference/core-text/)（MSDF 字形消费者）·
[`@vectojs/three` 的 `ThreeRenderer`](/reference/three-renderer/)（一个替代的 `IRenderer`）·
[`@vectojs/core` 概述](/reference/core-api/)
