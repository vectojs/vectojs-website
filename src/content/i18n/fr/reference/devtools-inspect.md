---
title: 'Devtools : inspection'
description: "Lire une scène VectoJS comme des données — le modèle d'arborescence, la sélection d'entité, l'état entité/a11y/texte, la géométrie de surbrillance, l'explication du hit-test et le traçage du routage d'événements."
order: 49
---

# Devtools : inspection

Tout ici est une lecture pure depuis `@vectojs/devtools/headless`. Rien ne monte un panneau et — à la seule exception d'`EventTrace`, qui attache des écouteurs de document — rien ne doit être démonté.

```ts
import { inspectEntity, pickInScene } from '@vectojs/devtools/headless';
```

---

## Modèle d'arborescence et sélection

```typescript
function buildTreeModel(root: Entity): {
  nodes: DevtoolsTreeNode[];
  index: Map<string, Entity>;
};
function findEntityAt(root: Entity, x: number, y: number): Entity | null;
function pickInScene(scene: Scene, sceneX: number, sceneY: number): Entity | null;
function describeEntity(entity: Entity): string[];

interface DevtoolsTreeNode {
  id: string;
  label: string;
  children?: DevtoolsTreeNode[];
}
```

`buildTreeModel` renvoie les **enfants** de la racine, pas la racine elle-même — `nodes` contient une entrée par enfant direct, chacun avec sa propre sous-arborescence. La map `index`, en revanche, contient chaque descendant à chaque profondeur, indexé par l'identifiant d'entité, c'est ce qui permet de faire correspondre un id à une entité vivante. `children` vaut `undefined` plutôt que `[]` sur une feuille.

`label` vaut `` `${type} (${x},${y}) ${W}×${H} ⚡ ▶` `` — la taille est omise quand les deux dimensions valent 0, et les deux badges n'apparaissent que lorsque `interactive` et `hasPendingAnimations()` respectivement.

`pickInScene` est la fonction qu'il vous faut pour « quelle entité possède ce pixel ». Elle vérifie **d'abord l'arborescence overlay**, puis l'arborescence principale, donc une modale ouverte l'emporte correctement sur le contenu derrière elle. `findEntityAt` est la primitive mono-arborescence en dessous : elle parcourt les enfants en ordre inverse, du plus profond au plus haut, donc elle renvoie la frappe peinte au premier plan, et elle retombe sur un test AABB quand `isPointInside` répond non — ce qui signifie que les entités décoratives non interactives restent sélectionnables.

> [!IMPORTANT]
> `findEntityAt` teste l'entité que vous lui passez ainsi que ses descendants, donc lui passer la racine de la scène peut renvoyer cette racine. `pickInScene` est le défaut plus sûr.

`describeEntity` renvoie des lignes lisibles par un humain : six lignes fixes d'état générique d'entité, puis toute sortie `getDevtoolsDescriptor()` que l'entité publie, plafonnée à 12 lignes de descripteur. Les valeurs de champs sont tronquées à 32 caractères et les notes à 60. Un descripteur qui lève contribue la ligne `— descriptor threw —` plutôt que d'interrompre le relevé.

> [!NOTE]
> `type`, dans toute la couche modèle des devtools, est `entity.constructor.name`, qu'un minifieur peut renommer. Traitez-le comme une étiquette de débogage, jamais comme une clé stable — et jamais comme une condition de branche de production.

---

## État d'entité

```typescript
function inspectEntity(entity: Entity): EntityInfo;
function entityPath(entity: Entity): string;
function textPreviewOf(entity: Entity): string | undefined;

interface EntityInfo {
  id: string;
  type: string;
  path: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  worldTransform: {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
  };
  worldBounds: Bounds;
  interactive: boolean;
  animating: boolean;
  clipChildren: boolean;
  childCount: number;
  text?: string;
  a11y?: { tag?: string; role?: string; label?: string };
  descriptor?: DevtoolsDescriptor;
  layoutControlled?: ReadonlyArray<LayoutControlledProperty>;
}
```

`inspectEntity` est la contrepartie structurée et compatible JSON de `describeEntity`. Chaque nombre est arrondi à 2 décimales. Les quatre champs optionnels sont **omis, non réglés à `undefined`**, donc `'text' in info` distingue « pas de texte » de « texte vide » — une entité dont le texte est réellement `''` signale `text: ''`.

