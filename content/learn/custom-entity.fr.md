+++
title = "Construire des entités personnalisées"
description = "Apprenez à sous-classer Entity pour construire vos propres composants canvas : transformations, rendu, hit-testing, animation, groupage (batching) et accessibilité."
weight = 9
+++

# Construire des entités personnalisées

Chaque objet dans VectoJS est une `Entity` — un nœud du Virtual Math Tree. Les composants intégrés comme `Button` et `Toggle` ne sont que des sous-classes d'Entity que vous pouvez utiliser telles quelles. Ce guide vous montre comment construire les vôtres.

## Essayez-le en direct

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · @vectojs/core</span></div>
  <iframe src="/sandbox/custom-entity.html" class="sandbox-frame" loading="lazy" title="Custom Entity interactive example" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Trois entités personnalisées <code>GaugeWidget</code> avec des remplissages d'arc animés. Cliquez sur Randomize pour voir le système d'interpolation <code>animate()</code> en action.</figcaption>
</figure>

## Le système de coordonnées locales

C'est la chose la plus importante à intérioriser avant d'écrire votre première méthode `render()` :

> **Votre entité dessine à `(0, 0)`. Le canvas est déjà transformé à la position, l'échelle et la rotation de votre entité avant l'appel de `render()`.**

La `Scene` applique les transformations dans l'ordre **T · S · R** (Translation → Échelle → Rotation) en descendant dans l'arbre. Au moment où votre `render(renderer)` est invoquée, l'origine est le coin supérieur gauche de votre entité, votre échelle est en vigueur et votre rotation est appliquée. Vous n'avez jamais besoin de lire `this.x` ou `this.y` à l'intérieur de `render()`.

<figure>
  <img src="/images/local-coordinate-system.svg" alt="Diagramme montrant l'espace monde à gauche avec l'entité positionnée à (80, 90), et l'espace local à droite où l'origine est (0,0) et où render() dessine, reliés par une flèche étiquetée « La Scene applique la transformation T·S·R »" class="diagram" />
  <figcaption>La Scene translate le canvas à la position monde de votre entité avant d'appeler <code>render()</code>. Vous dessinez toujours à <code>(0, 0)</code>.</figcaption>
</figure>

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class Banner extends Entity {
  color = '#6366f1';

  isPointInside(_gx: number, _gy: number) {
    return false;
  }

  render(renderer: IRenderer) {
    // Draw relative to (0, 0) — not (this.x, this.y)
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 12);
    renderer.fill(this.color);
  }
}

const banner = new Banner();
banner.width = 300;
banner.height = 60;
banner.setPosition(80, 120); // controls where it appears on screen
scene.add(banner);
```

## Contrat d'implémentation minimal

Deux méthodes sont requises :

```typescript
abstract class Entity {
  // Return true if the global pointer coordinates (gx, gy) hit this entity.
  abstract isPointInside(gx: number, gy: number): boolean;

  // Draw the entity. The renderer is already in local space — origin is (0,0).
  abstract render(renderer: IRenderer): void;
}
```

Si votre entité n'a aucune zone interactive, renvoyez `false` depuis `isPointInside`. Pour une zone de survol rectangulaire, convertissez le point monde avec `worldToLocal()` afin que la rotation imbriquée et l'échelle non uniforme soient gérées exactement :

```typescript
isPointInside(gx: number, gy: number): boolean {
  const local = this.worldToLocal(gx, gy);
  return !!local && local.x >= 0 && local.x <= this.width
      && local.y >= 0 && local.y <= this.height;
}
```

> [!NOTE] > `UIComponent` implémente déjà ce test AABB pour vous. Étendez `UIComponent` de `@vectojs/ui` plutôt que `Entity` directement lorsque votre composant a une boîte de survol rectangulaire — vous obtenez `isPointInside`, `getBounds` et `padding` gratuitement.

## L'API IRenderer

L'objet renderer passé à `render()` fournit une surface de dessin de type Canvas2D (mais indépendante du backend — il pourrait s'agir de Canvas2D, WebGL ou SVG).

```typescript
// Paths
renderer.beginPath()
renderer.moveTo(x, y)
renderer.lineTo(x, y)
renderer.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y)
renderer.arc(cx, cy, radius, startAngle, endAngle, counterclockwise?)
renderer.roundRect(x, y, w, h, radii)
renderer.closePath()

