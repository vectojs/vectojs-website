+++
title = "ThreeAdapter"
description = "Rendre une Scene VectoJS sur un canvas, l'exposer en tant que THREE.CanvasTexture, et câbler les événements de pointeur (y compris les contrôleurs WebXR et le multi-touch) ainsi que le focus de panneau et le routage clavier via du raycasting UV."
weight = 42
+++

# `ThreeAdapter`

Partie de [`@vectojs/three`](/reference/three/).

`ThreeAdapter` utilise le `canvas` fourni, ou en crée un s'il est omis. Il rend une `Scene` VectoJS sur ce canvas, encapsule le résultat en `THREE.CanvasTexture`, et vous donne un `THREE.Mesh` prêt à l'emploi (une `PlaneGeometry` unitaire avec un `MeshBasicMaterial`). Les événements de pointeur et de défilement provenant de vos écouteurs d'événements Three.js sont retraduits en coordonnées logiques VectoJS via du raycasting.

Utilisez ceci lorsque vous avez une scène 3D et souhaitez un panneau UI 2D flottant sur une surface — le reste de votre scène Three.js n'est pas touché, et vous conservez le rendu Canvas 2D. Pour utiliser Three.js comme moteur de rendu de la `Scene` elle-même, voir plutôt [`ThreeRenderer`](/reference/three-renderer/).

## Constructeur

```ts
new ThreeAdapter(options: ThreeAdapterOptions)
```

```ts
interface ThreeAdapterOptions {
  width: number; // largeur logique de la scène UI 2D (px CSS)
  height: number; // hauteur logique (px CSS)
  canvas?: HTMLCanvasElement; // canvas préexistant optionnel ; l'adaptateur en crée un s'il est omis
  sceneOptions?: SceneOptions; // transmis au constructeur de VectoScene
}
```

`disableWindowResize` est forcé à `true` en interne, quoi que vous passiez dans `sceneOptions` — l'adaptateur gère le redimensionnement via `resize(w, h)`, pas la fenêtre.

## Propriétés publiques

| Propriété    | Type                  | Description                                                                                                                 |
| ------------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `texture`    | `THREE.CanvasTexture` | La texture encapsulant le canvas VectoJS. Définit `needsUpdate = true` automatiquement après chaque trame de rendu VectoJS. |
| `vectoScene` | `VectoScene`          | L'instance `Scene` VectoJS active. Ajoutez des entités à celle-ci.                                                          |
| `canvas`     | `HTMLCanvasElement`   | Le canvas appartenant à l'adaptateur ou fourni par l'appelant sur lequel VectoJS dessine.                                   |
| `mesh`       | `THREE.Mesh`          | Maillage pré-construit `PlaneGeometry(1, 1)` + `MeshBasicMaterial` prêt à être déposé dans votre scène Three.js.            |

## Méthodes

### `updateIntersection(raycaster, type, originalEvent?)`

```ts
updateIntersection(
  raycaster: THREE.Raycaster,
  type: 'pointerdown' | 'pointerup' | 'pointermove' | 'pointercancel' | 'wheel' | 'click',
  originalEvent?: PointerEvent | WheelEvent
): boolean
```

Lance le rayon contre le maillage de l'adaptateur, traduit le point d'impact UV en coordonnées du canvas VectoJS, et distribue l'événement dans la scène VectoJS. Renvoie `true` lorsque le rayon a intersecté le maillage.

L'état des boutons du pointeur et les touches `shiftKey`/`ctrlKey`/`altKey`/`metaKey` sont préservés ; les événements de molette préservent également tous les deltas et touches de modification.

Appelez cette méthode depuis votre boucle de rendu Three.js ou vos écouteurs d'événements de pointeur. L'adaptateur maintient un état de survol par `pointerId` afin que les contrôleurs WebXR et les entrées multi-touch aient chacun des contextes de survol/focus indépendants.

**Remappage UV** : les coordonnées UV de Three.js ont Y=0 en bas d'un plan ; VectoJS a Y=0 en haut. L'adaptateur inverse automatiquement l'axe Y — vous n'avez pas besoin d'ajuster les coordonnées.