`layoutControlled` nomme les propriétés possédées par un conteneur de mise en page parent. En écrire une depuis le code applicatif est un bogue : le passage de mise en page suivant l'écrase. Si un coup de pouce ou une animation sur `x` continue de revenir en arrière, ce champ explique pourquoi.

`entityPath` rend la chaîne d'ascendance comme `Scene > Card#a1b2c3d4 > Text#e5f6a7b8`, avec les ids tronqués à 8 caractères. C'est l'identifiant à citer dans un rapport de bogue, car il survit d'une exécution à l'autre là où `id` ne le fait pas.

> [!IMPORTANT]
> `entityPath` étiquette toute entité sans parent comme `Scene`, donc une entité **détachée** est indistinguable de la vraie racine. Si un chemin semble suspectement court, vérifiez si l'entité est toujours dans l'arborescence.

`textPreviewOf` fait du duck-type `.text` puis `.value`, et tronque à 80 caractères plus une ellipse. C'est ce qui fournit `EntityInfo.text` et le repli du nom a11y, donc une longue chaîne y arrive comme aperçu plutôt qu'en entier.

---

## État d'accessibilité

```typescript
function inspectA11y(scene: Scene, entity: Entity): A11yInfo;
function a11yReadingOrder(scene: Scene): A11yInfo[];

interface A11yInfo {
  entityId: string;
  entityPath: string;
  projected: boolean;
  tag?: string;
  role?: string;
  accessibleName?: string;
  nameSource?: 'label' | 'text' | 'none';
  tabIndex?: number;
  disabled?: boolean;
  focused?: boolean;
  readingOrder?: number;
  canvasBounds: Bounds;
  domBounds?: Bounds;
}
```

`inspectA11y` renvoie toujours un enregistrement, jamais `null` — une entité non projetée signale `projected: false` et peu de choses d'autre. C'est la fonction qui répond à « pourquoi le lecteur d'écran n'annonce-t-il pas ceci ? », et les deux champs qui y répondent habituellement sont `accessibleName` et `nameSource`.

`nameSource` est toujours présent, y compris comme `'none'`. L'ordre de résolution est `label`, puis un aperçu de texte, puis rien. Parce que le chemin du texte passe par `textPreviewOf`, un nom dérivé d'un long texte arrive **tronqué à 80 caractères** — la chaîne annoncée est le texte complet, donc ne lisez pas `accessibleName` comme une vérité absolue pour un contenu long.

`readingOrder` est un index base 1 sur toute la couche projetée dans l'ordre DOM, pas un index de fratrie. `a11yReadingOrder` renvoie chaque entité projetée triée par lui, c'est la séquence qu'un lecteur d'écran parcourra. Les entités projetées mais absentes de la requête DOM se trient à la fin.

`canvasBounds` est là où le canvas dessine l'entité ; `domBounds` est là où son miroir projeté se trouve réellement. **Un écart entre les deux est le défaut** — cela signifie qu'un anneau de focus de lecteur d'écran, ou une cible de clic, est ailleurs que sur les pixels. `domBounds` est omis quand il n'y a aucun élément ou que le rectangle est entièrement à zéro.

---

## Texte et mise en forme

```typescript
function inspectText(entity: Entity): TextInspection | null;
function shapeProbe(
  text: string,
  options?: {
    font?: string;
    cellWidth?: number;
    lineHeight?: number;
    baseline?: number;
  },
): TextInspection;
function formatTextInspection(inspection: TextInspection): PluginRow[];
function isTextEntity(entity: Entity): boolean;
```

`inspectText` renvoie `null` uniquement quand l'entité ne porte ni `.text` ni `.value`. Sinon vous obtenez les niveaux bidi résolus, les suites de niveaux, les segments de renversement, l'ordre visuel, les clusters de graphèmes et le détail par glyphe — les données derrière « pourquoi cette chaîne arabe est-elle dans le mauvais ordre » ou « pourquoi ce glyphe est-il une boîte vide ».

Le détail par glyphe arrive dans l'un de trois niveaux, et le niveau détermine quels champs existent :

