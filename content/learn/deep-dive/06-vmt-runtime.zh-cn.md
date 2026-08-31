+++
title = "06 — VMT 运行时 — 生命周期 / 脏标记 / 事件"
description = "Virtual Math Tree 运行时：实体生命周期、脏标记/失效粒度、世界矩阵合成与捕获/冒泡事件分发——以及会破坏这三条不变量的祖先遍历与生命周期泄漏陷阱。"
weight = 26
+++

# 06 — VMT 运行时 — 生命周期 / 脏标记 / 事件

> Virtual Math Tree 不是你拿去渲染的场景图。它是一棵保留式数值树，每一帧都会重新合成变换、判定何为脏、剔除不可见内容、对可交互内容做命中测试，然后才绘制。DOM 是投影；canvas 才是真值。本文档是维持该真值一致性的控制循环。

## 1. 一图看懂 VMT 管线

```text
                    Entity tree               packages/core/src/tree/Entity.ts:782
                    (Scene.root)              Scene holds root + overlayRoot, never reassigns
                         │
                         │  add/remove/reparent  Entity.ts:1065 add / :1117 remove
                         │  structureVersion++   Scene.ts:3462 structureVersion
                         ▼
               ┌─────────────────────┐
               │  Dirty propagation  │   DirtyTracker  scene/DirtyTracker.ts:70
               │  markDirty / clear  │   dirty:boolean  Scene.ts:534
               └─────────┬───────────┘   consumed BEFORE update  Scene.ts:5646
                         │
                         ▼
               ┌─────────────────────┐
               │ Transform gather    │   getWorldTransform  Entity.ts:1668
               │ T·S·R compose       │   _worldFrame cache  Entity.ts:845 / :1668 fast path
               │ per-frame cache     │   currentFrame++     Scene.ts:5806 (O(1) invalidation)
               │ WASM SoA store (G1) │   _storeSlot         Entity.ts:865 / WasmBackendFacade.ts:30
               └─────────┬───────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
     ┌────────────────┐   ┌──────────────────┐
     │ Layout         │   │ Hit test         │   HitTester  scene/HitTester.ts:17
     │ LayoutEngine   │   │ findEntityAt     │   :121 JS walk fallback
     │ measurePrepared│   │ isHitEligible    │   :326 clip + opacity + pointerEvents
     │ layoutPrepared │   │ WASM grid        │   :144 ensureHitGrid / :185 fused gather
     └───────┬────────┘   └────────┬─────────┘
             │                     │  pointer capture  Scene.ts:3851 setPointerCapture
             └──────────┬──────────┘   capture/bubble  Entity.ts:1610 dispatchEvent
                        ▼
              ┌───────────────────┐
              │ Render walk       │   Scene.ts:5730 render / :5569 loop
              │ cull → paint      │   renderMode always/onDemand  Scene.ts:401
              │ a11y sync after   │   syncA11y deferred when animating
              └───────────────────┘
                        │
                        ▼
                   Pixels + DOM mirrors
```

因果顺序是固定的——`Scene.ts:5745` 将其记录为正确性契约——尽管物理遍历可能会融合。JS 路径按前序对每个节点交错执行 `update → compose → cull → paint`；WASM 路径先更新整棵树，然后在同一次剔除/绘制遍历前以一次 SoA 遍历完成收集与合成。两者都必须在同一帧内暴露 `update()` 变更。

## 2. 生命周期 — 创建 / 添加 / 移除 / 销毁

### 2.1 Entity 形态

`Entity`（`Entity.ts:782`）是 `abstract`。每个实例都携带：

- `id: string` —— 省略时为随机 `entity_<7>`（`Entity.ts:1055` 构造函数）。
- `parent: Entity | null`（`:791`）、`children: Entity[]`（`:790`）。`parent` 是唯一的归属链接。
- `scene` getter（`:796`）——沿 `parent` 走到真正的拥有者；除 Scene 自身的 `_scene` 逃生口外，从不直接存储在实体上。
- 局部变换：`_x/_y/_scaleX/_scaleY/_rotation/_opacity`（`:805`），带 `_hasTransitions` 快路径标志（`:812`），因此被动实体的 `x = v` 只需一次布尔检查 + 字段写入。
- 惰性分配的 `Map`：`_drivers`、`listeners`、`captureListeners`（`:819`）——首次使用前为 null。2 万粒子的场景永远不会分配它们。
- `_mounted: boolean`（`:816`）、`_destroyed: boolean`（`:817`）、`_driversTickedFrame: number`（`:828`，初始为 `-1`）。
- 世界矩阵缓存 `_wa.._wf / _worldFrame`（`:845`）与 WASM 槽位 `_storeSlot: number`（`:865`，不在 store 中时为 `-1`）。

