---
title: '09 — Three.js / XR 桥接 — 两个坐标世界'
description: 'VectoJS 2D canvas 契约与 Three.js 3D 空间之间的适配器：CanvasTexture 面板、raycast→UV→scene 映射、离屏焦点/键盘归属，以及 Graph3D 如何展示纯 Three 方案。'
order: 29
---

# 09 — Three.js / XR 桥接 — 两个坐标世界

> **Boss 09** 存在于两种输入模型碰撞之处。VectoJS 渲染到拥有透明无障碍 DOM、负责指针与键盘分发的 2D 逻辑像素场景；Three.js 渲染到指针为射线、面板为悬浮于世界空间的纹理四边形的 WebGL 场景。`ThreeAdapter` 是唯一同时通晓两者的部件。

- **你将学到**：为何 adapter 是坐标系桥接而非渲染器；`CanvasTexture` 纹理路径及其 `needsUpdate` 代理；`Raycaster` UV 如何映射到逻辑像素（及 DPR 陷阱）；指针、滚轮、悬停、焦点与键盘归属如何经离屏 canvas 重路由；以及 `Graph3D`/`GraphCamera`/`GraphInteraction` 如何演示纯 Three 方案。
- **你不会学到**：`IRenderer` 契约本身（boss 07）、文本光栅化与 y-down 正交细节（boss 07 §文本光栅路径）、WASM 加速（boss 08），或 2D 力导向调优（boss 11）。本文档是 VectoJS 2D 契约与 3D 宿主之间的接缝。

## 1. 为何 adapter 艰难 — 两个世界，一块 canvas

普通 VectoJS `Scene` 拥有插入页面的 `<canvas>`。其无障碍镜像追加到该 canvas 的 `a11yRoot`（叠于 canvas 之上的 `<div>`），指针/键盘分发经由这些镜像（`Scene.ts:3512` 每镜像监听器）。在桥接中 canvas 为**离屏**——它从不插入文档，而是作为 GPU 纹理被采样。

这一事实带来连锁反应：

| 世界        | 谁拥有输入                                       | 像素所在                              | 谁拥有焦点                                                               |
| ----------- | ------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------ |
| VectoJS 2D  | 投影的无障碍 DOM（`Scene` 每镜像监听器）         | `canvas.width/height` 后备存储        | `document.activeElement` + `Scene.focusedA11yElement`（`Scene.ts:1446`） |
| Three.js 3D | `THREE.Raycaster` + `window`/`domElement` 监听器 | `CanvasTexture` 于 `PlaneGeometry` 上 | Three 没有 DOM 焦点；宿主的 `OrbitControls` 或 `GraphCamera` 拥有指针    |

`ThreeAdapter`（`packages/three/src/ThreeAdapter.ts:90`）必须让一个以为自己在屏上的 2D 场景，在其像素位于 3D 命中测试之后、其镜像与 `document` 永久断开的情况下仍正确行为。

包中另一模块 `ThreeRenderer`（`packages/three/src/ThreeRenderer.ts:216`）是对同一命题的不同回答：它是实现 `IRenderer`（`IRenderer.ts:41` 契约）并以 Three.js 而非 `CanvasRenderingContext2D` 渲染 VectoJS 实体的渲染器。adapter 将 Scene 作为纹理包裹；renderer 则替换 2D 上下文。它们共享相同的 y-down 正交与 DPR 陷阱（boss 07），但归属相反：adapter 的 `vectoScene` 仍默认以 `CanvasRenderer` 渲染，renderer 的 `scene/camera/renderer`（`ThreeRenderer.ts:219`）则直接渲染实体。

## 2. 纹理路径 — 从 VectoJS 像素到 Three.js 四边形

```ts
// packages/three/src/ThreeAdapter.ts:125 — construction (abbreviated)
this.canvas = optCanvas ?? (document ? document.createElement('canvas') : offscreenFallback);
this.vectoScene = new VectoScene(this.canvas, { disableWindowResize: true, ...sceneOptions });
this.texture = new THREE.CanvasTexture(this.canvas);
this.texture.minFilter = THREE.LinearFilter; // ThreeAdapter.ts:151
this.texture.magFilter = THREE.LinearFilter; // ThreeAdapter.ts:152
this.vectoScene.render = (renderer, dt, time) => { originalRender.call(...); this.texture.needsUpdate = true; }; // ThreeAdapter.ts:157
this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false })); // ThreeAdapter.ts:163
```

带 `file:line` 的设计说明：

- **离屏 canvas 归属** — `ThreeAdapter.ts:122` `_ownsCanvas` 跟踪 adapter 是否创建了 canvas。`dispose()`（`ThreeAdapter.ts:750`）仅在拥有 canvas 时才将 `canvas.width/height` 置零；调用方提供的 canvas 保持不动。SSR 回退（`ThreeAdapter.ts:78` `OffscreenCanvasFallback`）明确列出 `document` 为 undefined 时存在哪些成员——裸的 `{width,height} as HTMLCanvasElement` 曾掩盖该契约。
- **尺寸调整需手动** — `sceneOptions.disableWindowResize = true`（`ThreeAdapter.ts:140`）因为全窗口 `Scene` 会自动采用 `window.innerWidth/Height`（`Scene.ts:2284`）。纹理驱动的场景不得跟随窗口；宿主调用 `adapter.resize(w,h)`（`ThreeAdapter.ts:713`），它会重设后备存储、Scene 视口并标记 `texture.needsUpdate`。
- **脏标记门控的上传** — 渲染代理（`ThreeAdapter.ts:155`）仅在 Scene 实际重绘时才设 `texture.needsUpdate = true`。连续 `Scene.renderMode: 'always'` 循环仍每帧上传；`onDemand` Scene 仅在 `markDirty()` 触发时上传——而每条输入路径都会触发（`ThreeAdapter.ts:270`、`ThreeAdapter.ts:612`）。
- **默认 mesh 是便利而非规范** — `mesh` 为单位 `PlaneGeometry(1,1)`（`ThreeAdapter.ts:163`）。需要曲面屏、公告板或 VR 仪表盘的宿主可替换几何/材质并保留 `texture`。mesh 预先未加入任何场景；宿主执行 `scene3d.add(adapter.mesh)`。
- **释放卫生** — `dispose()`（`ThreeAdapter.ts:723`）在销毁 Scene _之前_将 `vectoScene.render` 恢复为 `_originalRender`（`ThreeAdapter.ts:730`），否则存活引用会在已删除纹理上设置 `needsUpdate`，Three 会记录 `trying to use deleted texture`。随后释放 `texture`、`geometry`、`material`（们）、从父节点移除 `mesh`、调用 `vectoScene.destroy()`、清空 `activePointers`、在不触发事件的情况下丢弃 `_focusedEntity`（镜像已不存在），并仅在拥有时将 canvas 置零。

