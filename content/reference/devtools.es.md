+++
title = "@vectojs/devtools"
description = "El inspector en página del Virtual Math Tree y su capa de modelo headless — selección de entidades, vista de árbol, auditorías, instantáneas, lecturas de GPU y aceleradores, y puente JSON-RPC."
weight = 48
+++

# `@vectojs/devtools`

Versión documentada: **0.11.2**

`@vectojs/devtools` es la respuesta a "¿dónde está el panel de Elementos?" — un inspector en página para el Virtual Math Tree, de modo que depurar una escena de VectoJS permanezca en el espacio de estado en lugar del espacio de píxeles. Tiene dos mitades:

| Mitad                                                | Cubre                                                                                                                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **El panel** (`@vectojs/devtools`)                   | Un dock en la página, en sí mismo una `Scene` de VectoJS, con pestañas para el árbol, estado de entidad, auditorías, a11y, registro de eventos y ajustes. Documentado en esta página. |
| **La capa de modelo** (`@vectojs/devtools/headless`) | ~60 funciones puras que responden preguntas de layout, a11y, hit-testing, texto y rendimiento como datos. Sin panel DOM, usable en tests, CI, Node y agentes.                         |

La capa de modelo es la más grande y útil. Úsala antes de recurrir a una captura de pantalla — un número te dice _qué_ entidad está mal, mientras que una imagen solo dice que algo va mal.

| Página                                          | Contenido                                                                                                                                    |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [Inspeccionar](/reference/devtools-inspect/)    | Modelo de árbol, selección, estado entidad/a11y/texto, geometría de resaltado, explicación de hit-test, traza de enrutamiento de eventos.    |
| [Auditar](/reference/devtools-audit/)           | Todas las funciones `audit*` — layout, a11y, text shaping, selection drift — más instantáneas y diffs para aserciones de regresión.          |
| [Rendimiento](/reference/devtools-perf/)        | Contadores GPU y de dibujo, estado de aceleradores WASM, atribución de repintado sucio, métricas de streaming Markdown.                      |
| [Puente y plugins](/reference/devtools-extend/) | El protocolo JSON-RPC para conducir una escena desde otro documento, y el protocolo de plugin para añadir tus propias pestañas y auditorías. |

---

## Instalación

```bash
bun add -D @vectojs/devtools
```

El panel monta una escena VectoJS y escucha en `document`, así que mantenlo fuera de los bundles de producción. Importa la capa de modelo desde la subruta `headless` — no lleva código de panel ni dependencia de `@vectojs/ui` :

```ts
import { auditScene, captureSnapshot, inspectEntity } from '@vectojs/devtools/headless';
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

> [!IMPORTANT]
> Todo lo que está bajo `@vectojs/devtools/headless` también se re-exporta desde la raíz del paquete, así que un único import `attachDevtools` no te impide llamar a `auditScene`. La subruta existe para que un bundle de test de producción pueda incluir la capa de modelo sin el panel.

---

## Qué muestra

La cabecera lleva tres botones icono fantasma — **⌖** (seleccionar), **⟳** (refrescar), **⚠** (auditar) — y tres badges de contador: total de entidades, interactivas (**⚡**), y hallazgos de auditoría (**⚠**). Una barra `Tabs` divide las herramientas en **Tree · Info · Audit · A11y · Log · ⚙**, más una pestaña por cada [inspector de plugin](/reference/devtools-extend/#protocolo-de-plugin) registrado. Una tira de rendimiento está fijada en la parte inferior.

- **Vista de árbol en vivo** (`Tree`) de `scene.rootEntity` y `scene.overlayRootEntity`, actualizada en un intervalo (por defecto 500ms). Cada fila muestra el nombre del constructor de la entidad, posición, tamaño y dos badges: **⚡** (`interactive`) y **▶** (`hasPendingAnimations()`). Un campo **filtro** estrecha las filas por subcadena de tipo/id; es de solo vista, así que el índice id→entidad sigue resolviendo todo. Programáticamente: `panel.setFilter(text)`.
- **Modo selección**: haz clic en **⌖**, luego haz clic en cualquier parte de la página. El inspector resuelve el clic en la entidad más profunda bajo ese punto usando el mismo orden de recorrido (y la misma regla de aceptación) que la Scene usa para la entrada del puntero — una entidad es seleccionable solo donde su propia forma acepta el punto, exactamente como el motor, de modo que las partículas y otras entidades no interactivas nunca son propietarias falsas.
- **Resaltado de selección**: la geometría de la entidad seleccionada se dibuja como un contorno en la capa de overlay de la escena _anfitriona_, para que veas exactamente qué está seleccionado en relación con el renderizado en vivo. Por defecto dibuja la caja de layout; `panel.setHighlightLayers()` lo cambia a cualquiera de las siete [capas de geometría de resaltado](/reference/devtools-inspect/#geometría-de-resaltado) — incluyendo `'hit'`, que muestrea la región de hit real de la entidad en lugar de su caja.
- **Lectura de estado + edición en línea** (`Info`): geometría, escala/rotación/opacidad, la matriz de transformación mundial completa, estado de animación, y cualquier salida `getDevtoolsDescriptor()` que la entidad publique. Añade editores en línea `x`/`y`/`opacity` y botones **Copy path** / **Copy JSON**.
- **Pestaña A11y**: el rol proyectado de la entidad seleccionada, nombre accesible y su fuente, índice de tab, posición en orden de lectura, caja canvas-vs-DOM — más los hallazgos de la [auditoría a11y](/reference/devtools-audit/#auditoría-a11y) de toda la escena.
- **Edición por teclado**: con una entidad seleccionada, las teclas de flecha la mueven 1px (Shift: 10px); `+`/`-` ajustan la opacidad en 0.1. Útil para confirmar _qué_ entidad tiene un bug de layout antes de tocar el código.
- **HUD de rendimiento**: una tira inferior lee [`Scene.frameStats`](/reference/core-scene) — fps, ms/fotograma, cuenta de entidades, modo de renderizado y conteo de fotogramas renderizados/omitidos. Los fps son la cadencia real de _fotogramas renderizados_, por lo que una escena `onDemand` inactiva o con auto-throttle dice honestamente ~2fps en lugar de un falso 60. Desactivar con `showPerf: false`.
- **Ajustes** (`⚙`): alternar el resaltado de selección, y cambiar el intervalo de actualización y el lado de anclaje (izquierda/derecha) en vivo.

El panel se reflow al redimensionar la ventana, así que la tira de rendimiento inferior se mantiene en pantalla a cualquier altura de viewport o nivel de zoom. El dock y su canvas usan `pointer-events: none`; solo sus controles interactivos proyectados vuelven a optar — así el inspector nunca roba la entrada de controles anfitriones bajo píxeles vacíos del dock, mientras que sus propias filas, pestañas, entradas y botones siguen siendo clicables.

---

## API

```typescript
function attachDevtools(
  scene: Scene,
  options?: DevtoolsOptions,
): DevtoolsPanel & { detach(): void };

