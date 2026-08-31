+++
title = "07 — 렌더러 — 좌표 / 클리핑 / DPR 패리티"
description = "Canvas2D, WebGL, WebGPU, SVG, Three.js 전반의 다중 백엔드 패리티: IRenderer 계약, 좌표 공간, 클립 의미, DPR/백업 저장소 제한, 뷰포트 제거 및 드로우 콜 배치 — 동일한 씬이 다른 백엔드에서 다르게 보이게 하는 모든 함정."
weight = 27
+++

# 07 — 렌더러 — 좌표 / 클리핑 / DPR 패리티

> **Boss 07**은 마지막 마일을 지킨다: Virtual Math Tree의 기하학을 백엔드가 `CanvasRenderingContext2D`, WebGL 포인트 레이어, WebGPU 컴퓨트 패스, SVG 내보내기, Three.js 인스턴스 메시 중 무엇이든 어떤 DPR, 확대, 뷰포트에서도 동일한 픽셀로 바꾸는 작업이다.

- **배울 내용**: `IRenderer` 계약과 왜 `CanvasRenderingContext2D`가 아니라 그것이 권위인지; 드로우 호출이 통과하는 5개의 좌표 공간; 클리핑, DPR, 제거, 배치가 각각 패리티를 어떻게 깨는지; `file:line`으로 확인 가능한 제출, 수정, 아직 열려 있는 함정.
- **배우지 않을 내용**: 텍스트 형태와 레이아웃(boss 02), VMT 더티와 라이프사이클(boss 06), WASM 가속(boss 08), Three/XR 브리지의 두 세계 매핑(boss 09). 이 문서는 각 요소의 렌더링 절반이다.

## 다중 백엔드 패리티가 어려운 이유

VectoJS는 5개의 백엔드에서 "같은 씬, 같은 그림"을 약속한다:

| 백엔드                         | 모듈                                                          | 유지?          | 픽셀이 가는 곳                            |
| ------------------------------ | ------------------------------------------------------------- | -------------- | ----------------------------------------- |
| Canvas2D                       | `packages/core/src/renderer/CanvasRenderer.ts:1`              | 즉시           | 하나의 `<canvas>` 2D 컨텍스트, DPR 스케일 |
| WebGL 포인트/스프라이트/글리프 | `packages/core/src/renderer/WebGLPointRenderer.ts:1`          | 배치           | 전체 창 스택 캔버스, NDC 쿼드             |
| WebGPU 입자                    | `packages/core/src/renderer/WebGPUParticleSystemManager.ts:1` | 컴퓨트         | 같은 스택 캔버스, 컴퓨트→렌더             |
| SVG 내보내기                   | `packages/core/src/renderer/SVGRenderer.ts:1`                 | 유지 문자열    | `toXMLString()` DOM 없는 직렬화           |
| Three.js                       | `packages/three/src/ThreeRenderer.ts:216`                     | 유지 씬 그래프 | `THREE.WebGLRenderer` 직교 카메라         |

모든 백엔드는 동일한 `Entity.render(r: IRenderer)` 호출을 동일한 순서로, 동일한 `save`/`restore`/`translate` 스택 아래에서 받는다. 패리티는 탐색이 잘못된 곳이 아니라 백엔드가 동일한 호출을 다르게 해석하는 곳에서 깨진다 — 한 쪽에서는 경로 연산이고 다른 쪽에서는 가위 사각형인 클립, 한 쪽에서는 `window.devicePixelRatio`로 크기가 정해지고 다른 쪽에서는 `maxDPR`로 제한되는 백업 저장소, 한 쪽에서는 `lineWidth` 속성이고 다른 쪽에서는 리본 기하학인 스트로크. 각 차이는 HiDPI 디스플레이, 확대, 클립 가장자리, 또는 4만 셀 그리드가 닿기 전까지 보이지 않는다.

