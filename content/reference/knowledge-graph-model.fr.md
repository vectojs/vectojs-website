+++
title = "@vectojs/knowledge-graph/model"
description = "Matérialisation de graphe de connaissances paginée et neutre vis-à-vis du renderer, avec annulation, déduplication, instantanés et démarrages à chaud optionnels du layout."
weight = 46
+++

# `@vectojs/knowledge-graph/model`

Version documentée : **0.4.0**

`KnowledgeGraphModel` possède une coupe bornée et matérialisée d'un graphe de connaissances plus vaste. Il charge des entités graines et des pages de voisins depuis un `KgDataSource`, déduplique les entités et les faits, suit la progression d'expansion par nœud, et expose un `GraphData` stable pour un renderer. Il ne crée aucun DOM, canvas, scène Three.js ou minuteur d'animation.

Importez le point d'entrée neutre vis-à-vis du renderer lorsque l'hôte n'a besoin que des données et de l'état du modèle :

```ts
import {
  KnowledgeGraphModel,
  MemoryDataSource,
  type KgDataSource,
} from '@vectojs/knowledge-graph/model';
```

La racine du paquet exporte aussi le modèle, mais elle inclut la surface de session et de rendu du paquet. Le sous-chemin `/model` est la frontière sans tête explicite.

## Contrat de source de données

```ts
type NodeId = string | number;

interface KgNeighborOptions {
  limit?: number;
  cursor?: string;
  direction?: 'out' | 'in' | 'both';
  signal?: AbortSignal;
}

interface KgNeighborhood {
  entity?: KgEntity;
  facts: readonly KgFact[];
  neighbors: readonly KgEntity[];
  total?: number;
  nextCursor?: string;
  hasMore?: boolean;
}

interface KgDataSource {
  getNodes(ids?: readonly NodeId[]): readonly KgEntity[] | Promise<readonly KgEntity[]>;
  getNeighbors(id: NodeId, options?: KgNeighborOptions): KgNeighborhood | Promise<KgNeighborhood>;
}
```

Traitez `cursor` comme opaque. Une source doit appliquer `limit`, respecter `direction`, transmettre le signal d'annulation fourni au travail en aval, et renvoyer `nextCursor` plus `hasMore` lorsqu'une autre page existe. `total` est optionnel et décrit le total de faits disponibles pour cette expansion de nœud, pas seulement la page courante. Avec `direction: "both"`, un fait dont la source et la cible sont le même nœud est listé une fois par page, pas deux.

`entity` est optionnel : une source qui ne connaît pas l'id demandé renvoie un voisinage qui en est dépourvu, et le modèle fait échouer cette expansion avec une erreur ciblée au lieu d'ingérer définitivement un nœud placeholder fabriqué.

`MemoryDataSource` implémente ce contrat pour les tests et les petits graphes en mémoire. Ses curseurs sont des décalages horodatés par version (`<version>:<offset>`), ainsi appeler `load()` en cours de pagination invalide bruyamment les curseurs en attente — ils lèvent au lieu de découper silencieusement une autre liste de faits. La recherche de voisins est `O(degree)`, et un curseur invalide lève.

## Créer et développer un modèle

```ts
const source = new MemoryDataSource({ entities, facts });
const model = new KnowledgeGraphModel({
  source,
  pageSize: 100,
  direction: 'both',
  lang: 'en',
});

await model.bootstrap(['vectojs'], false);

let result = await model.expand('vectojs');
while (result.state.status === 'partial') {
  result = await model.expand('vectojs');
}

draw(model.getGraphData());
```

`bootstrap(focusIds, expandSeeds = true)` résout d'abord les entités de focus. Avec le second argument par défaut, il développe ensuite chaque graine séquentiellement d'une page. Passez `false` lorsque l'hôte veut un contrôle explicite sur la pagination.

Chaque `expand(id)` charge exactement la page suivante. Les appels concurrents pour le même ID partagent une promesse, tandis que des IDs différents peuvent charger indépendamment. Une expansion terminée se résout immédiatement sans autre appel à la source. Les entités sont dédupliquées par ID et fusionnées, y compris leurs maps de libellés. Les faits sont dédupliqués par le triplet ordonné `(source, predicate, target)`.

## État d'expansion

```ts
type ExpansionStatus = 'idle' | 'loading' | 'partial' | 'complete' | 'failed' | 'cancelled';

interface ExpansionState {
  status: ExpansionStatus;
  loaded: number;
  total?: number;
  cursor?: string;
  hasMore?: boolean;
  error?: unknown;
}
```

Lisez une copie défensive avec `getExpansionState(id)`. `loaded` compte chaque fait livré par lot, si bien que la progression paginée ne stalle pas lorsque des voisinages se chevauchent entre pages. `partial` signifie qu'une autre page est disponible ; appeler `expand(id)` reprend depuis son curseur stocké.