interface DevtoolsOptions {
  width?: number; // ancho del panel en px, por defecto 360
  refreshInterval?: number; // ms; 0 desactiva la actualización automática. Por defecto 500
  traceEvents?: boolean; // muestra registros de enrutamiento de puntero/rueda/teclado limitados
  traceCapacity?: number; // registros de traza retenidos, por defecto 50
  dockSide?: 'right' | 'left'; // por defecto 'right'
  showPerf?: boolean; // tira HUD de rendimiento en vivo, por defecto true
  defaultTab?: string; // 'tree' | 'inspect' | 'audit' | 'a11y' | 'events' | 'settings'
}

class DevtoolsPanel {
  refresh(force?: boolean): void; // reconstruye el modelo de árbol desde la escena anfitriona
  armPick(): void; // de un solo uso: el siguiente clic en la página selecciona la entidad bajo él
  select(entity: Entity): void; // selecciona programáticamente
  get selection(): Entity | null;
  get trace(): EventTrace | null; // null a menos que traceEvents estuviera habilitado
  setFilter(text: string): void; // filtra el árbol por subcadena tipo/id
  setHighlightEnabled(on: boolean): void;
  setHighlightLayers(kinds: ReadonlyArray<HighlightLayerKind>, hitSampleStep?: number): void;
  getHighlightLayers(): ReadonlyArray<HighlightLayer>; // capas del último dibujo
  setRefreshInterval(ms: number): void;
  setDockSide(side: 'right' | 'left'): void;
  audit(): AuditFinding[]; // ejecuta la auditoría de layout; también llena la pestaña Audit
  selectFinding(i: number): void; // selecciona + resalta la entidad detrás del hallazgo i
  getPluginFindings(): ReadonlyArray<PluginFinding>; // hallazgos de auditorías de plugin
  getPluginRows(inspectorId: string): PluginRow[]; // filas actuales de una pestaña de plugin
  runCommand(qualifiedId: string): unknown; // ejecuta un `<pluginId>/<commandId>`
  destroy(): void; // destruye listeners, temporizadores, resaltado anfitrión y el panel de escena
}
```

`detach()` (devuelto por `attachDevtools`) es un alias para `destroy()`.

`refresh(force)` salta la reconstrucción cuando `scene.structureVersion` no ha cambiado, por lo que llamarlo en un intervalo ajustado es barato; pasa `true` para reconstruir incondicionalmente. Independientemente de esa comprobación, el panel se reconcilia cada 3s para que un bump de estructura perdido no deje el árbol obsoleto indefinidamente.

`getPluginRows` devuelve `[]` para un ID de inspector desconocido, sin nada seleccionado, o cuando el `appliesTo` del inspector rechaza la selección — los tres casos no se distinguen. `runCommand` **lanza** en un ID de comando desconocido en lugar de no hacer nada.

---

## Notas de diseño

- La escena del panel se construye con `contentProjection: false` y `renderMode: 'onDemand'` — no debe proyectar su propio contenido DOM ni repintar cada fotograma mientras está inactivo.
- El estado de selección vive en el panel, no en el anfitrión: `select()`/`armPick()` nunca mutan la escena inspeccionada excepto por la entidad de resaltado de overlay, que se añade a través de `showOverlay()` y se elimina en `destroy()`.
- La actualización automática es un intervalo simple, no una animación de Scene — funciona incluso mientras la escena anfitriona está completamente inactiva (`onDemand`, nada sucio).
- El dock (`position: fixed`, altura completa del viewport) y su canvas son `pointer-events: none`, reflejando cómo el propio `a11yRoot` de la `Scene` principal se excluye mientras los elementos de sombra interactivos individuales se reincorporan mediante `auto`. Los clics sobre el fondo/cromo vacío del dock pasan a través hacia cualquier contenido anfitrión que esté debajo — incluyendo los controles del borde derecho de la propia aplicación anfitriona (botones de cierre de pestaña, botones de barra de herramientas) que de otro modo estarían en la banda del dock. Solo los controles a11y-proyectados del propio panel, a través de su propio `auto` opt-in, son independientemente clicables.

---

[Inspeccionar](/reference/devtools-inspect/) · [Auditar](/reference/devtools-audit/) · [Rendimiento](/reference/devtools-perf/) · [Puente y plugins](/reference/devtools-extend/)
