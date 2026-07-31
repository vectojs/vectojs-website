---
title: 'Cohérence entre environnements'
description: "Garder une UI canvas identique entre systèmes d'exploitation, navigateurs, niveaux de zoom et densités de pixels — et maintenir la sélection de texte alignée avec le rendu affiché."
order: 19
---

# Cohérence entre environnements

Une app DOM hérite de la cohérence (et de l'incohérence) du moteur de mise en page
du navigateur. Une app canvas-native en hérite de **vous** : le moteur calcule chaque
position à partir de nombres qu'il a mesurés lui-même, donc les modes de défaillance
se déplacent — loin des bizarreries CSS, vers la densité de pixels, le zoom et les
métriques de police. Cette page associe chaque variable d'environnement à ce qui
varie réellement, ce que le moteur gère déjà et ce que votre application doit faire.

## Ratio de pixels de l'appareil (HiDPI)

**Ce que le moteur gère.** Toutes les coordonnées VectoJS sont des pixels CSS
logiques. Le renderer dimensionne le backing store du canvas à `logical ×
devicePixelRatio` et met à l'échelle le contexte, et chaque `scene.resize()` relit
le DPR actuel — rendu, hit-testing et mise en page partagent un seul espace de
coordonnées logiques, à n'importe quelle densité, y compris les DPR fractionnaires
(mise à l'échelle Windows 125 % / 150 %).

**Ce que vous devez faire.** Rien à l'exécution — mais tout dans les tests :

> [!WARNING]
> Les navigateurs headless utilisent par défaut `deviceScaleFactor: 1`. La plupart
> des machines réelles ont un DPR de 2 (ou fractionnaire). Un décalage de
> hit-testing ou de projection de texte qui évolue avec le DPR est **invisible**
> lors d'un test headless par défaut et évident sur le premier vrai portable. Si un
> décalage signalé est proportionnel à la distance par rapport à l'origine,
> soupçonnez d'abord le DPR.

Exécutez les tests de pointeur et de sélection également à `deviceScaleFactor: 2`
(Puppeteer/Playwright l'exposent tous deux par contexte). Une cellule de matrice
attrape toute la classe de bug.

## Zoom du navigateur et dimensionnement du conteneur

Le zoom modifie le DPR effectif et la zone d'affichage CSS simultanément. Ce qui
se passe ensuite dépend de qui possède la taille du canvas :

- **Scènes plein écran** (par défaut) : la Scene écoute l'événement `resize` de la
  fenêtre — que le zoom déclenche — et recalibre automatiquement la taille, le
  backing store et le DPR.
- **Scènes intégrées** (`disableWindowResize: true`, conteneurs personnalisés, zoom
  CSS sur un ancêtre) : le moteur ne devine pas délibérément. Connectez vous-même
  le conteneur à la scène :

```typescript
const scene = new Scene(canvas, { disableWindowResize: true });

const ro = new ResizeObserver(([entry]) => {
  scene.resize(entry.contentRect.width, entry.contentRect.height);
});
ro.observe(container);
// Déconnectez dans votre chemin de nettoyage avec scene.destroy().
```

`scene.resize(width, height)` est idempotent et assez léger pour être appelé depuis
un ResizeObserver sans debounce pour les UIs typiques. C'est aussi le **point
d'ancrage de recalibrage** : Firefox calcule les métriques de sélection `Range`
natives à partir de l'état de mise en page que le zoom et les changements de
conteneur invalident — une scène jamais informée du changement fait un rendu
correct mais _sélectionne_ à des coordonnées obsolètes. Si les surbrillances de
sélection dérivent après un zoom dans Firefox et que le canvas semble correct, un
appel `resize()` manquant est le premier suspect.

## Polices : la vraie variable inter-OS

`'16px sans-serif'` est une police différente sur chaque OS (Segoe UI, Roboto,
San Francisco, DejaVu…). VectoJS mesure lui-même le texte avec `measureText` du
canvas, et le renderer dessine avec la même chaîne de police — donc la mise en page
et les pixels sont toujours en accord _entre eux_ sur n'importe quelle machine. Ce
qui varie entre les machines, c'est la **géométrie absolue** : largeurs de ligne,
points de césure, tailles d'entité.

Conséquences pratiques, par ordre décroissant de douleur :

1. **Course aux polices web.** Si vous construisez `Text`/`RichText`/`Markdown`
   avant qu'une police web ne se charge, la mesure utilise la police de secours
   tandis qu'un repaint ultérieur dessine la police chargée — la mise en page et les
   pixels ne sont plus en accord (l'unique façon de briser la cohérence interne).
   Conditionnez la construction :

   ```typescript
   await document.fonts.ready;
   const label = new Text('Hello', { font: '16px Inter' });
   ```

   Si le contenu peut survivre au chargement des polices (polices chargées
   paresseusement), réexécutez `setText` ou `setMaxWidth` depuis un gestionnaire
   `document.fonts.onloadingdone` pour remesurer.

2. **Attentes de test pixel-parfait.** N'assertez jamais une géométrie absolue
   dérivée du texte contre des nombres fixes sauf si CI installe la police exacte
   (le dépôt VectoJS installe Noto dans CI pour cette raison). Préférez des
   assertions relationnelles (« tient dedans », « sous la ligne précédente ») —
   c'est exactement ce que `auditScene` automatise.

3. **Familles génériques dans le design.** Dimensionner une carte pour `'14px
sans-serif'` sur macOS la rend incorrecte sous Windows. Soit embarquez la
   police, soit laissez la mesure piloter la taille (`Text` auto-dimensionnant +
   mise en page conteneur) plutôt que de coder en dur des boîtes autour de largeurs
   de texte supposées.

## Différences de navigateur qui comptent

La matrice de tests inter-navigateurs du moteur (Chrome + Firefox, DPR 1 et 2,
substitution de polices) verrouille ces points ; ceux sur lesquels une application
peut encore trébucher :

| Domaine                              | Différence                                                                                    | Que faire                                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Sélections natives `Range`           | Firefox recalcule les métriques `Range` à partir d'une mise en page obsolète après zoom/redim | Appelez `scene.resize()` quand vous gérez la taille (voir ci-dessus)                                              |
| Disponibilité de `Worker`            | Absent dans certains embarqués/testeurs → Markdown analyse synchrone                          | Fonctionnellement identique ; prévoyez du temps thread principal dans ces environnements                          |
| WebGPU                               | La disponibilité varie ; `ComputeParticleEntity` tombe sur CPU                                | Traitez le GPU comme une amélioration progressive ; testez aussi le chemin CPU                                    |
| Mouvement réduit                     | Le réglage OS plafonne le FPS effectif quand `respectReducedMotion` (défaut)                  | Ne luttez pas ; testez les animations avec le réglage activé                                                      |
| rAF dans les onglets en arrière-plan | Suspendu partout, mais le moment de reprise diffère                                           | Le moteur limite le dt d'animation à la reprise ; les intégrateurs personnalisés devraient limiter leur propre dt |

## Garder la sélection alignée avec les pixels

Le texte sélectionnable fonctionne en projetant la **chaîne source logique** dans
des miroirs DOM transparents dont la géométrie provient des mêmes données de mise
en page que le peintre canvas utilise. L'alignement est garanti par construction —
quand il se brise, un contrat d'une courte liste a été violé :

1. **La scène n'a pas été informée d'un changement de taille/zoom** — géométrie de
   projection obsolète (Firefox surtout ; voir le point d'ancrage de recalibrage
   ci-dessus).
2. **Polices chargées après la mesure** — le canvas et la projection suivent la
   mise en page mesurée, mais les glyphes dessinés ont bougé (course aux polices
   web ci-dessus).
3. **Un composant personnalisé dessine du texte sans le projeter** — pixels sans
   miroir sélectionnable, ou miroir positionné par des maths différentes de celles
   du chemin de peinture. Les entités de texte personnalisées devraient réutiliser
   la mise en page préparée du moteur (`prepareContentGrid` / `LayoutEngine.prepare`)
   pour la peinture et la projection, jamais deux mesures indépendantes.

**Vérifier l'alignement** (chiffres, pas de captures d'écran) :

```typescript
// 1. Une sélection programmatique copie-t-elle la source logique ?
//    (Les API de sélection reflètent ce qu'un glisser-déposer utilisateur produirait.)
const text = window.getSelection()?.toString();
expect(text).toBe(expectedSourceSlice);

// 2. Quelle entité a réellement reçu les événements de sélection du navigateur ?
import { createEventTrace } from '@vectojs/devtools/headless';
const trace = createEventTrace(scene, { capacity: 50 });
// … glisser-sélectionner …
// les entrées avec source === 'content' ont commencé sur une projection sélectionnable ;
// leur targetPath vous dit LAQUELLE, defaultPrevented si
// l'application a intercepté le comportement de sélection par défaut du navigateur.
```

Exécutez les tests de sélection par glisser dans la même matrice d'environnements
que le hit-testing : les deux navigateurs, les deux DPR, et au moins un niveau de
zoom non défaut.

## La liste de vérification de portabilité

Pour une UI qui doit être identique visuellement et fonctionnellement partout :

- [ ] Embarquez les polices avec lesquelles vous mesurez ; construisez le texte après `document.fonts.ready`.
- [ ] Scène plein écran **ou** un pont `ResizeObserver` → `scene.resize()` — jamais ni l'un ni l'autre manquant.
- [ ] Tests de pointeur + sélection à DPR 1 **et** 2, Chrome **et** Firefox.
- [ ] `auditScene(scene)` propre dans CI (correction de mise en page relationnelle, indépendante des polices).
- [ ] Différentiel d'instantanés d'interactions clés (`captureSnapshot`/`diffSnapshots`) plutôt que de comparer des captures d'écran pixel par pixel.
- [ ] Animations vérifiées avec le mouvement réduit de l'OS activé.
- [ ] Si les backends WebGL/WebGPU sont activés, le chemin de repli Canvas2D est également testé.

> **Suivant :** [Flux de débogage](/reference/devtools/#flux-de-travail-de-débogage)
> pour les outils numériques sur lesquels s'appuie cette liste, et
> [Streaming et texte en temps réel](/learn/streaming/) pour les UIs en temps réel.