子类重写 `getBounds()`、`drawSelf()`、`getContentProjection()`、`update()`、`onMounted()`、`destroy()`。

### 2.2 add — 带环检测与结构失效的挂载

`Entity.add(...children)`（`:1065`）转发到 `_addOne`（`:1075`）：

1. 环检测——`child === this` 时抛出；沿 `this.parent` 链行走检查祖先相等性（`:1080`）。O(depth)，而 add 相比每帧工作是稀少的。
2. 从旧父节点分离——当 `child.parent` 已设置时执行 `child.parent.remove(child)`，因此重设父节点永远不会重复。
3. `child.parent = this; this.children.push(child)` —— O(1) 尾部追加。
4. 若 `this.scene` 存在（存活树）：
   - `s.a11yNeedsReorder = true`
   - `s.markStructureChanged()` ——递增 `structureVersion`，使 WASM 变换 store 布局失效（`Scene.ts:1625` `_storeStructureVersion`）。
   - `s.markDirty({ entity: this.id, reason: 'child-added' })`（`:1086`）。
   - `child._notifyMounted()`（`:1087`）——深度优先的 `onMounted()`，由 `_mounted` 守卫，因此重挂的子树只触发一次。
   - `s._registerActiveDriverSubtree(child)` ——恢复该子树分离时正在飞行中的所有批处理驱动（与 `remove` 的注销互为镜像）。

多个子节点（`add(a,b,c)`）按参数顺序以相同语义挂载。

### 2.3 remove — 带驱动注销的分离

`Entity.remove(child)`（`:1117`）是 `indexOf` + `splice`：

1. `child.parent = null`。
2. `s.detachA11y(child)` + `a11yNeedsReorder`。
3. `s.markStructureChanged()` + `markDirty({ reason: 'child-removed' })`（`:1123`）。
4. `s._unregisterActiveDriverSubtree(child)` ——将离树子树从 `DriverTicker.active` 中移除，使其驱动停止 tick 并解除对实体的钉住。若在驱动 settle 前重新挂载，`_addOne` 的镜像会恢复它们。

移除非子节点是空操作（返回 `this`）。没有 `removeAll()` ——请遍历或调用 `destroy()`。

### 2.4 destroy — 自叶向根的递归拆解

`Entity.destroy()`（`:1525`）——通过 `_destroyed` 守卫幂等：

```ts
while (this.children.length > 0) this.children.at(-1)!.destroy();
animations = null;
for (const d of this._drivers.values()) this._settleDriver(d); // resolve animateTo promises
this._drivers.clear();
listeners.clear();
captureListeners.clear();
if (this.parent) this.parent.remove(this);
```

- 自叶向根（从尾部销毁），因此每个子节点的 `parent.remove(this)` 恰好变异正在遍历的尾部——无需快照，无索引错位。
- 拥有 GPU/DOM 资源的子类会先释放资源，再调用 `super.destroy()`（`ComputeParticleEntity.ts:419`、`DOMPortalEntity.ts:142`）。
- 通过 `_settleDriver`（`:1329`）进行 Promise 结算，改为 resolve `animateTo`/`springTo` 的调用方，而不是永远挂起。

`Scene.destroy()`（`Scene.ts:2957`）补充了场景级对应逻辑：

- 守卫 `if (destroyed) return`（`:2958`），设置 `destroyed = true`。
- `while (root.children.length) destroyEntitySubtree(root.children.at(-1)!)`，对 `overlayRoot` 同理（`:2964`），各自委托给 `entity.destroy()`（`:2951`）。
- 拆解 `pointRenderer`、`WebGPU device/manager`、`ResizeObserver`、DPR 监听、指针监听器（从 `pointerEventTarget` 解绑）、`a11yRoot`/`portalRoot`，并清空 `keydownHandlers/shortcuts`。
- 幂等——`start()` 在 `destroyed` 时提前返回（`:3143`），WebGPU 设备恢复会检查 `if (destroyed) newDevice.destroy()`（`:5813`）。