// Fills and strokes
renderer.fill(colorOrGradient)       // e.g. '#ff0' or a gradient descriptor
renderer.stroke(colorOrGradient, lineWidth?)

// Text (native browser canvas text — no LayoutEngine)
renderer.fillText(text, x, y, font, color)  // font = CSS shorthand

// Images
renderer.drawImage(source, dx, dy, dw, dh)

// Fast circle batch (coalesces same-color runs)
renderer.fillCircle(cx, cy, radius, color, alpha?)

// State
renderer.save()
renderer.restore()
renderer.translate(x, y)
renderer.scale(x, y)
renderer.rotate(angle)        // radians
renderer.setGlobalAlpha(a)
renderer.clip(x, y, w, h)    // inside save/restore

// Gradients
renderer.createLinearGradient(x0, y0, x1, y1, colorStops)
```

**Exemple — carte avec dégradé :**

```typescript
render(renderer: IRenderer) {
  const gradient = renderer.createLinearGradient(0, 0, this.width, 0, [
    { stop: 0, color: '#6366f1' },
    { stop: 1, color: '#38bdf8' },
  ]);
  renderer.beginPath();
  renderer.roundRect(0, 0, this.width, this.height, 16);
  renderer.fill(gradient);

  renderer.fillText('Hello canvas', 20, this.height / 2 - 8, '600 18px Inter', '#fff');
}
```

## Élimination du viewport avec `getBounds()`

Par défaut, les entités ne sont jamais éliminées. Surchargez `getBounds()` pour renvoyer une boîte englobante en espace local et la Scene sautera `render()` lorsque la boîte transformée est en dehors du viewport. `update()` s'exécute toujours pour que l'état et les animations restent à jour lorsque l'entité revient à l'écran :

```typescript
getBounds() {
  return { x: 0, y: 0, width: this.width, height: this.height };
}
```

`UIComponent` le fait déjà. Les sous-classes `Entity` brutes devraient l'implémenter pour les grandes scènes.

## Logique par trame avec `update(dt, time)`

Surchargez `update()` pour exécuter du code à chaque trame. Appelez `super.update(dt, time)` en premier pour faire avancer les interpolations `animate()` en file d'attente.

> [!CAUTION] > `dt` est en **millisecondes**, pas en secondes. À 60 fps, `dt ≈ 16,7`. Divisez par 1000 pour obtenir des secondes.

```typescript
class Spinner extends Entity {
  speed = 1.5; // rad/s

  update(dt: number, time: number) {
    super.update(dt, time);
    this.rotation += this.speed * (dt / 1000); // dt/1000 → seconds
  }

  // Motion driven from update() is invisible to the Scene's idle checks unless
  // you report it. This keeps the idle throttle from dropping the spinner to
  // 2 fps and states the animation intent more clearly than a per-frame dirty flag.
  hasPendingAnimations() {
    return true; // a spinner is always animating
  }

  isPointInside() {
    return false;
  }

  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.arc(this.width / 2, this.height / 2, 30, 0, Math.PI * 2);
    renderer.stroke('#00f0ff', 3);
  }
}
```

`time` est `performance.now()` et est utile pour les oscillations qui ne doivent pas dériver :

```typescript
this.y = Math.sin(time * 0.002) * 20; // stable float, not accumulated error
```

## Animation fluide avec `animate()`

Pour les transitions à usage unique, `animate()` est souvent meilleur qu'un `update()` personnalisé :

```typescript
entity
  .animate({ x: 300, opacity: 0 }, 400) // ease-out, 400 ms
  .animate({ opacity: 1 }, 200); // chained: starts when the first finishes
```

Seules les **propriétés numériques** s'interpolent. Le lissage est ease-out quadratique (`t * (2 - t)`). Une interpolation en cours maintient la scène non statique et appelle `markDirty()` automatiquement.

## Rendre une entité interactive

Définissez `interactive = true` et implémentez `isPointInside`. Puis attachez des écouteurs avec `on()` :

```typescript
class Chip extends Entity {
  selected = false;
  label: string;

