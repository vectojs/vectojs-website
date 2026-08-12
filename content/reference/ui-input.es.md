+++
title = "UI: Input"
description = "Entrada de texto de una sola línea con comportamiento de edición nativo reflejado en el canvas."
weight = 23
+++

# `Input`

`Input` usa un `<input>` transparente real para la edición mientras pinta el campo visible en el canvas.
IME, portapapeles, selección y automatización se mantienen nativos.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Input</span></div>
  <iframe src="/sandbox/ui/component.html?name=input&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Input" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## Estado de validación (2.3.0+)

`required` e `invalid` llegan al árbol de accesibilidad, no solo al borde:

```ts
const email = new Input({ width: 240, placeholder: 'Email', required: true });
email.invalid = !isValidEmail(email.value); // borde rojo + aria-invalid
```

`required` se proyecta como el atributo nativo `required` en el `<input>`/`<textarea>` sombra, por lo que participa en la validación del formulario y en el estilo `:invalid` en lugar de solo describir la restricción. `invalid` se convierte en `aria-invalid`.

Limpiar `invalid` **elimina** el atributo en lugar de establecer `"false"` — significan cosas diferentes, ya que `aria-invalid="false"` afirma ser "explícitamente válido".

Un borde rojo por sí solo sería invisible para un lector de pantalla y para cualquier persona que no pueda distinguir el color (WCAG 1.4.1), que es por lo que el estado se proyecta en lugar de solo dibujarse. Bajo colores forzados ambos estados se remiten a los colores del sistema.

`TextArea` toma las mismas dos opciones.

## Composición IME

Cuando una composición IME está activa, el componente dibuja un subrayado bajo el rango de composición. El **resaltado de selección se suprime** durante la duración: componer sobre texto seleccionado reemplaza lógicamente ese rango, pero el elemento nativo sigue reportando el `selectionStart`/`selectionEnd` pre-composición hasta que la composición se confirma — dibujarlo mostraría un resaltado obsoleto detrás (y más ancho) que el subrayado de composición. Una composición de longitud cero (el `compositionstart` inicial) aún muestra la selección, ya que nada la ha reemplazado todavía.

## Lista de verificación para mantenedores

- Usa `Input` en lugar de entidades de entrada de texto personalizadas.
- Mantén el placeholder significativo; también es la etiqueta accesible por defecto.
- Preserva la selección intencionalmente al implementar actualizaciones controladas.