已 `destroy()` 的实体绝不能被重新添加——其 `_destroyed` 标志使后续任何 `destroy()` 成为空操作，但其 `parent` 已为 null 且子节点已消失。

## 3. 脏标记 / 失效粒度

### 3.1 布尔标志及其归因

`Scene.dirty: boolean`（`Scene.ts:534`）是唯一的调度信号。`onDemand` 在 `!dirty && !frameHadAnimation && !contentSemanticDeferred` 时跳过渲染（`Scene.ts:5594` `isIdle`）；`always` 则每帧 rAF 都渲染，除非 `autoThrottle` 降至 `idleFPS`。

归属按 `DirtyTracker.ts:2` 头部分割：

- `DirtyTracker`（`scene/DirtyTracker.ts:70`）拥有标志（`isDirty`）、可选的归因表及其 FIFO 上限（`:71` 处 `MAX_DIRTY_REASONS = 200`）。
- `Scene.markDirty(source?)`（`Scene.ts:3443`）保留其确切名称/签名并委托给 `_dirty.mark(source, currentFrame)` —— `Entity.ts` 中 129 处调用点依赖 `scene.markDirty()`（`DirtyTracker.ts:33`）。
- `Scene._dirty: DirtyTracker`（`Scene.ts:1220`）带私有 getter/setter（`:1229`）—— `set dirty(true)` 调用 `mark(undefined, currentFrame)`，`set dirty(false)` 调用 `clear()`。

热路径开销（`DirtyTracker.ts:47`）：当 `tracking` 关闭时，`mark()` 仅为一次字段写入（`isDirty = true`）加一次已为 false 的分支。`record()` 是独立方法，以便 V8 能内联单字段版本。

### 3.2 标志何时被置位、何时被消费

**置位**——数十处位置，每处都带 `reason` 字符串以便归因：

- `Entity.add` → `child-added`（`:1086`），`remove` → `child-removed`（`:1123`），`animate` → `animation-start`，`_spawnDriver` → `driver-added`（`:1305`），`tickDrivers` → `driver-tick`（`:1389`），`ComputeParticleEntity` → 每次粒子变更都 `markDirty()`（`ComputeParticleEntity.ts:113`）。
- `Scene` 自身：样式变更、尺寸调整、字体加载（`:2717`）、无障碍重排（`:3674`）、滚动（`:3931`）。

**消费**—— `Scene.loop`（`:5569`）在 `update/render` 之前执行 `this.dirty = false`（`:5650`）。任何在 `entity.update()` 内的 `markDirty()` 都会存活到下一帧；若在渲染后清除，会抹掉自驱动的重触发并冻结实体（`DirtyTracker.ts:98`）。`Scene.step(dt)`（`:3420`）是例外——它无条件渲染（既不查 `renderMode` 也不查 `dirty`，`DirtyTracker.ts:33` 契约）并在之后清除（`:3434`），因为确定性是目标。

### 3.3 归因 — 找出让 onDemand 场景保持唤醒的原因

默认关闭。以 `scene.setDirtyTracking(true)`（`Scene.ts:3475`）启用，运行后读取 `scene.dirtyReasons: DirtyReasonEntry[]`（`:3489`，按最频繁优先排序）。每条为 `{ entity?, reason, property?, count, firstFrame, lastFrame }`（`DirtyTracker.ts:59`）。键为 `entity:reason.property`（`:120`）。有界 FIFO——最早的在 200 时被丢弃（`:127`）。以 `scene.clearDirtyReasons()`（`:3495`）清空。那个曾是 “dirty 为 true，却不知为何” 的 `onDemand` 诊断，现在成了一张排序表。

`structureVersion`（`Scene.ts:3462`，由 `:1636` 处 `_structureVersion` 支撑）是配套信号：添加/移除/重设父节点会使其递增；属性变更不会。树形态的缓存仅在该值不变时有效——O(1) 而非重遍历。

