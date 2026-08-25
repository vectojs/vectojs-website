+++
title = "Devtools : performance"
description = "Attribuer le coût des images d'une scène VectoJS — compteurs de dessin GPU et Canvas2D, état des accélérateurs WASM, attribution du repeint sale et métriques de réutilisation du streaming Markdown."
weight = 51
+++

# Devtools : performance

Quatre relevés indépendants, chacun répondant à une question différente de « pourquoi c'est lent » :

| Relevé                  | Question                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `inspectGpu`            | Sur quoi l'image dépense-t-elle réellement ses appels de dessin ?                     |
| `inspectAccelerators`   | Les noyaux WASM tournent-ils, et sinon, pourquoi pas ?                                |
| `diagnoseDirty`         | Pourquoi cette scène se repeint-elle alors que rien de visible n'a changé ?           |
| `inspectMarkdownStream` | Le Markdown en streaming réutilise-t-il le travail, ou re-parse-t-il chaque morceau ? |

Les quatre sont des lectures pures. Aucun n'active l'instrumentation par effet de bord, ce qui signifie qu'une scène non mesurée se rapporte comme non mesurée plutôt que de mentir — et deux d'entre eux doivent d'abord avoir l'instrumentation activée.

---

## Compteurs GPU et de dessin

```typescript
function inspectGpu(scene: Scene): GpuInspection;
function formatGpuInspection(info: GpuInspection): PluginRow[];
function auditGpu(scene: Scene): PluginFinding[];

interface GpuInspection {
  rendererKind: string;
  canvas: DrawCounters | null;
  webgl: {
    drawCalls: number;
    totalDrawCalls: number;
    atlasSwitches: number;
    programs: number;
    textures: number;
    circleQuadFallbacks: number;
    circlePoints: number;
  } | null;
  webgpu: {
    active: boolean;
    pipelines: number;
    bindGroups: number;
    particleEntities: number;
  };
  phases: Array<{
    phase: string;
    totalMs: number;
    calls: number;
    avgMs: number;
    maxMs: number;
  }>;
  frame: {
    fps: number;
    frameTimeMs: number;
    renderedFrames: number;
    skippedFrames: number;
  };
  unavailable: Array<{ capability: string; reason: string }>;
}
```

`frame` est toujours disponible. Tout le reste est opt-in, et le tableau `unavailable` nomme chaque chose qu'il n'a pas pu rapporter et pourquoi :

```typescript
import { inspectGpu } from '@vectojs/devtools/headless';

// Canvas2D counters are off by default — turn them on first.
scene.getRenderer().setDrawCounters?.(true);
scene.setPhaseTiming(true);

scene.step(16.67);

const gpu = inspectGpu(scene);
gpu.canvas?.fills; // draw calls by category
gpu.phases; // per-phase timing
```

> [!IMPORTANT]
> Les trois vérifications Canvas2D d'`auditGpu` sont **toutes conditionnées à l'activation du comptage de dessin**. Sur une scène où vous n'avez jamais appelé `setDrawCounters(true)`, il renvoie `[]` — ce qui se lit exactement comme un résultat propre. Activez le comptage d'abord, sinon un audit vert ne veut rien dire.

Découvertes qu'il peut émettre : `batch-not-amortising` (vidages par cercle au-dessus de 0.5), `high-overdraw` (ratio au-dessus de 4), `unbalanced-save-restore` (un vrai bogue — un `restore()` manquant fuit de l'état dans les dessins ultérieurs), et `circle-quad-fallback` (plus de replis de quad que de cercles en points-sprite).

> [!NOTE]
> `webgl` mélange un compteur par image avec quatre compteurs cumulés depuis la création. `drawCalls` est la dernière image terminée ; `totalDrawCalls`, `atlasSwitches`, `circleQuadFallbacks` et `circlePoints` ne font que croître. Diviser un compteur cumulé par une seule image est l'erreur facile ici.
>
> Un `webgl` `null` signifie que la couche de points ne tourne pas du tout, ce qui est différent d'un `webgl` tout à zéro signifiant qu'elle a tourné et n'a rien dessiné. `webgpu.pipelines` et `bindGroups` sont dérivés du drapeau actif et du nombre d'entités de particules, pas interrogés auprès du périphérique. `particleEntities` est du duck-type sur un `maxParticles` numérique et ne compte que l'arborescence principale.

