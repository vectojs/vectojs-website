+++
title = "Animación (@vectojs/animation)"
description = "Drivers de propiedades, tweens, springs y curvas de easing — el motor detrás de Entity.animate(), setTransition(), animateTo() y springTo()."
weight = 54
+++

# `@vectojs/animation`

El motor de animación independiente: drivers de propiedades para un movimiento numérico suave, un
conjunto de easings seleccionados y la forma `MotionConfig` que comparte toda superficie de movimiento de
VectoJS. `@vectojs/core` depende de él y lo **re-exporta**, por lo que la mayoría de las aplicaciones
nunca importan este paquete directamente — `entity.setTransition({ x: 'spring' })`,
`entity.animateTo(...)`, `entity.springTo(...)` y `entity.animate({...}, ms)`
son los puntos de entrada (consulta [`core-entity` # Animation](/reference/core-entity/#animation)).
Impórtalo directamente para crear drivers personalizados o usar los easings de forma independiente:

```ts
import { TweenDriver, SpringDriver, Easing, EASING_IDS } from '@vectojs/animation';
```

## MotionConfig — la forma de configuración compartida

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

La regla discriminatoria: una configuración con `duration` es un tween; cualquier otra cosa es un
spring (`isTweenConfig(c)` implementa exactamente esto). Una cadena `'spring'` a secas
significa "spring por defecto".

## Drivers (`PropertyDriver`)

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

- **`TweenDriver(from, to, config: TweenConfig)`** — interpolación con easing desde
  `from` hasta `to` durante `duration` ms, con `delay` opcional. `retarget()`
  reinicia el tween desde el valor actual.
- **`SpringDriver(from, to, config?: SpringConfig)`** — integración masa-resorte-amortiguador
  (respaldada por `SpringPhysics` de `@vectojs/math`). `retarget()` conserva la
  velocidad, por lo que reencuadrar en pleno vuelo es continuo. `target` se aplica
  **exactamente** al completarse y no dentro de una épsilon de reposo.
- `syncExternal(value, extra)` adopta el estado avanzado en otro lugar (p. ej. un tick por lotes
  WASM): `extra` es la velocidad para un spring y los ms transcurridos para un tween —
  tras la llamada, `value`/`tick()`/`isDone()`/`retarget()` siguen siendo correctos.

## Easing

```ts
type EasingFn = (t: number) => number; // normalized [0,1] → eased progress
type EasingName = keyof typeof Easing; // built-in curve names

Easing.linear | Easing.easeInQuad | Easing.easeOutQuad | Easing.easeInOutQuad;
Easing.easeInCubic | Easing.easeOutCubic | Easing.easeInOutCubic;
Easing.easeOutBack | Easing.easeInOutBack;
```

Cada curva integrada cumple f(0)=0, f(1)=1 y está escrita con una multiplicación
explícita para que coincida **bit a bit** con el kernel `ease()` de WASM — un
tween por lotes no solo está cerca de su gemelo JS, sino que es exactamente igual.
`EASING_IDS` asigna a cada nombre su id numérico (se usa para distinguir un tween de easing con
nombre — agrupable — de un cierre `EasingFn` personalizado, que no puede cruzar a
WASM). Las funciones personalizadas se permiten dondequiera que haya una curva con nombre: `easing: (t) =>
t * t * (3 - 2 * t)`.

## Relación con el movimiento de `Entity`

| Superficie                                          | Usa                                                    |
| --------------------------------------------------- | ------------------------------------------------------ |
| `setTransition({ prop: 'spring' })` y luego asignar | un `SpringDriver` por propiedad                        |
| `animateTo({...}, duration, easing)`                | `TweenDriver`s                                         |
| `springTo({...}, config?)`                          | `SpringDriver`s                                        |
| `animate({...}, ms)`                                | tweens sobre las seis propiedades numéricas integradas |

`animate()` solo interpola `x | y | scaleX | scaleY | rotation | opacity`
— los campos personalizados no se controlan (consulta [`core-entity`](/reference/core-entity/#animation)).