`ThreeRenderer` 是另一条纹理路径——完全没有 adapter canvas。它拥有自己的 `THREE.Scene` + `THREE.OrthographicCamera(0,width,0,height)` + `THREE.WebGLRenderer({canvas, alpha:true, antialias:true})`（`ThreeRenderer.ts:256`）。其 y-down 正交、`effectiveDPR`/`pixelRatio` 限幅、上下文丢失恢复与 `present()` 推迟在 boss 07 中覆盖；与桥接相关的事实是它实现了 `IRenderer`，因此任何 `Entity.render(r)` 都无需改动即可运行，且其 `fillText`/`drawImage` 缓存以 `dpr` 与圆整后的 `x,y` 相位为键（`ThreeRenderer.ts:1002`）。

值得点名以免重复发现的桥接相关内部细节：

- **DPR** — `effectiveDPR()`（`ThreeRenderer.ts:309`）为 `min(real DPR, maxDPR)`，`pixelRatio`（`ThreeRenderer.ts:324`）为实时的 `renderer.getPixelRatio()`，而非快照。`Scene` 在每次 `resize` 时将 `maxDPR` 同步到渲染器（`Scene.ts:286`）；`ThreeRenderer.resize`（`ThreeRenderer.ts:355`）在 `setSize`/`updateProjectionMatrix` 前重应用限幅比例。以 `window.devicePixelRatio` 而非 `pixelRatio` 为键的纹理在限幅显示器上会模糊。
- **上下文丢失** — `webglcontextlost` 被 `preventDefault`（`ThreeRenderer.ts:281`）以使 `webglcontextrestored` 能触发；恢复处理器重应用 `effectiveDPR`、重设尺寸、标记 `frameDirty` 并 `present()` 到已清空的帧缓冲（`ThreeRenderer.ts:285`）。`dispose()` 解绑两个监听器并调用 `renderer.forceContextLoss()`（`ThreeRenderer.ts:1186`），因此 SPA 重挂不会泄漏存活 GL 上下文。
- **Y-down 后果** — 每个填充图元都需要 `side: DoubleSide`（`ThreeRenderer.ts:596` fill、`:658` drawImage、`:1049` fillText）与 `texture.flipY = false`（`ThreeRenderer.ts:628` drawImage、`:1035` fillText）；缺少两者，FrontSide 面会被剔除，图像/文本在 y-down 正交（`ThreeRenderer.ts:250`）下上下颠倒。
- **缓存** — `textTextureCache`（`ThreeRenderer.ts:911`）与 `imageTextureCache`（`ThreeRenderer.ts:599`）以恒等为键，在 `256` 处 LRU 驱逐（`ThreeRenderer.ts:635`、`:1040`），标记 `userData.vectoCached` 使每帧 `disposeActiveObjects`（`ThreeRenderer.ts:380`）跳过它们，`drawImage` 在命中时重插入以维持 LRU 顺序（`ThreeRenderer.ts:641`）。可变 canvas 源必须调用 `invalidateImage`（`ThreeRenderer.ts:602`）。

## 3. 坐标映射 — UV → 逻辑像素（及三个陷阱）

### 3.1 射线入口

```ts
// packages/three/src/ThreeAdapter.ts:181
public updateIntersection(raycaster: THREE.Raycaster, type, originalEvent?): boolean {
  const intersects = raycaster.intersectObject(this.mesh); // ThreeAdapter.ts:186
  if (intersects.length > 0 && hit.uv) {
    state.lastUv.copy(hit.uv);
    this.dispatchAtUv(type, hit.uv, pointerId, originalEvent);
  } else if (state.isHovering) {
    this.dispatchAtUv('pointerleave', state.lastUv, pointerId, originalEvent); // ThreeAdapter.ts:209
  }
}
```

调用方拥有 `Raycaster` —— 通常为 `raycaster.setFromCamera(ndc, camera)`，其中 `ndc` 为 `((clientX/width)*2-1, -((clientY/height)*2-1))`。即 `GraphInteraction.setPointerFromEvent`（`packages/graph3d/src/GraphInteraction.ts:157`）与 `GraphCamera` 滚轮缩放（`packages/graph3d/src/GraphCamera.ts:363`）的形态。

### 3.2 UV 到场景像素 — 逻辑而非后备存储，y 翻转

```ts
// packages/three/src/ThreeAdapter.ts:240
private dispatchAtUv(type: VectoEvent, uv: THREE.Vector2, ...): void {
  const px = uv.x * this.vectoScene.width;        // ThreeAdapter.ts:251 — logical width
  const py = (1.0 - uv.y) * this.vectoScene.height; // ThreeAdapter.ts:253 — flip Three's bottom-origin
  this.dispatchAtPoint(type, px, py, ...);
}
```

三个陷阱，每个背后都有已修复缺陷：

