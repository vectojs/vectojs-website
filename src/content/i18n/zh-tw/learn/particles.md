---
title: '粒子系統'
description: 'ComputeParticleEntity：WebGPU 計算粒子、CPU 備援方案、8 浮點數記憶體布局、滑鼠互動和 triggerExplosion。'
order: 12
---

# 粒子系統

`ComputeParticleEntity` 是 VectoJS 的高吞吐量粒子層。它透過 WebGPU 計算傳遞運行彈簧物理模擬，並為不支援 WebGPU 的瀏覽器提供 CPU 備援方案。支援的粒子數量和幀率在很大程度上取決於 GPU、瀏覽器、DPR 和渲染配置；此儲存庫目前不包含已簽入的 10 萬/100 萬硬體基準測試。

## 即時試玩

<figure class="sandbox">
  <a class="sandbox-cta" href="/demos/nexus/">
    <span class="sandbox-cta-title">開啟 Nexus 粒子演示 →</span>
    <span class="sandbox-cta-sub">數以萬計的 <code>ComputeParticleEntity</code> 點拼出「VectoJS」，在 WebGPU 上模擬。拖曳平移，滾輪縮放，點擊向場發送脈衝。</span>
  </a>
  <figcaption>粒子場作為獨立的 WebGPU 頁面全速運行——小型嵌入 iframe 會限制效能，因此這裡連結的是真實版本。</figcaption>
</figure>

## 粒子 vs `getBatchCircle`

|          | `ComputeParticleEntity`      | 自訂實體上的 `getBatchCircle`     |
| -------- | ---------------------------- | --------------------------------- |
| 物理     | 內建（彈簧、滑鼠排斥、爆炸） | 手動 — 你在 `update()` 中更新位置 |
| 後端     | WebGPU 計算或 CPU            | WebGL 點層                        |
| 吞吐量   | 取決於硬體/工作負載          | 取決於硬體/工作負載               |
| 使用時機 | 自包含的物理場               | 你直接控制的點雲                  |

如果你需要一個能彈入陣型、響應游標並觸發爆炸的粒子場，`ComputeParticleEntity` 是正確的工具。如果你只想在你控制的位置渲染許多點，請在自訂實體上實作 `getBatchCircle()`。

## 基本設定

```typescript
import { Scene, ComputeParticleEntity } from '@vectojs/core';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;

const scene = new Scene(canvas, {
  particleBackend: 'auto', // 'webgpu' | 'cpu' | 'auto'（預設：嘗試 WebGPU，失敗則回退）
  pointBackend: 'webgl', // CPU 備援渲染所需
  maxFPS: 60,
});

const particles = new ComputeParticleEntity({
  maxParticles: 50_000,
  springK: 0.05, // 彈簧拉力朝向原點 (0–10)
  damping: 0.95, // 每一步的速度阻尼 (0–1)
  bounceDamping: 0.5, // 邊界反彈時保留的能量 (0–1)
  maxVelocity: 500, // 速度限制
  size: 3, // 基本粒子半徑，單位 px
  color: '#00f0ff',
  pointerEvents: false, // true → 實體捕獲命中事件
});

scene.add(particles);
scene.start();

// 重要：在呼叫 initRandomParticles 之前先調整大小
scene.resize(window.innerWidth, window.innerHeight);

// 在視窗中散佈粒子
particles.initRandomParticles(scene.width, scene.height);

window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
});
```

> [!CAUTION] > `resize(w, h)` 必須在 `initRandomParticles` **之前**呼叫。一個 `0×0` 的視窗意味著所有粒子位置預設為 `(0, 0)`，且模擬沒有邊界可以反彈。`scene.start()` 會在寬度或高度為零時記錄一次性警告。

## 8 浮點數記憶體布局

每個粒子是 `entity.particleData` 中 8 個連續的 `float32` 值：