### `resize(width, height)`

```ts
resize(width: number, height: number): void
```

Redimensionne le canvas et la `VectoScene` logique sous-jacente. À appeler lorsque la résolution de rendu du panneau ou la fenêtre de mise en page 2D change ; changer uniquement l'échelle du maillage dans l'espace monde ne nécessite pas cela.

## Focus de panneau et entrée clavier (0.1.10+)

Le canvas de l'adaptateur est hors écran, si bien que ses miroirs d'accessibilité projetés ne peuvent jamais devenir `document.activeElement` et que le modèle de focus du navigateur ne les atteint pas. L'adaptateur comble ce vide avec le **focus de panneau** — un état côté Three, piloté par l'interaction pointeur et `focus()`, consommé par le routage des touches, et dont chaque transition est pontée par des `FocusEvent` synthétiques afin que l'état côté core (émission de `focus`/`blur` d'entité, réveil du clignotement du curseur) corresponde à un canvas connecté.

```ts
adapter.focusedEntity: Entity | null // read-only — the entity holding panel focus
adapter.focus(entity: Entity | null): void // move focus, or blur with null
adapter.blur(): void // release panel focus
adapter.isFocusable(entity: Entity): boolean // projects as keyboard-reachable?
```

`isFocusable` est l'analogue côté panneau de la tabulabilité DOM : vrai lorsque le miroir projeté porte un attribut `tabindex` ou se rend comme une balise nativement focalisable (`button`/`input`/`textarea`/`select`/`a[href]`). Un pointerdown focus l'ancêtre focalisable le plus proche du hit — cliquer un `<span>` dans un bouton focus le bouton, et une chaîne de hit ne projetant rien d'atteignable provoque un blur.

### `dispatchKey(key, mods?, phase?)`

```ts
dispatchKey(
  key: string,
  mods?: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean; code?: string },
  phase?: 'press' | 'keydown' | 'keyup', // default 'press' — synthesizes keydown+keyup
): void
```

L'équivalent clavier de `updateIntersection` : synthétiser un événement clavier et le router par le même chemin de dispatch qu'utiliserait un canvas connecté. Règles de routage, dans l'ordre :

1. **Focus de panneau** — lorsqu'une entité détient le focus de panneau, l'événement est dispatché sur son miroir projeté, si bien que les propres écouteurs du core s'exécutent à l'identique : les gestionnaires `keydown`/`keyup` d'entité le reçoivent, et les contrôles projetés conservent leur contrat d'activation (`Enter` au press, `Space` au release).
2. **Propriété** — tant que l'entité focalisée est un _propriétaire clavier_, le panel possède les touches exclusivement et rien ne fuit vers la page. Les propriétaires sont des entités projetant une balise `input`/`textarea`/`select` ou un rôle du `KEYBOARD_OWNING_ROLES` du core : les rôles interactifs (`button`, `switch`, `checkbox`, `radio`, `link`, `tab`, `menuitem`, `slider`, `combobox`) plus les rôles clavier d'abord `textbox`, `searchbox`, `spinbutton`, `option` et `listbox`. Les flèches déplacent un slider au lieu d'orbiter votre caméra ; la frappe atteint une zone de texte au lieu de déclencher des raccourcis de page.
3. **Transfert de canal** — sinon l'événement continue vers `window`, où le canal clavier de niveau scène applique ses gates natives (`defaultPrevented`, auto-répétition des touches, `ownsKeyboard(document.activeElement)`), si bien que les raccourcis de scène et les consommateurs de niveau page le voient sauf si un propriétaire clavier de niveau page détient le focus. Un gestionnaire d'entité appelant `preventDefault()` sur l'événement synthétique supprime le transfert, à l'image du bouillonnement d'un canvas connecté.
4. **Pas de focus de panneau** — l'événement va directement à `window` et les mêmes gates décident.

