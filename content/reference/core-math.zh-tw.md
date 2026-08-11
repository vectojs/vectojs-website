+++
title = "Math utilities"
description = "用於 O(1) 平均寬相位空間查詢的 SpatialHashGrid，以及用於單一數值臨界可調彈簧的 SpringPhysics — 獨立的 @vectojs/math 套件，由 @vectojs/core 重新匯出。"
weight = 9

[extra]
order = 9
+++

# Math utilities — `@vectojs/math`

`SpatialHashGrid` 和 `SpringPhysics` 是獨立的 **`@vectojs/math`** 套件（一個沒有依賴的葉套件）。[`@vectojs/core`](/reference/core-api/) 依賴並重新匯出它，因此它可以從 `@vectojs/math` 或 `@vectojs/core` 解析。此處的彈簧積分器也支撐著 [`@vectojs/animation`](/reference/core-api/#進入點與模組地圖) 中的 `SpringDriver`。

```ts
new SpatialHashGrid(cellSize = ...)
grid.insert(id, x, y, w, h): void   // safe to call every frame (re-keys old cells)
grid.remove(id): void
grid.query(x, y, w, h): Set<string> // O(k) cells + results; O(1) avg for small uniform entities
grid.clear(): void                  // call once per frame before re-inserting dynamics
```

用於在許多移動 entity 上進行命中測試或碰撞候選查詢的寬相位空間索引 — 在插入時依儲存格分桶 entity，然後 `query()` 一個區域以只取得可能與其重疊的 id，而非掃描每個 entity。`insert()` 是幂等安全的，即使對已存在的 entity 也可每幀呼叫（它會從過時的儲存格重新鍵入），這是常見模式：每幀 `clear()` 一次，對每個動態 entity `insert()`，然後依需要為該幀的命中測試或碰撞檢查 `query()`。

```ts
new SpringPhysics(initial: number)
spring.value / spring.target / spring.velocity
spring.stiffness / spring.damping / spring.mass
spring.update(dt): void
spring.isAtRest(): boolean
```

單一數值的臨界阻尼可調彈簧積分器 — 設定 `spring.target`，每幀呼叫 `update(dt)`，讀取 `spring.value`。這是 `Entity` 內建的 [`springTo()`](/reference/core-entity/#動畫) 所建構於其上的基本元件；當某個值不是六個可動畫的 `Entity` 屬性之一時（自訂著色器 uniform、攝影機欄位、應用程式層級純量），直接使用它。`isAtRest()` 回報速度和到目標的距離何時都衰減到低於引擎的靜止閾值，因此呼叫者可以停止呼叫 `update()`。

## 相關

[`Entity`](/reference/core-entity/#動畫)（`springTo`，建構於 `SpringPhysics`）·
[`@vectojs/core` 概覽](/reference/core-api/)