Trois commandes sont exportées pour basculer l'instrumentation depuis un panneau ou un agent, comme [commandes de plugin](/reference/devtools-extend/#protocole-de-plugin) :

```typescript
const enableDrawCountersCommand: PluginCommand; // 'enable-draw-counters'
const resetDrawCountersCommand: PluginCommand; // 'reset-draw-counters'
const enablePhaseTimingCommand: PluginCommand; // 'enable-phase-timing'
```

Elles renvoient une **chaîne** de statut plutôt que de lever quand un backend ne peut pas compter — les chemins SVG et WebGL-only rapportent `'this backend cannot count draws'`. Il n'y a délibérément aucune commande de désactivation pour l'un ou l'autre, donc rappelez-vous qu'une session de devtools laisse le comptage et le chronométrage de phases activés pour la vie du renderer, ce qui change le coût de chaque image suivante.

---

## État des accélérateurs WASM

```typescript
function inspectAccelerators(scene: Scene): AcceleratorInspection;
function formatAcceleratorInspection(info: AcceleratorInspection): PluginRow[];
function auditAccelerators(scene: Scene): PluginFinding[];

interface AcceleratorFinding {
  accelerator: string; // 'transform' | 'animation' | 'hitTest' | 'particle'
  available: boolean; // a backend is installed and could run
  activeThisFrame: boolean; // it ran on the most recent frame
  reason: AcceleratorReason;
  path: string; // which implementation did the work
  faulted: boolean;
  explanation: string; // why, with what to do about it
}

interface AcceleratorInspection {
  accelerators: AcceleratorFinding[]; // always 4, in a stable order
  activeCount: number;
  availableCount: number;
  faulted: AcceleratorFinding[];
  summary: string;
}
```

Les noyaux WASM de VectoJS sont un backend invisible — JS est le repli permanent, donc un noyau qui cesse silencieusement de tourner coûte des performances sans rien casser. C'est ainsi qu'on le voit. `reason` distingue les cinq états :

| `reason`         | Signification                                                       | Un problème ? |
| ---------------- | ------------------------------------------------------------------- | ------------- |
| `active`         | Tourne sur le chemin nommé dans `path`.                             | non           |
| `not-installed`  | Aucun backend WASM chargé.                                          | non           |
| `below-gate`     | Trop peu de travail cette image pour valoir l'appel.                | non           |
| `not-applicable` | Rien de ce genre à faire.                                           | non           |
| `rejected`       | Installé, passé la porte, puis le noyau a **refusé ses arguments**. | **oui**       |

Pour l'accélérateur d'animation, un verdict par type nomme la famille de
drivers qui a refusé : quand un noyau d'animation refuse une image pendant que
l'autre progresse encore via WASM, `reason` rapporte `springs-rejected` ou
`tweens-rejected` (avec `activeThisFrame: true`, puisque la moitié du travail a
tourné). Le simple `rejected` est réservé au cas où les deux types refusent.

`faulted` est exactement `reason === 'rejected'` (verdicts par type compris), et
`auditAccelerators` ne signale que ceux-là. C'est délibéré : une porte qui reste fermée est le système fonctionnant comme prévu, et la rapporter vous entraînerait à ignorer l'audit. Une scène saine, et une scène entièrement JS, auditent toutes deux proprement.

`rejected` signifie que le noyau a été installé, a passé sa porte, puis n'a rien écrit et l'image est retombée sur JS — un bogue de dimensionnement ou de capacité en amont, pas un résultat de réglage.

