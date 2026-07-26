---
title: 'Button'
description: 'Componente de botón renderizado en canvas con una proyección de botón semántico para accesibilidad y automatización.'
order: 12
---

# `Button`

`Button` renderiza un botón redondeado en canvas y proyecta un `<button>` transparente real sobre la
misma caja. Los usuarios ven píxeles del canvas; los lectores de pantalla y herramientas de automatización operan el nodo semántico.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Button</span></div>
  <iframe src="/sandbox/ui/button.html?v=core-1.17.0-ui-2.2.0" class="sandbox-frame component-demo-frame" loading="eager" title="Demostración en vivo de Button" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Al pasar el ratón cambia el estado pintado. Los clics se enrutan a través del mismo rol de botón que Playwright puede encontrar.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Scene } from '@vectojs/core';
import { Button } from '@vectojs/ui';

const scene = new Scene(canvas);
scene.renderMode = 'onDemand';

scene.add(
  new Button('Guardar cambios', {
    onClick: () => save(),
  }).setPosition(40, 40),
);

scene.start();
```

## Constructor

```ts
new Button(label: string, opts?: ButtonOptions & { width?: number; height?: number })

interface ButtonOptions {
  onClick?: (event: unknown) => void;
  bg?: string;
  hoverBg?: string;
  color?: string;
  font?: string;
  padding?: number;
  radius?: number;
}
```

## Accesibilidad y automatización

`Button` expone `{ tag: 'button', role: 'button', label }`, por lo que las pruebas deberían apuntar al control
semántico en lugar de a los píxeles:

```ts
await page.getByRole('button', { name: 'Guardar cambios' }).click();
```

## Colores forzados (Alto contraste)

`Button` lee [`Scene.forcedColors`](/reference/core-scene/#accessibility--appearance) y, cuando el sistema operativo está en modo de colores forzados, repinta con colores CSS del sistema en lugar de su paleta temática: un relleno `ButtonFace`, una etiqueta `ButtonText` más un borde `ButtonText` de 1px (para que la forma sea visible contra el fondo del sistema), y un anillo de enfoque `Highlight`. Los píxeles del canvas están exentos del remapeo de colores forzados del navegador, por lo que un componente que omite esto queda ilegible en Alto contraste. La escena se repinta automáticamente al cambiar la configuración.

## Lista de verificación para mantenedores

- Al pasar el ratón y al salir debe llamar a `scene.markDirty()` en escenas `onDemand`.
- La etiqueta visual del botón y la etiqueta accesible deben permanecer idénticas a menos que una opción futura añada un
  nombre accesible explícito.
- Prefiere `Button` sobre rectángulos cliqueables personalizados para ejemplos en la documentación.
- Los componentes de botón personalizados deben reflejar la rama de colores forzados anterior.

Relacionado: [`Toggle`](/reference/ui-components/#toggle), [`Checkbox`](/reference/ui-components/#checkbox), [`Overlay`](/reference/ui-overlay/).