  constructor(label: string) {
    super();
    this.label = label;
    this.interactive = true;
    this.width = 80;
    this.height = 32;

    this.on('click', () => {
      this.selected = !this.selected;
      this.animate({ scaleX: 0.92, scaleY: 0.92 }, 80).animate({ scaleX: 1, scaleY: 1 }, 80);
      this.scene?.markDirty();
    });
  }

  isPointInside(gx: number, gy: number): boolean {
    const p = this.worldToLocal(gx, gy);
    return !!p && p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height;
  }

  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 16);
    renderer.fill(this.selected ? '#6366f1' : 'rgba(99,102,241,0.2)');
    renderer.fillText(this.label, 12, 9, '500 14px Inter', '#fff');
  }
}
```

## Projection A11y avec `getA11yAttributes()`

Lorsque votre entité est `interactive`, VectoJS projette un vrai nœud DOM transparent au-dessus d'elle. Par défaut, il s'agit d'un simple `<div>` — pas très utile pour les technologies d'assistance. Surchargez `getA11yAttributes()` pour indiquer au framework quel nœud projeter :

```typescript
import type { A11yAttributes } from '@vectojs/core';

class Chip extends Entity {
  getA11yAttributes(): A11yAttributes {
    return {
      tag: 'button',
      role: 'button',
      label: this.label,
    };
  }
}
```

Désormais, le `page.getByRole('button', { name: 'OK' })` de Playwright trouve votre chip, les lecteurs d'écran l'annoncent, et les utilisateurs de clavier peuvent y accéder par Tab et l'activer avec Entrée. L'ensemble complet des champs :

```typescript
interface A11yAttributes {
  tag?: 'div' | 'a' | 'button' | 'img' | 'input' | 'textarea'; // default 'div'
  role?: string;
  label?: string; // aria-label
  href?: string; // for tag='a'
  src?: string;
  alt?: string; // for tag='img'
  inputType?: string; // 'text', 'checkbox', etc.
  placeholder?: string;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  controls?: string;
  haspopup?: string;
  selected?: boolean;
  activedescendant?: string;
  valuemin?: string;
  valuemax?: string;
}
```

## Groupage WebGL avec `getBatchCircle()` et `getBatchRect()`

Pour les entités de type particule (points, pastilles) se comptant par milliers, le chemin `save/translate/render/restore` par entité est trop lent. Utilisez plutôt le chemin rapide de groupage :

```typescript
class Particle extends Entity {
  radius = 4;
  color = '#00f0ff';

  // Feed the WebGL batch when the accumulated transform is representable.
  getBatchCircle() {
    return { radius: this.radius, color: this.color };
  }

