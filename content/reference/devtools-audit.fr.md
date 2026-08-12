+++
title = "Devtools : audit"
description = "Asserter qu'une scène VectoJS est correcte — mises en page, accessibilité, mise en forme du texte et audits de sélection qui renvoient des découvertes structurées, plus des instantanés et des différences pour les tests de régression."
weight = 50
+++

# Devtools : audit

Un audit parcourt la scène et renvoie des découvertes structurées, compatibles JSON. Chacune est une porte de CI sur laquelle vous pouvez asserter :

```typescript
import { auditScene } from '@vectojs/devtools/headless';

expect(auditScene(scene)).toEqual([]);
```

C'est tout l'intérêt de cette moitié du paquet. Un test de capture d'écran vous dit qu'une page a changé ; un audit vous dit _quelle entité_ déborde de son conteneur et _de combien de pixels_ sur quel bord.

| Audit                    | Ce que ça attrape                                                                                  | Nécessite un navigateur |
| ------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------- |
| `auditScene`             | Débordement, rognage, chevauchement de frères, sortie du viewport                                  | non                     |
| `auditA11y`              | Noms manquants, conflits de rôle, cibles de focus inatteignables                                   | non                     |
| `auditTextShaping`       | Glyphes manquants dans l'atlas                                                                     | non                     |
| `auditSceneSelection`    | Géométrie de sélection de texte dérivant du canvas                                                 | **oui**                 |
| `auditGpu`               | Regroupement, surdessin, déséquilibre save/restore — [voir Performance](/reference/devtools-perf/) | non                     |
| `auditAccelerators`      | Un noyau WASM refusant ses arguments — [voir Performance](/reference/devtools-perf/)               | non                     |
| `auditMarkdownStreaming` | Réutilisation du streaming dégradée — [voir Performance](/reference/devtools-perf/)                | non                     |

---

## Audit de mise en page

```typescript
function auditScene(scene: Scene, opts?: AuditOptions): AuditFinding[];
function auditTree(root: Entity, sceneBounds: Bounds | null, opts?: AuditOptions): AuditFinding[];

type AuditKind = 'text-overflow' | 'clip-overflow' | 'overlap' | 'viewport-overflow';

interface AuditOptions {
  tolerance?: number; // px slack before an escape/overlap counts. Default 0.5
  includeOverlay?: boolean; // modals/highlights excluded by default
  scrollableTypes?: string[]; // default ['ScrollView','VirtualList','TreeView','Table']
  ignore?: (entity: Entity) => boolean; // prune subtrees
  ignoreOverlap?: (a: Entity, b: Entity) => boolean; // allow intentional stacking
}

interface AuditFinding {
  kind: AuditKind;
  entityId: string;
  entityPath: string;
  worldBounds: Bounds;
  message: string;
  containerId?: string;
  containerPath?: string;
  containerBounds?: Bounds;
  overflow?: { left: number; right: number; top: number; bottom: number };
  otherId?: string;
  otherPath?: string;
  otherBounds?: Bounds;
  intersection?: Bounds;
}
```

```typescript
const findings = auditScene(scene, {
  tolerance: 0.5,
  includeOverlay: false,
  ignore: (e) => e.id.startsWith('debug-'),
  ignoreOverlap: (a, b) => a.id === 'badge',
});
```

Quatre kinds sont détectés :

- `text-overflow` — la boîte mesurée d'une entité porteuse de texte s'échappe de son ancêtre dimensionné le plus proche.
- `clip-overflow` — le contenu s'échappe d'un ancêtre `clipChildren`, donc des pixels sont coupés.
- `overlap` — **frères uniquement** ; le confinement parent-enfant est normal.
- `viewport-overflow` — une entité sans ancêtre dimensionné dessinée hors du canvas.

`auditScene` est le point d'entrée ; `auditTree` est la primitive mono-arborescence qu'il appelle, prenant `sceneBounds` explicitement. Passer `null` pour ces limites rend `viewport-overflow` indétectable, puisqu'il n'y a aucun viewport à fuir.

Les découvertes sont triées par `kind`, puis `entityPath`, puis `otherPath` — déterministe d'une exécution à l'autre, c'est ce qui les rend sûres à photographier (snapshot).

> [!IMPORTANT]
> Avec `includeOverlay: true` le résultat est **deux suites triées concaténées**, pas une liste triée globalement : les découvertes de l'arborescence principale, puis celles de l'overlay. Regrouper par `kind` en une seule passe verra des kinds se répéter. Retriez si vous avez besoin d'un seul ordre.

Angles morts connus, tous délibérés :

