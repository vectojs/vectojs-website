+++
title = "FAQ"
description = "Questions fréquemment posées sur VectoJS — décisions d'architecture, performances, accessibilité et dépannage."
weight = 49

[extra]
order = 49
+++

# Questions fréquemment posées

## Architecture

### Pourquoi canvas plutôt que le DOM ?

Le DOM fournit une structure sémantique de document, une mise en page CSS et un modèle
d'accessibilité mature. Pour les charges de travail dominées par des géométries
personnalisées ou de grands ensembles visuels qui changent fréquemment, canvas peut
éviter un nœud DOM stylisé par élément dessinable et donne à l'application un contrôle
direct de la mise en page et du rendu. Il déplace aussi la responsabilité de la mise en
page, du hit-testing, de la sémantique et de la mesure des performances vers le
framework/l'application.

### Comment l'accessibilité fonctionne-t-elle si tout est dessiné sur canvas ?

`Scene` maintient une superposition de projection d'accessibilité (`a11yRoot`) de vrais
éléments `<button>`, `<input>`, `<a>` et `<div>` pour les entités interactives éligibles.
Ce n'est pas l'API Shadow DOM du navigateur. La superposition suit le décalage du
canvas/l'échelle CSS et la transformation affine de chaque entité, reçoit les événements
natifs de pointeur/clavier/focus, et est visible par les DevTools et l'automatisation
basée sur les rôles. Les applications ont toujours besoin de rôles, d'étiquettes, d'ordre
de focus, de comportement clavier et de tests de lecteur d'écran corrects.

Définissez `entity.interactive = true` pour projeter un nœud d'ombre. Redéfinissez
`getA11yAttributes()` pour contrôler la balise et les attributs ARIA :

```typescript
getA11yAttributes() {
  return { tag: 'button', role: 'button', label: 'Submit form' };
}
```

### Existe-t-il une intégration React / Vue / Svelte ?

Pas encore en tant que paquets first-party. Parce que VectoJS possède un élément
`<canvas>`, il s'intègre avec n'importe quel framework exactement comme le ferait une
bibliothèque WebGL — montez le canvas, initialisez une `Scene` dans un hook de cycle de
vie (`useEffect`, `onMounted`, etc.), et démontez-la au désassemblage.

```typescript
// Exemple React
import { useEffect, useRef } from 'react';
import { Scene } from '@vectojs/core';

export function VectoCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const scene = new Scene(canvasRef.current!, { maxFPS: 60 });
    scene.start();
    return () => scene.destroy();
  }, []);
  return <canvas ref={canvasRef} />;
}
```

### Peut-on assembler deux Scènes de manière transparente, comme des tuiles ?

Pas comme une seule surface logique. Une `Scene` possède exactement un `<canvas>` et un
arbre `Entity` racine — il n'existe pas d'API pour que deux `Scene` partagent un espace
de coordonnées, passent des entités entre elles ou effectuent un hit-test à travers la
frontière. Exécuter deux instances `Scene` côte à côte (deux canvas positionnés avec du
CSS ordinaire) fonctionne et peut sembler transparent, mais elles restent fonctionnellement
indépendantes : boucles de rendu séparées, `renderMode`/suivi de saleté séparés,
projections d'accessibilité séparées. Si vous avez besoin que des entités interagissent,
se transforment ou effectuent un hit-test les unes par rapport aux autres, mettez-les
dans l'arbre d'une seule `Scene` plutôt que d'essayer d'en relier deux.

---

## Performance

### Combien d'entités VectoJS peut-il gérer à 60 ips ?

Il n'existe pas de nombre indépendant du backend : la complexité des chemins, le texte,
le ratio de pixels de l'appareil, la projection d'accessibilité, le travail de mise à
jour, le GPU/pilote et le pourcentage visible modifient tous le résultat. Le benchmark
sans tête actuellement inclus couvre les entités Canvas simples à 1 000 et 5 000 nœuds ;
il ne prouve pas des affirmations à six chiffres pour WebGL/WebGPU. Exécutez le rapport
de démo sur le matériel cible et enregistrez les percentiles de temps d'image pour votre
charge de travail.

### Qu'est-ce que l'option `pointBackend: 'webgl'` ?

