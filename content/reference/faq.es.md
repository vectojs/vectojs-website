+++
title = "Preguntas Frecuentes (FAQ)"
description = "Preguntas frecuentes sobre VectoJS — decisiones de arquitectura, rendimiento, accesibilidad y solución de problemas."
weight = 49

[extra]
order = 49
+++

# Preguntas Frecuentes

## Arquitectura

### ¿Por qué canvas en lugar del DOM?

El DOM proporciona estructura de documento semántica, diseño CSS y un modelo de accesibilidad maduro. Para cargas de trabajo dominadas por geometría personalizada o conjuntos visuales grandes y cambiantes, canvas puede evitar tener un nodo DOM con estilo por cada elemento dibujable y le da a la aplicación control directo sobre el diseño y el renderizado. También traslada la responsabilidad del diseño, las pruebas de impacto, la semántica y la medición de rendimiento al framework/aplicación.

### ¿Cómo funciona la accesibilidad si todo se dibuja en un canvas?

`Scene` mantiene una capa de proyección de accesibilidad (`a11yRoot`) con elementos `<button>`, `<input>`, `<a>` y `<div>` reales para las entidades interactivas elegibles. No es la API Shadow DOM del navegador. La capa sigue el desplazamiento/escalado CSS del canvas y la transformación afín de cada entidad, recibe eventos nativos de puntero/teclado/enfoque, y es visible para DevTools y la automatización basada en roles. Las aplicaciones aún necesitan roles, etiquetas, orden de enfoque, comportamiento de teclado y pruebas de lector de pantalla correctos.

Establece `entity.interactive = true` para proyectar un nodo sombra. Sobrescribe `getA11yAttributes()` para controlar la etiqueta y los atributos ARIA:

```typescript
getA11yAttributes() {
  return { tag: 'button', role: 'button', label: 'Enviar formulario' };
}
```

### ¿Hay una integración con React / Vue / Svelte?

Todavía no como paquetes oficiales. Dado que VectoJS posee un elemento `<canvas>`, se integra con cualquier framework exactamente como lo haría una biblioteca WebGL — monta el canvas, inicializa una `Scene` en un hook del ciclo de vida (`useEffect`, `onMounted`, etc.), y la destruye al desmontar.

```typescript
// Ejemplo con React
import { useEffect, useRef } from 'react';
import { Scene } from '@vectojs/core';

export function VectoCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const scene = new Scene(canvasRef.current!, { maxFPS: 60 });
    scene.start();
    return () => scene.destroy();
  }, []);
  return <canvas ref={canvasRef} />;
}
```

### ¿Se pueden unir dos Scenes sin problemas, como mosaicos?

No como una sola superficie lógica. Una `Scene` posee exactamente un `<canvas>` y un árbol `Entity` raíz — no hay API para que dos `Scene`s compartan un espacio de coordenadas, pasen entidades entre sí o hagan hit-testing a través del límite. Ejecutar dos instancias de `Scene` una al lado de la otra (dos canvases posicionados con CSS ordinario) funciona y puede verse sin problemas, pero permanecen funcionalmente independientes: bucles de renderizado separados, `renderMode`/seguimiento sucio separados, proyecciones de accesibilidad separadas. Si necesitas que las entidades interactúen, se transformen o hagan hit-testing entre sí, ponlas en el árbol de una sola `Scene` en lugar de intentar puentear dos.

---

## Rendimiento

### ¿Cuántas entidades puede manejar VectoJS a 60 fps?

No hay un recuento independiente del backend: la complejidad de las rutas, el texto, la relación de píxeles del dispositivo, la proyección de accesibilidad, el trabajo de actualización, la GPU/controlador y el porcentaje visible cambian todos el resultado. El benchmark headless verificado actualmente cubre entidades Canvas simples a 1.000 y 5.000 nodos; no es evidencia para afirmaciones de seis cifras con WebGL/WebGPU. Ejecuta el informe de demostración en el hardware objetivo y registra los percentiles de tiempo de fotograma para tu carga de trabajo.

