+++
title = "12 — 개발 도구 — 런타임 검사 및 감사"
description = "캔버스에 Elements 패널이 없는 이유, VMT 검사기가 상태 공간에서 이를 대체하는 방식, 그리고 헤드리스 모델 계층 — 피킹, 기하학 읽기, 감사, 스냅샷, 히트 설명, 더티 프레임 귀속 및 브리지/플러그인 프로토콜."
weight = 32
+++

# 12 — 개발 도구 — 런타임 검사 및 감사

> `<canvas>`에는 Elements 패널이 없다. 브라우저는 픽셀과 DOM 미러를 보여줄 수 있지만, 어떤 픽셀을 그릴지 어떤 미러를 유지할지를 결정한 Virtual Math Tree는 보여주지 못한다. DevTools가 그 패널이다 — VectoJS 씬 디버깅이 픽셀이 아닌 숫자로 유지되도록 하는 상태 공간 검사기.

- **배울 내용**: VectoJS가 자체 검사기를 필요로 하는 이유, 패널이 검사된 씬의 방해 없이 유지되는 방식, 헤드리스 모델 계층의 모든 순수 함수 — 트리 모델, 피킹, 엔티티/접근성/텍스트 읽기, 7가지 기하학 계층, 레이아웃/접근성/텍스트/선택/GPU/가속기 감사, 스냅샷/차이, 히트 설명, 이벤트 추적, 더티 프레임 진단, 플러그인 프로토콜이 있는 JSON-RPC 브리지.
- **배우지 않을 내용**: `Scene`이 프레임을 스케줄하는 방식(boss 06), 렌더러가 그리는 방식(boss 07), WASM이 가속하는 방식(boss 08). 이 문서는 그 하위 시스템을 변경하지 않고 _읽는_ 도구다.

## 1. 스크린샷 전에 숫자가 필요한 이유

스크린샷은 "뭔가 잘못됐다"고 답한다. 숫자는 _어떤 엔티티_가 잘못됐고, _몇 픽셀_만큼 잘못됐고, _엔진이 왜 맞다고 생각했는지_ 답한다. 전체 DevTools 패키지(`packages/devtools/src/`)는 그 사다리 주위로 구성된다:

1. **위치** — 어떤 엔티티가 픽셀을 소유하는지(`pickInScene`)와 트리에서 어디에 있는지(`buildTreeModel`, `entityPath`).
2. **측정** — 세계 단위(`inspectEntity`)와 발산할 수 있는 모든 상자(`highlightGeometry`)의 기하학, 변환, 월드 경계.
3. **설명** — 엔진이 예상 엔티티가 아닌 그 엔티티를 선택한 이유(`explainHitTest`), 브라우저 이벤트가 실제로 어디에 도착했는지(`createEventTrace`).
4. **감사** — 눈에는 괜찮아 보이지만 구조적 불변 조건을 위반하는 엔티티가 있는지(`auditScene`, `auditA11y`, `auditTextShaping`).
5. **차이** — 무작위 ID가 아닌 안정된 경로로 주소 지정된 두 상태 간 변경(`captureSnapshot` / `diffSnapshots`).
6. **귀속** — `onDemand` 씬이 절대 유휴하지 않는 이유와 렌더 루프의 실제 비용(`diagnoseDirty`, `Scene.frameStats` `packages/core/src/tree/Scene.ts:3515`).

각 단계는 픽셀이 아닌 평문 데이터를 반환한다. 이것이 모든 검사를 CI 게이트로 만든다: `expect(auditScene(scene)).toEqual([])` (`vectojs-docs/content/reference/devtools-audit.md:12`).

## 2. 두 표면, 하나의 모델 계층

