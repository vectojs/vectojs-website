---
title: 'Fondations mathématiques'
description: "Les principes mathématiques et physiques qui sous-tendent le moteur de rendu VectoJS : Virtual Math Trees, projection d'accessibilité sémantique, groupes de Lie, mises en page scindées, hit-testing de splines, retour à la ligne par différence d'ensembles, animation par EDO et élimination spatiale."
order: 6
---

# Fondations mathématiques

VectoJS traite le rendu de l'UI non pas comme une série de résolutions de cascade de style CSS, mais comme un pur **problème de calcul géométrique et algébrique**. En convertissant la mise en page, l'élimination (culling), le hit-testing, le retour à la ligne du texte et l'animation en systèmes mathématiques formels, le moteur contourne entièrement les pipelines DOM et de recalcul de mise en page du navigateur.

Ce document détaille les huit piliers mathématiques et d'ingénierie qui servent de fondation au runtime VectoJS.

---

## 1. Le Virtual Math Tree (VMT)

Au lieu de maintenir un arbre lourd de nœuds DOM de navigateur, VectoJS opère sur le **Virtual Math Tree (VMT)**. Le VMT est un pur **graphe de scène algébrique et de coordonnées** en mémoire plutôt qu'une représentation d'éléments de balisage.

### Représentation algébrique en mémoire pure

Dans une UI traditionnelle, les mises en page sont résolues par le moteur de reflow d'un navigateur, qui calcule des modèles de boîtes en cascade et met à jour les couches de rendu CSS. Dans le VMT, chaque élément visuel (une _Entity_) est représenté comme un système de coordonnées localisé, mappé à son parent via des relations algébriques affines :

$$\mathbf{M}\_{\text{world, child}} = \mathbf{M}\_{\text{world, parent}} \cdot \mathbf{M}\_{\text{local}}$$

L'arbre visuel ne nécessite pas un nœud HTML stylisé par élément dessinable. Le parcours de rendu compose des transformations numériques en JavaScript ; la synchronisation d'accessibilité et les portails DOM sont des phases distinctes tournées vers le navigateur dont le coût doit toujours être mesuré.

### Chemins critiques attentifs à l'allocation

Pour soutenir un débit de rendu élevé, le parcours de rendu du VMT évite d'allouer par nœud pendant le parcours.

- **Transformations scalaires enfilées** : Plutôt que d'allouer un objet matrice par nœud, le parcours de rendu enfile six paramètres de transformation scalaires directement à travers la récursion, évitant une allocation sur le tas par nœud par trame.
- **Tableaux scalaires plats pour le texte** : `LayoutResultBuffer` empaquette les coordonnées de mise en page dans des TypedArrays contigus pré-alloués qui peuvent être réutilisés d'une trame à l'autre, réduisant la pression d'allocation de nœuds de mise en page. Cela ne rend pas la Scene entière ou l'appelant sans allocation.

Notez ce que cela ne signifie _pas_ : les passes de parcours de rendu, de hit-testing et de synchronisation d'accessibilité sont toujours en $O(N)$ lorsqu'elles s'exécutent. `renderMode: 'onDemand'` saute le dessin et le parcours d'entités pour une trame statique, bien que la Scene continue d'interroger rAF et de vérifier l'état « sale »/d'animation.

---

## 2. Shadow DOM sémantique (a11yRoot)

Les moteurs d'UI basés sur canvas ont historiquement souffert de la déficience de la « boîte noire » : ils sont complètement invisibles pour les lecteurs d'écran, ne peuvent pas être audités par des moteurs d'accessibilité automatisés et cassent les fonctionnalités natives du navigateur comme le copier-coller ou la composition par l'éditeur de méthode d'entrée (IME CJK).

VectoJS résout cela via le **Shadow DOM sémantique** (ou `a11yRoot`).

### Projection d'accessibilité active

Alors que VectoJS rend tous les graphismes directement à l'intérieur d'un unique élément `<canvas>`, il maintient un **Shadow DOM sémantique** invisible et de haute fidélité, superposé en position absolue directement au-dessus de l'espace de coordonnées du canvas.

