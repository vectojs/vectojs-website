+++
title = "Événements & Hit-Testing"
description = "Comment les événements de pointeur et de clavier circulent dans l'arbre d'entités VectoJS : capture, propagation, VectoJSEvent, charges utiles de changement de formulaire, et findEntityAt."
weight = 10
+++

# Événements & Hit-Testing

VectoJS utilise un modèle d'événement de type DOM **capture + propagation**. Si vous avez utilisé `addEventListener` du navigateur, la mécanique est identique — mais le parcours de l'arbre s'exécute sur le Virtual Math Tree plutôt que sur le DOM.

## Essayez-le en direct

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · @vectojs/core</span></div>
  <iframe src="/sandbox/events.html" class="sandbox-frame" loading="lazy" title="Events & Hit-Testing interactive example" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Trois sous-classes Entity personnalisées — survolez pour agrandir, cliquez pour compter. Chacune câble <code>on('hover')</code>, <code>on('pointerleave')</code> et <code>on('click')</code>.</figcaption>
</figure>

## Le cycle de vie d'un événement

Lorsque l'utilisateur clique (ou tape, ou survole) sur le canvas, la Scene :

1. Appelle `findEntityAt(x, y)` pour trouver la **cible** — l'entité la plus au-dessus dont `isPointInside()` renvoie `true`.
2. Construit le **chemin de l'événement** : `[target, parent, grandparent, …, root]`.
3. Exécute la **phase de capture** : déclenche les écouteurs enregistrés avec `{ capture: true }` en partant de la racine jusqu'à la cible.
4. Exécute la **phase de propagation** : déclenche les écouteurs (phase par défaut) de la cible en remontant jusqu'à la racine.

<figure>
  <iframe src="/sandbox/diagram-events.html" class="diagram-frame" loading="lazy" title="Event capture and bubble phases, rendered live by VectoJS" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>La capture se déclenche racine → cible ; la propagation se déclenche cible → racine. La cible reçoit les deux. <em>(Rendu en direct par VectoJS.)</em></figcaption>
</figure>

## Écouter les événements

```typescript
entity.on(event, callback, options?)
entity.off(event, callback, options?)
```

La phase par défaut est la **propagation**. Passez `{ capture: true }` pour intercepter pendant la phase de capture :

```typescript
// Bubble phase (default) — fires after children
btn.on('click', (e) => console.log('button clicked'));

// Capture phase — fires before children (interceptor pattern)
card.on(
  'click',
  (e) => {
    console.log('card sees click first');
    e.stopPropagation(); // prevents bubble reaching card again
  },
  { capture: true },
);
```

Types d'événements disponibles :

