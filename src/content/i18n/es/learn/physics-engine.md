---
title: 'Física y Animación'
description: 'Aplica física de resortes, velocidad y simulación dirigida por fuerzas a cualquier entidad del VMT.'
order: 11
---

# Física y Animación

VectoJS va más allá de la disposición estática. Como la UI vive en un Virtual Math Tree, puedes aplicar **física continua dirigida por fuerzas** a cualquier componente — incluidos los `Button` e `Input` estándar.

## Tweening integrado: `entity.animate()`

La herramienta de movimiento más simple. `animate()` encola tweens suaves de tipo ease-out en cualquier propiedad numérica:

```typescript
button.animate({ x: 200, opacity: 0.5 }, 500);

// Chains are sequential, not concurrent:
button.animate({ x: 400 }, 300).animate({ y: 200 }, 300).animate({ opacity: 0 }, 200);
```

Mientras un tween está en ejecución, la escena se mantiene no estática — no hace falta llamar a `markDirty()`. Cuando el tween se asienta, `hasPendingAnimations()` devuelve `false`.

> [!TIP]
> Las cadenas son secuenciales (`animate` devuelve `this`), no concurrentes. Para movimiento concurrente, easing más rico, resortes y entrada/salida en componentes, usa el sistema de animación de más abajo.

## Animación declarativa e imperativa

Añadido en **0.2.0**, el sistema de animación es spring-first y unifica tweens y resortes tras una sola API — la forma recomendada de animar la transformación o la opacidad de cualquier entidad. Es el mismo motor que usan los componentes integrados (Modal, Tooltip, …) para animarse a sí mismos.

### Transiciones declarativas

Declara qué propiedades se animan y cómo; luego la simple asignación las anima:

```typescript
entity.setTransition({
  opacity: 'spring', // default spring
  x: { duration: 300, easing: 'easeOutCubic' }, // tween
  scaleX: { stiffness: 200, damping: 18 }, // spring with overrides
});

entity.opacity = 1; // springs to 1
entity.x = 400; // tweens over 300ms
```

Asignar un nuevo objetivo en pleno vuelo **reorienta** la animación en ejecución — un resorte conserva su velocidad — de modo que una UI conmutada rápidamente o dirigida por gestos fluye continuamente en lugar de dar saltos. Las propiedades sin transición configurada se escriben inmediatamente a través del setter normal, sin crear un driver. Las propiedades animables son `x`, `y`, `scaleX`, `scaleY`, `rotation` y `opacity`.

### Disparos únicos imperativos

Para la coreografía, `animateTo` (tween) y `springTo` (spring) impulsan las propiedades directamente y devuelven una Promise que se resuelve cuando el movimiento se asienta:

```typescript
await entity.animateTo({ x: 400, opacity: 0 }, { duration: 500, easing: 'easeOutCubic' });
await entity.springTo({ scaleX: 1, scaleY: 1 }, { stiffness: 200, damping: 18 });
```

A diferencia de `animate()` (que encadena secuencialmente), estos se ejecutan de forma concurrente y se componen con `async`/`await`.

### Easing

La exportación `Easing` proporciona un conjunto curado de curvas — `linear`, `easeInOut{Quad,Cubic}`, `easeOut{Quad,Cubic}`, `easeOutBack` (overshoot) y más. Pasa un nombre de curva, o tu propia función `(t: number) => number`, a la opción `easing` de cualquier tween.

### Movimiento reducido

El sistema respeta automáticamente el ajuste del SO **prefers-reduced-motion**: el movimiento (transformaciones, resortes) salta a su objetivo mientras que los desvanecimientos de opacidad se conservan — los componentes siguen apareciendo y desapareciendo, solo que sin movimiento. No se requiere código por componente.

> [!TIP]
> Los componentes animan su propia entrada/salida a través de este sistema. Cualquier subclase de `UIComponent` puede declarar `enterMotion`/`exitMotion` y llamar a `dismiss()` para animar la salida y luego desmontarse — consulta la [referencia de Componentes de UI](/reference/ui-components/).

## SpringPhysics

`SpringPhysics` es un resorte amortiguado para transiciones numéricas suaves y con sensación física:

