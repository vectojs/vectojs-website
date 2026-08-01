---
title: 'Consistencia entre entornos'
description: 'Mantener una UI de canvas idéntica entre sistemas operativos, navegadores, niveles de zoom y densidades de píxel — y mantener la selección de texto alineada con la salida renderizada.'
order: 19
---

# Consistencia entre entornos

Una app DOM hereda la consistencia (y la inconsistencia) del motor de diseño del
navegador. Una app canvas-native la hereda de **ti**: el motor calcula cada
posición a partir de números que él mismo midió, por lo que los modos de fallo se desplazan — lejos
de las rarezas de CSS, hacia la densidad de píxel, el zoom y las métricas de fuente. Esta página mapea
cada variable del entorno a lo que realmente varía, lo que el motor ya
maneja y lo que tu aplicación debe hacer.

## Relación de píxel del dispositivo (HiDPI)

**Lo que maneja el motor.** Todas las coordenadas de VectoJS son píxeles CSS lógicos.
El renderer dimensiona el backing store del canvas a `logical × devicePixelRatio`
y escala el contexto, y cada `scene.resize()` re-lectura el DPR actual —
el renderizado, el hit-testing y el diseño comparten un único espacio de coordenadas lógicas, a
cualquier densidad, incluidos DPR fraccionarios (escalado de Windows al 125 % / 150 %).

**Lo que debes hacer tú.** Nada en tiempo de ejecución — pero todo en las pruebas:

> [!WARNING]
> Los navegadores headless usan por defecto `deviceScaleFactor: 1`. La mayoría de las máquinas reales tienen
> DPR 2 (o fraccionario). Un desplazamiento en hit-testing o proyección de texto que escala
> con el DPR es **invisible** en una ejecución headless por defecto y obvio en el primer
> portátil real. Si un desplazamiento notificado es proporcional a la distancia desde el
> origen, sospecha del DPR primero.

Ejecuta las pruebas de puntero y selección también a `deviceScaleFactor: 2`
(Puppeteer/Playwright ambos lo exponen por contexto). Una celda de la matriz atrapa toda la
clase de error.

## Zoom del navegador y tamaño del contenedor

El zoom cambia el DPR efectivo y el viewport CSS simultáneamente. Lo que ocurre
a continuación depende de quién controla el tamaño del canvas:

- **Escenas a pantalla completa** (por defecto): la Scene escucha el evento `resize` de la ventana —
  que el zoom dispara — y recalibra tamaño, backing store y DPR
  automáticamente.
- **Escenas incrustadas** (`disableWindowResize: true`, contenedores personalizados, CSS
  zoom en un ancestro): el motor deliberadamente no adivina. Conecta el
  contenedor a la escena tú mismo:

```typescript
const scene = new Scene(canvas, { disableWindowResize: true });

const ro = new ResizeObserver(([entry]) => {
  scene.resize(entry.contentRect.width, entry.contentRect.height);
});
ro.observe(container);
// Desconecta en tu ruta de limpieza junto con scene.destroy().
```

`scene.resize(width, height)` es idempotente y lo suficientemente barato como para llamarlo desde un
ResizeObserver sin debounce para UIs típicas. También es el
**gancho de recalibración**: Firefox computa las métricas de selección `Range` nativas a partir del
estado de diseño que el zoom y los cambios de contenedor invalidan — una escena a la que nunca
se le notifica el cambio renderiza correctamente pero _selecciona_ en coordenadas
obsoletas. Si los resaltados de selección se desplazan después de hacer zoom en Firefox y el
canvas se ve bien, una llamada a `resize()` faltante es el primer sospechoso.

## Fuentes: la verdadera variable entre SO

`'16px sans-serif'` es una tipografía diferente en cada SO (Segoe UI, Roboto,
San Francisco, DejaVu…). VectoJS mide el texto él mismo con canvas
`measureText`, y el renderer dibuja con la misma cadena de fuente — por lo que el diseño
y los píxeles siempre coinciden _entre sí_ en cualquier máquina. Lo que varía entre
máquinas es la **geometría absoluta**: anchos de línea, puntos de ajuste, tamaños de entidad.

Consecuencias prácticas, en orden decreciente de dolor:

1. **Carrera de fuentes web.** Si construyes `Text`/`RichText`/`Markdown` antes de que una
   fuente web se cargue, la medición usa la fuente de respaldo mientras que un repintado posterior
   dibuja la fuente cargada — el diseño y los píxeles ahora discrepan (la única forma de romper
   la consistencia interna). Condiciona la construcción:

   ```typescript
   await document.fonts.ready;
   const label = new Text('Hello', { font: '16px Inter' });
   ```

   Si el contenido puede sobrevivir a la carga de fuentes (fuentes de carga diferida), vuelve a ejecutar `setText`
   o `setMaxWidth` desde un manejador `document.fonts.onloadingdone` para re-medir.

2. **Expectativas de prueba de píxel exacto.** Nunca afirmes geometría absoluta derivada de texto
   contra números fijos a menos que CI instale la fuente exacta
   (el repositorio de VectoJS instala Noto en CI por esta razón). Prefiere aserciones
   relacionales ("cabe dentro", "debajo de la fila anterior") — que es exactamente
   lo que `auditScene` automatiza.

