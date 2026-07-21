---
title: '粒子系统'
description: 'ComputeParticleEntity：WebGPU计算粒子、CPU回退、8浮点内存布局、鼠标交互和triggerExplosion。'
order: 12
---

# 粒子系统

`ComputeParticleEntity`是VectoJS的高吞吐粒子层。它通过WebGPU计算传递运行弹簧物理模拟，并为不支持WebGPU的浏览器提供CPU回退。支持的粒子数量和帧率强烈依赖于GPU、浏览器、DPR和渲染配置；仓库目前不包含已检入的100k/1M硬件基准测试。

## 实时体验

<figure class="sandbox">
  <a class="sandbox-cta" href="/demos/nexus/">
    <span class="sandbox-cta-title">打开Nexus粒子演示 →</span>
    <span class="sandbox-cta-sub">数万个<code>ComputeParticleEntity</code>点拼写出"VectoJS"，在WebGPU上模拟。拖拽平移，滚动缩放，点击向场中发送脉冲。</span>
  </a>
  <figcaption>粒子场作为独立WebGPU页面全速运行 —— 小型嵌入iframe限制了性能，因此链接到实际页面。</figcaption>
</figure>

## 粒子 vs `getBatchCircle`

|          | `ComputeParticleEntity`      | 自定义实体上的`getBatchCircle` |
| -------- | ---------------------------- | ------------------------------ |
| 物理     | 内置（弹簧、鼠标排斥、爆炸） | 手动 —— 在`update()`中更新位置 |
| 后端     | WebGPU计算或CPU              | WebGL点层                      |
| 吞吐量   | 取决于硬件/工作负载          | 取决于硬件/工作负载            |
| 使用时机 | 自包含的物理场               | 由你直接控制的点云             |

如果你需要一个能弹簧成队形、对光标做出反应并触发爆炸的粒子场，`ComputeParticleEntity`是正确的工具。如果你只想在你控制的位置渲染许多点，在自定义实体上实现`getBatchCircle()`。

## 基本设置

```typescript
import { Scene, ComputeParticleEntity } from '@vectojs/core';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;

const scene = new Scene(canvas, {
  particleBackend: 'auto', // 'webgpu' | 'cpu' | 'auto'（默认：尝试WebGPU，失败时回退）
  pointBackend: 'webgl', // CPU回退渲染需要
  maxFPS: 60,
});

const particles = new ComputeParticleEntity({
  maxParticles: 50_000,
  springK: 0.05, // 弹簧拉向原点（0–10）
  damping: 0.95, // 每步速度阻尼（0–1）
  bounceDamping: 0.5, // 边界反弹保留的能量（0–1）
  maxVelocity: 500, // 速度限制
  size: 3, // 基础粒子半径，单位px
  color: '#00f0ff',
  pointerEvents: false, // true → 实体捕获命中事件
});

scene.add(particles);
scene.start();

// 重要：在调用initRandomParticles之前先调整大小
scene.resize(window.innerWidth, window.innerHeight);

// 将粒子散布在视口中
particles.initRandomParticles(scene.width, scene.height);

window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
});
```

> [!CAUTION] > 必须在**`initRandomParticles`之前**调用`resize(w, h)`。`0×0`视口意味着所有粒子位置默认为`(0, 0)`，并且模拟没有边界可以反弹。`scene.start()`在宽度或高度为零时记录一次性警告。

## 8浮点内存布局

每个粒子在`entity.particleData`中占用8个连续的`float32`值：

| 偏移常量                     | 索引 | 字段       | 说明                                             |
| ---------------------------- | ---- | ---------- | ------------------------------------------------ |
| `PARTICLE*OFFSET*POSITION_X` | 0    | position.x | 当前世界空间x                                    |
| `PARTICLE*OFFSET*POSITION_Y` | 1    | position.y | 当前世界空间y                                    |
| `PARTICLE*OFFSET*VELOCITY_X` | 2    | velocity.x |                                                  |
| `PARTICLE*OFFSET*VELOCITY_Y` | 3    | velocity.y |                                                  |
| `PARTICLE*OFFSET*ORIGIN_X`   | 4    | origin.x   | 弹簧静止/锚点                                    |
| `PARTICLE*OFFSET*ORIGIN_Y`   | 5    | origin.y   |                                                  |
| `PARTICLE*OFFSET*SIZE`       | 6    | size       | 每粒子大小覆盖                                   |
| `PARTICLE*OFFSET*LIFE`       | 7    | life       | `-1` = 永久；`≥0`以0.5/s衰减；`0` = 死亡（跳过） |

你可以直接读写`particleData`以设置自定义队形。写入后，设置`needsInit = true`以在下一帧触发GPU上传。

## 形成文本形状和图案

`setOrigins()`是使粒子弹簧形成队形的主要方法。传递扁平的`Float32Array`，包含交替的`[x0, y0, x1, y1, …]`对 —— 每个粒子一对：

```typescript
// 将10,000个粒子排列成网格
const N = 10_000;
const cols = 100;
const origins = new Float32Array(N * 2);

for (let i = 0; i < N; i++) {
  const col = i % cols;
  const row = Math.floor(i / cols);
  origins[i * 2] = 100 + col * 8; // x
  origins[i * 2 + 1] = 100 + row * 8; // y
}

particles.setOrigins(origins); // 也将particleData上传到GPU
```