```text
┌────────────────────────────────────────────────────────┐
│  Semantic Shadow DOM (a11yRoot: <button>, <input>...)  │  <-- Interactive/A11y Layer
├────────────────────────────────────────────────────────┤
│  WebGL / Canvas 2D Graphics Canvas Layer               │  <-- High-Performance Graphics
└────────────────────────────────────────────────────────┘
```

Pour chaque entité interactive du Virtual Math Tree, le moteur projette un élément HTML sémantique correspondant (par exemple, `<button>` pour les boutons, `<input>` pour les champs de saisie, `<a>` pour les liens) vers la racine fantôme. Ces nœuds DOM sont entièrement transparents mais correspondent aux limites physiques, à l'ordre d'imbrication et à l'état interactif des éléments Canvas correspondants.

### Intégrité des tests et des lecteurs d'écran

Parce que le shadow DOM est composé de balises HTML standard et natives :

- **Lecteurs d'écran** : Les outils d'accessibilité interagissent avec les balises sémantiques natives, énonçant les descriptions et lisant les états.
- **Tests automatisés** : Des frameworks comme Playwright ou des agents IA peuvent localiser et interroger les composants d'UI basés sur Canvas à l'aide de mécanismes de requête standard comme `page.getByRole('button', { name: 'Submit' })`.
- **Composition IME** : Les méthodes de saisie CJK fonctionnent nativement car elles interagissent avec une vraie balise `<input>` à l'intérieur de la couche fantôme, qui diffuse ensuite les chaînes composées vers le moteur de rendu de VectoJS en temps réel.

---

## 3. Transformations affines

VectoJS abandonne complètement les propriétés de mise en page CSS comme le positionnement `absolute`, `relative` ou `flex`. À la place, la relation spatiale de chaque nœud du Virtual Math Tree est compressée en une **matrice de transformation affine** homogène $3 \times 3$ dans le plan euclidien.

### La matrice de transformation

La translation $(t_x, t_y)$, l'échelle $(s_x, s_y)$ et la rotation $\theta$ (en radians) d'une entité sont combinées en une seule matrice $M \in \text{Aff}(2)$ :

VectoJS applique les transformations locales comme $T \cdot S \cdot R$ :

$$M = \begin{bmatrix} s_x \cos\theta & -s_x \sin\theta & t_x \\\\ s_y \sin\theta & s_y \cos\theta & t_y \\\\ 0 & 0 & 1 \end{bmatrix}$$

La translation plus la rotation seule constituent le groupe de mouvement rigide $SE(2)$ ; l'ajout de l'échelle (et du cisaillement produit par une échelle non uniforme imbriquée plus une rotation) nécessite le groupe affine plus général.

### Transformations en cascade (multiplication de matrices)

Lors du parcours de l'arbre de nœuds, les enfants héritent de l'espace de coordonnées de leur parent. Parce que la multiplication de matrices est associative, la matrice de transformation globale $M_{\text{global}}$ pour toute entité imbriquée est calculée en multipliant la matrice globale accumulée du parent par la matrice locale :

$$M_{\text{global}} = M_{\text{parent}} \times M_{\text{local}}$$

Ceci est exécuté pendant la passe de rendu par parcours en profondeur d'abord en pré-ordre (DFS). VectoJS le fait directement sur des variables flottantes scalaires (évitant les allocations sur le tas) pour optimiser le débit de calcul :

```typescript
// Scalar multiplication of 3x3 transformation matrix
const globalX = parent.m00 * local.x + parent.m01 * local.y + parent.m02;
const globalY = parent.m10 * local.x + parent.m11 * local.y + parent.m12;
```

### Transformations inverses en forme close (règle de Cramer)

Pour re-mapper les coordonnées en sens inverse (par exemple, traduire les clics de souris en espace écran ou les coordonnées de raycast 3D vers l'espace de coordonnées d'une entité locale), VectoJS calcule la matrice inverse $M_{\text{global}}^{-1}$.

VectoJS utilise l'inverse en forme close de la matrice affine à six scalaires plutôt qu'un solveur de matrice général :

$$M^{-1} = \frac{1}{\det(M)} \begin{bmatrix} m_{11}m_{22} - m_{12}m_{21} & m_{02}m_{21} - m_{01}m_{22} & m_{01}m_{12} - m_{02}m_{11} \\\\ m_{12}m_{20} - m_{10}m_{22} & m_{00}m_{22} - m_{02}m_{20} & m_{02}m_{10} - m_{00}m_{12} \\\\ m_{10}m_{21} - m_{11}m_{20} & m_{01}m_{20} - m_{00}m_{21} & m_{00}m_{11} - m_{01}m_{10} \end{bmatrix}$$

