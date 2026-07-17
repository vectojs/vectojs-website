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

## Audit de scène

`auditScene` parcourt l'arbre et signale les défauts de mise en page sous forme de constatations structurées et JSON-safe — la réponse numérique à « est-ce que quelque chose déborde, se chevauche ou s'échappe ? » :

```typescript
import { auditScene } from '@vectojs/devtools/headless';

const findings = auditScene(scene, {
  tolerance: 0.5, // marge en px avant qu'un échappement/chevauchement compte
  includeOverlay: false, // modales/surbrillance exclues par défaut
  ignore: (e) => e.id.startsWith('debug-'), // élaguer les sous-arbres
  ignoreOverlap: (a, b) => a.id === 'badge', // autoriser l'empilement intentionnel
});
// -> AuditFinding[]: { kind, entityId, entityPath, worldBounds, message,
//    containerBounds?, overflow?{left,right,top,bottom}, otherId?, intersection? }
```

Quatre `kind` sont détectés, triés déterministiquement :

- `text-overflow` — la boîte mesurée d'une entité textuelle dépasse son ancêtre dimensionné le plus proche.
- `clip-overflow` — le contenu dépasse un ancêtre `clipChildren` (pixels coupés).
- `overlap` — **frères uniquement** ; le containment parent-enfant est normal.
- `viewport-overflow` — une entité sans ancêtre dimensionné dessinée en dehors du canvas.

Angles morts connus : les conteneurs défilables exemptent l'axe vertical (remplacez la liste via `scrollableTypes`, correspondance par `constructor.name`), et les entités `opacity: 0` sont ignorées.

Le bouton **Audit** du panneau effectue la même vérification à la place de la vue arborescente ; `panel.audit()` retourne les constatations et `panel.selectFinding(i)` en surbrillance une.

Utilisez-le comme porte CI : `expect(auditScene(scene)).toEqual([])`.

## Instantanés et différences

```typescript
import { captureSnapshot, diffSnapshots } from '@vectojs/devtools/headless';

const before = captureSnapshot(scene); // arbre JSON déterministe
// … effectuer une interaction …
const diffs = diffSnapshots(before, captureSnapshot(scene));
// -> [{ path: "root > GridEntity[0]", kind: "changed", changes: { x: {from,to} } }]
```

Les différences se basent sur des **chemins structurels** (chaînes `type[index]`), jamais sur des IDs d'entité — les IDs sont aléatoires par exécution. Les propriétés à valeur par défaut sont omises des instantanés, donc les différences restent silencieuses. Les paires d'instantanés permettent des assertions d'état golden précises dans les tests de smoke : au lieu de faire une capture d'écran, affirmez qu'une interaction a changé exactement les entités qu'elle aurait dû.

## Utilitaires de modèle de bas niveau

La logique de construction d'arbre et de sélection est exportée séparément si vous
voulez construire une UI d'inspecteur personnalisée au lieu du panneau intégré :

```typescript
import {
  buildTreeModel,
  findEntityAt,
  describeEntity,
  inspectEntity,
  entityPath,
  pickInScene,
} from '@vectojs/devtools';

buildTreeModel(root: Entity): { nodes: TreeNode[]; index: Map<string, Entity> };
findEntityAt(root: Entity, x: number, y: number): Entity | null; // point espace-scène → entité
describeEntity(entity: Entity): string[]; // lignes d'état lisibles par un humain
inspectEntity(entity: Entity): EntityInfo; // état structuré et JSON-safe
entityPath(entity: Entity): string; // chaîne d'ascendance ("Scene > Card#<id> > Text#<id>", ids tronqués à 8 car.)
pickInScene(scene: Scene, sceneX: number, sceneY: number): Entity | null; // sélection priorité overlay
```

