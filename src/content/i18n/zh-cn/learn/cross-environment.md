---
title: '跨环境一致性'
description: '在不同操作系统、浏览器、缩放级别和像素密度下保持画布UI一致——并保持文本选择与渲染输出对齐。'
order: 19
---

# 跨环境一致性

DOM应用从浏览器的布局引擎继承一致性（和不一致性）。canvas原生应用则从**你**这里继承一致性：引擎根据自身测量的数值计算每个位置，因此故障模式发生了变化——从CSS怪癖转向像素密度、缩放和字体度量。本文将每个环境变量映射到实际变化的内容、引擎已处理的内容以及应用程序必须处理的内容。

## 设备像素比（HiDPI）

**引擎已处理。** 所有VectoJS坐标都是逻辑CSS像素。渲染器将画布后备存储大小设置为`logical × devicePixelRatio`并缩放上下文，每次`scene.resize()`都会重新读取当前DPR——渲染、命中测试和布局共享一个统一的逻辑坐标空间，在任何密度下都适用，包括分数DPR（Windows 125%/150%缩放）。

**你必须做的。** 运行时无需任何操作——但测试时需要：

> [!WARNING]
> 无头浏览器默认为`deviceScaleFactor: 1`。大多数真实机器的DPR为2（或分数值）。随DPR缩放的命中测试或文本投影偏移在默认无头运行中**不可见**，但在第一台真实笔记本上就会暴露。如果报告的偏移量与距离原点的距离成正比，请首先怀疑DPR。

在`deviceScaleFactor: 2`和1下运行指针和选择测试（Puppeteer/Playwright都在每个上下文中暴露此参数）。一个矩阵单元即可捕获整类错误。

## 浏览器缩放和容器大小

缩放会同时改变有效DPR和CSS视口。接下来发生什么取决于谁拥有画布大小：

- **全屏场景（默认）：** Scene监听窗口`resize`事件——缩放会触发此事件——并自动重新校准大小、后备存储和DPR。
- **嵌入场景（`disableWindowResize: true`、自定义容器、祖先元素上的CSS缩放）：** 引擎故意不做猜测。自行将容器连接到场景：

```typescript
const scene = new Scene(canvas, { disableWindowResize: true });

const ro = new ResizeObserver(([entry]) => {
  scene.resize(entry.contentRect.width, entry.contentRect.height);
});
ro.observe(container);
// 在销毁路径中与scene.destroy()一起断开连接。
```

`scene.resize(width, height)`是幂等的，并且足够轻量，可以在典型的UI中从ResizeObserver调用而无需防抖。它也是**重新校准钩子**：Firefox从布局状态计算原生`Range`选择度量，缩放和容器变化会使这些度量失效——如果从未告知场景发生了变化，场景会正确渲染但**选择**时使用过时的坐标。如果在Firefox中缩放后选择高亮发生偏移而画布正常，缺失`resize()`调用是首要怀疑对象。

## 字体：真正的跨操作系统变量

`'16px sans-serif'`在每个操作系统上都是不同的字体（Segoe UI、Roboto、San Francisco、DejaVu……）。VectoJS使用canvas的`measureText`自行测量文本，渲染器使用相同的字体字符串绘制——因此布局和像素在任何机器上**彼此之间**始终一致。不同机器之间变化的是**绝对几何**：行宽、换行点、实体大小。

实际后果，按痛苦程度递减排列：

1. **Web字体竞态。** 如果在Web字体加载之前构造`Text`/`RichText`/`Markdown`，测量将使用后备字体，而后来的重绘会使用已加载的字体进行渲染——此时布局和像素出现不一致（打破内部一致性的唯一情况）。将构造操作延迟到字体就绪后：

   ```typescript
   await document.fonts.ready;
   const label = new Text('Hello', { font: '16px Inter' });
   ```

   如果内容可能比字体加载更持久（懒加载字体），从`document.fonts.onloadingdone`处理程序中重新运行`setText`或`setMaxWidth`来重新测量。

2. **像素精确的测试期望。** 除非CI安装了确切的字体（VectoJS仓库在CI中安装了Noto字体），否则绝不要断言绝对的文本派生几何与硬编码数字的值相等。优先使用关系断言（"适合内部"、"在前一行下方"）——这正是`auditScene`自动化的内容。

