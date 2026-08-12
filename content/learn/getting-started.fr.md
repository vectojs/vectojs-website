+++
title = "Prise en main"
description = "Installez VectoJS, créez une Scene et construisez un panneau de réglages complet avec Input, Toggle, Slider, Button et ScrollView."
weight = 7
+++

# Prise en main

Ce guide vous accompagne dans l'installation de VectoJS et la construction d'un panneau de réglages interactif complet — un exemple réaliste qui met à l'épreuve les formulaires, la mise en page, le défilement et l'accessibilité.

## Installation

```bash
bun add @vectojs/core @vectojs/ui
```

VectoJS est divisé en un runtime de base et une bibliothèque de composants de haut niveau. La plupart des applications importent des deux. `@vectojs/core` regroupe et re-exporte les moteurs autonomes sur lesquels il repose — `@vectojs/text`, `@vectojs/layout`, `@vectojs/math` et `@vectojs/animation` — donc cette installation en deux paquets suffit ; n'utilisez ces paquets individuellement que lorsque vous voulez une surface de dépendances plus réduite.

## Configuration HTML

VectoJS a besoin d'un élément `<canvas>` avec un parent positionné :

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

Le parent `<div id="app">` doit être en `position: relative` — VectoJS insère sa couche fantôme d'accessibilité comme un frère positionné en absolu du canvas. La `Scene` l'impose automatiquement, mais le définir explicitement évite les sauts visuels.

## Création de la Scene

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
> Le constructeur est `new Scene(canvas: HTMLCanvasElement, options?)`. Il prend un élément DOM, pas une chaîne `{ canvasId }`.

## Essayez-le en direct

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · @vectojs/core</span></div>
  <iframe src="/sandbox/getting-started.html" class="sandbox-frame" loading="lazy" title="Getting Started interactive example" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Compteur + Toggle + Slider — tous fonctionnant sur canvas sans composants DOM. Cliquez et interagissez.</figcaption>
</figure>

## Votre premier composant

Ajoutez un `Toggle` pour vérifier que tout est bien câblé :

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

Ouvrez le navigateur et inspectez le DOM — vous trouverez un vrai `<div role="switch" aria-checked="true" aria-label="Dark mode">` au-dessus du canvas. Un test Playwright appelant `page.getByRole('switch', { name: 'Dark mode' }).click()` fonctionnera.

---

## Construction d'un panneau de réglages

Construisons quelque chose de plus complet : un panneau de réglages défilable avec un champ de saisie de texte, des interrupteurs, un curseur et un bouton d'envoi. Tout l'état vit dans un objet simple ; les composants y lisent et y écrivent.

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
const particleRow = new Stack({ direction: 'horizontal', gap: 12, align: 'center' });
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

const scroll = new ScrollView({ width: PANEL_W - PADDING * 2, height: PANEL_H - PADDING * 2 });
content.setPosition(0, 0);
scroll.add(content);

const card = new Card({
  width: PANEL_W,
  height: PANEL_H,
  radius: 16,
  border: 'rgba(255,255,255,0.08)',
  label: 'Settings panel', // makes the card a role="group" landmark
});

const titleText = new Text('Settings', { font: '700 22px Inter', color: '#f8fafc' });
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

### Ce que vous obtenez

- **`Stack`** positionne les enfants verticalement avec un espace de 20 px — aucune arithmétique `x`/`y` manuelle.
- **`ScrollView`** rogne et fait défiler le contenu lorsqu'il déborde de la hauteur du panneau.
- **`Card`** dessine l'arrière-plan à rectangle arrondi ; avec `label` défini, elle projette un repère `role="group"` afin que les lecteurs d'écran annoncent la région.
- **`Input`** est adossé à un vrai élément fantôme `<input>` — IME, presse-papiers, annulation et remplissage automatique fonctionnent tous.
- **`Button`** se dimensionne automatiquement au libellé et déclenche `onClick` à la fois depuis les clics canvas et le `<button>` fantôme.
- Tous les composants se connectent directement à votre objet `state`.

---

## Intégration à un framework

VectoJS se monte sur un `<canvas>`, il s'intègre donc à n'importe quel framework de la même manière qu'une bibliothèque WebGL.

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

## Défis

### Ajouter un compteur

Étendez le panneau de réglages pour qu'il suive combien de fois le bouton Save a été cliqué et affiche le total courant à côté du bouton.

- Ajoutez une variable `clickCount` initialisée à `0` dans l'objet d'état.
- Créez une entité `Text` qui affiche `'Saved 0 times'` et positionnez-la à côté de `saveBtn` à l'aide d'un `Stack` horizontal.
- Mettez à jour le texte à chaque clic avec `entity.setText(...)` et vérifiez que le compteur s'incrémente correctement après chaque appui.

### Mise en page réactive

Faites en sorte que le panneau se réagence élégamment lorsque le viewport est plus étroit que 480 px. La carte ne devrait jamais déborder des bords de la fenêtre.

- Dans le gestionnaire d'événement `resize`, comparez `window.innerWidth` à `PANEL_W` et calculez une largeur de panneau bornée qui soustrait une marge minimale de 16 px de chaque côté.
- Mettez à jour `card.width`, la largeur du `ScrollView` et la largeur de `usernameInput` pour correspondre à la nouvelle largeur du panneau à chaque redimensionnement.
- Testez en redimensionnant la fenêtre du navigateur à 320 px de large et en confirmant que tout le contenu reste visible et que rien n'est rogné en dehors de la limite de la carte.

### Bascule de thème

Ajoutez un interrupteur de thème sombre/clair à l'en-tête du panneau qui met instantanément à jour le style visuel de tous les composants.

- Définissez deux objets de thème — un sombre (couleurs actuelles) et un clair — chacun spécifiant des valeurs pour la couleur de bordure de la carte, la couleur du texte des titres, la couleur du texte des libellés et l'arrière-plan des boutons.
- Ajoutez un `Toggle` avec le libellé `'Light mode'` au-dessus du `ScrollView` et câblez son événement `change` pour appliquer les valeurs de couleur du thème actif à chaque entité concernée.
- Assurez-vous que la propriété `border` de la carte et la couleur de `titleText` se mettent toutes deux à jour lorsque le thème change, et appelez `scene.markDirty()` après chaque mise à jour de propriété afin que le canvas se repeigne.

## Prochaines étapes

- [Core Scene](/learn/core-scene/) — la boucle de rendu, le système de transformation et l'étranglement au repos (idle throttle) en profondeur.
- [Entités personnalisées](/learn/custom-entity/) — construisez vos propres composants canvas.
- [Événements & Hit-Testing](/learn/events/) — comment les événements de pointeur et de clavier circulent dans l'arbre.
- [Référence de l'API Core](/reference/core-api/) — signatures complètes de `Scene`, `Entity` et `IRenderer`.
