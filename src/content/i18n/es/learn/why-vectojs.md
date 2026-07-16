---
title: 'Por qué VectoJS'
description: 'El problema que VectoJS resuelve, en qué se diferencia de las bibliotecas de DOM y canvas, y cuándo no usarlo.'
order: 2
---

# Por qué VectoJS

El DOM del navegador es un potente renderizador de documentos de propósito general. Es excelente para texto que fluye, contenido con SEO, formularios nativos y UI interactiva moderada.

Se convierte en un cuello de botella cuando la interfaz se comporta más como una escena que como un documento.

## El problema

VectoJS apunta a interfaces donde:

- miles de elementos animados individualmente crearían un trabajo excesivo de DOM/estilos/disposición;
- la disposición se controla mediante matemática, no mediante el flujo de CSS;
- el hit-testing debe coincidir con transformaciones, curvas y sistemas de coordenadas personalizados;
- la misma UI necesita ejecutarse dentro de contextos de canvas, WebGL, exportación o WebXR;
- la accesibilidad y la automatización siguen importando aunque la UI visible se renderice en canvas.

<figure>
  <img src="/images/fit-decision-tree.svg" alt="Árbol de decisión para elegir entre HTML y CSS, UI de aplicación normal y VectoJS según el contenido del documento, el número de entidades, la matemática personalizada y las necesidades de accesibilidad." class="diagram" />
  <figcaption>Empieza con HTML/CSS. Recurre a VectoJS solo cuando la UI se comporte más como una escena que como un documento.</figcaption>
</figure>

## En qué se diferencia de las bibliotecas de canvas típicas

La mayoría de las bibliotecas de canvas proporcionan primitivas de dibujo y dejan la disposición, los eventos, el texto y la accesibilidad a la aplicación. VectoJS proporciona una pila de runtime más completa.

| Capa          | VectoJS                                                        | Biblioteca de canvas típica      |
| ------------- | -------------------------------------------------------------- | -------------------------------- |
| Disposición   | Árbol de entidades y ayudantes de disposición                  | Manual                           |
| Hit-testing   | Hit tests por entidad y conversión de transformaciones         | Manual                           |
| Eventos       | Fases de captura y propagación tipo DOM                        | Solo manual/callback             |
| Accesibilidad | Proyección de DOM semántico para entidades elegibles           | Normalmente ausente              |
| Texto         | Motor de disposición, ajuste de línea, BiDi, árabe, rutas MSDF | A menudo solo `fillText`         |
| Componentes   | Formularios, overlays, markdown, scroll, disposición           | Normalmente definidos por la app |
| Exportación   | Exportador de vídeo de paso fijo                               | Normalmente externo              |

## Qué sacrifica VectoJS

VectoJS cambia la comodidad de CSS por control explícito. Asumes una mayor parte del modelo de disposición e interacción:

- CSS no posiciona entidades individuales del canvas.
- La selección de texto nativa para texto renderizado arbitrario no es automática.
- Los rastreadores de SEO no ven el contenido renderizado en canvas como texto de la página.
- La accesibilidad se habilita mediante proyección, pero aún requiere etiquetas, roles, comportamiento de teclado, contraste y pruebas con tecnología de asistencia correctos.
- El recorrido de entidades, la actualización, la sincronización semántica y el cómputo de la app siguen costando CPU; el canvas no hace que todo el trabajo sea gratuito.

## Cuándo no usar VectoJS

No recurras primero a VectoJS cuando:

- estés construyendo un blog, una página de marketing, un sitio de documentación o una página de CMS;
- la UI sean en su mayoría formularios y tablas ordinarios;
- la visibilidad SEO del contenido renderizado sea un requisito estricto;
- la selección de texto nativa del navegador sea central para el producto;
- no haya matemática de disposición personalizada, densidad de animación, grafo, juego, simulación o escena con muchas entidades.

VectoJS brilla cuando necesitas **control visual a nivel de canvas** con suficiente infraestructura de runtime para evitar reconstruir tú mismo la disposición, los eventos, el texto, la accesibilidad y la exportación.

## Próximos pasos

- [Arquitectura del Runtime](/learn/runtime-architecture/) explica las partes móviles.
- [Casos de Uso](/learn/use-cases/) asigna los compromisos a categorías de producto reales.