  isPointInside() {
    return false;
  }
  // Required fallback for Canvas mode or non-uniform/sheared ancestors.
  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.arc(0, 0, this.radius, 0, Math.PI * 2);
    renderer.fill(this.color);
  }
}
```

Contraintes :

- L'entité doit être une **feuille** (aucun enfant).
- L'échelle propre de l'entité doit être **uniforme** (`scaleX === scaleY`) pour le chemin rapide.
- Nécessite `pointBackend: 'webgl'` sur la `Scene`.
- Si la transformation accumulée des ancêtres est non uniforme, cisaillée, ou ne peut pas être représentée par un seul rayon/rotation, la Scene appelle le repli `render()` normal.

La Scene lit `getBatchCircle()` à chaque trame, donc les `radius`/`color` animés sont honorés. La couche de points téléverse de nombreux cercles en une seule séquence tampon/dessin. Pour les rectangles, utilisez plutôt `getBatchRect()` :

```typescript
getBatchRect() {
  return { width: this.width, height: this.height, color: this.color };
}
```

## Exemple complet : widget de jauge animée

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';
import type { A11yAttributes } from '@vectojs/core';

class GaugeWidget extends Entity {
  private _value = 0;
  private _displayValue = 0; // interpolated

  label: string;
  min: number;
  max: number;
  accentColor: string;

  constructor(label: string, opts: { min?: number; max?: number; accent?: string } = {}) {
    super();
    this.label = label;
    this.min = opts.min ?? 0;
    this.max = opts.max ?? 100;
    this.accentColor = opts.accent ?? '#00f0ff';
    this.width = 180;
    this.height = 180;
    this.interactive = true;
  }

  get value() {
    return this._value;
  }

  setValue(v: number) {
    this._value = Math.max(this.min, Math.min(this.max, v));
    // Smooth visual transition
    this.animate({ _displayValue: this._value } as any, 600);
  }

  update(dt: number, time: number) {
    super.update(dt, time);
  }

  getBounds() {
    return { x: 0, y: 0, width: this.width, height: this.height };
  }

  isPointInside(gx: number, gy: number): boolean {
    const p = this.worldToLocal(gx, gy);
    return !!p && p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height;
  }

  getA11yAttributes(): A11yAttributes {
    return {
      role: 'meter',
      label: this.label,
      value: String(this._value),
      valuemin: String(this.min),
      valuemax: String(this.max),
    };
  }

  render(renderer: IRenderer) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const r = 70;
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const progress = (this._displayValue - this.min) / (this.max - this.min);
    const sweepAngle = startAngle + (endAngle - startAngle) * progress;

    // Track
    renderer.beginPath();
    renderer.arc(cx, cy, r, startAngle, endAngle);
    renderer.stroke('rgba(255,255,255,0.12)', 10);

    // Progress arc
    if (progress > 0) {
      renderer.beginPath();
      renderer.arc(cx, cy, r, startAngle, sweepAngle);
      renderer.stroke(this.accentColor, 10);
    }

    // Value label
    renderer.fillText(
      `${Math.round(this._displayValue)}`,
      cx - 20,
      cy - 14,
      'bold 36px Inter',
      '#f8fafc',
    );
    renderer.fillText(this.label, cx - 30, cy + 20, '14px Inter', '#94a3b8');
  }
}

// Usage:
const gauge = new GaugeWidget('CPU', { accent: '#6366f1' });
gauge.setPosition(60, 60);
scene.add(gauge);
gauge.setValue(72);
```

## Récapitulatif

| Méthode                             | Quand la surcharger                                                                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `render(renderer)`                  | Toujours — dessine l'entité en espace local à (0,0)                                                                                                               |
| `isPointInside(gx, gy)`             | Toujours — renvoyer false pour les entités décoratives                                                                                                            |
| `update(dt, time)`                  | Logique par trame ; appelez `super.update` en premier ; `dt` en ms                                                                                                |
| `hasPendingAnimations()`            | Chaque fois que `update()` pilote son propre mouvement — signalez « toujours en mouvement » afin que l'étranglement au repos / le saut onDemand continue le rendu |
| `getBounds()`                       | Pour l'élimination du viewport (recommandation forte)                                                                                                             |
| `getA11yAttributes()`               | Lorsque interactive — contrôle le nœud shadow DOM                                                                                                                 |
| `getBatchCircle() / getBatchRect()` | Entités feuilles de type particule se comptant par milliers                                                                                                       |

## Dépannage

### L'entité est ajoutée mais rien n'apparaît à l'écran

Vérifiez dans l'ordre :

1. **`scene.start()` non appelée** — la boucle de rendu ne se déclenche jamais sans elle.
2. **`render()` n'appelle aucune méthode de dessin** — un `render()` vide est silencieux. Vérifiez que `renderer.fill()` ou `renderer.stroke()` est atteint.
3. **`width` ou `height` vaut `0`** — l'entité peut être hors écran ou éliminée. Définissez `entity.width = 200; entity.height = 80` et vérifiez si elle apparaît.
4. **`opacity` vaut `0`** — vérifiez `entity.opacity`.
5. **Entité non ajoutée à la scène** — `new MyEntity()` construit mais n'ajoute pas. Appelez `scene.add(entity)`.

### `isPointInside` ne renvoie jamais `true` / les événements de clic ne se déclenchent pas

`isPointInside` reçoit des coordonnées **globales (en espace monde)**. Les tester contre `this.x` / `this.y` échoue pour les transformations imbriquées, tandis que soustraire `getGlobalPosition()` échoue tout de même pour la rotation et l'échelle non uniforme. Inversez la transformation complète avec `worldToLocal()` :