`cancelExpand(id)` annule la requête active et la marque `cancelled`. La source de données doit respecter `options.signal` pour que l'annulation arrête son I/O sous-jacente. Un `expand(id)` ultérieur reprend depuis le dernier curseur terminé. Un échec de source marque l'état `failed`, préserve la progression antérieure, et rejette la promesse ; un appel ultérieur réessaie depuis ce même curseur.

## Lire et persister l'état

```ts
model.entityCount;
model.factCount;
model.listEntities();
model.listFacts();
model.getGraphData();

const snapshot = model.exportSnapshot();
model.importSnapshot(snapshot);
```

`listEntities()` et `listFacts()` renvoient des copies adaptées à l'inspection par l'application. `getGraphData()` renvoie l'entrée de renderer actuelle du modèle dans un ordre d'entités stable. Traitez ce graphe comme en lecture seule ; il est remplacé lorsque la coupe matérialisée change.

Les instantanés sont versionnés. La version 1 stocke les entités, les faits et les métadonnées d'expansion reprenables, mais pas une requête en cours ni un objet d'erreur. Importer un instantané annule les requêtes actuelles et ignore leurs achèvements éventuels. Une version d'instantané non prise en charge lève avant le remplacement.

## Intégration optionnelle du layout

`KnowledgeGraphModelOptions.layout` accepte le contrat XYZ `GraphLayout` de `@vectojs/graph3d`. Le modèle est l'unique pilote du layout : chaque reconstruction de matérialisation appelle `layout.setGraph()` une seule fois, préserve les positions XYZ finies par ID de nœud comme démarrages à chaud, et réchauffe après une page chargée lorsque le layout expose `reheat()`. Les positions de démarrage à chaud sont capturées quand le layout se stabilise (et au moment de la reconstruction), pas à chaque frame active.

Appelez `captureLayoutPositions()` avant une opération externe qui a besoin de conserver les dernières coordonnées du layout. Ce contrat optionnel est tridimensionnel : ne passez pas directement le `ForceLayout2D` XY de `@vectojs/graph-layout`. Un renderer 2D peut omettre `layout` et exécuter son propre layout neutre vis-à-vis du renderer sur `getGraphData()`. Notez que ce contrat épingle par **index** de nœud tandis que le `ForceLayout2D` 2D épingle par ID de nœud — traduisez les épinglages lors du passage d'une pile à l'autre.

## Libération

`dispose()` annule les requêtes actives et libère l'état matérialisé. Il est idempotent. Les méthodes qui nécessitent un modèle vivant lèvent `KnowledgeGraphModel is disposed` ensuite ; les achèvements asynchrones tardifs ne peuvent pas repeupler l'état libéré ou remplacé par un instantané. La propriété appartient au créateur : le modèle n'emprunte que son layout optionnel, donc libérer le modèle ne peut pas tuer un layout encore partagé avec une session vivante — celui qui a construit le layout le libère.

## Garanties de la couche session

La racine du paquet exporte aussi `KnowledgeGraphSession`, qui pilote un renderer à partir d'un modèle. Son contrat comportemental, maintenu en phase avec celui du modèle :

- **Une expansion par id en vol.** Les sélections répétées sur un nœud dont la récupération d'expansion est encore en vol sont absorbées par un garde en vol au lieu de déclencher `onExpand`/`onError` à chaque clic pour une seule récupération réseau.
- **Les erreurs sont observables.** Les échecs d'expansion déclenchés par une sélection sont routés vers une option `onError(error, entity)` (avec repli sur `console.error`) et ne s'échappent jamais comme rejets non gérés ; les continuations asynchrones s'arrêtent dès que la session est libérée.
- **Les ids inconnus échouent bruyamment.** Développer un id qu'aucune source ne connaît échoue avec une erreur ciblée plutôt que de matérialiser une entité fantôme.

## Complexité

Pour une coupe matérialisée avec `N` entités et `E` faits uniques, le stockage du modèle est `O(N + E)`. L'ingestion d'une page est `O(P)` attendu pour `P` enregistrements renvoyés, puis la reconstruction des données du renderer est `O(N + E)` plus le coût `setGraph()` du layout fourni. L'export et l'import d'instantané sont `O(N + E)`. Le modèle ne matérialise intentionnellement que les pages chargées ; la taille totale du graphe source ne détermine pas sa mémoire résidente.

## Voir aussi

[`@vectojs/graph-layout`](/reference/graph-layout/) pour la physique 2D indépendante du renderer ·
[`GraphLayout` et les implémentations de layout 3D](/reference/graph3d-layout/) pour le contrat de layout XYZ optionnel ·
[`@vectojs/graph3d`](/reference/graph3d/) pour le rendu 3D
