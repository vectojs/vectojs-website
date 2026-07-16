---
title: 'Introducción a VectoJS'
description: 'Una descripción concisa de qué es VectoJS, para qué sirve y a dónde ir a continuación.'
order: 1
---

# Introducción a VectoJS

**VectoJS** es un runtime de UI canvas-native para interfaces cuya complejidad visual o interactiva no encaja en el modelo de "un elemento DOM por cosa". Mantiene el árbol visible en un grafo de entidades de JavaScript — el **Virtual Math Tree** — y pinta el resultado en capas respaldadas por canvas.

Los componentes interactivos aún pueden proyectar nodos DOM semánticos reales (`<button>`, `<input>`, `<a>`, etc.) sobre el canvas. Esa proyección es lo que mantiene los controles de VectoJS accesibles, con capacidad de entrada nativa y comprobables mediante automatización basada en roles.

<figure>
  <img src="/images/intro-runtime-map.svg" alt="Mapa del runtime de VectoJS que muestra el estado de la aplicación fluyendo hacia el Virtual Math Tree, y luego hacia la disposición, el hit-testing, el renderizado en canvas o GPU y la proyección de DOM semántico." class="diagram" />
  <figcaption>El estado de la aplicación actualiza un único grafo de escena retenido; el grafo luego impulsa píxeles, disposición, eventos y semántica.</figcaption>
</figure>

## Qué deberías leer a continuación

La antigua introducción de una sola página se ha dividido en capítulos enfocados:

| Si quieres entender…                                                             | Lee                                                      |
| -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Por qué existe VectoJS y cuándo el DOM se convierte en la herramienta equivocada | [Por qué VectoJS](/learn/why-vectojs/)                   |
| Cómo encajan el runtime, el bucle de renderizado y la proyección semántica       | [Arquitectura del Runtime](/learn/runtime-architecture/) |
| Las ocho ideas centrales de matemática/motor detrás de la implementación         | [Conceptos del Motor](/learn/engine-concepts/)           |
| Qué categorías de producto son un buen encaje y cuáles no                        | [Casos de Uso](/learn/use-cases/)                        |
| Cómo construir la primera escena en ejecución                                    | [Primeros Pasos](/learn/getting-started/)                |

## La versión corta

Usa VectoJS cuando necesites:

- miles de entidades visuales sin miles de nodos DOM con estilos;
- transformaciones, curvas, hit-testing y disposición matemática precisas;
- visuales a escala de canvas con accesibilidad y automatización basadas en roles;
- datos de alto volumen, UI en streaming, juegos, diagramas o paneles de WebXR;
- avance determinista para pruebas, simulación y exportación de vídeo.

Prefiere HTML/CSS convencional cuando estés construyendo un sitio orientado a documentos, prosa con mucho SEO, formularios ordinarios o UI que no necesite matemática de disposición personalizada.

## Mapa de paquetes

| Paquete                   | Propósito                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `@vectojs/core`           | `Scene`, `Entity`, disposición, texto, renderers, eventos, proyección de a11y y utilidades matemáticas      |
| `@vectojs/ui`             | Componentes de alto nivel: `Button`, `Input`, `Toggle`, `Markdown`, `ScrollView`, `Dropdown`, `Table` y más |
| `@vectojs/three`          | Proyecta una escena de VectoJS sobre una textura de Three.js y enruta la entrada de raycast de vuelta a 2D  |
| `@vectojs/video-exporter` | Exportación H.264 con Chromium + FFmpeg de paso fijo para escenas de VectoJS                                |

## Modelo mental

VectoJS no es un reemplazo de React, no es un ECS y no pretende cero asignaciones de memoria. Es un runtime de UI de canvas en modo retenido:

1. el estado de la aplicación actualiza las entidades;
2. las entidades calculan disposición, transformaciones, hit tests y semántica;
3. las escenas marcadas como sucias se renderizan a través del backend seleccionado;
4. los nodos DOM proyectados exponen la superficie interactiva a la tecnología de asistencia y a los agentes.

El resto de esta guía recorre esos compromisos en detalle.

## Próximos pasos

- [Por qué VectoJS](/learn/why-vectojs/) — el espacio del problema y los compromisos.
- [Primeros Pasos](/learn/getting-started/) — instala y crea tu primera escena.
- [Core Scene](/learn/core-scene/) — el bucle de renderizado, las entidades y las transformaciones en profundidad.
