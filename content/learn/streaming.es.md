+++
title = "Streaming y texto en tiempo real"
description = "Construcción de interfaces de chat, visores de registros y paneles en vivo: coalescencia de bloques por fotograma, API de adición, interacción con la aceleración inactiva y estrategia para transcripciones largas."
weight = 18

[extra]
order = 18
+++

# Streaming y texto en tiempo real

Los flujos de tokens (chat LLM), los registros en vivo (log tails) y las fuentes de datos en tiempo real son los casos en los que el código VectoJS ingenuo falla con más frecuencia. El motor ofrece primitivas rápidas — `Text.append()`, `Markdown.appendMarkdown()`, memoización del diseño a nivel de párrafo, análisis Markdown fuera del hilo principal — pero conectarlas token por token en lugar de fotograma por fotograma desperdicia casi todas esas ventajas. Esta página proporciona la receta completa de principio a fin.

## La regla de oro: confirmar por fotograma, no por token

Un flujo entrega tokens mucho más rápido de lo que se actualiza la pantalla. Cada llamada directa a `appendMarkdown()` puede desencadenar una pasada de análisis/diseño, y cada pasada entre dos fotogramas renderizados, excepto la última, es **trabajo invisible**. Usa el `StreamController` integrado en lugar de diseñar un segundo planificador:

```typescript
const stream = markdown.createStream();

try {
  for await (const token of llmStream) {
    await stream.write(token);
  }
  await stream.close(); // fuerza la confirmación final; no esperes otro fotograma
} catch (error) {
  stream.abort(error); // descarta el texto aceptado pero no confirmado
  throw error;
}
```

El modo predeterminado mantiene los fragmentos aceptados como cadenas separadas, para luego unirlos y confirmarlos como máximo una vez en el siguiente fotograma de animación. `write()` se resuelve cuando un fragmento entra en el búfer limitado, no cuando se vuelve visible, por lo que un productor asíncrono aún puede aportar varios tokens al mismo fotograma. Usa `await`: una vez que se llena el búfer de nivel alto de 64 KiB, una escritura esperará capacidad y cualquier escritura adicional será rechazada (reject) en lugar de crear una cola ilimitada.

Con un flujo de 200 tokens/s funcionando a 60 fps, esto reduce hasta ~200 pasadas de diseño por segundo a como máximo ~60. Bajo carga se degrada elegantemente: cuanto más ocupado esté el hilo principal, más grandes (y _raros_) serán los fragmentos confirmados. Un debounce fijo mediante `setInterval` hace exactamente lo contrario.

`appendMarkdown()` sigue siendo la vía de escape síncrona. Una llamada directa primero vacía todo el texto del controlador enviado previamente (incluida una escritura con presión de retroceso), y luego agrega su propio fragmento, por lo que el orden de las llamadas se mantiene exacto.

> [!NOTE]
> `scene.markDirty()` ya coalescen de forma natural: tres adiciones en un solo fotograma establecen una bandera y cuestan un solo repintado. La parte costosa es el análisis/diseño, razón por la cual el procesamiento por lotes debe envolver a `appendMarkdown()` en sí. `createStream()` hace precisamente eso; no crea otro analizador ni una ruta de reconciliación.

## Elección de la API de adición

| Contenido                   | API                                                     | Costo por confirmación                                                                            |
| --------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Texto sin formato           | `text.append(chunk)`                                    | Pasada en frío, pero la memoización de párrafos reutiliza todo párrafo terminado en `\n`          |
| Spans estilizados           | `richText.appendSpans(spans)`                           | Añade spans; las medidas de los spans previos se reutilizan                                       |
| Markdown, directo           | `markdown.appendMarkdown(chunk)`                        | API síncrona; una confirmación de adición por llamada                                             |
| Markdown, en flujo          | `await stream.write(chunk)` después de `createStream()` | Como máximo una confirmación de adición por fotograma de animación; presión de retroceso limitada |
| Cualquier cosa, reemplazada | `setText` / `setContent` (antipatrón de streaming)      | Reconstrucción completa — nunca la llames sobre un documento que crece token por token            |

`appendMarkdown` esconde internamente dos costos que debes conocer:

