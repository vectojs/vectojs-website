+++
title = "Devtools : pont et plugins"
description = "Piloter une scène VectoJS depuis un autre document via un pont JSON-RPC, et étendre l'inspecteur avec vos propres onglets, audits et commandes."
weight = 52

[extra]
order = 52
+++

# Devtools : pont et plugins

Deux points d'extension. Le **pont** expose toute la couche modèle en JSON-RPC pour qu'une extension de navigateur, un cadre parent ou un agent d'automatisation puisse inspecter une scène avec laquelle il ne partage pas de graphe de modules. Le **protocole de plugin** permet à un auteur d'entité de fournir son propre onglet d'inspecteur, son propre audit et ses propres commandes.

---

## Protocole du pont

```typescript
const DEVTOOLS_PROTOCOL_VERSION = 1;
const DEVTOOLS_CHANNEL = 'vectojs-devtools';

function createDevtoolsBackend(
  scene: Scene,
  transport: DevtoolsTransport,
  options?: DevtoolsBackendOptions,
): { dispose(): void };

function createDevtoolsClient(
  transport: DevtoolsTransport,
  options?: { timeoutMs?: number }, // default 5000
): DevtoolsClient;

interface DevtoolsClient {
  request<T = unknown>(method: DevtoolsMethod, params?: Record<string, unknown>): Promise<T>;
  on(handler: (event: DevtoolsEvent) => void): () => void;
  dispose(): void;
}

interface DevtoolsBackendOptions {
  allowedOrigins?: string[];
  maxTreeNodes?: number; // default 5000
}
```

Le backend tourne côté page, là où est la `Scene`. Le client tourne là où est l'UI. Ni l'un ni l'autre ne touche `window` directement — c'est le travail du transport, ce qui rend la paire testable en processus :

```typescript
import {
  createDevtoolsBackend,
  createDevtoolsClient,
  createDirectTransportPair,
} from '@vectojs/devtools/headless';

const { backend, frontend } = createDirectTransportPair();
const server = createDevtoolsBackend(scene, backend);
const client = createDevtoolsClient(frontend, { timeoutMs: 500 });

const { version } = await client.request<{ version: number }>('protocol.version');
const tree = await client.request('tree.get');
const info = await client.request('entity.inspect', { entityId: someId });

server.dispose();
client.dispose();
```

### Méthodes

Toutes les 21, chacune déléguant à la fonction de la couche modèle du même nom :

| Méthode                    | Paramètres                              | Renvoie                                          |
| -------------------------- | --------------------------------------- | ------------------------------------------------ |
| `protocol.version`         | —                                       | `{ version: 1 }`                                 |
| `tree.get`                 | —                                       | `{ root, overlay, structureVersion, truncated }` |
| `entity.inspect`           | `entityId`                              | `EntityInfo`                                     |
| `entity.pick`              | `x`, `y`                                | `EntityInfo` ou `null`                           |
| `entity.highlightGeometry` | `entityId`, `layers?`, `hitSampleStep?` | `HighlightLayer[]`                               |
| `entity.a11yInspect`       | `entityId`                              | `A11yInfo`                                       |
| `scene.audit`              | —                                       | `AuditFinding[]`                                 |
| `scene.a11yAudit`          | —                                       | `A11yFinding[]`                                  |
| `scene.a11yOrder`          | —                                       | `A11yInfo[]`                                     |
| `scene.snapshot`           | —                                       | `SceneSnapshot`                                  |
| `scene.diff`               | `against?`                              | `SnapshotDiff[]`                                 |
| `scene.frameStats`         | —                                       | télémétrie d'image, non arrondie                 |
| `hit.explain`              | `x`, `y`                                | `HitExplanation`                                 |
| `text.inspect`             | `entityId`                              | `TextInspection` ou `null`                       |
| `markdown.stream`          | `entityId`                              | `MarkdownStreamInfo` ou `null`                   |
| `gpu.inspect`              | —                                       | `GpuInspection`                                  |
| `plugin.list`              | —                                       | `{ id, label }[]`                                |
| `plugin.rows`              | `id`, `entityId?`                       | `PluginRow[]`                                    |
| `plugin.audit`             | —                                       | `PluginFinding[]`                                |
| `command.list`             | —                                       | `{ id, label }[]`, ids entièrement qualifiés     |
| `command.run`              | `commandId`, `entityId?`                | la valeur de retour de la commande               |

`request` rejette sur une erreur de backend, sur une méthode inconnue et sur dépassement de délai. Un dépassement supprime l'entrée en attente mais n'envoie aucune annulation, donc une réponse tardive est abandonnée en silence. `dispose()` rejette chaque promesse en vol avec `client disposed`.

