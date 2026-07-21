---
title: '파티클 시스템'
description: 'ComputeParticleEntity: WebGPU 컴퓨트 파티클, CPU 폴백, 8-float 메모리 레이아웃, 마우스 상호작용, triggerExplosion'
order: 12
---

# 파티클 시스템

`ComputeParticleEntity`는 VectoJS의 고처리량 파티클 레이어입니다. WebGPU 컴퓨트 패스를 통해 스프링 물리 시뮬레이션을 실행하며, WebGPU를 지원하지 않는 브라우저를 위한 CPU 폴백을 제공합니다. 지원되는 파티클 수와 프레임 속도는 GPU, 브라우저, DPR, 렌더링 구성에 크게 의존합니다. 현재 저장소에는 체크인된 100k/1M 하드웨어 벤치마크가 포함되어 있지 않습니다.

## 직접 체험해보기

<figure class="sandbox">
  <a class="sandbox-cta" href="/demos/nexus/">
    <span class="sandbox-cta-title">Nexus 파티클 데모 열기 →</span>
    <span class="sandbox-cta-sub">수만 개의 <code>ComputeParticleEntity</code> 점이 "VectoJS"를 철자하며 WebGPU에서 시뮬레이션됩니다. 드래그로 이동, 스크롤로 확대/축소, 클릭으로 필드를 통해 펄스를 보냅니다.</span>
  </a>
  <figcaption>파티클 필드는 독립형 WebGPU 페이지로 최대 속도로 실행됩니다 — 작은 임베디드 iframe이 성능을 저하시켰기 때문에 실제 페이지로 링크됩니다.</figcaption>
</figure>

## 파티클 vs `getBatchCircle`

|           | `ComputeParticleEntity`          | 사용자 정의 엔티티의 `getBatchCircle`    |
| --------- | -------------------------------- | ---------------------------------------- |
| 물리      | 내장 (스프링, 마우스 반발, 폭발) | 수동 — `update()`에서 직접 위치 업데이트 |
| 백엔드    | WebGPU 컴퓨트 또는 CPU           | WebGL 포인트 레이어                      |
| 처리량    | 하드웨어/작업 부하 의존적        | 하드웨어/작업 부하 의존적                |
| 사용 시기 | 독립형 물리 필드                 | 직접 제어하는 포인트 클라우드            |

형태로 스프링하는 파티클 필드, 커서에 반응, 폭발 트리거가 필요하다면 `ComputeParticleEntity`가 적합한 도구입니다. 직접 제어하는 위치에 많은 점을 렌더링하려면 사용자 정의 엔티티에 `getBatchCircle()`을 구현하세요.

## 기본 설정

```typescript
import { Scene, ComputeParticleEntity } from '@vectojs/core';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;

const scene = new Scene(canvas, {
  particleBackend: 'auto', // 'webgpu' | 'cpu' | 'auto' (기본값: WebGPU 시도, 실패 시 폴백)
  pointBackend: 'webgl', // CPU 폴백 렌더링에 필요
  maxFPS: 60,
});

const particles = new ComputeParticleEntity({
  maxParticles: 50_000,
  springK: 0.05, // 원점 방향 스프링 당김 (0–10)
  damping: 0.95, // 단계별 속도 감쇠 (0–1)
  bounceDamping: 0.5, // 경계 충돌 시 보존되는 에너지 (0–1)
  maxVelocity: 500, // 속도 제한
  size: 3, // 기본 파티클 반경 (px)
  color: '#00f0ff',
  pointerEvents: false, // true → 엔티티가 히트 이벤트를 캡처
});

scene.add(particles);
scene.start();

// 중요: initRandomParticles 호출 전에 리사이즈
scene.resize(window.innerWidth, window.innerHeight);

// 뷰포트 전체에 파티클 분산
particles.initRandomParticles(scene.width, scene.height);

window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
});
```

> [!CAUTION] > `resize(w, h)`는 **반드시** `initRandomParticles` **전에** 호출되어야 합니다. `0×0` 뷰포트는 모든 파티클 위치가 `(0, 0)`이 되고 시뮬레이션에 튕길 경계가 없음을 의미합니다. `scene.start()`는 너비나 높이가 0이면 일회성 경고를 기록합니다.

## 8-float 메모리 레이아웃

각 파티클은 `entity.particleData`에서 8개의 연속된 `float32` 값입니다:

