+++
title = "@vectojs/devtools"
description = "L'inspecteur de Virtual Math Tree dans la page et sa couche modèle sans tête — sélection d'entité, vue arborescente, audits, instantanés, lectures GPU et accélérateurs, et pont JSON-RPC."
weight = 48
+++

# `@vectojs/devtools`

Version documentée : **0.11.2**

`@vectojs/devtools` est la réponse à « où est le panneau Éléments ? » — un inspecteur
dans la page pour le Virtual Math Tree, afin que le débogage d'une scène VectoJS reste
dans l'espace d'état plutôt que dans l'espace de pixels. Il a deux moitiés :

| Moitié                                              | Usage                                                                                                                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Le panneau** (`@vectojs/devtools`)                | Un dock dans la page, lui-même une `Scene` VectoJS, avec des onglets pour l'arborescence, l'état d'entité, les audits, a11y, un journal d'événements et les réglages. Documenté sur cette page.        |
| **La couche modèle** (`@vectojs/devtools/headless`) | ~60 fonctions pures qui répondent aux questions de mise en page, a11y, hit-testing, texte et performance sous forme de données. Pas de panneau DOM, utilisable dans les tests, CI, Node et les agents. |

La couche modèle est la plus grande et la plus utile. Utilisez-la avant de faire une capture d'écran — un nombre vous dit _quelle_ entité est erronée, alors qu'une image ne dit seulement que quelque chose ne va pas.

| Page                                           | Contenu                                                                                                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Inspecter](/reference/devtools-inspect/)      | Modèle d'arborescence, sélection, état entité/a11y/texte, géométrie de surbrillance, explication du hit-test, traçage du routage d'événements.                       |
| [Auditer](/reference/devtools-audit/)          | Toutes les fonctions `audit*` — mise en page, a11y, mise en forme du texte, dérive de sélection — plus instantanés et différences pour les assertions de régression. |
| [Performance](/reference/devtools-perf/)       | Compteurs GPU et de dessin, état des accélérateurs WASM, attribution de repeint sale, métriques de streaming Markdown.                                               |
| [Pont et plugins](/reference/devtools-extend/) | Le protocole JSON-RPC pour piloter une scène depuis un autre document, et le protocole de plugin pour ajouter vos propres onglets et audits.                         |

---

## Installation

```bash
bun add -D @vectojs/devtools
```

Le panneau monte une scène VectoJS et écoute sur `document`, donc gardez-le hors des bundles de production. Importez la couche modèle depuis le sous-chemin `headless` — il ne contient pas le code du panneau et pas de dépendance `@vectojs/ui` :

