---
title: 'UI: Text'
description: 'Componente de texto en canvas con ajuste, reflujo en caliente de maxWidth y una etiqueta semántica.'
order: 16
---

# `Text`

`Text` renderiza texto multilínea de un solo estilo en el canvas. Es la opción predeterminada para etiquetas, texto
de ayuda, encabezados y texto corto de solo lectura dentro de la UI de VectoJS. Su proyección de contenido transparente mantiene
el texto fuente lógico exacto a través de ajustes suaves, nuevas líneas explícitas, texto CJK, ligaduras y párrafos
RTL, por lo que la selección nativa, la copia, la búsqueda en página y la traducción no heredan el orden de los glifos visuales.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Text</span></div>
  <iframe src="/sandbox/ui/component.html?name=text&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Text" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Redimensiona la página para inspeccionar el reflujo en caliente de `maxWidth` en un viewport enfocado.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Text } from '@vectojs/ui';

const heading = new Text('UI matemática en canvas', {
  font: '700 24px Inter, system-ui',
  color: '#f8fafc',
  maxWidth: 360,
  lineHeight: 32,
  selectable: true,
});

scene.add(heading.setPosition(24, 24));
```

## Lista de verificación para mantenedores

- Usa `setMaxWidth()` para cambios de ancho responsivos.
- Usa `setText()` o `append()` para cambios de contenido.
- Usa `setSelectable(false)` cuando los gestos de arrastre deban ser dueños de la región de texto en lugar de la selección del navegador.
- Mantén la fuente de la aplicación en orden Unicode lógico; VectoJS y el navegador resuelven la dirección árabe/hebrea automáticamente.
- Core 1.8 resuelve cursores de puntero en geometría bidimensional transformada; no añadas manejadores de selección solo de viewport-X para texto rotado, reflejado o escalado de forma no uniforme.
- Prefiere `RichText` cuando se requieran estilos en línea o enlaces.
