---
title: 'Primeros Pasos'
description: 'Instala VectoJS, crea un Scene y construye un panel de ajustes completo con Input, Toggle, Slider, Button y ScrollView.'
order: 7
---

# Primeros Pasos

Esta guía te lleva paso a paso por la instalación de VectoJS y la construcción de un panel de ajustes interactivo completo — un ejemplo realista que ejercita formularios, disposición, scroll y accesibilidad.

## Instalación

```bash
bun add @vectojs/core @vectojs/ui
```

VectoJS se divide en un runtime core y una biblioteca de componentes de alto nivel. La mayoría de las apps importan de ambos. `@vectojs/core` empaqueta y reexporta los motores independientes sobre los que se construye — `@vectojs/text`, `@vectojs/layout`, `@vectojs/math` y `@vectojs/animation` — así que esta instalación de dos paquetes es todo lo que necesitas; recurre a esos paquetes individualmente solo cuando quieras una superficie de dependencias más pequeña.

## Configuración del HTML

VectoJS necesita un elemento `<canvas>` con un padre posicionado:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My VectoJS App</title>
    <style>
      body {
        margin: 0;
        overflow: hidden;
        background: #0a0a0f;
      }
      #app {
        position: relative;
        width: 100vw;
        height: 100vh;
      }
      #canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
    </style>
  </head>
  <body>
    <div id="app">
      <canvas id="canvas"></canvas>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

El `<div id="app">` padre debe ser `position: relative` — VectoJS inserta su capa shadow de accesibilidad como un hermano posicionado de forma absoluta del canvas. El `Scene` lo impone automáticamente, pero establecerlo explícitamente evita saltos visuales.

## Creando el Scene

```typescript
// src/main.ts
import { Scene } from '@vectojs/core';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, {
  maxFPS: 60,
  pointBackend: 'canvas', // 'webgl' for large point clouds
});

scene.start();
```

> [!NOTE]
> El constructor es `new Scene(canvas: HTMLCanvasElement, options?)`. Toma un elemento DOM, no una cadena `{ canvasId }`.

## Pruébalo en vivo

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">en vivo · @vectojs/core</span></div>
  <iframe src="/sandbox/getting-started.html" class="sandbox-frame" loading="lazy" title="Getting Started interactive example" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Counter + Toggle + Slider — todos ejecutándose en canvas sin componentes DOM. Haz clic e interactúa.</figcaption>
</figure>

## Tu primer componente

Añade un `Toggle` para verificar que todo está conectado:

```typescript
import { Toggle } from '@vectojs/ui';

const toggle = new Toggle({
  label: 'Dark mode',
  checked: true,
  onChange: (checked) => console.log('dark mode:', checked),
});

toggle.setPosition(40, 40);
scene.add(toggle);
```

Abre el navegador e inspecciona el DOM — encontrarás un `<div role="switch" aria-checked="true" aria-label="Dark mode">` real por encima del canvas. Una prueba de Playwright que llame a `page.getByRole('switch', { name: 'Dark mode' }).click()` funcionará.

---

## Construyendo un panel de ajustes

Construyamos algo más completo: un panel de ajustes con scroll con una entrada de texto, toggles, un slider y un botón de envío. Todo el estado vive en un objeto plano; los componentes lo leen y escriben en él.