## 4. 世界矩阵合成

### 4.1 仿射及其缓存

`AffineTransform { a,b,c,d,e,f }`（`Entity.ts:33`）匹配 `CanvasRenderingContext2D` ——每节点 `T * S * R`，六个标量。

`getWorldTransform(): AffineTransform`（`Entity.ts:1668`）有两条路径：

**快路径**——由 Scene 渲染遍历写入的每帧缓存（`:1784` 处 `_setWorldCache`，盖戳 `_wa.._wf` 与 `_worldFrame`）。若 `_worldFrame === scene.currentFrame`（`:1672`），则逐字返回六个标量——无遍历，除返回对象外无分配。陈旧缓存（该帧未渲染的实体，或在帧间查询）检查失败并回退；缓存只能跳过工作，永不返回错误矩阵。

**权威遍历**——从 `this` 到真正根（`parent === null`，而非 `id === 'root'` ——用户可设，`:1690`）构建 `path: Entity[]`，然后自根向自身合成：

```ts
for (let i = path.length - 1; i >= 0; i--) {
  const { cos, sin } = node._getTrig(); // cached, :1746
  const la = scaleX * cos,
    lb = scaleY * sin,
    lc = -scaleX * sin,
    ld = scaleY * cos;
  const le = x,
    lf = y;
  nextA = a * la + c * lb;
  nextB = b * la + d * lb;
  nextC = a * lc + c * ld;
  nextD = b * lc + d * ld;
  nextE = a * le + c * lf + e;
  nextF = b * le + d * lf + f;
}
```

`_getTrig()`（`:1746`）缓存 `{cos, sin}`，仅在 `rotation` 变更时重算（`_trigRotation` 检查）—— V8 的 `Math.cos/sin` 比其他引擎慢约 2.5 倍，且这是每实体每帧的开销。`_readWorldCache(frame, out)`（`:1647`）是面向逐实体收集（如 G3 的 `gatherHitAABBs`）的零分配兄弟——六个标量读入调用方拥有的 `out`，而非每实体一个对象。

失效为 O(1)：`Scene.render` 在权威遍历开始时递增 `currentFrame++`（`:5806`），因此所有实体的缓存以一次递增即过期，无需触碰实体。

### 4.2 WASM G1 路径 — SoA 变换存储

当变换后端激活（`transformBackend: 'wasm'` / 带已加载模块的 `'auto'`）时，`Scene` 维护常驻 SoA 存储（`WasmBackendFacade.ts:228` `structureVersion`，`scene-store.ts:buildTreeStore`）。在 `markStructureChanged` 时，存储重建其拓扑（父索引、槽位分配）；每个 `Entity._storeSlot`（`:865`）随即被分配，并在信任前对照槽表校验。每帧 `ensureAabbs()` 在 SoA 缓冲区上以一次 WASM 遍历合成所有世界矩阵——同样的 `T·S·R` 数学，与 JS 遍历逐位一致。命中测试融合收集（`HitTester.ts:144`）优先使用 `transform.aabbView()`（若可用），回退到逐实体调用 `getWorldTransform()` 的 JS `gatherHitAABBs`（`wasm/hit-store.ts:47`）。陈旧的 `_storeSlot` 只会付出 JS 回退的慢速代价，永不产生错误读取。

### 4.3 派生查询

- `localToWorld(x,y)`（`:1784`）/ `worldToLocal(x,y)`（`:1796`）——应用/求逆世界矩阵；`worldToLocal` 在奇异行列式（`|det| < 1e-12`）时返回 `null`。
- `getWorldBounds()`（`:1819`）—— `getBounds() ?? {x:0,y:0,width,height}` 经四角变换，产生用于剔除与命中网格输入的世界 AABB。
- `getWorldScale()`（`:1850`）——沿父链累乘 `scaleX/scaleY`（忽略旋转——仅用于命中测试求逆）。

## 5. 事件分发 — 捕获 / 冒泡与指针归属

### 5.1 VectoJSEvent

