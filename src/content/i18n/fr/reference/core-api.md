---
title: 'Référence API @vectojs/core'
description: "Vue d'ensemble et carte des points d'entrée du moteur de rendu zero-DOM derrière Vecto — Scene, Entity, renderers, particules et a11y dans core, plus les moteurs autonomes @vectojs/text, @vectojs/layout, @vectojs/math et @vectojs/animation que core re-exporte."
order: 1
---

# `@vectojs/core` — Référence API

Le moteur de rendu zero-DOM derrière Vecto. Une `Scene` possède un arbre de nœuds
`Entity` (le **Virtual Math Tree**), pilote une boucle `requestAnimationFrame`, peint
via un `IRenderer` indépendant du backend (Canvas 2D par défaut), et projette
une couche d'ombre ARIA/automatisation transparente pour que le canvas reste accessible
et pilotable par un agent.

> Cette page et ses sous-pages sont générées à partir du `.d.ts` publié (surface
> publique) et du source `packages/core/src` (comportement). Les signatures ici
> prévalent sur tout ce qui se trouve dans les guides narratifs `docs/usage/*` — en
> particulier le vrai constructeur est `new Scene(canvasElement, options)`, **pas**
> la forme `{ canvasId }` que montre une partie de la prose plus ancienne.

## Pages de référence

Chaque domaine ci-dessous a sa propre page dédiée — signatures, pièges et un
pied de page « Associé » renvoyant vers les autres :

| Domaine                                               | Couvre                                                                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [`Scene`](/reference/core-scene/)                     | Constructeur, `SceneOptions`, champs publics, `renderMode`/`maxFPS`/régulation de l'inactivité, méthodes de cycle de vie, registre de backends. |
| [`Entity`](/reference/core-entity/)                   | Le nœud VMT abstrait : transformations, système d'animation, événements capture/bulle, hooks a11y/lot.                                          |
| [Moteur de mise en page](/reference/core-layout/)     | La division froid/chaud du `LayoutEngine`, la mémoïsation en continu, le texte enrichi, les formes d'exclusion.                                 |
| [Renderers](/reference/core-renderer/)                | `IRenderer`, `CanvasRenderer`, `SVGRenderer`, la couche WebGL points/rects/sprites/MSDF, la projection de contenu, `parseColorToRGBA`.          |
| [`ComputeParticleEntity`](/reference/core-particles/) | La couche de particules à haut débit : disposition mémoire, simulation CPU, WebGPU vs CPU.                                                      |
| [Texte et Bidi](/reference/core-text/)                | `MSDFFont`, `MSDFTextEntity`, `TextEntity`/`GridTextEntity`, shape arabe + résolveur bidi.                                                      |
| [Autres entités](/reference/core-entities/)           | `SplineEntity`, `DOMPortalEntity`, `SVGEntity`.                                                                                                 |
| [Utilitaires mathématiques](/reference/core-math/)    | `SpatialHashGrid`, `SpringPhysics`.                                                                                                             |
| [a11yRoot et le contrat agent](/reference/core-a11y/) | La projection d'ombre DOM, `A11yAttributes`, pièges de synchronisation.                                                                         |

## Points d'entrée et carte des modules

Les moteurs de mise en page, de mise en forme du texte, de mathématiques et
d'animation sont publiés comme leurs propres paquets autonomes. `@vectojs/core`
**dépend de tous et les re-exporte**, de sorte que chaque importation ci-dessous
se résout toujours depuis `@vectojs/core` (et depuis les sous-chemins
optimisables par tree-shaking). Importez directement depuis les paquets
autonomes lorsque vous voulez une surface de dépendances plus réduite sans le
runtime du graphe de scène.

`@vectojs/core` fournit une entrée principale avec effets de bord plus trois
sous-chemins optimisables par tree-shaking, aux côtés des quatre paquets autonomes :