이러한 차이를 흡수하는 계약은 `IRenderer` (`packages/core/src/renderer/IRenderer.ts:1`)다. 엔티티는 구체 렌더러를 임포트해서는 안 된다. 인터페이스는 의도적으로 메서드 기반이다: 스타일이 드로우와 함께 이동(`stroke(color, lineWidth)`, `fillText(text, x, y, font, color)`)하므로 배치 백엔드는 실행을 합칠 수 있고 GPU 백엔드에는 정의된 경계가 있다. 변경 가능한 스타일 속성(`ctx.fillStyle = …`)은 의도적으로 부재 — 개발 함정은 이를 경고한다 (`IRenderer.ts:159`, `IRenderer.ts:301`) — 변환되지 않은 JS에서는 확장자로 연결되어 컨텍스트 기본값으로 조용히 그리기 때문이다.

## IRenderer 계약 (먼저 읽으라)

```text
IRenderer.ts:41  — kind, pixelRatio, setDrawCounters / getDrawCounters
IRenderer.ts:134 — clip(x,y,w,h, radii?)
IRenderer.ts:149 — path: beginPath / moveTo / lineTo / bezierCurveTo / closePath / arc / roundRect
IRenderer.ts:193 — drawImage / drawImageRect? (옵션)
IRenderer.ts:287 — fill / stroke / fillText / fillCircle / flush
IRenderer.ts:350 — createLinearGradient
IRenderer.ts:404 — present? / dispose? / isContextLost? / onContextRestored?
```

주요 설계 선택:

- **`kind`** (`IRenderer.ts:76`)는 안정적인 문자열 식별자(`'canvas2d' | 'svg' | 'three'`) — `constructor.name`은 축소된다.
- **`pixelRatio`** (`IRenderer.ts:88`)는 선택적이며 접근 시 다시 읽지 않는 _현재 적용된_ 값이다. 소스 블릿을 래스터화하는 호출자는 창이 아니라 이것을 읽어야 한다.
- **`drawImageRect?`** (`IRenderer.ts:232`)는 옵션이다. `SVGRenderer`는 의도적으로 이를 생략한다: SVG 블릿은 소스를 데이터 URL로 삽입하므로 셀별 하위 사각형이 전체 아틀라스를 수천 번 인라인한다. 호출자는 기능 감지하고 `fillText` 대체를 유지해야 한다.
- **`fillCircle` + `flush`** (`IRenderer.ts:328`, `:364`)는 순서 보존 배치다. 같은 색상, 같은 알파 원은 한 경로와 한 `fill()`로 `flush()`에서 합쳐진다. `Scene`은 모든 형제 경계와 프레임 끝에서 플러시한다.
- **`present?`** (`IRenderer.ts:404`)는 유지 백엔드 전용이다. `CanvasRenderer`는 즉시 그리기; `ThreeRenderer`는 실제 GL 렌더를 `present()` (`ThreeRenderer.ts:957`)로 한 번만 지연하므로 프레임이 `O(N²)` 재렌더가 아닌 `O(N)` 추가 + `1` 드로우를 비용으로 한다.

## 좌표 공간 (하나가 아니라 다섯)

`fillCircle(cx, cy, …)`로 작성된 점은 다음을 통과한다:

1. **로컬** — 엔티티의 `(x, y)` 상자. `Entity.getBounds()`와 `worldToLocal`이 여기 있다.
2. **월드** — 모든 조상의 `translate` / `scale` / `rotate`와 씬의 DPR 스케일로 변환된 로컬. `HitTester`와 제거가 여기서 테스트한다.
3. **뷰포트 / CSS px** — 씬의 뷰포트와 모든 `clipChildren` 조상으로 클리핑된 월드. `Scene.ts:4335` `projectionBoxVisible`.
4. **백업 저장소 / 장치 px** — 뷰포트 × `appliedDPR` (`CanvasRenderer.ts:244` `pixelRatio`). GPU가 실제로 샘플링하는 곳.
5. **클립 / NDC** — WebGL/WebGPU 전용: `(pos / resolution)*2-1`, y-반전 (`WebGLPointRenderer.ts:320`), Three의 y-하향 직교 (`ThreeRenderer.ts:250`).