`VectoJSEvent<N>`（`Entity.ts:607`）镜像 DOM 表面：`type: VectoEvent`（`:538`，`click | dblclick | hover | pointerdown/up/move/cancel/leave | wheel | keydown/keyup | scroll | change | ...`）、`target: Entity`、`currentTarget: Entity`（分发期间逐节点设置）、`nativeEvent: N | undefined`、`bubbles: boolean`（默认 `true`；`hover`/`pointerleave` 为 `false`），以及 `stopPropagation()`、`stopImmediatePropagation()`、`preventDefault()`，并转发 `clientX/Y`、`sceneX/Y`、`localX/Y`、`deltaX/Y`、`key/shiftKey/ctrlKey/altKey/metaKey`。

### 5.2 注册

`Entity.on(event, cb, { capture })`（`:1470`）与 `off(event, cb, { capture })`（`:1485`）：

- 两张惰性分配的表：`listeners`（冒泡）与 `captureListeners`（`:1030`），各自为 `Map<VectoEvent, Array<cb>>`。
- `capture: true` 注册到 `captureListeners`；默认为冒泡。`off` 必须匹配阶段。
- `emit(event, payload)`（`:1540`）是仅自身的直接路径（仅冒泡监听，无传播）——用于组件内部 `change` 事件。`dispatchEvent` 是树路径。

### 5.3 分发 — 先捕获后冒泡

`Entity.dispatchEvent(event)`（`:1610`）：

1. 经 `parent` 链构建 `path: Entity[]` 自目标到根。
2. 捕获：根→目标（`for i = path.length-1 .. 0`）触发 `captureListeners`（`:1618`）。每节点前检查 `propagationStopped`。
3. 冒泡：目标→根（`for i = 0 .. path.length-1`）触发 `listeners`（`:1622`）。目标之后若 `!event.bubbles` 则返回——非冒泡事件仍会运行捕获，但仅在目标处执行冒泡。
4. `fireListeners(node, map, event)`（`:1595`）快照 `handlers.slice()`，因此在分发中添加/移除监听不会扰乱本轮，并尊重 `immediatePropagationStopped`。

Scene 的无障碍投影将原生 DOM 事件接入此树：`Scene.ts:3802` 中每镜像的监听器（`click`、`dblclick`、`pointerdown/up/cancel/move`、`wheel`、`keydown/keyup`）各自执行 `node.dispatchEvent(new VectoJSEvent(type, node, nativeEvent))`。`scroll`（`:3912`）特殊——它在 DOM 中不冒泡，因此 Scene 直接对所属实体执行 `node.emit('scroll', { scrollTop, scrollLeft, ... })`（`:3920`）。

场景级键盘（`Scene.ts:3272` `on('keydown'|'keyup')`）是独立通道——无实体目标，`stopPropagation()` 转发到原生事件（`scene/keyboard.ts:79`），`registerShortcut(chord, handler)` 仅在 `keydown` 上匹配。

### 5.4 指针归属

影子元素上的 `pointerdown` 会捕获指针（`Scene.ts:3851`）：

```ts
if (e.target === capEl && typeof capEl.setPointerCapture === 'function')
  capEl.setPointerCapture(e.pointerId);
```

守卫 `e.target === capEl` 是承载性的：其目标为后代的冒泡 `pointerdown` 不得重新捕获——后代已拥有它，祖先覆盖会将 `pointerup` + `click` 重定向到公共祖先（实测为 Dropdown 选项的点击落在 listbox 容器上，`Scene.ts:3844`）。`pointerup`/`pointercancel` 经 `releasePointer`（`:3831`）释放，由 `hasPointerCapture(pointerId)` 守卫并捕获 `NotFoundError` DOMException。`pointerEvents: 'none'`（`Entity.ts:431` `a11yAttributes.pointerEvents`）让节点退出命中测试而不影响子节点——见 §6.3。

## 6. 命中测试 — 必须一致的两条路径

`Scene.findEntityAt(x, y)`（`Scene.ts:2777`）委托给 `HitTester.findEntityAt(x, y, currentFrame, width, height)`（`HitTester.ts:121`）：

1. 先查覆盖根——始终 `findHitRecursively`（覆盖少，永不走 WASM 索引）。
2. 主树——若 `backends.hit` 且 `ensureHitGrid(frame, width, height)`（`:144`）成功，则 `findEntityAtWasm`（`:185`）；否则 `findHitRecursively`（`:227`）。WASM 路径是结论性的——正确实体或 `null`，永不“无定论”——因此可信网格之后不会再回退 JS。