Quand elle est définie, la `Scene` empile un canvas WebGL2 transparent par-dessus le
canvas Canvas2D principal. Les entités feuilles représentables qui implémentent
`getBatchCircle()` / `getBatchRect()` sont collectées dans des tampons typés et soumises
en dessins WebGL mis en lot, tandis que le texte, les images, les formes complexes et les
transformations affines non supportées restent sur Canvas2D. Mesurez le point de
croisement pour votre matériel ; le dépôt ne contient actuellement pas de facteur
d'accélération universel vérifié.

### Qu'est-ce que `renderMode: 'onDemand'` ?

En mode `'onDemand'`, la Scène ne dessine que quand `scene.markDirty()` est appelé ou
qu'un pilote d'animation est en cours. Les ticks statiques planifient toujours rAF et
inspectent l'arbre pour un mouvement en attente, mais ils sautent le travail de mise à
jour/rendu d'entité et la soumission GPU. Utilisez ce mode pour les UI principalement
statiques — tableaux de bord, formulaires, menus.

```typescript
scene.renderMode = 'onDemand';
entity.on('click', () => {
  entity.animate({ x: entity.x + 50 }, 300); // déclenche dirty automatiquement
});
```

### Pourquoi mon FPS est-il faible lors des tests en Node.js / sans tête ?

Chrome sans tête utilise souvent un rastériseur logiciel et a un comportement
différent de planification/vsync. Son FPS est utile pour la comparaison de régressions
dans le même environnement, pas comme limite inférieure ou prédiction pour les GPU des
utilisateurs. Mesurez sur le navigateur et le matériel cibles.

> [!TIP]
> Utilisez le bouton **Exporter le rapport** dans la démo Nexus pour obtenir une
> mesure GPU réelle avec votre matériel et navigateur actuels. Copiez-collez ces
> nombres dans vos PR au lieu du FPS sans tête.

---

## L'API Entity

### Qu'est-ce que `clipChildren` ?

Définir `clipChildren = true` limite les dessins enfants normaux à la boîte
`[0,0]–[width,height]` de l'entité. C'est ainsi que `ScrollView` implémente le
débordement. CanvasRenderer et SVGRenderer préservent le clip transformé. ThreeRenderer
intersecte les rectangles de ciseau en utilisant l'AABB monde transformé du clip, donc
les clips pivotés/cisaillés sont des approximations alignées sur les axes. Les primitives
promues vers la couche WebGL points séparée et l'overlay WebGPU particules ne sont pas
clipées par la pile de clip du renderer parent.

### Qu'est-ce que `a11yFullViewport` ?

Normalement, un nœud d'ombre DOM n'est projeté que quand `entity.interactive && entity.width > 0`.
Pour les entités qui couvrent tout le viewport de la Scène (un graphique à canvas infini,
un reconnaisseur de gestes plein écran), il n'y a pas de boîte englobante significative.
Définir `a11yFullViewport = true` crée un nœud d'ombre de la taille de la Scène derrière
tous les autres nœuds d'ombre ; la racine de projection mappe ensuite cette boîte logique
sur la boîte CSS du canvas.

### Mon animation `Entity.update()` est deux fois plus rapide que prévu — pourquoi ?

> [!CAUTION] > `Entity.update(dt, time)` reçoit **dt en millisecondes**, pas en secondes.
> C'est le piège VectoJS le plus courant. `dt` à 60 ips ≈ 16,7, pas 0,017.

Une erreur courante lors du portage depuis des bibliothèques physiques qui utilisent les
secondes :

```typescript
// Faux : traite ms comme des secondes → 1000× trop rapide
this.x += velocity * dt;

// Correct : convertir en secondes, ou utiliser des unités ms
this.x += velocity * (dt / 1000);
```

Les ressorts physiques (`SpringPhysics`, `ScrollView`) utilisent en interne `dt / 1000`
pour convertir avant d'exécuter leurs simulations.

### Quelle est la différence entre `emit()` et `dispatchEvent()` ?

- `entity.emit(event, payload)` — déclenche uniquement les écouteurs en **phase bulle**
  de l'entité elle-même. Pas de parcours d'arbre. C'est un chemin interne au composant
  (par exemple, un contrôle de formulaire émettant son propre `change`).
