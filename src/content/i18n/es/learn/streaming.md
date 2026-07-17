---
title: 'Streaming y texto en tiempo real'
description: 'Creación de UIs de chat, visores de logs y paneles en vivo: coalescencia de fragmentos por fotograma, las APIs de append, interacción con el throttle de inactividad y estrategia para transcripciones largas.'
order: 18
---

# Streaming y texto en tiempo real

Los flujos de tokens (chat LLM), las colas de logs y las fuentes de datos en vivo son donde el código ingenuo de VectoJS
más a menudo se despeña. El motor te proporciona primitivas rápidas —
`Text.append()`, `Markdown.appendMarkdown()`, memoización de diseño a nivel de párrafo,
análisis de Markdown fuera del hilo — pero conectarlas por token en lugar de por fotograma
desperdicia la mayor parte de esa ventaja. Esta página es la receta integral.

## La regla de oro: agrupar por fotograma, no por token

Un flujo entrega tokens mucho más rápido de lo que la pantalla se refresca. Cada
llamada a `append()`/`appendMarkdown()` paga un pase de diseño, y todo diseño entre
dos fotogramas renderizados excepto el último es **trabajo invisible**. La solución son cuatro
líneas: almacenar los tokens en búfer a medida que llegan, vaciarlos una vez por fotograma de animación.

```typescript
let pending = '';
let scheduled = false;

function pushToken(token: string) {
  pending += token;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const chunk = pending;
    pending = '';
    markdown.appendMarkdown(chunk); // UN diseño para todos los tokens del fotograma
    transcript.scrollToBottom();
  });
}

for await (const token of llmStream) pushToken(token);
```

Con un flujo de 200 tokens/s a 60 fps esto convierte ~200 pases de diseño por segundo
en ~60 — y bajo carga se degrada con gracia: cuanto más ocupado esté el hilo principal,
más grandes (y _más raros_) serán los fragmentos vaciados. El patrón es
autorregulado; un `setInterval` fijo no lo es.

> [!NOTE]
> `scene.markDirty()` ya se combina naturalmente — tres appends en un fotograma
> establecen una bandera y cuestan un repintado. La parte costosa de un append es el
> **diseño**, no la bandera de suciedad, por lo que la agrupación debe envolver
> al propio append.

## Elegir la API de append

| Contenido                   | API                                    | Coste por llamada                                                                                                                             |
| --------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Texto plano                 | `text.append(chunk)`                   | Pase en frío, pero el memo de párrafo reusa cada párrafo terminado en `\n`                                                                    |
| Tramos con estilo           | `richText.appendSpans(spans)`          | Añade spans; las medidas de spans anteriores se reutilizan                                                                                    |
| Markdown                    | `markdown.appendMarkdown(chunk)`       | Re-lexea la fuente original (fuera del hilo cuando existe `Worker`), reusa entidades de bloque terminadas, extiende el último párrafo in situ |
| Cualquier cosa, reemplazado | `setText` / `setContent` (anti-patrón) | Reconstrucción completa — nunca llamar con un documento creciente por token                                                                   |

Dos costes se esconden dentro de `appendMarkdown` que deberías conocer:

1. **El lexado es O(documento), no O(fragmento).** Cada llamada re-tokeniza toda la
   fuente acumulada. El análisis se ejecuta en un Worker en segundo plano cuando está disponible
   (con fallback a lexado síncrono en entornos sin `Worker`), y las
   actualizaciones de entidades reutilizan todo bloque terminado — pero una transcripción de 100k caracteres
   sigue pagando un lex de 100k caracteres por vaciado. La agrupación por fotograma divide eso
   por el factor tokens-por-fotograma; la segmentación de transcripciones (más abajo) lo limita.

2. **La memoización de párrafos se basa en `\n`.** Tanto `Text.append` como el actualizador
   de párrafos de Markdown solo re-miden el párrafo que cambió. Una línea
   interminable sin saltos anula el memo y degrada a medición O(documento) por
   vaciado. La salida LLM tiene saltos de párrafo naturales; las líneas de log terminan en `\n` —
   normalmente lo obtienes gratis, pero no elimines los saltos de línea.

## Modo de renderizado y el throttle de inactividad

Las UIs de streaming deberían usar `renderMode: 'onDemand'`:

```typescript
const scene = new Scene(canvas, { renderMode: 'onDemand' });
```

Cada append marca la escena como sucia, así que los fotogramas se renderizan exactamente mientras el contenido
fluye y se detienen en cuanto el flujo se inactiva — sin sorpresas de throttle automático a 2 fps
y sin consumo de batería en inactividad entre respuestas. Las APIs de append y los
contenedores de desplazamiento incorporados informan de su movimiento en curso (`hasPendingAnimations()`),
por lo que el desplazamiento suave hasta el fondo sigue animando después de que llegue el último token.