> [!NOTE]
> Ne confondez pas `accelerators.particle` avec `Scene.particleBackend`. Les trois getters de statut `transformBackend`, `animBackend` et `hitTestBackend` sont en lecture seule et rapportent `'js' | 'wasm'`. `Scene.particleBackend` est une **requête inscriptible** (`'auto' | 'webgpu' | 'cpu'`) qui change ce que le runtime tente — ce n'est pas un statut, et ce n'est pas ce que lit cette inspection. `inspectAccelerators` lit exclusivement le rapport `scene.accelerators`.

---

## Attribution du repeint sale

```typescript
function diagnoseDirty(scene: Scene, options?: DirtyDiagnosisOptions): DirtyDiagnosis;

interface DirtyDiagnosisOptions {
  frames?: number; // sample window; defaults to the observed frame span
  limit?: number; // how many causes to return. Default 10
}

interface DirtyCause {
  entity?: string;
  reason: string;
  property?: string;
  count: number;
  perFrame: number;
  firstFrame: number;
  lastFrame: number;
}

interface DirtyDiagnosis {
  renderMode: 'always' | 'onDemand';
  frames: number;
  causes: DirtyCause[];
  everyFrame: DirtyCause[];
  summary: string;
}
```

Une scène `onDemand` qui se repeint à chaque image a perdu tout l'intérêt d'être `onDemand`. Ceci attribue les repeints :

```typescript
scene.setDirtyTracking(true);
// … run the scene …
const diag = diagnoseDirty(scene);
diag.summary; // one-line verdict
diag.everyFrame; // causes firing on ~every frame — the ones that matter
```

`everyFrame` contient les causes dont le `perFrame` est à 0.9 ou au-dessus. Voilà ce qui maintient une scène éveillée.

> [!IMPORTANT]
> Deux choses rendent ce relevé vide quand vous attendez des données, et les deux sont normales.
>
> D'abord, `scene.setDirtyTracking(true)` doit être appelé **avant** les images que vous voulez mesurer — le `summary` le dit explicitement quand le suivi est désactivé.
>
> Ensuite, l'attribution n'existe que pour les appels `markDirty(source)` qui passent réellement une source, et la plupart des sites d'appel de core et d'ui n'en passent pas. Donc « suivi activé, rien enregistré » est le cas courant plutôt qu'un cas limite, et cela ne veut pas dire que la scène est inactive. Traitez un résultat peuplé comme un signal fort et un résultat vide comme aucune information.

Trois détails sur la forme du résultat :

> [!NOTE]
> `reason` est une chaîne libre, pas une union fixe — les chaînes actuellement utilisées incluent `driver-tick`, `child-added`, `child-removed`, `animation-start` et `a11y-reorder`, mais n'importe quel appelant peut en créer les siennes. De plus `causes` est tronqué à `limit` tandis que `everyFrame` est calculé à partir de la liste non tronquée, donc `everyFrame` peut contenir des causes absentes de `causes`. Avec `renderMode: 'always'` le summary rapporte la question comme sans objet, car une scène qui rend toujours se repeint de toute façon.

---

## Métriques du streaming Markdown

```typescript
function inspectMarkdownStream(entity: Entity): MarkdownStreamInfo | null;
function formatMarkdownStream(info: MarkdownStreamInfo): PluginRow[];
function auditMarkdownStreaming(scene: Scene): PluginFinding[];
function isMarkdownEntity(entity: Entity): boolean;
```

Le Markdown en streaming n'est rapide que si chaque morceau ajouté réutilise l'analyse précédente. Ces compteurs disent s'il le fait :

```typescript
interface MarkdownStreamInfo {
  entityId: string;
  sourceLength: number;
  topLevelTokens: number;
  childEntities: number;
  appends: number;
  workerResponses: number;
  coalesced: number;
  tokensPrefixMatched: number;
  tokensReturned: number;
  tokenPrefixReuseRatio: number;
  lexerMs: number;
  sourceCharsLexed: number;
  workerMsAvg: number;
  workerMsMax: number;
  stablePrefixChars: number;
  changedTailChars: number;
  entitiesReused: number;
  entitiesRebuilt: number;
  inPlaceUpdates: number;
  tailFraction: number;
  notes: string[];
}
```