```typescript
import { Scene } from '@vectojs/core';
import { Stack, Card, Text, Input, Toggle, Slider, Button, ScrollView } from '@vectojs/ui';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  username: '',
  notifications: true,
  highPerformance: false,
  particleCount: 5000,
};

// ── Helper: section heading ───────────────────────────────────────────────────
function heading(text: string): Text {
  return new Text(text, { font: '600 13px Inter', color: '#64748b' });
}

// ── Username field ────────────────────────────────────────────────────────────
const usernameLabel = heading('USERNAME');

const usernameInput = new Input({
  width: 320,
  height: 40,
  placeholder: 'your-username',
  value: state.username,
  font: '16px Inter',
  onChange: (value) => {
    state.username = value;
  },
});

// ── Toggle: notifications ─────────────────────────────────────────────────────
const notifLabel = heading('NOTIFICATIONS');

const notifToggle = new Toggle({
  label: 'Email notifications',
  checked: state.notifications,
  accent: '#6366f1',
  onChange: (checked) => {
    state.notifications = checked;
  },
});

// ── Toggle: high performance ──────────────────────────────────────────────────
const perfToggle = new Toggle({
  label: 'High-performance mode',
  checked: state.highPerformance,
  accent: '#6366f1',
  onChange: (checked) => {
    state.highPerformance = checked;
  },
});

// ── Slider: particle count ────────────────────────────────────────────────────
const particleLabel = heading('MAX PARTICLES');

const particleCountDisplay = new Text(`${state.particleCount.toLocaleString()}`, {
  font: '600 14px Inter',
  color: '#00f0ff',
});

const particleSlider = new Slider({
  min: 1000,
  max: 50000,
  value: state.particleCount,
  width: 280,
  progressColor: '#6366f1',
});

particleSlider.on('change', (e) => {
  state.particleCount = e.value;
  particleCountDisplay.setText(e.value.toLocaleString());
});

// Lay out label + display side by side
const particleRow = new Stack({
  direction: 'horizontal',
  gap: 12,
  align: 'center',
});
particleRow.add(particleLabel);
particleRow.add(particleCountDisplay);

// ── Save button ───────────────────────────────────────────────────────────────
const saveBtn = new Button('Save settings', {
  bg: '#6366f1',
  hoverBg: '#818cf8',
  padding: 14,
  onClick: () => {
    console.log('Saved:', state);
    saveBtn.animate({ scaleX: 0.95, scaleY: 0.95 }, 80).animate({ scaleX: 1, scaleY: 1 }, 80);
  },
});

// ── Main layout stack ─────────────────────────────────────────────────────────
const content = new Stack({ direction: 'vertical', gap: 20 });
content.add(usernameLabel);
content.add(usernameInput);
content.add(notifLabel);
content.add(notifToggle);
content.add(perfToggle);
content.add(particleRow);
content.add(particleSlider);
content.add(saveBtn);

// ── Scrollable card ───────────────────────────────────────────────────────────
const PANEL_W = 400;
const PANEL_H = 480;
const PADDING = 24;

const scroll = new ScrollView({
  width: PANEL_W - PADDING * 2,
  height: PANEL_H - PADDING * 2,
});
content.setPosition(0, 0);
scroll.add(content);

const card = new Card({
  width: PANEL_W,
  height: PANEL_H,
  radius: 16,
  border: 'rgba(255,255,255,0.08)',
  label: 'Settings panel', // makes the card a role="group" landmark
});

const titleText = new Text('Settings', {
  font: '700 22px Inter',
  color: '#f8fafc',
});
titleText.setPosition(PADDING, PADDING);
card.add(titleText);

scroll.setPosition(PADDING, PADDING + 40);
card.add(scroll);

// Centre the card on screen
const cx = (window.innerWidth - PANEL_W) / 2;
const cy = (window.innerHeight - PANEL_H) / 2;
card.setPosition(cx, cy);
scene.add(card);

scene.start();

// ── Responsive resize ─────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
  card.setPosition((window.innerWidth - PANEL_W) / 2, (window.innerHeight - PANEL_H) / 2);
});
```

### Qué obtienes

- **`Stack`** posiciona los hijos verticalmente con un espacio de 20 px — sin aritmética manual de `x`/`y`.
- **`ScrollView`** recorta y desplaza el contenido cuando desborda la altura del panel.
- **`Card`** dibuja el fondo de rectángulo redondeado; con `label` establecido, proyecta un landmark `role="group"` para que los lectores de pantalla anuncien la región.
- **`Input`** está respaldado por un elemento shadow `<input>` real — IME, portapapeles, deshacer y autocompletado funcionan todos.
- **`Button`** se autodimensiona a la etiqueta y dispara `onClick` tanto desde los clics en canvas como desde el `<button>` shadow.
- Todos los componentes se conectan directamente a tu objeto `state`.

