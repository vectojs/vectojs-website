---
title: '@vectojs/devtools'
description: 'El inspector en página del Virtual Math Tree — selección de entidades, vista de árbol en vivo, lectura de transformaciones y edición por teclado, todo ello renderizado con el propio VectoJS.'
order: 48
---

# `@vectojs/devtools`

Versión documentada: **0.4.2**

`@vectojs/devtools` es la respuesta a "¿dónde está el panel de Elementos?" — un inspector en página para el Virtual Math Tree, de modo que depurar una escena de VectoJS permanezca en el espacio de estado en lugar del espacio de píxeles. El panel es en sí mismo una `Scene` de VectoJS (dogfooding del framework que inspecciona), acoplado al borde derecho de la página.

## Instalación

```bash
bun add -D @vectojs/devtools
```

Añade el panel visual condicionalmente en desarrollo — monta un panel VectoJS
y escucha en `document`, así que mantenlo fuera de los paquetes de producción. Las auditorías
sin interfaz, instantáneas, selección y trazado de eventos están disponibles sin el panel:

```ts
import { auditScene, captureSnapshot, createEventTrace } from '@vectojs/devtools/headless';
```

```typescript
import { attachDevtools } from '@vectojs/devtools';

const scene = new Scene(canvas);
// ...construir la escena...

if (import.meta.env.DEV) {
  const devtools = attachDevtools(scene);
  // devtools.detach() para eliminarlo después
}
```

## Qué muestra

- **Vista de árbol en vivo** de `scene.rootEntity` y `scene.overlayRootEntity`, actualizada en un intervalo (por defecto 500ms). Cada fila muestra el nombre del constructor de la entidad, posición, tamaño y dos insignias: **⚡** (`interactive`) y **▶** (`hasPendingAnimations()`).
- **Modo selección**: haz clic en **Pick**, luego haz clic en cualquier parte de la página. El inspector resuelve el clic en la entidad más profunda bajo ese punto usando el mismo orden de recorrido que la Scene usa para la entrada del puntero (con un respaldo AABB para entidades decorativas no interactivas).
- **Resaltado de selección**: la caja delimitadora en espacio mundial de la entidad seleccionada se dibuja como un contorno en la capa de superposición de la escena _anfitriona_, para que veas exactamente qué está seleccionado en relación con el renderizado en vivo.
- **Lectura de estado**: geometría, escala/rotación/opacidad, la matriz de transformación mundial completa y el estado de animación como texto plano — los números que una captura de pantalla no puede darte directamente.
- **Edición por teclado**: con una entidad seleccionada, las teclas de flecha la mueven 1px (Mayús: 10px); `+`/`-` ajustan la opacidad en 0.1. Útil para confirmar _qué_ entidad tiene un error de diseño antes de tocar el código.

## API

```typescript
function attachDevtools(
  scene: Scene,
  options?: DevtoolsOptions,
): DevtoolsPanel & { detach(): void };

interface DevtoolsOptions {
  width?: number; // ancho del panel en px, por defecto 320
  refreshInterval?: number; // ms; 0 desactiva la actualización automática
  traceEvents?: boolean; // muestra registros de enrutamiento de puntero/rueda/teclado limitados
  traceCapacity?: number;
}

class DevtoolsPanel {
  refresh(): void; // reconstruye el modelo de árbol desde la escena anfitriona
  armPick(): void; // de un solo uso: el siguiente clic en la página selecciona la entidad bajo él
  select(entity: Entity): void; // selecciona programáticamente
  get selection(): Entity | null;
  destroy(): void; // destruye listeners, temporizadores, resaltado anfitrión y el panel de escena
}
```

`detach()` (devuelto por `attachDevtools`) es un alias para `destroy()`.

## Traza de enrutamiento de eventos

```ts
const trace = createEventTrace(scene, { capacity: 100 });
trace.subscribe((entry) => {
  console.log(entry.source, entry.targetPath, entry.defaultPrevented);
});
```

`source` es `"canvas"`, `"a11y"`, `"content"` o `"document"`. La fuente
`content` significa que el evento del navegador comenzó en un espejo
`[data-vecto-content]` seleccionable. La traza valida la Entity propietaria, registra
las coordenadas de escena/locales, y finaliza en una microtarea para que `defaultPrevented`
refleje la decisión final de acceso directo o selección de la aplicación. Llama a
`trace.destroy()` cuando la superficie de diagnóstico se desmonte. Las trazas de puntero incluyen
`pointercancel`, lo que hace visibles las transacciones de arrastre y selección interrumpidas
en lugar de dejar un vacío diagnóstico después de `pointerdown`.

## Utilidades de modelo de nivel inferior

La lógica de construcción de árbol y selección se exporta por separado si quieres construir una UI de inspector personalizada en lugar del panel integrado:

```typescript
import { buildTreeModel, findEntityAt, describeEntity, pickInScene } from '@vectojs/devtools';

buildTreeModel(root: Entity): { nodes: TreeNode[]; index: Map<string, Entity> };
findEntityAt(root: Entity, x: number, y: number): Entity | null; // punto en espacio de escena → entidad
describeEntity(entity: Entity): string[]; // líneas de estado legibles por humanos
pickInScene(scene: Scene, sceneX: number, sceneY: number): Entity | null; // selección con prioridad de superposición
```

## Notas de diseño

- El panel de escena se construye con `contentProjection: false` y `renderMode: 'onDemand'` — no debe proyectar su propio contenido DOM ni repintar cada fotograma mientras está inactivo.
- El estado de selección vive en el panel, no en el anfitrión: `select()`/`armPick()` nunca mutan la escena inspeccionada excepto por la entidad de resaltado de superposición, que se añade a través de `showOverlay()` y se elimina en `destroy()`.
- La actualización automática es un intervalo simple, no una animación de Scene — funciona incluso mientras la escena anfitriona está completamente inactiva (`onDemand`, nada sucio).
