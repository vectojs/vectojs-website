---
title: 'Sistemas de Partículas'
description: 'ComputeParticleEntity: partículas de cómputo WebGPU, alternativa por CPU, la disposición de memoria de 8 floats, interacción con el ratón y triggerExplosion.'
order: 12
---

# Sistemas de Partículas

`ComputeParticleEntity` es la capa de partículas de alto rendimiento de VectoJS. Ejecuta una simulación de física de resortes a través de una pasada de cómputo de WebGPU, con una alternativa por CPU para los navegadores que no soportan WebGPU. El conteo de partículas y la tasa de frames soportados dependen fuertemente de la GPU, el navegador, el DPR y la configuración de renderizado; el repositorio no incluye actualmente un benchmark de hardware de 100k/1M registrado.

## Pruébalo en vivo

<figure class="sandbox">
  <a class="sandbox-cta" href="/demos/nexus/">
    <span class="sandbox-cta-title">Abre la demo de partículas Nexus →</span>
    <span class="sandbox-cta-sub">Decenas de miles de puntos de <code>ComputeParticleEntity</code> que deletrean "VectoJS", simulados en WebGPU. Arrastra para hacer pan, desplázate para hacer zoom, haz clic para enviar un pulso a través del campo.</span>
  </a>
  <figcaption>El campo de partículas se ejecuta a máxima velocidad como una página WebGPU independiente — un pequeño iframe incrustado lo frenaba, así que esto enlaza a la versión real.</figcaption>
</figure>

## Partículas vs `getBatchCircle`

|                          | `ComputeParticleEntity`                             | `getBatchCircle` en una entidad personalizada |
| ------------------------ | --------------------------------------------------- | --------------------------------------------- |
| Física                   | Integrada (resorte, repulsión del ratón, explosión) | Manual — actualizas la posición en `update()` |
| Backend                  | Cómputo WebGPU o CPU                                | Capa de puntos WebGL                          |
| Rendimiento (throughput) | Dependiente del hardware/carga de trabajo           | Dependiente del hardware/carga de trabajo     |
| Cuándo usar              | Campos de física autocontenidos                     | Nubes de puntos que controlas directamente    |

Si necesitas un campo de partículas que salte hacia formaciones, reaccione al cursor y dispare explosiones, `ComputeParticleEntity` es la herramienta correcta. Si solo quieres renderizar muchos puntos en posiciones que controlas, implementa `getBatchCircle()` en una entidad personalizada.

## Configuración básica

```typescript
import { Scene, ComputeParticleEntity } from '@vectojs/core';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;

const scene = new Scene(canvas, {
  particleBackend: 'auto', // 'webgpu' | 'cpu' | 'auto' (default: tries WebGPU, falls back)
  pointBackend: 'webgl', // needed for CPU fallback rendering
  maxFPS: 60,
});

const particles = new ComputeParticleEntity({
  maxParticles: 50_000,
  springK: 0.05, // spring pull toward origin (0–10)
  damping: 0.95, // velocity damping per step (0–1)
  bounceDamping: 0.5, // energy retained on boundary bounce (0–1)
  maxVelocity: 500, // speed clamp
  size: 3, // base particle radius in px
  color: '#00f0ff',
  pointerEvents: false, // true → entity captures hit events
});

scene.add(particles);
scene.start();

// IMPORTANT: resize before calling initRandomParticles
scene.resize(window.innerWidth, window.innerHeight);

// Scatter particles across the viewport
particles.initRandomParticles(scene.width, scene.height);

window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
});
```

> [!CAUTION] > `resize(w, h)` debe llamarse **antes** de `initRandomParticles`. Un viewport de `0×0` significa que todas las posiciones de las partículas se inicializan por defecto en `(0, 0)` y la simulación no tiene límite contra el que rebotar. `scene.start()` registra una advertencia única si el ancho o el alto es cero.

## La disposición de memoria de 8 floats

Cada partícula son 8 valores `float32` consecutivos en `entity.particleData`:

| Constante de offset          | Índice | Campo      | Notas                                                       |
| ---------------------------- | ------ | ---------- | ----------------------------------------------------------- |
| `PARTICLE_OFFSET_POSITION_X` | 0      | position.x | x actual en el espacio del mundo                            |
| `PARTICLE_OFFSET_POSITION_Y` | 1      | position.y | y actual en el espacio del mundo                            |
| `PARTICLE_OFFSET_VELOCITY_X` | 2      | velocity.x |                                                             |
| `PARTICLE_OFFSET_VELOCITY_Y` | 3      | velocity.y |                                                             |
| `PARTICLE_OFFSET_ORIGIN_X`   | 4      | origin.x   | Punto de reposo/anclaje del resorte                         |
| `PARTICLE_OFFSET_ORIGIN_Y`   | 5      | origin.y   |                                                             |
| `PARTICLE_OFFSET_SIZE`       | 6      | size       | Anulación de tamaño por partícula                           |
| `PARTICLE_OFFSET_LIFE`       | 7      | life       | `-1` = perpetua; `≥0` decae a 0.5/s; `0` = muerta (omitida) |

Puedes leer y escribir `particleData` directamente para configurar formaciones personalizadas. Tras escribir, establece `needsInit = true` para desencadenar una subida a la GPU en el siguiente frame.

## Formar figuras de texto y patrones

`setOrigins()` es la forma principal de hacer que las partículas salten a una formación. Pasa un `Float32Array` plano de pares alternantes `[x0, y0, x1, y1, …]` — uno por partícula:

```typescript
// Arrange 10,000 particles in a grid
const N = 10_000;
const cols = 100;
const origins = new Float32Array(N * 2);

for (let i = 0; i < N; i++) {
  const col = i % cols;
  const row = Math.floor(i / cols);
  origins[i * 2] = 100 + col * 8; // x
  origins[i * 2 + 1] = 100 + row * 8; // y
}

particles.setOrigins(origins); // also uploads particleData to GPU
```

`setOrigins(points, requestPositionReset = true)` — el segundo argumento controla si las partículas también se teletransportan a sus nuevos orígenes (útil para cambios de formación instantáneos) o saltan hacia ellos desde sus posiciones actuales.

Para establecer posiciones sin cambiar los orígenes, usa `setPositions()`. Para establecer velocidades iniciales (p. ej., una ráfaga hacia afuera desde el centro), usa `setVelocities()`.

Los tres métodos escriben en `particleData` y establecen `needsInit = true`, por lo que los datos se suben al búfer de almacenamiento de WebGPU en el siguiente frame.

## Interacción con el ratón

Cuando `pointerEvents: true`, el `Scene` pasa las coordenadas del cursor a la simulación de partículas. Las partículas dentro de **120 px** del cursor son repelidas:

```typescript
const particles = new ComputeParticleEntity({
  maxParticles: 100_000,
  pointerEvents: true,
});
scene.add(particles);
```

El radio de repulsión y la fuerza son fijos en el shader. Cuando el cursor sale del canvas, el punto de repulsión se establece en `(-99999, -99999)` de modo que no se aplica ninguna repulsión.

## Disparar explosiones

`triggerExplosion(x, y, force)` encola un impulso para el siguiente paso de la simulación. Todas las partículas dentro de **150 px** de `(x, y)` reciben un empujón de velocidad hacia afuera escalado por `force`:

```typescript
canvas.addEventListener('dblclick', (e) => {
  const point = scene.clientToScene(e.clientX, e.clientY);
  particles.triggerExplosion(point.x, point.y, 800);
});
```

Solo se puede encolar una explosión a la vez — llamar a `triggerExplosion` antes de que la anterior se haya consumido la sobrescribe.

## WebGPU vs alternativa por CPU

La opción `particleBackend` controla qué ruta se usa:

| Valor                  | Comportamiento                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `'auto'` (por defecto) | Intenta WebGPU; recurre a la CPU en caso de fallo o ausencia                                          |
| `'webgpu'`             | Solicita WebGPU explícitamente; el runtime actual aún recurre a la CPU cuando la inicialización falla |
| `'cpu'`                | Fuerza la simulación por CPU; deshabilita WebGPU aunque esté disponible                               |