3. **设计中的通用字体族。** 为`'14px sans-serif'`调整卡片大小在macOS上正常，在Windows上则不正确。要么随附字体，要么让测量驱动大小（自适应`Text`+容器布局），而不是在假设的文本宽度周围硬编码盒子。

## 重要的浏览器差异

引擎的跨浏览器测试矩阵（Chrome + Firefox，DPR 1和2，字体替换）确定了以下内容；应用程序仍可能遇到的差异：

| 区域              | 差异                                                        | 应对方法                                           |
| ----------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| 原生选择范围      | Firefox在缩放/调整大小后从过时的布局重新计算`Range`度量     | 在你拥有大小控制权时调用`scene.resize()`（见上文） |
| `Worker`可用性    | 某些嵌入器/测试运行器中缺失→Markdown同步解析                | 功能相同；在这些环境中需预算主线程时间             |
| WebGPU            | 可用性因环境而异；`ComputeParticleEntity`回退到CPU          | 将GPU计算视为渐进增强；也要测试CPU路径             |
| 减少动效          | OS级别设置，默认启用时限制有效FPS（`respectReducedMotion`） | 不要对抗它；在启用该设置的情况下测试动画           |
| 后台标签页中的rAF | 任何地方都会暂停，但恢复时机不同                            | 引擎在恢复时钳位动画dt；自定义积分器应自行钳位其dt |

## 保持选择与像素对齐

可选择文本的工作原理是将**逻辑源字符串**投影到透明的DOM镜像中，这些镜像的几何数据来自与画布绘制器相同的布局数据。对齐是构造性的——当它被破坏时，一定是违反了一系列简短契约中的某一个：

1. **场景未被告知大小/缩放变化**——投影几何过时（尤其是Firefox；参见上面的重新校准钩子）。
2. **字体在测量之后加载**——画布和投影都遵循测量后的布局，但绘制的字形发生了移动（上面的Web字体竞态）。
3. **自定义组件绘制文本但未对其进行投影**——像素没有可选择的镜像，或者镜像由与绘制路径不同的数学计算定位。自定义文本实体应重用引擎准备好的布局（`prepareContentGrid`/`LayoutEngine.prepare`）进行绘制和投影，绝不要进行两次独立的测量。

**验证对齐**（使用数字，而非截图）：

```typescript
// 1. 程序化选择是否复制了逻辑源？
//    （选择API镜像用户拖拽会产生的效果。）
const text = window.getSelection()?.toString();
expect(text).toBe(expectedSourceSlice);

// 2. 哪个实体实际接收了浏览器的选择事件？
import { createEventTrace } from '@vectojs/devtools/headless';
const trace = createEventTrace(scene, { capacity: 50 });
// … 拖拽选择 …
// source === 'content' 的条目始于可选择投影；
// 其 targetPath 告诉你具体是哪一个，defaultPrevented 则表示
// 应用程序是否拦截了浏览器的默认选择行为。
```

在与命中测试相同的环境矩阵中运行拖拽选择测试：两种浏览器、两种DPR，以及至少一种非默认缩放级别。

## 可移植性检查清单

要构建一个在任何地方外观和行为都一致的UI：

- [ ] 随附你测量时使用的字体；在`document.fonts.ready`之后构造文本。
- [ ] 全屏场景 **或** `ResizeObserver` → `scene.resize()`桥接——绝不可两者皆无。
- [ ] 在DPR 1 **和** 2、Chrome **和** Firefox下进行指针+选择测试。
- [ ] CI中`auditScene(scene)`干净通过（关系型布局正确性，与字体无关）。
- [ ] 对关键交互使用快照差异（`captureSnapshot`/`diffSnapshots`）而非像素对比截图。
- [ ] 在启用OS减少动效设置的情况下验证动画。
- [ ] 如果启用了WebGL/WebGPU后端，同时也要测试Canvas2D回退路径。

> **下一篇：** [调试工作流](/reference/devtools/#调试工作流)提供了此清单所依赖的数值工具，以及[流式传输与实时文本](/learn/streaming/)用于实时UI。
