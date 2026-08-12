+++
title = "ComputeParticleEntity"
description = "고처리량 파티클 레이어: 파티클별 Float32Array 메모리 레이아웃, 스프링/댐핑/폭발 CPU 시뮬레이션, 그리고 자동 CPU 폴백이 있는 WebGPU 컴퓨트 경로."
weight = 6
+++

# `ComputeParticleEntity` — 고처리량 파티클 레이어

[`@vectojs/core`](/reference/core-api/)의 일부입니다.

```ts
new ComputeParticleEntity(options?: ComputeParticleOptions)
```

| 옵션            | 기본값      | 의미                                                                     |
| --------------- | ----------- | ------------------------------------------------------------------------ |
| `maxParticles`  | `10000`     | 파티클 수.                                                               |
| `springK`       | `0.05`      | 원점으로의 스프링 당김 (0–10으로 클램프).                                |
| `damping`       | `0.95`      | 속도 댐핑 (0–1).                                                         |
| `bounceDamping` | `0.5`       | 경계 바운스 에너지 보존 (0–1).                                           |
| `maxVelocity`   | `500`       | 속도 클램프.                                                             |
| `size`          | `4`         | 기본 파티클 크기 (px).                                                   |
| `color`         | `'#00f0ff'` | CSS 색상 (`baseColor`).                                                  |
| `pointerEvents` | `false`     | 레이어가 히트 이벤트를 캡처하는지 여부 (`isPointInside`가 이 값을 반환). |

## 파티클별 메모리 레이아웃

`particleData: Float32Array` — 길이 `maxParticles × PARTICLE*STRIDE*FLOATS`
(`PARTICLE*STRIDE*FLOATS = 8`). 파티클당 8개의 float:

| 오프셋 상수                  | 인덱스 | 필드                                                           |
| ---------------------------- | ------ | -------------------------------------------------------------- |
| `PARTICLE_OFFSET_POSITION_X` | 0      | position.x                                                     |
| `PARTICLE_OFFSET_POSITION_Y` | 1      | position.y                                                     |
| `PARTICLE_OFFSET_VELOCITY_X` | 2      | velocity.x                                                     |
| `PARTICLE_OFFSET_VELOCITY_Y` | 3      | velocity.y                                                     |
| `PARTICLE_OFFSET_ORIGIN_X`   | 4      | origin.x (스프링 앵커)                                         |
| `PARTICLE_OFFSET_ORIGIN_Y`   | 5      | origin.y                                                       |
| `PARTICLE_OFFSET_SIZE`       | 6      | size                                                           |
| `PARTICLE_OFFSET_LIFE`       | 7      | life: `-1` = 영구, `>=0`는 `0.5/s`로 감소, `0` = 죽음 (건너뜀) |

## 메서드

```ts
initRandomParticles(width, height): void      // 박스 전체에 분산; life = -1 (영구); 더티 표시
setOrigins(points: Float32Array | number[], requestPositionReset = true): void
setPositions(positions: Float32Array | number[]): void
setVelocities(velocities: Float32Array | number[]): void
triggerExplosion(x, y, force): void           // 다음 스텝을 위한 임펄스 큐 (반경 150px)
updateCPU(dt, mouseX, mouseY, width, height): void   // CPU 시뮬레이션 스텝; dt는 초 단위, [0,0.1]으로 클램프
destroyGPUResources(): void
```

CPU 시뮬레이션 스텝당: 스프링-투-오리진 + 마우스 반발(라이브 커서 120px 이내;
커서 "꺼짐"은 `< -9000`) + 대기 중인 폭발(150px 이내) → 통합
→ 속도 클램프 → 경계 바운스 + 클램프 → 수명 감소. NaN-가드됨.

## WebGPU vs CPU

`particleBackend`가 허용하고([`SceneOptions`](/reference/core-scene/#sceneoptions) 참조)
WebGPU 디바이스가 초기화되면, Scene은 전용 WebGPU 캔버스에서 컴퓨트 + 렌더 패스를 실행합니다;
그렇지 않으면 `updateCPU`를 호출하고 `fillCircle` / 선택적 [WebGL 포인트 레이어](/reference/core-renderer/#webgl-포인트-레이어)를 통해 그립니다.
`gpuStorageBuffer`가 non-null이면 리소스가 할당되었음을 확인하지만,
비동기 디바이스 손실 후에는 내구성 있는 "현재 활성" 상태가 아닙니다.
GPU 리소스(`gpuStorageBuffer`, `gpuUniformBuffer`,
`computeBindGroup`, `renderBindGroup`)와 `needsInit`는 백엔드 작성자를 위해 공개됩니다.

> WebGPU 초기화는 지연되며(`ComputeParticleEntity`가 나타나는 첫 프레임) 비동기이고,
> 디바이스-손실 자동 복구가 있습니다. 시뮬레이션에 의존하기 전에 `scene.resize(w, h)`로 뷰포트를 설정하세요 —
> `0×0` 박스는 모션을 생성하지 않습니다.

파티클 위치는 scene-공간입니다. Canvas CPU 경로는 엔터티 변환 스택에 참여합니다;
별도의 WebGL/WebGPU 오버레이 경로는 엔터티 변환/스케일/회전이나 부모 클리핑을 적용하지 않습니다.
불투명도는 모든 경로에서 상속됩니다.

사용법은 [Particle Systems](/learn/particles/)을 참조하세요.

## 관련 항목

[`Scene`](/reference/core-scene/) (`particleBackend` 옵션) ·
[Renderers](/reference/core-renderer/) (WebGL 포인트 레이어 폴백) ·
[`@vectojs/core` 개요](/reference/core-api/)