### Application des origines

> [!IMPORTANT]
> La vérification d'origine est délibérément fermée-par-défaut et vous surprendra : **omettre `allowedOrigins` refuse toute requête portant une origine.** Il n'y a pas de défaut permissif. Un transport `postMessage` doit recevoir une liste explicite d'autorisations :
>
> ```typescript
> createDevtoolsBackend(scene, transport, {
>   allowedOrigins: ['https://panel.example'],
> });
> ```
>
> `createDirectTransportPair` ne fournit aucune origine, donc le câblage en processus contourne entièrement la vérification — c'est pourquoi l'exemple ci-dessus n'a pas besoin de liste d'autorisations.
>
> **Le client, en revanche, n'effectue aucune vérification d'origine du tout.** Il ne filtre que sur la balise de canal, donc tout cadre qui peut publier vers la fenêtre du client peut injecter un faux événement `selection`/`structure` ou une fausse réponse pour un id de requête devinable. Traitez un client de pont comme à entrée-fiable-uniquement : n'en exposez pas un à une page que vous ne contrôlez pas.

### Événements

Le backend n'émet jamais d'événements de lui-même. Le code de votre page décide quand quelque chose a changé et le publie :

```typescript
import { publishSelection, publishStructure } from '@vectojs/devtools/headless';

publishSelection(backendTransport, selectedEntity); // or null to clear
publishStructure(backendTransport, scene.structureVersion);
```

Les deux sont du fire-and-forget, sans file d'attente ni déduplication. Abonnez-vous côté client avec `client.on(handler)`.

### État et limites

> [!NOTE]
> **`scene.diff` mute sa propre ligne de base.** Il fait la différence contre le dernier instantané puis le remplace, donc l'appeler deux fois donne deux différences _incrémentales_ plutôt que deux différences contre l'original. Passez `against` explicitement pour une ligne de base fixe.
>
> **`maxTreeNodes` est un budget unique partagé par les deux arborescences, consommé d'abord par la racine.** Une arborescence principale au plafond renvoie un `overlay` vide avec `truncated: true` — la troncature est toujours signalée, jamais silencieuse.
>
> **L'index d'entités tolère la péremption.** Un succès de cache gagne sans revalidation, donc une entité retirée de la scène peut encore se résoudre. Seul un raté déclenche une reconstruction. Sur un id dupliqué, l'entité d'overlay éclipse celle de l'arborescence principale.
>
> **Chaque résultat est forcé à travers un aller-retour JSON.** `undefined` devient `null`, et `NaN`/`Infinity` deviennent `null` — ce qui compte pour `scene.frameStats`. Un résultat circulaire ou porteur de `BigInt` fait échouer la requête plutôt que de renvoyer des données partielles.
>
> **Il n'y a pas de négociation de version.** Le backend répond à `protocol.version` mais ne compare jamais une version entrante à la sienne ; les requêtes ne portent aucun champ de version. Vérifier la compatibilité est le travail du frontend.

### Transports

```typescript
function createDirectTransportPair(): {
  backend: DevtoolsTransport;
  frontend: DevtoolsTransport;
};
function createWindowTransport(
  target: Window,
  targetOrigin: string,
  source?: Window, // defaults to `target`
): DevtoolsTransport;

interface DevtoolsTransport {
  send(message: DevtoolsMessage): void;
  subscribe(handler: (message: DevtoolsMessage, origin?: string) => void): () => void;
}
```

`createWindowTransport` publie vers `target` et écoute sur `source`. Le défaut `source = target` est faux pour le cas courant d'extension et d'iframe, où vous publiez vers un enfant mais écoutez sur votre propre fenêtre — **passez `source` explicitement** là.

L'interface fait deux méthodes, donc un transport personnalisé par-dessus un `MessageChannel`, un `BroadcastChannel`, une WebSocket ou une liaison CDP est un court adaptateur.

---

## Protocole de plugin

Une entité qui publie `getDevtoolsDescriptor()` apparaît déjà dans l'onglet Info. Un plugin va plus loin : son propre onglet de panneau, ses propres découvertes d'audit et ses propres commandes.

