+++
title = "UI: TextArea"
description = "Edición de texto nativa multilínea con renderizado en canvas."
weight = 24
+++

# `TextArea`

`TextArea` refleja un `<textarea>` nativo en el canvas, preservando el comportamiento de edición del navegador.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TextArea</span></div>
  <iframe src="/sandbox/ui/component.html?name=textarea&v=core-1.39.0-ui-2.20.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de TextArea" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## Composición IME

Cuando una composición IME está activa, el componente dibuja un subrayado bajo el rango de composición. El **resaltado de selección se suprime** durante la duración: componer sobre texto seleccionado reemplaza lógicamente ese rango, pero el elemento nativo sigue reportando el `selectionStart`/`selectionEnd` pre-composición hasta que la composición se confirma — dibujarlo mostraría un resaltado obsoleto detrás (y más ancho) que el subrayado de composición. Una composición de longitud cero (el `compositionstart` inicial) aún muestra la selección, ya que nada la ha reemplazado todavía.

## Lista de verificación para mantenedores

- Úsalo para entrada de texto multilínea real.
- Mantén un solo propietario de edición de texto; no falsifiques IME ni portapapeles en el canvas.
- Prueba con selección de teclado y pegado, no solo clics de puntero.
- El textarea nativo transparente hereda la fuente del canvas, la altura de línea,
  el padding y el contrato `border-box`, por lo que el clic-para-cursor y las filas de selección usan
  la misma geometría que el espejo visible del canvas.

## Desplazamiento

El canvas sigue el `scrollTop` del **elemento nativo** (2.10.0+). El espejo es la
autoridad del desplazamiento y el navegador ya lo ha desplazado, así que no hay
ningún manejador de rueda — añadir uno aplicaría el gesto dos veces.

Antes de 2.10.0 la posición de desplazamiento del canvas la dirigía solo el cursor,
actualizándose cuando `selectionStart` se movía y nunca por la vista. De ahí se
derivaban dos defectos. Un gesto de rueda movía el elemento real mientras el canvas
se quedaba quieto, así que el texto no se desplazaba en absoluto. Y como
`selectionStart` se inicializa a `value.length`, una TextArea recién montada pintaba
la parte _inferior_ de su contenido mientras el elemento nativo permanecía arriba —
32,6 filas de discrepancia medidas en un documento de 60 líneas, lo que dejaba el
cursor de cada clic en la línea equivocada.

El seguimiento del cursor se conserva como repliegue para cuando no existe ningún
espejo. El espejo también establece `scrollbar-width: none`: el hueco de una barra
de desplazamiento nativa reduce `clientWidth` por debajo del ancho del canvas, así
que ambos ajustan el texto en puntos distintos. Medido en Firefox en 2.9.0, una
TextArea de 516px de ancho tenía un hueco de 12px, así que el elemento nativo
ajustaba a 480px mientras el canvas lo hacía a 492px.