3. **Familias genéricas en diseño.** Dimensionar una tarjeta para que quepa con `'14px sans-serif'`
   en macOS resulta incorrecto en Windows. O bien incluye la fuente, o deja que la
   medición impulse el tamaño (`Text` auto-dimensionado + diseño de contenedor) en lugar
   de codificar cajas alrededor de anchos de texto supuestos.

## Diferencias de navegador que importan

La matriz de pruebas entre navegadores del motor (Chrome + Firefox, DPR 1 y 2, sustitución
de fuentes) fija estos puntos; aquellos con los que una aplicación aún puede tropezar:

| Área                             | Diferencia                                                                                 | Qué hacer                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Rangos de selección nativos      | Firefox recalcula métricas `Range` a partir de diseño obsoleto tras zoom/resize            | Llama a `scene.resize()` cuando tú gestiones el tamaño (ver arriba)                                        |
| Disponibilidad de `Worker`       | Ausente en algunos embebedores/ejecutores de prueba → Markdown analiza síncronamente       | Funcionalmente idéntico; presupuesta tiempo del hilo principal en esos entornos                            |
| WebGPU                           | La disponibilidad varía; `ComputeParticleEntity` cae a CPU                                 | Trata la GPU como mejora progresiva; prueba también la ruta CPU                                            |
| Movimiento reducido              | La configuración del SO limita el FPS efectivo cuando `respectReducedMotion` (por defecto) | No luches contra ello; prueba animaciones con la configuración activada                                    |
| rAF en pestañas en segundo plano | Se suspende en todas partes, pero el tiempo de reanudación difiere                         | El motor limita el dt de animación al reanudar; los integradores personalizados deben limitar su propio dt |

## Mantener la selección alineada con los píxeles

El texto seleccionable funciona proyectando la **cadena fuente lógica** en
espejos DOM transparentes cuya geometría proviene de los mismos datos de diseño que el
pintor de canvas usa. La alineación está garantizada por construcción — cuando se rompe, una de una
lista corta de contratos fue violada:

1. **No se notificó a la escena un cambio de tamaño/zoom** — geometría de proyección
   obsoleta (Firefox especialmente; ver el gancho de recalibración arriba).
2. **Las fuentes se cargaron después de la medición** — el canvas y la proyección siguen el
   diseño medido, pero los glifos dibujados se movieron (carrera de fuentes web arriba).
3. **Un componente personalizado dibuja texto sin proyectarlo** — píxeles sin un
   espejo seleccionable, o un espejo posicionado por matemáticas diferentes a las de la ruta
   de pintura. Las entidades de texto personalizadas deberían reutilizar el diseño preparado del motor
   (`prepareContentGrid` / `LayoutEngine.prepare`) tanto para pintar como para
   proyectar, nunca dos mediciones independientes.

**Verificar la alineación** (números, no capturas de pantalla):

```typescript
// 1. ¿Una selección programática copia la fuente lógica?
//    (Las APIs de selección reflejan lo que produciría un arrastre del usuario.)
const text = window.getSelection()?.toString();
expect(text).toBe(expectedSourceSlice);

// 2. ¿Qué entidad recibió realmente los eventos de selección del navegador?
import { createEventTrace } from '@vectojs/devtools/headless';
const trace = createEventTrace(scene, { capacity: 50 });
// … arrastrar-seleccionar …
// las entradas con source === 'content' comenzaron en una proyección seleccionable;
// su targetPath indica CUÁL, defaultPrevented si la
// aplicación interceptó el comportamiento de selección por defecto del navegador.
```

Ejecuta las pruebas de selección por arrastre en la misma matriz de entornos que el hit-testing:
ambos navegadores, ambos DPR, y al menos un nivel de zoom no predeterminado.

## La lista de verificación de portabilidad

Para una UI que debe verse y comportarse de manera idéntica en todas partes:

- [ ] Incluye las fuentes con las que mides; construye texto después de `document.fonts.ready`.
- [ ] Escena a pantalla completa **o** un puente `ResizeObserver` → `scene.resize()` — nunca ninguna de las dos.
- [ ] Pruebas de puntero + selección a DPR 1 **y** 2, Chrome **y** Firefox.
- [ ] `auditScene(scene)` limpio en CI (corrección de diseño relacional, independiente de fuente).
- [ ] Diferencia de instantáneas de interacciones clave (`captureSnapshot`/`diffSnapshots`) en lugar de comparar capturas de pantalla píxel a píxel.
- [ ] Animaciones verificadas con el movimiento reducido del SO activado.
- [ ] Si los backends WebGL/WebGPU están habilitados, la ruta de respaldo Canvas2D también está probada.

> **Siguiente:** [Flujos de trabajo de depuración](/reference/devtools-inspect/#flujos-de-trabajo-de-depuración)
> para las herramientas numéricas en las que se apoya esta lista, y
> [Streaming y texto en tiempo real](/learn/streaming/) para UIs en tiempo real.