Puisque la troisième ligne de notre matrice homogène est toujours $\begin{bmatrix} 0 & 0 & 1 \end{bmatrix}$, le déterminant se réduit à :

$$\det(M) = m_{00} \cdot m_{11} - m_{01} \cdot m_{10}$$

Si $\det(M) \neq 0$, `worldToLocal()` résout les coordonnées inverses en temps arithmétique constant et renvoie un point `{ x, y }`. Les transformations singulières renvoient `null`.

---

## 4. Moteur de mise en page à séparation froide/chaude

Le rendu de texte sur le web est notoirement lent. Dans les navigateurs traditionnels, modifier ne serait-ce qu'un seul caractère peut déclencher un reflow massif (recalcul des largeurs, segmentation des mots et interrogation des caches de police au niveau OS) à travers tout le document. VectoJS résout cela via le **moteur de mise en page à séparation froide/chaude**.

### Chemin froid : segmentation et mesure

Les aspects coûteux du traitement du texte — la tokenisation (à l'aide d'`Intl.Segmenter` pour les limites de mots), le tri BiDi (texte bidirectionnel) et la mesure des limites de glyphes à l'aide des contextes canvas — sont isolés dans la **passe froide**.

- S'exécute **uniquement** lorsque le contenu textuel réel change.
- Mesure et construit une carte de mise en page plate et mise en cache.
- Les résultats sont stockés dans une représentation `PreparedText` localisée et immuable.

### Passe chaude : retour à la ligne et alignement purement mathématiques

Lorsqu'un bloc de texte est redimensionné (par exemple, en faisant glisser la fenêtre ou en animant une carte de mise en page réactive), VectoJS déclenche la **passe chaude** :

- Évite toutes les requêtes `Intl.Segmenter` ou aux API de mesure canvas.
- Lit les largeurs de glyphes mises en cache directement depuis la carte `PreparedText`.
- Calcule les sauts de ligne, les décalages de retour à la ligne verticaux et les marges de paragraphe avec des opérations numériques sur les avancées mises en cache.

Séparer la préparation froide du positionnement chaud permet aux changements de largeur de réutiliser la segmentation et la mesure. La mémoïsation des paragraphes réutilise aussi les paragraphes de début inchangés pendant les opérations d'ajout. Le paragraphe modifié évolue tout de même avec sa propre longueur, et l'analyse lexicale Markdown reste à l'échelle du document.

---

## 5. Algèbre de différence d'ensembles pour les flux de texte

Les navigateurs web traditionnels enroulent le texte autour des obstacles (comme les images flottantes ou les encarts en ligne) à l'aide de calculs de mise en page CSS complexes. VectoJS modélise le flux de texte mathématiquement comme une **théorie des ensembles par soustraction d'intervalles** sur la droite des nombres réels.

### Division de l'intervalle de ligne

Pour une ligne donnée à la coordonnée verticale $Y$ et de hauteur $H$, la largeur totale de retour à la ligne est représentée comme un unique intervalle fermé $I_0 = [0, \text{maxWidth}]$.

Si $K$ formes d'obstacles (`ExclusionRect`) chevauchent la plage Y $[Y, Y+H]$, chaque obstacle représente un intervalle de soustraction $E_k = [x_{s,k}, x_{e,k}]$ :

<img src="/images/set-difference-intervals.svg" alt="Diagramme montrant trois barres d'intervalles horizontales : l'intervalle de ligne total s'étendant de 0 à maxWidth, un intervalle d'obstacle xs1 à xe1 au milieu, et la différence d'ensembles résultante sous forme de deux segments séparés évitant l'obstacle" class="diagram" />

Les segments disponibles $I_{\text{allowed}}$ pour placer les glyphes de texte sont résolus en calculant la différence d'ensembles :

$$I_{\text{allowed}} = I_0 \setminus \bigcup_{k=1}^{K} E_k$$

### Exécution de l'algorithme

Le moteur exécute cette arithmétique de différence d'ensembles :