**Cuando WebGPU está activo:** La simulación se ejecuta como un compute shader en la GPU. El estado de las partículas vive en un búfer de almacenamiento de WebGPU y se renderiza en el canvas de WebGPU dedicado del Scene.

**Cuando la alternativa por CPU está activa:** El `Scene` llama a `entity.updateCPU(dt, mouseX, mouseY, width, height)` en cada frame (mismo modelo de física — resorte, repulsión, explosión, límite de velocidad, rebote). Renderiza mediante `fillCircle()` en Canvas2D o la capa de puntos WebGL opcional. Elige los conteos a partir de mediciones en el navegador y el hardware objetivo.

> [!NOTE] > `particles.gpuStorageBuffer !== null` muestra que se asignaron recursos de GPU,
> pero no es un estado fiable del backend en vivo tras una pérdida asíncrona del dispositivo.

La pérdida del dispositivo se recupera automáticamente con retroceso exponencial (3 reintentos) antes de deshabilitar permanentemente WebGPU para la sesión.

### Leer las posiciones de las partículas de vuelta desde la GPU

El estado de las partículas vive en un búfer de GPU. No puedes leerlo de vuelta de forma barata — un viaje de ida y vuelta de `mapAsync` + `copyBufferToBuffer` estanca el pipeline. Si necesitas posiciones en la CPU (p. ej., para detección de colisiones con entidades que no son partículas), mantén un `Float32Array` en el lado de la CPU sincronizado escribiendo tú mismo en `particleData` y usando `setPositions()`.

Para consultas espaciales a gran escala enteramente dentro del sistema de partículas, escribe pasadas de cómputo de WebGPU adicionales. Para colisiones con otras entidades, usa `SpatialHashGrid` en la ruta de la CPU.

## Gestión de recursos de GPU

```typescript
// Clean up GPU buffers when done (e.g. on page unload or component teardown)
particles.destroyGPUResources();
scene.remove(particles);
```

`scene.destroy()` también llama a `destroyGPUResources()` en todas las entidades de partículas, así que solo necesitas llamarlo manualmente para el desmontaje a mitad de sesión.

## Tipos de TypeScript para WebGPU

Si tu proyecto usa las APIs de WebGPU y TypeScript reporta `Cannot find name 'GPUDevice'`:

```bash
bun add -d @webgpu/types
```

```json
{ "compilerOptions": { "types": ["@webgpu/types"] } }
```

## Resolución de problemas

### No aparece nada en pantalla

Comprueba en orden:

1. **No se llamó a `initRandomParticles()`** — sin esto, todas las posiciones de las partículas son `(0, 0)` y los tamaños son `0`.
2. **No se llamó a `resize(w, h)` antes de `initRandomParticles`** — las partículas dispersas por una caja de `0×0` son invisibles. Comprueba que `scene.width` y `scene.height` no sean cero.
3. **La inicialización de WebGPU falló** — el runtime actual registra el fallo, deshabilita la ruta de GPU y continúa a través de la alternativa por CPU incluso cuando se solicitó `'webgpu'` explícitamente.
4. **`pointBackend` no está establecido en `'webgl'`** — la alternativa por CPU renderiza mediante `fillCircle`. Sin `'webgl'`, las partículas de la ruta de CPU aún aparecen en Canvas2D, pero solo si el renderer de canvas está activo.

### El FPS es mucho más bajo de lo esperado

- Usa las herramientas de GPU del navegador y el canvas de WebGPU para verificar la ruta activa; un `gpuStorageBuffer` retenido por sí solo no es una señal de estado duradera tras la pérdida del dispositivo.
- En entornos headless / CI, WebGPU y WebGL recurren a renderers por software (Swiftshader). El FPS en headless no es representativo. Mide en hardware de GPU real.
- Reduce `maxParticles` mientras haces profiling y registra los percentiles de tiempo de frame en el dispositivo objetivo; este repositorio no establece un límite universal de CPU o GPU.

### Las partículas saltan a `(0, 0)` en lugar de a mi formación

`setOrigins()` y `setPositions()` ambos establecen `needsInit = true`, lo que sube `particleData` al búfer de la GPU en el siguiente frame. Si los llamas **antes** de `scene.start()`, asegúrate de que `start()` se llame después para que la subida ocurra.
