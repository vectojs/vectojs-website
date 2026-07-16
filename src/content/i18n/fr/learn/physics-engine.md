---
title: 'Physique & Animation'
description: "Appliquez une physique de ressort, une vélocité et une simulation dirigée par les forces à n'importe quelle entité du VMT."
order: 11
---

# Physique & Animation

VectoJS va au-delà de la mise en page statique. Parce que l'UI vit dans un Virtual Math Tree, vous pouvez appliquer une **physique continue dirigée par les forces** à n'importe quel composant — y compris des `Button` et `Input` standard.

## Interpolation intégrée : `entity.animate()`

L'outil de mouvement le plus simple. `animate()` met en file d'attente des interpolations douces en ease-out sur n'importe quelle propriété numérique :

```typescript
button.animate({ x: 200, opacity: 0.5 }, 500);

// Chains are sequential, not concurrent:
button.animate({ x: 400 }, 300).animate({ y: 200 }, 300).animate({ opacity: 0 }, 200);
```

Tant qu'une interpolation est en cours, la scène est maintenue non statique — pas besoin d'appeler `markDirty()`. Lorsque l'interpolation se stabilise, `hasPendingAnimations()` renvoie `false`.

> [!TIP]
> Les chaînes sont séquentielles (`animate` renvoie `this`), pas concurrentes. Pour un mouvement concurrent, un lissage plus riche, des ressorts et des transitions d'entrée/sortie sur les composants, utilisez le système d'animation ci-dessous.

## Animation déclarative & impérative

Ajouté en **0.2.0**, le système d'animation privilégie les ressorts et unifie interpolations et ressorts derrière une seule API — la façon recommandée d'animer la transformation ou l'opacité de n'importe quelle entité. C'est le même moteur que les composants intégrés (Modal, Tooltip, …) utilisent pour s'animer eux-mêmes.

### Transitions déclaratives

Déclarez quelles propriétés s'animent et comment ; ensuite, une simple affectation les anime :

```typescript
entity.setTransition({
  opacity: 'spring', // default spring
  x: { duration: 300, easing: 'easeOutCubic' }, // tween
  scaleX: { stiffness: 200, damping: 18 }, // spring with overrides
});

entity.opacity = 1; // springs to 1
entity.x = 400; // tweens over 300ms
```

Affecter une nouvelle cible en plein vol **recible** l'animation en cours — un ressort conserve sa vélocité — de sorte qu'une UI rapidement basculée ou pilotée par des gestes s'écoule en continu au lieu de s'arrêter net. Les propriétés sans transition configurée sont écrites immédiatement via le setter normal, sans créer de driver. Les propriétés animables sont `x`, `y`, `scaleX`, `scaleY`, `rotation` et `opacity`.

### One-shots impératifs

Pour la chorégraphie, `animateTo` (interpolation) et `springTo` (ressort) pilotent directement les propriétés et renvoient une Promise qui se résout lorsque le mouvement se stabilise :

```typescript
await entity.animateTo({ x: 400, opacity: 0 }, { duration: 500, easing: 'easeOutCubic' });
await entity.springTo({ scaleX: 1, scaleY: 1 }, { stiffness: 200, damping: 18 });
```