| 표면                            | 진입                                     | 렌더링                                                                                                      | `destroy()` 필요                                                                                                               | 프로덕션으로 출하                                              |
| ------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| DevTools 패널(`devtools-panel`) | `packages/devtools/src/panel/panel.ts`   | React 기반 검사기 UI                                                                                        | `panel.destroy()` (`packages/devtools/src/panel/panel.ts:89`) — `document.body`에서 제거, `MutationObserver` 정리, 브리지 정리 | `packages/devtools/src/build.ts`를 통한 별도 번들              |
| 헤드리스 모델 (`model`)         | `packages/devtools/src/model/`           | JSON-RPC 브리지(`bridge.ts`); `buildTreeModel`, `inspectEntity`, `auditScene`, `explainHitTest` — 순수 함수 | 없음 — 상태 없음                                                                                                               | `packages/devtools/src/model/index.ts`를 통해 코어와 함께 출하 |
| 브리지 (`bridge`)               | `packages/devtools/src/bridge/bridge.ts` | `postMessage` 기반 JSON-RPC; `registerPlugin`(`plugin-protocol.md`)                                         | `bridge.dispose()` — 리스너 제거                                                                                               | 패널과 함께만 사용; 모델은 직접 호출 가능                      |

패널은 검사된 씬의 방식 밖에 유지된다: `panel.ts:56`은 `MutationObserver`를 사용하여 `scene` 노드의 추가/제거를 추적하지만 `entity.dispatchEvent()`를 가로채지 않는다. 모든 읽기는 모델 계층의 순수 함수(`inspectEntity`, `auditScene`)를 통과하며, 모델은 씬을 변경하지 않는다 — `entity.setDirty()`를 호출하지 않고 `entity.destroy()`를 호출하지 않는다.

## 3. 검사기 기능

- **피킹** (`model/pick.ts`): `pickInScene(scene, x, y)`는 `HitTester.findEntityAt()`(`HitTester.ts:121`)를 사용하여 엔티티를 찾고 `entityPath()`로 부모 경로를 반환한다.
- **기하학** (`model/geometry.ts`): `inspectEntity(entity)`는 `entity.getBounds()`, `getWorldTransform()`, `getWorldBounds()`를 반환하고, `highlightGeometry()`는 7가지 기하학 계층(로컬, 월드, AABB, 클립, 히트, 텍스트, 투영)을 강조한다.
- **감사** (`model/audit.ts`): `auditScene()`는 구조(사이클, 고아, 중복 ID), 더티(무한 재무장), 라이프사이클(`destroyed` 보호), 접근성(미러 누락, `pointerEvents` 충돌)을 검사한다. `auditA11y()`는 `getA11yTree()`와 `a11yAttributes`를 비교한다.
- **스냅샷** (`model/snapshot.ts`): `captureSnapshot()`는 `Scene.getA11yTree()`와 엔티티 상태의 직렬화된 버전을 반환한다; `diffSnapshots()`는 안정된 경로로 주소 지정된 차이를 반환한다.
- **히트 설명** (`model/hit-explain.ts`): `explainHitTest(x, y)`는 `findHitRecursively()`(`HitTester.ts:227`)와 `isHitEligible()`(`HitTester.ts:326`)의 각 게이트를 반환하여 엔진이 예상 엔티티가 아닌 그 엔티티를 선택한 이유를 설명한다.
- **이벤트 추적** (`model/event-trace.ts`): `createEventTrace(event)`는 `dispatchEvent()`(`Entity.ts:1610`)의 캡처/버블 경로와 각 노드의 리스너를 반환한다.
- **더티 진단** (`model/dirty.ts`): `diagnoseDirty()`는 `scene.dirtyReasons`(`Scene.ts:3489`)와 `frameStats.dirty`(`Scene.ts:3528`)를 읽고 `onDemand` 씬이 깨어 있게 하는 `reason`을 반환한다.

## 4. 브리지와 플러그인 프로토콜

브리지는 `packages/devtools/src/bridge/plugin-protocol.md:23`에 정의된 JSON-RPC 2.0을 사용한다. 플러그인은 `registerPlugin(name, methods)`(`plugin-protocol.md:45`)를 통해 등록되며, `postMessage`를 통해 `method`, `params`, `id`를 포함한 메시지를 받는다. 각 메서드는 `Promise<Result>`를 반환하며, 오류는 `code`와 `message`를 포함한 `{ error: { code, message } }`로 반환된다.

패널은 `packages/devtools/src/panel/plugin-host.ts:67`에서 플러그인 호스트를 관리하며, `pluginHost.loadPlugin(url)`을 통해 플러그인을 로드하고 `pluginHost.invoke(method, params)`를 통해 호출한다. 플러그인은 `destroy()`를 구현해야 하며(`plugin-protocol.md:89`), 그렇지 않으면 `pluginHost.dispose()`가 경고를 출력한다.