1. **逻辑 vs 后备存储（DPR）** — `canvas.width = logicalWidth * devicePixelRatio` 于 HiDPI（`CanvasRenderer` 后备存储，boss 07 §DPR）。实体布局与 `findEntityAt` 为逻辑。将 `uv.x * canvas.width` 相乘会使每次命中在 HiDPI 上偏移 `dpr` 倍。`ThreeAdapter.ts:246` 处注释明确说明此点；编程入口（`dispatchPointer`，`ThreeAdapter.ts:675`）同理取逻辑 `x,y`。`ThreeRenderer` 在剪刀路径（`ThreeRenderer.ts:468` `dpr = renderer.getPixelRatio()`）与 fillText 光栅化（`ThreeRenderer.ts:987`）上有对应陷阱。
2. **Y 翻转** — Three 的 UV 原点在左下，Canvas 在左上。`py = (1 - uv.y) * height`（`ThreeAdapter.ts:253`）。`ThreeRenderer` 同理为相同原因取消翻转纹理（`ThreeRenderer.ts:628` `texture.flipY = false`、`ThreeRenderer.ts:1035` fillText）。
3. **面板外点击** — 当 `state.isHovering` 时的未命中会在 `lastUv` 处合成 `pointerleave`（`ThreeAdapter.ts:209`），并在 `pointerdown` 时模糊面板焦点（`ThreeAdapter.ts:214` `if (pointerdown && _focusedEntity) setFocusedEntity(null)`）——镜像页面背景点击如何移动 DOM 焦点。

### 3.3 共享分发核心

`updateIntersection`（射线 UV）与 `dispatchPointer`（逻辑像素，`ThreeAdapter.ts:675`）皆汇聚于 `dispatchAtPoint`（`ThreeAdapter.ts:262`）：

```ts
private dispatchAtPoint(type, px, py, pointerId, originalEvent): boolean {
  this.vectoScene.markDirty();                          // ThreeAdapter.ts:270 — onDemand wake
  const hitEntity = this.vectoScene.findEntityAt(px, py); // ThreeAdapter.ts:273 — VMT hit test
  // hover transitions (ThreeAdapter.ts:277), pointerleave dedup (ThreeAdapter.ts:291),
  // then dispatchEventToTarget or canvas fallback (ThreeAdapter.ts:307)
  // then pointerdown focus (ThreeAdapter.ts:320)
}
```

`findEntityAt` 即屏上 Scene 使用的同一命中测试器（`HitTester.ts:12`，boss 06），包含 `clipChildren` 门控与旋转感知边界——无 3D 专属命中路径。

## 4. 输入路由 — 指针、滚轮、悬停与多点触控

### 4.1 悬停过渡按指针隔离

`activePointers: Map<number, PointerState>`（`ThreeAdapter.ts:101`）按 `pointerId` 跟踪 `{isHovering, lastUv, lastTargetId}`（`ThreeAdapter.ts:64`）。`pointerId` 从原始 `PointerEvent` 读取（`ThreeAdapter.ts:187`），编程/鼠标路径则默认为 `1`。在 `pointermove` 上，adapter 对比 `lastTargetId` 与当前 `hitEntity.id`，在旧实体上触发 `pointerleave`、在新实体上触发 `hover`（`ThreeAdapter.ts:277`）。在合成 `pointerleave`（mesh 离开）时，它经 `dispatchEventToTarget` 触发一次并返回 `false` 以抑制会重复离开的尾随回退分发（`ThreeAdapter.ts:291` 注释 + 提前返回）。

此处历史：修复前 adapter 会触发两次 `pointerleave`（一次经跟踪的 `lastTargetId`，一次经 `lastUv` 处通用回退），并在光标离开后向恰好位于 `lastUv` 下的实体泄漏一次离开（`vectojs-docs/forge/findings/renderer-and-gpu.md:620`）。

### 4.2 多点触控 / WebXR

触点会收到全新、单调递增的 `pointerId`。若不修剪，`activePointers` 会在 adapter 生命周期内每点击一次增长一项。`pruneEndedPointer`（`ThreeAdapter.ts:228`）在最终分发读取后，于 `pointerup`/`pointercancel` 时删除条目。`ThreeRenderer` 在 `imageTextureCache`/`textTextureCache` 中有同类泄漏（已修复 `ThreeRenderer.ts:635` LRU 驱逐）。

`GraphCamera` 在 3D 层有互补守卫：活跃拖动拥有其 `pointerId` 直到自身的 `pointerup`/`pointercancel` —— 第二触点不得覆盖 `dragging`/`lastX`/`button`（`packages/graph3d/src/GraphCamera.ts:305`）。

### 4.3 滚轮 — 无中性默认值

`createDOMEvent`（`ThreeAdapter.ts:372`）在 `type === 'wheel'` 时分支：当存在原始 `WheelEvent` 时以其 `deltaX/Y/Z/deltaMode` 合成 `WheelEvent`，否则为 `0`（`ThreeAdapter.ts:381`）。指针字段在未提供原始事件时，以与射线路径相同的中性默认值合成 `button/buttons/modifiers`（`ThreeAdapter.ts:48` `ThreeAdapterPointerInit` 文档）。`dispatchPointer` 明确_不_覆盖滚轮（`ThreeAdapter.ts:664` 文档——增量没有中性默认值；请经 `updateIntersection` 传入真实 `WheelEvent` 路由滚轮）。

每个分发的事件都携带 `clientX/clientY = px/py`（逻辑场景像素）与非标准 `vectoSceneX/Y` 属性（`ThreeAdapter.ts:412` `Object.defineProperties`），因此需要场景空间的处理器无需反翻转或反缩放。`originalEvent` 作为 `VectoJSEvent.nativeEvent` 转发（`ThreeAdapter.ts:364`），处理器可逐字读取 `deltaMode`/`button`。

`ThreeAdapterPointerInit`（`ThreeAdapter.ts:54`）记录编程路径的默认值：`button`/`buttons` 为 0，修饰键关闭——与未提供原始事件时的射线路径不可区分。`ThreeAdapterPointerType`（`ThreeAdapter.ts:40`）是两入口接受的闭合联合；`type` 仅在 `dispatchAtPoint`（`ThreeAdapter.ts:263`）内拓宽为 `VectoEvent`。

