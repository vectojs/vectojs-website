+++
title = "ComputeParticleEntity"
description = "La capa de partículas de alto rendimiento: diseño de memoria Float32Array por partícula, simulación en CPU de resorte/amortiguación/explosión y la ruta de cómputo WebGPU con degradado automático a CPU."
weight = 6

[extra]
order = 6
+++

# `ComputeParticleEntity` — capa de partículas de alto rendimiento

Parte de [`@vectojs/core`](/reference/core-api/).

```ts
new ComputeParticleEntity(options?: ComputeParticleOptions)
```

| Opción          | Por defecto | Significado                                                            |
| --------------- | ----------- | ---------------------------------------------------------------------- |
| `maxParticles`  | `10000`     | Número de partículas.                                                  |
| `springK`       | `0.05`      | Tirón del resorte de vuelta al origen (limitado 0–10).                 |
| `damping`       | `0.95`      | Amortiguación de velocidad (0–1).                                      |
| `bounceDamping` | `0.5`       | Energía retenida en el rebote de límites (0–1).                        |
| `maxVelocity`   | `500`       | Límite de velocidad.                                                   |
| `size`          | `4`         | Tamaño base de partícula (px).                                         |
| `color`         | `'#00f0ff'` | Color CSS (`baseColor`).                                               |
| `pointerEvents` | `false`     | Si la capa captura eventos de impacto (`isPointInside` devuelve esto). |

## Diseño de memoria por partícula

`particleData: Float32Array` de longitud `maxParticles × PARTICLE*STRIDE*FLOATS`
(`PARTICLE*STRIDE*FLOATS = 8`). Por partícula, 8 flotantes:

| Constante de desplazamiento  | Índice | Campo                                                                |
| ---------------------------- | ------ | -------------------------------------------------------------------- |
| `PARTICLE_OFFSET_POSITION_X` | 0      | position.x                                                           |
| `PARTICLE_OFFSET_POSITION_Y` | 1      | position.y                                                           |
| `PARTICLE_OFFSET_VELOCITY_X` | 2      | velocity.x                                                           |
| `PARTICLE_OFFSET_VELOCITY_Y` | 3      | velocity.y                                                           |
| `PARTICLE_OFFSET_ORIGIN_X`   | 4      | origin.x (anclaje del resorte)                                       |
| `PARTICLE_OFFSET_ORIGIN_Y`   | 5      | origin.y                                                             |
| `PARTICLE_OFFSET_SIZE`       | 6      | tamaño                                                               |
| `PARTICLE_OFFSET_LIFE`       | 7      | vida: `-1` = perpetua, `>=0` decae a `0.5/s`, `0` = muerta (omitida) |

## Métodos

```ts
initRandomParticles(width, height): void      // dispersa por la caja; life = -1 (perpetua); marca sucio
setOrigins(points: Float32Array | number[], requestPositionReset = true): void
setPositions(positions: Float32Array | number[]): void
setVelocities(velocities: Float32Array | number[]): void
triggerExplosion(x, y, force): void           // encola un impulso para el siguiente paso (radio 150px)
updateCPU(dt, mouseX, mouseY, width, height): void   // paso de simulación CPU; dt en SEGUNDOS, limitado [0,0.1]
destroyGPUResources(): void
```

Simulación CPU por paso: resorte-al-origen + repulsión del ratón (dentro de 120px de un cursor
vivo; cursor "apagado" es `< -9000`) + explosión pendiente (dentro de 150px) → integrar
→ límite de velocidad → rebote de límite + límite → decaimiento de vida. Protegido contra NaN.

## WebGPU vs CPU

Cuando `particleBackend` lo permite (ver [`SceneOptions`](/reference/core-scene/#sceneoptions))
y un dispositivo WebGPU se inicializa, la Scene ejecuta pases de cómputo + renderizado en un
canvas WebGPU dedicado; de lo contrario llama a `updateCPU` y dibuja a través de
`fillCircle` / la [capa WebGL de puntos](/reference/core-renderer/#capa-de-puntos-webgl) opcional.
Que `gpuStorageBuffer` no sea nulo confirma que los recursos fueron asignados, pero
no es un estado "actualmente activo" duradero después de una pérdida asíncrona de dispositivo.
Los recursos GPU (`gpuStorageBuffer`, `gpuUniformBuffer`,
`computeBindGroup`, `renderBindGroup`) y `needsInit` son públicos para autores
de backends.

> La inicialización WebGPU es perezosa (primer fotograma en que aparece un `ComputeParticleEntity`) y asíncrona,
> con recuperación automática ante pérdida de dispositivo. Establece el viewport mediante `scene.resize(w, h)` antes de depender
> de la simulación — una caja de `0×0` no produce movimiento.

Las posiciones de las partículas están en espacio de escena. La ruta CPU Canvas participa en la
pila de transformación de la entidad; las rutas separadas WebGL/WebGPU overlay no aplican
la traslación/escala/rotación de entidad ni el recorte del padre. La opacidad se hereda en
todas las rutas.

Ver [Sistemas de Partículas](/learn/particles/) para uso.

## Relacionados

[`Scene`](/reference/core-scene/) (opción `particleBackend`) ·
[Renderizadores](/reference/core-renderer/) (respaldo de capa de puntos WebGL) ·
[Visión general de `@vectojs/core`](/reference/core-api/)