함정은 한 공간이 다른 공간이라고 가정하는 것이다. `ComputeParticleEntity`의 GPU 경로는 `scene.mouseX/Y`를 **창** 공간에서 소비하고 엔티티 변환을 무시하는 전체 창 스택 캔버스에 그리며, CPU 대체는 `entity.worldToLocal(mouse)`를 **로컬** 공간에서 소비하고 `renderer.translate(node.x, node.y)` 안에서 그린다 — 하나의 버퍼, 두 계약 (`vectojs-docs/forge/findings/renderer-and-gpu.md:299`). `WebGPUParticleSystemManager` 기록 패스는 `screen_size`를 `width / height` (`WebGPUParticleSystemManager.ts:310`)로 전달하는 반면 CPU 경로는 엔티티 변환이 이미 적용된 상태로 그린다.

ThreeRenderer는 NDC 경계에서 동일한 함정에 산다: y-하향 직교 카메라 (`ThreeRenderer.ts:250`)로 인해 모든 `FrontSide` 메시가 뒤집혀 제거된다 — 해결은 모든 채워진 기본 요소에 `side: DoubleSide`를 적용하는 것이지 텍스트만이 아니다 (`ThreeRenderer.ts:596`, forge 2026-08-13).

## 클리핑

`IRenderer.clip(x, y, w, h, radii?)` (`IRenderer.ts:134`)는 현재 클립과 교차한다. `radii`는 점진적 향상이다: 가위 테스트 GPU 경로는 이를 무시할 수 있다.

- **Canvas2D** — `ctx.roundRect` + `save`/`restore` 안의 `ctx.clip()` (`CanvasRenderer.ts:373`). 범위 지정, 정확.
- **SVG** — 합성: 새 `<clipPath id="clip-N"><rect|path …/>`와 `<g clip-path="url(#clip-N)">`, `clipDepth`의 `restore()`에서 태그 닫기와 `toXMLString()`에서 (`SVGRenderer.ts:510`, `:543`). 비용은 채우기 속도가 아닌 DOM 크기다.
- **Three** — 현재 행렬로 변환되고 하단-왼쪽 원점으로 반전된 백업 저장소 픽셀의 가위 사각형, 포함된 가위와 교차 (`ThreeRenderer.ts:449`). 가위는 사각형만; 둥근 클립은 AABB로 감소한다.
- **`clipChildren`** — 렌더러 `clip()` 호출이 아닌, 히트, 접근성, 콘텐츠 투영을 가상화하는 `Scene`/엔티티 수준 플래그. `Scene.ts:254`(히트)와 `Scene.ts:4305`(제거) 모두 `clipChildren` 조상의 AABB와 뷰포트를 교차한다; `isHitEligible`은 정확한 회전 인식 로컬 사각형으로 다시 확인한다.

알려진 클립 공백: `IRenderer.fill`은 `fillRule: 'evenodd'`를 표현할 수 없다 (`forge/findings/renderer-and-gpu.md:38`). `Canvas2D`와 `SVG`는 짝수-홀수(`ctx.fill('evenodd')`, `<path fill-rule="evenodd">`)를 할 수 있지만 인터페이스는 `fill(colorOrGradient)`만 노출한다. 따라서 하나 이상의 닫힌 구성 요소가 있는 복합 경로는 모든 백엔드에서 `nonzero`로 채워진다. 규정된 형태는 소비자가 진단 보호를 삭제하기 전에 일관되게 구현할 선택적 `fill`의 `fillRule` 인수로 역호환 가능한 것이다.

## DPR 스케일링과 백업 저장소 제한

