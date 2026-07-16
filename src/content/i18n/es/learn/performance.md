---
title: 'Rendimiento'
description: 'Modos de renderizado, la limitación automática por inactividad, el renderizado por lotes de WebGL, el descarte por viewport, el rendimiento del texto y cómo medir el rendimiento real de la GPU.'
order: 13
---

# Rendimiento

VectoJS está diseñado para ser rápido por defecto, pero varios mecanismos opcionales desbloquean un rendimiento significativamente mayor. Esta página explica los controles disponibles, la trampa oculta que atrapa a la mayoría de los desarrolladores y cómo medir el rendimiento con precisión.

## Modos de renderizado

El `Scene` soporta dos modos de renderizado, establecidos mediante `scene.renderMode` tras la construcción:

```typescript
scene.renderMode = 'always'; // default — rerender every frame
scene.renderMode = 'onDemand'; // rerender only when dirty or tweening
```

### Modo `'always'`

El bucle rAF se dispara en cada frame, limitado por `maxFPS` (por defecto 60). Usa esto para:

- Animación continua (simulaciones de partículas, física)
- Feeds de datos en tiempo real
- Cualquier escena donde algo siempre se está moviendo

### Modo `'onDemand'`

El bucle rAF solo renderiza cuando se ha llamado a `scene.markDirty()` desde el último frame, o cuando un driver de animación/transición está en progreso. Los ticks inactivos se saltan el update/render de entidades y el envío a la GPU, pero el Scene aún programa rAF y recorre el árbol para comprobar el estado de animación pendiente. Usa esto para:

- UIs estáticas o dirigidas por eventos (paneles, formularios, menús)
- Escenas que se animan en respuesta a acciones del usuario pero que por lo demás están quietas

```typescript
scene.renderMode = 'onDemand';

button.on('click', () => {
  button.animate({ scaleX: 1.1, scaleY: 1.1 }, 100).animate({ scaleX: 1, scaleY: 1 }, 100);
  // animate() marks dirty automatically while the tween runs
});

input.on('change', () => {
  scene.markDirty(); // repaint to show new caret/selection state
});
```

## La limitación automática por inactividad (la trampa oculta)

Esta es la trampa de rendimiento más común en VectoJS.

En modo `'always'`, una escena se considera **estática** cuando:

- La bandera `dirty` es `false`, Y
- Ninguna entidad tiene un tween `animate()` pendiente.

Una escena estática se limita a **~2 fps** para ahorrar batería y GPU. En el runtime estable, la bandera `dirty` se consume al _inicio_ de cada frame renderizado, por lo que un `markDirty()` emitido desde dentro de `update()` sobrevive a la comprobación de estático del siguiente frame.

```typescript
// markDirty() inside update() re-arms the next frame
class Spinner extends Entity {
  update(dt: number, time: number) {
    super.update(dt, time);
    this.rotation += dt * 0.003;
    this.scene?.markDirty();
  }
}
```

**La trampa en core ≤ 0.2.5:** la bandera se limpiaba _tras el renderizado_, por lo que un `markDirty()` establecido durante `update()` se borraba antes de la siguiente comprobación de estático — el patrón de arriba renderizaba un frame y se congelaba a 2 fps. Si soportas cores más antiguos, usa una de las correcciones de abajo (siguen siendo las opciones más eficientes en 0.2.6 también, ya que `hasPendingAnimations()` declara la intención sin una escritura de bandera por frame).

**Corrección — opción A:** Usa `animate()` para el movimiento en lugar de mutaciones manuales. Un tween en ejecución mantiene la escena viva automáticamente:

```typescript
// Correct: animate() keeps hasPendingAnimations() true
entity.animate({ rotation: Math.PI * 2 }, 1000);
```

**Corrección — opción A2 (para movimiento dirigido por `update()`):** mantén el integrador, pero informa al Scene de ello sobrescribiendo `hasPendingAnimations()`. Así es como los contenedores de scroll integrados reportan su movimiento en curso:

```typescript
class Spinner extends Entity {
  update(dt: number, time: number) {
    super.update(dt, time);
    this.rotation += dt * 0.003;
  }
  hasPendingAnimations() {
    return true; // or: super.hasPendingAnimations() || stillMoving
  }
}
```