| Importation              | Contenus                                                                                                                                                                                                 | Effet de bord                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `@vectojs/core` (`.`)    | Tout : `Scene`, `Entity`, toutes les entités, renderers, plus les moteurs de mise en page, texte, mathématiques et animation re-exportés.                                                                | À l'importation, enregistre automatiquement **les deux** backends enfichables (renderer WebGL points + gestionnaire WebGPU particules). |
| `@vectojs/core/layout`   | Re-exporte `@vectojs/layout` : `LayoutEngine`, `PreparedText`, `createCanvasMeasurer`, `LayoutResultBuffer`, `LayoutWorkerManager`, `computeLineSegments`, types de mise en page.                        | Aucun.                                                                                                                                  |
| `@vectojs/core/renderer` | `IRenderer`, `CanvasRenderer`, `SVGRenderer`, `PointRenderer`, `createWebGLPointRenderer`, `WebGPUParticleSystemManager`, `parseColorToRGBA`, `RGBA`.                                                    | Aucun.                                                                                                                                  |
| `@vectojs/core/text`     | Re-exporte `@vectojs/text` plus les `MSDFTextEntity`/`SVGEntity` résidant dans core : `MSDFFont`, `ArabicShaper`, `BidiResolver`, `Typography`, `prepareContentGrid`, `PreparedContentGrid`, types MSDF. | Aucun.                                                                                                                                  |
| `@vectojs/text`          | Primitives autonomes de mise en forme du texte : `BidiResolver`, `ArabicShaper`, `Typography`, `MSDFFont`, `prepareContentGrid`, `PreparedContentGrid`. Paquet feuille (uniquement `bidi-js`).           | Aucun.                                                                                                                                  |
| `@vectojs/layout`        | Moteur de mise en page autonome : `LayoutEngine`, `LayoutWorkerManager`, `createCanvasMeasurer`, assistants de mesure. Dépend de `@vectojs/text`.                                                        | Aucun.                                                                                                                                  |
| `@vectojs/math`          | Mathématiques spatiales/physiques autonomes : `SpatialHashGrid`, `SpringPhysics`. Paquet feuille.                                                                                                        | Aucun.                                                                                                                                  |
| `@vectojs/animation`     | Easing autonome + drivers : `Easing`, `TweenDriver`, `SpringDriver`. Dépend de `@vectojs/math`.                                                                                                          | Aucun.                                                                                                                                  |

**Piège :** l'enregistrement automatique des backends ne vit que dans l'entrée `.`
(`Scene.registerWebGLPointRendererCreator(createWebGLPointRenderer)` et
`Scene.registerWebGPUParticleSystemManager(WebGPUParticleSystemManager)` s'exécutent à
l'importation). Si vous construisez une `Scene` après avoir importé uniquement des
sous-chemins, enregistrez vous-même les backends ou alors `pointBackend: 'webgl'` / les
particules WebGPU tombent silencieusement en mode dégradé. Voir
[`Scene`](/reference/core-scene/) pour l'API du registre.

## Pages recommandées du site de documentation (core)

- **Apprendre / Concepts fondamentaux** — Scene, le Virtual Math Tree, la boucle de rendu,
  `IRenderer`, le modèle zero-DOM.
- **Apprendre / Modes de rendu et performance** — `always` vs `onDemand`, `maxFPS`, la
  régulation à 2 fps en inactivité et la règle `markDirty()`-entre-les-images, mouvement
  réduit.
- **Apprendre / Construire une Entity personnalisée** — `isPointInside`/`render`,
  transformations, écrêtage `getBounds`, les voies rapides `getBatchCircle`/`getBatchRect`.
- **Apprendre / Événements et hit-testing** — capture/bulle, `VectoJSEvent`,
  `findEntityAt`, `change`/IME des contrôles de formulaire.
- **Apprendre / Accessibilité et automatisation** — le contrat d'ombre DOM, les agents
  basés sur `getByRole`, `debugA11y`, la régulation.
- **Apprendre / Texte et typographie** — la division froid/chaud du `LayoutEngine`, la
  mémoïsation en continu, le texte MSDF, l'exclusion/enroulement, le bidi.
- **Apprendre / Particules** — `ComputeParticleEntity`, WebGPU vs CPU, la disposition
  8-floats, `resize()`-d'abord.
- **Référence / API** — les sous-pages ci-dessus (Scene, Entity, moteur de mise en page,
  renderers, particules, texte, utilitaires mathématiques, contrat a11y).
- **Référence / Registre des backends** — backends WebGL/WebGPU enfichables, couvert
  dans [`Scene`](/reference/core-scene/#registre-de-backends-enfichables-statique).