```text
CanvasRenderer.ts:219  effectiveDPR()  = min(실제 DPR, maxDPR)
CanvasRenderer.ts:244  pixelRatio      = appliedDPR (기록됨, 라이브 아님)
CanvasRenderer.ts:119  생성자 / 크기 조정이 scale(dpr, dpr) 적용
WebGLPointRenderer.ts:972  포인트 레이어에 대한 동일한 제한
ThreeRenderer.ts:307   getPixelRatio()를 통한 effectiveDPR() / pixelRatio
Scene.ts:286           SceneOptions.maxDPR — 크기 조정 시 모든 렌더러에 동기화
```

세 가지 불변 조건:

1. **제한하라, 믿지 마라.** `maxDPR` (`SceneOptions.maxDPR`, `CanvasRenderer.ts:66`)이 백업 저장소 성장을 제한한다. `maxDPR: 2`는 합리적인 기본값이지만 보장은 아니다 — 수천 개의 얇은 세그먼트가 있는 프레임당 스트로크 패스는 동일한 콘텐츠에서 DPR1에서 `16.7 ms` 대 DPR2에서 `140 ms`로 측정되었다 (`forge 2026-07-18` 백업 저장소 제한). 비용이 많이 드는 패스는 엔진 기본이 2일 때도 `maxDPR: 1`이 필요할 수 있다.
2. **적용된 것, 라이브가 아니다.** `pixelRatio`는 컨텍스트가 현재 스케일된 비율(`appliedDPR`)을 보고하며, 접근 시 다시 읽는 `effectiveDPR()`가 아니다 (`CanvasRenderer.ts:234`). 라이브 getter는 확대/DPR 변경과 다음 `resize` 사이 창에서 미래 DPR을 보고하므로, 이를 읽어 래스터화하는 호출자는 여전히 오래된 컨텍스트가 리샘플링하는 텍스처를 생성한다. `pixelRatio`로 키가 지정된 캐시(`GlyphRasterAtlas`, `Markdown` 코드 아틀라스 풀)는 실제로 재할당하는 `resize` 이후에만 다시 키를 지정한다.
3. **크기 조정이 스타일 캐시를 무효화한다.** `canvas.width/height` 설정은 명세에 따라 전체 2D 컨텍스트를 `10px sans-serif / #000`으로 재설정한다. `CanvasRenderer.resize`는 `_cachedFont/_cachedFill/_cachedStroke`와 배치 상태(`CanvasRenderer.ts:258`)를 삭제하고 새 `appliedDPR`를 기록한다. `contextrestored`도 동일 (`CanvasRenderer.ts:164`); 삭제가 없으면 기본 폰트에서 오래된 캐시 재도장이 발생한다. 일치하는 `WatchDevicePixelRatio` 미디어 쿼리 루프는 모든 변경(`ThreeRenderer.ts:338`, `Scene` 동등)에서 다시 무장하므로 디스플레이 간 드래그나 확대가 실제 `resize`를 트리거한다.

사전 래스터화된 비트맵은 이에 의존해야 한다:

- `GlyphRasterAtlas`와 `TextRasterCache`는 구성 시 `dpr`로 래스터화(`GlyphRasterAtlas.ts:174`, `TextRasterCache.ts:88`)하지만 키는 역사적으로 이를 생략했다 (`forge 2026-08-25`): DPR 변경 간 동일한 키로 하나의 아틀라스를 재사용하면 오래된 밀도의 비트맵을 동일한 키 아래 제공하고 리샘플링하여 블릿(흐릿함)했다. 문서 계약은 "아틀라스는 DPR로 키가 지정되고 변경 시 교체된다"라고 명시하지만 — 키가 DPR을 접지 않으면 호출자 규율에 안전이 의존한다.
- `SplineEntity.bake`는 한때 원시 `window.devicePixelRatio`를 읽었다 (`SplineEntity.ts:433` 수정 전) 반면 블릿은 `maxDPR`로 제한된 컨텍스트로 들어갔다 — 매 프레임 다운샘플링되는 과해상도 비트맵. 렌더 시 `renderer.pixelRatio`를 읽고 변경 시 재베이크하도록 수정(`SplineEntity.ts:504`).

