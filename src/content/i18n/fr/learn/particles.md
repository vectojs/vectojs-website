---
title: 'Systèmes de particules'
description: "ComputeParticleEntity : particules de calcul WebGPU, repli CPU, la disposition mémoire à 8 float, l'interaction souris, et triggerExplosion."
order: 12
---

# Systèmes de particules

`ComputeParticleEntity` est la couche de particules à haut débit de VectoJS. Elle exécute une simulation de physique de ressort via une passe de calcul WebGPU, avec un repli CPU pour les navigateurs qui ne prennent pas en charge WebGPU. Le nombre de particules et le taux de trame pris en charge dépendent fortement du GPU, du navigateur, du DPR et de la configuration de rendu ; le dépôt n'inclut pas actuellement de benchmark matériel 100k/1M versionné.

## Essayez-le en direct

<figure class="sandbox">
  <a class="sandbox-cta" href="/demos/nexus/">
    <span class="sandbox-cta-title">Ouvrir la démo de particules Nexus →</span>
    <span class="sandbox-cta-sub">Des dizaines de milliers de points <code>ComputeParticleEntity</code> épelant « VectoJS », simulés sur WebGPU. Glissez pour vous déplacer, faites défiler pour zoomer, cliquez pour envoyer une impulsion à travers le champ.</span>
  </a>
  <figcaption>Le champ de particules fonctionne à pleine vitesse en tant que page WebGPU autonome — un petit iframe intégré le freinait, ce lien renvoie donc à la version réelle.</figcaption>
</figure>

## Particules vs `getBatchCircle`

|                  | `ComputeParticleEntity`                         | `getBatchCircle` sur une entité personnalisée             |
| ---------------- | ----------------------------------------------- | --------------------------------------------------------- |
| Physique         | Intégrée (ressort, répulsion souris, explosion) | Manuelle — vous mettez à jour la position dans `update()` |
| Backend          | Calcul WebGPU ou CPU                            | Couche de points WebGL                                    |
| Débit            | Dépendant du matériel/de la charge              | Dépendant du matériel/de la charge                        |
| Quand l'utiliser | Champs de physique autonomes                    | Nuages de points que vous contrôlez directement           |

Si vous avez besoin d'un champ de particules qui jaillit en formations, réagit au curseur et déclenche des explosions, `ComputeParticleEntity` est le bon outil. Si vous voulez simplement afficher de nombreux points à des positions que vous contrôlez, implémentez `getBatchCircle()` sur une entité personnalisée.

## Configuration de base

```typescript
import { Scene, ComputeParticleEntity } from '@vectojs/core';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;

const scene = new Scene(canvas, {
  particleBackend: 'auto', // 'webgpu' | 'cpu' | 'auto' (default: tries WebGPU, falls back)
  pointBackend: 'webgl', // needed for CPU fallback rendering
  maxFPS: 60,
});

const particles = new ComputeParticleEntity({
  maxParticles: 50_000,
  springK: 0.05, // spring pull toward origin (0–10)
  damping: 0.95, // velocity damping per step (0–1)
  bounceDamping: 0.5, // energy retained on boundary bounce (0–1)
  maxVelocity: 500, // speed clamp
  size: 3, // base particle radius in px
  color: '#00f0ff',
  pointerEvents: false, // true → entity captures hit events
});

scene.add(particles);
scene.start();

// IMPORTANT: resize before calling initRandomParticles
scene.resize(window.innerWidth, window.innerHeight);

// Scatter particles across the viewport
particles.initRandomParticles(scene.width, scene.height);

window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
});
```

> [!CAUTION] > `resize(w, h)` doit être appelée **avant** `initRandomParticles`. Un viewport `0×0` signifie que toutes les positions de particules prennent par défaut la valeur `(0, 0)` et que la simulation n'a aucune limite sur laquelle rebondir. `scene.start()` enregistre un avertissement unique si la largeur ou la hauteur est nulle.

## La disposition mémoire à 8 float

Chaque particule correspond à 8 valeurs `float32` consécutives dans `entity.particleData` :

| Constante d'offset           | Index | Champ      | Notes                                                             |
| ---------------------------- | ----- | ---------- | ----------------------------------------------------------------- |
| `PARTICLE_OFFSET_POSITION_X` | 0     | position.x | x actuel en espace monde                                          |
| `PARTICLE_OFFSET_POSITION_Y` | 1     | position.y | y actuel en espace monde                                          |
| `PARTICLE_OFFSET_VELOCITY_X` | 2     | velocity.x |                                                                   |
| `PARTICLE_OFFSET_VELOCITY_Y` | 3     | velocity.y |                                                                   |
| `PARTICLE_OFFSET_ORIGIN_X`   | 4     | origin.x   | Point de repos/d'ancrage du ressort                               |
| `PARTICLE_OFFSET_ORIGIN_Y`   | 5     | origin.y   |                                                                   |
| `PARTICLE_OFFSET_SIZE`       | 6     | size       | Remplacement de taille par particule                              |
| `PARTICLE_OFFSET_LIFE`       | 7     | life       | `-1` = perpétuelle ; `≥0` décroît à 0,5/s ; `0` = morte (ignorée) |

