+++
title = "ThreeAdapter"
description = "将 VectoJS Scene 渲染到 canvas 上，将其暴露为 THREE.CanvasTexture，并通过 UV 光线投射连接指针事件（包括 WebXR 控制器和多点触控）以及面板焦点与键盘路由。"
weight = 42
+++

# `ThreeAdapter`

属于 [`@vectojs/three`](/reference/three/)。

`ThreeAdapter` 使用所提供的 `canvas`，或在省略时创建一个。它将 VectoJS `Scene` 渲染到该 canvas 上，将结果包装为 `THREE.CanvasTexture`，并给你一个即用的 `THREE.Mesh`（一个带 `MeshBasicMaterial` 的单位 `PlaneGeometry`）。来自你的 Three.js 事件监听器的指针和滚动事件通过光线投射被转换回 VectoJS 逻辑坐标。

当你有一个 3D 场景并想要一个 2D UI 面板漂浮在表面上时使用它 —— 你的 Three.js 场景的其余部分保持不变，并且你保留 Canvas 2D 渲染。要将 Three.js 用作 `Scene` 本身的渲染后端，请改为参见 [`ThreeRenderer`](/reference/three-renderer/)。

## 构造函数

```ts
new ThreeAdapter(options: ThreeAdapterOptions)
```

```ts
interface ThreeAdapterOptions {
  width: number; // logical width of the 2D UI scene (CSS px)
  height: number; // logical height (CSS px)
  canvas?: HTMLCanvasElement; // optional pre-existing canvas; adapter creates one if omitted
  sceneOptions?: SceneOptions; // forwarded to the VectoScene constructor
}
```

无论你在 `sceneOptions` 中传递什么，`disableWindowResize` 在内部都被强制为 `true` —— 适配器通过 `resize(w, h)` 拥有调整大小，而非 window。

## 公共属性

| 属性         | 类型                  | 描述                                                                                      |
| ------------ | --------------------- | ----------------------------------------------------------------------------------------- |
| `texture`    | `THREE.CanvasTexture` | 包装 VectoJS canvas 的纹理。在每个 VectoJS 渲染帧后自动设置 `needsUpdate = true`。        |
| `vectoScene` | `VectoScene`          | 活动的 VectoJS `Scene` 实例。将实体添加到此。                                             |
| `canvas`     | `HTMLCanvasElement`   | VectoJS 绘制到其上的、适配器拥有或调用者提供的 canvas。                                   |
| `mesh`       | `THREE.Mesh`          | 预构建的 `PlaneGeometry(1, 1)` + `MeshBasicMaterial` 网格，可直接放入你的 Three.js 场景。 |

## 方法

### `updateIntersection(raycaster, type, originalEvent?)`

```ts
updateIntersection(
  raycaster: THREE.Raycaster,
  type: 'pointerdown' | 'pointerup' | 'pointermove' | 'pointercancel' | 'wheel' | 'click',
  originalEvent?: PointerEvent | WheelEvent
): boolean
```

将光线投射到适配器网格，将 UV 命中转换为 VectoJS canvas 坐标，并将事件派发到 VectoJS 场景。当光线与网格相交时返回 `true`。

指针按钮状态和 `shiftKey`/`ctrlKey`/`altKey`/`metaKey` 被保留；滚轮事件额外保留所有增量和修饰键。

从你的 Three.js 渲染循环或指针事件监听器内部调用它。适配器维护每个 `pointerId` 的悬停状态，因此 WebXR 控制器和多点触控输入各自携带独立的悬停/焦点上下文。

**UV 重映射**：Three.js UV 坐标在平面底部 Y=0；VectoJS 在顶部 Y=0。适配器自动翻转 Y 轴 —— 你无需调整坐标。

### `resize(width, height)`

```ts
resize(width: number, height: number): void
```

调整 canvas 和底层逻辑 `VectoScene` 的大小。当面板的渲染分辨率或 2D 布局视口变化时调用；仅更改网格的世界空间缩放不需要此项。

## 面板焦点与键盘输入（0.1.10+）

适配器 canvas 是离屏的，其投影的无障碍镜像永远不会成为 `document.activeElement`，浏览器的焦点模型也无法触及它们。适配器用**面板焦点**填补这一空缺——这是 Three 侧的状态，由指针交互和 `focus()` 驱动、由按键路由消费，并且每次转换都通过合成 `FocusEvent` 桥接，使 core 侧的状态（实体 `focus`/`blur` 事件、光标闪烁唤醒）与连接的 canvas 保持一致。

```ts
adapter.focusedEntity: Entity | null // read-only — the entity holding panel focus
adapter.focus(entity: Entity | null): void // move focus, or blur with null
adapter.blur(): void // release panel focus
adapter.isFocusable(entity: Entity): boolean // projects as keyboard-reachable?
```

