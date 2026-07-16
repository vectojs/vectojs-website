---
title: '@vectojs/devtools'
description: "L'inspecteur de Virtual Math Tree dans la page — sélection d'entité, une vue arborescente en direct, relevé de transformation et édition par touches de déplacement, lui-même rendu avec VectoJS."
order: 48
---

# `@vectojs/devtools`

Version documentée : **0.4.2**

`@vectojs/devtools` est la réponse à « où est le panneau Éléments ? » — un inspecteur
dans la page pour le Virtual Math Tree, afin que le débogage d'une scène VectoJS reste
dans l'espace d'état plutôt que dans l'espace de pixels. Le panneau est lui-même une
`Scene` VectoJS (dogfooding le framework qu'il inspecte), ancré au bord droit de la page.

## Installation

```bash
bun add -D @vectojs/devtools
```

Ajoutez le panneau visuel conditionnellement en développement — il monte un panneau VectoJS
et écoute sur `document`, donc gardez-le hors des bundles de production. Les audits
sans tête, instantanés, la sélection et le traçage d'événements sont disponibles sans
le panneau :

```ts
import { auditScene, captureSnapshot, createEventTrace } from '@vectojs/devtools/headless';
```

```typescript
import { attachDevtools } from '@vectojs/devtools';

const scene = new Scene(canvas);
// ...construire la scène...

if (import.meta.env.DEV) {
  const devtools = attachDevtools(scene);
  // devtools.detach() pour le retirer plus tard
}
```

## Ce qu'il affiche

- **Vue arborescente en direct** de `scene.rootEntity` et `scene.overlayRootEntity`, rafraîchie
  à intervalle (défaut 500 ms). Chaque ligne montre le nom du constructeur de l'entité, sa
  position, sa taille et deux badges : **⚡** (`interactive`) et **▶** (`hasPendingAnimations()`).
- **Mode sélection** : cliquez sur **Pick**, puis cliquez n'importe où sur la page.
  L'inspecteur résout le clic vers l'entité la plus profonde sous ce point en utilisant le
  même ordre de parcours que la Scène utilise pour l'entrée du pointeur (avec un repli AABB
  pour les entités décoratives non interactives).
- **Surbrillance de sélection** : la boîte englobante dans l'espace monde de l'entité
  sélectionnée est dessinée comme un contour sur la couche d'overlay de la scène _hôte_,
  pour que vous voyiez exactement ce qui est sélectionné par rapport au rendu en direct.
- **Relevé d'état** : géométrie, échelle/rotation/opacité, la matrice de transformation
  monde complète et l'état d'animation en texte brut — les nombres qu'une capture d'écran
  ne peut pas vous donner directement.
- **Édition par touches de déplacement** : avec une entité sélectionnée, les touches
  fléchées la déplacent de 1 px (Maj : 10 px) ; `+`/`-` modifient l'opacité par pas de 0,1.
  Utile pour confirmer _quelle_ entité possède un bug de mise en page avant de toucher au code.

## API

```typescript
function attachDevtools(
  scene: Scene,
  options?: DevtoolsOptions,
): DevtoolsPanel & { detach(): void };

interface DevtoolsOptions {
  width?: number; // largeur du panneau en px, défaut 320
  refreshInterval?: number; // ms ; 0 désactive le rafraîchissement automatique
  traceEvents?: boolean; // affiche les enregistrements limités de routage pointeur/molette/clavier
  traceCapacity?: number;
}

class DevtoolsPanel {
  refresh(): void; // reconstruit le modèle arborescent depuis la scène hôte
  armPick(): void; // one-shot : le prochain clic sur la page sélectionne l'entité dessous
  select(entity: Entity): void; // sélectionne programmatiquement
  get selection(): Entity | null;
  destroy(): void; // démonte les écouteurs, minuteries, surbrillance de l'hôte et le panneau
}
```

`detach()` (retourné par `attachDevtools`) est un alias pour `destroy()`.

## Trace de routage d'événements

```ts
const trace = createEventTrace(scene, { capacity: 100 });
trace.subscribe((entry) => {
  console.log(entry.source, entry.targetPath, entry.defaultPrevented);
});
```

`source` est `"canvas"`, `"a11y"`, `"content"` ou `"document"`. La source
`content` signifie que l'événement navigateur a commencé sur un miroir
`[data-vecto-content]` sélectionnable. La trace valide l'entité propriétaire, enregistre
les coordonnées scène/locales, et finalise dans une microtâche pour que `defaultPrevented`
reflète la décision finale de raccourci ou de sélection de l'application. Appelez
`trace.destroy()` quand la surface de diagnostic se démonte. Les traces de pointeur
incluent `pointercancel`, ce qui rend visibles les transactions de glisser et de
sélection interrompues au lieu de laisser un vide diagnostique après `pointerdown`.

## Utilitaires de modèle de bas niveau

La logique de construction d'arbre et de sélection est exportée séparément si vous
voulez construire une UI d'inspecteur personnalisée au lieu du panneau intégré :

```typescript
import { buildTreeModel, findEntityAt, describeEntity, pickInScene } from '@vectojs/devtools';

buildTreeModel(root: Entity): { nodes: TreeNode[]; index: Map<string, Entity> };
findEntityAt(root: Entity, x: number, y: number): Entity | null; // point espace-scène → entité
describeEntity(entity: Entity): string[]; // lignes d'état lisibles par un humain
pickInScene(scene: Scene, sceneX: number, sceneY: number): Entity | null; // sélection priorité overlay
```

## Notes de conception

- Le panneau est construit avec `contentProjection: false` et `renderMode: 'onDemand'` — il ne
  doit pas projeter son propre contenu DOM ni se repeindre à chaque image pendant l'inactivité.
- L'état de sélection vit sur le panneau, pas sur l'hôte : `select()`/`armPick()` ne mutent
  jamais la scène inspectée sauf pour l'entité de surbrillance d'overlay, qui est ajoutée
  via `showOverlay()` et retirée sur `destroy()`.
- Le rafraîchissement automatique est un simple intervalle, pas une animation Scène — il
  fonctionne même quand la scène hôte est totalement inactive (`onDemand`, rien de sale).