| 偏移常數                     | 索引 | 欄位       | 備註                                                |
| ---------------------------- | ---- | ---------- | --------------------------------------------------- |
| `PARTICLE*OFFSET*POSITION_X` | 0    | position.x | 當前世界空間 x                                      |
| `PARTICLE*OFFSET*POSITION_Y` | 1    | position.y | 當前世界空間 y                                      |
| `PARTICLE*OFFSET*VELOCITY_X` | 2    | velocity.x |                                                     |
| `PARTICLE*OFFSET*VELOCITY_Y` | 3    | velocity.y |                                                     |
| `PARTICLE*OFFSET*ORIGIN_X`   | 4    | origin.x   | 彈簧靜止/錨點                                       |
| `PARTICLE*OFFSET*ORIGIN_Y`   | 5    | origin.y   |                                                     |
| `PARTICLE*OFFSET*SIZE`       | 6    | size       | 每個粒子的大小覆蓋值                                |
| `PARTICLE*OFFSET*LIFE`       | 7    | life       | `-1` = 永久；`≥0` 以 0.5/s 衰減；`0` = 死亡（跳過） |

你可以直接讀寫 `particleData` 來設定自訂陣型。寫入後，設定 `needsInit = true` 以在下一幀觸發 GPU 上傳。

## 形成文字形狀和圖案

`setOrigins()` 是使粒子彈入陣型的主要方法。傳遞一個扁平的 `Float32Array`，包含交替的 `[x0, y0, x1, y1, ...]` 對——每個粒子一對：

```typescript
// 將 10,000 個粒子排列成網格
const N = 10_000;
const cols = 100;
const origins = new Float32Array(N * 2);

for (let i = 0; i < N; i++) {
  const col = i % cols;
  const row = Math.floor(i / cols);
  origins[i * 2] = 100 + col * 8; // x
  origins[i * 2 + 1] = 100 + row * 8; // y
}

particles.setOrigins(origins); // 也會將 particleData 上傳到 GPU
```

`setOrigins(points, requestPositionReset = true)` — 第二個參數控制粒子是否也瞬移到其新原點（對於即時陣型變更有用）或從其當前位置彈向它們。

要在不改變原點的情況下設定位置，請使用 `setPositions()`。要設定初始速度（例如從中心向外爆發），請使用 `setVelocities()`。

這三種方法都會寫入 `particleData` 並設定 `needsInit = true`，因此資料會在下一幀上傳到 WebGPU 儲存緩衝區。

## 滑鼠互動

當 `pointerEvents: true` 時，`Scene` 將游標座標傳遞給粒子模擬。游標 **120 px** 範圍內的粒子會被排斥：

```typescript
const particles = new ComputeParticleEntity({
  maxParticles: 100_000,
  pointerEvents: true,
});
scene.add(particles);
```

排斥半徑和力在著色器中是固定的。當游標離開畫布時，排斥點設定為 `(-99999, -99999)`，因此不會施加排斥。

## 觸發爆炸

`triggerExplosion(x, y, force)` 為下一個模擬步驟排隊一個衝量。所有在 `(x, y)` 的 **150 px** 範圍內的粒子都會收到一個由 `force` 縮放的向外速度推動：

```typescript
canvas.addEventListener('dblclick', (e) => {
  const point = scene.clientToScene(e.clientX, e.clientY);
  particles.triggerExplosion(point.x, point.y, 800);
});
```

一次只能排隊一個爆炸——在前一個爆炸被消耗之前再次呼叫 `triggerExplosion` 會覆蓋它。

## WebGPU vs CPU 備援方案

`particleBackend` 選項控制使用哪個路徑：

| 值               | 行為                                                      |
| ---------------- | --------------------------------------------------------- |
| `'auto'`（預設） | 嘗試 WebGPU；失敗或不存在時回退到 CPU                     |
| `'webgpu'`       | 明確請求 WebGPU；當前執行環境在初始化失敗時仍會回退到 CPU |
| `'cpu'`          | 強制 CPU 模擬；即使可用也停用 WebGPU                      |