`inspectEntity` est le frère structuré de `describeEntity` : limites et transformation monde, drapeaux d'interaction, `clipChildren`, nombre d'enfants, un aperçu de texte typé dynamiquement (`.text`/`.value`), et les attributs de projection d'accessibilité lorsqu'ils sont présents. `entityPath` génère la chaîne d'ascendance de l'entité (ex. `"Scene > Card#<id> > Text#<id>"`, IDs tronqués à 8 caractères).

## Flux de travail de débogage

La couche modèle de devtools répond aux questions de mise en page avec des chiffres — utilisez-la avant de recourir à une capture d'écran. Symptôme → outil :

| Symptôme                                                             | Flux de travail                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « Quelle entité possède ce pixel ? »                                 | `pickInScene(scene, x, y)` → `inspectEntity(hit)` ; dans la page, le bouton **Pick** du panneau                                                                                                                                                                                 |
| « Pourquoi cette entité a-t-elle une position/taille incorrecte ? »  | `inspectEntity` pour les limites monde + transformation, puis remontez `entityPath` — le premier ancêtre dont les limites sont erronées possède le bug                                                                                                                          |
| « Quelque chose déborde/se chevauche mais je ne vois pas où »        | `auditScene(scene)` — chaque constatation inclut `entityPath`, les limites monde et les quantités de débordement par bord                                                                                                                                                       |
| « Cette interaction a déplacé ce qu'elle n'aurait pas dû »           | `captureSnapshot` avant, interagir, `diffSnapshots` après — le diff liste exactement ce qui a changé                                                                                                                                                                            |
| « Un clic/molette/touche va au mauvais endroit »                     | `createEventTrace(scene)` — chaque entrée montre la source (`canvas`/`a11y`/`content`/`document`), le chemin cible, les coordonnées et le `defaultPrevented` final                                                                                                              |
| « La sélection par glissement ou la copie de texte est interceptée » | Trace d'événements avec `entry.source === 'content'` — l'événement navigateur a commencé sur une projection sélectionnable ; vérifiez `defaultPrevented` et le chemin cible                                                                                                     |
| « Un glissement se bloque / ne se termine jamais »                   | Les traces de pointeur sont transactionnelles : attendez `pointerdown` → mouvements → exactement un `pointerup` (validation) **ou** `pointercancel` (annulation) ; une entrée terminale manquante signifie que l'entité n'a pas été projetée ou que la capture a été contournée |
| « Est-ce une régression ? »                                          | Conservez un instantané validé (`captureSnapshot`) de la scène saine et exécutez `diffSnapshots` dessus dans le CI                                                                                                                                                              |

## Notes de conception

- Le panneau est construit avec `contentProjection: false` et `renderMode: 'onDemand'` — il ne
  doit pas projeter son propre contenu DOM ni se repeindre à chaque image pendant l'inactivité.
- L'état de sélection vit sur le panneau, pas sur l'hôte : `select()`/`armPick()` ne mutent
  jamais la scène inspectée sauf pour l'entité de surbrillance d'overlay, qui est ajoutée
  via `showOverlay()` et retirée sur `destroy()`.
- Le rafraîchissement automatique est un simple intervalle, pas une animation Scène — il
  fonctionne même quand la scène hôte est totalement inactive (`onDemand`, rien de sale).
- Le dock (`position: fixed; right: 0; width: 320px` par défaut, hauteur totale du viewport) et son canvas ont `pointer-events: none`, reflétant comment le propre `a11yRoot` de la `Scene` principale se retire tandis que les éléments d'ombre interactifs individuels se réinscrivent via `auto` (`@vectojs/devtools@0.4.3+`). Cela signifie que les clics sur le fond/chrome vide du dock traversent vers tout contenu hôte situé en dessous — y compris les propres contrôles du bord droit de l'application hôte (boutons de fermeture d'onglet, boutons de barre d'outils) qui autrement se trouveraient dans la bande de 320px du dock. Seuls les contrôles projetés a11y du panneau lui-même (boutons, lignes d'arbre VMT) sont cliquables indépendamment, via leur propre réinscription `auto`.