`isFocusable` 是 DOM 可制表性（tabbability）的面板侧类比：当投影镜像带有 `tabindex` 属性或呈现为原生可聚焦标签（`button`/`input`/`textarea`/`select`/`a[href]`）时为真。pointerdown 会聚焦命中目标中最近的可达祖先——点击按钮内的 `<span>` 会聚焦该按钮，而投影中没有任何可达元素的命中链会导致失焦。

### `dispatchKey(key, mods?, phase?)`

```ts
dispatchKey(
  key: string,
  mods?: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean; code?: string },
  phase?: 'press' | 'keydown' | 'keyup', // default 'press' — synthesizes keydown+keyup
): void
```

`updateIntersection` 的键盘对应物：合成一个按键事件，并将其通过与已连接 canvas 相同的分发路径进行路由。路由规则依次为：

1. **面板焦点** —— 当某个实体持有面板焦点时，事件被分发到其投影镜像，因此 core 自己的监听器原样运行：实体的 `keydown`/`keyup` 处理器收到事件，投影控件保持其激活契约（按 press 触发 `Enter`、按 release 触发 `Space`）。
2. **所有权** —— 当被聚焦实体是_键盘所有者_时，面板独占这些按键，任何内容都不会泄漏到页面。所有者是投影 `input`/`textarea`/`select` 标签或 core 的 `KEYBOARD_OWNING_ROLES` 中角色的实体：交互角色（`button`、`switch`、`checkbox`、`radio`、`link`、`tab`、`menuitem`、`slider`、`combobox`）加上键盘优先角色 `textbox`、`searchbox`、`spinbutton`、`option` 和 `listbox`。方向键移动滑块而不是旋转你的相机；键入到达文本框而不是触发页面快捷键。
3. **通道转发** —— 否则事件继续前往 `window`，由场景级按键通道应用其原生门控（`defaultPrevented`、按键自动重复、`ownsKeyboard(document.activeElement)`），因此除非页面级键盘所有者持有焦点，场景快捷键和页面级消费者都能看到事件。实体处理器在合成事件上调用 `preventDefault()` 会抑制转发，与连接 canvas 的冒泡一致。
4. **无面板焦点** —— 事件直接前往 `window`，由相同的门控决定。

`code` 默认采用尽力推断（`'a'` → `'KeyA'`，`' '` → `'Space'`，数字 → `'DigitN'`）。对于推断无法命名的布局，传入 `mods.code` 覆盖。

### `dispatchPointer(type, x, y, init?)`

```ts
dispatchPointer(
  type: 'pointerdown' | 'pointerup' | 'pointercancel' | 'pointermove' | 'click',
  x: number, // logical scene-space X (origin top-left)
  y: number, // logical scene-space Y
  init?: { pointerId?: number; button?: number; buttons?: number;
           ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean },
): boolean // whether the point hit an entity
```

以**逻辑场景坐标**合成指针输入——这正是实体布局和 `findEntityAt` 所使用的空间。事件流经与光线投射驱动的 `updateIntersection` 完全相同的下游路径：悬停转换、实体分发、由 pointerdown 驱动的聚焦和纹理脏标记调度行为完全一致，这使其成为没有 raycaster 的测试和自动化的入口点。滚轮输入被刻意排除在外——滚轮增量没有中立默认值，因此请通过 `updateIntersection` 并携带真实 `WheelEvent` 来路由它们。

### `dispose()`

```ts
dispose(): void
```

幂等地销毁网格上的 `THREE.CanvasTexture`、几何和材质，分离网格，恢复 Scene 渲染方法，销毁 `VectoScene`，并清除所有每指针状态（面板焦点随场景一起消亡）。适配器创建的 canvas 被释放到 `0×0`；调用者提供的 canvas 保持其尺寸。

## 完整示例

以下示例在 Three.js 场景中的一个旋转平面上渲染一个 VectoJS 设置面板。来自 `pointermove`、`pointerdown` 和 `pointerup` DOM 监听器的指针事件通过 `updateIntersection` 转发到 VectoJS。