### ¿Qué es la opción `pointBackend: 'webgl'`?

Cuando se establece, la `Scene` apila un canvas WebGL2 transparente sobre el canvas Canvas2D principal. Las entidades hoja representables que implementan `getBatchCircle()` / `getBatchRect()` se recogen en búferes tipados y se envían en dibujos WebGL agrupados, mientras que el texto, las imágenes, las formas complejas y las transformaciones afines no soportadas permanecen en Canvas2D. Mide el punto de cruce para tu hardware; el repositorio actualmente no contiene un factor de aceleración universal verificado.

### ¿Qué es `renderMode: 'onDemand'`?

En modo `'onDemand'`, la Scene solo dibuja cuando se llama a `scene.markDirty()` o un controlador de animación está en progreso. Los ticks estáticos aún programan rAF e inspeccionan el árbol en busca de movimiento pendiente, pero omiten el trabajo de actualización/renderizado de entidad y el envío a GPU. Úsalo para UIs mayormente estáticas — paneles, formularios, menús.

```typescript
scene.renderMode = 'onDemand';
entity.on('click', () => {
  entity.animate({ x: entity.x + 50 }, 300); // activa dirty automáticamente
});
```

### ¿Por qué mis FPS son bajos al probar en Node.js / sin interfaz gráfica?

Chrome sin interfaz gráfica a menudo usa un rasterizador por software y tiene un comportamiento de planificación/vsync diferente. Sus FPS son útiles para la comparación de regresiones en el mismo entorno, no como un límite inferior o una predicción para las GPU de los usuarios. Mide en el navegador y hardware objetivo.

> [!TIP]
> Usa el botón **Exportar informe** en la demostración Nexus para obtener una medición real de GPU con tu hardware y navegador actuales. Copia y pega esos números en tus PRs en lugar de FPS sin interfaz gráfica.

---

## La API de Entity

### ¿Qué es `clipChildren`?

Establecer `clipChildren = true` recorta los dibujos hijos normales a la caja `[0,0]–[width,height]` de la entidad. Así es como `ScrollView` implementa el desbordamiento. CanvasRenderer y SVGRenderer preservan el clip transformado. ThreeRenderer interseca rectángulos de tijera usando el AABB mundial transformado del clip, por lo que los clips rotados/inclinados son aproximaciones alineadas a los ejes. Las primitivas promovidas a la capa de puntos WebGL separada y la superposición de partículas WebGPU no se recortan por la pila de clips del renderizador padre.

### ¿Qué es `a11yFullViewport`?

Normalmente, un nodo DOM sombra solo se proyecta cuando `entity.interactive && entity.width > 0`. Para entidades que cubren todo el viewport de la Scene (un gráfico de canvas infinito, un reconocedor de gestos de pantalla completa) no hay una caja delimitadora significativa. Establecer `a11yFullViewport = true` crea un nodo sombra del tamaño de la Scene detrás de todos los demás nodos sombra; la raíz de proyección entonces mapea esa caja lógica sobre la caja CSS del canvas.

### Mi animación en `Entity.update()` es el doble de rápida de lo esperado — ¿por qué?

> [!CAUTION] > `Entity.update(dt, time)` recibe **dt en milisegundos**, no en segundos. Este es el error más común en VectoJS. `dt` a 60 fps ≈ 16.7, no 0.017.

Un error común al migrar desde bibliotecas de física que usan segundos:

```typescript
// Incorrecto: trata ms como segundos → 1000× más rápido
this.x += velocity * dt;

// Correcto: convierte a segundos, o usa unidades de ms
this.x += velocity * (dt / 1000);
```

La física de resortes (`SpringPhysics`, `ScrollView`) internamente usan `dt / 1000` para convertir antes de ejecutar sus simulaciones.

### ¿Cuál es la diferencia entre `emit()` y `dispatchEvent()`?

