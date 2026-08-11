+++
title = "物理與動畫"
description = "將彈簧物理、速度和力導向模擬應用於 VMT 中的任何實體。"
weight = 11

[extra]
order = 11
+++

# 物理與動畫

VectoJS 超越了靜態布局。因為 UI 存在於虛擬數學樹中，你可以將**連續力導向物理**應用於任何元件——包括標準的 `Button` 和 `Input`。

## 內建補間動畫：`entity.animate()`

最簡單的運動工具。`animate()` 在任何數值屬性上排隊平滑的緩出補間動畫：

```typescript
button.animate({ x: 200, opacity: 0.5 }, 500);

// 鏈接是順序的，而非並發：
button.animate({ x: 400 }, 300).animate({ y: 200 }, 300).animate({ opacity: 0 }, 200);
```

當補間動畫運行時，場景保持非靜態——無需呼叫 `markDirty()`。當補間動畫穩定後，`hasPendingAnimations()` 返回 `false`。

> [!TIP]
> 鏈接是順序的（`animate` 返回 `this`），而非並發的。對於並發運動、更豐富的緩動、彈簧和元件的進入/退出，請使用下面的動畫系統。

## 宣告式與命令式動畫

在 **0.2.0** 中新增，動畫系統以彈簧為優先，並將補間動畫和彈簧統一在一個 API 後面——這是為任何實體的變換或不透明度製作動畫的推薦方式。它與內建元件（Modal、Tooltip 等）用來為自身製作動畫的引擎相同。

### 宣告式過渡

宣告哪些屬性要動畫化以及如何動畫化；然後簡單的賦值就會觸發動畫：

```typescript
entity.setTransition({
  opacity: 'spring', // 預設彈簧
  x: { duration: 300, easing: 'easeOutCubic' }, // 補間動畫
  scaleX: { stiffness: 200, damping: 18 }, // 帶覆蓋值的彈簧
});

entity.opacity = 1; // 彈性到 1
entity.x = 400; // 在 300ms 內補間
```

在運動途中賦予新目標會**重新定位**正在運行的動畫——彈簧會保持其速度——因此快速切換或手勢驅動的 UI 會連續流暢地變化，而不是突然跳動。沒有配置過渡的屬性會透過普通的 setter 立即寫入，而不會建立驅動器。可動畫的屬性是 `x`、`y`、`scaleX`、`scaleY`、`rotation` 和 `opacity`。

### 命令式一次性動畫

對於編排，`animateTo`（補間動畫）和 `springTo`（彈簧）直接驅動屬性，並返回一個在運動穩定時解析的 Promise：

```typescript
await entity.animateTo({ x: 400, opacity: 0 }, { duration: 500, easing: 'easeOutCubic' });
await entity.springTo({ scaleX: 1, scaleY: 1 }, { stiffness: 200, damping: 18 });
```

與 `animate()`（順序鏈接）不同，這些是並發運行的，並與 `async`/`await` 組合。

### 緩動

`Easing` 匯出提供了一組精選的曲線——`linear`、`easeInOut{Quad,Cubic}`、`easeOut{Quad,Cubic}`、`easeOutBack`（超調）等。將曲線名稱或你自己的 `(t: number) => number` 函式傳遞給任何補間動畫的 `easing` 選項。

### 減少動畫

系統會自動遵守作業系統的 **prefers-reduced-motion** 設定：移動（變換、彈簧）會跳到其目標，同時保留不透明度淡入淡出——元件仍然出現和消失，只是沒有運動。無需每個元件的程式碼。

> [!TIP]
> 元件透過此系統為其自身的進入/退出製作動畫。任何 `UIComponent` 子類別都可以宣告 `enterMotion`/`exitMotion` 並呼叫 `dismiss()` 以動畫方式退出然後卸載——請參閱 [UI 元件參考](/reference/ui-components/)。

## SpringPhysics

`SpringPhysics` 是一個用於平滑、物理感受的數值過渡的阻尼彈簧：

```typescript
import { SpringPhysics } from '@vectojs/core';

const spring = new SpringPhysics(0);   // 初始值 = 0
spring.stiffness = 180;
spring.damping = 18;

// 隨時設定目標（例如懸停時）
spring.target = 1.0;

// 在你的實體的 update() 中：
update(dt: number) {
  spring.update(dt);
  this.opacity = spring.value;
  if (!spring.isAtRest()) this.scene?.markDirty();
}
```

當目標連續變化時（游標追蹤、滾動動量、互動拖曳），請使用 `SpringPhysics` 而不是 `animate()`。

## 實體上的手動物裡