```ts
import { auditScene, captureSnapshot, inspectEntity } from '@vectojs/devtools/headless';
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

> [!IMPORTANT]
> Tout ce qui est sous `@vectojs/devtools/headless` est aussi ré-exporté depuis la racine du paquet, donc un unique import `attachDevtools` ne vous empêche pas d'appeler `auditScene`. Le sous-chemin existe pour qu'un bundle de test de production puisse inclure la couche modèle sans le panneau.

---

## Ce qu'il affiche

L'en-tête comporte trois boutons icônes fantômes — **⌖** (sélection), **⟳** (rafraîchir), **⚠** (audit) — et trois badges de compteur : total d'entités, interactives (**⚡**), et découvertes d'audit (**⚠**). Une barre `Tabs` divise les outils en **Tree · Info · Audit · A11y · Log · ⚙**, plus un onglet par [inspecteur de plugin](/reference/devtools-extend/#protocole-de-plugin) enregistré. Une bande de performance est épinglée en bas.

- **Vue arborescente en direct** (`Tree`) de `scene.rootEntity` et `scene.overlayRootEntity`, rafraîchie à intervalle (défaut 500 ms). Chaque ligne montre le nom du constructeur de l'entité, sa position, sa taille, et deux badges : **⚡** (`interactive`) et **▶** (`hasPendingAnimations()`). Un champ **filtre** restreint les lignes par sous-chaîne de type/id ; il est en lecture seule, donc l'index id→entité résout toujours tout. Programmatiquement : `panel.setFilter(text)`.
- **Mode sélection** : cliquez sur **⌖**, puis cliquez n'importe où sur la page. L'inspecteur résout le clic vers l'entité la plus profonde sous ce point en utilisant le même ordre de parcours (et la même règle d'acceptation) que la Scene utilise pour l'entrée du pointeur — une entité n'est sélectionnable que là où sa propre forme accepte le point, exactement comme le moteur, si bien que les particules et les autres entités non interactives ne sont jamais de faux propriétaires.
- **Surbrillance de sélection** : la géométrie de l'entité sélectionnée est dessinée en contour sur la couche d'overlay de la scène _hôte_, pour que vous voyiez exactement ce qui est sélectionné par rapport au rendu en direct. Par défaut, il dessine la boîte de mise en page ; `panel.setHighlightLayers()` le bascule vers n'importe laquelle des sept [couches de géométrie de surbrillance](/reference/devtools-inspect/#géométrie-de-surbrillance) — y compris `'hit'`, qui échantillonne la vraie région de hit de l'entité plutôt que sa boîte.
- **Relevé d'état + édition en ligne** (`Info`) : géométrie, échelle/rotation/opacité, la matrice de transformation monde complète, l'état d'animation, et toute sortie `getDevtoolsDescriptor()` que l'entité publie. Ajoute des éditeurs en ligne `x`/`y`/`opacity` et les boutons **Copy path** / **Copy JSON**.
- **Onglet A11y** : le rôle projeté de l'entité sélectionnée, son nom accessible et sa source, l'index de tabulation, la position dans l'ordre de lecture, la boîte canvas-vs-DOM — plus les découvertes de l'[audit a11y](/reference/devtools-audit/#audit-a11y) à l'échelle de la scène.
- **Édition par touches de déplacement** : avec une entité sélectionnée, les touches fléchées la déplacent de 1px (Maj : 10px) ; `+`/`-` modifient l'opacité par pas de 0.1. Utile pour confirmer _quelle_ entité possède un bug de mise en page avant de toucher au code.
- **HUD de performance** : une bande en bas lit [`Scene.frameStats`](/reference/core-scene) — fps, ms/image, nombre d'entités, mode de rendu, et nombre d'images rendues/ignorées. Les fps sont la vraie cadence des _images rendues_, donc une scène `onDemand` inactive lit honnêtement 0 fps — et une scène `'always'` auto-bridée lit son plancher d'inactivité (60 fps par défaut) — plutôt qu'un faux 60. Désactivez avec `showPerf: false`.
- **Réglages** (`⚙`) : basculer la surbrillance de sélection, et changer l'intervalle de rafraîchissement et le côté d'ancrage (gauche/droite) en direct.

Le panneau se reformate au redimensionnement de la fenêtre, donc la bande de performance du bas reste à l'écran à toute hauteur de viewport ou niveau de zoom. Le dock et son canvas utilisent `pointer-events: none` ; seuls leurs contrôles interactifs projetés réactivent l'opt-in — donc l'inspecteur ne vole jamais l'entrée des contrôles hôtes sous les pixels vides du dock, tandis que ses propres lignes, onglets, entrées et boutons restent cliquables.

---

## API

```typescript
function attachDevtools(
  scene: Scene,
  options?: DevtoolsOptions,
): DevtoolsPanel & { detach(): void };

interface DevtoolsOptions {
  width?: number; // largeur du panneau en px, défaut 360
  refreshInterval?: number; // ms ; 0 désactive le rafraîchissement auto. Défaut 500
  traceEvents?: boolean; // affiche les enregistrements limités de routage pointeur/molette/clavier
  traceCapacity?: number; // enregistrements de trace retenus, défaut 50
  dockSide?: 'right' | 'left'; // défaut 'right'
  showPerf?: boolean; // bande HUD de performance live, défaut true
  defaultTab?: string; // 'tree' | 'inspect' | 'audit' | 'a11y' | 'events' | 'settings'
}

