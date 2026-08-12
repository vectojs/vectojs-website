+++
title = "Performance"
description = "Modes de rendu, l'auto-limitation au repos, le rendu par lots WebGL, l'élimination hors fenêtre, la performance du texte et comment mesurer le débit GPU réel."
weight = 13
+++

# Performance

VectoJS est conçu pour être rapide par défaut, mais plusieurs mécanismes optionnels débloquent un débit nettement supérieur. Cette page explique les leviers disponibles, le piège caché qui prend au dépourvu la plupart des développeurs, et comment mesurer la performance avec précision.

## Modes de rendu

La `Scene` prend en charge deux modes de rendu, définis via `scene.renderMode` après construction :

```typescript
scene.renderMode = 'always'; // default — rerender every frame
scene.renderMode = 'onDemand'; // rerender only when dirty or tweening
```

### Mode `'always'`

La boucle rAF se déclenche à chaque image, plafonnée par `maxFPS` (60 par défaut). Utilisez-le pour :

- L'animation continue (simulations de particules, physique)
- Les flux de données en temps réel
- Toute scène où quelque chose est toujours en mouvement

### Mode `'onDemand'`

La boucle rAF ne rend que lorsque `scene.markDirty()` a été appelé depuis la dernière image, ou lorsqu'un pilote d'animation/transition est en cours. Les tics au repos sautent la mise à jour/le rendu des entités et la soumission GPU, mais la Scene planifie tout de même le rAF et parcourt l'arbre pour vérifier l'état d'animation en attente. Utilisez-le pour :

- Les UI statiques ou pilotées par événements (tableaux de bord, formulaires, menus)
- Les scènes qui s'animent en réponse aux actions de l'utilisateur mais sont autrement immobiles

```typescript
scene.renderMode = 'onDemand';

button.on('click', () => {
  button.animate({ scaleX: 1.1, scaleY: 1.1 }, 100).animate({ scaleX: 1, scaleY: 1 }, 100);
  // animate() marks dirty automatically while the tween runs
});

input.on('change', () => {
  scene.markDirty(); // repaint to show new caret/selection state
});
```

## L'auto-limitation au repos (le piège caché)

C'est le piège de performance le plus courant dans VectoJS.

En mode `'always'`, une scène est considérée comme **statique** lorsque :

- Le drapeau `dirty` est `false`, ET
- Aucune entité n'a de tween `animate()` en attente.

Une scène statique est limitée à **~2 fps** pour économiser la batterie et le GPU. Dans le runtime stable, le drapeau `dirty` est consommé au _début_ de chaque image rendue, de sorte qu'un `markDirty()` émis depuis l'intérieur de `update()` survit jusqu'à la vérification statique de l'image suivante.

```typescript
// markDirty() inside update() re-arms the next frame
class Spinner extends Entity {
  update(dt: number, time: number) {
    super.update(dt, time);
    this.rotation += dt * 0.003;
    this.scene?.markDirty();
  }
}
```