`findHitRecursively(node, x, y, clip)`（`:227`）：

- 跳过 `opacity <= 0` 的子树（累积透明度）。
- `clipChildren` 经 `intersectBounds`（`:32`）交集为 `childClip` ——向下传递，节点自身仍可用传入 clip 测试。
- 按反向绘制顺序遍历子节点（最上层优先）。
- 当且仅当 `isPointInside(x,y) && isInsideAllClippers(node,x,y) && !isPointerTransparent(node)` 时命中。

`isInsideAllClippers`（`:284`）是权威的旋转感知关卡——每个 `clipChildren` 祖先的 `worldToLocal(x,y)` 必须落在 `[0, width]×[0, height]` 内。遍历中的 AABB clip 栈仅为子树剪枝预过滤；两条命中路径必须重新应用精确矩形，否则旋转裁剪器会让每种后端给出不同答案（#680）。

`isHitEligible(node,x,y)`（`:326`，WASM 路径）以扁平方式重做相同关卡：节点及其每个祖先上 `!isPointerTransparent`、`opacity>0` 且 `isInsideAllClippers`。`isPointerTransparent`（`:284`）即 `attrs.disabled === true || attrs.pointerEvents === 'none'`（`Entity.ts:431`）——透明容器的子节点仍会被遍历。

## 7. 渲染调度 — 脏标记与循环交汇之处

`Scene.loop(time)`（`Scene.ts:5569`）运行于 `requestAnimationFrame`：

1. 若 `!_canvasOnScreen`（IntersectionObserver）则提前退出——隐藏时 `markDirty()` 无害，标志会保留。
2. 计算 `isIdle = !dirty && !frameHadAnimation && !contentSemanticDeferred`（`:5594`）——同时驱动 `onDemand` 跳过与 `always` 自动节流至 `idleFPS`。
3. `effectiveMaxFPS()`（`:5556`）——显式 `maxFPS` 在匹配 `prefersReducedMotion` 时降至 `30`。
4. 帧率上限：`if (cap>0 && time - lastTime < 1000/cap -1) skip`（`:5605`）。
5. 当 `dt` 在 30% 内接近标称 `1000/cap` 时对齐到标称值以消除合成器抖动；钳制到 `MAX_FRAME_DT` 以避免切到后台标签页后弹簧爆炸（`:5630`）。
6. `onDemand && isIdle → skip`（`:5640`）。
7. `dirty = false` **在** `render()` **之前**（`:5650`）——见 §3.2。
8. `render(renderer, dt, time)`（`:5730`）——递增 `currentFrame`、tick 批处理驱动（`_tickBatchedDrivers`）、推进粒子模拟、遍历实体。
9. 渲染后同步无障碍/内容投影——在 `frameHadAnimation` 期间完全跳过（防止 DOM 回流冲击 canvas 循环）。

`Scene.step(dt)`（`Scene.ts:3420`）是同步确定性驱动（视频导出、测试、基准）——无视 `renderMode`/`dirty`/`maxFPS` 无条件渲染，并在之后清除 `dirty`。以 `step()` 驱动基准无法观察到 `onDemand` 跳过（`Scene.ts:3406` 文档）。

## 8. 难点 — 皆有凭据

### 8.1 祖先遍历是 O(depth) 且数量众多

`getWorldTransform`、`getWorldScale`、`isInsideAllClippers`、`isHitEligible`、`dispatchEvent` 路径构建、`Entity.scene` getter ——每者都沿 `parent` 走到根。深度通常较浅（Stack → Card → RichText），因此单次 O(depth) 开销很小，但命中测试与渲染遍历会对每实体每帧调用。三项缓解：

- **每帧缓存**（`_worldFrame` / `currentFrame`，`:845`/`5806`）—— O(1) 失效，当渲染遍历已盖戳矩阵时走快路径。`getWorldTransform` 仅在未命中时回退到遍历。
- **零分配读取**（`_readWorldCache`，`:1647`）用于 `gatherHitAABBs` 这类收集——六个标量读入调用方拥有的对象，而非每实体一次分配。G2 集成基准发现逐实体闭包分配是真实开销（`DriverTicker.ts:40` 头部）。
- **WASM SoA 存储**（G1）——在类型化数组上一次线性遍历而非逐实体行走；`ensureHitGrid` 融合收集（`HitTester.ts:144`）复用 `transform.aabbView()` 以避免每实体重推四角（JS 收集在 10 万实体时为 11.2 ms 对比 39 µs，几乎全在内核之前）。