- `entity.emit(event, payload)` — dispara solo los listeners de la **fase de burbuja** de la propia entidad. Sin recorrido de árbol. Esta es una ruta interna de componentes (ej., un control de formulario emitiendo su propio `change`).
- `entity.dispatchEvent(event)` — ejecuta el recorrido completo de **captura + burbuja** similar al DOM: la captura va raíz → objetivo, la burbuja va objetivo → raíz. Así es como `Scene` despacha eventos de puntero.

---

## Personalización y Animación

### ¿Hasta dónde llega la personalización de VectoJS? ¿Puede hacer efectos de pantalla de presentación o transición?

Sí. Cada propiedad animable (`x`, `y`, `scaleX`, `scaleY`, `rotation`, `opacity`) puede ser impulsada por un `TweenDriver` (basado en curvas, del conjunto `Easing` integrado o una función personalizada) o un `SpringDriver` (físico, con `stiffness`/`damping`/`mass` configurables). Para efectos con muchas partículas específicamente, `ComputeParticleEntity` con `particleBackend: 'webgpu'` ejecuta un shader de cómputo con una fuerza de resorte al origen, repulsión del ratón, limitación de velocidad, rebote de bordes y un parámetro de **fuerza de explosión** dedicado (`triggerExplosion(x, y, force)`) — un efecto de ráfaga/explosión es una primitiva de primera clase, no algo que tendrías que simular con tweens. El respaldo CPU (`updateCPU`) refleja el mismo modelo de fuerzas cuando WebGPU no está disponible.

### ¿Cómo se define la forma de una `Entity`? ¿Puede ser un pentágono, una elipse, un polígono irregular?

Sí, y la forma son realmente dos preocupaciones independientes y sobrescribibles:

- **Forma visual**: `render(renderer)` dibuja a través de las primitivas de ruta vectorial de `IRenderer` (`moveTo`, `lineTo`, `bezierCurveTo`, `arc`, `closePath`) — las mismas primitivas que usaría una ruta Canvas2D/SVG escrita a mano, por lo que cualquier polígono, elipse o contorno curvo es dibujable. `SplineEntity` es el ejemplo integrado: renderiza curvas polinómicas cúbicas arbitrarias convirtiéndolas a segmentos Bézier.
- **Forma de hit-test**: `isPointInside(globalX, globalY): boolean` es `abstract` en la clase base `Entity` — cada entidad concreta proporciona su propia lógica. Nada requiere (ni establece por defecto) una caja delimitadora alineada a los ejes; el `isPointInside` de un pentágono puede hacer matemática real de punto-en-polígono, una elipse puede hacer la comprobación de forma cuadrática, etc.

Debido a que las dos son métodos separados, la región cliqueable de una forma no tiene que coincidir exactamente con su silueta dibujada (útil para objetivos táctiles generosos en formas pequeñas).

### ¿El texto y los componentes se adaptan a diferentes dispositivos y niveles de zoom del navegador? ¿El redimensionamiento del texto es completamente adaptativo?

El mecanismo existe, pero es explícito en lugar de automático por defecto:

- **HiDPI**: `CanvasRenderer` lee `window.devicePixelRatio` en la construcción y en `resize()`, escalando el almacenamiento de respaldo del canvas en consecuencia — una pantalla Retina/HiDPI renderiza nítida sin código adicional de la aplicación.
- **Zoom del navegador**: la mayoría de los navegadores cambian el `devicePixelRatio` efectivo al hacer zoom y disparan un evento `resize` de `window`, que `Scene` ya escucha y al que responde llamando a `resize()` del renderizador.
- **Reflujo de texto**: `LayoutEngine.setMaxWidth()` está diseñado específicamente como una "ruta caliente" barata para esto — reutiliza el `PreparedText` ya medido y en caché del último pase frío `prepare()` y solo rehace el salto de línea, no la re-segmentación o re-medición. Llámalo desde tu propio manejador de redimensionamiento para refluir texto de forma barata a cualquier nuevo ancho.