**Corrección — opción B:** Llama a `markDirty()` **entre frames** — desde un manejador de eventos, un `setInterval` o un `requestAnimationFrame` aparte que se dispare tras el rAF propio de la escena:

```typescript
// Correct: call markDirty between frames (not inside update)
setInterval(() => scene.markDirty(), 16); // external driver
```

**Corrección — opción C:** Cambia a `renderMode: 'always'` y establece `maxFPS` para prevenir la limitación por estático (la limitación por inactividad solo se aplica cuando `maxFPS > 0`; establecer `maxFPS = 0` quita el límite y siempre re-renderiza):

```typescript
scene.maxFPS = 0; // uncapped — never throttles to 2 fps
```

## `maxFPS` y movimiento reducido

```typescript
const scene = new Scene(canvas, {
  maxFPS: 60, // frame rate cap; 0 = uncapped
  respectReducedMotion: true, // default: true
});
```

Cuando `respectReducedMotion: true` (por defecto) y el usuario ha habilitado "reducir movimiento" en los ajustes de accesibilidad de su SO, el FPS efectivo se limita a **30** (o el menor entre `maxFPS` y 30). Puedes deshabilitar esto con `respectReducedMotion: false`, pero hacerlo ignora una preferencia explícita del usuario.

`maxFPS` también se puede establecer en vivo: `scene.maxFPS = 30` para el modo de ahorro de batería.

## Renderizado por lotes de WebGL

Para grandes conjuntos de círculos o rectángulos, la capa de WebGL reemplaza muchas llamadas de ruta de Canvas por entidad con subidas de búfer tipado y un pequeño número de envíos de dibujo. El punto de cruce y la aceleración dependen de la carga de trabajo/hardware y deberían medirse con benchmarks.

### Habilitar la capa por lotes

```typescript
const scene = new Scene(canvas, {
  pointBackend: 'webgl', // stacks a WebGL2 canvas over Canvas2D
});
```

### Incluir una entidad

Sobrescribe `getBatchCircle()` o `getBatchRect()` en lugar de `render()`:

```typescript
class Dot extends Entity {
  radius = 4;
  color = '#00f0ff';

  // These are read every frame — animated values work.
  getBatchCircle() {
    return { radius: this.radius, color: this.color };
  }

  // Required fallback for Canvas mode or an unrepresentable world transform.
  isPointInside() {
    return false;
  }
  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.arc(0, 0, this.radius, 0, Math.PI * 2);
    renderer.fill(this.color);
  }
}
```

El Scene lee `getBatchCircle()` / `getBatchRect()` en cada frame y alimenta las primitivas representables del espacio del mundo a la capa de WebGL. Los colores y el alfa son atributos por instancia, por lo que un búfer puede contener estilos mixtos.

**Restricciones:**

- La entidad debe ser una **hoja** (sin hijos).
- La propia escala de la entidad debe ser **uniforme** (`scaleX === scaleY`).
- Requiere `pointBackend: 'webgl'` en el Scene.
- La transformación acumulada debe ser representable por una escala + rotación. Los ancestros no uniformes/inclinados recurren a `render()`.

La capa de WebGL compone **por encima** del contenido de Canvas2D (`z-index: 5`), por lo que las primitivas por lotes siempre dibujan encima del contenido 2D, independientemente del orden del árbol.

### `getBatchRect()` para rectángulos

```typescript
getBatchRect() {
  return { width: this.width, height: this.height, color: this.color };
}
```

Los rectángulos por lotes soportan rotación representable por entidad. Los reflejos, el cizallamiento y la escala acumulada no uniforme usan la alternativa normal del renderer.

## Descarte por viewport con `getBounds()`

Por defecto, cada entidad ejecuta `update()` y `render()` en un frame renderizado, incluso si está completamente fuera de pantalla. Sobrescribe `getBounds()` para devolver una caja delimitadora en el espacio local y el Scene se saltará la llamada a `render()` de la entidad fuera de pantalla. El recorrido del árbol y `update()` siguen ejecutándose:

```typescript
getBounds() {
  return { x: 0, y: 0, width: this.width, height: this.height };
}
```

`UIComponent` ya implementa esto — todos los componentes de `@vectojs/ui` participan en el descarte automáticamente. Para las subclases crudas de `Entity` con un tamaño fijo, añade `getBounds()` para obtener rendimiento gratis en escenas grandes.

Por ejemplo, si el 90% de 5.000 entidades hoja acotadas están fuera de pantalla, solo quedan unas 500 llamadas a `render()`, pero el Scene aún visita y actualiza los 5.000 nodos.

## Limitación de la sincronización de A11y

En cada frame renderizado, el `Scene` sincroniza las posiciones y estados de todas las entidades interactivas con sus nodos del shadow DOM. Con cientos de entidades interactivas animándose simultáneamente, esta sobrecarga de escritura en el DOM puede dominar el tiempo de frame.

Limítala con `a11ySyncInterval`:

```typescript
const scene = new Scene(canvas, {
  a11ySyncInterval: 100, // sync at most once per 100 ms
});
// Or set live:
scene.a11ySyncInterval = 100;
```

El intervalo se comprueba mientras las animaciones se ejecutan; `a11ySyncInterval: 100` limita la sincronización a como máximo unas 10 veces por segundo y programa una puesta al día final tras el asentamiento del movimiento. Elige el intervalo a partir de la latencia de accesibilidad y el coste medido del DOM, en lugar de asumir que un valor sirve para toda UI.

## Rendimiento del texto

### `setMaxWidth()` — la ruta caliente para el reflow

El `LayoutEngine` separa la medición (fría) de la disposición (caliente). Cuando la ventana se redimensiona y el texto necesita reajustarse:

```typescript
// Wrong: rebuilds the full measured text on every resize event
window.addEventListener('resize', () => {
  label.setText(label.text); // cold pass — re-segments and re-measures
});

// Correct: reuses cached measurements, only recalculates line breaks
window.addEventListener('resize', () => {
  label.setMaxWidth(newWidth); // hot pass — cheap
});
```

La ruta caliente es O(número de palabras), no O(número de glifos), y evita todas las llamadas a `Intl.Segmenter` y `measureText` del canvas.

### `LayoutResultBuffer` — almacenamiento de coordenadas de texto reutilizable

Para UIs densas en datos (cuadrículas de datos, terminales, visores de logs) con miles de glifos por frame, la ruta estándar `layoutPrepared()` asigna un objeto `LayoutNode` por glifo. Usa `LayoutResultBuffer` en su lugar:

```typescript
import { LayoutEngine, LayoutResultBuffer, createCanvasMeasurer } from '@vectojs/core/layout';

const engine = new LayoutEngine(400, Infinity, createCanvasMeasurer());
const buffer = new LayoutResultBuffer(); // reuse across frames (CAPACITY = 16384)

function renderRow(text: string) {
  const prepared = engine.prepare(text, {}, 14);
  buffer.reset();
  engine.layoutPreparedIntoBuffer(prepared, buffer);
  // buffer.xs, buffer.ys, buffer.ws, buffer.hs, buffer.chars — flat typed arrays
  for (let i = 0; i < buffer.count; i++) {
    renderer.fillText(buffer.chars[i], buffer.xs[i], buffer.ys[i], '14px monospace', '#e2e8f0');
  }
}
```

El búfer reutilizable evita asignar un objeto `LayoutNode` por glifo en cada disposición caliente. Restricciones: capacidad fija, solo una columna (sin reordenamiento visual BiDi, sin rects de exclusión). Usa `layoutPrepared()` cuando necesites esas características; evita `toLayoutResult()` en la ruta caliente porque asigna objetos de nodo.

## Cálculo de CPU vs. cuellos de botella de renderizado

En un framework tradicional de DOM del navegador, los cuellos de botella de rendimiento casi siempre residen en el **pipeline de renderizado y reflow de disposición** del navegador (manipulaciones del DOM, recálculo de estilos y pintado). Sin embargo, como VectoJS evita el DOM por completo y procesa la disposición, el descarte y las interacciones matemáticamente en memoria, el cuello de botella de rendimiento se desplaza de la capa de GPU/renderizado directamente al **cómputo de CPU de un solo hilo de JavaScript**.

