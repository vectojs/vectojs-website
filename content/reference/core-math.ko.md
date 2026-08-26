+++
title = "수학 유틸리티"
description = "O(1) 평균 광역 위상 공간 쿼리를 위한 SpatialHashGrid와 단일 값 임계-튜너블 스프링을 위한 SpringPhysics — @vectojs/core가 재-내보내기하는 독립형 @vectojs/math 패키지."
weight = 9
+++

# 수학 유틸리티 — `@vectojs/math`

`SpatialHashGrid`와 `SpringPhysics`는 독립형 **`@vectojs/math`**
패키지입니다(의존성이 없는 리프 패키지). [`@vectojs/core`](/reference/core-api/)가
이에 의존하고 재-내보내기하므로 `@vectojs/math` 또는 `@vectojs/core`
어느 쪽에서든 해석됩니다. 여기의 스프링 적분기는
[`@vectojs/animation`](/reference/core-api/#jinibjeom-mic-modyul-maeb)의 `SpringDriver`도 뒷받침합니다.

```ts
new SpatialHashGrid(cellSize = ...)
grid.insert(id, x, y, w, h): void   // 매 프레임 호출해도 안전 (오래된 셀 재키잉)
grid.remove(id): void
grid.query(x, y, w, h): Set<string> // O(k) 셀 + 결과; 작은 균일 엔터티의 경우 O(1) 평균
grid.clear(): void                  // 동적 요소 재삽입 전에 프레임당 한 번 호출
```

많은 움직이는 엔터티에 대한 히트-테스팅 또는 충돌 후보 쿼리를 위한 광역 위상 공간 인덱스 —
삽입 시 엔터티를 셀별로 버킷팅한 다음 `query()`로 영역을 검색하여
해당 영역과 겹칠 가능성이 있는 id만 가져오므로 모든 엔터티를 스캔할 필요가 없습니다.
`insert()`는 이미 존재하는 엔터티에 대해 매 프레임 호출해도 멱등성이며 안전합니다
(오래된 셀에서 재키잉). 일반적인 패턴:
프레임당 한 번 `clear()`, 모든 동적 엔터티에 대해 `insert()`, 그런 다음
해당 프레임의 히트-테스트 또는 충돌 검사에 필요한 대로 `query()`.

```ts
new SpringPhysics(initial: number)
spring.value / spring.target / spring.velocity
spring.stiffness / spring.damping / spring.mass
spring.update(dt): void
spring.isAtRest(): boolean
```

단일 값 임계-감쇠 튜너블 스프링 적분기 — `spring.target`을 설정하고,
매 프레임 `update(dt)`를 호출하고, `spring.value`를 읽습니다. 이것은
`Entity`의 내장 [`springTo()`](/reference/core-entity/#aenimeisyeon)가 기반으로 하는
기본 요소입니다; Entity의 여섯 가지 애니메이션 가능 속성 중 하나가 아닌 값(커스텀 셰이더 유니폼,
카메라 필드, 애플리케이션-레벨 스칼라)에 직접 사용하세요.
`isAtRest()`는 속도와 목표까지의 거리가 모두 엔진의 정지 임계값 아래로
감쇠되었을 때 보고하므로, 호출자는 `update()` 호출을 중단할 수 있습니다.

## 관련 항목

[`Entity`](/reference/core-entity/#aenimeisyeon) (`springTo`, `SpringPhysics` 기반) ·
[`@vectojs/core` 개요](/reference/core-api/)