### 4.4 编程驱动 vs 射线驱动

两入口刻意对称但不相同：

| 入口                                                                  | 调用方提供                      | UV 步骤                                                            | 滚轮                           | 用于                             |
| --------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------ | ------------------------------ | -------------------------------- |
| `updateIntersection(raycaster, type, event)`（`ThreeAdapter.ts:181`） | `THREE.Raycaster` + DOM `Event` | `raycaster.intersectObject(this.mesh)` → `hit.uv` → `dispatchAtUv` | 是 — 转发带增量的 `WheelEvent` | 实时 3D 指针/滚轮、VR 控制器射线 |
| `dispatchPointer(type, x, y, init)`（`ThreeAdapter.ts:675`）          | 逻辑 `x,y` + 可选 `PointerInit` | 无 — `x,y` 已是场景像素                                            | 否 — 增量无中性默认值          | 测试、自动化、无头               |

两者皆汇聚于 `dispatchAtPoint`（`ThreeAdapter.ts:262`），因此悬停过渡、焦点、`markDirty` 与 `isConnected` 分发门控表现一致。`dispatchPointer` 是唯一创建自身 `PointerEvent` 的入口（`ThreeAdapter.ts:690`）——它必须如此，因为编程情形下没有后备 DOM 事件。

### 4.5 Canvas 回退

当 `findEntityAt` 返回 `null`（空白区域）时，事件分发到 `this.canvas` 自身（`ThreeAdapter.ts:312` `canvas.dispatchEvent(fallbackEvent)`）。对屏上 Scene，这会经无障碍镜像冒泡；对离屏 adapter，它让 Scene 级处理器仍能观察背景点击（随后模糊焦点，见 §5）。

## 5. 焦点与键盘归属 — 离屏故需合成

### 5.1 为何面板焦点不是 `document.activeElement`

adapter 的 canvas 从不追加到 `document`，因此其 `a11yRoot`（Scene 为镜像创建的容器）也永不连接。`getA11yElement(entity.id)` 仍返回真实元素（`Scene.syncA11y` 无论如何都会填充），但 `el.isConnected === false` 恒成立。要求已连接元素的原生 API（`setPointerCapture`、稳健的 `focus()`）在这些元素上会抛出，因此 adapter 将断开镜像视作不存在。

面板焦点因此是 **adapter 侧状态**：`ThreeAdapter._focusedEntity`（`ThreeAdapter.ts:111`）及解释该间隙与合成 `FocusEvent` 桥接的文档注释。经 `focusedEntity` getter（`ThreeAdapter.ts:441` —— 释放时返回 `null`）与 `focus(entity|null)` / `blur()`（`ThreeAdapter.ts:458`）访问。

### 5.2 焦点如何移动

- **指针驱动** — 事件分发后，`pointerdown` 聚焦命中实体最近的可聚焦祖先（`ThreeAdapter.ts:321` `focusNearestFocusable(hit)`），空白区域则失焦。`focusNearestFocusable`（`ThreeAdapter.ts:499`）沿 `hit.parent` 链行走并在每节点测试 `isFocusable` ——因此点击 `<button>` 内 `<span>` 会聚焦按钮，匹配 DOM。若链中无可聚焦，则失焦（`ThreeAdapter.ts:506`）。焦点转换在事件_之后_运行，使处理器观察到点击前的焦点世界，匹配原生 `pointerdown` 后聚焦的顺序（`ThreeAdapter.ts:319` 注释）。
- **编程方式** — `focus(entity)`（`ThreeAdapter.ts:458`）接受任意实体（即使不可聚焦），以便测试/自动化可强制聚焦；指针路径更严格，仅聚焦投影声明可达的。
- **`isFocusable` 契约**（`ThreeAdapter.ts:478`）——当镜像携带 `tabindex`（显式 `tabIndex` 或核心为交互式 ARIA 角色添加的隐式 `0`）或渲染为原生可聚焦标签（`button`/`input`/`textarea`/`select`/`a[href]`）时为真。在首次投影同步前回退到原始 `getA11yAttributes()` 值。

### 5.3 合成 FocusEvent 桥接

`setFocusedEntity`（`ThreeAdapter.ts:516`）在存在时于旧镜像上分发合成 `FocusEvent('blur')`、在新镜像上分发 `FocusEvent('focus')`；否则直接在实体上 `emit`。这让核心自身监听器保持不变：实体 `focus`/`blur` 触发、`Scene.focusedA11yElement` 跟踪与 `Input` 光标闪烁唤醒/清理。每次转换亦 `markDirty()`，使焦点视觉（光标、高亮）在 `onDemand` 模式下重绘（`ThreeAdapter.ts:529`）。

### 5.4 键盘路由 — `dispatchKey` 与归属

```ts
// packages/three/src/ThreeAdapter.ts:573
public dispatchKey(key: string, mods: ThreeAdapterKeyModifiers = {}, phase: 'press'|'keydown'|'keyup' = 'press'): void {
  const init = { key, code: mods.code ?? ThreeAdapter.codeFor(key), ...mods, bubbles:true, cancelable:true };
  if (phase !== 'keyup') this.routeKeyEvent(new KeyboardEvent('keydown', init));
  if (phase !== 'keydown') this.routeKeyEvent(new KeyboardEvent('keyup', init));
}
```

`codeFor`（`ThreeAdapter.ts:597`）从 `key` 推断 `KeyboardEvent.code`：字母到 `Key<X>`、数字到 `Digit<N>`、空格到 `Space`，其他透传——尽力而为，因为 `code` 与布局相关。

`routeKeyEvent`（`ThreeAdapter.ts:610`）实现四条规则（`ThreeAdapter.ts:536` 处文档）：

