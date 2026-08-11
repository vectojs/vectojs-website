+++
title = "Entity"
description = "La classe de base abstraite de chaque nœud du Virtual Math Tree : transformations, système d'animation, événements capture/bulle, et les hooks a11y/lot qu'une Entity personnalisée peut redéfinir."
weight = 3

[extra]
order = 3
+++

# `Entity` (abstraite)

Partie de [`@vectojs/core`](/reference/core-api/).

Classe de base pour chaque nœud du Virtual Math Tree. Sous-classez et implémentez
`isPointInside` et `render`.

```ts
abstract class Entity {
  abstract isPointInside(globalX: number, globalY: number): boolean; // DOIT implémenter
  abstract render(renderer: IRenderer): void; // DOIT implémenter
}
```

## Propriétés publiques

| Propriété                    | Type             | Défaut          | Notes                                                                                                                                                                                                                 |
| ---------------------------- | ---------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                         | `string`         | `entity_<rand>` | Utilisé comme id du nœud d'ombre / `data-vecto-id`.                                                                                                                                                                   |
| `children`                   | `Entity[]`       | `[]`            |                                                                                                                                                                                                                       |
| `parent`                     | `Entity \| null` | `null`          |                                                                                                                                                                                                                       |
| `scene`                      | getter           | —               | Parcourt la chaîne des parents jusqu'à la `Scene` propriétaire (ou `null`).                                                                                                                                           |
| `x`, `y`                     | `number`         | `0`             | Position locale.                                                                                                                                                                                                      |
| `scaleX`, `scaleY`           | `number`         | `1`             | Échelle locale.                                                                                                                                                                                                       |
| `rotation`                   | `number`         | `0`             | Rotation locale, en radians.                                                                                                                                                                                          |
| `opacity`                    | `number`         | `1`             | Multipliée par chaque opacité d'ancêtre, puis appliquée à la sortie normale, par lot, WebGPU et portail DOM.                                                                                                          |
| `interactive`                | `boolean`        | `false`         | Effet de bord du setter : signale `a11yNeedsReorder` + `markDirty()`. Verrouille la projection a11y (avec `width`).                                                                                                   |
| `width`, `height`            | `number`         | `0`             | Taille de la boîte hit / boîte d'ombre a11y (× échelle).                                                                                                                                                              |
| `clipChildren`               | `boolean`        | `false`         | Limite les dessins enfants normaux à `[0,0]–[width,height]` ; Canvas/SVG sont exacts. Three utilise un ciseau monde-AABB pour les clips pivotés/cisaillés. Les chemins WebGL point/WebGPU overlay ne sont pas clipés. |
| `a11yOffsetX`, `a11yOffsetY` | `number`         | `0`             | Décale le nœud d'ombre par rapport à la position globale de l'entité.                                                                                                                                                 |
| `a11yFullViewport`           | `boolean`        | `false`         | Projette un nœud d'ombre remplissant le viewport même avec `width === 0` ; monté **derrière** tous les autres pour que les composants au-dessus restent cliquables.                                                   |
| `isDOMPortal`                | `boolean`        | `false`         | Marque `DOMPortalEntity` ; les portails sont ignorés par la synchronisation a11y.                                                                                                                                     |

> **La projection A11y nécessite une boîte.** Un nœud d'ombre n'est créé que quand
> `interactive && (width > 0 || a11yFullViewport)`. Une entité interactive avec
> `width: 0` et sans `a11yFullViewport` n'obtient **aucun** nœud d'ombre — définissez
> `width`/`height`.

## Méthodes d'arbre et de transformation

