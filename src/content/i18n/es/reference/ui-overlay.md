---
title: 'Overlay'
description: 'Primitivas de UI flotante para Tooltip, Popover y ContextMenu, montadas a través de la raíz de superposición de la Scene.'
order: 15
---

# Overlay

La familia de superposiciones renderiza UI transitoria por encima del árbol de entidades normal. Las superposiciones se montan a través de
`scene.overlayRoot`, por lo que pueden escapar de contenedores recortados mientras siguen usando coordenadas de la escena y
el mismo sistema de animación.

## Pruébalo

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Overlay</span></div>
  <iframe src="/sandbox/ui/overlay.html?v=core-1.32.6-ui-2.15.0" class="sandbox-frame component-demo-frame component-demo-frame-tall" loading="eager" title="Demostración en vivo de Overlay" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Pasa el ratón o haz clic en los lanzadores. Popover y ContextMenu se posicionan para evitar el defecto de desbordamiento que es difícil de detectar en una galería gigante.</figcaption>
</figure>

## Ejemplo mínimo

```ts
import { Button, Popover, Text } from '@vectojs/ui';

const target = new Button('Clic · Popover').setPosition(40, 40);
const popover = new Popover({
  target,
  width: 220,
  height: 92,
  placement: 'right',
});

popover.add(new Text('Contenido del popover').setPosition(14, 18));
scene.add(target);
scene.add(popover);
```

## Componentes

| Componente    | Disparador                          | Caso de uso                                 |
| ------------- | ----------------------------------- | ------------------------------------------- |
| `Tooltip`     | Pasar el ratón con retardo opcional | Texto explicativo ligero                    |
| `Popover`     | Clic en el objetivo                 | Paneles transitorios pequeños con hijos     |
| `ContextMenu` | Normalmente clic derecho o clic     | Menús de comandos con separadores/elementos |
| `Overlay`     | Manual `showAt()`/`showAtPoint()`   | Componentes flotantes personalizados        |

## Lista de verificación para mantenedores

- Usa `target.getWorldBounds()` para objetivos transformados.
- Limita los ejemplos al viewport o a los límites de la card que se está demostrando.
- Oculta o elimina la UI transitoria cuando su objetivo sale del árbol.
- Mantén el contenido de la superposición legible sobre los controles subyacentes; usa fondos suficientemente opacos.

Relacionado: [`Button`](/reference/ui-button/), [`ScrollView`](/reference/ui-components/#scrollview), [`Modal`](/reference/ui-components/#modal).