每個 `Entity` 都有 `x`/`y` 和 `update(dt, time)`。你可以透過覆寫 `update` 來實作任何物理模型：

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class BallEntity extends Entity {
  vx = (Math.random() - 0.5) * 200;
  vy = (Math.random() - 0.5) * 200;
  friction = 0.97;

  constructor(public radius: number) {
    super();
    this.width = this.height = radius * 2;
  }

  applyForce(fx: number, fy: number) {
    this.vx += fx;
    this.vy += fy;
  }

  override update(dt: number) {
    super.update(dt); // 推進佇列中的 animate() 補間動畫
    const seconds = dt / 1000;
    this.x += this.vx * seconds;
    this.y += this.vy * seconds;
    this.vx *= this.friction;
    this.vy *= this.friction;
  }

  isPointInside(gx: number, gy: number) {
    const local = this.worldToLocal(gx, gy);
    if (!local) return false;
    return (local.x - this.radius) ** 2 + (local.y - this.radius) ** 2 <= this.radius ** 2;
  }

  render(r: IRenderer) {
    r.beginPath();
    r.arc(this.radius, this.radius, this.radius, 0, Math.PI * 2);
    r.fill('#6366f1');
  }
}
```

## 彈性邊界

使用簡單的阻尼因子將實體從視窗邊緣彈回：

```typescript
const BOUNCE = 0.75;

override update(dt: number) {
  super.update(dt);
  const seconds = dt / 1000;
  this.x += this.vx * seconds;
  this.y += this.vy * seconds;

  const { width, height } = this.scene!;

  if (this.x < 0) { this.x = 0; this.vx = Math.abs(this.vx) * BOUNCE; }
  if (this.x + this.width > width) {
    this.x = width - this.width;
    this.vx = -Math.abs(this.vx) * BOUNCE;
  }
  if (this.y < 0) { this.y = 0; this.vy = Math.abs(this.vy) * BOUNCE; }
  if (this.y + this.height > height) {
    this.y = height - this.height;
    this.vy = -Math.abs(this.vy) * BOUNCE;
  }
}
```

這種模式適用於小型的應用程式管理集合。Nexus 演示改為使用 `ComputeParticleEntity` 的固定彈簧/滑鼠/爆炸模型；它不模擬實體對實體的互動。

## SpatialHashGrid：應用程式管理的鄰居候選

對於 N 體互動（排斥、碰撞），樸素的成對迴圈是 O(N²)。使用 `SpatialHashGrid` 從查詢重疊的單元中檢索候選，然後對該較小集合執行精確測試：

```typescript
import { SpatialHashGrid } from '@vectojs/core';

const grid = new SpatialHashGrid(64); // 單元大小，以世界單位為單位

// 每幀：重建網格，然後查詢
for (const ball of balls) {
  grid.insert(ball.id, ball.x, ball.y, ball.width, ball.height);
}

for (const ball of balls) {
  const nearby = grid.query(ball.x - 50, ball.y - 50, 100, 100);
  for (const otherId of nearby) {
    if (otherId === ball.id) continue;
    // 在 ball 和 balls[otherId] 之間施加排斥
  }
}

grid.clear(); // 在重新插入之前每幀呼叫一次
```

當你需要真正的鄰居互動（球對球碰撞、群聚、實體間的排斥）時，自己使用此模式。請注意，`ComputeParticleEntity` 在內部**不**使用 `SpatialHashGrid`——其模擬（GPU 或 CPU）僅計算相對於固定點（彈簧原點、滑鼠、爆炸中心）的力，而非實體對實體。如果你同時需要高粒子數量和真正的鄰居互動，你就是在結合引擎不為你一起處理的兩件事：你將在 CPU 上運行自己的基於 `SpatialHashGrid` 的鄰居查詢（如上所述），或為 GPU 路徑編寫一個帶有內建鄰居查詢的自訂 WGSL 計算傳遞。

> [!WARNING]
> 每幀重建哈希網格。來自前一幀的過時網格資料會產生不正確的鄰居查詢和幽靈碰撞。

## 高吞吐量粒子：`ComputeParticleEntity`

對於數萬個具有彈簧到原點 + 滑鼠排斥的粒子，請使用 `ComputeParticleEntity`。它會在可用時自動使用 WebGPU 計算著色器，並回退到 CPU：

```typescript
import { ComputeParticleEntity } from '@vectojs/core';

const particles = new ComputeParticleEntity({
  maxParticles: 15000,
  springK: 0.05,
  damping: 0.95,
  size: 3,
  color: '#6366f1',
});

// 在視窗中散佈粒子
particles.initRandomParticles(scene.width, scene.height);
scene.add(particles);
scene.start();

// 將粒子動畫到新的原點位置（例如拼出文字）
particles.setOrigins(newPositions);
```

> [!CAUTION]
> 在 `initRandomParticles` 之前，始終呼叫 `scene.resize(width, height)` 或讓 Scene 自動調整大小。一個 `0×0` 的視窗不會產生初始位置，粒子將永遠不會移動。

請參閱[核心 API 參考](/reference/core-api/)以了解完整的 `ComputeParticleEntity` 記憶體布局和 WebGPU 內部細節。