| Niveau                     | `glyphs[].x` | `metrics` / `lines` | `atlasMiss`  |
| -------------------------- | ------------ | ------------------- | ------------ |
| Grille de contenu préparée | oui          | oui                 | jamais réglé |
| Texte préparé              | non          | non                 | oui          |
| Ni l'un ni l'autre         | aucun glyphe | non                 | non          |

Le tableau `unavailable` nomme chaque capacité qui n'a pas pu être rapportée et pourquoi, donc un champ manquant est toujours expliqué plutôt qu'absent en silence. Il contient toujours au moins trois entrées — les ids de glyphes, les suites de scripts et les plages de repli de police ne sont exposés du tout par le moteur.

`shapeProbe` exécute une chaîne arbitraire à travers le même pipeline sans entité ni scène, ce qui en fait le moyen le plus rapide de vérifier une question de mise en forme dans un test unitaire. Il renvoie toujours une inspection complète avec des positions.

> [!NOTE]
> Les frontières de clusters sont re-segmentées par devtools à l'aide d'`Intl.Segmenter`, non prises du moteur, donc sur un runtime sans `Intl.Segmenter` elles retombent sur l'itération par point de code et sont erronées pour les marques combinantes et les emoji drapeaux. Comparez-les à la sortie du moteur avant de faire confiance à un compte de clusters.

---

## Géométrie de surbrillance

```typescript
function highlightGeometry(
  scene: Scene,
  entity: Entity,
  options?: HighlightGeometryOptions,
): HighlightLayer[];
function sampleHitRegion(
  entity: Entity,
  options?: { step?: number; budget?: number },
): HighlightLayer;
function formatHighlightGeometry(layers: ReadonlyArray<HighlightLayer>): string[];

type HighlightLayerKind = 'aabb' | 'layout' | 'render' | 'clip' | 'content' | 'a11y' | 'hit';

interface HighlightLayer {
  kind: HighlightLayerKind;
  polygons: ReadonlyArray<HighlightPolygon>;
  divergesFromLayout?: boolean;
  unavailable?: string;
}

interface HighlightGeometryOptions {
  layers?: ReadonlyArray<HighlightLayerKind>;
  hitSampleStep?: number;
  hitSampleBudget?: number;
}
```

Une entité a jusqu'à sept boîtes différentes, et les bogues de mise en page vivent dans les écarts entre elles :

| Kind      | Ce que c'est                                                              |
| --------- | ------------------------------------------------------------------------- |
| `aabb`    | Boîte englobante alignée sur les axes du quad de mise en page transformé. |
| `layout`  | Le vrai quad, rotation et inclinaison comprises. La référence.            |
| `render`  | `getBounds()` — là où l'entité peint réellement.                          |
| `clip`    | La boîte de l'ancêtre `clipChildren` le plus proche.                      |
| `content` | La boîte du miroir de contenu DOM sélectionnable.                         |
| `a11y`    | La boîte de l'élément de projection a11y.                                 |
| `hit`     | La vraie région de hit, échantillonnée en sondant `isPointInside`.        |

`divergesFromLayout` sur n'importe quelle couche est le signal — cela signifie que cette boîte n'est pas d'accord avec le quad de mise en page de plus d'un pixel, ce qui est exactement la condition qui fait qu'un clic atterrit ailleurs que là où l'utilisateur visait. Une couche `render` qui diverge est du contenu peint hors de sa boîte ; une divergence `content` ou `a11y` est une cible de sélection ou de focus mal placée.

`highlightGeometry` ne lève jamais. Une couche incalculable revient avec `unavailable` réglé sur la raison et aucun polygone, donc `render` sur une entité typique lit `getBounds() returned null, so the layout box is the render box`. La sortie est toujours dans l'ordre fixe ci-dessus quel que soit l'ordre demandé.

`'hit'` n'est **pas** dans l'ensemble de couches par défaut, parce que c'est la seule coûteuse. Elle échantillonne `isPointInside` sur une grille — pas par défaut de 8 unités de scène, budget par défaut de 4096 sondes — et renvoie un rectangle par suite horizontale contiguë. Dépasser le budget refuse d'échantillonner et le dit plutôt que de se bloquer :

```ts
// An inscribed circle: same extent as its box, ~79% of its area.
const hit = sampleHitRegion(circle, { step: 4 });
hit.divergesFromLayout; // true — coverage is below 90% of the box
```