- `entity.dispatchEvent(event)` — exécute le parcours complet **capture + bulle** à la
  DOM : la capture va racine → cible, la bulle va cible → racine. C'est ainsi que `Scene`
  distribue les événements de pointeur.

---

## Personnalisation et animation

### Jusqu'où va la personnalisation de VectoJS — peut-il faire des effets d'écran de démarrage ou de transition ?

Oui. Chaque propriété animable (`x`, `y`, `scaleX`, `scaleY`, `rotation`, `opacity`) peut
être pilotée par un `TweenDriver` (basé sur des courbes, depuis l'ensemble `Easing` intégré
ou une fonction personnalisée) ou un `SpringDriver` (physique, avec `stiffness`/`damping`/`mass`
configurables). Pour les effets riches en particules spécifiquement, `ComputeParticleEntity`
avec `particleBackend: 'webgpu'` exécute un shader de calcul avec une force ressort-vers-origine,
une répulsion de souris, une limitation de vélocité, un rebond aux limites et un paramètre
**force d'explosion** dédié (`triggerExplosion(x, y, force)`) — un effet d'éclat/éclaboussure
est une primitive de première classe, pas quelque chose à simuler avec des tweens. Le repli
CPU (`updateCPU`) reflète le même modèle de force quand WebGPU n'est pas disponible.

### Comment la forme d'une `Entity` est-elle définie — peut-elle être un pentagone, une ellipse, un polygone irrégulier ?

Oui, et la forme est vraiment deux préoccupations indépendantes et remplaçables :

- **Forme visuelle** : `render(renderer)` dessine via les primitives de chemin vectoriel
  d'`IRenderer` (`moveTo`, `lineTo`, `bezierCurveTo`, `arc`, `closePath`) — les mêmes
  primitives qu'un chemin Canvas2D/SVG écrit à la main utiliserait, donc tout polygone,
  ellipse ou contour courbe est dessinable. `SplineEntity` est l'exemple intégré : il rend
  des courbes polynomiales cubiques arbitraires en les convertissant en segments de Bézier.
- **Forme de hit-test** : `isPointInside(globalX, globalY): boolean` est `abstract` sur
  la classe de base `Entity` — chaque entité concrète fournit sa propre logique. Rien
  n'exige (ou ne prend par défaut) une boîte englobante alignée sur les axes ;
  `isPointInside` d'un pentagone peut faire un véritable calcul point-dans-polygone, une
  ellipse peut faire la vérification de forme quadratique, etc.

Parce que les deux sont des méthodes séparées, la région cliquable d'une forme n'a pas à
correspondre exactement à sa silhouette dessinée (utile pour des cibles tactiles généreuses
sur les petites formes).

### Le texte et les composants s'adaptent-ils aux différents appareils et niveaux de zoom du navigateur ? Le redimensionnement du texte est-il totalement adaptatif ?

Le mécanisme existe, mais il est explicite plutôt qu'automatique par défaut :

- **HiDPI** : `CanvasRenderer` lit `window.devicePixelRatio` à la construction et sur
  `resize()`, ajustant le stockage de sauvegarde du canvas en conséquence — un écran
  Retina/HiDPI rend proprement sans code d'application supplémentaire.
- **Zoom du navigateur** : la plupart des navigateurs changent le `devicePixelRatio`
  effectif au zoom et déclenchent un événement `resize` de `window`, que `Scene` écoute
  déjà et auquel elle répond en appelant le `resize()` du renderer.
- **Reflux de texte** : `LayoutEngine.setMaxWidth()` est spécifiquement conçu comme un
  « chemin chaud » bon marché pour cela — il réutilise le `PreparedText` mis en cache et
  déjà mesuré depuis le dernier passage `prepare()` froid et ne refait que le saut de ligne,
  pas la re-segmentation ou la re-mesure. Appelez-le depuis votre propre gestionnaire de
  redimensionnement pour faire refluer le texte à moindre coût à n'importe quelle nouvelle
  largeur.