Con recuentos de nodos activos suficientemente altos, el recorrido, las actualizaciones, la disposición y el hit-testing del lado de la CPU pueden exceder el presupuesto de frame de $16.67\text{ ms}$ antes de que lo haga la rasterización. El punto de cruce depende de la carga de trabajo y del dispositivo.

VectoJS aborda estos cuellos de botella de cómputo desde primeros principios proporcionando **"Escotillas de Escape"** dedicadas para eludir las limitaciones de un solo hilo de la CPU.

---

### 1. Simulaciones de partículas de alta densidad (por partícula, no de N cuerpos)

**El cuello de botella**: La integración en JavaScript por partícula es $O(N)$ cada frame y eventualmente consume el presupuesto de frame del hilo principal. El recuento donde eso ocurre depende del dispositivo y del modelo.

**La escotilla de escape: compute shaders de WebGPU (`ComputeParticleEntity`)**
Para eludir la ejecución en CPU por completo, VectoJS proporciona `ComputeParticleEntity`. Bajo el capó:

- Las ecuaciones de física (integración de Euler, tensión del resorte y fuerzas de atracción de campo) se compilan en **Compute Shaders de WGSL (WebGPU Shading Language)**.
- En tiempo de ejecución, los datos permanecen residentes en la VRAM de la GPU, permitiendo que la pasada de cómputo de WebGPU paralelice la simulación a través de miles de núcleos de GPU.
- El renderizador recurre a un bucle de CPU equivalente (`updateCPU()`) automáticamente cuando WebGPU no está disponible o el dispositivo se pierde.

