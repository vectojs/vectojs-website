+++
title = "動畫 (@vectojs/animation)"
description = "屬性驅動器、補間、彈簧與緩動曲線 — 支援 Entity.animate()、setTransition()、animateTo() 與 springTo() 的引擎。"
weight = 54
+++

# `@vectojs/animation`

獨立的動畫引擎：提供平滑數值運動的屬性驅動器、精選的緩動曲線集合，以及所有 VectoJS 運動介面共享的 `MotionConfig` 結構。`@vectojs/core` 依賴並**重新匯出**它，因此大多數應用程式不會直接匯入此套件 — `entity.setTransition({ x: 'spring' })`、`entity.animateTo(...)`、`entity.springTo(...)` 與 `entity.animate({...}, ms)` 是進入點（參見 [`core-entity` # 動畫](/reference/core-entity/#動畫)）。直接匯入它以建立自訂驅動器，或單獨使用緩動曲線：

```ts
import { TweenDriver, SpringDriver, Easing, EASING_IDS } from '@vectojs/animation';
```

## MotionConfig — 共用的設定結構

```ts
type MotionConfig = 'spring' | SpringConfig | TweenConfig;

interface TweenConfig {
  duration: number; // ms (required — its presence selects a tween)
  easing?: EasingName | EasingFn; // named curve or custom fn, default 'linear'
  delay?: number; // ms before the tween starts, default 0
}

interface SpringConfig {
  stiffness?: number; // default 170
  damping?: number; // default 26
  mass?: number; // default 1
}
```

判別規則：含有 `duration` 的設定是補間，其他任何內容都是彈簧（`isTweenConfig(c)` 正是實作此規則）。單獨的 `'spring'` 字串表示「預設彈簧」。

## 驅動器（`PropertyDriver`）

```ts
interface PropertyDriver {
  value: number; // current value
  readonly target: number; // destination — applied exactly on completion
  retarget(to: number): void; // change destination; spring keeps velocity, tween restarts
  tick(dtMs: number): void; // advance by dt in milliseconds
  isDone(): boolean;
  syncExternal(value: number, extra: number): void; // adopt externally-advanced state
}
```

- **`TweenDriver(from, to, config: TweenConfig)`** — 在 `duration` 毫秒內，從 `from` 到 `to` 的緩動內插，可選 `delay`。`retarget()` 會從目前值重新啟動補間。
- **`SpringDriver(from, to, config?: SpringConfig)`** — 質量-彈簧-阻尼整合（由 `@vectojs/math` 的 `SpringPhysics` 提供支援）。`retarget()` 保留速度，因此在中途重新設定目標是連續的。`target` 在完成時**精確**套用，而非在靜止容差（rest epsilon）內。
- `syncExternal(value, extra)` 採用在其他地方推進的狀態（例如 WASM 批次 tick）：`extra` 對彈簧而言是速度，對補間而言是已流逝的毫秒數 — 呼叫之後，`value`/`tick()`/`isDone()`/`retarget()` 全都保持正確。

## 緩動曲線

```ts
type EasingFn = (t: number) => number; // normalized [0,1] → eased progress
type EasingName = keyof typeof Easing; // built-in curve names

Easing.linear | Easing.easeInQuad | Easing.easeOutQuad | Easing.easeInOutQuad;
Easing.easeInCubic | Easing.easeOutCubic | Easing.easeInOutCubic;
Easing.easeOutBack | Easing.easeInOutBack;
```

每個內建曲線都滿足 f(0)=0、f(1)=1，並以明確的乘法撰寫，因此能與 WASM `ease()` 核心**逐位元**相符 — 批次補間不僅僅是接近其 JS 對應物，而是完全相等。`EASING_IDS` 將每個名稱對應到其數值 id（用於區分具名緩動的補間 — 可批次處理 — 與無法跨越至 WASM 的自訂 `EasingFn` 閉包）。任何可使用具名曲線的地方都允許自訂函式：`easing: (t) => t * t * (3 - 2 * t)`。

## 與 `Entity` 運動的關係

| 介面                                            | 使用                       |
| ----------------------------------------------- | -------------------------- |
| `setTransition({ prop: 'spring' })` then assign | 每屬性一個 `SpringDriver`  |
| `animateTo({...}, duration, easing)`            | `TweenDriver`s             |
| `springTo({...}, config?)`                      | `SpringDriver`s            |
| `animate({...}, ms)`                            | 針對六個內建數值屬性的補間 |

`animate()` 僅對 `x | y | scaleX | scaleY | rotation | opacity` 進行內插 — 自訂欄位不受驅動（參見 [`core-entity`](/reference/core-entity/#動畫)）。