1. **无面板焦点** — 事件直达 `window`；核心场景级通道（`Scene.ts:3351` `dispatchKeyboard`）应用其原生门控（`defaultPrevented`、自动重复、`ownsKeyboard(document.activeElement)`）。Orbit 相机消费者与宿主输入从不被饿死。
2. **有面板焦点，于镜像处** — 在聚焦镜像上分发，使核心通用按键转发与 `#694` Enter/Space 激活生效。若无镜像，则在实体上产生 `VectoJSEvent`。
3. **归属 — 停止** — 若 `entityOwnsKeyboard(focused)`（`ThreeAdapter.ts:643`）返回 true（标签 `input`/`textarea`/`select`，或 `Scene.ts:115` 中 `KEYBOARD_OWNING_ROLES` 里的 `role` —— `textbox`、`searchbox`、`spinbutton`、`option`、`listbox`、`button`、`link`、`tab`、`menuitem`、`slider`、`combobox`），事件被消费；不会泄漏到 `window`。标签+角色集合镜像 `Scene.ownsKeyboard`（`Scene.ts:143`），并经导出集合刻意统一。
4. **否则，冒泡到 window** — 除非实体处理器设置了 `nativeEvent.defaultPrevented` 或 `cancelBubble`，匹配已连接 canvas 的冒泡。该门控使面板处理器可在 Enter 上 `preventDefault()` 以抑制宿主快捷键。

这正是 `vectojs-three` skill 配方（`.agents/skills/vectojs-three/references/three-recipes.md:60`）`adapter.focus(panel); adapter.dispatchKey('Enter')` 与 `isFocusable` 守卫背后的机制。

## 6. 3D 内的语义投影 — AT 所见

在已连接 canvas 上，`Scene.syncA11y` 将每个交互实体的 `getA11yAttributes()` 投影为透明、绝对定位的 DOM 镜像（role、label、tabindex、bounds）。屏幕阅读器与 Playwright 的 `getByRole` 驱动这些镜像。命中测试与分发事件是可分离关注点：Scene 的 `HitTester`（`HitTester.ts:12`）是命中权威，而镜像是分发传输（`Scene.ts:3512` 每镜像监听器）——离屏桥接所依赖的区分。

在 `ThreeAdapter` 内，镜像以相同方式创建——`Scene` 不知 canvas 离屏——但它们从不连接到 `document`。后果：

- **AT 默认不可见** — `CanvasTexture` 面板不在页面的无障碍树中。若 3D 场景需要 AT 可达，宿主必须渲染同一 Scene 的 2D 覆盖，或经独立、已连接的 Scene 暴露面板。adapter 不凭空创造；它保留 2D 投影契约，将 3D 宿主的页面结构留给宿主。这是正确默认：纹理没有 DOM 语义。
- **分发回退 — `isConnected` 具承载性** — `dispatchEventToTarget`（`ThreeAdapter.ts:330`）检查 `a11yEl && a11yEl.isConnected`（`ThreeAdapter.ts:349`）。已连接镜像获得真实 `PointerEvent`/`WheelEvent` 分发，使原生绑定小部件（如调用 `setPointerCapture` 的投影 `<input>`，或在 `ThreeAdapter.ts:360` 处调用 `a11yEl.focus()` 的每实体 `focus()` 路径）以浏览器原生分发工作。断开镜像走回退：经虚拟树冒泡的 `new VectoJSEvent(type, entity, originalEvent, …, {x,y})`（`ThreeAdapter.ts:363`）。`ThreeAdapter.ts:341` 处注释解释失败模式——断开元素上 `setPointerCapture` 抛出、`focus()` 为空操作——因此经回退路由不是风格选择，而是正确性门控。
- **指针事件不以 `pointerEvents: 'none'` 对后代设门** — adapter 的命中测试是 Scene 上的 `findEntityAt`，而非 CSS 命中测试。在 2D 页面上有意义的 `pointerEvents: 'none'` 语义（boss 03，`ScrollView` `pointerEvents: 'none'` 交互）不影响 3D 路径；仅 2D 镜像路径尊重它。在 adapter 路径中，命中在尝试任何 DOM 分发前已解析。
- **焦点镜像同一分裂** — `setFocusedEntity` 在 `isConnected` 时于镜像上分发，否则在实体上 `emit`（`ThreeAdapter.ts:516`）；两条路径驱动相同核心监听器（实体 `focus`/`blur`、`Scene.focusedA11yElement`、光标闪烁），因此 `onFocus` 处理器无需分支。

`ThreeRenderer` 无投影关切——它是渲染器而非 Scene ——因此完全没有无障碍路径。`ThreeRenderer` 支持的 Scene 仍经正常 2D `Scene` 无障碍层投影，因为渲染器从不触碰 `a11yRoot`。

在 adapter 分发分支两侧的差异（`ThreeAdapter.ts:341` vs `ThreeAdapter.ts:363`）：

```ts
// 已连接镜像 — 真实 DOM 分发，原生捕获/焦点生效
a11yEl.dispatchEvent(domEvent); // ThreeAdapter.ts:351
if (type === 'pointerdown' && (a11yEl instanceof HTMLInputElement || …)) a11yEl.focus();

// 断开镜像 — 虚拟树冒泡，无 DOM
entity.dispatchEvent(new VectoJSEvent(type, entity, originalEvent, …, { x, y })); // ThreeAdapter.ts:363
```

## 7. 纯 Three 对应 — `Graph3D` 家族

`@vectojs/graph3d` 展示非 adapter 3D 消费者外观——无 `ThreeAdapter`、无 Scene、无无障碍投影。它是 adapter 何处需要、何处不需要的参考。

| 部件                                 | 职责                                                                                     | 关键文件:行                                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `Graph3D`                            | 实例化呈现：`group`（`Graph3D.ts:30`）下单 `InstancedMesh` 节点 + 单 `LineSegments` 连边 | `Graph3D.ts:28` group、`Graph3D.ts:115` InstancedMesh、`Graph3D.ts:136` LineSegments                                         |
| `GraphCamera`                        | 2D 正交 vs 3D 透视平移/缩放/环绕控制                                                     | `GraphCamera.ts:73` GraphCamera、`GraphCamera.ts:200` setSize 缩放修复、`GraphCamera.ts:354` 光标处滚轮缩放                  |
| `GraphInteraction`                   | `Raycaster` + NDC → `pickNode` → 悬停/选中/拖动钉住                                      | `GraphInteraction.ts:83` GraphInteraction、`GraphInteraction.ts:157` setPointerFromEvent、`GraphInteraction.ts:246` pickNode |
| `VectoForceLayout` / `D3ForceLayout` | 向 `applyPositions` 馈送 `Float32Array` 位置的布局契约                                   | `packages/graph3d/src/layout/`                                                                                               |