Por lo tanto: las primitivas para un diseño adaptativo y de redimensionamiento barato existen y son usadas internamente por los componentes de UI, pero una `Entity` personalizada cruda no hace reflujo "gratis" — tú conectas tu manejador de redimensionamiento a la llamada `setMaxWidth`/layout correspondiente, de la misma manera que conectarías un redimensionamiento de canvas en cualquier renderizador de modo inmediato.

### ¿En qué se diferencia el modelo de animación de VectoJS de las animaciones CSS? ¿Se precalcula todo antes de renderizar?

No — nada se hornea en fotogramas clave por adelantado. `TweenDriver.tick(dtMs)` y `SpringDriver.tick(dtMs)` son integradores en tiempo real: cada fotograma, avanzan desde el tiempo _real_ transcurrido desde el último fotograma, no desde una línea de tiempo precomputada. `SpringPhysics` (el motor detrás de `SpringDriver`) hace integración Euler en vivo en subpasos fijos, con un límite de estabilidad para el `dt` grande que una pestaña en segundo plano puede entregar al regresar.

La diferencia práctica se nota cuando cambias el objetivo a mitad de la animación: `driver.retarget(to)` en un resorte mantiene el valor y la velocidad actuales y continúa integrando suavemente hacia el nuevo objetivo — sin salto, sin reinicio. Una transición/animación CSS cuyo objetivo cambia a mitad de vuelo típicamente se reinicia o salta, porque está interpolando a lo largo de una curva predeterminada en lugar de simular física fotograma a fotograma.

### ¿Cómo puedo desactivar las animaciones de resorte/inercia predeterminadas en los componentes, o cambiarlas a transiciones estándar?

Por defecto, los componentes desplazables de VectoJS (como `ScrollView` y `VirtualList`) y las propiedades usan física basada en resortes (`'spring'`) para transiciones suaves. Si quieres desactivar estas animaciones para un comportamiento más rápido e instantáneo, o cambiarlas a transiciones cúbic-bezier estándar (como `easeOutCubic`), tienes tres enfoques principales:

#### 1. Cambiar la Configuración de Transición en la Entity Objetivo

Cada `Entity` expone un método `setTransition`. Puedes sobrescribir la transición de resorte predeterminada llamando a `setTransition` en el elemento objetivo con una `duration` personalizada (en milisegundos) y función de `easing`, o desactivarla por completo:

```typescript
// Para cambiar a una transición rápida sin rebote (como easeOutCubic)
entity.setTransition({
  y: { duration: 120, easing: 'easeOutCubic' },
});

// Para desactivar las animaciones por completo (saltos instantáneos)
entity.setTransition({
  y: null, // limpia el controlador de transición
});
```

#### 2. Ajustar la Posición Instantáneamente Sin Activar el Resorte

Si quieres mover una entidad inmediatamente sin disparar ninguna transición configurada (evitando el resorte por completo), usa el método `setImmediate`:

```typescript
// Ajusta la posición al objetivo inmediatamente
entity.setImmediate('y', targetY);
```

#### 3. Evitar la Física de Canvas para el Desplazamiento Móvil

Para páginas de pantalla completa donde los usuarios móviles esperan un desplazamiento con impulso nativo en lugar de resortes simulados en Canvas, reenvía los gestos táctiles al viewport del navegador:

1. Vincula listeners táctiles al Canvas para convertir deltas de arrastre táctil en desplazamientos nativos de ventana:

   ```typescript
   let touchStartY = 0;
   canvas.addEventListener(
     'touchstart',
     (e) => {
       if (e.touches && e.touches[0]) touchStartY = e.touches[0].clientY;
     },
     { passive: true },
   );

   canvas.addEventListener(
     'touchmove',
     (e) => {
       if (e.touches && e.touches[0]) {
         const touchY = e.touches[0].clientY;
         window.scrollBy(0, touchStartY - touchY);
         touchStartY = touchY;
       }
     },
     { passive: true },
   );
   ```

2. Escucha el evento `"scroll"` de `window` y sincroniza la posición de desplazamiento con el contenedor de renderizado usando `setImmediate` o una transición easing rápida:

   ```typescript
   window.addEventListener('scroll', () => {
     mainScroll.y = -window.scrollY; // O mainScroll.setImmediate('y', -window.scrollY);
   });
   ```