```ts
add(...children: Entity[]): this             // attache un ou plusieurs enfants dans l'ordre ; signale aussi a11yNeedsReorder + markDirty
remove(child: Entity): this
set(props: Partial<this>): this              // assigne plusieurs propriétés propres via leurs setters normaux ; retourne this
setPosition(x: number, y: number): this
getGlobalPosition(): Point                   // position monde ; accumule translate→scale→rotate jusqu'à (excluant) la racine
getWorldTransform(): AffineTransform         // matrice T·S·R exacte accumulée Canvas { a,b,c,d,e,f }
localToWorld(localX: number, localY: number): Point
worldToLocal(worldX: number, worldY: number): Point | null // null pour une transformation singulière
getWorldBounds(): Bounds                    // getBounds() local (ou width/height) transformé en AABB monde
getWorldScale(): { x: number; y: number }    // produit de l'échelle propre + ancêtres (excl. racine)
getWorldRotation(): number                   // somme de la rotation propre + ancêtres (excl. racine), radians
getBounds(): Bounds | null                   // AABB local pour l'écrêtage ; null (défaut) = jamais écrêté
destroy(): void                              // efface animations + écouteurs, détache du parent
```

`getWorldScale()` et `getWorldRotation()` sont des cumuls de commodité. Sous
rotation imbriquée plus échelle non uniforme, la matrice composée peut contenir du
cisaillement ; utilisez `getWorldTransform()`, `localToWorld()`, `worldToLocal()` ou
`getWorldBounds()` quand la géométrie exacte importe.

Depuis la 1.9.0, `add()` est **variadique** — `parent.add(a, b, c)` attache chaque
enfant dans l'ordre des arguments (le chemin mono-enfant reste O(1)). `set(props)` est
un outil ergonomique de construction qui assigne plusieurs propriétés propres en un
seul appel, chacune via son setter normal (donc une propriété avec un
`setTransition` configuré s'anime toujours, et `interactive` signale toujours le
réordonnancement a11y) : `rect.set({ x: 40, y: 40, width: 120, fill: '#38bdf8' })`.
C'est un simple `for…in` sur l'objet donné et ne touche aucun chemin par image. Les
deux s'associent naturellement avec les primitives
[`Rect`/`Circle`/`Group`](/reference/core-entities/).

## Animation

```ts
// Tween legacy (préservé)
animate(targetProps: Partial<this>, durationMs: number): this
hasPendingAnimations(): boolean

// Système d'animation (0.2.0)
setTransition(config: Partial<Record<AnimatableProp, MotionConfig>>): this
animateTo(props: Partial<Record<AnimatableProp, number>>, cfg: TweenConfig): Promise<void>
springTo(props: Partial<Record<AnimatableProp, number>>, cfg?: SpringConfig): Promise<void>
```