1. Rassemble tous les intervalles d'exclusion chevauchant la plage Y.
2. Fusionne les intervalles d'exclusion qui se chevauchent en une liste triée d'intervalles disjoints.
3. Soustrait ces intervalles de $[0, \text{maxWidth}]$ pour produire une liste de sous-intervalles valides.
4. Enroule séquentiellement les tokens de texte dans ces sous-intervalles.

Cela permet de résoudre le retour à la ligne typographique complexe comme une passe déterministe et plate de soustraction d'intervalles plutôt que comme un rendu récursif par essai-erreur.

---

## 6. Hit-testing de splines échantillonnées

Les frameworks canvas traditionnels testent le survol des courbes en les dessinant de manière invisible et en lisant les pixels de couleur, ou en vérifiant si les clics se trouvent à l'intérieur de la boîte englobante rectangulaire (AABB) qui entoure la courbe. Le premier est lent, et le second est hautement inexact.

`SplineEntity` représente chaque segment cubique comme une courbe de Bézier $P(t)$ pour $t \in [0, 1]$ :

$$P(t) = (1-t)^3 P_0 + 3(1-t)^2 t P_1 + 3(1-t) t^2 P_2 + t^3 P_3$$

Où $P_0, P_1, P_2, P_3 \in \mathbb{R}^2$ sont les points de contrôle.

### Approximation par polyligne

L'implémentation actuelle échantillonne chaque segment de Bézier en une polyligne `Float32Array` à résolution fixe et la met en cache. Pour un pointeur $C(x, y)$, elle calcule la distance au carré à chaque segment de ligne adjacent et accepte le survol lorsque :

$$d^2(C, \overline{P_iP_{i+1}}) \le \left(\frac{\text{lineWidth}}{2} + \text{hitTolerance}\right)^2$$

L'approximation mise en cache rend les survols répétés peu coûteux et déterministes. Ce n'est pas un solveur quintique/Newton analytique : les segments à très haute courbure peuvent dévier entre les échantillons, alors choisissez `hitTolerance` en gardant cette approximation à l'esprit. `hitTest: 'aabb'` saute entièrement le raffinement.

---

## 7. Équations différentielles & solveurs d'Euler semi-implicites

Les animations CSS opèrent sur des échelles de temps fixes ($t \in [0, 1]$). Si la position cible change en plein vol (par exemple, en suivant un curseur), la courbe de Bézier doit être recalculée, entraînant des sauts visuels ou une perte d'inertie.

VectoJS résout cela à l'aide d'**équations différentielles ordinaires (EDO)** simulant un système physique masse-ressort-amortisseur.

### L'équation directrice

Le mouvement d'une valeur animée $x(t)$ (position, échelle ou opacité) vers sa valeur cible $x_{\text{target}}$ est régi par la loi de Hooke avec amortissement :

$$m \frac{d^2x}{dt^2} + c \frac{dx}{dt} + k(x - x_{\text{target}}) = 0$$

Où :