Si impulsas cualquier _movimiento personalizado_ por fotograma durante el flujo (un indicador
de escritura, un cursor pulsante) desde `update()`, recuerda el
[contrato de throttle de inactividad](/learn/performance/#the-idle-auto-throttle-the-hidden-pitfall):
sobrescribe `hasPendingAnimations()` o condúcelo con `animate()`/`springTo()`.

## Seguir el fondo

`ScrollView.scrollToBottom()` **salta** al final del contenido — deliberadamente
evita el resorte de desplazamiento, porque reorientar un resorte muchas veces por segundo
nunca le permite asentarse y el viewport tiembla en lugar de seguir el contenido
más nuevo. Llámalo dentro del mismo vaciado rAF que el append (como en la receta
anterior) para que el objetivo se calcule _después_ del nuevo diseño.

Para una UI de chat, sigue la intención del usuario: mantener el fondo solo mientras
ya estaban en el fondo. `content` es público y su `y` contiene la traslación
negativa de desplazamiento, por lo que "en el fondo" es:

```typescript
function nearBottom(sv: ScrollView, slack = 24): boolean {
  const maxScroll = Math.max(0, sv.content.height - sv.height);
  return -sv.content.y >= maxScroll - slack;
}

// En el vaciado: leer el anclaje ANTES de añadir, aplicar DESPUÉS.
const stick = nearBottom(transcript);
markdown.appendMarkdown(chunk);
if (stick) transcript.scrollToBottom();
```

El orden lectura-append-desplazamiento dentro de un mismo vaciado es la clave: medir
"estaba en el fondo" después del append siempre responde "no" una vez que el contenido ha crecido.

> [!NOTE]
> Las dos APIs de desplazamiento son deliberadamente asimétricas: `scrollTo(y)` reorienta el
> **resorte** de desplazamiento (por lo que `content.y` anima hacia allí en los siguientes fotogramas), mientras que
> `scrollToBottom()` **salta**. El estado derivado de la posición leído inmediatamente después de un
> `scrollTo` ve la posición anterior — léelo en el siguiente vaciado, como el patrón
> de anclaje anterior hace naturalmente.

## Transcripciones largas: segmentar, luego virtualizar

El coste de append y el coste de lexado crecen con el tamaño del documento, así que limita el documento.
Estrategia de dos niveles para UIs de chat/log:

1. **Segmentar por mensaje.** Una entidad `Markdown` por mensaje del asistente, no
   una para toda la conversación. La entidad en streaming es siempre pequeña (solo
   el mensaje en curso), por lo que el lexado por vaciado se mantiene económico independientemente de la
   longitud de la conversación. Los mensajes terminados nunca se re-lexean.
2. **Virtualizar el historial.** Una vez que los mensajes son entidades separadas, un
   [`VirtualList`](/reference/ui-virtuallist/) renderiza solo los visibles.
   Una transcripción de mil mensajes cuesta lo que muestra el viewport, no lo que la
   sesión ha acumulado.

```typescript
function startAssistantMessage(): Markdown {
  const md = new Markdown('', { maxWidth: 640 });
  messages.push(md); // tu fuente de datos de VirtualList
  return md; // transmitir SÓLO a esta entidad
}
```

Esto también limita la memoria: el diseño de un mensaje terminado es estático y descartable,
y desplazarse muy atrás nunca desencadena un re-diseño de la cola en vivo.

## Medir una UI de streaming

Síntomas y sus señales, en el orden en que revisarlos:

| Síntoma                                     | Sonda                                                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Tirones durante el streaming                | Cuenta appends por segundo vs. fotogramas por segundo — si appends ≫ fotogramas, te falta el lote rAF |
| Los tirones crecen con la transcripción     | Estás transmitiendo a una entidad que crece sin fin — segmenta por mensaje                            |
| Toda la UI se traba en párrafos largos      | No hay `\n` en el flujo — el memo de párrafo no puede dividir; revisa el formato de la fuente         |
| El desplazamiento lucha con el usuario      | `scrollToBottom()` incondicional — condiciona con el anclaje "estaba en el fondo"                     |
| CPU ocupada mientras el flujo está inactivo | Escena en modo `'always'`, o una animación personalizada sin `hasPendingAnimations()`                 |

Para números reales, usa el patrón de medición en página de
[Medir el rendimiento real](/learn/performance/#measuring-real-performance) —
el FPS headless no es representativo.

> **Siguiente:** [Rendimiento](/learn/performance/) para la caja de herramientas de optimización
> completa, y [`Markdown`](/reference/ui-markdown/) para la referencia de la API
> de streaming.
