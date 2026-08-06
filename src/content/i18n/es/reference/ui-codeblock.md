---
title: 'UI: CodeBlock'
description: 'Bloque de código en canvas de una sola hoja utilizado por Markdown para bloques de código.'
order: 40
---

# `CodeBlock`

`CodeBlock` es el renderizador de bajo nivel para bloques de código utilizado por `Markdown`. Ambos viven en el paquete
independiente **`@vectojs/markdown`** (extraídos de `@vectojs/ui` en `@vectojs/ui@2.2.0`). Dibuja el fondo y el
texto coloreado por sintaxis él mismo, evitando una entidad hija por token.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · CodeBlock</span></div>
  <iframe src="/sandbox/ui/component.html?name=codeblock&v=core-1.32.2-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de CodeBlock" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Úsalo directamente solo para renderizadores personalizados; los documentos normales deberían usar `Markdown`.</figcaption>
</figure>

## Ejemplo mínimo

````ts
import { CodeBlock, Markdown } from '@vectojs/markdown';

// La mayoría de los usuarios deberían dejar que Markdown cree instancias de CodeBlock:
const md = new Markdown('```ts\\nscene.markDirty();\\n```', { maxWidth: 520 });

// Las subclases personalizadas de Markdown pueden devolver CodeBlock para bloques de código específicos de la aplicación.
````

Los bloques de código proyectan su fuente exacta como filas visuales posicionadas individualmente
desde el mismo margen y línea base que Canvas. Por lo tanto, las líneas de fuente largas no
se ajustan silenciosamente en el navegador ni se desvían de la copia, la búsqueda en página o la selección nativa.
Cada nueva línea pertenece a la fila posicionada precedente, evitando que Firefox
produzca un fragmento seleccionado en la raíz de la proyección. La pila por defecto
comienza con `ui-monospace`, evitando la sustitución de fuente monoespaciada por una
fuente serif proporcional en Firefox de escritorio, respetando al mismo tiempo una fuente personalizada explícita.
Markdown propaga su configuración `selectable`; los usuarios directos de CodeBlock pueden llamar
a `setSelectable(boolean)`.

UI 1.9 usa la cuadrícula de contenido preparado retenido de Core 1.8 tanto para la
pintura en Canvas con color sintáctico como para el portador semántico. Tabuladores, emoji/ZWJ,
CJK ancho, forma árabe, direcciones mixtas y límites exactos de fuente CR/LF/CRLF
comparten un solo plan. La calibración es una pasada de carga de fuente en frío; la sincronización
de proyección estable no lee geometría de Range ni reemplaza portadores de celda.

## Ancho: `setWidth()`

```ts
codeBlock.setWidth(width: number): this
```

Cambia el ancho de la caja (`0.9.0+`). Deliberadamente **no** reconstruye la
rejilla ni vuelve a ejecutar el resaltado, porque el código no se reajusta: las
líneas se sitúan en una rejilla monoespaciada fija en `col × cellWidth` y una
línea larga se desborda en vez de ajustarse, así que `height` depende solo del
**número** de líneas y el ancho únicamente dimensiona el fondo redondeado.

Todo lo que cambiaría la geometría de los glifos —el código, el lenguaje, la
fuente— pasa por `setCode()`, que invalida la rejilla allí. Si el ancho no
cambia no hace nada y devuelve `this`.

`Markdown.setMaxWidth()` lo llama por cada bloque de código delimitado que
posee, así que solo necesitas invocarlo directamente si construyes un
`CodeBlock` por tu cuenta.

## Lista de verificación para mantenedores

- Mantén el código de bloque como una sola entidad hoja.
- Usa `setCode()` para actualizaciones en vivo.
- Usa `setWidth()` para un cambio solo de ancho; omite la reconstrucción de rejilla que hace `setCode()`.
- Mantén la proyección de contenido sincronizada con la fuente exacta, la fuente y la altura de línea.
- Reutiliza una cuadrícula preparada para la pintura en Canvas, cursores de puntero, copia y búsqueda.
- Verifica en Chromium y Firefox con DPR/zoom fraccionario, incluyendo fuentes sustituidas y bloques transformados.
- Prefiere el componente de más alto nivel `Markdown` a menos que estés escribiendo una extensión de renderizador.