Donc : les primitives pour une mise en page adaptative et bon marché en redimensionnement
existent et sont utilisées en interne par les composants UI, mais une `Entity` personnalisée
brute ne refait pas le reflux « gratuitement » — vous branchez votre gestionnaire de
redimensionnement à l'appel `setMaxWidth`/layout concerné vous-même, de la même manière
que vous brancheriez un redimensionnement de canvas dans n'importe quel renderer en mode
immédiat.

### En quoi le modèle d'animation de VectoJS diffère-t-il des animations CSS ? Tout est-il pré-calculé avant le rendu ?

Non — rien n'est cuit dans des images clés à l'avance. `TweenDriver.tick(dtMs)` et
`SpringDriver.tick(dtMs)` sont des intégrateurs en temps réel : à chaque image, ils
avancent à partir du temps _réel_ écoulé depuis la dernière image, pas à partir d'une
chronologie précalculée. `SpringPhysics` (le moteur derrière `SpringDriver`) fait de
l'intégration Euler en direct en sous-pas fixes, avec une limite de stabilité pour le
grand `dt` qu'un onglet en arrière-plan peut livrer au retour.

La différence pratique apparaît quand vous changez la cible en pleine animation :
`driver.retarget(to)` sur un ressort conserve la valeur et la vélocité actuelles et
continue d'intégrer en douceur vers la nouvelle cible — pas de saut, pas de redémarrage.
Une transition/animation CSS dont la cible change en vol redémarre ou saute généralement,
car elle interpole le long d'une courbe prédéterminée plutôt que de simuler la physique
image par image.

### Comment puis-je désactiver les animations ressort/inertie par défaut sur les composants, ou les remplacer par des transitions standard ?

Par défaut, les composants défilants de VectoJS (comme `ScrollView` et `VirtualList`) et
les propriétés utilisent une physique basée sur les ressorts (`'spring'`) pour les
transitions fluides. Si vous voulez désactiver ces animations pour un comportement plus
vif et instantané, ou les remplacer par des transitions cubic-bezier standard (comme
`easeOutCubic`), vous avez trois approches principales :

#### 1. Modifier la configuration de transition sur l'entité cible

Toute `Entity` expose une méthode `setTransition`. Vous pouvez remplacer la transition
ressort par défaut en appelant `setTransition` sur l'élément cible avec une `duration`
personnalisée (en millisecondes) et une fonction `easing`, ou la désactiver entièrement :

```typescript
// Pour passer à une transition rapide sans rebond (comme easeOutCubic)
entity.setTransition({
  y: { duration: 120, easing: 'easeOutCubic' },
});

// Pour désactiver entièrement les animations (instantané)
entity.setTransition({
  y: null, // efface le pilote de transition
});
```

#### 2. Position instantanée sans engager le ressort

Si vous voulez déplacer une entité immédiatement sans déclencher de transition configurée
(contournant le ressort entièrement), utilisez la méthode `setImmediate` :

```typescript
// Positionne instantanément la cible
entity.setImmediate('y', targetY);
```

#### 3. Contourner la physique Canvas pour le défilement mobile

Pour les pages plein écran où les utilisateurs mobiles attendent un défilement à inertie
natif plutôt que des ressorts simulés par Canvas, transmettez les gestes tactiles au
viewport du navigateur :

1. Liez des écouteurs tactiles au Canvas pour convertir les delta de glissement tactile
   en défilements natifs de fenêtre :

   ```typescript
   let touchStartY = 0;
   canvas.addEventListener(
     'touchstart',
     (e) => {
       if (e.touches && e.touches[0]) touchStartY = e.touches[0].clientY;
     },
     { passive: true },
   );

   canvas.addEventListener(
     'touchmove',
     (e) => {
       if (e.touches && e.touches[0]) {
         const touchY = e.touches[0].clientY;
         window.scrollBy(0, touchStartY - touchY);
         touchStartY = touchY;
       }
     },
     { passive: true },
   );
   ```

2. Écoutez l'événement `"scroll"` de `window` et synchronisez la position de défilement
   avec le conteneur de rendu en utilisant `setImmediate` ou une transition d'assouplissement
   rapide :

   ```typescript
   window.addEventListener('scroll', () => {
     mainScroll.y = -window.scrollY; // Ou mainScroll.setImmediate('y', -window.scrollY);
   });
   ```