| Événement         | Déclencheur                                          |
| ----------------- | ---------------------------------------------------- |
| `'click'`         | Appui + relâchement du pointeur sur la même entité   |
| `'hover'`         | Le pointeur entre dans l'entité                      |
| `'pointerdown'`   | Pointeur enfoncé                                     |
| `'pointerup'`     | Pointeur relâché                                     |
| `'pointercancel'` | Flux de pointeur actif annulé par le navigateur      |
| `'pointermove'`   | Pointeur déplacé (tant qu'il est sur l'entité)       |
| `'pointerleave'`  | Le pointeur a quitté l'entité                        |
| `'wheel'`         | Molette de souris / défilement du trackpad           |
| `'keydown'`       | Touche enfoncée (tant que l'entité détient le focus) |
| `'keyup'`         | Touche relâchée                                      |
| `'change'`        | Valeur d'un contrôle de formulaire modifiée          |
| `'focus'`         | Le nœud shadow DOM a gagné le focus                  |
| `'blur'`          | Le nœud shadow DOM a perdu le focus                  |

## VectoJSEvent

Le callback reçoit un `VectoJSEvent` avec ces membres :

```typescript
interface VectoJSEvent {
  type: string; // event name
  target: Entity; // entity where the event originated
  currentTarget: Entity; // entity whose listener is currently running

  bubbles: boolean;

  // Propagation control
  stopPropagation(): void; // stop after current node
  stopImmediatePropagation(): void; // also skip remaining listeners on this node
  preventDefault(): void;

  defaultPrevented: boolean;

  // Browser viewport coordinates from the native event
  clientX?: number;
  clientY?: number;

  // Scene logical coordinates, then coordinates local to currentTarget
  sceneX?: number;
  sceneY?: number;
  localX?: number;
  localY?: number;

  // Wheel events
  deltaX?: number;
  deltaY?: number;

  // Keyboard events
  key?: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;

  // The original native DOM event
  nativeEvent?: Event;
}
```

`localX`/`localY` sont recalculés pour le `currentTarget` de chaque écouteur, y compris la rotation imbriquée et l'échelle non uniforme. Utilisez-les à l'intérieur des contrôles. Utilisez `sceneX`/`sceneY` lorsque vous comparez à une autre entité ou stockez un pointeur en espace de scène. `clientX`/`clientY` restent les valeurs brutes du viewport du navigateur.

## `emit()` vs `dispatchEvent()`

VectoJS possède deux chemins de dispatch :

| Méthode                              | Ce qu'elle fait                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `entity.emit(event, payload)`        | Déclenche **uniquement les écouteurs de phase de propagation de cette entité**. Aucun parcours de l'arbre. |
| `entity.dispatchEvent(vectoJSEvent)` | Parcours complet de type DOM **capture + propagation** à travers l'arbre.                                  |

`emit()` est la façon dont les composants intégrés signalent leurs propres changements d'état en interne (par exemple, un `Toggle` émettant son propre `'change'`). Vous n'appelez presque jamais `dispatchEvent()` directement — la `Scene` l'appelle pour les événements de pointeur et de clavier provenant du navigateur.

```typescript
// Correct: listen to a button's click in bubble phase
btn.on('click', (e) => {
  /* ... */
});

// Correct: intercept a subtree's clicks before children handle them
container.on(
  'click',
  (e) => {
    if (isLocked) e.stopPropagation();
  },
  { capture: true },
);

// Correct: a component emitting its own state change (internal use)
this.emit('change', { value: this._value });
```

## Charges utiles des événements de changement de formulaire

Les contrôles de formulaire (`Input`, `TextArea`, `Checkbox`, `Toggle`, `Slider`, `Dropdown`) émettent un événement `'change'` avec des charges utiles typées :

**`Input` et `TextArea` :**

```typescript
{
  value: string;
  selectionStart?: number;   // caret / selection start offset
  selectionEnd?: number;     // caret / selection end offset
  composition?: {
    start: number;
    length: number;
  } | null;                  // active IME pre-edit range, or null
}
```

**`Checkbox` et `Toggle` :**

```typescript
{
  checked: boolean;
}
```

**`Slider` :**

```typescript
{
  value: number;
}
```

**`Dropdown` :**

```typescript
{
  value: string;
}
```

Exemple — lecture de la valeur d'une saisie de texte :

```typescript
const input = new Input({ width: 300, placeholder: 'Search…' });
input.on('change', (e) => {
  const { value, selectionStart } = e;
  console.log(`"${value}" — caret at ${selectionStart}`);
});
```

## Hit-testing : comment la Scene trouve la cible

`scene.findEntityAt(x, y)` parcourt l'arbre **en profondeur d'abord, dans l'ordre inverse des enfants** (les enfants dessinés le plus au-dessus sont testés en premier) :

1. La racine de la superposition (overlay) est vérifiée avant la racine principale, de sorte que les superpositions (dropdowns, modales) gagnent toujours.
2. Les enfants sont parcourus en **ordre inverse** — le dernier enfant ajouté (rendu au-dessus) est testé au survol en premier.
3. Il n'y a **aucun filtre interactif** : une entité non interactive peut toujours être renvoyée si `isPointInside()` renvoie `true`. Le filtrage interactif n'affecte que la projection shadow DOM, pas le hit-testing.
4. Le parcours renvoie la première entité dont `isPointInside()` renvoie `true`, qu'elle ait ou non des écouteurs.

```typescript
// This works — returns the entity under the cursor
const hit = scene.findEntityAt(pointerX, pointerY);
if (hit) console.log('hit', hit.id);
```

## Arrêter la propagation

```typescript
child.on('click', (e) => {
  e.stopPropagation(); // parent won't see this click in bubble phase
});

// stopImmediatePropagation also stops other listeners on the same node
child.on('click', (e) => {
  e.stopImmediatePropagation();
});
child.on('click', () => {
  // This second listener on 'child' is NOT called if the first stops immediate propagation
});
```

## Événements de molette et `preventDefault()`

La `Scene` transmet les événements `wheel` depuis le canvas. Appelez `e.preventDefault()` pour empêcher la page de défiler :

```typescript
myScroller.on('wheel', (e) => {
  this.scrollY += e.deltaY;
  e.preventDefault(); // stops the browser scroll
  this.scene?.markDirty();
});
```

> [!NOTE] > `ScrollView` appelle `e.preventDefault()` automatiquement sur les événements de molette, sauf lorsque `Ctrl` est maintenu (permettant le zoom du navigateur). Si vous construisez un conteneur de défilement personnalisé, suivez le même modèle.

## Événements de clavier

Les événements de clavier sont délivrés à l'entité qui détient le focus (via son nœud shadow DOM). Ils se propagent vers le haut de l'arbre avec la capture/propagation normale :

```typescript
inputEntity.on('keydown', (e) => {
  if (e.key === 'Enter') submitForm();
  if (e.key === 'Escape') cancelForm();
});
```

Pour les raccourcis globaux (non liés à un élément focalisé), écoutez sur la racine de la `Scene` ou utilisez un `document.addEventListener` natif :

```typescript
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});
```

## Modèles de phase de capture

### Clic à l'extérieur pour fermer

```typescript
scene.add(overlay); // a dropdown, modal backdrop, etc.

// Root capture: fires before any entity handles the click
scene.getRoot().on(
  'click',
  (e) => {
    if (
      e.sceneX !== undefined &&
      e.sceneY !== undefined &&
      !overlay.isPointInside(e.sceneX, e.sceneY)
    ) {
      closeOverlay();
    }
  },
  { capture: true },
);
```

### Verrouiller un sous-arbre

```typescript
panel.on(
  'click',
  (e) => {
    if (disabled) e.stopPropagation(); // all children are blocked
  },
  { capture: true },
);
```

## Exemple complet : carte au survol

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class HoverCard extends Entity {
  private hovered = false;

  constructor(private label: string) {
    super();
    this.width = 200;
    this.height = 80;
    this.interactive = true;

    this.on('hover', () => {
      this.hovered = true;
      this.animate({ scaleX: 1.04, scaleY: 1.04 }, 120);
    });

    this.on('pointerleave', () => {
      this.hovered = false;
      this.animate({ scaleX: 1, scaleY: 1 }, 120);
    });

    this.on('click', () => {
      console.log(`${this.label} clicked`);
    });
  }

  isPointInside(gx: number, gy: number): boolean {
    const p = this.worldToLocal(gx, gy);
    return !!p && p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height;
  }

  getA11yAttributes() {
    return { tag: 'button' as const, role: 'button', label: this.label };
  }

  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 12);
    renderer.fill(this.hovered ? '#1e293b' : '#0f172a');
    renderer.stroke('rgba(255,255,255,0.12)', 1);
    renderer.fillText(this.label, 16, 28, '600 18px Inter', '#f8fafc');
  }
}
```

## Dépannage

### Un clic se déclenche mais la mauvaise entité est la cible

`findEntityAt` parcourt les enfants dans l'ordre **inverse** (dernier ajouté = testé en premier). Si deux entités se chevauchent, celle ajoutée plus tard gagne. Pour qu'une entité gagne toujours, `add()`-la après les autres. Pour qu'elle perde toujours, `add()`-la avant.

Si la mauvaise entité intercepte pendant la **phase de capture**, vérifiez les appels à `stopPropagation()` sur les ancêtres — un écouteur de capture qui arrête la propagation empêchera l'événement d'atteindre la cible prévue.

### Les écouteurs d'événements se déclenchent une fois puis s'arrêtent

Les écouteurs d'événements ajoutés avec `on()` sont permanents jusqu'à ce que `off()` soit appelé. Si les écouteurs semblent s'arrêter, vérifiez :

1. L'entité a été retirée de la scène. `scene.remove(entity)` la détache mais n'efface pas ses écouteurs, elle peut donc être ajoutée à nouveau plus tard.
2. Un écouteur parent appelle `e.stopPropagation()` avant que l'événement n'atteigne votre entité.
3. Vous avez accidentellement appelé `off()` — parfois via une fonction de nettoyage qui s'exécute plus tôt que prévu.

### Les événements de molette se déclenchent mais la page défile toujours

Les événements `wheel` du canvas se propagent au navigateur même si vous les écoutez sur une entité. Vous devez explicitement appeler `e.preventDefault()` pour empêcher le défilement de la page :

```typescript
myEntity.on('wheel', (e) => {
  // ... handle scroll ...
  e.preventDefault(); // ← required to stop the browser scroll
});
```

Remarque : `ScrollView` le fait automatiquement pour ses propres événements de molette (sauf avec `Ctrl` maintenu).

### `e.clientX` / `e.clientY` sont absents pour les événements de clavier

`clientX`/`clientY` sont des champs d'événement de pointeur et valent `undefined` lorsque l'événement natif ne les fournit pas. Pour les événements de clavier, utilisez `e.key`, `e.shiftKey`, `e.ctrlKey`, `e.altKey` et `e.metaKey`.

> **Suivant :** [Physique & Animation](/learn/physics-engine/) — ressorts, hachage spatial et la boucle `update()`.