- $m$ est la masse (inertie).
- $c$ est le coefficient d'amortissement (friction).
- $k$ est la raideur du ressort (force d'attraction).

### Intégration numérique (Euler semi-implicite)

Pour résoudre cette équation pas à pas à l'exécution, VectoJS utilise un solveur d'**intégration d'Euler semi-implicite**. Contrairement à l'Euler explicite (qui est instable et accumule des erreurs d'énergie), le solveur semi-implicite calcule la vélocité à l'aide de l'état actuel puis calcule la position à l'aide de la vélocité _suivante_ :

$$v_{t+\Delta t} = v_t + \frac{-k(x_t - x_{\text{target}}) - c v_t}{m} \Delta t$$

$$x_{t+\Delta t} = x_t + v_{t+\Delta t} \Delta t$$

Où $\Delta t$ est le pas de temps de la trame (en secondes).

Parce que le solveur calcule les forces dynamiquement en fonction de la valeur actuelle $x_t$ et de la vélocité $v_t$ par rapport à $x_{\text{target}}$, la cible peut se déplacer dynamiquement (par exemple, glisser, survol de souris ou reflow réactif). Le système s'adapte naturellement, conservant l'inertie et amenant les éléments à un état de repos en douceur avec un amortissement organique.

---

## 8. Utilitaire SpatialHashGrid

Dans une scène contenant $N$ entités, le hit-testing intégré et le parcours d'élimination du viewport sont en $O(N)$. Que cela soit important dépend du travail des entités et du matériel cible.

VectoJS exporte un **SpatialHashGrid** que les applications peuvent explicitement remplir pour borner le coût des requêtes AABB locales. Les `findEntityAt()` et l'élimination du viewport intégrés de la Scene ne l'utilisent pas automatiquement ; les deux parcourent tout de même l'arbre d'entités.

<figure>
  <iframe src="/sandbox/diagram-spatial-hash.html" class="diagram-frame" loading="lazy" title="A spatial hash grid where a moving cursor only tests its own cell and eight neighbours, rendered live by VectoJS" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>Une application de grille spatiale peut n'interroger que les cellules chevauchant une région locale de pointeur/AABB. <em>(Concept rendu en direct par VectoJS.)</em></figcaption>
</figure>

### La fonction de hachage

L'espace de coordonnées est divisé en une grille de cellules de taille $S$. La boîte englobante de toute entité se mappe à un ensemble de coordonnées de cellule entières $(i, j) \in \mathbb{Z}^2$ :

$$i = \left\lfloor \frac{x}{S} \right\rfloor, \quad j = \left\lfloor \frac{y}{S} \right\rfloor$$

Ces coordonnées de grille sont mappées à une seule clé de compartiment 1D à l'aide d'une [fonction de couplage de Cantor](https://en.wikipedia.org/wiki/Pairing_function), avec les coordonnées négatives repliées d'abord dans le domaine non négatif :

$$x = \begin{cases} 2i & i \geq 0 \\\\ -2i - 1 & i < 0 \end{cases} \qquad y = \begin{cases} 2j & j \geq 0 \\\\ -2j - 1 & j < 0 \end{cases}$$

$$H(i, j) = \frac{(x + y)(x + y + 1)}{2} + y$$

Les compartiments vivent dans un simple `Map`, pas dans une table à capacité fixe — il n'y a pas de modulo, et la map croît avec le nombre de cellules occupées distinctes qui existent.

### Réduction de la complexité

- **Indexation gérée par l'application** : Appelez `insert(id, x, y, w, h)` à mesure que les entités se déplacent, ou `clear()` et reconstruisez pour une trame dynamique.
- **Requête AABB** : `query(x, y, w, h)` visite chaque cellule de grille chevauchée par cette boîte et renvoie un `Set<string>` dédupliqué.
- _Résultat_ : Le temps de requête est proportionnel aux cellules chevauchées plus les ID renvoyés. Il n'est quasi constant que pour de petites entités de taille similaire et uniformément distribuées ; les compartiments denses dégénèrent vers des balayages linéaires. Voir le [guide de performance](/learn/performance/#3-interaction-dune-mer-dentités-catastrophe-de-complexité-on2).

---

## Récapitulatif des avantages mathématiques

| Dimension                 | Navigateur / DOM                    | VectoJS                                 | Principe mathématique               |
| ------------------------- | ----------------------------------- | --------------------------------------- | ----------------------------------- |
| **Graphe de scène**       | Arbre DOM HTML                      | Virtual Math Tree (VMT)                 | Graphe de scène en mémoire contiguë |
| **Accessibilité**         | DOM sémantique natif                | Superposition de projection sémantique  | Synchronisation de l'état du DOM    |
| **Transformations**       | transform/layout CSS                | Matrices homogènes 3x3                  | Algèbre linéaire affine             |
| **Reflow**                | Reflow mono-thread                  | Mise en page à séparation froide/chaude | Segmentation de mots mise en cache  |
| **Retour à la ligne**     | Reflow par essai-erreur             | Soustraction d'intervalles de segments  | Algèbre de différence d'ensembles   |
| **Sélection de courbe**   | Lecture de pixels / large AABB      | Polyligne échantillonnée mise en cache  | Distance point-à-segment            |
| **Animation**             | Chronologies de Bézier cubiques     | Solveur masse-ressort-amortisseur       | Intégration d'EDO du second ordre   |
| **Élimination (culling)** | Heuristiques de rendu du navigateur | Limites AABB locales optionnelles       | Chevauchement d'AABB transformées   |

> **Suivant :** [Prise en main](/learn/getting-started/) — installez les paquets et écrivez votre première scène.