---

## Composants UI et Devtools

### Qu'offrent les devtools et comment aident-ils au débogage ?

`@vectojs/devtools` est un inspecteur dans la page — un panneau (lui-même rendu avec
VectoJS) qui vous donne :

- Une vue arborescente en direct du Virtual Math Tree, avec des badges pour le type
  d'entité, la géométrie et les animations actives
- La sélection d'entité en un clic (cliquez sur une entité sur le canvas pour la
  sélectionner dans l'arbre)
- Un relevé de transformation monde (position, échelle, rotation telles qu'effectivement
  calculées après la chaîne complète des ancêtres)
- L'édition par touches de déplacement de l'entité sélectionnée
- Une surbrillance d'overlay sur la page hôte montrant les limites monde de l'entité
  sélectionnée

`Scene` expose des accesseurs `rootEntity`/`overlayRootEntity` en lecture seule
spécifiquement pour que des outils comme celui-ci puissent parcourir l'arbre sans avoir
besoin d'un accès interne privilégié.

### À quoi dois-je faire attention quand j'utilise les composants UI natifs de VectoJS ?

Quelques modèles à connaître, tirés directement de l'audit de l'ensemble des composants :

- **L'unicité de `entity.id` est votre responsabilité.** Le moteur ne l'applique pas.
  C'est crucial pour la projection d'accessibilité (`Scene` indexe les nœuds d'ombre DOM
  par id d'entité) et pour tout votre propre code qui indexe les entités par id
  (par exemple `SpatialHashGrid`) — choisissez les ids de la même manière que vous
  choisiriez des clés dans une `Map`.
- **Les composants qui attachent un écouteur à une autre entité doivent être `destroy()`és.** `Tooltip`, `Popover` et les composants similaires « d'attachement à une cible »
  stockent leur gestionnaire et le retirent dans `destroy()` — appelez-le toujours quand
  vous avez fini avec le composant, de la même manière que vous retireriez un écouteur
  ajouté manuellement.
- **`interactive = true` n'est pas gratuit.** Le définir projette un vrai nœud d'ombre
  DOM pour cette entité. C'est bien pour les boutons, les liens et les contrôles de
  formulaire ; évitez-le sur de très grandes collections d'entités feuilles.
  `GridTextEntity`, par exemple, désactive explicitement `interactive` pour toute sa grille
  spécifiquement pour éviter de projeter un nœud d'ombre par caractère à grande échelle.
- **Les composants personnalisés basés sur le glisser devraient suivre le modèle de capture
  de pointeur intégré.** `Slider` et compagnie appellent `setPointerCapture()` sur
  `pointerdown` (via leur élément projeté a11y), ce qui permet à un glissement rapide qui
  dépasse les limites visuelles du composant de continuer à suivre correctement. Si vous
  construisez votre propre composant déplaçable, suivez le même modèle plutôt que de vous
  fier uniquement à `pointermove`/`pointerleave`. Gérez `pointercancel` comme chemin
  d'annulation pour qu'une interruption du navigateur ne puisse pas laisser une transaction
  de glissement ou de sélection active.

---

## Accessibilité et automatisation

### Comment faire fonctionner un composant avec `page.getByRole()` de Playwright ?

Retournez la bonne balise et le bon rôle depuis `getA11yAttributes()` :

```typescript
// Bouton accessible
getA11yAttributes() { return { tag: 'button', role: 'button', label: 'Envoyer' }; }

// Lien accessible
getA11yAttributes() { return { tag: 'a', role: 'link', label: 'Accueil', href: '/' }; }

// Champ de texte accessible
getA11yAttributes() { return { tag: 'input', inputType: 'text', placeholder: 'Rechercher…' }; }
```

Les composants intégrés (`Button`, `Input`, `Link`, etc.) le font automatiquement.

### La position du nœud d'ombre semble incorrecte — les entités sont décalées

Deux causes courantes :

1. **Le parent du canvas n'est pas `position: relative`** — `Scene` applique ceci
   automatiquement à chaque image, mais si une autre règle CSS force `position: static`
   après le démarrage de la scène, les nœuds d'ombre positionnés en absolu seront décalés
   par rapport au mauvais bloc conteneur.
2. **`a11yOffsetX` / `a11yOffsetY`** — si vous avez précédemment défini ces valeurs
   comme solution de contournement, essayez de les supprimer d'abord pour voir si le
   positionnement sous-jacent est en fait correct.

Activez `debugA11y: true` dans `SceneOptions` pour voir des boîtes de surbrillance
translucides sur chaque nœud d'ombre :

```typescript
const scene = new Scene(canvas, { debugA11y: true });
```

---

## Particules WebGPU

### `ComputeParticleEntity` n'affiche rien — quel est le problème ?

Les causes les plus courantes :

1. **`initRandomParticles()` n'a pas été appelé** — sans initialisation des données de
   particules, toutes les positions sont `(0,0)` et les tailles sont `0`.
2. **WebGPU n'est pas disponible** — la scène enregistre la demande WebGPU échouée et
   tombe en repli sur le chemin CPU/Canvas2D ; assurez-vous que `particleBackend: 'webgpu'`
   est défini et que votre navigateur supporte WebGPU.
3. **La taille du canvas est `0×0`** — appelez `scene.resize(w, h)` (ou assurez-vous que
   le canvas a des dimensions) avant la première image.

### Comment fonctionne le repli CPU ?

Quand WebGPU est indisponible (ou échoue), `Scene` appelle `entity.updateCPU(dt, mouseX, mouseY, width, height)` à chaque image rendue et dessine les particules via `fillCircle`.
Le repli reflète le modèle ressort/répulsion/explosion/vélocité/rebond, mais les chemins
numériques CPU/GPU et le débit ne sont pas garantis identiques. Choisissez les nombres de
particules à partir de mesures sur les appareils cibles.

### Puis-je lire les positions des particules depuis le GPU ?

Pas directement — l'état des particules vit dans un tampon de stockage WebGPU. Pour le
lire, vous devriez émettre un aller-retour `copyBufferToBuffer` + `mapAsync`, qui bloque
le pipeline GPU. Au lieu de cela, maintenez un `particleData` Float32Array côté CPU
synchronisé si vous avez besoin des positions sur le CPU. `setOrigins()`, `setPositions()`
et `setVelocities()` écrivent dans `particleData` et définissent `needsInit = true`, ce qui
télécharge vers le tampon de stockage GPU à l'image suivante.

> [!NOTE] > La lecture `mapAsync` + `copyBufferToBuffer` bloque intentionnellement le pipeline.
> Pour la détection de collisions ou les requêtes spatiales à grande échelle, exécutez-les
> sur le chemin CPU en utilisant `SpatialHashGrid`, ou exprimez-les comme des passes de
> calcul WebGPU supplémentaires.

---

## Dépannage

### `Scene` tourne mais rien n'apparaît à l'écran

Vérifiez dans l'ordre :

1. `scene.start()` est-il appelé ?
2. Le canvas a-t-il des attributs CSS et HTML `width` et `height` non nuls ?
3. L'entité est-elle ajoutée à la scène via `scene.add(entity)` (pas seulement construite) ?
4. La méthode `render()` de l'entité appelle-t-elle effectivement `renderer.fill()` ou
   `renderer.stroke()` ? Un `render()` vide ne dessine rien.
5. `entity.opacity` est-il > 0 ?

### Mon événement de molette n'atteint pas le `ScrollView`

Le `ScrollView` appelle `e.preventDefault()` sur les événements `wheel` pour empêcher le
défilement de la page. Si l'écouteur de molette du nœud d'ombre se déclenche mais que la
vue de défilement ne réagit pas, vérifiez que `ScrollView.add(child)` a été utilisé (pas
`entity.add(child)` qui contourne directement l'encapsuleur de contenu), et que le parent
du canvas n'a pas `overflow: hidden` bloquant les événements de pointeur.

### TypeScript signale `Cannot find name 'GPUDevice'`

Ajoutez `@webgpu/types` à votre projet :

```bash
bun add -d @webgpu/types
```

Puis ajoutez à `tsconfig.json` :

```json
{ "compilerOptions": { "types": ["@webgpu/types"] } }
```