值得镜像 adapter 坑点的不变量：

- **`setGraphData` 在变更前抛出** — 链接端点经 `indexById`（`Graph3D.ts:80`）解析并校验（`Graph3D.ts:90` 抛出），先于 `clearMeshes()`（`Graph3D.ts:99`）或任何网格挂载，因此被拒绝的图保持场景完好（`Graph3D.ts:73` 文档，`forge 2026-08-13` 条目）。
- **`applyPositions` 防御 NaN** — `positions.length < nodeCount*3` 在写入前提前退出，每次 `setGraphData` 警告一次（`Graph3D.ts:162` `hasWarnedShortPositions`，于 `Graph3D.ts:100` 重置），并跳过更新以避免 NaN 实例矩阵与会将整网格视锥剔除的 NaN 包围球（`Graph3D.ts:148` 文档）。无需逐连边边界检查，因为 `setGraphData` 已校验每个端点。
- **`pickNode` 感知实例** — `raycaster.intersectObject(nodeMesh)` 过滤为 `h.instanceId != null`（`Graph3D.ts:248`），返回与布局对齐的 `GraphData.nodes` 索引。
- **`GraphCamera.setSize` 缩放双重应用修复** — 视锥保持未缩放半尺寸；仅 `camera.zoom` 承载缩放（`GraphCamera.ts:200` 注释：将缩放烘入视锥_并_设置 `camera.zoom` 会使可见范围为 `1/zoom²` 并将图 snap 出视口）。
- **`GraphInteraction` 指针捕获** — 在 `pointerdown` 时于 `domElement` 上 `setPointerCapture`（`GraphInteraction.ts:284`）并经 `window` `pointerup`/`pointercancel`（`GraphInteraction.ts:135`），因此画布外的释放仍结束拖动并重启用宿主控制；`dispose()` 中途拖动会执行收尾路径（`GraphInteraction.ts:314`）。

## 8. 坑点与陷阱（附 file:line）

| 陷阱                                             | 位置                                                             | 症状                                                                                    | 已修复 / 状态                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| UV × 后备存储而非逻辑尺寸                        | `ThreeAdapter.ts:246` 注释                                       | HiDPI 上每次命中向下/向右偏移 `dpr` 倍                                                  | 已修复 — 使用 `vectoScene.width/height`                            |
| Y 未翻转                                         | `ThreeAdapter.ts:253`                                            | 命中垂直镜像                                                                            | 已修复 — `(1-uv.y)*height`                                         |
| 断开时仍分发无障碍镜像                           | `ThreeAdapter.ts:349` `isConnected`                              | `setPointerCapture` 抛出、`focus()` 空操作                                              | 已修复 — 回退到 `VectoJSEvent`                                     |
| 网格离开时重复 `pointerleave`                    | `ThreeAdapter.ts:291` 提前返回                                   | 实体被命中两次、邻居泄漏离开                                                            | 已修复 `ThreeAdapter.ts:291` 跳过尾随分发（`forge 2026-08-13`）    |
| `activePointers` 每点击增长                      | `ThreeAdapter.ts:228` `pruneEndedPointer`                        | 无界 Map，WebXR/多点触控                                                                | 已修复 — `pointerup`/`pointercancel` 时删除                        |
| 滚轮无中性默认值                                 | `ThreeAdapter.ts:664` 文档                                       | `dispatchPointer('wheel',…)` 会合成错误增量                                             | 按设计 — 以真实 `WheelEvent` 使用 `updateIntersection`             |
| 面板外 `pointerdown` 未失焦                      | `ThreeAdapter.ts:214`                                            | 点击 3D 空白后面板仍保持焦点                                                            | 已修复 — 外部 `pointerdown` 时失焦                                 |
| `render` 代理在释放时未恢复                      | `ThreeAdapter.ts:113` `_originalRender`                          | `needsUpdate` 于已删除 `CanvasTexture` → `THREE.Texture: trying to use deleted texture` | 已修复 `ThreeAdapter.ts:730`                                       |
| 尽管调用方提供仍将 Canvas 置零                   | `ThreeAdapter.ts:122` `_ownsCanvas`                              | 释放后调用方 canvas 被清空                                                              | 已修复 — 仅在拥有时置零                                            |
| y-down 正交下 `ThreeRenderer` `FrontSide` 被剔除 | `ThreeRenderer.ts:250` 相机、`ThreeRenderer.ts:596` `DoubleSide` | `fillCircle`/填充/渐变/drawImage 不可见                                                 | 已修复（`forge 2026-08-13`、`ThreeRenderer.ts:596`）               |
| `drawImage` 垂直翻转                             | `ThreeRenderer.ts:628` `flipY = false`                           | 每个 blit 图像上下颠倒                                                                  | 已修复（`forge 2026-08-23`、`ThreeRenderer.ts:478`）               |
| `LineBasicMaterial.linewidth` 被忽略             | `ThreeRenderer.ts:110` `buildStrokeRibbon`                       | 每条描边为发丝                                                                          | 已修复 — 条带几何                                                  |
| `fillText` 将字重解析为尺寸                      | `ThreeRenderer.ts:274` `parseFontSize`                           | 粗体文本 700px 高、基线低 `fontSize/2`                                                  | 已修复（`forge 2026-08-13 #486`、`ThreeRenderer.ts:274` + `:831`） |
| `Graph3D` 在错误链接 id 上半构建                 | `Graph3D.ts:73`                                                  | 节点已挂载、连边缺失、陈旧缩放                                                          | 已修复 `Graph3D.ts:80` 先解析                                      |
| `applyPositions` 尺寸不足数组 → NaN              | `Graph3D.ts:148`                                                 | 节点消失、视锥空白                                                                      | 已修复 `Graph3D.ts:162` 守卫 + 闩锁警告                            |
| `GraphInteraction` 拖动中途释放                  | `GraphInteraction.ts:314`                                        | 宿主控制卡在禁用                                                                        | 已修复 — `dispose` 中 `finishDrag`                                 |
| `GraphCamera` 尺寸调整时双重缩放                 | `GraphCamera.ts:200`                                             | 缩放 `1/zoom²`、图 snap 出去                                                            | 已修复 — 视锥保持未缩放                                            |

