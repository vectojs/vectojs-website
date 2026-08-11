+++
title = "Conceptos del Motor"
description = "Las ocho ideas matemáticas y arquitectónicas detrás de VectoJS."
weight = 4

[extra]
order = 4
+++

# Conceptos del Motor

VectoJS se construye sobre un pequeño conjunto de ideas de matemática y de runtime. Esta página es un mapa; las derivaciones más profundas viven en [Fundamentos Matemáticos](/learn/math-foundations/).

<figure>
  <img src="/images/engine-concepts-map.svg" alt="Mapa conceptual con el Virtual Math Tree en el centro conectado a transformaciones afines, hit-testing, disposición fría y caliente, flujo de texto por diferencia de conjuntos, proyección semántica, movimiento de resortes y SpatialHashGrid." class="diagram" />
  <figcaption>El Virtual Math Tree es el eje; las transformaciones, la disposición, el hit-testing, el movimiento y la proyección semántica son los radios del runtime.</figcaption>
</figure>

## 1. Virtual Math Tree

El VMT reemplaza un subárbol DOM visual por un grafo de escena de JavaScript de sistemas de coordenadas localizados. El recorrido, el hit-testing y la sincronización de accesibilidad siguen siendo trabajo real, pero la disposición visual evita los estilos y el reflow del navegador para cada entidad.

- Teoría: [Fundamentos Matemáticos: VMT](/learn/math-foundations/#1-el-virtual-math-tree-vmt)
- Práctica: [Core Scene](/learn/core-scene/)

## 2. Overlay de proyección semántica

Las entidades interactivas elegibles proyectan nodos DOM transparentes reales sobre sus límites de canvas. El canvas posee los píxeles; la proyección DOM posee el rol/nombre/estado y el comportamiento de entrada nativa.

- Teoría: [Fundamentos Matemáticos: a11yRoot](/learn/math-foundations/#2-shadow-dom-semántico-a11yroot)
- Práctica: [Accesibilidad](/learn/accessibility/)

## 3. Transformaciones afines

La traslación, la escala y la rotación de las entidades se componen hacia abajo del árbol. `worldToLocal()` invierte analíticamente la transformación para que los eventos de puntero puedan mapearse a las coordenadas locales de la entidad objetivo.

- Teoría: [Fundamentos Matemáticos: transformaciones afines](/learn/math-foundations/#3-transformaciones-afines)

## 4. Disposición fría/caliente

La disposición de texto separa la costosa preparación del contenido del ajuste de línea responsivo. Los cambios de contenido ejecutan la ruta fría; los cambios de ancho pueden reutilizar las medidas preparadas.

- Teoría: [Fundamentos Matemáticos: División Fría/Caliente](/learn/math-foundations/#4-motor-de-disposición-con-división-fríacaliente)
- Práctica: [Texto y Tipografía](/learn/text-typography/)

## 5. Flujo de texto por diferencia de conjuntos

El ajuste de línea alrededor de obstáculos puede modelarse como sustracción de intervalos:

$$I_{\text{allowed}} = I_0 \setminus \bigcup E_k$$

- Teoría: [Fundamentos Matemáticos: Álgebra de Diferencia de Conjuntos](/learn/math-foundations/#5-álgebra-de-diferencia-de-conjuntos-para-flujos-de-texto)

## 6. Hit-testing de splines muestreados

`SplineEntity` muestrea las curvas en segmentos de línea en caché y compara la distancia al cuadrado del puntero contra esos segmentos. Esto evita las lecturas de píxeles y es más preciso que los hit tests basados solo en AABB.

- Teoría: [Fundamentos Matemáticos: Hit-Testing de Splines Muestreados](/learn/math-foundations/#6-hit-testing-de-splines-muestreados)

## 7. Dinámica de Euler semi-implícito

Las transiciones de UI interrumpidas se modelan como sistemas de tipo resorte en lugar de temporizadores CSS de un solo disparo. Los objetivos pueden cambiar en pleno vuelo mientras el movimiento permanece continuo.

- Teoría: [Fundamentos Matemáticos: Dinámica de ODE](/learn/math-foundations/#7-ecuaciones-diferenciales-y-solucionadores-de-euler-semi-implícito)
- Práctica: [Física y Animación](/learn/physics-engine/)

## 8. Utilidad SpatialHashGrid

VectoJS exporta un `SpatialHashGrid` de celda fija para consultas de proximidad gestionadas por la aplicación. El Scene no lo rellena automáticamente para cada entidad.

- Teoría: [Fundamentos Matemáticos: Utilidad SpatialHashGrid](/learn/math-foundations/#8-utilidad-spatialhashgrid)
- Práctica: [Rendimiento](/learn/performance/)

## Próximos pasos

- [Arquitectura del Runtime](/learn/runtime-architecture/) conecta estos conceptos con el pipeline de frames.
- [Fundamentos Matemáticos](/learn/math-foundations/) profundiza en las fórmulas.
