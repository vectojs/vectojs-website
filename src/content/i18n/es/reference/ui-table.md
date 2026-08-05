---
title: 'UI: Table'
description: 'Tabla de cuadrícula nativa en canvas para vistas previas compactas de datos y salida de tablas Markdown.'
order: 31
---

# `Table`

`Table` proyecta un árbol completo `grid` › `row` › `gridcell`/`columnheader`, pinta su decoración en el canvas y posee cada celda como una Entity hija. Las celdas de texto se normalizan a `Text`; las celdas Entity proporcionadas pueden participar a través de las capacidades públicas `setMaxWidth()` y `setSelectable()`.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Table</span></div>
  <iframe src="/sandbox/ui/component.html?name=table&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Table" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## Ancho adaptable: `setWidth()`

```ts
table.setWidth(width: number): this
```

Cambia el ancho total, reescala las columnas proporcionalmente y vuelve a
maquetar (`2.11.0+`). Úsalo en lugar de asignar `width`, que no basta por sí
solo: `colWidths` se resuelve **una única vez en el constructor** a partir del
ancho indicado allí, y el ancho de ajuste de línea, la posición y la alineación
de cada celda derivan de esas cifras **por columna** en vez de `width`. Por eso
una tabla cuyo `width` se reasignó pinta su marco al nuevo tamaño mientras sus
celdas siguen maquetadas para el anterior.

Las columnas conservan sus proporciones relativas, así que una razón
`colWidths` explícita sobrevive a un cambio de tamaño en lugar de repartirse a
partes iguales en la primera llamada. Si el ancho no cambia no hace nada, se
acota a un mínimo de 1 y devuelve `this`.

## Accesibilidad y teclado

El árbol proyectado es una cuadrícula ARIA real: una fila fija de `columnheader`s más un `row` por cada fila **visible** del cuerpo (consciente de la virtualización), cada celda un `gridcell` hotspot enfocable. Exactamente una celda posee el **tabindex flotante**, por lo que toda la cuadrícula es una parada de tabulación.

| Tecla                | Acción                                                           |
| -------------------- | ---------------------------------------------------------------- |
| Flechas              | Mover la celda enfocada un paso en 2D (el encabezado es fila -1) |
| Home / End           | Primera / última columna de la fila actual                       |
| Ctrl+Home / Ctrl+End | Primera celda de encabezado / última celda del cuerpo            |

La celda objetivo se desplaza a la vista antes de que el foco se mueva a ella. Ver [Widgets compuestos](/reference/core-a11y/#widgets-compuestos-tabindex-flotante).

## Puntero y toque

- **Arrastrar entre celdas** selecciona su texto de forma nativa (la proyección de la celda posee el puntero — ver arriba).
- **Arrastrar verticalmente** un cuerpo virtualizado lo desplaza 1:1 con el dedo, por lo que la tabla es usable en una pantalla táctil y no solo con una rueda.
- **Rueda** desplaza un cuerpo virtualizado.

## Lista de verificación para mantenedores

- Mantén la longitud de `colWidths` alineada con los encabezados; los anchos válidos se normalizan al ancho de la Table.
- Usa una instancia de Entity única por celda lógica.
- Llama a `layout()` después de que cambien el contenido o las dimensiones de la celda.
- Usa virtualización para conjuntos de datos grandes; `Table` es para cuadrículas compactas.
- Mantén la etiqueta de la cuadrícula descriptiva.
- Verifica la selección por arrastre entre celdas de encabezado/cuerpo después de cambiar anchos o el zoom de la aplicación.
- Verifica que la navegación por teclado llegue a cada celda después de cambiar la virtualización o el número de columnas.