**當 WebGPU 活動時：** 模擬作為計算著色器在 GPU 上運行。粒子狀態存在於 WebGPU 儲存緩衝區中，並渲染到 Scene 的專用 WebGPU 畫布。

**當 CPU 備援方案活動時：** `Scene` 每幀呼叫 `entity.updateCPU(dt, mouseX, mouseY, width, height)`（相同的物理模型——彈簧、排斥、爆炸、速度限制、反彈）。透過 Canvas2D 或可選的 WebGL 點層上的 `fillCircle()` 進行渲染。根據目標瀏覽器和硬體上的測量結果選擇計數。

> [!NOTE] > `particles.gpuStorageBuffer !== null` 表示 GPU 資源已分配，但它不是非同步裝置丟失後可靠的即時後端狀態。

裝置丟失會以指數退避（3 次重試）自動恢復，然後永久停用該會話的 WebGPU。

### 從 GPU 讀取粒子位置

粒子狀態存在於 GPU 緩衝區中。你無法廉價地讀回它——`mapAsync` + `copyBufferToBuffer` 的往返會阻塞管線。如果你需要在 CPU 上取得位置（例如用於與非粒子實體的碰撞偵測），請自行寫入 `particleData` 並使用 `setPositions()` 保持 CPU 端的 `Float32Array` 同步。

對於完全在粒子系統內的大規模空間查詢，請編寫額外的 WebGPU 計算傳遞。對於與其他實體的碰撞，請在 CPU 路徑上使用 `SpatialHashGrid`。

## GPU 資源管理

```typescript
// 完成後清理 GPU 緩衝區（例如頁面卸載或元件拆卸時）
particles.destroyGPUResources();
scene.remove(particles);
```

`scene.destroy()` 也會在所有粒子實體上呼叫 `destroyGPUResources()`，因此你只需要在會話中期的拆卸時手動呼叫它。

## WebGPU 的 TypeScript 類型

如果你的專案使用 WebGPU API 且 TypeScript 報告 `Cannot find name 'GPUDevice'`：

```bash
bun add -d @webgpu/types
```

```json
{ "compilerOptions": { "types": ["@webgpu/types"] } }
```

## 疑難排解

### 螢幕上沒有顯示任何內容

按順序檢查：

1. **`initRandomParticles()` 未被呼叫** — 沒有這個，所有粒子位置都是 `(0, 0)` 且大小為 `0`。
2. **`resize(w, h)` 在 `initRandomParticles` 之前未被呼叫** — 散佈在 `0×0` 方框中的粒子是不可見的。檢查 `scene.width` 和 `scene.height` 非零。
3. **WebGPU 初始化失敗** — 當前執行環境會記錄失敗、停用 GPU 路徑，並在即使明確請求 `'webgpu'` 時也繼續透過 CPU 備援方案執行。
4. **`pointBackend` 未設定為 `'webgl'`** — CPU 備援方案透過 `fillCircle` 渲染。沒有 `'webgl'`，CPU 路徑的粒子仍會出現在 Canvas2D 上，但前提是畫布渲染器處於活動狀態。

### FPS 遠低於預期

- 使用瀏覽器 GPU 工具和 WebGPU 畫布驗證活動路徑；保留的 `gpuStorageBuffer` 本身在裝置丟失後並不是一個持久的狀態信號。
- 在無頭 / CI 環境中，WebGPU 和 WebGL 會回退到軟體渲染器（Swiftshader）。無頭模式下的 FPS 不具代表性。請在真實 GPU 硬體上進行測量。
- 在分析時減少 `maxParticles` 並在目標裝置上記錄幀時間百分位數；此儲存庫不建立通用的 CPU 或 GPU 上限。

### 粒子彈回 `(0, 0)` 而非我的陣型

`setOrigins()` 和 `setPositions()` 都會設定 `needsInit = true`，這會在下一幀將 `particleData` 上傳到 GPU 緩衝區。如果你在 `scene.start()` **之前**呼叫它們，請確保之後呼叫 `start()` 以便上傳發生。
