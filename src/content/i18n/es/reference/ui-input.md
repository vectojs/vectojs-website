---
title: 'UI: Input'
description: 'Entrada de texto de una sola línea con comportamiento de edición nativo reflejado en el canvas.'
order: 23
---

# `Input`

`Input` usa un `<input>` transparente real para la edición mientras pinta el campo visible en el canvas.
IME, portapapeles, selección y automatización se mantienen nativos.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Input</span></div>
  <iframe src="/sandbox/ui/component.html?name=input&v=core-1.16.0-ui-2.1.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Input" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Llena el cuadro de texto mediante entrada de teclado o automatización basada en roles.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Input } from '@vectojs/ui';

const name = new Input({
  width: 320,
  placeholder: 'Nombre del proyecto',
  onChange: (value) => updateProjectName(value),
});
```

## Composición IME

Cuando una composición IME está activa, el componente dibuja un subrayado bajo el rango de composición. El **resaltado de selección se suprime** durante la duración: componer sobre texto seleccionado reemplaza lógicamente ese rango, pero el elemento nativo sigue reportando el `selectionStart`/`selectionEnd` pre-composición hasta que la composición se confirma — dibujarlo mostraría un resaltado obsoleto detrás (y más ancho) que el subrayado de composición. Una composición de longitud cero (el `compositionstart` inicial) aún muestra la selección, ya que nada la ha reemplazado todavía.

## Lista de verificación para mantenedores

- Usa `Input` en lugar de entidades de entrada de texto personalizadas.
- Mantén el placeholder significativo; también es la etiqueta accesible por defecto.
- Preserva la selección intencionalmente al implementar actualizaciones controladas.