`code` utilise par défaut une inférence au mieux (`'a'` → `'KeyA'`, `' '` → `'Space'`, chiffres → `'DigitN'`). Passez `mods.code` pour couvrir les dispositions que l'inférence ne sait pas nommer.

### `dispatchPointer(type, x, y, init?)`

```ts
dispatchPointer(
  type: 'pointerdown' | 'pointerup' | 'pointercancel' | 'pointermove' | 'click',
  x: number, // logical scene-space X (origin top-left)
  y: number, // logical scene-space Y
  init?: { pointerId?: number; button?: number; buttons?: number;
           ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean },
): boolean // whether the point hit an entity
```

Synthétise une entrée pointeur en **coordonnées logiques de scène** — l'espace que parlent la mise en page des entités et `findEntityAt`. L'événement emprunte le chemin aval identique à celui d'un `updateIntersection` piloté par raycasting : transitions de survol, dispatch d'entité, focus piloté par pointerdown et planification du marquage sale de la texture se comportent pareil, ce qui en fait le point d'entrée des tests et automatisations dépourvus de raycaster. L'entrée molette n'est délibérément pas couverte — les deltas de molette n'ont pas de valeurs neutres par défaut ; routez-les donc via `updateIntersection` avec le véritable `WheelEvent`.

### `dispose()`

```ts
dispose(): void
```

Libère de manière idempotente la `THREE.CanvasTexture`, la géométrie et le matériau du maillage, détache le maillage, restaure la méthode de rendu de la Scene, détruit la `VectoScene` et efface tout l'état par pointeur (le focus de panneau meurt avec la scène). Un canvas créé par l'adaptateur est réduit à `0×0` ; un canvas fourni par l'appelant conserve ses dimensions.

## Exemple complet

L'exemple suivant rend un panneau de paramètres VectoJS sur un plan rotatif dans une scène Three.js. Les événements de pointeur des écouteurs DOM `pointermove`, `pointerdown` et `pointerup` sont transmis à VectoJS via `updateIntersection`.

```ts
import * as THREE from 'three';
import { ThreeAdapter } from '@vectojs/three';
import { Text, Button, Stack } from '@vectojs/ui';

// --- Configuration de la scène Three.js ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const threeScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3);

// --- Adaptateur de panneau VectoJS (512×256 pixels logiques, affiché sur un plan 2×1) ---
const adapter = new ThreeAdapter({ width: 512, height: 256 });

const heading = new Text('Settings', {
  font: '600 24px Inter',
  color: '#f8fafc',
});
const applyBtn = new Button('Apply', { width: 120, height: 40 });
applyBtn.on('click', () => console.log('apply clicked'));

const stack = new Stack({ direction: 'vertical', gap: 20 });
stack.add(heading);
stack.add(applyBtn);
stack.setPosition(20, 20);
adapter.vectoScene.add(stack);

adapter.vectoScene.start();

// --- Placer le maillage dans la scène Three.js ---
const panel = adapter.mesh;
panel.scale.set(2, 1, 1); // taille dans l'espace monde correspond au ratio 2:1
threeScene.add(panel);

// --- Raycaster pour la traduction des événements ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function updatePointer(event: PointerEvent) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

window.addEventListener('pointermove', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'pointermove', e);
});

window.addEventListener('pointerdown', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'pointerdown', e);
});

window.addEventListener('pointerup', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'pointerup', e);
});

window.addEventListener('click', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'click', e);
});

window.addEventListener('wheel', (e) => {
  updatePointer(e as unknown as PointerEvent);
  raycaster.setFromCamera(pointer, camera);
  adapter.updateIntersection(raycaster, 'wheel', e);
});

// --- Boucle de rendu ---
function animate() {
  requestAnimationFrame(animate);
  panel.rotation.y += 0.005;
  renderer.render(threeScene, camera);
}

animate();

// --- Nettoyage ---
window.addEventListener('unload', () => adapter.dispose());
```

## Comment l'adaptateur fonctionne en interne

Le constructeur modifie `vectoScene.render` pour définir `texture.needsUpdate = true` après chaque trame VectoJS. Three.js télécharge ensuite le canvas vers le GPU lors du prochain appel `renderer.render()`. Aucune synchronisation manuelle ni pollinisation n'est nécessaire.

