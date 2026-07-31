---
title: 'ComputeParticleEntity'
description: 'La couche de particules à haut débit : disposition mémoire Float32Array par particule, simulation CPU ressort/amortissement/explosion, et le chemin de calcul WebGPU avec repli CPU automatique.'
order: 6
---

# `ComputeParticleEntity` — couche de particules à haut débit

Partie de [`@vectojs/core`](/reference/core-api/).

```ts
new ComputeParticleEntity(options?: ComputeParticleOptions)
```

| Option          | Défaut      | Signification                                                                            |
| --------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `maxParticles`  | `10000`     | Nombre de particules.                                                                    |
| `springK`       | `0.05`      | Rappel du ressort vers l'origine (borné 0–10).                                           |
| `damping`       | `0.95`      | Amortissement de la vélocité (0–1).                                                      |
| `bounceDamping` | `0.5`       | Énergie de rebond conservée aux limites (0–1).                                           |
| `maxVelocity`   | `500`       | Limitation de vitesse.                                                                   |
| `size`          | `4`         | Taille de base des particules (px).                                                      |
| `color`         | `'#00f0ff'` | Couleur CSS (`baseColor`).                                                               |
| `pointerEvents` | `false`     | Si la couche capture les événements de pointeur (`isPointInside` retourne cette valeur). |

## Disposition mémoire par particule

`particleData: Float32Array` de longueur `maxParticles × PARTICLE*STRIDE*FLOATS`
(`PARTICLE*STRIDE*FLOATS = 8`). Par particule, 8 flottants :

| Constante de décalage        | Index | Champ                                                                    |
| ---------------------------- | ----- | ------------------------------------------------------------------------ |
| `PARTICLE_OFFSET_POSITION_X` | 0     | position.x                                                               |
| `PARTICLE_OFFSET_POSITION_Y` | 1     | position.y                                                               |
| `PARTICLE_OFFSET_VELOCITY_X` | 2     | velocity.x                                                               |
| `PARTICLE_OFFSET_VELOCITY_Y` | 3     | velocity.y                                                               |
| `PARTICLE_OFFSET_ORIGIN_X`   | 4     | origin.x (ancrage du ressort)                                            |
| `PARTICLE_OFFSET_ORIGIN_Y`   | 5     | origin.y                                                                 |
| `PARTICLE_OFFSET_SIZE`       | 6     | taille                                                                   |
| `PARTICLE_OFFSET_LIFE`       | 7     | vie : `-1` = perpétuelle, `>=0` décroît à `0,5/s`, `0` = morte (ignorée) |

## Méthodes

```ts
initRandomParticles(width, height): void      // disperse dans la boîte ; vie = -1 (perpétuelle) ; marque dirty
setOrigins(points: Float32Array | number[], requestPositionReset = true): void
setPositions(positions: Float32Array | number[]): void
setVelocities(velocities: Float32Array | number[]): void
triggerExplosion(x, y, force): void           // met en file d'attente une impulsion pour l'étape suivante (rayon 150px)
updateCPU(dt, mouseX, mouseY, width, height): void   // étape de simulation CPU ; dt en SECONDES, borné [0;0,1]
destroyGPUResources(): void
```

Simulation CPU par étape : ressort-vers-origine + répulsion de la souris (à moins de
120 px d'un curseur actif ; curseur « hors » est `< -9000`) + explosion en attente
(à moins de 150 px) → intégration → limitation de vélocité → rebond aux limites +
limitation → décroissance de vie. Protégé contre les NaN.

## WebGPU vs CPU

Quand `particleBackend` le permet (voir [`SceneOptions`](/reference/core-scene/#sceneoptions))
et qu'un périphérique WebGPU s'initialise, la Scène exécute des passes de calcul +
rendu dans un canvas WebGPU dédié ; sinon elle appelle `updateCPU` et dessine via
`fillCircle` / la [couche WebGL points](/reference/core-renderer/#couche-webgl-points)
optionnelle. `gpuStorageBuffer` non nul confirme que les ressources ont été allouées,
mais ce n'est pas un statut « actuellement actif » durable après une perte de
périphérique asynchrone. Les ressources GPU (`gpuStorageBuffer`, `gpuUniformBuffer`,
`computeBindGroup`, `renderBindGroup`) et `needsInit` sont publiques pour les
auteurs de backends.

> L'initialisation WebGPU est paresseuse (première image où un `ComputeParticleEntity`
> apparaît) et asynchrone, avec récupération automatique après perte de périphérique.
> Définissez le viewport via `scene.resize(w, h)` avant de vous fier à la simulation
> — une boîte `0×0` ne produit aucun mouvement.

Les positions des particules sont dans l'espace de la scène. Le chemin CPU Canvas
participe à la pile de transformation de l'entité ; les chemins séparés WebGL/WebGPU
d'overlay n'appliquent pas la translation/échelle/rotation de l'entité ni le
clipping du parent. L'opacité est héritée sur tous les chemins.

Voir [Systèmes de particules](/learn/particles/) pour l'utilisation.

## Associé

[`Scene`](/reference/core-scene/) (option `particleBackend`) ·
[Renderers](/reference/core-renderer/) (repli couche WebGL points) ·
[`@vectojs/core` overview](/reference/core-api/)