即便如此，插入一条 500 深的链并在紧循环中调用 `getWorldTransform` 将是 O(n·depth)。保持树宽而非深。

### 8.2 变换开销 — cos/sin 陷阱

V8 上的 `Math.cos/sin` 是软件 libm 调用，比其他引擎慢约 2.5 倍（`Entity.ts:828` 头部）。`Entity._getTrig()`（`:1746`）缓存该对值，仅在旋转变更时重算；`getWorldTransform` 与渲染遍历都会读取它。没有它，带大量旋转粒子的场景（弹幕）会为未变角度每实体每帧付出 libm 代价。`_hasTransitions` 标志（`:812`）属同类微优化——大多数实体永不动画，因此 `x = v` 不得触碰过渡/驱动表。

### 8.3 生命周期泄漏 — 反复出现的三类

**驱动子树泄漏。** `DriverTicker.active: Set<Entity>`（`DriverTicker.ts:84`）是批处理候选集。`Entity.add` 注册子树（`:1087` 镜像）而 `remove` 注销它（`:1130`）。若任一调用遗漏——例如自定义容器直接变异 `children` 而非经 `add`/`remove` ——驱动会在离树后每帧继续 tick 并将实体钉在 Set 中。审计：搜索 `Entity.ts` 之外的直接 `children.push/splice`。

**已销毁守卫。** `Entity.destroy()`（`:1525`）先设置 `_destroyed` 再递归。第二次 `destroy()` 为空操作；经子节点 `onMounted` 或驱动 `onDone` 重入的 `destroy()` 见到标志即停止。`Scene.destroy()`（`:2957`）在拆解子节点前设置 `destroyed`，且每个异步回调（WebGPU 设备恢复 `:5813`、`requestAnimationFrame` 循环 `:5569`）都检查 `if (destroyed) return/newDevice.destroy()`。缺少守卫会复活半拆场景或在 SPA 路由切换间泄漏 GPU 设备。

**无障碍 / portal 泄漏。** `remove` 调用 `detachA11y(child)`（`:1117`），`destroy` 经 `A11yProjectionManager.ts:227` 调用 `removeA11yRecursively`。投影的 `contentSemanticBudget` 与 `contentViewportEpoch` 确保被移除实体的 carrier/投影状态不会在 `syncA11y` 遍历间保留。遗漏 `detachA11y` 会留下仍捕获指针事件并出现在 `getA11yTree()` 中的透明影子元素。

### 8.4 渲染调度器分解陷阱

`Scene.ts` 约 6500 行，是因四个域共享可变帧状态：`DirtyTracker`（`DirtyTracker.ts:70`）、`DriverTicker`（`DriverTicker.ts:57`）、`HitTester`（`HitTester.ts:17`）与 `WasmBackendFacade`（`WasmBackendFacade.ts:1`）已按 `forge/decisions/file-decomposition-2026-08.md` 抽离，但 `loop`/`render` 与 `a11yRoot`/`canvas` 几何仍留在 Scene。`Scene._updateWalkDt`（`:5806`）为 `Entity._spawnDriver` 的行中补 tick 而公开——在批量遍历认领实体后产生的驱动，若无此补 tick，在 WASM 路径上会等到下一帧而在 JS 路径上同帧 tick。拆分 `loop` 时若不一起携带 `dt`/`currentFrame`/`frameHadAnimation`，即违反 `DEC-0019` 规则 5。

## 9. 开发者必须保持的不变量