```typescript
interface DevtoolsPlugin {
  id: string; // unique; namespaces this plugin's findings
  inspectors?: PluginInspector[];
  audits?: PluginAudit[];
  commands?: PluginCommand[];
}

interface PluginInspector {
  id: string; // tab id and label key; must be unique across plugins
  label: string;
  appliesTo?(entity: Entity): boolean; // defaults to all entities
  rows(context: PluginContext & { selection: Entity }): PluginRow[];
}

interface PluginAudit {
  id: string;
  run(context: PluginContext): PluginFinding[];
}

interface PluginCommand {
  id: string;
  label: string;
  run(context: PluginContext): unknown;
}

interface PluginContext {
  scene: Scene;
  selection: Entity | null;
}

interface PluginRow {
  label: string;
  value: string;
  note?: string; // extra context, shown when the row has room
}

interface PluginFinding {
  kind: string;
  entityId?: string;
  message: string;
  severity?: 'info' | 'warn' | 'error';
}
```

```typescript
import { registerDevtoolsPlugin } from '@vectojs/devtools/headless';

const unregister = registerDevtoolsPlugin({
  id: 'my-chart',
  inspectors: [
    {
      id: 'chart',
      label: 'Chart',
      appliesTo: (e) => e instanceof ChartEntity,
      rows: ({ selection }) => [
        {
          label: 'series',
          value: String((selection as ChartEntity).series.length),
        },
        {
          label: 'scale',
          value: (selection as ChartEntity).scaleMode,
          note: 'from props',
        },
      ],
    },
  ],
  audits: [
    {
      id: 'data',
      run: ({ scene }) =>
        findEmptySeries(scene).map((e) => ({
          kind: 'empty-series',
          entityId: e.id,
          message: 'a chart series has no data points',
          severity: 'warn' as const,
        })),
    },
  ],
});
```

Cette découverte remonte comme `my-chart/empty-series` — `runPluginAudits` réécrit chaque `kind` en `` `${plugin.id}/${kind}` `` pour que deux plugins ne puissent pas entrer en collision.

### Fonctions de registre

```typescript
function registerDevtoolsPlugin(plugin: DevtoolsPlugin): () => void;
function devtoolsPlugins(): DevtoolsPlugin[];
function clearDevtoolsPlugins(): void;
function pluginInspectors(): PluginInspector[];
function pluginInspectorsFor(entity: Entity | null): PluginInspector[];
function pluginCommands(): Array<PluginCommand & { pluginId: string }>;
function runPluginInspector(inspector: PluginInspector, context: PluginContext): PluginRow[];
function runPluginAudits(context: PluginContext): PluginFinding[];
function runPluginCommand(qualifiedId: string, context: PluginContext): unknown;
```

`registerDevtoolsPlugin` renvoie une fonction de désenregistrement. Enregistrer deux fois le même `id` **remplace en silence** ; le disposer renvoyé est protégé par identité, donc un ancien d'un enregistrement remplacé ne fait rien plutôt que d'évincer le plugin vivant.

`pluginInspectorsFor(entity)` filtre par `appliesTo` ; `pluginInspectors()` les renvoie tous sans l'évaluer. `clearDevtoolsPlugins()` est pour les tests.

### Confinement des défaillances

Les plugins sont du code tiers tournant dans un diagnostic, donc rien de ce qu'un plugin fait ne peut casser le panneau :

| Défaillance                     | Résultat                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `appliesTo` lève                | cet inspecteur est silencieusement exclu                                                                             |
| `rows` lève                     | une seule ligne `error` portant le message                                                                           |
| `rows` sans rien de sélectionné | une ligne `— / no selection` ; `rows` n'est jamais appelé                                                            |
| un audit lève                   | une découverte synthétique `<pluginId>/audit-failed`, `severity: 'error'` ; les autres audits s'exécutent quand même |
| id de commande inconnu          | `runPluginCommand` **lève** — délibérément, pour qu'un appelant ne reçoive pas un no-op silencieux                   |
| une commande lève               | se propage à l'appelant ; sur le pont cela devient une requête rejetée                                               |

> [!NOTE]
> Le registre est un état global au niveau module, indexé par id de plugin. Deux copies de `@vectojs/devtools` dans un même bundle obtiennent deux registres indépendants.
>
> `runPluginInspector` ne **vérifie pas** `appliesTo` — c'est le travail de l'appelant, et le panneau le fait séparément. Et l'unicité de `PluginInspector.id` est requise mais non appliquée : le registre est indexé par l'id du _plugin_, donc un id d'inspecteur dupliqué perd silencieusement un onglet.
>
> `runPluginCommand` accepte un id de commande nu ainsi que `<pluginId>/<commandId>`. Sur un id nu il prend la première correspondance dans l'ordre d'enregistrement, sans erreur d'ambiguïté, donc préférez la forme qualifiée.

---

[Vue d'ensemble des devtools](/reference/devtools/) · [Inspecter](/reference/devtools-inspect/) · [Auditer](/reference/devtools-audit/) · [Performance](/reference/devtools-perf/)