| 오프셋 상수                  | 인덱스 | 필드       | 설명                                                  |
| ---------------------------- | ------ | ---------- | ----------------------------------------------------- |
| `PARTICLE*OFFSET*POSITION_X` | 0      | position.x | 현재 월드 공간 x                                      |
| `PARTICLE*OFFSET*POSITION_Y` | 1      | position.y | 현재 월드 공간 y                                      |
| `PARTICLE*OFFSET*VELOCITY_X` | 2      | velocity.x |                                                       |
| `PARTICLE*OFFSET*VELOCITY_Y` | 3      | velocity.y |                                                       |
| `PARTICLE*OFFSET*ORIGIN_X`   | 4      | origin.x   | 스프링의 정지/앵커 지점                               |
| `PARTICLE*OFFSET*ORIGIN_Y`   | 5      | origin.y   |                                                       |
| `PARTICLE*OFFSET*SIZE`       | 6      | size       | 파티클별 크기 재정의                                  |
| `PARTICLE*OFFSET*LIFE`       | 7      | life       | `-1` = 영구; `≥0`은 0.5/s로 감소; `0` = 죽음 (건너뜀) |

`particleData`를 직접 읽고 써서 사용자 정의 형태를 설정할 수 있습니다. 작성 후 `needsInit = true`로 설정하면 다음 프레임에서 GPU 업로드가 트리거됩니다.

## 텍스트 모양 및 패턴 형성하기

`setOrigins()`는 파티클이 형태로 스프링하게 만드는 기본 방법입니다. 교대하는 `[x0, y0, x1, y1, …]` 쌍의 평탄한 `Float32Array`를 전달하세요 — 파티클당 한 쌍:

```typescript
// 10,000개의 파티클을 그리드로 배열
const N = 10_000;
const cols = 100;
const origins = new Float32Array(N * 2);

for (let i = 0; i < N; i++) {
  const col = i % cols;
  const row = Math.floor(i / cols);
  origins[i * 2] = 100 + col * 8; // x
  origins[i * 2 + 1] = 100 + row * 8; // y
}

particles.setOrigins(origins); // 또한 particleData를 GPU에 업로드
```

`setOrigins(points, requestPositionReset = true)` — 두 번째 인수는 파티클이 새 원점으로 순간이동할지(즉각적인 형태 변경에 유용) 아니면 현재 위치에서 스프링할지를 제어합니다.

원점을 변경하지 않고 위치를 설정하려면 `setPositions()`를 사용하세요. 초기 속도(예: 중심에서 바깥쪽으로의 폭발)를 설정하려면 `setVelocities()`를 사용하세요.

세 메서드 모두 `particleData`에 쓰고 `needsInit = true`를 설정하므로, 다음 프레임에서 WebGPU 저장소 버퍼로 데이터가 업로드됩니다.

## 마우스 상호작용

`pointerEvents: true`일 때, `Scene`은 파티클 시뮬레이션에 커서 좌표를 전달합니다. 커서에서 **120px** 이내의 파티클은 반발됩니다:

```typescript
const particles = new ComputeParticleEntity({
  maxParticles: 100_000,
  pointerEvents: true,
});
scene.add(particles);
```

반발 반경과 힘은 셰이더에서 고정됩니다. 커서가 캔버스를 벗어나면 반발 지점이 `(-99999, -99999)`로 설정되어 반발이 적용되지 않습니다.

## 폭발 트리거

`triggerExplosion(x, y, force)`는 다음 시뮬레이션 단계를 위한 충격을 대기열에 추가합니다. `(x, y)`에서 **150px** 이내의 모든 파티클은 `force`에 비례하는 바깥쪽 속도 충격을 받습니다:

```typescript
canvas.addEventListener('dblclick', (e) => {
  const point = scene.clientToScene(e.clientX, e.clientY);
  particles.triggerExplosion(point.x, point.y, 800);
});
```

한 번에 하나의 폭발만 대기열에 추가할 수 있습니다 — 이전 폭발이 소비되기 전에 `triggerExplosion`을 호출하면 덮어씁니다.

## WebGPU vs CPU 폴백

`particleBackend` 옵션은 사용할 경로를 제어합니다:

| 값                | 동작                                                                |
| ----------------- | ------------------------------------------------------------------- |
| `'auto'` (기본값) | WebGPU 시도; 실패하거나 없으면 CPU로 폴백                           |
| `'webgpu'`        | 명시적으로 WebGPU 요청; 현재 런타임은 초기화 실패 시에도 CPU로 폴백 |
| `'cpu'`           | CPU 시뮬레이션 강제; 사용 가능해도 WebGPU 비활성화                  |

**WebGPU 활성 시:** 시뮬레이션은 GPU에서 컴퓨트 셰이더로 실행됩니다. 파티클 상태는 WebGPU 저장소 버퍼에 있으며 Scene 전용 WebGPU 캔버스로 렌더링됩니다.