## 9. 配方 — 何时使用哪条路径

**3D 场景中的面板（HUD、仪表盘、VR 屏幕）：**

```ts
// .agents/skills/vectojs-three/references/three-recipes.md:10 + :24
import { ThreeAdapter } from '@vectojs/three';
import { Button, Stack, Text } from '@vectojs/ui';
const adapter = new ThreeAdapter({ width: 800, height: 500 });
const panel = new Stack({ direction: 'vertical', gap: 16 });
panel.add(new Text('VectoJS in 3D', { font: '700 28px Inter' }));
adapter.vectoScene.add(panel);
adapter.vectoScene.start();
scene3d.add(adapter.mesh);
// pointer routing — raycaster owns the 3D hit, adapter owns the 2D dispatch
const handled = adapter.updateIntersection(raycaster, type, event);
if (handled) event.preventDefault();
```

- 从 `window`/`document` 监听器调用 `adapter.updateIntersection(raycaster, type, event)`，传入真实 `PointerEvent`/`WheelEvent` 以转发按钮/修饰键状态与滚轮增量。当 `handled` 为 true 时 3D 命中已被消费——对宿主事件 `preventDefault()`，使页面不在其下滚动/选中。
- 对测试/自动化使用 `adapter.dispatchPointer(type, x, y)`（`ThreeAdapter.ts:675`）——逻辑像素、与射线相同下游路径，但滚轮仍走射线路径（无中性增量可合成，`ThreeAdapter.ts:664`）。
- 焦点：`adapter.focus(entity)` / `adapter.blur()`（`ThreeAdapter.ts:458`），以 `adapter.isFocusable(entity)`（`ThreeAdapter.ts:478`）查询。键盘：`adapter.dispatchKey('Enter')`（`ThreeAdapter.ts:573`）——默认完整按下，或 `dispatchKey('a', {shiftKey:true}, 'keydown')` 用于按住的键。焦点驱动 `ownsKeyboard` 门控，决定按键是否泄漏到 `window`。
- 尺寸：宿主 canvas 或面板尺寸变化时 `adapter.resize(w, h)`（`ThreeAdapter.ts:713`）；Scene 不跟随 `window`（`ThreeAdapter.ts:140` `disableWindowResize`）。
- 拆解：`scene3d.remove(adapter.mesh); adapter.dispose()`（`ThreeAdapter.ts:723`）——恢复渲染代理（`ThreeAdapter.ts:730`）、释放纹理/几何/材质、移除 mesh、销毁 Scene、清空指针/焦点。

**无 2D 面板的 3D 图：**

直接使用 `Graph3D` + `GraphCamera` + `GraphInteraction` —— 无需 adapter。`Graph3D.group` 加入宿主场景，`GraphCamera` 拥有相机及其自身 `pointerdown/move/up/wheel` 监听器（`GraphCamera.ts:150`），`GraphInteraction` 拥有 `domElement` 上 `pointermove/down` 加 `window` `pointerup/cancel` 以处理画布外拖动。以 `() => graphCamera.camera` getter 接线，使 `setMode('2d'|'3d')` 保持实时（`GraphInteraction.ts:5` `GraphInteractionCamera`）。

**宿主拥有相机（如 `OrbitControls` + 图）：**

传入 `setControlsEnabled`（`GraphInteraction.ts:53`），使节点拖动在拖动期间禁用相机控制。同一模式适用于与 3D 场景共享 canvas 的 adapter 面板：相机拖动时对面板的 `updateIntersection` 设门，反之亦然。

## 10. 开放问题与 XR 前景

- **XR 会话交付** — WebXR 控制器产生 `select`/`squeeze` + `XRInputSource` 射线，而非 `PointerEvent`。adapter 的 `pointerId` 映射（`ThreeAdapter.ts:101`）已泛化到多指针，但宿主必须从 XR 视图 + 输入姿态合成 `Raycaster`，并按输入源调用 `updateIntersection`。尚无 `XRRaycaster` 辅助。
- **一 canvas 两面板** — `updateIntersection` 对单个 `mesh` 做命中测试（`ThreeAdapter.ts:186` `intersectObject(this.mesh)`）。同一 Three.js 场景中两个 adapter 需要每 adapter 射线或共享 `intersectObjects([a.mesh, b.mesh])` 并按 `hit.object` 分发。每 `pointerId` 悬停状态按 adapter 隔离，因此跨面板 `pointerleave` 已隔离。
- **3D 面板的 AT** — 如 §6 所述，离屏镜像对 AT 不可见。需要 AT 的 XR 或仅 WebGL 部署必须保持已连接的 2D Scene（或 DOM 覆盖）同步—— adapter 不解决此问题，因为页面的无障碍树对纹理而言超出范围。
- **SSR / OffscreenCanvas** — `ThreeAdapter.ts:130` 在 `document` 为 undefined 时回退到 `{width,height}` 对象。`THREE.CanvasTexture` 仍期望纹理图像源；需在服务端预渲染的宿主需要真实 `OffscreenCanvas` 或延迟的 adapter 构造。

## 11. 在此领域发布变更前的检查清单

