---
title: '@vectojs/devtools'
description: 'El inspector en página del Virtual Math Tree — selección de entidades, vista de árbol en vivo, lectura de transformaciones y edición por teclado, todo ello renderizado con el propio VectoJS.'
order: 48
---

# `@vectojs/devtools`

Versión documentada: **0.4.3**

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

- **Vista de árbol en vivo (pestaña `Tree`)** de `scene.rootEntity` y `scene.overlayRootEntity`, actualizada en un intervalo (por defecto 500ms). Cada fila muestra el nombre del constructor de la entidad, posición, tamaño y dos insignias: **⚡** (`interactive`) y **▶** (`hasPendingAnimations()`).
- **Modo selección**: haz clic en **Pick**, luego haz clic en cualquier parte de la página. El inspector resuelve el clic en la entidad más profunda bajo ese punto usando el mismo orden de recorrido que la Scene usa para la entrada del puntero (con un respaldo AABB para entidades decorativas no interactivas).
- **Resaltado de selección**: la caja delimitadora en espacio mundial de la entidad seleccionada se dibuja como un contorno en la capa de superposición de la escena _anfitriona_, para que veas exactamente qué está seleccionado en relación con el renderizado en vivo.
- **Lectura de estado + edición en línea (pestaña `Info`)**: geometría, escala/rotación/opacidad, la matriz de transformación mundial completa y el estado de animación como texto plano — los números que una captura de pantalla no puede darte directamente.
- **Edición por teclado**: con una entidad seleccionada, las teclas de flecha la mueven 1px (Mayús: 10px); `+`/`-` ajustan la opacidad en 0.1. Útil para confirmar _qué_ entidad tiene un error de diseño antes de tocar el código.

- **HUD de rendimiento** (0.5.0): una tira inferior lee [`Scene.frameStats`](/reference/core-scene) — fps, ms/fotograma, recuento de entidades, modo de renderizado y conteo de fotogramas renderizados/omitidos. Los fps son la cadencia real de _fotogramas renderizados_, por lo que una escena `onDemand` inactiva o con aceleración automática dice honestamente ~2fps en lugar de un falso 60. Desactivar con `showPerf: false`.
- **Configuración** (pestaña `⚙`, 0.5.0): alternar el resaltado de selección, y cambiar el intervalo de actualización y el lado de anclaje (izquierdo/derecho) en vivo.
  Desde la versión 0.4.3, el dock fijo del borde derecho y su canvas usan `pointer-events: none`; solo los controles interactivos proyectados vuelven a habilitar los eventos del puntero. Así, el inspector ya no roba la entrada de los controles anfitriones situados bajo píxeles vacíos del dock, mientras que sus filas VMT y botones siguen siendo clicables.

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

## Auditoría de escena

`auditScene` recorre el árbol e informa defectos de diseño como hallazgos estructurados y seguros para JSON — la respuesta numérica a "¿algo se desborda, superpone o escapa?":

```typescript
import { auditScene } from '@vectojs/devtools/headless';

const findings = auditScene(scene, {
  tolerance: 0.5, // px de holgura antes de que un escape/superposición cuente
  includeOverlay: false, // modales/destacados excluidos por defecto
  ignore: (e) => e.id.startsWith('debug-'), // podar subárboles
  ignoreOverlap: (a, b) => a.id === 'badge', // permitir apilamiento intencional
});
// -> AuditFinding[]: { kind, entityId, entityPath, worldBounds, message,
//    containerBounds?, overflow?{left,right,top,bottom}, otherId?, intersection? }
```

Se detectan cuatro `kind`, ordenados determinísticamente:

- `text-overflow` — la caja medida de una entidad con texto escapa de su ancestro con tamaño más cercano.
- `clip-overflow` — el contenido escapa de un ancestro `clipChildren` (píxeles recortados).
- `overlap` — **solo hermanos**; la contención padre-hijo es normal.
- `viewport-overflow` — una entidad sin ancestro con tamaño dibujada fuera del canvas.

Puntos ciegos conocidos: los contenedores desplazables eximen el eje vertical (anula la lista mediante `scrollableTypes`, coincididos por `constructor.name`), y las entidades con `opacity: 0` se omiten.

El botón **Audit** del panel ejecuta la misma verificación en lugar de la vista de árbol; `panel.audit()` devuelve los hallazgos y `panel.selectFinding(i)` resalta uno.

Úsalo como compuerta de CI: `expect(auditScene(scene)).toEqual([])`.

## Instantáneas y diferencias

```typescript
import { captureSnapshot, diffSnapshots } from '@vectojs/devtools/headless';

const before = captureSnapshot(scene); // árbol JSON determinista
// … realizar una interacción …
const diffs = diffSnapshots(before, captureSnapshot(scene));
// -> [{ path: "root > GridEntity[0]", kind: "changed", changes: { x: {from,to} } }]
```

Las diferencias se basan en **rutas estructurales** (cadenas `type[index]`), nunca en IDs de entidad — los IDs son aleatorios por ejecución. Las propiedades con valores por defecto se omiten de las instantáneas, por lo que las diferencias se mantienen limpias. Los pares de instantáneas permiten aserciones de estado golden precisas en pruebas de humo: en lugar de capturar pantalla, afirma que una interacción cambió exactamente las entidades que debería.