La divergence pour `'hit'` est décidée par la **couverture de surface, pas l'étendue**, précisément pour qu'un cercle-dans-un-carré s'enregistre. Le coût est quadratique dans la taille d'entité pour un pas fixe : diviser `step` par deux quadruple le nombre de sondes, donc un pas de 2px sur une entité 200×100 a besoin de ~5100 sondes et doit recevoir un `hitSampleBudget` relevé avant de s'exécuter.

---

## Expliquer un test de hit

```typescript
function explainHitTest(scene: Scene, x: number, y: number): HitExplanation;
function formatHitExplanation(explanation: HitExplanation): string[];

type HitVerdict =
  'accepted' | 'invisible' | 'clipped' | 'pointer-transparent' | 'outside-shape' | 'occluded';

interface HitCandidate {
  entityId: string;
  entityPath: string;
  type: string;
  verdict: HitVerdict;
  reason: string;
  depth: number;
  worldBounds: Bounds;
  clipperId?: string;
  clipperPath?: string;
}

interface HitExplanation {
  x: number;
  y: number;
  hitId: string | null;
  hitPath?: string;
  candidates: HitCandidate[];
  root: 'overlay' | 'main' | 'none';
}
```

`pickInScene` vous dit quelle entité a gagné. `explainHitTest` vous dit **pourquoi chaque autre entité a perdu**, ce qu'il vous faut quand la réponse est fausse. Chaque candidat porte un verdict et une raison d'une phrase :

```ts
const why = explainHitTest(scene, 50, 50);
console.log(formatHitExplanation(why).join('\n'));
// hit test (50, 50) → Scene > Box#entity_d > Box#entity_k [main]
// ✗ OverlayRoot — point (50, 50) is outside its shape
//   ✗ Box — point (50, 50) is outside its shape
//     ✓ Box — inside its shape, unclipped, and accepts pointer input
//     · Box — would have been hit, but Box is drawn on top
```

Les glyphes sont `✓` accepté, `·` occulté, `✗` tout le reste, et l'indentation est la profondeur du candidat — plafonnée à 6 niveaux, donc les arborescences plus profondes s'aplatissent visuellement. Les lignes portent `type` (le nom du constructeur), pas le chemin, et les entités frères partagent habituellement un type : lisez `explanation.candidates[i].entityPath` quand vous devez en identifier une précisément.

Les candidats sont ordonnés du plus haut au plus bas, le même ordre que le moteur les considère. Notez que `occluded` est attribué dans une passe finale : une entité qui aurait accepté le point mais se trouve sous le gagnant est réécrite de `accepted` à `occluded`. Donc « combien de choses sont sous ce pixel » est répondable en les comptant.

Un verdict `invisible` (`opacity <= 0`) **élague la sous-arborescence** — la raison nomme combien de descendants ont été sautés, donc toute une branche invisible se signale comme un candidat plutôt que par douzaines.

> [!IMPORTANT]
> C'est un diagnostic, pas un appel par image. Là où le moteur renvoie au premier hit, `explainHitTest` parcourt toute l'arborescence pour énumérer les perdants. Il reflète aussi toujours le parcours JS, donc sur une scène utilisant la grille de hit WASM les deux peuvent diverger dans un cas limite : un ancêtre `clipChildren` de taille zéro s'explique comme `clipped` tandis que le chemin WASM enregistre le hit.

---

## Traçage du routage d'événements

```typescript
function createEventTrace(scene: Scene, options?: EventTraceOptions): EventTrace;

class EventTrace {
  get entries(): readonly EventTraceEntry[];
  subscribe(listener: (entry: EventTraceEntry) => void): () => void;
  clear(): void;
  destroy(): void;
}

interface EventTraceOptions {
  capacity?: number; // retained records, default 50
  includeGlobalKeyboard?: boolean; // default true
}

type EventTraceType =
  'pointerdown' | 'pointerup' | 'pointercancel' | 'pointermove' | 'wheel' | 'keydown' | 'keyup';

type EventTraceSource = 'a11y' | 'content' | 'canvas' | 'document';
```

```ts
const trace = createEventTrace(scene, { capacity: 100 });
trace.subscribe((entry) => {
  console.log(entry.source, entry.targetPath, entry.defaultPrevented);
});
```