`setOrigins(points, requestPositionReset = true)` —— 第二个参数控制粒子是否也传送到它们的新原点（对于即时队形变化很有用），或从当前位置弹簧移动到新原点。

要在不改变原点的情况下设置位置，使用`setPositions()`。要设置初始速度（例如，从中心向外爆发），使用`setVelocities()`。

所有三个方法都写入`particleData`并设置`needsInit = true`，因此在下一帧数据会上传到WebGPU存储缓冲区。

## 鼠标交互

当`pointerEvents: true`时，`Scene`将光标坐标传递给粒子模拟。光标**120像素**内的粒子被排斥：

```typescript
const particles = new ComputeParticleEntity({
  maxParticles: 100_000,
  pointerEvents: true,
});
scene.add(particles);
```

排斥半径和力在着色器中固定。当光标离开canvas时，排斥点设置为`(-99999, -99999)`，因此不施加排斥。

## 触发爆炸

`triggerExplosion(x, y, force)`为下一个模拟步骤排队一个脉冲。在`(x, y)`的**150像素**内的所有粒子接收到按`force`缩放的外向速度推动：

```typescript
canvas.addEventListener('dblclick', (e) => {
  const point = scene.clientToScene(e.clientX, e.clientY);
  particles.triggerExplosion(point.x, point.y, 800);
});
```

一次只能排队一个爆炸 —— 在前一个爆炸被消耗之前调用`triggerExplosion`会覆盖它。

## WebGPU vs CPU回退

`particleBackend`选项控制使用哪个路径：

| 值               | 行为                                                  |
| ---------------- | ----------------------------------------------------- |
| `'auto'`（默认） | 尝试WebGPU；失败或缺失时回退到CPU                     |
| `'webgpu'`       | 显式请求WebGPU；当前运行时在初始化失败时仍然回退到CPU |
| `'cpu'`          | 强制CPU模拟；即使WebGPU可用也禁用                     |

**当WebGPU激活时：** 模拟作为计算着色器在GPU上运行。粒子状态保存在WebGPU存储缓冲区中，并渲染到Scene的专用WebGPU canvas中。

**当CPU回退激活时：** `Scene`每帧调用`entity.updateCPU(dt, mouseX, mouseY, width, height)`（相同的物理模型 —— 弹簧、排斥、爆炸、速度上限、反弹）。通过Canvas2D或可选的WebGL点层上的`fillCircle()`渲染。根据目标浏览器和硬件上的测量结果选择数量。

> [!NOTE] > `particles.gpuStorageBuffer !== null`表明GPU资源已分配，
> 但它在异步设备丢失后不是可靠的实时后端状态。

设备丢失通过指数退避（3次重试）自动恢复，之后永久禁用WebGPU。

### 从GPU读取粒子位置回CPU

粒子状态保存在GPU缓冲区中。你不能廉价地读回它 —— `mapAsync` + `copyBufferToBuffer`往返会阻塞管线。如果你需要CPU上的位置（例如，与非粒子实体进行碰撞检测），通过自己写入`particleData`并使用`setPositions()`来保持CPU端`Float32Array`同步。

对于完全在粒子系统内的大规模空间查询，编写额外的WebGPU计算传递。对于与其他实体的碰撞，在CPU路径上使用`SpatialHashGrid`。

## GPU资源管理

```typescript
// 完成后清理GPU缓冲区（例如，页面卸载或组件销毁时）
particles.destroyGPUResources();
scene.remove(particles);
```

`scene.destroy()`也会在所有粒子实体上调用`destroyGPUResources()`，因此你只需要在会话中的拆卸时手动调用它。

## WebGPU的TypeScript类型

如果你的项目使用WebGPU API且TypeScript报告`Cannot find name 'GPUDevice'`：

```bash
bun add -d @webgpu/types
```

```json
{ "compilerOptions": { "types": ["@webgpu/types"] } }
```

## 故障排除

### 屏幕上什么都没有出现

按顺序检查：

1. **未调用`initRandomParticles()`** —— 没有它，所有粒子位置都是`(0, 0)`，大小为`0`。
2. **在`initRandomParticles`之前未调用`resize(w, h)`** —— 散布在`0×0`盒子中的粒子不可见。检查`scene.width`和`scene.height`是否非零。
3. **WebGPU初始化失败** —— 当前运行时会记录失败，禁用GPU路径，并通过CPU回退继续，即使显式请求了`'webgpu'`。
4. **`pointBackend`未设置为`'webgl'`** —— CPU回退通过`fillCircle`渲染。没有`'webgl'`，CPU路径粒子仍然出现在Canvas2D上，但仅当canvas渲染器激活时。

### FPS远低于预期

- 使用浏览器GPU工具和WebGPU canvas验证活动路径；保留的`gpuStorageBuffer`在设备丢失后单独不足以作为持久的状态信号。
- 在无头/CI环境中，WebGPU和WebGL回退到软件渲染器（Swiftshader）。无头环境中的FPS不代表实际性能。在真实GPU硬件上测量。
- 在分析时减少`maxParticles`，并在目标设备上记录帧时间百分位数；此仓库不建立通用的CPU或GPU上限。

### 粒子弹簧到`(0, 0)`而不是我的队形

`setOrigins()`和`setPositions()`都设置`needsInit = true`，这会在下一帧将`particleData`上传到GPU缓冲区。如果你在**`scene.start()`之前**调用它们，确保之后调用`start()`以便上传发生。