1. **除 `add`/`remove`/`destroy` 外永不直接变异 `children`。** 直接数组变异会跳过 `markStructureChanged`、`markDirty`、驱动注册与无障碍解绑——四条不变量静默崩坏。搜索 `Entity.ts` 之外的 `\.children\.push|\.children\.splice`。
2. **调度工作前检查 `destroyed`。** 任何触及 `scene` 或 `entity.scene` 的 `requestAnimationFrame`、`setTimeout`、`ResizeObserver` 或 WebGPU Promise 都必须守卫 `if (destroyed) return`。`Scene.ts:3137` 处 `destroy()` 文档已明确。
3. **尊重脏标记契约。** `onDemand` 场景休眠直到 `markDirty()` 或活跃驱动。在 `Entity.animate`/`setTransition` 之外变异 `x/y/scale/rotation/opacity/width/height` 而不带 `markDirty({ reason })` 会使变更不可见。反之，每帧 `markDirty`（如 `update()` 自我重触发）会让 `onDemand` 保持唤醒——用 `scene.dirtyReasons`（`:3489`）找出每帧触发的 `reason`。
4. **保持命中测试关卡同步。** 任何新的可见性/输入/clip 条件必须同时加入 `findHitRecursively`（`HitTester.ts:227`）与 `isHitEligible`（`:326`）。仅在一处添加会使 WASM 与 JS 路径不一致——加速器变为缺陷生成器。
5. **指针捕获仅在 `e.target === capEl` 时。** `Scene.ts:3851` 的守卫不是可选的。移除它会破坏每个 Dropdown/Select 菜单——其选项作为捕获元素的子节点时点击会落到公共祖先。
6. **世界矩阵消费者必须处理缓存过期情况。** `getWorldTransform()` 仅能对 `currentFrame` 返回缓存矩阵；在帧间或对离树实体会走遍历。`_readWorldCache` 调用方在返回 `false` 时必须回退到完整遍历（`HitTester.ts:144` 融合收集注释）。
7. **以版本号度量，而非清扫。** 字体/DPR/视口变更经生成计数器（`ContentProjectionManager.ts:524`）使所有 `scaleX`/校准失效，而非触碰每个 carrier。对形态缓存同理适用 `structureVersion`。

## 10. 调试清单 — 当场景看起来不对时

- **在 `onDemand` 模式下变更后无渲染** → `dirty` 是否仍为 `false`？启用 `scene.setDirtyTracking(true)`，做变更，读取 `scene.dirtyReasons`。约 90% 情况是缺少 `markDirty`。在 devtools 中检查 `scene.frameStats.dirty`（`Scene.ts:3528`）。
- **移除后仍有幽灵命中目标** → 是否直接变异了 `children`？检查 `structureVersion` 递增与 `HitTester.ensureHitGrid` 过期性（`hitGridStructureVersion` 对 `structureVersion`）。`hitGridOk=true` 的陈旧网格会提供错误候选。
- **子树移除后驱动仍在运行** → `DriverTicker.active` 大小应下降。检查 `scene._tickBatchedDrivers` 关卡—— `DriverTicker.ts:101` 处 `unregisterSubtree` 会遍历整个子树，因此非常深的已分离子树在移除时付出 O(subtree)，而非每帧。
- **变换在 JS 对 WASM 间发散** → 对比 `entity.getWorldTransform()`（JS 遍历）与 `transform.aabbView()` 槽位。陈旧的 `_storeSlot`（`Entity.ts:865`，不在 store 时为 `-1`）只会导致缓慢但正确的 JS 回退，永不产生错误矩阵——若矩阵不同，则拓扑重建遗漏了 `markStructureChanged`。
- **事件触发两次或完全不触发** → 检查 `bubbles` 标志（`VectoJSEvent.ts:607`）以及监听是挂在 `captureListeners` 还是 `listeners`。非冒泡的 `hover`/`pointerleave` 仅在冒泡阶段于目标处触发。
- **切回标签页时弹簧爆炸** → `loop` 将 `dt` 钳制到 `MAX_FRAME_DT`（`Scene.ts:5630`）。若自定义 `step(dt)` 直接向 `tickDrivers` 喂入巨大 `dt`，调用方必须同样施加钳制。

---

_系列：00 总览 → 01 选区 → 02 文本+布局 → 03 投影+虚拟化 → 04 流式 Markdown → 05 TeX → **06 VMT 运行时** → 07 渲染器 → 08 WASM G1/G2/G3 → 09 Three/XR → 10 视频导出 → 11 图布局 → 12 DevTools → 99 综合。_