```ts
import * as THREE from 'three';
import { ThreeAdapter } from '@vectojs/three';
import { Text, Button, Stack } from '@vectojs/ui';

// --- Three.js scene setup ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const threeScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3);

// --- VectoJS panel adapter (512×256 logical pixels, displayed on a 2×1 plane) ---
const adapter = new ThreeAdapter({ width: 512, height: 256 });

const heading = new Text('Settings', {
  font: '600 24px Inter',
  color: '#f8fafc',
});
const applyBtn = new Button('Apply', { width: 120, height: 40 });
applyBtn.on('click', () => console.log('apply clicked'));

const stack = new Stack({ direction: 'vertical', gap: 20 });
stack.add(heading);
stack.add(applyBtn);
stack.setPosition(20, 20);
adapter.vectoScene.add(stack);

adapter.vectoScene.start();

// --- Place mesh in the Three.js scene ---
const panel = adapter.mesh;
panel.scale.set(2, 1, 1); // world-space size matches the 2:1 aspect ratio
threeScene.add(panel);

// --- Raycaster for event translation ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function updatePointer(event: PointerEvent) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

window.addEventListener('pointermove', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'pointermove', e);
});

window.addEventListener('pointerdown', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'pointerdown', e);
});

window.addEventListener('pointerup', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'pointerup', e);
});

window.addEventListener('click', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'click', e);
});

window.addEventListener('wheel', (e) => {
  updatePointer(e as unknown as PointerEvent);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'wheel', e);
});

// --- Render loop ---
function animate() {
  requestAnimationFrame(animate);
  panel.rotation.y += 0.005;
  renderer.render(threeScene, camera);
}

animate();

// --- Cleanup ---
window.addEventListener('unload', () => adapter.dispose());
```

## 适配器内部如何工作

构造函数猴子补丁 `vectoScene.render`，以在每个 VectoJS 帧后设置 `texture.needsUpdate = true`。Three.js 随后在下一次 `renderer.render()` 调用时将 canvas 上传到 GPU。无需轮询或手动同步。

光线投射 UV 坐标被映射到场景的**逻辑**坐标空间（`vectoScene.width`/`height` —— 你传给构造函数的尺寸），而非适配器 canvas 的物理后备存储尺寸。这个区别在 HiDPI 显示器上很重要：`@vectojs/core` 的 `CanvasRenderer` 为清晰渲染将后备存储按 `devicePixelRatio` 缩放（`canvas.width = logicalWidth × dpr`），而实体布局和命中测试保持逻辑。

> [!WARNING] > **在 `@vectojs/three` ≤ 0.1.1 上，UV 映射使用物理 canvas 尺寸** —— 因此在任何 `devicePixelRatio ≠ 1` 的显示器或浏览器缩放级别上，每个指针事件都恰好落在光标下方/右侧 DPR 因子的距离。症状很独特：点击激活的控件_比光标下的控件更靠下_，偏移随目标在面板中越深而越大 —— 而在 DPR-1 显示器和无头测试环境中表现完美。在 **0.1.2** 中已修复；请升级而非绕过它。

由 `updateIntersection` 派发的命中事件，在实体的无障碍 DOM 元素存在**且连接到活动文档**时被转发给它（这将它们通过 a11y 影子层路由，并在交互式组件上触发 `click`/`change`），否则直接作为 `VectoJSEvent` 对象转发。

> [!NOTE]
> 使用默认的适配器创建的 canvas 时，面板走直接的 `VectoJSEvent` 路径，因为 canvas 及其 a11y 根是分离的。如果你提供一个连接到 `document` 的 canvas，其已连接的 a11y 元素可以使用 DOM 派发路径。`@vectojs/three` 的 0.1.1 及更新版本检查连接性，而不是假定任一情况。
>
> **这对 `Toggle`/`Button` 的正确性重要，而不仅仅是为了避免抛出错误。** 在 `@vectojs/three` 的 0.1.0 版本中，一个断开连接的 a11y 元素可能错误地走 DOM 派发分支并静默错过组件回调。0.1.1 及更新版本直接路由断开连接的元素。原生 DOM 焦点/IME/屏幕阅读器行为对默认的分离 canvas 不可用，但在调用者提供的 canvas 及其投影层连接时仍然可能。

## WebXR 和多点触控

`updateIntersection` 按取自 `originalEvent` 的 `pointerId` 跟踪悬停状态。在 WebXR 会话中，每个控制器携带自己的 `pointerId`，因此用一个控制器悬停不会干扰另一个的状态。将包装在合成 `PointerEvent` 中的原始 `XRInputSourceEvent` 传入，并将控制器的 `inputSource.handedness` 编码为 `pointerId`（左为 0，右为 1），以维护独立的命中状态。

```ts
// WebXR example — minimal controller event forwarding
session.addEventListener('selectstart', (xrEvent) => {
  const synth = new PointerEvent('pointerdown', {
    pointerId: xrEvent.inputSource === leftController ? 0 : 1,
  });
  raycaster.setFromCamera(controllerUV, camera);
  adapter.updateIntersection(raycaster, 'pointerdown', synth);
});
```

## 相关

[`ThreeRenderer`](/reference/three-renderer/)（替代用例 —— Three.js 作为 `Scene` 的渲染后端）·
[`Scene`](/reference/core-scene/)（`vectoScene`）·
[`@vectojs/three` 概述](/reference/three/)