> [!IMPORTANT]
> Trois champs ont été **renommés en 0.11.0 et les anciens noms n'ont pas été conservés comme alias**. Du code écrit contre une référence plus ancienne lit `undefined`, ce qui ressemble silencieusement à zéro :
>
> | Supprimé        | Actuel                  |
> | --------------- | ----------------------- |
> | `tokensReused`  | `tokensPrefixMatched`   |
> | `tokensRelexed` | `tokensReturned`        |
> | `reuseRatio`    | `tokenPrefixReuseRatio` |
>
> Les anciens noms nommaient la mauvaise chose — ils sous-entendaient que des jetons entiers étaient recyclés, alors que ce qui est mesuré est la part du préfixe de jetons qui correspond. `lexerMs` et `sourceCharsLexed` sont nouveaux en 0.11.0.

`auditMarkdownStreaming` émet cinq kinds :

- `tail-not-a-delta` — la queue modifiée dépasse la moitié de la source, donc un ajout re-lexicalise la majeure partie du document au lieu d'un delta.
- `low-token-reuse` — la réutilisation du préfixe sous 50 %.
- `slow-worker-roundtrip` — une réponse de worker au-dessus de 8.3ms, soit deux images à 240Hz.
- `no-worker` — analyse sur le thread principal.
- `entities-mostly-rebuilt` — plus d'entités reconstruites que réutilisées, donc le réconciliateur enfant ne trouve pas ses correspondances.

> [!NOTE]
> L'audit est conditionné à `appends > 0` — une entité Markdown qui n'a jamais diffusé ne produit aucune découverte. `low-token-reuse` exige aussi un ratio au-dessus de zéro, donc une vraie réutilisation de 0 % n'est pas signalée. Les seuils sont fixes et non configurables. Il parcourt `scene.rootEntity` uniquement, donc une entité Markdown dans une modale n'est pas auditée.

`isMarkdownEntity` est du duck-type sur le descripteur devtools de l'entité rapportant `kind: 'Markdown'` — il n'importe pas `@vectojs/markdown` et n'utilise pas `instanceof`, donc la couche modèle reste libre de cette dépendance.

---

## Enregistrer ces relevés comme onglets de panneau

Chaque sous-système embarque un [plugin](/reference/devtools-extend/#protocole-de-plugin) correspondant pour que le panneau puisse l'afficher comme onglet. **Rien n'est enregistré automatiquement** — une build qui n'inspecte jamais le GPU ne transporte pas le code :

```typescript
import {
  acceleratorAudit,
  acceleratorInspector,
  enableDrawCountersCommand,
  enablePhaseTimingCommand,
  gpuAudit,
  gpuInspector,
  markdownStreamAudit,
  markdownStreamInspector,
  registerDevtoolsPlugin,
  resetDrawCountersCommand,
  textInspector,
} from '@vectojs/devtools/headless';

registerDevtoolsPlugin({
  id: 'perf',
  inspectors: [gpuInspector, acceleratorInspector, markdownStreamInspector, textInspector],
  audits: [gpuAudit, acceleratorAudit, markdownStreamAudit],
  commands: [enableDrawCountersCommand, resetDrawCountersCommand, enablePhaseTimingCommand],
});
```

> [!NOTE]
> `gpuInspector` et `acceleratorInspector` se rapportent sur toute la scène et ignorent la sélection, mais le panneau et le pont court-circuitent tous deux vers une ligne « aucune sélection » avant d'appeler un inspecteur. Sélectionnez une entité pour voir leurs lignes. Les audits n'ont pas cette contrainte.

---

[Vue d'ensemble des devtools](/reference/devtools/) · [Inspecter](/reference/devtools-inspect/) · [Auditer](/reference/devtools-audit/) · [Pont et plugins](/reference/devtools-extend/)