```typescript
// Wrong — only works when entity is at scene root with no parent transforms
isPointInside(gx, gy) {
  return gx >= this.x && gx <= this.x + this.width; // ← breaks in a nested tree
}

// Correct — handles nested translation, rotation, and non-uniform scale
isPointInside(gx, gy) {
  const p = this.worldToLocal(gx, gy);
  return !!p && p.x >= 0 && p.x <= this.width
      && p.y >= 0 && p.y <= this.height;
}
```

Assurez-vous aussi que `entity.interactive = true` est défini — sans cela, aucun événement de pointeur n'est distribué à l'entité.

### `getBatchCircle()` / `getBatchRect()` n'est pas utilisée

Deux exigences faciles à manquer :

- La Scene doit avoir `pointBackend: 'webgl'` défini dans ses options de constructeur.
- L'entité doit être une **feuille** (aucun `children`). Si vous `add()` un enfant à une entité de groupage, elle se replie silencieusement sur le chemin `render()` normal.

Vérifiez `console.log(scene.getRenderer())` — si le renderer est `CanvasRenderer` et qu'il n'y a pas de couche WebGL, `pointBackend: 'webgl'` n'a pas été défini ou WebGL2 est indisponible.

### Le nœud shadow DOM est absent dans les DevTools

Le nœud fantôme a11y n'est créé que lorsque les **deux** conditions sont vraies :

1. `entity.interactive === true`
2. `entity.width > 0` (ou `entity.a11yFullViewport === true`)

Une entité avec `interactive = true` mais `width = 0` n'obtient aucun nœud fantôme. Définissez `entity.width` et `entity.height` pour correspondre à la taille visuelle.

## Défis

### Entité barre de progression

Construisez une entité `ProgressBar` qui affiche une barre de remplissage animée et qui est correctement annoncée par les lecteurs d'écran comme un indicateur de progression.

- Propriétés : `min: number`, `max: number`, `value: number`, `barColor: string`, `trackColor: string`, et `width`/`height`.
- Implémentez `setValue(n: number)` qui borne `n` à `[min, max]` et appelle `this.animate({ displayValue: n }, 400)` où `displayValue` pilote la largeur de remplissage rendue.
- Surchargez `getA11yAttributes()` pour renvoyer `{ role: 'progressbar', valuemin, valuemax, value }` sous forme de chaînes afin que la technologie d'assistance annonce le pourcentage actuel.

### Diagramme en anneau

Étendez `GaugeWidget` (l'exemple complet en bas de cette page) pour rendre une forme d'anneau avec un écart visible entre l'arc de piste et l'arc de progression, et ajoutez un libellé de légende de catégorie sous la valeur.

- Réduisez le rayon de l'arc de piste de 6 px et augmentez le rayon de l'arc de progression de 6 px (ou vice versa) pour créer un écart visible entre les deux anneaux concentriques.
- Ajoutez une propriété `legendLabel: string` et rendez-la sous la valeur numérique dans une couleur plus petite et atténuée à l'aide de `renderer.fillText`.
- Mettez à jour `getA11yAttributes()` pour ajouter `legendLabel` au champ `label` renvoyé afin que la description complète soit annoncée par les lecteurs d'écran.

### Chip compteur de clics

Étendez l'entité `Chip` de la section interactive de cette page pour que chaque clic incrémente un compteur et affiche un petit badge circulaire dans le coin supérieur droit affichant le décompte.

- Ajoutez une propriété `clickCount = 0` et incrémentez-la à l'intérieur du gestionnaire `'click'` en parallèle du basculement et de l'animation d'échelle existants.
- Dans `render()`, dessinez le badge (un petit cercle rempli avec le décompte en texte à l'intérieur) uniquement lorsque `clickCount > 0` ; positionnez-le à `(this.width - 10, -6)` dans l'espace de coordonnées local du chip.
- Surchargez `getA11yAttributes()` pour inclure le décompte actuel dans le champ `label`, par exemple `'OK — 3 clicks'`, afin que le nom accessible reste à jour à mesure que le décompte change.

> **Suivant :** [Événements & Hit-Testing](/learn/events/) — comment les événements de pointeur se propagent dans l'arbre d'entités avec capture et propagation.
