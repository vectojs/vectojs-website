---
title: 'Utilidades matemáticas'
description: 'SpatialHashGrid para consultas espaciales de fase amplia con promedio O(1) y SpringPhysics para un resorte sintonizable de un solo valor críticamente amortiguado — los helpers matemáticos de propósito general exportados desde @vectojs/core.'
order: 9
---

# Utilidades matemáticas (desde `.`)

Parte de [`@vectojs/core`](/reference/core-api/).

```ts
new SpatialHashGrid(cellSize = ...)
grid.insert(id, x, y, w, h): void   // seguro de llamar cada fotograma (reasigna de celdas antiguas)
grid.remove(id): void
grid.query(x, y, w, h): Set<string> // O(k) celdas + resultados; O(1) promedio para entidades pequeñas uniformes
grid.clear(): void                  // llama una vez por fotograma antes de reinsertar dinámicas
```

Un índice espacial de fase amplia para consultas de candidatos a hit-testing o colisión sobre
muchas entidades en movimiento — agrupa entidades por celda al insertar, luego consulta() una
región para obtener solo los ids que podrían superponerse, en lugar de escanear
cada entidad. `insert()` es idempotente y seguro de llamar cada fotograma incluso para una
entidad que ya existe (reasigna desde celdas obsoletas), que es el patrón
habitual: `clear()` una vez por fotograma, `insert()` cada entidad dinámica, luego
`query()` según sea necesario para las pruebas de impacto o comprobaciones de colisión de ese fotograma.

```ts
new SpringPhysics(initial: number)
spring.value / spring.target / spring.velocity
spring.stiffness / spring.damping / spring.mass
spring.update(dt): void
spring.isAtRest(): boolean
```

Un integrador de resorte de un solo valor críticamente amortiguado sintonizable — establece `spring.target`,
llama a `update(dt)` cada fotograma, lee `spring.value`. Esta es la primitiva
sobre la que se construye el [`springTo()`](/reference/core-entity/#animación) incorporado de `Entity`;
úselo directamente para un valor que no sea una de las seis propiedades animables de `Entity`
(un uniforme de shader personalizado, un campo de cámara, un escalar a nivel de aplicación).
`isAtRest()` informa cuando tanto la velocidad como la distancia al objetivo han decaído
por debajo de los umbrales de reposo del motor, para que quien lo llame pueda dejar de llamar a `update()`.

## Relacionados

[`Entity`](/reference/core-entity/#animación) (`springTo`, construido sobre `SpringPhysics`) ·
[Visión general de `@vectojs/core`](/reference/core-api/)