- **Les conteneurs défilables exemptent l'axe vertical.** Un contenu plus haut qu'un `ScrollView` est tout l'intérêt d'un `ScrollView`. La fuite horizontale est toujours signalée. Remplacez la liste de types via `scrollableTypes` — assortie par nom de constructeur, et l'entité doit aussi réellement rogner.
- **`opacity: 0` élague toute la sous-arborescence.** Un contenu volontairement masqué n'est pas un défaut de mise en page.
- **`viewport-overflow` n'a besoin d'aucun ancêtre dimensionné.** Un seul ancêtre dimensionné non rognant le supprime, au motif que cet ancêtre est alors le conteneur signifiant.
- **L'overlap ne compare que des frères directs**, jamais à travers les branches, et exige que l'intersection dépasse `tolerance` sur _les deux_ axes.
- Un `Input` compte comme semblable à du texte, car la qualité de texte est du duck-type sur la présence de texte lisible.

> [!NOTE]
> `worldBounds` veut dire deux choses différentes selon le `kind`. Les kinds de débordement signalent les étendues de rendu (`getWorldBounds()`); `overlap` signale le quad de mise en page déclaré. Une entité qui peint hors de sa boîte apparaît donc avec des nombres différents dans les deux kinds — intentionnellement, puisque l'overlap est une question de mise en page et le débordement une question de peinture.

---

## Audit a11y

```typescript
function auditA11y(scene: Scene, opts?: A11yAuditOptions): A11yFinding[];

type A11yAuditKind =
  | 'no-accessible-name'
  | 'role-tag-conflict'
  | 'disabled-divergence'
  | 'focusable-but-clipped'
  | 'duplicate-label';

interface A11yAuditOptions {
  includeOverlay?: boolean; // default: included
  tolerance?: number; // px slack for the clipping check. Default 0.5
  skip?: ReadonlyArray<A11yAuditKind>;
}

interface A11yFinding {
  kind: A11yAuditKind;
  entityId: string;
  entityPath: string;
  message: string;
  otherId?: string;
  otherPath?: string;
  containerId?: string;
  containerPath?: string;
}
```

- `no-accessible-name` — une entité focalisable sans nom, là où le rôle en exige un ou l'entité est `interactive`. Le défaut réel le plus courant : un bouton icône qui s'annonce comme « bouton » et rien d'autre.
- `role-tag-conflict` — un `role` explicite contredisant le rôle implicite de la balise, p. ex. `tag: 'button'` avec `role: 'link'`.
- `disabled-divergence` — l'entité _paraît_ désactivée mais ne le _dit_ pas, ou l'inverse. Le piège est grisé-mais-focalisable : un utilisateur clavier tabule vers quelque chose qu'un utilisateur souris voit indisponible.
- `focusable-but-clipped` — une entité focalisable entièrement hors d'un ancêtre `clipChildren`. Tab déplace le focus vers quelque chose d'invisible.
- `duplicate-label` — deux entités partageant un nom accessible, signalées à partir de la deuxième avec `otherId` pointant vers la première.

Contrairement à l'audit de mise en page, celui-ci **inclut l'arborescence overlay par défaut** — une modale est précisément là où vivent les pièges de focus. `a11yHidden` élague toute la sous-arborescence.

> [!NOTE]
> Les découvertes sont dans l'ordre de parcours, pas triées, et toutes les découvertes `duplicate-label` sont ajoutées en dernier. `disabled-divergence` a aussi une bande morte délibérée : une opacité entre 0.6 et 0.9 n'est signalée d'aucune manière, car cette plage est ambiguë plutôt que fausse.

---

## Audit de mise en forme du texte

```typescript
function auditTextShaping(scene: Scene): Array<{
  kind: string;
  entityId: string;
  message: string;
  severity: 'info' | 'warn';
}>;
```

Émet un kind, `atlas-miss` : une entité dont les glyphes ne sont pas dans l'atlas de police, ce qui explique qu'ils s'affichent comme des boîtes vides. Le message échantillonne jusqu'à cinq glyphes manquants distincts.

> [!IMPORTANT]
> Cet audit ne voit que les entités dont le texte est passé par le chemin **texte-préparé**. Une entité inspectée via une grille de contenu préparée ne peut jamais produire une découverte `atlas-miss` quel que soit le nombre de glyphes réellement manquants, car le chemin de grille ne porte pas le drapeau. Utilisez `inspectText(entity).glyphs` directement pour vérifier une entité précise.

Il parcourt `scene.rootEntity` uniquement — l'arborescence overlay n'est pas auditée.

---

## Audit de sélection

```typescript
function auditSceneSelection(scene: Scene, opts?: SelectionAuditOptions): SelectionAuditFinding[];
function auditEntitySelection(
  scene: Scene,
  entity: Entity,
  opts?: SelectionAuditOptions,
): SelectionAuditFinding[];

interface SelectionAuditOptions {
  tolerance?: number; // px of left-edge drift allowed. Default 2
  rightTolerance?: number; // defaults to `tolerance`
  entityIds?: string[]; // audit only these entities
}

interface SelectionAuditFinding {
  kind: 'selection-drift';
  entityId: string;
  entityPath: string;
  line: number;
  expectedLeft: number;
  expectedRight: number;
  actualLeft: number;
  actualRight: number;
  leftDrift: number;
  rightDrift: number;
  message: string;
}
```