```typescript
import { SpringPhysics } from '@vectojs/core';

const spring = new SpringPhysics(0);   // initial value = 0
spring.stiffness = 180;
spring.damping = 18;

// Set target at any time (e.g. on hover)
spring.target = 1.0;

// In your entity's update():
update(dt: number) {
  spring.update(dt);
  this.opacity = spring.value;
  if (!spring.isAtRest()) this.scene?.markDirty();
}
```

Usa `SpringPhysics` en lugar de `animate()` cuando el objetivo cambia continuamente (seguimiento del cursor, momento del scroll, arrastre interactivo).

## Física manual en las entidades

Cada `Entity` tiene `x`/`y` y `update(dt, time)`. Puedes implementar cualquier modelo de física sobrescribiendo `update`:

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
    super.update(dt); // advance queued animate() tweens
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

## Límites elásticos

Rebota las entidades contra los bordes del viewport con un simple factor de amortiguación:

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

Este patrón es apropiado para pequeñas colecciones gestionadas por la aplicación. La demo Nexus en su lugar usa el modelo fijo de resorte/ratón/explosión de `ComputeParticleEntity`; no simula la interacción entre entidades.

## SpatialHashGrid: candidatos vecinos gestionados por la aplicación

Para interacciones de N cuerpos (repulsión, colisión), un bucle par a par ingenuo es O(N²). Usa `SpatialHashGrid` para recuperar candidatos de las celdas solapadas por una consulta, luego ejecuta pruebas exactas sobre ese conjunto más pequeño:

```typescript
import { SpatialHashGrid } from '@vectojs/core';

const grid = new SpatialHashGrid(64); // cell size in world units

// Every frame: rebuild grid, then query
for (const ball of balls) {
  grid.insert(ball.id, ball.x, ball.y, ball.width, ball.height);
}

for (const ball of balls) {
  const nearby = grid.query(ball.x - 50, ball.y - 50, 100, 100);
  for (const otherId of nearby) {
    if (otherId === ball.id) continue;
    // apply repulsion between ball and balls[otherId]
  }
}

grid.clear(); // call once per frame before re-inserting
```

Usa tú mismo este patrón cuando necesites una interacción real de vecinos (colisión bola contra bola, flocking, repulsión entre entidades). Ten en cuenta que `ComputeParticleEntity` **no** usa `SpatialHashGrid` internamente — su simulación (GPU o CPU) solo calcula fuerzas relativas a puntos fijos (origen del resorte, ratón, centro de la explosión), no entre entidades. Si necesitas tanto conteos altos de partículas _como_ interacción real de vecinos, estás combinando dos cosas que el motor no hace por ti: ejecutarías tu propia consulta de vecinos basada en `SpatialHashGrid` en la CPU (como arriba), o escribirías una pasada de cómputo WGSL personalizada con una consulta de vecinos incorporada para la ruta de GPU.

> [!WARNING]
> Reconstruye la cuadrícula hash en cada frame. Los datos obsoletos de la cuadrícula de un frame anterior producirán consultas de vecinos incorrectas y colisiones fantasma.

## Partículas de alto rendimiento: `ComputeParticleEntity`

Para decenas de miles de partículas con resorte al origen + repulsión del ratón, usa `ComputeParticleEntity`. Usa automáticamente los compute shaders de WebGPU cuando están disponibles, con alternativa por CPU:

```typescript
import { ComputeParticleEntity } from '@vectojs/core';

const particles = new ComputeParticleEntity({
  maxParticles: 15000,
  springK: 0.05,
  damping: 0.95,
  size: 3,
  color: '#6366f1',
});

// Scatter particles across the viewport
particles.initRandomParticles(scene.width, scene.height);
scene.add(particles);
scene.start();

// Animate particles toward new origin positions (e.g. spell out text)
particles.setOrigins(newPositions);
```

> [!CAUTION]
> Llama siempre a `scene.resize(width, height)` o deja que el Scene se redimensione automáticamente antes de `initRandomParticles`. Un viewport de `0×0` no produce posiciones iniciales y las partículas nunca se moverán.

Consulta la [Referencia de la API Core](/reference/core-api/) para la disposición de memoria completa de `ComputeParticleEntity` y los aspectos internos de WebGPU.