Les coordonnées UV du raycast sont projetées dans l'espace de coordonnées **logique** de la scène (`vectoScene.width`/`height` — les dimensions que vous avez passées au constructeur), pas dans la taille physique du backing store du canvas adaptateur. La distinction a son importance sur les écrans HiDPI : le `CanvasRenderer` de `@vectojs/core` met à l'échelle le backing store par `devicePixelRatio` pour un rendu net (`canvas.width = largeurLogique × dpr`), tandis que la disposition des entités et le hit-testing restent logiques.

> [!WARNING] > **Sur `@vectojs/three` ≤ 0.1.1, le mapping UV utilisait la taille physique du canvas** — donc sur tout affichage ou zoom de navigateur où `devicePixelRatio ≠ 1`, chaque événement de pointeur atterrissait en dessous/à droite du curseur d'exactement le facteur DPR. Le symptôme est caractéristique : les clics activent un contrôle _plus bas dans le panneau_ que celui sous le curseur, avec un décalage qui augmente plus la cible est profonde dans le panneau — tout en se comportant parfaitement sur les écrans DPR-1 et dans les environnements de test sans tête. Corrigé dans **0.1.2** ; mettez à jour plutôt que de contourner le problème.

Les événements de hit distribués par `updateIntersection` sont transmis à l'élément DOM d'accessibilité de l'entité lorsqu'il existe **et est connecté à un document actif** (ce qui les achemine via la couche d'ombre a11y et déclenche `click`/`change` sur les composants interactifs), ou directement comme objets `VectoJSEvent` autrement.

> [!NOTE]
> Avec le canvas créé par défaut par l'adaptateur, les panneaux empruntent le chemin direct `VectoJSEvent` car le canvas et sa racine a11y sont détachés. Si vous fournissez un canvas connecté à `document`, ses éléments a11y connectés peuvent utiliser le chemin de distribution DOM. Les versions 0.1.1 et plus récentes de `@vectojs/three` vérifient la connectivité au lieu de supposer l'un ou l'autre cas.
>
> **Ceci est important pour le bon fonctionnement de `Toggle`/`Button`, pas seulement pour éviter une erreur.** Dans la version 0.1.0 de `@vectojs/three`, un élément a11y déconnecté pouvait incorrectement emprunter la branche de distribution DOM et manquer silencieusement le rappel du composant. Les versions 0.1.1 et plus récentes acheminent les éléments déconnectés directement. Le comportement natif du DOM pour le focus, l'IME et le lecteur d'écran n'est pas disponible pour le canvas détaché par défaut, mais reste possible lorsqu'un canvas fourni par l'appelant et sa couche de projection sont connectés.

## WebXR et multi-touch

`updateIntersection` suit l'état de survol par `pointerId` extrait de `originalEvent`. Dans une session WebXR, chaque contrôleur a son propre `pointerId`, donc survoler avec un contrôleur n'interfère pas avec l'état de l'autre. Passez l'événement `XRInputSourceEvent` brut encapsulé dans un `PointerEvent` synthétique avec la `handedness` de `inputSource` encodée comme `pointerId` (0 pour la gauche, 1 pour la droite) pour maintenir un état de hit indépendant.

```ts
// Exemple WebXR — transmission minimale des événements de contrôleur
session.addEventListener('selectstart', (xrEvent) => {
  const synth = new PointerEvent('pointerdown', {
    pointerId: xrEvent.inputSource === leftController ? 0 : 1,
  });
  raycaster.setFromCamera(controllerUV, camera);
  adapter.updateIntersection(raycaster, 'pointerdown', synth);
});
```

## Voir aussi

[`ThreeRenderer`](/reference/three-renderer/) (le cas d'usage alternatif — Three.js comme moteur de rendu de la `Scene`) ·
[`Scene`](/reference/core-scene/) (`vectoScene`) ·
[`@vectojs/three` aperçu](/reference/three/)
