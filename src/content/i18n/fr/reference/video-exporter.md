---
title: '@vectojs/video-exporter'
description: 'CLI et bibliothèque pour faire avancer une scène VectoJS trame par trame et encoder sa sortie canvas en H.264 MP4 avec Chromium et FFmpeg.'
order: 47
---

# `@vectojs/video-exporter`

Version documentée : **0.2.2**

`@vectojs/video-exporter` pilote une scène VectoJS dans Chromium sans tête, pas à pas avec un pas de temps fixe, capture son canvas sous forme d'images PNG et transmet ces images à FFmpeg pour un encodage H.264 MP4.

## Fonctionnalités

- **Contrôle de scène à pas fixe** : Arrête la boucle normale de la Scene et appelle `scene.step(1000 / fps)` avant chaque capture. Cela rend le temps de simulation demandé déterministe ; cela ne garantit pas que le code applicatif utilisant des horloges non liées, des entrées réseau ou de l'aléatoire soit déterministe.
- **Pipeline d'images PNG** : Appelle `canvas.toDataURL('image/png')` dans Chromium, décode le résultat base64 dans Node, et écrit chaque PNG dans l'entrée standard de FFmpeg.
- **Sortie MP4 standard** : Utilise l'encodeur `libx264` de FFmpeg et le format de pixel `yuv420p`.
- **Assistant source locale** : Pour un chemin de module local, démarre un serveur Vite intégré et sert une entrée HTML en mémoire sans modifier le répertoire source. Les pages HTTP(S) hébergées sont également acceptées.
- **Sortie atomique** : Encode vers un fichier unique à côté de la destination et remplace le MP4 demandé seulement après la sortie réussie de FFmpeg. Les exportations échouées ou annulées préservent une destination existante.
- **Nettoyage déterministe** : Arrête la sortie de progression, termine FFmpeg, ferme Chromium et Vite, et supprime les fichiers intermédiaires en cas de succès, d'échec ou d'annulation.

---

## Installation

```bash
bun add @vectojs/video-exporter
```

L'exportateur nécessite `ffmpeg` dans le `PATH`. Chromium est résolu depuis `PUPPETEER_EXECUTABLE_PATH`, puis `/usr/bin/chromium` lorsqu'il est présent, puis le navigateur configuré ou intégré de Puppeteer.

```bash
ffmpeg -version
PUPPETEER_EXECUTABLE_PATH=/opt/chrome/chrome bunx vecto-export ./scene.ts
```

Vite est une dépendance d'exécution et est installé automatiquement pour les entrées JavaScript et TypeScript locales.

## Usage (CLI)

Passez un module JavaScript/TypeScript local directement :

```bash
bunx vecto-export ./my-animation.ts -o output.mp4 -f 60 -d 5
```

Ou passez une URL pré-hébergée :

```bash
bunx vecto-export http://localhost:5173 -o output.mp4 -f 60 -d 5
```

### Options

- `-o, --output` : Fichier de sortie (défaut : out.mp4)
- `-w, --width` : Largeur en pixels (défaut : 1280)
- `-h, --height` : Hauteur en pixels (défaut : 720)
- `-f, --fps` : Images par seconde (défaut : 60)
- `-d, --duration`: Durée en secondes (défaut : 5)

## Usage de l'API interne

```typescript
import { exportVideo } from '@vectojs/video-exporter';

await exportVideo({
  url: 'my-animation.ts', // ou une URL http
  outputPath: 'out.mp4',
  width: 1920,
  height: 1080,
  fps: 60,
  duration: 10,
});
```

La page rendue doit exposer une Scene VectoJS démarrée ou démarrable comme `window.vectoScene`. L'exportateur attend jusqu'à 10 secondes qu'elle soit disponible, nécessite des méthodes `stop()` et `step(dt)` appelables, puis l'avance avec des pas fixes. Le premier `<canvas>` est redimensionné aux dimensions de sortie demandées et capturé.

```typescript
const scene = new Scene(document.querySelector('canvas')!);
// ajouter des entités...
(window as Window & { vectoScene?: Scene }).vectoScene = scene;
scene.start();
```

Le nombre d'images est `Math.ceil(fps × durée)`. Si FFmpeg se termine avec un code non nul, la Promise est rejetée avec les dernières lignes de stderr bornées. Les erreurs distinguent les phases de validation, Vite, Chromium/contrat de page, capture, FFmpeg, validation de sortie et nettoyage.

## Annulation et signaux de processus

Annulez les exportations API avec un `AbortController`. Le CLI mappe `SIGINT` et `SIGTERM` vers le même chemin de nettoyage, attend la fermeture des ressources, puis renvoie le code de sortie 130 ou 143.

```typescript
const controller = new AbortController();
const exportPromise = exportVideo({
  url: './my-animation.ts',
  outputPath: './out.mp4',
  width: 1920,
  height: 1080,
  signal: controller.signal,
});

controller.abort();
await exportPromise;
```

## Politique de sandbox Chromium

Le sandbox reste activé pour les utilisateurs normaux. Il est désactivé uniquement pour root ou lorsque `VECTO_CHROMIUM_NO_SANDBOX=1` est explicitement défini, et l'exportateur émet un avertissement dans les deux cas. La variable d'environnement est destinée aux exécuteurs CI contraints ; préférez un processus normal non-root ailleurs.
