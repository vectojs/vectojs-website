+++
title = "Utilitaires mathématiques"
description = "SpatialHashGrid pour des requêtes spatiales de phase large en O(1) moyen et SpringPhysics pour un ressort à valeur unique critique réglable — le paquet autonome @vectojs/math, re-exporté par @vectojs/core."
weight = 9
+++

# Utilitaires mathématiques — `@vectojs/math`

`SpatialHashGrid` et `SpringPhysics` constituent le paquet autonome **`@vectojs/math`**
(un paquet feuille sans dépendances). [`@vectojs/core`](/reference/core-api/) en dépend
et le re-exporte, il se résout donc depuis `@vectojs/math` ou `@vectojs/core`.
L'intégrateur de ressort présent ici sous-tend également `SpringDriver` dans
[`@vectojs/animation`](/reference/core-api/#points-dentrée-et-carte-des-modules).

```ts
new SpatialHashGrid(cellSize = ...)
grid.insert(id, x, y, w, h): void   // sûr à appeler à chaque image (re-clé les anciennes cellules)
grid.remove(id): void
grid.query(x, y, w, h): Set<string> // O(k) cellules + résultats ; O(1) moyen pour de petites entités uniformes
grid.clear(): void                  // appeler une fois par image avant de réinsérer les dynamiques
```

Un index spatial de phase large pour le hit-testing ou les requêtes de candidats à la
collision sur de nombreuses entités mobiles — regroupez les entités par cellule à
l'insertion, puis `query()` une région pour n'obtenir que les identifiants qui
pourraient la chevaucher, au lieu de scanner chaque entité. `insert()` est
idempotent et peut être appelé à chaque image même pour une entité qui existe déjà
(elle se re-clé hors des cellules obsolètes), ce qui est le motif habituel :
`clear()` une fois par image, `insert()` chaque entité dynamique, puis
`query()` selon les besoins pour les tests de collision ou de hit de cette image.

```ts
new SpringPhysics(initial: number)
spring.value / spring.target / spring.velocity
spring.stiffness / spring.damping / spring.mass
spring.update(dt): void
spring.isAtRest(): boolean
```

Un intégrateur de ressort à valeur unique, réglable et à amortissement critique —
définissez `spring.target`, appelez `update(dt)` à chaque image, lisez `spring.value`.
C'est la primitive sur laquelle est construit le [`springTo()`](/reference/core-entity/#animation)
intégré d'`Entity` ; utilisez-la directement pour une valeur qui n'est pas l'une des
six propriétés `Entity` animables (un uniforme de shader personnalisé, un champ de
caméra, un scalaire au niveau de l'application). `isAtRest()` signale quand la
vélocité et la distance à la cible ont toutes deux diminué en dessous des seuils de
repos du moteur, afin qu'un appelant puisse cesser d'appeler `update()`.

## Associé

[`Entity`](/reference/core-entity/#animation) (`springTo`, construit sur `SpringPhysics`) ·
[`@vectojs/core` overview](/reference/core-api/)
