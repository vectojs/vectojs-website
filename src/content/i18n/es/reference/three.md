---
title: '@vectojs/three'
description: 'Adaptadores de Three.js para VectoJS: renderiza paneles de UI 2D como texturas 3D (ThreeAdapter) o usa Three.js como backend de renderizado (ThreeRenderer).'
order: 41
---

# `@vectojs/three`

Dos exportaciones, dos casos de uso distintos:

| Exportación                                   | Caso de uso                                                                                                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`ThreeAdapter`](/reference/three-adapter/)   | Renderiza una `Scene` de VectoJS en un canvas propio o proporcionado por el llamante, la expone como un `THREE.CanvasTexture`, y conecta eventos de puntero mediante raycasting UV. El resto de tu escena Three.js no se toca. |
| [`ThreeRenderer`](/reference/three-renderer/) | Usa Three.js como backend de renderizado 2D para una `Scene` de VectoJS — rellenos, trazos y texto se convierten en mallas de Three.js en una escena ortográfica en lugar de llamadas de dibujo de Canvas 2D.                  |

`ThreeAdapter` es el camino común: tienes una escena 3D y quieres un panel de UI 2D flotando sobre una superficie — consulta su página para el constructor, el manejo de eventos WebXR/multi-touch y un ejemplo completo. `ThreeRenderer` es para proyectos que ya se comprometen con Three.js y quieren primitivas 2D aceleradas por hardware sin recurrir a Canvas 2D — consulta su página para los métodos implementados de `IRenderer` y la disposición del shader de gradientes.

---

## Instalación

```sh
bun add @vectojs/three three
```

Para proyectos TypeScript, agrega los tipos de Three.js:

```sh
bun add -d @types/three
```

---

## Solución de problemas

### El gradiente se renderiza como un color sólido en lugar de mezclarse

`stroke()` no soporta gradientes — siempre usa el primer color stop como color sólido. Usa `fill()` con un trazado cerrado si necesitas un efecto de contorno de forma pintado con gradiente.

También verifica que estás llamando a `createLinearGradient()` desde `ThreeRenderer` (devuelve un `WebGLGradient`) y no desde un `CanvasRenderingContext2D` — mezclar objetos de gradiente entre implementaciones produce comportamiento indefinido.

### El texto aparece borroso en pantallas de alta densidad (HiDPI)

**No** multipliques previamente las dimensiones del constructor por `window.devicePixelRatio` — el `CanvasRenderer` de `@vectojs/core` ya escala el backing store del canvas adaptador por DPR internamente (y la pre-multiplicación escalaría el búfer al doble mientras distorsiona tu espacio de layout lógico). El DPR a nivel de navegador se maneja por ti.

Si el texto del panel aún se ve suave, la causa es la proyección 3D, no el DPR: el área en pantalla del plano excede la resolución de la textura (cámara demasiado cerca, o malla escalada demasiado grande para el tamaño de la textura). Aumenta el `width`/`height` solicitado — esto eleva la resolución de la textura _y_ le da a la escena proporcionalmente más espacio de layout lógico:

```ts
// Textura más nítida: más píxeles lógicos + físicos para el mismo tamaño de malla en espacio mundial
const adapter = new ThreeAdapter({ width: 1024, height: 640 });
adapter.mesh.scale.set(3.2, 3.2 * (640 / 1024), 1); // tamaño mundial sin cambios; densidad duplicada
```

Ten en cuenta que las posiciones de las entidades y los tamaños de fuente se expresan en píxeles lógicos, por lo que duplicar las dimensiones del constructor sin ajustar el layout deja tu UI ocupando un cuarto del panel — escala las posiciones y tamaños junto con ello.

### Los eventos de puntero no tienen efecto en los componentes de VectoJS

`updateIntersection()` debe ser llamado en cada fotograma donde se deba procesar entrada — no es suficiente llamarlo solo en los listeners de eventos DOM, porque el raycaster necesita el estado actual de la cámara y la malla en el momento del evento. Confirma:

1. `updateIntersection()` se llama dentro de tu bucle de renderizado (o directamente en los manejadores de eventos de puntero con un raycaster recién configurado).
2. La cámara del raycaster coincide con la cámara utilizada para renderizar la escena.
3. `adapter.mesh` es parte del grafo de escena de Three.js cuando el rayo se lanza — las mallas huérfanas (no agregadas a la escena) no se intersectan.

## Relacionados

[`ThreeAdapter`](/reference/three-adapter/) · [`ThreeRenderer`](/reference/three-renderer/) ·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/)
