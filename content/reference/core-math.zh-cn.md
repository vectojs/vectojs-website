+++
title = "数学工具"
description = "用于 O(1) 平均粗略阶段空间查询的 SpatialHashGrid，以及用于单值临界可调弹簧的 SpringPhysics —— 独立的 @vectojs/math 包，由 @vectojs/core 重新导出。"
weight = 9
+++

# 数学工具 —— `@vectojs/math`

`SpatialHashGrid` 和 `SpringPhysics` 是独立的 **`@vectojs/math`** 包（一个没有依赖的叶子包）。[`@vectojs/core`](/reference/core-api/) 依赖并重新导出它，因此它可以从 `@vectojs/math` 或 `@vectojs/core` 解析。这里的弹簧积分器也是 [`@vectojs/animation`](/reference/core-api/#ru-kou-dian-yu-mo-kuai-di-tu) 中 `SpringDriver` 的支撑。

```ts
new SpatialHashGrid(cellSize = ...)
grid.insert(id, x, y, w, h): void   // safe to call every frame (re-keys old cells)
grid.remove(id): void
grid.query(x, y, w, h): Set<string> // O(k) cells + results; O(1) avg for small uniform entities
grid.clear(): void                  // call once per frame before re-inserting dynamics
```

一个用于命中测试或碰撞候选查询的粗略阶段空间索引，覆盖许多移动实体 —— 在插入时按单元格分桶实体，然后 `query()` 一个区域以仅获取可能与之重叠的 id，而不是扫描每个实体。`insert()` 是幂等安全的，即使对于已存在的实体也可以每帧调用（它会从陈旧单元格中重新设键），这是通常的模式：每帧 `clear()` 一次，`insert()` 每个动态实体，然后按该帧的命中测试或碰撞检查需要 `query()`。

```ts
new SpringPhysics(initial: number)
spring.value / spring.target / spring.velocity
spring.stiffness / spring.damping / spring.mass
spring.update(dt): void
spring.isAtRest(): boolean
```

一个单值临界阻尼可调的弹簧积分器 —— 设置 `spring.target`，每帧调用 `update(dt)`，读取 `spring.value`。这是 `Entity` 内置的 [`springTo()`](/reference/core-entity/#dong-hua) 所构建于其上的图元；对于不是六个可动画 `Entity` 属性之一的值（自定义 shader uniform、相机字段、应用级标量），直接使用它。`isAtRest()` 报告速度和到目标的距离何时都衰减到引擎的静止阈值以下，因此调用者可以停止调用 `update()`。

## 相关

[`Entity`](/reference/core-entity/#dong-hua)（`springTo`，构建于 `SpringPhysics` 之上）·
[`@vectojs/core` 概述](/reference/core-api/)
