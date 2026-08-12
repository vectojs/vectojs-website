+++
title = "Animation (@vectojs/animation)"
description = "Les drivers de propriétés, les tweens, les ressorts et les courbes d'accélération — le moteur derrière Entity.animate(), setTransition(), animateTo() et springTo()."
weight = 54
+++

# `@vectojs/animation`

Le moteur d'animation autonome : des drivers de propriétés pour un mouvement
numérique fluide, un ensemble de courbes d'accélération soigneusement
sélectionné, et la forme `MotionConfig` partagée par toutes les surfaces de
mouvement VectoJS. `@vectojs/core` en dépend et le **ré-exporte**, donc la
plupart des applications n'importent jamais ce paquet directement —
`entity.setTransition({ x: 'spring' })`, `entity.animateTo(...)`,
`entity.springTo(...)` et `entity.animate({...}, ms)` sont les points
d'entrée (voir [`core-entity` # Animation](/reference/core-entity/#animation)).
Importez-le directement pour construire des drivers personnalisés ou utiliser
les easings de façon autonome :

```ts
import { TweenDriver, SpringDriver, Easing, EASING_IDS } from '@vectojs/animation';
```

## MotionConfig — la forme de configuration partagée

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

La règle discriminante : une configuration avec `duration` est un tween, toute
autre chose est un ressort (`isTweenConfig(c)` implémente exactement cela). Une
simple chaîne `'spring'` signifie « ressort par défaut ».

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

- **`TweenDriver(from, to, config: TweenConfig)`** — interpolation avec courbe
  d'accélération de `from` à `to` sur `duration` ms, avec un `delay` optionnel.
  `retarget()` redémarre le tween à partir de la valeur actuelle.
- **`SpringDriver(from, to, config?: SpringConfig)`** — intégration
  masse-ressort-amortisseur (basée sur `SpringPhysics` de `@vectojs/math`).
  `retarget()` conserve la vélocité, donc un reciblage en cours de vol est
  continu. `target` est appliqué **exactement** à la fin plutôt que dans un
  epsilon de repos.
- `syncExternal(value, extra)` adopte un état avancé ailleurs (par ex. un tick
  WASM groupé) : `extra` est la vélocité pour un ressort, les ms écoulées pour
  un tween — après l'appel, `value`/`tick()`/`isDone()`/`retarget()` restent
  tous corrects.

## Easing

```ts
type EasingFn = (t: number) => number; // normalized [0,1] → eased progress
type EasingName = keyof typeof Easing; // built-in curve names

Easing.linear | Easing.easeInQuad | Easing.easeOutQuad | Easing.easeInOutQuad;
Easing.easeInCubic | Easing.easeOutCubic | Easing.easeInOutCubic;
Easing.easeOutBack | Easing.easeInOutBack;
```

Chaque courbe intégrée vérifie f(0)=0, f(1)=1 et est écrite avec une
multiplication explicite afin de correspondre au noyau WASM `ease()` **bit pour
bit** — un tween groupé n'est pas simplement proche de son jumeau JS, il lui est
exactement égal. `EASING_IDS` mappe chaque nom vers son identifiant numérique
(utilisé pour distinguer un tween à accélération nommée — groupable — d'une
fermeture `EasingFn` personnalisée, qui ne peut pas traverser vers WASM). Les
fonctions personnalisées sont autorisées partout où une courbe nommée l'est :
`easing: (t) => t * t * (3 - 2 * t)`.

## Relation avec le mouvement de `Entity`

| Surface                                           | Utilise                                                |
| ------------------------------------------------- | ------------------------------------------------------ |
| `setTransition({ prop: 'spring' })` puis assigner | un `SpringDriver` par propriété                        |
| `animateTo({...}, duration, easing)`              | des `TweenDriver`s                                     |
| `springTo({...}, config?)`                        | des `SpringDriver`s                                    |
| `animate({...}, ms)`                              | des tweens sur les six propriétés numériques intégrées |

`animate()` n'interpole que `x | y | scaleX | scaleY | rotation | opacity`
— les champs personnalisés ne sont pas pilotés (voir [`core-entity`](/reference/core-entity/#animation)).
