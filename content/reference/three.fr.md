+++
title = "@vectojs/three"
description = "Adaptateurs Three.js pour VectoJS : rendu de panneaux UI 2D sous forme de textures 3D (ThreeAdapter) ou utilisation de Three.js comme moteur de rendu (ThreeRenderer)."
weight = 41

[extra]
order = 41
+++

# `@vectojs/three`

Deux exportations, deux cas d'usage distincts :

| Exportation                                   | Cas d'usage                                                                                                                                                                                                                                              |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ThreeAdapter`](/reference/three-adapter/)   | Rendre une `Scene` VectoJS sur un canvas appartenant à l'adaptateur ou fourni par l'appelant, l'exposer en tant que `THREE.CanvasTexture`, et câbler les événements de pointeur via du raycasting UV. Le reste de votre scène Three.js n'est pas touché. |
| [`ThreeRenderer`](/reference/three-renderer/) | Utiliser Three.js comme moteur de rendu 2D pour une `Scene` VectoJS — les remplissages, contours et textes deviennent des maillages Three.js dans une scène orthographique plutôt que des appels de dessin Canvas 2D.                                    |

`ThreeAdapter` est le chemin courant : vous avez une scène 3D et voulez un panneau UI 2D flottant sur une surface — voir sa page pour le constructeur, la gestion des événements WebXR/multi-touch et un exemple complet. `ThreeRenderer` est pour les projets qui utilisent déjà Three.js et veulent des primitives 2D accélérées matériellement sans recours à Canvas 2D — voir sa page pour les méthodes `IRenderer` implémentées et la disposition du shader de dégradé.

---

## Installation

```sh
bun add @vectojs/three three
```

Pour les projets TypeScript, ajoutez les types Three.js :

```sh
bun add -d @types/three
```

---

## Dépannage

### Le dégradé s'affiche comme une couleur unie au lieu d'un mélange

`stroke()` ne prend pas en charge les dégradés — il utilise toujours le premier arrêt de couleur comme couleur unie. Utilisez `fill()` avec un chemin fermé si vous avez besoin d'un effet de contour de forme peint avec un dégradé.

Vérifiez également que vous appelez `createLinearGradient()` depuis `ThreeRenderer` (renvoie un `WebGLGradient`) et non depuis un `CanvasRenderingContext2D` — mélanger des objets de dégradé de différents renderers produit un comportement indéfini.

### Le texte apparaît flou sur les écrans haute résolution (HiDPI)

Ne **multipliez pas** les dimensions du constructeur par `window.devicePixelRatio` — le `CanvasRenderer` de `@vectojs/core` met déjà à l'échelle le backing store du canvas adaptateur par le DPR en interne (et une pré-multiplication doublerait la mise à l'échelle du tampon tout en déformant votre espace de mise en page logique). Le DPR au niveau du navigateur est géré pour vous.

Si le texte du panneau semble toujours doux, la cause est la projection 3D, pas le DPR : la zone à l'écran du plan dépasse la résolution de la texture (caméra trop proche, ou maillage trop grand pour la taille de la texture). Augmentez les `width`/`height` demandés — cela augmente la résolution de la texture _et_ donne à la scène proportionnellement plus d'espace de mise en page logique :

```ts
// Texture plus nette : plus de pixels logiques + physiques pour la même taille de maillage dans l'espace monde
const adapter = new ThreeAdapter({ width: 1024, height: 640 });
adapter.mesh.scale.set(3.2, 3.2 * (640 / 1024), 1); // taille dans le monde inchangée ; densité doublée
```

Notez que les positions des entités et les tailles de police sont exprimées en pixels logiques, donc doubler les dimensions du constructeur sans ajuster la mise en page laisse votre UI occuper un quart du panneau — adaptez les positions et les tailles en conséquence.

### Les événements de pointeur n'ont aucun effet sur les composants VectoJS

`updateIntersection()` doit être appelée à chaque trame où la saisie doit être traitée — il ne suffit pas de l'appeler uniquement dans les écouteurs d'événements DOM, car le raycaster a besoin de l'état actuel de la caméra et du maillage au moment de l'événement. Vérifiez :

1. `updateIntersection()` est appelée dans votre boucle de rendu (ou directement dans les gestionnaires d'événements de pointeur avec un raycaster fraîchement configuré).
2. La caméra du raycaster correspond à la caméra utilisée pour rendre la scène.
3. `adapter.mesh` fait partie du graphe de scène Three.js lorsque le rayon est lancé — les maillages orphelins (non ajoutés à la scène) ne sont pas intersectés.

## Voir aussi

[`ThreeAdapter`](/reference/three-adapter/) · [`ThreeRenderer`](/reference/three-renderer/) ·
[`IRenderer` / `CanvasRenderer`](/reference/core-renderer/)
