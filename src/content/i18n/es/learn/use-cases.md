---
title: 'Casos de Uso'
description: 'Dónde encaja mejor VectoJS: paneles, UI en streaming, canvas infinitos, juegos, editores, WebXR y sitios interactivos avanzados.'
order: 5
---

# Casos de Uso

VectoJS funciona mejor cuando la UI se comporta como una escena en vivo: muchos objetos, geometría personalizada, actualizaciones de alta frecuencia o superficies de renderizado que no son DOM.

<figure>
  <img src="/images/use-cases-map.svg" alt="Mapa de casos de uso con VectoJS en el centro conectado a visualización de datos, UI en streaming, canvas infinitos, juegos y medios, editores y herramientas, y paneles de WebXR." class="diagram" />
  <figcaption>VectoJS es más fuerte en superficies densas y con forma de escena donde tanto la geometría personalizada como la automatización semántica importan.</figcaption>
</figure>

## Visualización de datos y paneles

Los gráficos, visores de topología, trazas y paneles en tiempo real a menudo necesitan cientos o miles de primitivas animadas. VectoJS mantiene las entidades visuales en JavaScript y evita un nodo DOM con estilos por cada punto, fila o arista.

Buenos encajes:

- libros de órdenes financieras;
- visores de topología de Kubernetes;
- grafos de red en vivo;
- trazas de monitoreo y líneas de tiempo;
- superficies analíticas de alta frecuencia.

## UI en streaming

Los clientes de LLM, danmaku, feeds de eventos y chat en vivo se benefician de la disposición incremental y el renderizado en canvas. `RichText.appendSpans()` y `Markdown.appendMarkdown()` permiten que la app añada contenido en streaming sin reconstruir cada objeto visible desde cero.

Buenos encajes:

- clientes de chat con IA;
- overlays de comentarios de vídeo;
- logs y feeds de eventos en vivo;
- Markdown transmitido con código, tablas y diagramas.

## Canvas infinitos y grafos

Las pizarras, editores de nodos y grafos de conocimiento necesitan pan/zoom, hit-testing personalizado y descarte. VectoJS proporciona el grafo de escena y el modelo de renderizado/eventos; las aplicaciones pueden añadir su propia estrategia de indexación para conjuntos de datos muy grandes.

Buenos encajes:

- pizarras colaborativas;
- mapas mentales y grafos de conocimiento;
- editores de nodos;
- herramientas de líneas de tiempo y diagramación.

## Juegos y medios interactivos

`update(dt)`, los drivers de animación, los sistemas de partículas y las entidades personalizadas son útiles para juegos nativos del navegador y simulaciones educativas sin adoptar un motor de juegos completo.

Buenos encajes:

- interacciones de tipo rítmico/juego;
- entornos de pruebas de física;
- animaciones explicativas;
- materiales de cursos interactivos.

## Editores y herramientas para desarrolladores

Los editores basados en canvas necesitan control explícito sobre el texto, los visuales de selección, los cursores, los minimapas y los overlays. VectoJS puede proporcionar el runtime visual mientras los componentes nativos `Input`/`TextArea` mantienen el comportamiento de edición del navegador donde importa.

Buenos encajes:

- visores de diferencias;
- superficies de tipo terminal;
- editores de canvas enriquecidos;
- herramientas de trazas/logs.

## WebXR e interfaces 3D

`@vectojs/three` renderiza una escena de VectoJS en una `THREE.CanvasTexture` y luego mapea las UVs de raycast de vuelta a la escena 2D. Esto habilita paneles de VectoJS en vivo dentro de Three.js y WebXR.

Buenos encajes:

- controles en el mundo;
- paneles de VR/AR;
- paneles de instrumentos;
- herramientas espaciales para desarrolladores.

## Sitios web interactivos avanzados

VectoJS puede impulsar las partes de un sitio que necesitan física, campos de partículas, tipografía magnética, arte generado o interacción a medida. Mantén la estructura del documento circundante en HTML/CSS e incrusta VectoJS solo donde el modelo de escena se justifique.

## Lista de comprobación de encaje

Usa VectoJS si la mayoría de las respuestas son "sí":

- ¿Tiene la UI muchos objetos en movimiento o con hit-testing individual?
- ¿Necesita disposición o transformaciones definidas por matemática?
- ¿Necesita renderizado en canvas/WebGL/WebGPU?
- ¿Sigue necesitando accesibilidad y automatización basada en roles?
- ¿Se convertiría la disposición DOM/CSS en el cuello de botella o en la abstracción equivocada?

Si la mayoría de las respuestas son "no", empieza con HTML/CSS y un framework de aplicación convencional.

## Próximos pasos

- [Primeros Pasos](/learn/getting-started/) para una primera escena.
- [Rendimiento](/learn/performance/) para orientación sobre medición y escalado.
- [@vectojs/three](/reference/three/) para incrustación 3D.
