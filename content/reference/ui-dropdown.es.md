+++
title = "UI: Dropdown"
description = "Control de cuadro combinado con una lista superpuesta y navegación por teclado."
weight = 27

[extra]
order = 27
+++

# `Dropdown`

`Dropdown` envuelve un botón de canvas, proyecta `role="combobox"` y abre una lista superpuesta.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Dropdown</span></div>
  <iframe src="/sandbox/ui/component.html?name=dropdown&v=core-1.34.0-ui-2.15.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Dropdown" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Ábrelo con el puntero o el teclado; el menú se monta a través de la ruta de superposición de la escena.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Dropdown } from '@vectojs/ui';

const backend = new Dropdown(['Canvas', 'WebGL', 'WebGPU'], {
  label: 'Renderer backend',
  width: 220,
  onChange: (value) => setBackend(value),
});
```

> **Establece `label`.** Un `role=\"combobox\"` sin nombre accesible se anuncia como simple "combobox" (WCAG 4.1.2); el valor seleccionado por sí solo no dice para qué sirve el control. Cualquier etiqueta visual dibujada en canvas no llega a la capa semántica, así que pásala aquí también. Disponible desde `@vectojs/ui@2.2.0`.

El gatillo cerrado toma `bg`/`color`; las filas de opción del menú abierto toman sus cinco props propias, todas añadidas en 2.7.0:

| Prop              | Predeterminado              | Se aplica a                      |
| ----------------- | --------------------------- | -------------------------------- |
| `menuBg`          | `'rgba(15, 23, 42, 0.95)'`  | cada fila de opción              |
| `menuColor`       | `'#fff'`                    | el texto de las filas de opción  |
| `menuSelectedBg`  | `'rgba(0, 240, 255, 0.25)'` | la fila seleccionada             |
| `menuHighlightBg` | `'rgba(0, 240, 255, 0.4)'`  | la fila resaltada por teclado    |
| `focusColor`      | `'#00f0ff'`                 | el gatillo y las filas de opción |

```ts
new Dropdown(['1x', '1.5x', '2x'], {
  label: 'Playback rate',
  bg: 'rgba(18, 23, 34, 0.98)',
  menuBg: 'rgba(18, 23, 34, 0.98)',
  menuColor: '#e2e8f0',
  menuSelectedBg: 'rgba(244, 63, 94, 0.30)',
  menuHighlightBg: 'rgba(244, 63, 94, 0.55)',
  focusColor: '#60a5fa',
});
```

Antes de que existieran, el gatillo era tematizable pero el menú no, por lo que un desplegable estilizado para una paleta clara o cálida abría un panel oscuro con selección cian — lo que se lee como un bug de renderizado en lugar de una elección de estilo.

Dos cosas que vale la pena saber al elegir valores:

- **Ambos estados de fila pueden aplicarse a la vez**, y abrir el menú resalta la fila seleccionada, por lo que `menuHighlightBg` debe leerse como el más fuerte de los dos.
- **Las filas de opción son enfocables** (`role="option"`), por lo que el anillo `focusColor` se dibuja _sobre_ una fila resaltada. Mantén el anillo separado de `menuHighlightBg` por al menos 3:1 (WCAG SC 1.4.11) — subir el alfa del resaltado lo suficiente para separarlo de `menuSelectedBg` puede llevar silenciosamente el anillo por debajo de ese mínimo.

Los fondos de menú casi opacos suelen ser lo correcto: un menú translúcido sobre contenido de canvas en movimiento sigue siendo legible por contraste pero se percibe como ruido.

## Lista de verificación para mantenedores

- Mantén los metadatos `expanded`, `controls` y `activedescendant` sincronizados.
- Cierra la superposición al hacer clic fuera y con Escape.
- Prueba ArrowUp, ArrowDown, Enter, Space y Escape.
