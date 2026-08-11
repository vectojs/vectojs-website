+++
title = "ThreeAdapter"
description = "将 VectoJS Scene 渲染到 canvas 上，将其暴露为 THREE.CanvasTexture，并通过 UV 光线投射连接指针事件（包括 WebXR 控制器和多点触控）。"
weight = 42

[extra]
order = 42
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
  type: 'pointerdown' | 'pointerup' | 'pointermove' | 'wheel' | 'click',
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

### `dispose()`

```ts
dispose(): void
```

幂等地销毁网格上的 `THREE.CanvasTexture`、几何和材质，分离网格，恢复 Scene 渲染方法，销毁 `VectoScene`，并清除所有每指针状态。适配器创建的 canvas 被释放到 `0×0`；调用者提供的 canvas 保持其尺寸。

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

const heading = new Text('Settings', { font: '600 24px Inter', color: '#f8fafc' });
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