Chaque entrée enregistre l'entité cible résolue, les coordonnées de scène et locales, les touches modificatrices et le `defaultPrevented` final. `source` dit sur quelle surface l'événement du navigateur est arrivé : `canvas`, la projection `a11y`, un miroir `content` sélectionnable, ou `document` pour le clavier global.

Les enregistrements **se finalisent dans une microtâche**, donc `defaultPrevented` reflète la décision finale de raccourci ou de sélection de l'application plutôt que sa valeur en plein milieu de la distribution. La conséquence pratique est que `entries` est vide immédiatement après avoir distribué un événement — un test doit attendre une macrotâche avant d'asserter.

Les traces de pointeur incluent `pointercancel`, ce qui rend visibles les transactions de glisser et de sélection interrompues au lieu de laisser un vide de diagnostic après `pointerdown`. Attendez-vous à `pointerdown` → mouvements → exactement un `pointerup` (validation) **ou** `pointercancel` (annulation) ; une entrée terminale manquante signifie que l'entité n'a jamais été projetée ou que la capture a été contournée.

> [!IMPORTANT]
> `EventTrace` attache 14 écouteurs de document et est le seul objet de la couche modèle qui **doit** être détruit. Appelez `trace.destroy()` quand la surface de diagnostic se démonte. Notez aussi que `entries` renvoie le tableau interne vivant, pas une copie — il mute sous vos yeux à mesure que des enregistrements arrivent et sont expulsés à capacité, donc copiez-le si vous avez besoin d'une vue stable.

Hors navigateur, le constructeur n'attache rien et l'instance est inerte, donc un helper de test partagé peut en construire une inconditionnellement.

---

## Flux de travail de débogage

| Symptôme                                                          | Flux de travail                                                                                                                                                       |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « Quelle entité possède ce pixel ? »                              | `pickInScene(scene, x, y)` → `inspectEntity(hit)`                                                                                                                     |
| « Ce pixel appartient à la mauvaise entité »                      | `explainHitTest(scene, x, y)` — chaque perdant avec la raison de sa défaite                                                                                           |
| « Pourquoi cette entité est-elle mal positionnée/dimensionnée ? » | `inspectEntity` pour les limites du monde + la transformation, puis remontez `entityPath` — le premier ancêtre dont les limites sont fausses possède le bogue         |
| « Mes écritures sur `x` sont sans cesse annulées »                | `inspectEntity(e).layoutControlled` — un conteneur parent possède cette propriété                                                                                     |
| « La cible du clic est décalée des visuels »                      | `highlightGeometry(scene, e)` et cherchez `divergesFromLayout` sur `a11y` ou `content`                                                                                |
| « La zone cliquable de cette forme est fausse »                   | `sampleHitRegion(e)` — la vraie région de hit, pas la boîte                                                                                                           |
| « Le lecteur d'écran ne dit rien / dit la mauvaise chose »        | `inspectA11y(scene, e)` pour `accessibleName` + `nameSource` ; `a11yReadingOrder(scene)` pour la séquence d'annonce                                                   |
| « Ce texte s'affiche dans le mauvais ordre »                      | `inspectText(e)` — niveaux bidi, suites de niveaux, ordre visuel                                                                                                      |
| « Les glyphes s'affichent comme des boîtes vides »                | `inspectText(e).glyphs` — entrées signalées `atlasMiss`                                                                                                               |
| « Un clic/molette/touche va au mauvais endroit »                  | `createEventTrace(scene)` — source, chemin cible, coordonnées, `defaultPrevented` final                                                                               |
| « La sélection par glisser ou la copie du texte est interceptée » | Trace d'événements avec `entry.source === 'content'` — l'événement a commencé sur une projection sélectionnable                                                       |
| « Un glisser reste coincé / ne valide jamais »                    | Les traces de pointeur sont transactionnelles : un `pointerup`/`pointercancel` manquant signifie que l'entité n'a pas été projetée ou que la capture a été contournée |

---

[Vue d'ensemble des devtools](/reference/devtools/) · [Auditer](/reference/devtools-audit/) · [Performance](/reference/devtools-perf/) · [Pont et plugins](/reference/devtools-extend/)