1. **El análisis léxico es O(documento), no O(fragmento).** Cada llamada vuelve a dividir en tokens toda la fuente acumulada. El análisis se ejecuta en un Worker en segundo plano cuando está disponible (volviendo al análisis léxico síncrono en entornos sin `Worker`), y la actualización de entidades reutiliza todos los bloques terminados — pero una transcripción de 100k caracteres aún paga un costo léxico de 100k caracteres por vaciado. El procesamiento por lotes por fotograma divide eso por el factor de tokens por fotograma; la segmentación de la transcripción (abajo) lo limita.

2. **La memoización de párrafos usa como clave `\n`.** Tanto `Text.append` como el actualizador de párrafos Markdown solo vuelven a medir el párrafo que cambió. Una línea continua interminable deshabilita la memoización y degrada la medición a O(documento) por vaciado. La salida LLM tiene saltos de párrafo naturales; las líneas de registro terminan en `\n` — por lo general lo obtienes gratis, pero no elimines los saltos de línea.

## Ritmo de máquina de escribir y ciclo de vida

El procesamiento por lotes para el rendimiento es el predeterminado. Agrega un ritmo de tiempo de reloj (pacing) fijo solo cuando el producto necesite una revelación tipo máquina de escribir:

```typescript
const stream = markdown.createStream({
  pacing: { graphemesPerSecond: 48 },
  maxBufferedChars: 64 * 1024,
  signal: requestAbort.signal,
});
```

El ritmo (pacing) nunca cambia a "un token por fotograma". Acumula un crédito de `graphemesPerSecond` a partir de las marcas de tiempo rAF, puede revelar varios grafemas en un solo fotograma y aún realiza como máximo una confirmación de adición. Un límite de marca de tiempo de 100 ms evita que una pestaña en segundo plano vuelque una gran ráfaga de contenido de recuperación a la vez.

El recorte utiliza `Intl.Segmenter`, incluso a través de los límites de fragmentos/fotogramas, por lo que las marcas combinatorias, las secuencias emoji ZWJ, las banderas y los pares sustitutos se mantienen unidos. Unicode permite que un solo grafema crezca sin límite; si una entrada maliciosa llena por completo la ventana delimitada (aceptada más bloqueada) sin alcanzar un límite, el controlador confirma un punto de código Unicode (nunca la mitad de un par sustituto) en lugar de bloquearse o aumentar la memoria de forma ilimitada.

- `flush()` confirma de forma síncrona el texto enviado y mantiene abierto el flujo.
- `close()` admite la escritura bloqueada, libera el final del grafema retenido, realiza una última confirmación ordenada y cierra el flujo.
- `abort(reason)` descarta el texto no confirmado. Las operaciones pendientes y futuras se rechazarán con la razón retenida.
- `Markdown.setContent()` anula el controlador activo antes del reemplazo.
- `Markdown.destroy()` anula el controlador y elimina los oyentes rAF/`AbortSignal`.
- Un `Markdown` posee como máximo un controlador abierto; los controladores terminados se desregistran para que un flujo posterior pueda comenzar.

## Modo de renderizado y aceleración inactiva

Las interfaces de streaming deben ejecutarse con `renderMode: 'onDemand'`:

```typescript
const scene = new Scene(canvas, { renderMode: 'onDemand' });
```

Cada adición marca la escena como sucia, por lo que los fotogramas se renderizan exactamente mientras el contenido fluye y se detienen en el momento en que el flujo queda inactivo: no hay sorpresas de aceleración automática a 2 fps ni consumo innecesario de batería entre respuestas. Las API de adición y los contenedores de desplazamiento integrados informan todos sobre sus animaciones en curso (`hasPendingAnimations()`), de modo que un desplazamiento suave hacia abajo continúa animándose después de que aterriza el último token.

