---
title: 'a11yRoot y el contrato del agente'
description: 'Cómo cada Entity interactiva proyecta un nodo sombra ARIA transparente en el DOM — la forma A11yAttributes, el contrato de rendimiento de canvas y accesibilidad de grado DOM, y los problemas de sincronización que causan nodos sombra obsoletos o faltantes.'
order: 10
---

# a11yRoot y el contrato del agente

Parte de [`@vectojs/core`](/reference/core-api/).

Toda entidad interactiva que tiene una caja proyecta un **nodo sombra ARIA
transparente** en el `a11yRoot` div de la Scene (encima del canvas,
`pointerEvents:auto` para que la automatización/AT pueda interactuar;
`opacity:0` a menos que `debugA11y` esté activo). Cada nodo lleva
`id` + `data-vecto-id`, más el rol/etiqueta/estado de
[`Entity.getA11yAttributes()`](/reference/core-entity/#hooks-de-a11y--agrupación-sobrescribir-para-optar).

La raíz de proyección sigue la caja CSS del canvas: el desplazamiento del canvas y el escalado CSS no uniforme
se aplican a las capas sombra y DOM-portal mientras la geometría de la entidad
permanece en coordenadas lógicas de la Scene. La rotación/inclinación CSS arbitraria del canvas
no forma parte de este mapeo.

`A11yAttributes`:

```ts
{
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea';   // default 'div'
  role?, label?, tabIndex?, href?, src?, alt?, inputType?, placeholder?, value?,
  checked?, disabled?, expanded?, controls?, haspopup?, selected?,
  activedescendant?, valuemin?, valuemax?
}
```

La sincronización aplica estos atributos a un elemento real (un verdadero `<button>`, `<a href>`, `<img>`,
`<input>`/`<textarea>` con eventos `change`/`focus`/`blur` compatibles con IME, etc.), con verificación
de estado sucio para minimizar escrituras en el DOM. Los roles interactivos no enfocables nativamente
(`button`, `switch`, `checkbox`, `link`, `slider`, …) reciben `tabindex="0"` y
Enter/Espacio → `click`. Esta es la historia de "**rendimiento de canvas Y accesibilidad
de grado DOM**": los visuales son 100% GPU/canvas, pero un agente Playwright
`getByRole('button', { name })` resuelve el nodo sombra y hace clic en él.

Establece `tabIndex: 0` explícitamente cuando una región que no es un control, como un lienzo de diseño,
debe entrar en el orden de enfoque secuencial y recibir eventos `keydown` del VMT. Usa `-1`
solo para enfoque programático; devolver `undefined` elimina el valor explícito.

## Controles y problemas

- `data-vecto-id` en cada nodo sombra refleja el `id` de la entidad — el identificador estable
  para selectores de automatización.
- `a11ySyncInterval` (ver [`SceneOptions`](/reference/core-scene/#sceneoptions))
  limita la sincronización durante la animación y asegura una actualización final después de que el
  movimiento pendiente se estabilice; no suspende toda la sincronización durante toda la animación.
- `debugA11y: true` muestra los nodos (azul punteado) para desarrollo.
- `detachA11y(entity)` poda los nodos sombra de un subárbol sin eliminar la
  entidad; `remove()` poda automáticamente. La sincronización por fotograma **crea/actualiza pero nunca
  poda**, así que gestiona explícitamente la rotación de hijos interactivos.
- `getA11yTree()` devuelve una instantánea `A11yTreeNode[]` anidada para aserciones;
  `getA11yElement(id)` obtiene un elemento sombra específico.
- `a11yFullViewport` monta una superficie de interacción sin límites detrás de todas las demás.
- Desde Core 1.11.1, cada entidad interactiva recién proyectada recibe el `z-index` correspondiente al orden de pintura del canvas en el mismo fotograma que crea su nodo sombra. Por tanto, el backdrop de una superposición nueva queda por encima de los controles de diseño existentes desde la primera interacción del puntero, sin esperar otro renderizado.

Ver [Accesibilidad](/learn/accessibility/) para patrones de uso y pruebas.

## Relacionados

[`Scene`](/reference/core-scene/) (`a11ySyncInterval`, `debugA11y`) ·
[`Entity`](/reference/core-entity/) (`getA11yAttributes()`, `interactive`, `width`/`height`) ·
[Visión general de `@vectojs/core`](/reference/core-api/)