Vous pouvez lire et écrire `particleData` directement pour configurer des formations personnalisées. Après écriture, définissez `needsInit = true` pour déclencher un téléversement GPU à la trame suivante.

## Former des formes de texte et des motifs

`setOrigins()` est la principale façon de faire jaillir les particules en une formation. Passez un `Float32Array` plat de paires alternées `[x0, y0, x1, y1, …]` — une par particule :

```typescript
// Arrange 10,000 particles in a grid
const N = 10_000;
const cols = 100;
const origins = new Float32Array(N * 2);

for (let i = 0; i < N; i++) {
  const col = i % cols;
  const row = Math.floor(i / cols);
  origins[i * 2] = 100 + col * 8; // x
  origins[i * 2 + 1] = 100 + row * 8; // y
}

particles.setOrigins(origins); // also uploads particleData to GPU
```

`setOrigins(points, requestPositionReset = true)` — le deuxième argument contrôle si les particules se téléportent aussi vers leurs nouvelles origines (utile pour les changements de formation instantanés) ou jaillissent vers elles depuis leurs positions actuelles.

Pour définir des positions sans changer les origines, utilisez `setPositions()`. Pour définir des vélocités initiales (par exemple, une salve vers l'extérieur depuis le centre), utilisez `setVelocities()`.

Les trois méthodes écrivent dans `particleData` et définissent `needsInit = true`, de sorte que les données sont téléversées vers le tampon de stockage WebGPU à la trame suivante.

## Interaction souris

Lorsque `pointerEvents: true`, la `Scene` transmet les coordonnées du curseur à la simulation de particules. Les particules situées à moins de **120 px** du curseur sont repoussées :

```typescript
const particles = new ComputeParticleEntity({
  maxParticles: 100_000,
  pointerEvents: true,
});
scene.add(particles);
```

Le rayon et la force de répulsion sont fixés dans le shader. Lorsque le curseur quitte le canvas, le point de répulsion est réglé à `(-99999, -99999)` afin qu'aucune répulsion ne soit appliquée.

## Accessibilité et test de hit d'un champ de particules

Un champ de particules est décoratif : individuellement, les particules ne portent aucune sémantique digne d'être annoncée, et personne n'en inspecte une dans les outils de développement ou ne la sélectionne comme texte. Traitez le champ comme un objet unique.

**Ne définissez pas `interactive = true` par particule.** Cela projette un élément DOM réel par entité dans la couche sémantique, et le coût par entité s'aggrave à mesure que le nombre augmente — mesuré sur un ordinateur portable RTX 4060, 20 000 entités mobiles individuellement interactives ont coûté 715 ms/image sur Chrome et 2 737 ms/image sur Firefox. Voir [le tableau des coûts](/learn/accessibility/#le-coût-augmente-de-manière-superlinéaire-avec-le-nombre-dentités-interactives).

À la place :

- **Étiquetez le champ une fois.** Donnez au `ComputeParticleEntity` (ou à un wrapper) un seul `getA11yAttributes()` renvoyant un `role` et un `aria-label` décrivant l'effet entier. Un nœud, coût constant.
- **Testez le hit sans projeter.** `scene.findEntityAt(x, y)` résout les entités indépendamment de `interactive`, donc l'interaction par pointeur ne nécessite jamais d'élément projeté. `pointerEvents: true` alimente les coordonnées du curseur dans la simulation et est indépendant de la couche sémantique.
- **Si l'effet est purement décoratif, dites-le.** Le laisser non projeté est la bonne réponse, équivalent à `aria-hidden` sur un élément DOM décoratif — mais assurez-vous que toute _information_ que l'effet transmet est également disponible en texte.

## Déclencher des explosions

`triggerExplosion(x, y, force)` met en file d'attente une impulsion pour l'étape de simulation suivante. Toutes les particules situées à moins de **150 px** de `(x, y)` reçoivent un coup de vélocité vers l'extérieur mis à l'échelle par `force` :

```typescript
canvas.addEventListener('dblclick', (e) => {
  const point = scene.clientToScene(e.clientX, e.clientY);
  particles.triggerExplosion(point.x, point.y, 800);
});
```

Une seule explosion peut être mise en file d'attente à la fois — appeler `triggerExplosion` avant que la précédente n'ait été consommée l'écrase.

## WebGPU vs repli CPU

L'option `particleBackend` contrôle quel chemin est utilisé :

| Valeur                | Comportement                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `'auto'` (par défaut) | Essaie WebGPU ; se replie sur le CPU en cas d'échec ou d'absence                                                   |
| `'webgpu'`            | Demande explicitement WebGPU ; le runtime actuel se replie tout de même sur le CPU lorsque l'initialisation échoue |
| `'cpu'`               | Force la simulation CPU ; désactive WebGPU même s'il est disponible                                                |

**Lorsque WebGPU est actif :** La simulation s'exécute en tant que compute shader sur le GPU. L'état des particules vit dans un tampon de stockage WebGPU et se rend dans le canvas WebGPU dédié de la Scene.

**Lorsque le repli CPU est actif :** La `Scene` appelle `entity.updateCPU(dt, mouseX, mouseY, width, height)` à chaque trame (même modèle physique — ressort, répulsion, explosion, plafond de vélocité, rebond). Rend via `fillCircle()` sur Canvas2D ou la couche de points WebGL optionnelle. Choisissez les nombres à partir de mesures sur le navigateur et le matériel cibles.

> [!NOTE] > `particles.gpuStorageBuffer !== null` indique que des ressources GPU ont été allouées,
> mais ce n'est pas un signal fiable de l'état du backend en direct après une perte de périphérique asynchrone.

La perte de périphérique est récupérée automatiquement avec un backoff exponentiel (3 tentatives) avant de désactiver définitivement WebGPU pour la session.

### Relire les positions des particules depuis le GPU

L'état des particules vit dans un tampon GPU. Vous ne pouvez pas le relire à moindre coût — un aller-retour `mapAsync` + `copyBufferToBuffer` bloque le pipeline. Si vous avez besoin des positions sur le CPU (par exemple, pour la détection de collision avec des entités non-particules), maintenez un `Float32Array` côté CPU synchronisé en écrivant vous-même dans `particleData` et en utilisant `setPositions()`.

Pour les requêtes spatiales à grande échelle entièrement au sein du système de particules, écrivez des passes de calcul WebGPU supplémentaires. Pour la collision avec d'autres entités, utilisez `SpatialHashGrid` sur le chemin CPU.

## Gestion des ressources GPU

```typescript
// Clean up GPU buffers when done (e.g. on page unload or component teardown)
particles.destroyGPUResources();
scene.remove(particles);
```

`scene.destroy()` appelle également `destroyGPUResources()` sur toutes les entités de particules, vous n'avez donc besoin de l'appeler manuellement que pour un démontage en cours de session.

## Types TypeScript pour WebGPU

Si votre projet utilise les API WebGPU et que TypeScript signale `Cannot find name 'GPUDevice'` :

```bash
bun add -d @webgpu/types
```

```json
{ "compilerOptions": { "types": ["@webgpu/types"] } }
```

## Dépannage

### Rien n'apparaît à l'écran

Vérifiez dans l'ordre :

1. **`initRandomParticles()` n'a pas été appelée** — sans cela, toutes les positions de particules sont `(0, 0)` et les tailles sont `0`.
2. **`resize(w, h)` n'a pas été appelée avant `initRandomParticles`** — les particules dispersées dans une boîte `0×0` sont invisibles. Vérifiez que `scene.width` et `scene.height` sont non nuls.
3. **L'initialisation de WebGPU a échoué** — le runtime actuel enregistre l'échec, désactive le chemin GPU et continue via le repli CPU même lorsque `'webgpu'` a été explicitement demandé.
4. **`pointBackend` n'est pas réglé sur `'webgl'`** — le repli CPU rend via `fillCircle`. Sans `'webgl'`, les particules du chemin CPU apparaissent tout de même sur Canvas2D, mais seulement si le renderer canvas est actif.

### Le FPS est bien plus bas que prévu

- Utilisez les outils GPU du navigateur et le canvas WebGPU pour vérifier le chemin actif ; un `gpuStorageBuffer` retenu à lui seul n'est pas un signal d'état durable après une perte de périphérique.
- Dans les environnements headless / CI, WebGPU et WebGL se replient sur des renderers logiciels (Swiftshader). Le FPS en mode headless n'est pas représentatif. Mesurez sur du vrai matériel GPU.
- Réduisez `maxParticles` pendant le profilage et enregistrez les percentiles de temps de trame sur le périphérique cible ; ce dépôt n'établit pas de plafond CPU ou GPU universel.

### Les particules jaillissent vers `(0, 0)` au lieu de ma formation

`setOrigins()` et `setPositions()` définissent toutes deux `needsInit = true`, ce qui téléverse `particleData` vers le tampon GPU à la trame suivante. Si vous les appelez **avant** `scene.start()`, assurez-vous que `start()` est appelée ensuite afin que le téléversement se produise.
