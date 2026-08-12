+++
title = "Arquitectura del Runtime"
description = "Cómo encajan Scene, Entity, el bucle de renderizado, la proyección de accesibilidad y los backends."
weight = 3
+++

# Arquitectura del Runtime

VectoJS se organiza en torno a un `Scene` por canvas y un árbol retenido de instancias de `Entity`. El árbol almacena el estado visual, el estado de disposición, el comportamiento de eventos y los metadatos semánticos.

<figure>
  <img src="/images/vmt-architecture.svg" alt="Diagrama de la arquitectura VMT que muestra el árbol de entidades, el renderizado en canvas y la capa shadow de a11y" class="diagram" />
  <figcaption>El Scene recorre un Virtual Math Tree, renderiza píxeles en el canvas y proyecta la semántica en el DOM.</figcaption>
</figure>

## Virtual Math Tree

Cada entidad tiene:

- `x`, `y`, `scaleX`, `scaleY`, `rotation` y `opacity`;
- `width` y `height` para los límites;
- un array `children`;
- `update(dt, time)` para los cambios de estado;
- `render(renderer)` para dibujar en coordenadas locales;
- `isPointInside(globalX, globalY)` para el hit-testing;
- `getA11yAttributes()` opcional para la semántica proyectada.

Las transformaciones se componen hacia abajo del árbol. Usa `worldToLocal()` al hacer hit-testing de entidades anidadas o transformadas.

## Pipeline de frames

<figure>
  <iframe src="/sandbox/diagram-pipeline.html" class="diagram-frame" loading="lazy" title="The VectoJS render loop: the six stages of one dirty frame, rendered live by VectoJS" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Un frame sucio: actualizar, descartar, renderizar, vaciar los lotes del backend y luego sincronizar el DOM proyectado.</figcaption>
</figure>

## Proyección de accesibilidad

Una capa DOM transparente se sitúa sobre el canvas. Las entidades interactivas pueden proyectar elementos reales como `<button>`, `<input>`, `<a>` y nodos `<div>` portadores de roles.

Esa capa hace que la UI de canvas sea:

- descubrible por lectores de pantalla;
- operable mediante el teclado y controles de formulario nativos;
- comprobable con selectores de rol de Playwright;
- manejable por agentes de IA que dependen de la semántica del DOM.

La proyección no sustituye una revisión de diseño. Las aplicaciones siguen siendo responsables de las etiquetas, el orden de foco, el comportamiento del teclado, el contraste y el comportamiento de movimiento reducido.

## Backends de renderizado

| Backend              | Cuándo                      | Capacidad                                                   |
| -------------------- | --------------------------- | ----------------------------------------------------------- |
| `CanvasRenderer`     | Por defecto                 | Canvas 2D con escalado por ratio de píxeles del dispositivo |
| Capa de puntos WebGL | `pointBackend: 'webgl'`     | Círculos/rectángulos por lotes y rutas de glifos en GPU     |
| Cómputo WebGPU       | `particleBackend: 'webgpu'` | Partículas dirigidas por cómputo con alternativa            |
| `SVGRenderer`        | `scene.toSVG()`             | Exportación SVG headless                                    |

La elección del backend solo ayuda cuando el backend coincide con el cuello de botella. Si la disposición de texto o el cómputo de la app dominan, cambiar Canvas por WebGL no arreglará la ruta lenta.

## Ciclo de vida

```ts
const scene = new Scene(canvas, { maxFPS: 60 });
scene.renderMode = 'onDemand';
scene.resize(width, height);
scene.start();

// later
scene.destroy();
```

Destruye siempre una escena cuando el componente anfitrión se desmonte. Una escena posee recursos del renderer, observers, workers, DOM proyectado y estado de eventos.

## Próximos pasos

- [Conceptos del Motor](/learn/engine-concepts/) explica los pilares matemáticos.
- [Core Scene](/learn/core-scene/) muestra la API práctica.
