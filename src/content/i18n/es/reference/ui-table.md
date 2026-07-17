---
title: 'UI: Table'
description: 'Tabla de cuadrícula nativa en canvas para vistas previas compactas de datos y salida de tablas Markdown.'
order: 31
---

# `Table`

`Table` expone `role="grid"`, pinta su decoración en el canvas y posee cada celda
como una Entity hija. Las celdas de texto se normalizan a `Text`; las celdas Entity proporcionadas
pueden participar a través de las capacidades públicas `setMaxWidth()` y `setSelectable()`.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Table</span></div>
  <iframe src="/sandbox/ui/component.html?name=table&v=core-1.9.2-ui-1.10.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Table" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Usa demostraciones enfocadas para el tamaño de columnas en lugar de depurar la salida de la tabla dentro de una galería gigante.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Table } from '@vectojs/ui';

const table = new Table({
  width: 520,
  headers: ['Componente', 'Rol'],
  rows: [
    ['Button', 'button'],
    ['Input', 'textbox'],
  ],
  selectable: true,
});
```

`layout()` restringe cada celda, calcula las alturas de fila/tabla y posiciona
los hijos antes de renderizar. `render()` es solo de dibujo. Llama a `table.layout()` después de
cambiar una celda Entity proporcionada externamente o después de mutar los datos de texto
públicos. Cada celda lógica posee una proyección de contenido, por lo que la selección del navegador y
la búsqueda en página no duplican el texto de la tabla.

La selección es propiedad de la celda, no de la tabla: las celdas de texto se normalizan a
`Text` seleccionable, las entidades proporcionadas reciben `setSelectable()` cuando es compatible,
y las tablas Markdown heredan el mismo contrato. Por lo tanto, un arrastre a través de celdas
copia el texto lógico de la celda una vez, mientras que Canvas sigue siendo el único renderizador visual.
La sombra estructural `role="grid"` no captura eventos de puntero de las proyecciones
de celda. Esta propiedad de hoja es lo que mantiene la selección por arrastre entre celdas,
Ctrl/Comando+C y búsqueda en página alineados con el texto VMT exactamente una vez.

## Lista de verificación para mantenedores

- Mantén la longitud de `colWidths` alineada con los encabezados; los anchos válidos se normalizan al ancho de la Table.
- Usa una instancia de Entity única por celda lógica.
- Llama a `layout()` después de que cambien el contenido o las dimensiones de la celda.
- Usa virtualización para conjuntos de datos grandes; `Table` es para cuadrículas compactas.
- Mantén la etiqueta de la cuadrícula descriptiva.
- Verifica la selección por arrastre entre celdas de encabezado/cuerpo después de cambiar anchos o el zoom de la aplicación.