Contrairement à `animate()` (qui s'enchaîne séquentiellement), celles-ci s'exécutent en concurrence et se composent avec `async`/`await`.

### Lissage (easing)

L'export `Easing` fournit un ensemble sélectionné de courbes — `linear`, `easeInOut{Quad,Cubic}`, `easeOut{Quad,Cubic}`, `easeOutBack` (dépassement) et bien d'autres. Passez un nom de courbe, ou votre propre fonction `(t: number) => number`, à l'option `easing` de n'importe quelle interpolation.

### Mouvement réduit

Le système respecte automatiquement le réglage OS **prefers-reduced-motion** : le mouvement (transformations, ressorts) s'aligne immédiatement sur sa cible tandis que les fondus d'opacité sont préservés — les composants apparaissent et disparaissent toujours, simplement sans mouvement. Aucun code par composant requis.

> [!TIP]
> Les composants animent leurs propres transitions d'entrée/sortie via ce système. Toute sous-classe `UIComponent` peut déclarer `enterMotion`/`exitMotion` et appeler `dismiss()` pour s'animer en sortie puis se démonter — voir la [référence des composants UI](/reference/ui-components/).

## SpringPhysics

`SpringPhysics` est un ressort amorti pour des transitions numériques fluides à la sensation physique :

```typescript
import { SpringPhysics } from '@vectojs/core';

const spring = new SpringPhysics(0);   // initial value = 0
spring.stiffness = 180;
spring.damping = 18;

// Set target at any time (e.g. on hover)
spring.target = 1.0;

// In your entity's update():
update(dt: number) {
  spring.update(dt);
  this.opacity = spring.value;
  if (!spring.isAtRest()) this.scene?.markDirty();
}
```

Utilisez `SpringPhysics` au lieu de `animate()` lorsque la cible change en continu (suivi du curseur, inertie de défilement, glisser interactif).

## Physique manuelle sur les entités

Chaque `Entity` possède `x`/`y` et `update(dt, time)`. Vous pouvez implémenter n'importe quel modèle physique en surchargeant `update` :

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class BallEntity extends Entity {
  vx = (Math.random() - 0.5) * 200;
  vy = (Math.random() - 0.5) * 200;
  friction = 0.97;

  constructor(public radius: number) {
    super();
    this.width = this.height = radius * 2;
  }

  applyForce(fx: number, fy: number) {
    this.vx += fx;
    this.vy += fy;
  }

  override update(dt: number) {
    super.update(dt); // advance queued animate() tweens
    const seconds = dt / 1000;
    this.x += this.vx * seconds;
    this.y += this.vy * seconds;
    this.vx *= this.friction;
    this.vy *= this.friction;
  }

  isPointInside(gx: number, gy: number) {
    const local = this.worldToLocal(gx, gy);
    if (!local) return false;
    return (local.x - this.radius) ** 2 + (local.y - this.radius) ** 2 <= this.radius ** 2;
  }

  render(r: IRenderer) {
    r.beginPath();
    r.arc(this.radius, this.radius, this.radius, 0, Math.PI * 2);
    r.fill('#6366f1');
  }
}
```

## Limites élastiques

Faites rebondir les entités sur les bords du viewport avec un simple facteur d'amortissement :

```typescript
const BOUNCE = 0.75;

override update(dt: number) {
  super.update(dt);
  const seconds = dt / 1000;
  this.x += this.vx * seconds;
  this.y += this.vy * seconds;

  const { width, height } = this.scene!;

  if (this.x < 0) { this.x = 0; this.vx = Math.abs(this.vx) * BOUNCE; }
  if (this.x + this.width > width) {
    this.x = width - this.width;
    this.vx = -Math.abs(this.vx) * BOUNCE;
  }
  if (this.y < 0) { this.y = 0; this.vy = Math.abs(this.vy) * BOUNCE; }
  if (this.y + this.height > height) {
    this.y = height - this.height;
    this.vy = -Math.abs(this.vy) * BOUNCE;
  }
}
```

Ce modèle convient aux petites collections gérées par l'application. La démo Nexus utilise plutôt le modèle fixe de ressort/souris/explosion de `ComputeParticleEntity` ; elle ne simule pas d'interaction entité-à-entité.

## SpatialHashGrid : candidats voisins gérés par l'application

Pour les interactions à N corps (répulsion, collision), une boucle naïve par paires est en O(N²). Utilisez `SpatialHashGrid` pour récupérer des candidats depuis les cellules chevauchées par une requête, puis exécutez des tests exacts sur ce plus petit ensemble :

```typescript
import { SpatialHashGrid } from '@vectojs/core';

const grid = new SpatialHashGrid(64); // cell size in world units

// Every frame: rebuild grid, then query
for (const ball of balls) {
  grid.insert(ball.id, ball.x, ball.y, ball.width, ball.height);
}

for (const ball of balls) {
  const nearby = grid.query(ball.x - 50, ball.y - 50, 100, 100);
  for (const otherId of nearby) {
    if (otherId === ball.id) continue;
    // apply repulsion between ball and balls[otherId]
  }
}

grid.clear(); // call once per frame before re-inserting
```

Utilisez vous-même ce modèle lorsque vous avez besoin d'une véritable interaction entre voisins (collision balle contre balle, nuées, répulsion entre entités). Notez que `ComputeParticleEntity` n'utilise **pas** `SpatialHashGrid` en interne — sa simulation (GPU ou CPU) ne calcule les forces que par rapport à des points fixes (origine du ressort, souris, centre d'explosion), et non entité contre entité. Si vous avez besoin à la fois de nombres élevés de particules _et_ d'une véritable interaction entre voisins, vous combinez deux choses que le moteur ne fait pas pour vous : vous exécuteriez votre propre requête de voisinage basée sur `SpatialHashGrid` sur le CPU (comme ci-dessus), ou vous écririez une passe de calcul WGSL personnalisée avec une requête de voisinage intégrée pour le chemin GPU.

> [!WARNING]
> Reconstruisez la grille de hachage à chaque trame. Des données de grille périmées d'une trame précédente produiront des requêtes de voisinage incorrectes et des collisions fantômes.

## Particules à haut débit : `ComputeParticleEntity`

Pour des dizaines de milliers de particules avec ressort-vers-origine + répulsion par la souris, utilisez `ComputeParticleEntity`. Il utilise automatiquement les compute shaders WebGPU lorsqu'ils sont disponibles, avec repli sur le CPU :

```typescript
import { ComputeParticleEntity } from '@vectojs/core';

const particles = new ComputeParticleEntity({
  maxParticles: 15000,
  springK: 0.05,
  damping: 0.95,
  size: 3,
  color: '#6366f1',
});

// Scatter particles across the viewport
particles.initRandomParticles(scene.width, scene.height);
scene.add(particles);
scene.start();

// Animate particles toward new origin positions (e.g. spell out text)
particles.setOrigins(newPositions);
```

> [!CAUTION]
> Appelez toujours `scene.resize(width, height)` ou laissez la Scene se redimensionner automatiquement avant `initRandomParticles`. Un viewport `0×0` ne produit aucune position initiale et les particules ne bougeront jamais.

Consultez la [référence de l'API Core](/reference/core-api/) pour la disposition mémoire complète de `ComputeParticleEntity` et les détails internes de WebGPU.