Si controlas cualquier movimiento _personalizado_ por fotograma durante el flujo (un indicador de escritura, un cursor parpadeante) desde `update()`, recuerda el [contrato de la aceleración automática inactiva](/learn/performance/#la-limitación-automática-por-inactividad-la-trampa-oculta): anula `hasPendingAnimations()` o contrólalo con `animate()`/`springTo()`.

## Seguir el fondo (desplazamiento)

`ScrollView.scrollToBottom()` realiza un **ajuste (snap)** hasta el final del contenido — omitiendo deliberadamente el resorte de desplazamiento, porque reorientar un resorte muchas veces por segundo nunca le permite estabilizarse y la ventana tiembla en lugar de rastrear el contenido más nuevo. `Markdown.onLayoutUpdated` se ejecuta después de cada confirmación del flujo, cuando la nueva altura está disponible:

```typescript
let stickToBottom = true;

function nearBottom(sv: ScrollView, slack = 24): boolean {
  const maxScroll = Math.max(0, sv.content.height - sv.height);
  return -sv.content.y >= maxScroll - slack;
}

markdown.onLayoutUpdated = () => {
  if (stickToBottom) transcript.scrollToBottom();
};

for await (const token of llmStream) {
  // Leer la intención antes de que la confirmación cambie la altura del contenido.
  stickToBottom = nearBottom(transcript);
  await stream.write(token);
}
await stream.close();
```

También establece `stickToBottom = false` desde el manejo del desplazamiento de usuario de la aplicación; de lo contrario, un usuario que se desplaza durante el fotograma pendiente final puede ser arrastrado hacia atrás por una intención obsoleta. El orden es el invariante: lee "estaba en el fondo" antes de que el contenido crezca, y ajusta (snap) solo después de `onLayoutUpdated`.

> [!NOTE]
> `scrollTo(y)` reorienta el **resorte** de desplazamiento, mientras que `scrollToBottom()` **ajusta (snaps)**. Un estado derivado de la posición leído inmediatamente después de `scrollTo` todavía ve la antigua posición — léelo en una confirmación/fotograma posterior.

## Transcripciones largas: segmentar y luego virtualizar

El costo de adición y el costo léxico crecen con el tamaño del documento, por lo tanto, limita el documento. Estrategia de dos niveles para interfaces de chat/registros:

1. **Segmentar por mensaje.** Una entidad `Markdown` por mensaje de asistente, no una para toda la conversación. La entidad del flujo siempre es pequeña (solo el mensaje en vuelo), por lo que el análisis léxico por vaciado se mantiene económico independientemente de la duración de la conversación. Los mensajes terminados nunca se vuelven a analizar.
2. **Virtualizar el historial.** Una vez que los mensajes son entidades separadas, una [`VirtualList`](/reference/ui-virtuallist/) renderiza solo aquellos que son visibles. Una transcripción de mil mensajes cuesta lo que muestra la ventana gráfica, no lo que acumuló la sesión.

```typescript
function startAssistantMessage(): Markdown {
  const md = new Markdown('', { maxWidth: 640 });
  messages.push(md); // tu fuente de datos VirtualList
  return md; // stream solo en ESTA entidad
}
```

Esto también limita la memoria: el diseño estático de un mensaje terminado se puede descartar (cull), y desplazarse muy atrás nunca desencadena el rediseño de la cola en vivo.

## Medir una interfaz de streaming

Síntomas y sus señales, en el orden de comprobación:

| Síntoma                                                | Sonda                                                                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Saltos o tirones al transmitir                         | DevTools `Streaming/appends` supera los fotogramas renderizados — usa un `createStream()` por mensaje en vivo                      |
| `write()` es rechazado bajo carga                      | Una segunda escritura llegó mientras una sufría presión de retroceso — usa `await` en cada escritura                               |
| Los tirones crecen con la longitud de la transcripción | Estás transmitiendo en una entidad en constante crecimiento — segmenta por mensaje                                                 |
| Toda la IU se bloquea en párrafos largos               | No hay `\n` en el flujo — la memoización del párrafo no puede dividirse; revisa el formato de la fuente                            |
| El desplazamiento lucha contra el usuario              | `scrollToBottom()` incondicional — limita a través de la adherencia "estaba en el fondo"                                           |
| CPU ocupada mientras el flujo está inactivo            | Escena dejada en modo `'always'`, o una animación personalizada sin `hasPendingAnimations()`; el rAF del controlador está inactivo |

Para obtener números reales, utiliza el patrón de medición en la página de [Medir el rendimiento real](/learn/performance/#medir-el-rendimiento-real) — los FPS en modo headless no son representativos.

> **A continuación:** [Rendimiento](/learn/performance/) para ver la caja de herramientas de optimización completa, y [`Markdown`](/reference/ui-markdown/) para la referencia de la API de streaming.