---

## Componentes UI y Devtools

### ¿Qué proporcionan las herramientas de desarrollo y cómo ayudan con la depuración?

`@vectojs/devtools` es un inspector en página — un panel (él mismo renderizado con VectoJS) que te ofrece:

- Una vista de árbol en vivo del Virtual Math Tree, con insignias para tipo de entidad, geometría y animaciones activas
- Selección de entidades de un solo uso (haz clic en una entidad en el canvas para seleccionarla en el árbol)
- Una lectura de transformación mundial (posición, escala, rotación calculadas después de la cadena completa de ancestros)
- Edición por teclado de la entidad seleccionada
- Un resaltado de superposición en la página anfitriona que muestra los límites mundiales de la entidad seleccionada

`Scene` expone los accesores de solo lectura `rootEntity`/`overlayRootEntity` específicamente para que herramientas como esta puedan recorrer el árbol sin necesidad de acceso interno privilegiado.

### ¿Qué precauciones debo tener al usar los componentes UI nativos de VectoJS?

Algunos patrones que vale la pena conocer, extraídos directamente de la auditoría del conjunto de componentes:

- **La unicidad de `entity.id` es tu responsabilidad.** El motor no la impone. Importa sobre todo para la proyección de accesibilidad (la Scene indexa los nodos DOM sombra por id de entidad) y para cualquier código propio que indexe entidades por id (ej. `SpatialHashGrid`) — elige ids de la misma manera que elegirías claves en un `Map`.
- **Los componentes que adjuntan un listener a otra entidad deben ser destruidos con `destroy()`.** `Tooltip`, `Popover` y componentes similares que "se adjuntan a un objetivo" almacenan su manejador y lo eliminan en `destroy()` — llámalo siempre cuando termines con el componente, de la misma manera que eliminarías un listener añadido manualmente.
- **`interactive = true` no es gratuito.** Establecerlo proyecta un nodo DOM sombra real para esa entidad. Está bien para botones, enlaces y controles de formulario; evítalo en colecciones muy grandes de entidades hoja. `GridTextEntity`, por ejemplo, desactiva explícitamente `interactive` para toda su cuadrícula específicamente para evitar proyectar un nodo sombra por carácter a escala.
- **Los componentes personalizados basados en arrastre deben seguir el patrón de captura de puntero integrado.** `Slider` y compañía llaman a `setPointerCapture()` en `pointerdown` (a través de su elemento proyectado a11y), que es lo que permite que un arrastre rápido que sobrepasa los límites visuales del componente siga rastreando correctamente. Si construyes tu propio componente arrastrable, sigue el mismo patrón en lugar de confiar solo en `pointermove`/`pointerleave`. Maneja `pointercancel` como una ruta de reversión para que la interrupción del navegador no pueda dejar una transacción de arrastre o selección activa.

---

## Accesibilidad y Automatización

### ¿Cómo hago que un componente funcione con `page.getByRole()` de Playwright?

Devuelve la etiqueta y el rol correctos desde `getA11yAttributes()`:

```typescript
// Botón accesible
getA11yAttributes() { return { tag: 'button', role: 'button', label: 'Enviar' }; }

// Enlace accesible
getA11yAttributes() { return { tag: 'a', role: 'link', label: 'Inicio', href: '/' }; }

// Campo de texto accesible
getA11yAttributes() { return { tag: 'input', inputType: 'text', placeholder: 'Buscar…' }; }
```

Los componentes integrados (`Button`, `Input`, `Link`, etc.) hacen esto automáticamente.

### La posición del nodo sombra se ve incorrecta — las entidades están desplazadas

Dos causas comunes:

1. **El padre del canvas no tiene `position: relative`** — `Scene` aplica esto automáticamente en cada fotograma, pero si otra regla CSS fuerza `position: static` después de que la escena se inicia, los nodos sombra posicionados absolutamente se desplazarán en relación con el bloque contenedor incorrecto.
2. **`a11yOffsetX` / `a11yOffsetY`** — si antes estableciste estos como solución temporal, intenta eliminarlos primero para ver si el posicionamiento subyacente es realmente correcto.

Activa `debugA11y: true` en las `SceneOptions` para ver cajas de resaltado translúcidas sobre cada nodo sombra:

```typescript
const scene = new Scene(canvas, { debugA11y: true });
```

---

## Partículas WebGPU

### `ComputeParticleEntity` no muestra nada — ¿qué falla?

Las causas más comunes:

1. **No se llamó a `initRandomParticles()`** — sin inicializar los datos de partículas, todas las posiciones son `(0,0)` y los tamaños son `0`.
2. **WebGPU no está disponible** — la escena registra la solicitud WebGPU fallida y recurre a la ruta CPU/Canvas2D; asegúrate de que `particleBackend: 'webgpu'` esté establecido y tu navegador soporte WebGPU.
3. **El tamaño del canvas es `0×0`** — llama a `scene.resize(w, h)` (o asegúrate de que el canvas tenga dimensiones) antes del primer fotograma.

### ¿Cómo funciona el respaldo CPU?

Cuando WebGPU no está disponible (o falla), la `Scene` llama a `entity.updateCPU(dt, mouseX, mouseY, width, height)` cada fotograma renderizado y dibuja las partículas a través de `fillCircle`. El respaldo refleja el modelo de resorte/repulsión/explosión/velocidad/rebote, pero las rutas numéricas y el rendimiento CPU/GPU no están garantizados como idénticos. Elige los recuentos de partículas a partir de mediciones en los dispositivos objetivo.

### ¿Puedo leer las posiciones de las partículas desde la GPU?

No directamente — el estado de las partículas vive en un búfer de almacenamiento WebGPU. Para leerlo, necesitarías hacer un viaje de ida y vuelta `copyBufferToBuffer` + `mapAsync`, que detiene el pipeline de la GPU. En su lugar, mantén un `particleData` Float32Array del lado de la CPU sincronizado si necesitas posiciones en la CPU. `setOrigins()`, `setPositions()` y `setVelocities()` escriben en `particleData` y establecen `needsInit = true`, que sube al búfer de almacenamiento GPU en el siguiente fotograma.

> [!NOTE] > `mapAsync` + `copyBufferToBuffer` bloquea intencionalmente el pipeline. Para detección de colisiones o consultas espaciales a escala, ejecútalas en la ruta CPU usando `SpatialHashGrid`, o exprésalas como pases de cómputo WebGPU adicionales.

---

## Solución de Problemas

### La `Scene` se está ejecutando pero no aparece nada en pantalla

Verifica en orden:

1. ¿Se llamó a `scene.start()`?
2. ¿El canvas tiene atributos CSS y HTML `width` y `height` distintos de cero?
3. ¿La entidad se añadió a la escena mediante `scene.add(entity)` (no solo se construyó)?
4. ¿El método `render()` de la entidad realmente llama a `renderer.fill()` o `renderer.stroke()`? Un `render()` vacío no dibuja nada.
5. ¿`entity.opacity` es > 0?

### Mi evento de rueda de desplazamiento no llega al `ScrollView`

El `ScrollView` llama a `e.preventDefault()` en eventos `wheel` para evitar el desplazamiento de página. Si el listener de rueda del nodo sombra se dispara pero la vista de desplazamiento no reacciona, verifica que se haya usado `ScrollView.add(child)` (no `entity.add(child)` directamente, que omite el envoltorio de contenido), y que el padre del canvas no tenga `overflow: hidden` bloqueando los eventos de puntero.

### TypeScript reporta `Cannot find name 'GPUDevice'`

Añade `@webgpu/types` a tu proyecto:

```bash
bun add -d @webgpu/types
```

Luego añade a `tsconfig.json`:

```json
{ "compilerOptions": { "types": ["@webgpu/types"] } }
```