> [!IMPORTANT] > **Esto no es una simulación de $N$ cuerpos.** La fuerza de cada partícula se calcula relativa a tres puntos _fijos_ solamente — su origen de resorte, el cursor del ratón y un centro de explosión opcional. No hay interacción entre partículas ni índice espacial involucrado, que es exactamente lo que la hace vergonzosamente paralela y compatible con la GPU. Si tu simulación necesita una interacción real de vecinos (colisión o repulsión entre partículas, flocking, gravedad de N cuerpos), `ComputeParticleEntity` no lo cubre — necesitarás escribir tu propia pasada de cómputo WGSL con una consulta de vecinos incorporada, o ejecutar consultas de vecinos basadas en `SpatialHashGrid` en la CPU (consulta [`SpatialHashGrid`](#3-mar-de-entidades-en-interacción-catástrofe-de-complejidad-on2) más abajo, y la [guía del Motor de Física](/learn/physics-engine/) para un ejemplo trabajado en CPU). Actualmente no hay una abstracción genérica de "ejecutar cómputo arbitrario en GPU con alternativa por CPU" en el motor — `ComputeParticleEntity` es una implementación específica y estrecha, no un patrón reutilizable.

El rendimiento de gama alta depende fuertemente de la GPU, el navegador, el DPR, el modelo de partículas y la composición. Este repositorio no tiene un resultado de WebGPU de gama alta registrado, así que mide tu propia escena con el botón **Export report** (consulta [Medir el rendimiento real](#medir-el-rendimiento-real) más abajo).

---

### 2. Medición de texto de alta densidad y reflow tipográfico

**El cuello de botella**: La disposición dinámica de texto es una de las tareas de CPU más costosas de la ingeniería frontend. Requiere tokenización de palabras basada en diccionario (`Intl.Segmenter`), ordenación BiDi y mediciones de ancho de fuente a nivel del navegador (llamando a la API `measureText` del canvas). Intentar calcular disposiciones de texto para decenas de miles de glifos en un solo frame (como en terminales financieras, flujos de logs activos o cuadrículas de datos) congelará el hilo principal de JS en el pipeline de medición de la "Pasada Fría".

**La escotilla de escape: disposición fuera del hilo, disposiciones divididas y memoria reutilizada**
VectoJS proporciona tres niveles de optimización de texto:

- **Disposición MSDF fuera del hilo (`LayoutWorkerManager`)**: `MSDFTextEntity` puede enviar texto más métricas de fuente/glifo precalculadas a un Web Worker en segundo plano, con debounce por entidad. El worker realiza la colocación de líneas y devuelve búferes de coordenadas/estilo tipados; no llama a las APIs de medición de fuentes del navegador.
- **Separación fría/caliente**: VectoJS separa las disposiciones en "Fría" (análisis de texto y medición de ancho de glifos) y "Caliente" (cálculos de ajuste). Cuando el texto se ajusta debido a un redimensionamiento, los resultados fríos se reutilizan, evitando todas las APIs de medición del navegador y llevando la complejidad de la disposición de redimensionamiento a un puro $O(\text{número de palabras})$.
- **Búferes TypedArray reutilizables (`LayoutResultBuffer`)**: Para evitar asignar miles de objetos de nodo de disposición temporales, los desarrolladores pueden escribir las coordenadas de disposición en búferes planos preasignados. El llamante circundante aún puede asignar; la garantía es específicamente que la ruta del búfer reutiliza su almacenamiento de coordenadas.

> [!IMPORTANT] > **`LayoutWorkerManager` es un único hilo en segundo plano, no un pool, y está conectado para un solo componente.** Lo usa internamente `MSDFTextEntity` (la primitiva de texto GPU/fuente MSDF) — los componentes de texto por defecto de `@vectojs/ui` (`Text`, `RichText`) se disponen de forma síncrona en el hilo principal, con división fría/caliente y todo. Si estás renderizando volúmenes muy altos de texto de componentes por defecto y chocas contra un muro, la división fría/caliente y `LayoutResultBuffer` aún se aplican, pero no obtendrás disposición fuera del hilo gratis — necesitarías construir tu propia descarga a Worker, o cambiar a `MSDFTextEntity`. Más en general: fuera de esta única ruta de disposición de texto, nada más en el motor se ejecuta fuera del hilo principal hoy. El recorrido del VMT, el hit-testing y la física de resortes son todos síncronos.

---

### 3. Mar de entidades en interacción (catástrofe de complejidad $O(N^2)$)

**El cuello de botella**: Las comprobaciones de colisión o proximidad par a par entre entidades requieren $O(N^2)$ comparaciones de candidatos. Ese crecimiento se vuelve impracticable mucho antes de recuentos de escena muy grandes, con el límite exacto dependiendo del trabajo por par.

**La escotilla de escape: cuadrícula de hashing espacial (`SpatialHashGrid`)**
Para consultas de colisión/proximidad gestionadas por la aplicación, VectoJS exporta **SpatialHashGrid**. El Scene no indexa las entidades automáticamente:

- El espacio de coordenadas 2D se discretiza en celdas de un tamaño fijo que eliges; las coordenadas de celda se combinan en una única clave de bucket mediante una [función de emparejamiento de Cantor](https://en.wikipedia.org/wiki/Pairing_function), almacenada en un `Map` simple — no una tabla hash de capacidad fija.
- Llama a `insert(id, x, y, w, h)` cuando el AABB del espacio del mundo de una entidad cambie, o limpia/reconstruye la cuadrícula para un frame dinámico.
- Llama a `query(x, y, w, h)` para recuperar los IDs de cada celda solapada por un AABB de consulta local, luego ejecuta pruebas de colisión exactas sobre esos candidatos.
- Esto puede reducir la física local a nivel de aplicación de **$O(N^2)$** a las celdas/resultados visitados por cada consulta. `findEntityAt()` integrado y el descarte por viewport siguen siendo recorridos de árbol O(N).

> [!WARNING] > **No hay mitigación automática para los buckets densos.** `SpatialHashGrid` (y el hash espacial independiente usado por la demo del Grafo de Conocimiento) almacenan cada celda como un conjunto plano sin estructura interna — sin dimensionamiento adaptativo de celdas, sin encadenamiento de desbordamiento, sin cuadrícula jerárquica/multirresolución. La cifra de "$O(1)$ en promedio" asume una distribución aproximadamente uniforme de entidades a través de las celdas para tu `cellSize` elegido. Si tus datos pueden agruparse fuertemente — muchas entidades cayendo en el mismo puñado de celdas (una multitud formándose en un punto, una vista alejada donde miles de nodos se solapan en unos pocos píxeles) — esas celdas degradan hacia escaneos lineales $O(k)$, igual que sin índice alguno. No hay una escotilla de escape automática para eso hoy: la única palanca es elegir un `cellSize` apropiado al tamaño de tus entidades y su densidad esperada, y reevaluarlo si el comportamiento de agrupación de tus datos cambia. Si estás construyendo algo donde la agrupación extrema e impredecible es una posibilidad real, presupuesta medir tú mismo la ocupación de bucket en el peor caso en lugar de asumir que se cumple el caso promedio.

---

## Medir el rendimiento real

> [!WARNING]
> Chrome headless a menudo usa rasterización por software y una planificación de frames diferente. Trata su FPS como una señal de regresión del mismo entorno, no como un límite inferior o una predicción de producción.

Para cifras de rendimiento precisas:

1. Ejecuta la demo en un navegador real en hardware de GPU real.
2. Usa el botón **Export report** en la demo Nexus para emitir un registro de FPS legible por máquina con tu combinación actual de GPU/navegador.
3. Al citar cifras de rendimiento en PRs o documentación, usa mediciones en el navegador — no la salida headless.

Para benchmarks personalizados, recopila los tiempos de frame en el bucle `update()`:

```typescript
const samples: number[] = [];

class BenchEntity extends Entity {
  update(dt: number, time: number) {
    super.update(dt, time);
    if (samples.length < 300) samples.push(dt);
    if (samples.length === 300) {
      const avg = samples.reduce((a, b) => a + b) / samples.length;
      console.log(`avg frame: ${avg.toFixed(2)} ms  (${(1000 / avg).toFixed(1)} fps)`);
    }
  }
}
```

`dt` está en milisegundos; `1000 / dt` da el FPS instantáneo.

## Referencia rápida: qué control para qué problema

| Síntoma                                                  | Corrección                                                                                                                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La escena se limita a 2 fps cuando está inactiva         | Esperado — llama a `markDirty()` en los cambios de estado, o usa `renderMode: 'onDemand'` para escenas mayormente estáticas                                 |
| Una entidad animada manualmente cae a 2 fps              | Sobrescribe `hasPendingAnimations()` o impúlsala a través de `animateTo()` / `springTo()` para que la escena sepa que hay movimiento en curso               |
| Una UI estática desperdicia batería                      | Cambia a `renderMode: 'onDemand'`                                                                                                                           |
| Muchos círculos compatibles son lentos                   | Mide con benchmarks `pointBackend: 'webgl'` + `getBatchCircle()` en el dispositivo objetivo                                                                 |
| Las entidades fuera de pantalla desperdician CPU         | Implementa `getBounds()` en la entidad                                                                                                                      |
| Sobrecarga de escritura en el DOM durante la animación   | Establece `a11ySyncInterval: 100`                                                                                                                           |
| El reflow de texto al redimensionar es lento             | Usa `setMaxWidth()` en lugar de `setText()`                                                                                                                 |
| El texto denso causa presión de asignación               | Usa `LayoutResultBuffer` + `layoutPreparedIntoBuffer()`                                                                                                     |
| El FPS difiere en CI                                     | Compara ejecuciones de CI equivalentes; mide el rendimiento de cara al usuario en el hardware objetivo                                                      |
| Las partículas dinámicas agotan el presupuesto de la CPU | Mide con benchmarks `ComputeParticleEntity` para descargar su modelo de fuerza de punto fijo a WebGPU                                                       |
| El reflow de texto multilínea congela el hilo            | Delega la disposición de `MSDFTextEntity` fuera del hilo mediante `LayoutWorkerManager` (los `Text`/`RichText` por defecto permanecen en el hilo principal) |
| El mar de entidades en interacción es $O(N^2)$           | Implementa un `SpatialHashGrid` — reduce a $O(k)$ promedio, no automático bajo agrupación intensa; dimensiona las celdas para tus datos                     |