class DevtoolsPanel {
  refresh(force?: boolean): void; // reconstruit le modèle arborescent depuis la scène hôte
  armPick(): void; // one-shot : le prochain clic sur la page sélectionne l'entité dessous
  select(entity: Entity): void; // sélectionne programmatiquement
  get selection(): Entity | null;
  get trace(): EventTrace | null; // null sauf si traceEvents était activé
  setFilter(text: string): void; // filtre l'arbre par sous-chaîne type/id
  setHighlightEnabled(on: boolean): void;
  setHighlightLayers(kinds: ReadonlyArray<HighlightLayerKind>, hitSampleStep?: number): void;
  getHighlightLayers(): ReadonlyArray<HighlightLayer>; // couches du dernier dessin
  setRefreshInterval(ms: number): void;
  setDockSide(side: 'right' | 'left'): void;
  audit(): AuditFinding[]; // exécute l'audit de mise en page ; remplit aussi l'onglet Audit
  selectFinding(i: number): void; // sélectionne + surbrillance l'entité derrière la découverte i
  getPluginFindings(): ReadonlyArray<PluginFinding>; // découvertes des audits de plugin
  getPluginRows(inspectorId: string): PluginRow[]; // lignes actuelles d'un onglet de plugin
  runCommand(qualifiedId: string): unknown; // exécute un `<pluginId>/<commandId>`
  destroy(): void; // démonte les écouteurs, minuteries, surbrillance hôte, et la scène du panneau
}
```

`detach()` (retourné par `attachDevtools`) est un alias pour `destroy()`.

`refresh(force)` saute la reconstruction quand `scene.structureVersion` n'a pas bougé, donc l'appeler à intervalle serré est bon marché ; passez `true` pour reconstruire quand même. Indépendamment de ce contrôle, le panneau se réconcilie toutes les 3s pour qu'un bump de structure manqué ne laisse pas l'arbre périmé indéfiniment.

`getPluginRows` renvoie `[]` pour un ID d'inspecteur inconnu, sans sélection, ou quand le `appliesTo` de l'inspecteur rejette la sélection — les trois cas ne sont pas distingués. `runCommand` **lève** sur un ID de commande inconnu au lieu de ne rien faire.

---

## Notes de conception

- La scène du panneau est construite avec `contentProjection: false` et `renderMode: 'onDemand'` — elle ne doit pas projeter son propre contenu DOM ou se repeindre chaque frame pendant l'inactivité.
- L'état de sélection vit sur le panneau, pas sur l'hôte : `select()`/`armPick()` ne mutent jamais la scène inspectée sauf pour l'entité de surbrillance d'overlay, qui est ajoutée via `showOverlay()` et retirée sur `destroy()`.
- Le rafraîchissement auto est un intervalle simple, pas une animation Scene — il fonctionne même quand la scène hôte est totalement inactive (`onDemand`, rien de sale).
- Le dock (`position: fixed`, hauteur viewport complète) et son canvas sont `pointer-events: none`, miroir de comment la `Scene` principale a son `a11yRoot` qui s'exclut tandis que les éléments d'ombre interactifs individuels se réinscrivent via `auto`. Les clics sur le fond/chrome vide du dock traversent vers tout contenu hôte en dessous — y compris les propres contrôles du bord droit de l'app hôte (boutons de fermeture d'onglet, boutons de barre d'outils) qui sinon se trouveraient dans la bande du dock. Seuls les contrôles a11y-projetés du panneau lui-même, via leur propre `auto` opt-in, sont indépendamment cliquables.

---

[Inspecter](/reference/devtools-inspect/) · [Auditer](/reference/devtools-audit/) · [Performance](/reference/devtools-perf/) · [Pont et plugins](/reference/devtools-extend/)