« Sélection » signifie ici **la sélection de texte du navigateur natif** — glisser pour sélectionner du texte au-dessus de la projection de contenu DOM transparente. Cet audit compare la géométrie de ligne de l'entité, celle d'où le canvas dessine, aux rectangles `Range` DOM vivants que le navigateur surlignerait. Une dérive signifie que la bande de sélection bleue atterrit ailleurs que sur les glyphes.

Les deux sont normalisées en pixels logiques locaux de l'entité, donc la vérification est indépendante du ratio de pixels de l'appareil et du zoom du navigateur. Elle attrape la dérive de texte justifié, de RTL/bidi et de DPR fractionnaire.

`auditSceneSelection` parcourt l'arborescence et trie par `entityPath` puis `line`. `auditEntitySelection` vérifie une entité.

> [!IMPORTANT]
> Cet audit **efface la sélection de texte courante de l'utilisateur** pendant qu'il s'exécute, et il exige un vrai navigateur — il référence `document` sans protection, donc il lève plutôt que de renvoyer `[]` dans Node ou un simple runner de test. Gardez-le dans l'e2e du navigateur, pas dans les tests unitaires. Il parcourt aussi `scene.rootEntity` uniquement, sans option d'overlay.

`entityIds` filtre quelles entités sont _auditées_ mais pas lesquelles sont _parcourues_, donc les enfants d'un parent filtré sont quand même vérifiés.

---

## Instantanés et différences

```typescript
function captureSnapshot(scene: Scene): SceneSnapshot;
function diffSnapshots(a: SceneSnapshot, b: SceneSnapshot): SnapshotDiff[];

interface SceneSnapshot {
  width: number;
  height: number;
  root: SnapshotNode[];
  overlay: SnapshotNode[];
}

interface SnapshotDiff {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  changes?: Record<string, { from: unknown; to: unknown }>;
}
```

```typescript
const before = captureSnapshot(scene); // deterministic JSON tree
// … perform an interaction …
const diffs = diffSnapshots(before, captureSnapshot(scene));
// -> [{ path: 'root > GridEntity[0]', kind: 'changed', changes: { x: {from,to} } }]
```

Au lieu de faire des captures d'écran, assertiez qu'une interaction a changé **exactement** les entités qu'elle aurait dû. Cela transforme « la page a l'air différente » en « cette entité-ci a bougé de 4px alors qu'elle n'aurait pas dû bouger ».

Les différences se fondent sur les **chemins structurels** (chaînes `type[index]`), jamais les ids d'entité, car les ids sont aléatoires à chaque exécution. Une entité qui publie une `devtoolsKey` — ou à défaut une étiquette a11y — est assortie par cette clé à la place, donc réordonner une liste à clés se signale comme un déplacement plutôt que comme chaque ligne qui change. L'assortiment par clé ne s'applique que lorsque les clés sont uniques des deux côtés d'un niveau ; sur une collision, le niveau retombe sur l'alignement par index.

Les props à valeur par défaut sont omises des instantanés, donc les différences restent silencieuses.

> [!NOTE]
> Seul un ensemble fixe de propriétés est comparé : `type`, `x`, `y`, `width`, `height`, `worldBounds`, `opacity`, `interactive`, `animating`, `clipChildren` et `text`. Notamment **un changement de `scene.width`/`scene.height` ne produit aucune différence du tout**, et ni les changements d'`id` ni de `key` ne sont signalés. `added` et `removed` ne récursent pas, donc une sous-arborescence supprimée est une découverte plutôt qu'une par descendant.

---

## Combiner les audits en CI

Chaque audit est une fonction simple renvoyant des données simples, donc une seule porte peut asserter toute la surface :

```typescript
import { auditA11y, auditScene, auditTextShaping } from '@vectojs/devtools/headless';

test('the scene is structurally sound', () => {
  buildDashboard(scene);
  scene.step(16.67); // let layout settle before asserting

  expect(auditScene(scene, { includeOverlay: true })).toEqual([]);
  expect(auditA11y(scene)).toEqual([]);
  expect(auditTextShaping(scene)).toEqual([]);
});
```

> [!IMPORTANT]
> Auditer avant que la scène n'ait fait sa mise en page, et tout passe de façon vide. Pilotez d'abord au moins un `scene.step()` — un tableau de découvertes vide provenant d'une scène vide n'est une preuve de rien.

---

[Vue d'ensemble des devtools](/reference/devtools/) · [Inspecter](/reference/devtools-inspect/) · [Performance](/reference/devtools-perf/) · [Pont et plugins](/reference/devtools-extend/)