**Le piège sur core ≤ 0.2.5 :** le drapeau était effacé _après le rendu_, de sorte qu'un `markDirty()` défini pendant `update()` était effacé avant la vérification statique suivante — le motif ci-dessus rendait une image puis se figeait à 2 fps. Si vous prenez en charge des versions plus anciennes de core, utilisez l'un des correctifs ci-dessous (ils restent les choix les plus efficaces sur 0.2.6 aussi, puisque `hasPendingAnimations()` déclare l'intention sans écriture de drapeau par image).

**Correctif — option A :** Utilisez `animate()` pour le mouvement au lieu de mutations manuelles. Un tween en cours maintient automatiquement la scène active :

```typescript
// Correct: animate() keeps hasPendingAnimations() true
entity.animate({ rotation: Math.PI * 2 }, 1000);
```

**Correctif — option A2 (pour un mouvement piloté par `update()`) :** conservez l'intégrateur, mais informez-en la Scene en surchargeant `hasPendingAnimations()`. C'est ainsi que les conteneurs de défilement intégrés signalent leur mouvement en cours :

```typescript
class Spinner extends Entity {
  update(dt: number, time: number) {
    super.update(dt, time);
    this.rotation += dt * 0.003;
  }
  hasPendingAnimations() {
    return true; // or: super.hasPendingAnimations() || stillMoving
  }
}
```

**Correctif — option B :** Appelez `markDirty()` **entre les images** — depuis un gestionnaire d'événement, un `setInterval`, ou un `requestAnimationFrame` distinct qui se déclenche après le propre rAF de la scène :

```typescript
// Correct: call markDirty between frames (not inside update)
setInterval(() => scene.markDirty(), 16); // external driver
```

**Correctif — option C :** Passez à `renderMode: 'always'` et définissez `maxFPS` pour empêcher la limitation statique (la limitation au repos ne s'applique que lorsque `maxFPS > 0` ; définir `maxFPS = 0` déplafonne et rend toujours) :

```typescript
scene.maxFPS = 0; // uncapped — never throttles to 2 fps
```

## `maxFPS` et mouvement réduit

```typescript
const scene = new Scene(canvas, {
  maxFPS: 60, // frame rate cap; 0 = uncapped
  respectReducedMotion: true, // default: true
});
```

Lorsque `respectReducedMotion: true` (par défaut) et que l'utilisateur a activé « réduire le mouvement » dans les paramètres d'accessibilité de son OS, le FPS effectif est plafonné à **30** (ou au plus bas entre `maxFPS` et 30). Vous pouvez désactiver cela avec `respectReducedMotion: false`, mais ce faisant vous ignorez une préférence explicite de l'utilisateur.

`maxFPS` est aussi modifiable en direct : `scene.maxFPS = 30` pour un mode d'économie de batterie.

## Rendu par lots WebGL

Pour de grands ensembles de cercles ou de rectangles, la couche WebGL remplace de nombreux appels de chemin Canvas par entité par des chargements de tampons typés et un petit nombre de soumissions de dessin. Le point de bascule et l'accélération dépendent de la charge de travail et du matériel, et devraient être mesurés par benchmark.

### Activer la couche de lots

```typescript
const scene = new Scene(canvas, {
  pointBackend: 'webgl', // stacks a WebGL2 canvas over Canvas2D
});
```

### Activer une entité

Surchargez `getBatchCircle()` ou `getBatchRect()` au lieu de `render()` :

```typescript
class Dot extends Entity {
  radius = 4;
  color = '#00f0ff';

  // These are read every frame — animated values work.
  getBatchCircle() {
    return { radius: this.radius, color: this.color };
  }

  // Required fallback for Canvas mode or an unrepresentable world transform.
  isPointInside() {
    return false;
  }
  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.arc(0, 0, this.radius, 0, Math.PI * 2);
    renderer.fill(this.color);
  }
}
```

La Scene lit `getBatchCircle()` / `getBatchRect()` à chaque image et alimente la couche WebGL avec des primitives en espace monde représentables. Les couleurs et l'alpha sont des attributs par instance, de sorte qu'un tampon peut contenir des styles mixtes.

**Contraintes :**

- L'entité doit être une **feuille** (sans enfants).
- La propre échelle de l'entité doit être **uniforme** (`scaleX === scaleY`).
- Requiert `pointBackend: 'webgl'` sur la Scene.
- La transformation accumulée doit être représentable par une seule échelle + rotation. Les ancêtres non uniformes/cisaillés reviennent à `render()`.

La couche WebGL compose **au-dessus** du contenu Canvas2D (`z-index: 5`), de sorte que les primitives de lot se dessinent toujours par-dessus le contenu 2D, quel que soit l'ordre de l'arbre.

### `getBatchRect()` pour les rectangles

```typescript
getBatchRect() {
  return { width: this.width, height: this.height, color: this.color };
}
```

Les rects de lot prennent en charge une rotation par entité représentable. Les réflexions, le cisaillement et l'échelle accumulée non uniforme utilisent le repli du renderer normal.

## Élimination hors fenêtre avec `getBounds()`

Par défaut, chaque entité exécute `update()` et `render()` sur une image rendue, même si elle est complètement hors écran. Surchargez `getBounds()` pour renvoyer une boîte englobante en espace local et la Scene sautera l'appel `render()` de l'entité hors écran. Le parcours de l'arbre et `update()` s'exécutent tout de même :

```typescript
getBounds() {
  return { x: 0, y: 0, width: this.width, height: this.height };
}
```

`UIComponent` l'implémente déjà — tous les composants `@vectojs/ui` participent automatiquement à l'élimination. Pour les sous-classes brutes d'`Entity` de taille fixe, ajoutez `getBounds()` pour une performance gratuite sur les grandes scènes.

Par exemple, si 90 % de 5 000 entités feuilles bornées sont hors écran, il ne reste qu'environ 500 appels `render()`, mais la Scene visite et met tout de même à jour les 5 000 nœuds.

### La scène entière se met en pause hors écran

L'élimination par entité coûte tout de même un parcours. Lorsque le **canvas lui-même** sort complètement de la vue par défilement — un onglet de tableau de bord, un graphique sous la ligne de flottaison — un `IntersectionObserver` met la boucle rAF entièrement en pause et la reprend au retour, de sorte qu'une scène que personne ne peut voir ne coûte rien au lieu d'une mise à jour et d'un rendu complets par image. Rien à activer. (Là où `IntersectionObserver` n'est pas disponible, par exemple en SSR/jsdom, la scène est traitée comme toujours à l'écran.)

### `dt` est plafonné à 100 ms

Après un onglet en arrière-plan, une pause du débogueur ou un long GC, le temps réellement écoulé peut atteindre plusieurs secondes. Injecter cette valeur brute dans l'intégration fait téléporter la physique et les interpolations, c'est pourquoi le delta d'image est plafonné à `MAX_FRAME_DT` (100 ms). Si vous intégrez `dt` vous-même dans `update(dt)`, il ne dépassera jamais cette valeur.

## Limitation de la synchronisation a11y

À chaque image rendue, la `Scene` synchronise les positions et états de toutes les entités interactives vers leurs nœuds shadow DOM. Avec des centaines d'entités interactives s'animant simultanément, cette surcharge d'écritures DOM peut dominer le temps d'image.

Limitez avec `a11ySyncInterval` :

```typescript
const scene = new Scene(canvas, {
  a11ySyncInterval: 100, // sync at most once per 100 ms
});
// Or set live:
scene.a11ySyncInterval = 100;
```

L'intervalle est vérifié pendant que les animations s'exécutent ; `a11ySyncInterval: 100` limite la synchronisation à environ 10 fois par seconde au maximum et planifie une dernière mise à jour de rattrapage une fois le mouvement stabilisé. Choisissez l'intervalle en fonction de la latence d'accessibilité et du coût DOM mesuré plutôt que de supposer qu'une seule valeur convient à chaque UI.

## Performance du texte

### `setMaxWidth()` — le chemin critique pour le reflow

Le `LayoutEngine` sépare la mesure (froide) de la mise en page (chaude). Lorsque la fenêtre est redimensionnée et que le texte doit se réagencer :

```typescript
// Wrong: rebuilds the full measured text on every resize event
window.addEventListener('resize', () => {
  label.setText(label.text); // cold pass — re-segments and re-measures
});

// Correct: reuses cached measurements, only recalculates line breaks
window.addEventListener('resize', () => {
  label.setMaxWidth(newWidth); // hot pass — cheap
});
```

Le chemin chaud est en O(nombre de mots), et non en O(nombre de glyphes), et évite tous les appels à `Intl.Segmenter` et au `measureText` du canvas.

### `LayoutResultBuffer` — stockage réutilisable des coordonnées de texte

Pour les UI denses en données (grilles de données, terminaux, visionneuses de journaux) avec des milliers de glyphes par image, le chemin standard `layoutPrepared()` alloue un objet `LayoutNode` par glyphe. Utilisez plutôt `LayoutResultBuffer` :

```typescript
import { LayoutEngine, LayoutResultBuffer, createCanvasMeasurer } from '@vectojs/core/layout';

const engine = new LayoutEngine(400, Infinity, createCanvasMeasurer());
const buffer = new LayoutResultBuffer(); // reuse across frames (CAPACITY = 16384)

function renderRow(text: string) {
  const prepared = engine.prepare(text, {}, 14);
  buffer.reset();
  engine.layoutPreparedIntoBuffer(prepared, buffer);
  // buffer.xs, buffer.ys, buffer.ws, buffer.hs, buffer.chars — flat typed arrays
  for (let i = 0; i < buffer.count; i++) {
    renderer.fillText(buffer.chars[i], buffer.xs[i], buffer.ys[i], '14px monospace', '#e2e8f0');
  }
}
```

Le tampon réutilisable évite d'allouer un objet `LayoutNode` par glyphe à chaque mise en page chaude. Contraintes : capacité fixe, colonne unique seulement (pas de réordonnancement visuel BiDi, pas de rects d'exclusion). Utilisez `layoutPrepared()` lorsque vous avez besoin de ces fonctionnalités ; évitez `toLayoutResult()` sur le chemin chaud car il alloue des objets nœuds.

### `TextRasterCache` — blitter du texte répété au lieu de le remettre en forme

_Depuis Core 1.12.0._ Lorsqu'une vue dessine les **mêmes chaînes courtes des milliers de fois par image** (danmaku/barrage, fils de discussion/journaux, libellés de particules, valeurs de cellules répétées), le goulot d'étranglement n'est pas la mise en page — c'est `fillText` lui-même. Chaque appel remet en forme la chaîne, ré-analyse la couleur CSS et rastérise les glyphes sur le thread principal du CPU ; à des milliers d'appels par image, le thread principal sature dans du code natif (`(program)`) et le GPU reste affamé et sous-cadencé. Remplacer `fillText` par `drawImage` d'un run pré-rastérisé transforme ce coût CPU par appel en un blit bitmap peu coûteux :

```typescript
import { TextRasterCache } from '@vectojs/core';

const cache = new TextRasterCache(); // one per scene/renderer

function drawLabel(text: string, x: number, baselineY: number) {
  const r = cache.get('600 24px system-ui', '#38bdf8', text);
  if (r) renderer.drawImage(r.canvas, x - r.offsetX, baselineY - r.offsetY, r.width, r.height);
  else renderer.fillText(text, x, baselineY, '600 24px system-ui', '#38bdf8'); // headless fallback
}
```

Le gain vient de la **réutilisation** : lorsque l'ensemble de runs `(font, color, text)` distincts est borné (une bibliothèque de phrases, une petite palette, quelques tailles de police), le taux de succès en régime permanent approche 100 %. Un plafond d'éviction par ordre d'insertion (`maxEntries`, 4096 par défaut) borne la mémoire face à du contenu illimité saisi par l'utilisateur, et `dpr > 1` garde le texte net sur HiDPI tandis que la taille du blit reste en pixels CSS. Il **n'aide pas** le texte très varié ou dessiné une seule fois — c'est là un surcoût pur. Voir la [référence du renderer](/reference/core-renderer/#textrastercache).

## Calcul CPU vs. goulots d'étranglement de rendu

Dans un framework DOM de navigateur traditionnel, les goulots d'étranglement de performance se situent presque toujours dans le **pipeline de rendu et de reflow de la mise en page** du navigateur (manipulations DOM, recalcul de style et peinture). Cependant, comme VectoJS contourne entièrement le DOM et traite la mise en page, l'élimination et les interactions mathématiquement en mémoire, le goulot d'étranglement de performance se déplace de la couche GPU/rendu directement vers le **calcul CPU mono-thread de JavaScript**.

À des nombres de nœuds actifs suffisamment élevés, le parcours côté CPU, les mises à jour, la mise en page et le hit testing peuvent dépasser le budget d'image de $16{,}67\text{ ms}$ avant la rastérisation. Le point de bascule dépend de la charge de travail et de l'appareil.

VectoJS aborde ces goulots d'étranglement de calcul à partir de premiers principes en fournissant des **« Échappatoires »** dédiées pour contourner les limitations mono-thread du CPU.

---

### 1. Simulations de particules à haute densité (par particule, pas N-corps)

**Le goulot d'étranglement** : L'intégration JavaScript par particule est en $O(N)$ à chaque image et finit par consommer le budget d'image du thread principal. Le nombre où cela se produit dépend de l'appareil et du modèle.

**L'échappatoire : les compute shaders WebGPU (`ComputeParticleEntity`)**
Pour contourner entièrement l'exécution CPU, VectoJS fournit `ComputeParticleEntity`. Sous le capot :

- Les équations physiques (intégration d'Euler, tension de ressort et forces d'attraction de champ) sont compilées en **compute shaders WGSL (WebGPU Shading Language)**.
- À l'exécution, les données restent résidentes en VRAM du GPU, ce qui permet à la passe de calcul WebGPU de paralléliser la simulation sur des milliers de cœurs GPU.
- Le renderer revient automatiquement à une boucle CPU équivalente (`updateCPU()`) lorsque WebGPU est indisponible ou que l'appareil est perdu.

> [!IMPORTANT] > **Ce n'est pas une simulation à $N$-corps.** La force de chaque particule est calculée uniquement par rapport à trois points _fixes_ — son origine de ressort, le curseur de la souris et un centre d'explosion optionnel. Il n'y a pas d'interaction particule-contre-particule ni d'index spatial impliqué, ce qui est précisément ce qui la rend massivement parallèle et adaptée au GPU. Si votre simulation nécessite une véritable interaction entre voisins (collision ou répulsion particule-contre-particule, nuées, gravité N-corps), `ComputeParticleEntity` ne le couvre pas — vous devrez écrire votre propre passe de calcul WGSL avec une requête de voisinage intégrée, ou exécuter des requêtes de voisinage basées sur `SpatialHashGrid` sur le CPU (voir [`SpatialHashGrid`](#3-interaction-dune-mer-dentités-catastrophe-de-complexité-on2) ci-dessous, et le [guide du moteur physique](/learn/physics-engine/) pour un exemple CPU concret). Il n'existe actuellement aucune abstraction générique « exécuter un calcul arbitraire sur GPU avec repli CPU » dans le moteur — `ComputeParticleEntity` est une implémentation spécifique et étroite, et non un motif réutilisable.

Le débit haut de gamme dépend fortement du GPU, du navigateur, du DPR, du modèle de particules et de la composition. Ce dépôt n'a aucun résultat WebGPU haut de gamme enregistré, alors mesurez votre propre scène avec le bouton **Export report** (voir [Mesurer la performance réelle](#mesurer-la-performance-réelle) ci-dessous).

---

### 2. Mesure de texte à haute densité et reflow typographique

**Le goulot d'étranglement** : La mise en page dynamique du texte est l'une des tâches CPU les plus coûteuses en ingénierie frontend. Elle nécessite une tokenisation de mots basée sur un dictionnaire (`Intl.Segmenter`), un tri BiDi et des mesures de largeur de police au niveau du navigateur (appelant l'API `measureText` du canvas). Tenter de calculer les mises en page de texte pour des dizaines de milliers de glyphes en une seule image (comme dans les terminaux financiers, les flux de journaux actifs ou les grilles de données) figera le thread principal JS sur le pipeline de mesure de la « passe froide ».

**L'échappatoire : mise en page hors-thread, mises en page fractionnées et mémoire réutilisée**
VectoJS fournit trois niveaux d'optimisation du texte :

- **Mise en page MSDF hors-thread (`LayoutWorkerManager`)** : `MSDFTextEntity` peut envoyer le texte plus des métriques de police/glyphes précalculées à un Web Worker en arrière-plan, avec anti-rebond par entité. Le worker effectue le placement des lignes et renvoie des tampons de coordonnées/styles typés ; il n'appelle pas les API de mesure de police du navigateur.
- **Séparation froid/chaud** : VectoJS sépare les mises en page en « froid » (analyse du texte et mesure de largeur des glyphes) et « chaud » (calculs de retour à la ligne). Lorsque le texte se réagence à cause d'un redimensionnement, les résultats froids sont réutilisés, évitant toutes les API de mesure du navigateur et ramenant la complexité de la mise en page au redimensionnement à un pur $O(\text{nombre de mots})$.
- **Tampons TypedArray réutilisables (`LayoutResultBuffer`)** : Pour éviter d'allouer des milliers d'objets nœuds de mise en page temporaires, les développeurs peuvent écrire les coordonnées de mise en page dans des tampons plats préalloués. L'appelant environnant peut toujours allouer ; la garantie porte spécifiquement sur le fait que le chemin du tampon réutilise son stockage de coordonnées.

> [!IMPORTANT] > **`LayoutWorkerManager` est un seul thread d'arrière-plan, pas un pool, et il est câblé pour un seul composant.** Il est utilisé en interne par `MSDFTextEntity` (la primitive de texte à police GPU/MSDF) — les composants de texte `@vectojs/ui` par défaut (`Text`, `RichText`) effectuent la mise en page de manière synchrone sur le thread principal, séparation froid/chaud comprise. Si vous rendez de très gros volumes de texte à composants par défaut et que vous atteignez une limite, la séparation froid/chaud et `LayoutResultBuffer` s'appliquent toujours, mais vous n'obtiendrez pas la mise en page hors-thread gratuitement — vous devriez construire votre propre déchargement vers un Worker, ou passer à `MSDFTextEntity`. Plus généralement : en dehors de ce seul chemin de mise en page de texte, rien d'autre dans le moteur ne s'exécute hors du thread principal aujourd'hui. Le parcours du VMT, le hit-testing et la physique de ressort sont tous synchrones.

---

### 3. Interaction d'une mer d'entités (catastrophe de complexité $O(N^2)$)

**Le goulot d'étranglement** : Les vérifications de collision ou de proximité entité-contre-entité par paires nécessitent $O(N^2)$ comparaisons de candidats. Cette croissance devient impraticable bien avant de très grands nombres de scènes, la limite exacte dépendant du travail par paire.

**L'échappatoire : la grille de hachage spatial (`SpatialHashGrid`)**
Pour les requêtes de collision/proximité gérées par l'application, VectoJS exporte **SpatialHashGrid**. La Scene n'indexe pas automatiquement les entités :

- L'espace de coordonnées 2D est discrétisé en cellules d'une taille fixe que vous choisissez ; les coordonnées de cellule sont combinées en une seule clé de compartiment via une [fonction de couplage de Cantor](https://en.wikipedia.org/wiki/Pairing_function), stockée dans une simple `Map` — et non une table de hachage à capacité fixe.
- Appelez `insert(id, x, y, w, h)` lorsque l'AABB en espace monde d'une entité change, ou videz/reconstruisez la grille pour une image dynamique.
- Appelez `query(x, y, w, h)` pour récupérer les ID de chaque cellule chevauchée par un AABB de requête local, puis exécutez des tests de collision exacts sur ces candidats.
- Cela peut réduire la physique locale au niveau applicatif de **$O(N^2)$** aux cellules/résultats visités par chaque requête. Les `findEntityAt()` intégrés et l'élimination hors fenêtre restent des parcours d'arbre en O(N).

> [!WARNING] > **Il n'y a aucune atténuation automatique pour les compartiments denses.** `SpatialHashGrid` (et le hachage spatial indépendant utilisé par la démo Knowledge Graph) stockent chaque cellule comme un ensemble plat sans structure interne — pas de dimensionnement adaptatif des cellules, pas de chaînage de débordement, pas de grille hiérarchique/multi-résolution. Le chiffre « $O(1)$ en moyenne » suppose une distribution à peu près uniforme des entités entre les cellules pour votre `cellSize` choisie. Si vos données peuvent fortement se regrouper — de nombreuses entités atterrissant dans la même poignée de cellules (une foule se formant en un point, une vue dézoomée où des milliers de nœuds se chevauchent sur quelques pixels) — ces cellules se dégradent vers des balayages linéaires en $O(k)$, comme sans index du tout. Il n'y a aujourd'hui aucune échappatoire automatique pour cela : le seul levier est de choisir une `cellSize` adaptée à la taille de vos entités et à la densité attendue, et de la réévaluer si le comportement de regroupement de vos données change. Si vous construisez quelque chose où un regroupement extrême et imprévisible est une réelle possibilité, prévoyez de mesurer vous-même l'occupation de compartiment dans le pire cas plutôt que de supposer que le cas moyen tient.

---

## Mesurer la performance réelle

> [!WARNING]
> Chrome headless utilise souvent la rastérisation logicielle et une planification d'images différente. Traitez son FPS comme un signal de régression dans le même environnement, et non comme une borne inférieure ou une prédiction de production.

### N'utilisez pas le FPS comme métrique

Le FPS est limité par la synchronisation verticale, donc il **sature** — des nombres saturés cachent à la fois les régressions et les améliorations. Un exemple réel de nos propres mesures : une scène rapportait 59 FPS, mais ne faisait que 3,4 ms de travail dans une image de 17 ms, soit environ 80 % de chaque image passée à ne rien faire. Elle avait simplement négocié un vsync à 60 Hz. Ce 59 ne dit rien sur le code.

Le corollaire est important pour le diagnostic : **« j'ai changé X et le FPS n'a pas bougé » ne prouve rien quand le FPS est limité.** Avant et après le changement, les deux peuvent être confortablement dans le budget de l'image.

Mesurez plutôt :

- **Les centiles du temps d'image** (p50/p99), pas la moyenne. Sur les écrans à haute fréquence de rafraîchissement, les temps d'image sont quantifiés par le vsync en intervalles 1×/2×/3× sans rien entre les deux, donc la moyenne décrit une valeur qui ne se produit jamais.
- **La proportion d'images dans le budget** — le nombre qui détermine si le mouvement semble stable. À 240 Hz, le budget est de 4,17 ms ; à 60 Hz, il est de 16,67 ms.
- **Mesurez le coût de chaque phase séparément** (layout, lot JS, soumission GPU), ainsi vous savez sur quoi agir.

### Attribuer le temps GPU nécessite `gl.finish()`

Les appels WebGL sont asynchrones. Envelopper un draw ou `flush()` avec `performance.now()` mesure le temps d'**insertion dans la file d'attente**, pas le travail GPU — dans nos mesures, la différence atteint jusqu'à 5×. Pour attribuer honnêtement le coût de soumission, effectuez le travail puis videz forcément le pipeline :

```typescript
const t0 = performance.now();
drawEverything();
gl.finish(); // sérialise l'image ; sans cela les chiffres n'ont pas de sens
const submitMs = performance.now() - t0;
```

`EXT_disjoint_timer_query_webgl2` semble un meilleur outil, mais en pratique il n'est pas fiable : Firefox ne l'expose généralement pas, et sous Chrome il existe souvent mais ne renvoie pas d'échantillons utilisables (chaque essai rapporte indisponible ou désolidarisé). Ne construisez pas une stratégie de mesure là-dessus.

### Benchmark dans un navigateur, pas dans Node ni Bun

Les exécutants serveur sont le mauvais outil pour tout ce qui est orienté utilisateur : pas de GPU, pas de compositeur, pas de DPR, échauffement JIT et résolution de temporisateur différents. Ils sont utiles pour **isoler les causes** — l'une de nos optimisations a été découverte avec une sonde Node — mais pas pour produire des chiffres que vous citez. Un changement **mesuré à 12,4× sous Bun/JSC n'était que de 3,2–4,7× dans de vrais navigateurs**, soit environ 3 fois trop optimiste.

Citez les deux moteurs. V8 et SpiderMonkey diffèrent considérablement ; les chiffres d'un seul moteur ont été à plusieurs reprises trompeurs.

### Liste de vérification pratique

1. Exécutez dans un vrai navigateur sur du vrai matériel GPU.
2. Rapportez la médiane de N exécutions (7 est une valeur par défaut raisonnable), en nommant précisément le scénario.
3. Enregistrez le navigateur+version, CPU/GPU, taille CSS du viewport **et DPR**, nombre d'entités et de visibles, sélection du backend et la fréquence de rafraîchissement de l'écran.
4. Citez les mesures dans le navigateur dans les PR et la documentation, jamais la sortie headless.

Pour des benchmarks personnalisés, collectez les temps d'image dans la boucle `update()` et rapportez les centiles :

```typescript
const samples: number[] = [];

class BenchEntity extends Entity {
  update(dt: number, time: number) {
    super.update(dt, time);
    if (samples.length < 300) samples.push(dt);
    if (samples.length === 300) {
      const sorted = [...samples].sort((a, b) => a - b);
      const pct = (q: number) => sorted[Math.floor(sorted.length * q)]!;
      const budget = 1000 / 60; // sur les panneaux à haute fréquence, utilisez 1000 / 240
      const inBudget = samples.filter((s) => s <= budget).length / samples.length;
      console.log(
        `p50 ${pct(0.5).toFixed(2)}ms  p99 ${pct(0.99).toFixed(2)}ms  ` +
          `inside budget ${(inBudget * 100).toFixed(1)}%`,
      );
    }
  }
}
```

`dt` est en millisecondes. Notez qu'il rapporte l'_intervalle_ entre les images, qui sous vsync est quantifié — il vous indique si vous respectez le budget, pas la marge restante. Pour mesurer la marge, chronométrez les phases que vous contrôlez.

## Référence rapide : quel levier pour quel problème

| Symptôme                                          | Correctif                                                                                                                                             |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| La scène se limite à 2 fps au repos               | Attendu — appelez `markDirty()` sur les changements d'état, ou utilisez `renderMode: 'onDemand'` pour les scènes surtout statiques                    |
| Une entité animée manuellement tombe à 2 fps      | Surchargez `hasPendingAnimations()` ou pilotez-la via `animateTo()` / `springTo()` pour que la scène sache qu'un mouvement est en cours               |
| Une UI statique gaspille la batterie              | Passez à `renderMode: 'onDemand'`                                                                                                                     |
| De nombreux cercles compatibles sont lents        | Testez `pointBackend: 'webgl'` + `getBatchCircle()` sur l'appareil cible                                                                              |
| Les entités hors écran gaspillent le CPU          | Implémentez `getBounds()` sur l'entité                                                                                                                |
| Surcharge d'écritures DOM pendant l'animation     | Définissez `a11ySyncInterval: 100`                                                                                                                    |
| Le reflow de texte au redimensionnement est lent  | Utilisez `setMaxWidth()` au lieu de `setText()`                                                                                                       |
| Le texte dense cause une pression d'allocation    | Utilisez `LayoutResultBuffer` + `layoutPreparedIntoBuffer()`                                                                                          |
| Le FPS diffère en CI                              | Comparez des exécutions CI équivalentes ; mesurez le débit visible par l'utilisateur sur le matériel cible                                            |
| Les particules dynamiques épuisent le budget CPU  | Testez `ComputeParticleEntity` pour décharger son modèle de force à point fixe vers WebGPU                                                            |
| Le reflow de texte multiligne fige le thread      | Déléguez la mise en page de `MSDFTextEntity` hors-thread via `LayoutWorkerManager` (les `Text`/`RichText` par défaut restent sur le thread principal) |
| L'interaction d'une mer d'entités est en $O(N^2)$ | Implémentez un `SpatialHashGrid` — réduit à $O(k)$ en moyenne, pas automatique sous fort regroupement ; dimensionnez les cellules pour vos données    |
