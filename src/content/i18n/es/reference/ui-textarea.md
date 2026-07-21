---
title: 'UI: TextArea'
description: 'Edición de texto nativa multilínea con renderizado en canvas.'
order: 24
---

# `TextArea`

`TextArea` refleja un `<textarea>` nativo en el canvas, preservando el comportamiento de edición del navegador.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TextArea</span></div>
  <iframe src="/sandbox/ui/component.html?name=textarea&v=core-1.15.0-ui-2.0.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de TextArea" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>La edición multilínea es nativa; el canvas pinta el espejo visual.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { TextArea } from '@vectojs/ui';

const notes = new TextArea({
  width: 420,
  height: 140,
  placeholder: 'Escribe una nota…',
  onChange: (value) => saveDraft(value),
});
```

## Lista de verificación para mantenedores

- Úsalo para entrada de texto multilínea real.
- Mantén un solo propietario de edición de texto; no falsifiques IME ni portapapeles en el canvas.
- Prueba con selección de teclado y pegado, no solo clics de puntero.
- El textarea nativo transparente hereda la fuente del canvas, la altura de línea,
  el padding y el contrato `border-box`, por lo que el clic-para-cursor y las filas de selección usan
  la misma geometría que el espejo visible del canvas.