**CPU 폴백 활성 시:** `Scene`은 매 프레임 `entity.updateCPU(dt, mouseX, mouseY, width, height)`를 호출합니다(동일한 물리 모델 — 스프링, 반발, 폭발, 속도 제한, 바운스). Canvas2D의 `fillCircle()` 또는 선택적 WebGL 포인트 레이어를 통해 렌더링됩니다. 대상 브라우저와 하드웨어에서 측정한 수를 기준으로 개수를 선택하세요.

> [!NOTE] > `particles.gpuStorageBuffer !== null`은 GPU 리소스가 할당되었음을 나타내지만,
> 비동기 장치 손실 후에는 신뢰할 수 있는 실시간 백엔드 상태가 아닙니다.

장치 손실은 WebGPU를 세션에 대해 영구적으로 비활성화하기 전에 지수 백오프(3회 재시도)로 자동 복구됩니다.

### GPU에서 파티클 위치 읽기

파티클 상태는 GPU 버퍼에 있습니다. 저렴하게 읽을 수 없습니다 — `mapAsync` + `copyBufferToBuffer` 왕복은 파이프라인을 중단시킵니다. CPU에서 위치가 필요한 경우(예: 비파티클 엔티티와의 충돌 감지), `particleData`에 직접 쓰고 `setPositions()`를 사용하여 CPU 측 `Float32Array`를 동기화 상태로 유지하세요.

파티클 시스템 내에서 대규모 공간 쿼리를 위해서는 추가 WebGPU 컴퓨트 패스를 작성하세요. 다른 엔티티와의 충돌을 위해서는 CPU 경로에서 `SpatialHashGrid`를 사용하세요.

## GPU 리소스 관리

```typescript
// 완료 시 GPU 버퍼 정리 (예: 페이지 언로드 또는 컴포넌트 해체 시)
particles.destroyGPUResources();
scene.remove(particles);
```

`scene.destroy()`는 모든 파티클 엔티티에서 `destroyGPUResources()`도 호출하므로, 세션 중간에 해체할 때만 수동으로 호출하면 됩니다.

## WebGPU용 TypeScript 타입

프로젝트에서 WebGPU API를 사용하고 TypeScript가 `Cannot find name 'GPUDevice'`를 보고하는 경우:

```bash
bun add -d @webgpu/types
```

```json
{ "compilerOptions": { "types": ["@webgpu/types"] } }
```

## 문제 해결

### 화면에 아무것도 나타나지 않음

순서대로 확인하세요:

1. **`initRandomParticles()`가 호출되지 않음** — 이 작업 없이는 모든 파티클 위치가 `(0, 0)`이고 크기가 `0`입니다.
2. **`initRandomParticles` 전에 `resize(w, h)`가 호출되지 않음** — `0×0` 상자에 분산된 파티클은 보이지 않습니다. `scene.width`와 `scene.height`가 0이 아닌지 확인하세요.
3. **WebGPU 초기화 실패** — 현재 런타임은 실패를 기록하고, `'webgpu'`가 명시적으로 요청된 경우에도 GPU 경로를 비활성화한 후 CPU 폴백으로 계속 진행합니다.
4. **`pointBackend`가 `'webgl'`로 설정되지 않음** — CPU 폴백은 `fillCircle`을 통해 렌더링됩니다. `'webgl'`이 없어도 CPU 경로 파티클은 캔버스 렌더러가 활성화된 경우 Canvas2D에 계속 나타납니다.

### FPS가 예상보다 훨씬 낮음

- 브라우저 GPU 도구와 WebGPU 캔버스를 사용하여 활성 경로를 확인하세요. 보유한 `gpuStorageBuffer`만으로는 장치 손실 후 신뢰할 수 있는 상태 신호가 아닙니다.
- 헤드리스/CI 환경에서는 WebGPU와 WebGL이 소프트웨어 렌더러(Swiftshader)로 폴백됩니다. 헤드리스에서의 FPS는 대표적이지 않습니다. 실제 GPU 하드웨어에서 측정하세요.
- 프로파일링하는 동안 `maxParticles`를 줄이고 대상 장치에서 프레임 시간 백분위수를 기록하세요. 이 저장소는 보편적인 CPU 또는 GPU 상한을 설정하지 않습니다.

### 파티클이 설정한 형태 대신 `(0, 0)`으로 스프링됨

`setOrigins()`와 `setPositions()`는 모두 `needsInit = true`를 설정하며, 이는 다음 프레임에서 `particleData`를 GPU 버퍼로 업로드합니다. **`scene.start()` 전**에 호출하는 경우, 업로드가 발생하도록 `start()`가 이후에 호출되었는지 확인하세요.