## 뷰포트 제거

`Scene`은 뷰포트에 대해 엄격히 제거한다: 채움 상자가 뷰포트 밖에 완전히 있는 엔티티는 건너뜀 (`Scene.ts:7254` 제거 추적). 두 가지 개선:

- **스트로크 확대.** `Circle.getBounds()` / `Rect.getBounds()`는 스트로크된 경우 이제 `strokeWidth/2`로 확대한다 (`Circle.ts:67`, `Rect.ts:54`, `@vectojs/core@2.18.3` CTX-0261 수정). 이전에는 뷰포트 가장자리의 두꺼운 스트로크가 너비의 절반까지 손실되었다. `-0` 후속(`-inflation`이 `0`을 부정함)은 긍정 전용 부정이 필요했다 (`forge 2026-08-08` `-0` 항목).
- **클립 인식 제거** (`Scene.ts:4335`). `projectionBoxVisible`은 뷰포트와 모든 `clipChildren` 조상의 AABB를 교차한다; 오프 뷰포트지만 클립된 콘텐츠는 가상화된다(boss 03). 무한 전체 뷰포트 오버레이는 의도적으로 절대 클리핑되지 않는다 (`Scene.ts:4238`).

## 배치와 드로우 콜 경제

| 경로                          | 메커니즘                                                         | 제한 / 비용                                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fillCircle` (Canvas2D)       | 같은 색상, 같은 알파 실행 → 한 경로, 한 `fill()` (`flush()`에서) | `MAX_BATCH = 64` (`CanvasRenderer.ts:88`) — 그 이상은 초선형                                                                                             |
| `fillCircle` (SVG)            | `flush`당 하나의 `<path d="… A … A …">`                          | GPU 비용 없음, DOM 크기                                                                                                                                  |
| `fillCircle` (WebGL/Three)    | 인스턴스 쿼드 / `CircleGeometry`                                 | 거의 일정; 플러시만 중요                                                                                                                                 |
| `drawImage` / `drawImageRect` | 없음 — 즉시 `drawImage` / `<image>`                              | 아틀라스(`GlyphRasterAtlas`)는 하나의 소스 텍스처 유지; `TextRasterCache`는 캔버스당 소스가 4만 셀에서 0.87배(`fillText` 기준) 대 아틀라스 ~2배로 측정됨 |

`CanvasRenderer.flush` (`CanvasRenderer.ts:414`)는 `globalAlpha`를 사전 배치 값(1이 아님)에서 복원하고 `_cachedFill`을 배치 색상으로 업데이트한다 — 그렇지 않으면 오래된 캐시로 다음 `fill('red')`이 할당을 건너뛰고 배치 색상으로 그린다. `drawImage`, `beginPath`, `save`/`restore`, `clip`, `fill`, `stroke`, `fillText` 이전에 대기 중인 배치가 커밋된다.

`ThreeRenderer.flush` (`ThreeRenderer.ts:957`)는 `frameDirty`만 표시한다. 실제 GL 렌더는 `present()` (`ThreeRenderer.ts:968`)이며, `Scene`이 프레임 끝에서 한 번 호출한다; 없으면 `O(N)` 플러시가 `O(N²)` 렌더를 비용으로 한다. `present()`를 절대 호출하지 않는 이전 `Scene` 빌드는 마이크로태스크 대체로 보호된다.

WebGL 특정: `setTexture`는 소스가 변경될 때 `texImage2D` 전에 스프라이트 배치를 커밋한다 (`WebGLPointRenderer.ts:974`, `@vectojs/core@2.18.3` 수정), `setMSDFTexture`와 동일하게. `ctx.filter = 'blur()'` 비용은 다음 픽셀 읽기까지 지연된다 (`forge 2026-07-18` `ctx.filter` 항목) — 가능하면 절반 해상도에서 블러.

## 텍스트 래스터 경로

`fillText`는 CPU 형태 + 색상 파싱 + 최대 5,000 호출/프레임의 래스터화; GPU는 유휴 상태다(`(program)`이 지배). 두 선택적 캐시는 형태를 블릿으로 변환한다:

- `GlyphRasterAtlas` (`GlyphRasterAtlas.ts:1`) — 하나의 캔버스, 선반 포장 슬롯, `drawImageRect` 하위 사각형. 제한된 고정 폭 세트(코드 그리드, 터미널)용. `drawImageRect` 필요; `SVGRenderer`는 대상이 아니다.
- `TextRasterCache` (`TextRasterCache.ts:1`) — `(font, color, text)` 실행당 하나의 작은 캔버스, `drawImage` 블릿. 제한된 구문 세트(단막 395 코드포인트 → 하나의 `≤1024²` MSDF 아틀라스)용. 두 가지 모두 메모리 경계(아틀라스 선반 + 재설정 카운터, 캐시 `maxEntries`와 10% 삽입 순서 제거)와 `fillText`로 무음으로 대체한다. 5,000 단막 벽은 형태가 아니라 드로우 카운트 + 오버드로우였다: `fillText→drawImage` 교체는 아무것도 변경하지 않았고; 글리프를 `MSDFTextEntity` / `pointRenderer.addGlyph`를 통해 약 1 WebGL 드로우로 배치하면 `~28 fps` → `~130 fps`로 이동했다 (`forge 2026-07-20` 수정, `bakudan` v0.5).

Three의 텍스트 경로는 `dpr`로 래스터화(`ThreeRenderer.ts:747`)하고 `dpr|font|color|text|gradient-definition`과 그라디언트는 반올림된 `x,y` 단계(`ThreeRenderer.ts:806`)로 텍스처 캐시를 키 지정한다. 폰트 크기는 `parseFontSize` (`ThreeRenderer.ts:274`)로 파싱하며 `parseInt`가 아니다 — 스타일 약어는 무게를 먼저(`'700 16px Inter'`) 두므로 순진한 `parseInt`는 `700`을 읽었다. 기준선: 알파벳 기준선이 `y`에 착지; Three의 `PlaneGeometry` 중심은 `-fontSize + h/2` (`ThreeRenderer.ts:831`)로 오프셋된다.

## 씬 연결 (렌더러의 손잡이가 설정되는 곳)

```text
Scene.ts:226  SceneOptions.pointBackend: 'canvas' | 'webgl'   (글리프/스프라이트)
Scene.ts:233  SceneOptions.particleBackend: 'auto'|'webgpu'|'cpu' (컴퓨트 입자)
Scene.ts:286  SceneOptions.maxDPR               → 크기 조정 시 pr.maxDPR에 동기화
Scene.ts:398  SceneOptions.renderMode: 'always' | 'onDemand'
Scene.ts:1142 Scene.renderMode + DirtyTracker + RenderScheduler (maxFPS / autoThrottle)
Scene.ts:2284 전체 창 뷰포트 채택 (한 번) + disableWindowResize
Scene.ts:2781 clientToScene 뷰포트 매핑
```

- **`pointBackend` 대 `particleBackend`는 다른 기능이다** (`forge 2026-08-26`). `pointBackend: 'webgl'`은 글리프/스프라이트 쿼드를 배치하고; `particleBackend: 'webgpu'`는 `ComputeParticleEntity`를 위한 `WebGPUParticleSystemManager`를 구동한다. 단막용 WebGPU 글리프/MSDF 경로는 없으며; `particleBackend`을 뒤집어도 아무 일도 일어나지 않는다.
- **`WebGPUParticleSystemManager`는 정적을 통해 선택** (`forge 2026-08-02`): `Scene.registerWebGPUParticleSystemManager(...)`. 기본 `'auto'`에서 등록이 없으면 예외나 `console.warn`이 없으며 — CPU 대체가 실행되는 동안 `initWebGPUContext`는 여전히 사용되지 않는 스택 캔버스를 할당한다.
- **`renderMode: 'always'`** (기본)는 연속 `rAF` 루프를 구동하며; `autoThrottle`은 정적일 때 `idleFPS`로 낮춘다. **`'onDemand'`**는 `markDirty()` 또는 활성 애니메이션/물리 틱 이후에만 그린다. `render()` 자체는 무조건 렌더링한다 — `renderMode`는 루프 스케줄러(`Scene.ts:3405`)에만 영향을 준다.

## 알려진 함정 (`file:line` 포함)

| 함정                                                                                                          | 위치                                                                                     | 상태                                      |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------- |
| 짝수-홀수 채움 표현 불가 (`IRenderer.fill`이 `fillRule` 없음)                                                 | `IRenderer.ts:287`, forge 2026-07-18                                                     | 열림                                      |
| 그림자/광택 기본 요소 없음 (`shadowBlur` 부재; `ctx.filter` 블러 비용 지연)                                   | `IRenderer.ts:159` 힌트, forge 2026-07-18 / 2026-08-25                                   | 열림                                      |
| 배경 흐림/재질로 배경 샘플링 불가                                                                             | forge 2026-08-25                                                                         | 열림 (확장)                               |
| 글리프/텍스트 래스터 키가 DPR 생략 — DPR 변경 후 오래된 밀도 비트맵                                           | `GlyphRasterAtlas.ts:174`, `TextRasterCache.ts:88`, forge 2026-08-25                     | 열림 (계약=호출자가 아틀라스 교체해야 함) |
| `WebGPUParticleSystemManager`는 `Scene.register…` 정적 필요; `'auto'`에서 무음 CPU 대체                       | `Scene.ts:256` 등록 게이트, forge 2026-08-02                                             | 열림                                      |
| CPU 대 GPU 입자 좌표 공간 불일치 (창 대 로컬)                                                                 | `WebGPUParticleSystemManager.ts:310`, `ComputeParticleEntity.ts`, forge 2026-08-02 관련  | 앱 측 보상                                |
| 백업 저장소가 클램핑된 `appliedDPR` 대신 창 DPR로 크기 지정                                                   | `CanvasRenderer.ts:244`, `ThreeRenderer.ts:318`, `SplineEntity.ts:504`                   | 수정                                      |
| `resize`가 컨텍스트 재설정 후 폰트/채움 캐시를 오래된 상태로 남김                                             | `CanvasRenderer.ts:258`, forge 2026-08-13 `CanvasRenderer.resize`                        | #463 수정                                 |
| `flush`가 캐시 업데이트 없이 `fillStyle`/`globalAlpha` 변경                                                   | `CanvasRenderer.ts:414`, forge 2026-08-13                                                | #469 수정                                 |
| `parseColorToRGBA`가 잘못된 입력 시 이전 파싱 반환                                                            | `renderer/colorParse.ts:60`, forge 2026-08-13                                            | #492 수정                                 |
| `SplineEntity.bake`가 원시 `window.devicePixelRatio` 사용                                                     | `SplineEntity.ts:433` 수정 전, forge 2026-08-13                                          | #492 수정                                 |
| `WebGLPointRenderer.setTexture`가 배치 플러시 누락                                                            | `WebGLPointRenderer.ts:974`, forge 2026-08-13                                            | #520 수정                                 |
| `ThreeRenderer.fillText`가 무게를 크기로 파싱; 기준선이 `fontSize/2`만큼 어긋남                               | `ThreeRenderer.ts:274`, `:831`, forge 2026-08-13 / #486                                  | #511 수정                                 |
| 미러 직교가 `FrontSide` 채움/원/그라디언트/이미지 제거                                                        | `ThreeRenderer.ts:250`, forge 2026-08-13                                                 | #519 수정                                 |
| `drawImage`가 y-하향 카메라에서 수직 반전 (`flipY = true`)                                                    | `ThreeRenderer.ts:478`, forge 2026-08-23 #603                                            | #613 수정                                 |
| 헤어라인 스트로크 (`LineBasicMaterial.linewidth` 무시); DPR 무시; GL 컨텍스트 누수; 그라디언트 >8 스톱 리샘플 | `ThreeRenderer.ts:110` 리본, `:307`, `ThreeRenderer.ts:1044` 폐기, forge 2026-08-23 #604 | #623 수정                                 |
| `getBounds()`가 스트로크 제외 → 제거가 `strokeWidth/2` 클리핑                                                 | `Circle.ts:67`, `Rect.ts:54`, forge 2026-08-08                                           | 2.18.3 수정                               |
| `getBounds()` `-0` 아티팩트가 테스트에 고정                                                                   | forge 2026-08-08 `-0` 항목                                                               | 2.18.3 수정                               |

## 렌더러 변경 전 체크리스트

1. **`window.devicePixelRatio`가 아닌 `pixelRatio`를 읽으라.** 블릿할 텍스처를 래스터화한다면 캐시를 `renderer.pixelRatio`로 키 지정하고 `resize` 후 재래스터화하라.
2. **DoubleSide와 반전 해제.** y-하향 직교 아래 모든 `Mesh`/`PlaneGeometry`는 `side: DoubleSide`와 `texture.flipY = false` (`ThreeRenderer.ts:596`, `:478`)가 필요하다.
3. **플러시 인식 캐시.** `fillStyle`이나 `globalAlpha`를 변경하는 모든 경로는 해당 캐시를 업데이트해야 한다; 컨텍스트를 재설정하는 것은 이를 삭제해야 한다 (`CanvasRenderer.ts:258`).
4. **배치를 존중하라.** 같은 스타일 `fillCircle`이 합쳐지길 원하면 비배치 드로우 사이에 끼워 넣지 마라; 가위/텍스처/알파 변경 전에 `flush()`하라.
5. **클립은 세 곳이 있다.** 페인트용 렌더러 `clip()`, 히트/접근성/콘텐츠용 `clipChildren` (`Scene.ts:254`, `:4335`), 가상화용 뷰포트 밴드. 다른 두 곳을 감사하지 않고 하나를 변경하면 버그다.
6. **실제 DPR에서 프로파일하라.** `maxDPR: 2`는 스트로크가 많은 패스의 성능 보장이 아니다 — 실제 하드웨어에서 네이티브 DPR로 `benchmarks/run-browsers.sh`(양 엔진, 헤드)로 측정하라.

## 관계

- **Boss 03 (투영 & 가상화)**는 이 보스의 제거가 반영하는 `clipChildren`과 `projectionBoxVisible` / 콘텐츠 계층 정책을 소유한다.
- **Boss 06 (VMT 런타임)**은 `Scene.render`, `RenderScheduler` / `DirtyTracker` 정책, 모든 렌더러가 소비하는 `worldMatrix`를 소유한다.
- **Boss 02 (텍스트/레이아웃)**는 이 보스가 래스터화하는 메트릭을 소유한다. **Boss 09 (Three/XR)**는 이 문서의 모든 함정을 재사용한다 — 리본 스트로크, 가위 클립, DPR, DoubleSide가 시작 키트다. **Boss 08 (WASM)**은 동일한 `Scene` 뷰포트와 DPR 값을 재사용한다; 메모리 증가를 가로지르는 오래된 타입 배열 뷰는 다음 보스의 오래된 래스터 캐시 버전이다.