- [ ] **无 `uv.x * canvas.width`。** 每条 UV→像素路径使用 `vectoScene.width/height`（逻辑），而非 `canvas.width/height`（后备存储）。在 `packages/three/src/ThreeAdapter.ts` 中 grep `canvas\.width`。
- [ ] **Y 已翻转。** `py = (1 - uv.y) * height`（`ThreeAdapter.ts:253`）；blit 到场景的纹理为 `flipY = false`（`ThreeRenderer.ts:628`、`:1035`）。
- [ ] **`updateIntersection` 与 `dispatchPointer` 汇聚。** 新输入语义进入 `dispatchAtPoint`（`ThreeAdapter.ts:262`），使射线与编程路径不分叉。
- [ ] **`isConnected` 门控保留。** `dispatchEventToTarget`（`ThreeAdapter.ts:349`）在向镜像分发前检查 `a11yEl.isConnected`；离屏情形的 `VectoJSEvent` 回退必须保留。
- [ ] **面板焦点已桥接。** 每次 `setFocusedEntity` 转换在镜像上分发合成 `FocusEvent` 并 `markDirty()`（`ThreeAdapter.ts:516`）；`pointerdown` 焦点沿 `isFocusable` 祖先行走（`ThreeAdapter.ts:499`）。
- [ ] **键盘归属统一。** `entityOwnsKeyboard`（`ThreeAdapter.ts:643`）使用与 `Scene.ownsKeyboard`（`Scene.ts:115`、`Scene.ts:143`）相同的 `KEYBOARD_OWNING_ROLES` 集合；向一处添加角色必须更新另一处。
- [ ] **`hover` vs `pointermove` 保留。** `dispatchAtPoint` 将 `pointermove` 悬停过渡映射为新实体上 `hover` 与旧实体上 `pointerleave`（`ThreeAdapter.ts:277`）；改变事件名会破坏 `Entity.on('hover',…)` 处理器。
- [ ] **`pointerleave` 去重完好。** 合成网格离开 `pointerleave`（`ThreeAdapter.ts:291`）不得落入通用分发—— `return false` 具承载性。
- [ ] **`activePointers` 已修剪。** `pruneEndedPointer`（`ThreeAdapter.ts:228`）在 `updateIntersection` 与 `dispatchPointer` 两处的 `pointerup`/`pointercancel` 上（外加 `ThreeRenderer` LRU 上限）。
- [ ] **`needsUpdate` 受门控。** 渲染代理（`ThreeAdapter.ts:157`）仅在 Scene 重绘时才设 `needsUpdate`；`resize`/`dispose` 语义（`_ownsCanvas`、`_originalRender`）保持不动。
- [ ] **`Graph3D` 守卫保持。** `setGraphData` 在变更前解析链接（`Graph3D.ts:80`），`applyPositions` 在数组过短时提前退出（`Graph3D.ts:162`），`GraphInteraction` 在拖动中途清理（`GraphInteraction.ts:314`）。

## 关联

- **Boss 06（VMT 运行时）**拥有 `Scene`、`Entity`、`findEntityAt`、`focusedA11yElement` 及 adapter 复用的 `WASM_UPLOAD_REJECT_LIMIT` / 结构版本接线。
- **Boss 07（渲染器）**拥有 `IRenderer`、`CanvasRenderer` 的 DPR/后备存储上限、y-down 正交、剪刀与 `present()` vs `flush()` 批处理，`ThreeAdapter`（经 `CanvasRenderer`）与 `ThreeRenderer`（作为 `IRenderer`）皆继承之。
- **Boss 11（图布局）**拥有向 `Graph3D.applyPositions` 馈送的力导向内核；`@vectojs/graph-layout` 2D 四叉树（`BarnesHutQuadtree.ts`）保持仅 JS，而 `crates/vectojs-force-rs` 加速 3D 八叉树。
- **Boss 08（WASM）**共享 `Scene` 视口与 `appliedDPR` 值；跨内存增长的陈旧类型化数组视图是本 boss 纹理缓存的类比。

## 参考

- `packages/three/src/ThreeAdapter.ts:1` —— adapter：离屏 canvas、`CanvasTexture`、渲染代理、射线 + 编程输入、面板焦点/键盘
- `packages/three/src/ThreeRenderer.ts:1` —— 经 Three.js 的 `IRenderer`：y-down 正交、条带描边、渐变着色器、DPR、缓存、`present()`/`dispose()`
- `packages/three/src/index.ts:1` —— 公开 barrel（`ThreeAdapter`、`ThreeRenderer`）
- `packages/graph3d/src/Graph3D.ts:1` —— 实例化节点 + 线条连边、`setGraphData` 先解析、`applyPositions` 守卫、`pickNode`
- `packages/graph3d/src/GraphCamera.ts:1` —— 正交/透视相机 + 平移/缩放/环绕、`setSize` 缩放修复、光标处滚轮缩放
- `packages/graph3d/src/GraphInteraction.ts:1` —— `Raycaster` + NDC、`pointerId` 悬停/拖动钉住、`window` up/cancel、`setControlsEnabled`
- `packages/core/src/tree/Scene.ts:115` `KEYBOARD_OWNING_ROLES` / `Scene.ts:143` `ownsKeyboard` / `Scene.ts:1446` `focusedA11yElement` / `Scene.ts:3512` 每镜像分发 —— adapter 所镜像的 2D 归属
- `.agents/skills/vectojs-three/references/three-recipes.md:1` —— 面板、指针、滚轮、编程与释放配方
- `vectojs-docs/forge/findings/renderer-and-gpu.md:1` —— 渲染器/gpu 发现（DPR、`FrontSide` 剔除、`flipY`、发丝、缓存泄漏、投影陷阱）

---

_系列：00 总览 → 01 选区 → 02 文本+布局 → 03 投影+虚拟化 → 04 流式 Markdown → 05 TeX → 06 VMT 运行时 → 07 渲染器 → 08 WASM G1/G2/G3 → **09 Three/XR** → 10 视频导出 → 11 图布局 → 12 DevTools → 99 综合。_