## Utilidades de modelo de nivel inferior

La lógica de construcción de árbol y selección se exporta por separado si quieres construir una UI de inspector personalizada en lugar del panel integrado:

```typescript
import {
  buildTreeModel,
  findEntityAt,
  describeEntity,
  inspectEntity,
  entityPath,
  pickInScene,
} from '@vectojs/devtools';

buildTreeModel(root: Entity): { nodes: TreeNode[]; index: Map<string, Entity> };
findEntityAt(root: Entity, x: number, y: number): Entity | null; // punto en espacio de escena → entidad
describeEntity(entity: Entity): string[]; // líneas de estado legibles por humanos
inspectEntity(entity: Entity): EntityInfo; // estado estructurado y seguro para JSON
entityPath(entity: Entity): string; // cadena de ascendencia ("Scene > Card#<id> > Text#<id>", ids truncados a 8 caracteres)
pickInScene(scene: Scene, sceneX: number, sceneY: number): Entity | null; // selección con prioridad de superposición
```

`inspectEntity` es el hermano estructurado de `describeEntity`: límites y transformación mundial, banderas de interacción, `clipChildren`, recuento de hijos, una vista previa de texto con tipado dinámico (`.text`/`.value`), y los atributos de proyección de accesibilidad cuando están presentes. `entityPath` genera la cadena de ascendencia de la entidad (ej. `"Scene > Card#<id> > Text#<id>"`, IDs truncados a 8 caracteres).

## Flujos de trabajo de depuración

La capa de modelo de devtools responde preguntas de diseño con números — úsala antes de recurrir a una captura de pantalla. Síntoma → herramienta:

| Síntoma                                                               | Flujo de trabajo                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "¿Qué entidad posee este píxel?"                                      | `pickInScene(scene, x, y)` → `inspectEntity(hit)`; en página, el botón **Pick** del panel                                                                                                                                                                    |
| "¿Por qué esta entidad tiene la posición/tamaño incorrecto?"          | `inspectEntity` para límites mundiales + transformación, luego recorre `entityPath` hacia arriba — el primer ancestro con límites incorrectos posee el bug                                                                                                   |
| "Algo se desborda/superpone pero no veo dónde"                        | `auditScene(scene)` — cada hallazgo incluye `entityPath`, límites mundiales y cantidades de desbordamiento por borde                                                                                                                                         |
| "Esta interacción movió algo que no debería"                          | `captureSnapshot` antes, interactuar, `diffSnapshots` después — el diff lista exactamente qué cambió                                                                                                                                                         |
| "Un clic/rueda/tecla va al lugar equivocado"                          | `createEventTrace(scene)` — cada entrada muestra source (`canvas`/`a11y`/`content`/`document`), ruta de destino, coordenadas, y el `defaultPrevented` final                                                                                                  |
| "La selección por arrastre de texto o copia está siendo interceptada" | Traza de eventos con `entry.source === 'content'` — significa que el evento del navegador comenzó en una proyección seleccionable; verifica `defaultPrevented` y la ruta de destino                                                                          |
| "Un arrastre se atasca / nunca se completa"                           | Las trazas de puntero son transaccionales: espera `pointerdown` → movimientos → exactamente un `pointerup` (confirmación) **o** `pointercancel` (reversión); una entrada terminal faltante significa que la entidad no fue proyectada o se omitió la captura |
| "¿Es esto una regresión?"                                             | Guarda una instantánea confirmada (`captureSnapshot`) de la escena saludable y ejecuta `diffSnapshots` contra ella en CI                                                                                                                                     |

## Notas de diseño

- El panel de escena se construye con `contentProjection: false` y `renderMode: 'onDemand'` — no debe proyectar su propio contenido DOM ni repintar cada fotograma mientras está inactivo.
- El estado de selección vive en el panel, no en el anfitrión: `select()`/`armPick()` nunca mutan la escena inspeccionada excepto por la entidad de resaltado de superposición, que se añade a través de `showOverlay()` y se elimina en `destroy()`.
- La actualización automática es un intervalo simple, no una animación de Scene — funciona incluso mientras la escena anfitriona está completamente inactiva (`onDemand`, nada sucio).
- El dock (`position: fixed; right: 0; width: 320px` por defecto, altura completa del viewport) y su canvas tienen `pointer-events: none`, reflejando cómo el propio `a11yRoot` de la `Scene` principal se excluye mientras los elementos sombra interactivos individuales se reincorporan mediante `auto` (`@vectojs/devtools@0.6.0+`). Esto significa que los clics sobre el fondo/cromo vacío del dock pasan a través hacia cualquier contenido anfitrión que esté debajo — incluyendo los controles del borde derecho de la propia aplicación anfitriona (botones de cierre de pestaña, botones de barra de herramientas) que de otro modo estarían en la banda de 320px del dock. Solo los controles proyectados a11y del propio panel (botones, filas del árbol VMT) son cliqueables independientemente, a través de su propia reincorporación `auto`.