`animate()` met en file d'attente un tween ; les appels multiples s'enchaînent
**séquentiellement**. Seules les propriétés numériques sont interpolées ; l'assouplissement
est un ease-out fixe (`p * (2 - p)`). Un `animate()` actif maintient la scène non
statique (échappe à la régulation d'inactivité, voir
[`Scene`](/reference/core-scene/#rendermode-maxfps-et-la-régulation-automatique-dinactivité))
et gèle la synchronisation a11y jusqu'à son terme.

`hasPendingAnimations()` est **remplaçable** et est la seule fenêtre de la Scène sur
le mouvement personnalisé : si une sous-classe intègre son propre mouvement dans
`update()` (un ressort fait main ou une vélocité), redéfinissez-la pour retourner
`true` tant que ce mouvement est en vol — `markDirty()` depuis `update()` est effacé
à nouveau à la fin de la même image, donc sans cette redéfinition la régulation
d'inactivité réduit l'animation à 2 ips et le mode `onDemand` la fige.

**Système d'animation 0.2.0** — ressort d'abord, unifiant tweens et ressorts :

- `setTransition` déclare comment les six propriétés animables (`x`, `y`, `scaleX`,
  `scaleY`, `rotation`, `opacity`) s'animent ; ensuite une assignation simple
  (`entity.x = 400`) les anime, en reciblant en vol pour un mouvement continu.
  Ces propriétés sont des accesseurs avec un chemin rapide sans surcoût quand aucune
  transition n'est configurée — une assignation nue reste une écriture de champ simple.
- `animateTo` / `springTo` pilotent les propriétés impérativement et se résolvent quand
  le mouvement se stabilise ; contrairement à `animate()`, ils s'exécutent en
  concurrence et se composent avec `await`.
- `MotionConfig = 'spring' | SpringConfig | TweenConfig` (la présence de `duration`
  sélectionne un tween). `TweenConfig.easing` prend un `EasingName` de l'export
  `Easing` ou un `(t) => number` personnalisé.
- Honore `prefers-reduced-motion` (les mouvements sautent, les opacités fondent).
  Lié : `onMounted()` se déclenche quand une entité s'attache à une scène active —
  l'assistant de présence UI l'utilise pour jouer les animations d'entrée.

Voir [Physique et animation](/learn/physics-engine/) pour l'utilisation.

## Événements (`VectoEvent` / capture + bulle)

```ts
type VectoEvent =
  | 'click' | 'hover' | 'pointerdown' | 'pointerup' | 'pointercancel' | 'pointermove' | 'pointerleave'
  | 'change' | 'focus' | 'blur' | 'wheel' | 'keydown' | 'keyup';

on(event: VectoEvent, cb: (e: any) => void, options?: { capture?: boolean }): this
off(event: VectoEvent, cb: (e: any) => void, options?: { capture?: boolean }): this
emit(event: VectoEvent, payload: any): void          // auto-seulement, écouteurs en phase bulle (legacy/interne aux composants)
dispatchEvent(event: VectoJSEvent): void             // capture de style DOM (racine→cible) puis bulle (cible→racine)
```

- `on`/`off` par défaut en phase **bulle** ; passez `{ capture: true }` pour la
  phase capture. Les écouteurs de bulle se déclenchent aussi pour le chemin `emit()`
  legacy.
- `VectoJSEvent<N>` enveloppe un `nativeEvent` et ajoute `target`, `currentTarget`,
  `bubbles`, `stopPropagation()`, `stopImmediatePropagation()`,
  `preventDefault()`, `clientX/Y` du viewport, `sceneX/Y` logiques, `localX/Y` de la
  cible courante, touches de modification et pass-through (`deltaX/Y`, `key`,
  `defaultPrevented`). Les coordonnées locales inversent la transformation affine
  imbriquée complète. Un événement non bouillonnant exécute toujours la phase capture
  mais ne déclenche que sa cible dans la phase bulle.
- `'change'` d'un `<input>` d'ombre de contrôle de formulaire transporte
  `{ value, checked, selectionStart, selectionEnd, composition }` où
  `composition` est `{ start, length } | null` pour la pré-édition IME active.
  `'wheel'` transporte le `WheelEvent` natif (appelez `preventDefault()` pour arrêter
  le défilement de page).

Voir [Événements et hit-testing](/learn/events/) pour l'utilisation.

## Hooks A11y / lot (redéfinir pour adhérer)

```ts
getA11yAttributes(): A11yAttributes          // défaut {} → un <div> transparent simple
getBatchCircle(): BatchCircle | null         // { radius, color } → voie rapide fillCircle du renderer (feuilles à échelle uniforme)
getBatchRect(): BatchRect | null             // { width, height, color } → GPU indexed-quad batch (pointBackend WebGL uniquement)
update(dt: number, time: number): void       // redéfinition facultative ; dt en MILLISECONDES, time est performance.now(); le défaut avance les tweens en file d'attente
```

`getBatchCircle`/`getBatchRect` sont lus **à chaque image** (couleur/rayon animés
honorés). Une feuille de lot représentable saute son propre
`save/translate/scale/rotate/render/restore` ; le mode Canvas ou une transformation
affine accumulée non supportée utilise la `render()` normale de l'entité comme
solution de repli.

Voir [a11yRoot et le contrat agent](/reference/core-a11y/) pour la structure complète
de `A11yAttributes` et le fonctionnement de la synchronisation d'ombre DOM.

## Associé

[`Scene`](/reference/core-scene/) (possède l'arbre) ·
[Renderers](/reference/core-renderer/) (`Entity.getContentProjection()`) ·
[a11yRoot et le contrat agent](/reference/core-a11y/) ·
[`@vectojs/core` overview](/reference/core-api/)