---

## Integración con frameworks

VectoJS se monta sobre un `<canvas>`, por lo que se integra con cualquier framework de la misma manera que lo hace una biblioteca de WebGL.

### React

```typescript
import { useEffect, useRef } from 'react';
import { Scene } from '@vectojs/core';
import { Button } from '@vectojs/ui';

export function VectoCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const scene = new Scene(ref.current!, { maxFPS: 60 });
    const btn = new Button('Click me');
    btn.setPosition(40, 40);
    scene.add(btn);
    scene.start();

    return () => scene.destroy();
  }, []);

  return <canvas ref={ref} style={{ width: '100%', height: '100%' }} />;
}
```

### Vue 3

```typescript
<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { Scene } from '@vectojs/core';

const canvasRef = ref(null);
let scene;

onMounted(() => {
  scene = new Scene(canvasRef.value, { maxFPS: 60 });
  scene.start();
});

onUnmounted(() => scene?.destroy());
</script>

<template>
  <canvas ref="canvasRef" style="width:100%;height:100%" />
</template>
```

---

## Desafíos

### Añade un contador

Extiende el panel de ajustes para que registre cuántas veces se ha hecho clic en el botón Save y muestre el total acumulado junto al botón.

- Añade una variable `clickCount` inicializada en `0` en el objeto de estado.
- Crea una entidad `Text` que muestre `'Saved 0 times'` y posiciónala al lado de `saveBtn` usando un `Stack` horizontal.
- Actualiza el texto en cada clic usando `entity.setText(...)` y verifica que el conteo se incrementa correctamente tras cada pulsación.

### Disposición responsiva

Haz que el panel se reajuste con elegancia cuando el viewport sea más estrecho que 480 px. La tarjeta nunca debe desbordar los bordes de la ventana.

- En el manejador del evento `resize`, compara `window.innerWidth` con `PANEL_W` y calcula un ancho de panel acotado que reste un margen mínimo de 16 px a cada lado.
- Actualiza `card.width`, el ancho del `ScrollView` y el ancho de `usernameInput` para que coincidan con el nuevo ancho del panel en cada redimensionamiento.
- Prueba redimensionando la ventana del navegador a 320 px de ancho y confirmando que todo el contenido permanece visible y que nada se recorta fuera del límite de la tarjeta.

### Cambio de tema

Añade un interruptor de tema oscuro/claro a la cabecera del panel que actualice al instante el estilo visual de todos los componentes.

- Define dos objetos de tema — uno oscuro (colores actuales) y uno claro — cada uno especificando valores para el color del borde de la tarjeta, el color del texto de los encabezados, el color del texto de las etiquetas y el fondo del botón.
- Añade un `Toggle` con la etiqueta `'Light mode'` por encima del `ScrollView` y conecta su evento `change` para aplicar los valores de color del tema activo a cada entidad relevante.
- Asegúrate de que tanto la propiedad `border` de la tarjeta como el color de `titleText` se actualicen cuando cambie el tema, y llama a `scene.markDirty()` tras cada actualización de propiedad para que el canvas se repinte.

## Próximos pasos

- [Core Scene](/learn/core-scene/) — el bucle de renderizado, el sistema de transformaciones y la limitación por inactividad en profundidad.
- [Entidades Personalizadas](/learn/custom-entity/) — construye tus propios componentes de canvas.
- [Eventos y Hit-Testing](/learn/events/) — cómo fluyen los eventos de puntero y teclado a través del árbol.
- [Referencia de la API Core](/reference/core-api/) — las firmas completas de `Scene`, `Entity` e `IRenderer`.
