+++
title = "06 — VMT Runtime — 라이프사이클 / 더티 / 이벤트"
description = "Virtual Math Tree 런타임: 엔티티 라이프사이클, 더티/무효화 세분화, 월드 행렬 합성, 캡처/버블 이벤트 디스패치 — 세 가지 불변 조건을 깨는 조상 탐색과 라이프사이클 누수 함정."
weight = 26
+++

# 06 — VMT Runtime — 라이프사이클 / 더티 / 이벤트

> Virtual Math Tree는 렌더링하는 씬 그래프가 아니다. 매 프레임마다 변환을 다시 합성하고, 무엇이 더러운지 결정하며, 보이지 않는 것을 제거하고, 상호작용 가능한 것을 히트 테스트한 후에야 그린다. DOM은 투영이며, 캔버스가 진실이다. 이 문서는 그 진실을 일관되게 유지하는 제어 루프다.

## 1. 한 장의 그림으로 보는 VMT 파이프라인

```text
                    Entity tree               packages/core/src/tree/Entity.ts:782
                    (Scene.root)              Scene이 root + overlayRoot를 보유, 재할당 없음
                         │
                         │  add/remove/reparent  Entity.ts:1065 add / :1117 remove
                         │  structureVersion++   Scene.ts:3462 structureVersion
                         ▼
               ┌─────────────────────┐
               │  Dirty propagation  │   DirtyTracker  scene/DirtyTracker.ts:70
               │  markDirty / clear  │   dirty:boolean  Scene.ts:534
               └─────────┬───────────┘   consumed BEFORE update  Scene.ts:5646
                         │
                         ▼
               ┌─────────────────────┐
               │ Transform gather    │   getWorldTransform  Entity.ts:1668
               │ T·S·R compose       │   _worldFrame cache  Entity.ts:845 / :1668 fast path
               │ per-frame cache     │   currentFrame++     Scene.ts:5806 (O(1) 무효화)
               │ WASM SoA store (G1) │   _storeSlot         Entity.ts:865 / WasmBackendFacade.ts:30
               └─────────┬───────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
     ┌────────────────┐   ┌──────────────────┐
     │ Layout         │   │ Hit test         │   HitTester  scene/HitTester.ts:17
     │ LayoutEngine   │   │ findEntityAt     │   :121 JS walk fallback
     │ measurePrepared│   │ isHitEligible    │   :326 clip + opacity + pointerEvents
     │ layoutPrepared │   │ WASM grid        │   :144 ensureHitGrid / :185 fused gather
     └───────┬────────┘   └────────┬─────────┘
             │                     │  pointer capture  Scene.ts:3851 setPointerCapture
             └──────────┬──────────┘   capture/bubble  Entity.ts:1610 dispatchEvent
                        ▼
              ┌───────────────────┐
              │ Render walk       │   Scene.ts:5730 render / :5569 loop
              │ cull → paint      │   renderMode always/onDemand  Scene.ts:401
              │ a11y sync after   │   syncA11y deferred when animating
              └───────────────────┘
                        │
                        ▼
                   Pixels + DOM mirrors
```

인과 순서는 고정되어 있다 — `Scene.ts:5745`가 이를 정확성 계약으로 문서화한다 — 물리적 탐색이 융합될 수 있음에도 불구하고. JS 경로는 사전 순회로 노드당 `update → compose → cull → paint`를 교차 실행하고, WASM 경로는 전체 트리를 업데이트한 후 같은 제거/그리기 탐색 전에 SoA 패스로 한 번에 수집하고 합성한다. 두 경로 모두 동일한 프레임 내에서 `update()` 변경을 노출해야 한다.

## 2. 라이프사이클 — 생성 / 추가 / 제거 / 파괴

### 2.1 엔티티 형태

`Entity` (`Entity.ts:782`)는 `abstract`다. 모든 인스턴스는 다음을 갖는다:

- `id: string` — 생략 시 무작위 `entity_<7>` (`Entity.ts:1055` 생성자).
- `parent: Entity | null` (`:791`), `children: Entity[]` (`:790`). 부모가 유일한 소유 링크다.
- `scene` getter (`:796`) — `parent`를 따라 실제 소유자까지 탐색한다. 엔티티 자체에는 저장되지 않으며 Scene의 `_scene` 탈출 해치 외에는 예외다.
- 로컬 변환: `_x/_y/_scaleX/_scaleY/_rotation/_opacity` (`:805`), `_hasTransitions` 빠른 경로 플래그 (`:812`) — 수동 엔티티의 `x = v`는 한 불리언 검사 + 필드 쓰기다.
- 지연 할당 `Map`: `_drivers`, `listeners`, `captureListeners` (`:819`) — 첫 사용까지 `null`. 2만 개 입자의 씬은 이를 할당하지 않는다.
- `_mounted: boolean` (`:816`), `_destroyed: boolean` (`:817`), `_driversTickedFrame: number` (`:828`, 초기 `-1`).
- 월드 행렬 캐시 `_wa.._wf / _worldFrame` (`:845`) 및 WASM 슬롯 `_storeSlot: number` (`:865`, 저장소에 없으면 `-1`).

하위 클래스는 `getBounds()`, `drawSelf()`, `getContentProjection()`, `update()`, `onMounted()`, `destroy()`를 오버라이드한다.

### 2.2 add — 사이클 보호 및 구조 무효화와 함께 연결

`Entity.add(...children)` (`:1065`)는 `_addOne` (`:1075`)으로 전달된다:

1. 사이클 보호 — `child === this`는 예외를 던진다. `this.parent` 체인을 탐색하여 조상 일치를 확인한다 (`:1080`). O(깊이), 추가는 프레임당 작업 대비 드물다.
2. 기존 부모에서 분리 — `child.parent`이 설정되어 있으면 `child.parent.remove(child)`를 실행하여 재부모화가 중복되지 않도록 한다.
3. `child.parent = this; this.children.push(child)` — O(1) 꼬리 추가.
4. `this.scene`이 존재하면 (활성 트리):
   - `s.a11yNeedsReorder = true`
   - `s.markStructureChanged()` — `structureVersion` 증가, WASM 변환 저장소 레이아웃 무효화 (`Scene.ts:1625` `_storeStructureVersion`).
   - `s.markDirty({ entity: this.id, reason: 'child-added' })` (`:1086`).
   - `child._notifyMounted()` (`:1087`) — `_mounted`로 보호된 깊이 우선 `onMounted()`로 재연결된 하위 트리가 한 번만 발화한다.
   - `s._registerActiveDriverSubtree(child)` — 분리 시 대기 중이던 배치 드라이버를 하위 트리에서 재개한다 (`remove`의 등록 해제의 거울).

여러 자식 (`add(a,b,c)`)은 인수 순서로 동일한 의미를 갖고 연결된다.

### 2.3 remove — 드라이버 등록 해제와 함께 분리

`Entity.remove(child)` (`:1117`)는 `indexOf` + `splice`다:

1. `child.parent = null`.
2. `s.detachA11y(child)` + `a11yNeedsReorder`.
3. `s.markStructureChanged()` + `markDirty({ reason: 'child-removed' })` (`:1123`).
4. `s._unregisterActiveDriverSubtree(child)` — 오프 트리 하위 트리를 `DriverTicker.active`에서 제거하여 드라이버가 틱을 멈추고 엔티티를 고정하지 않도록 한다. `_addOne`의 거울이 정착 전에 재연결되면 이를 재개한다.

비자식 제거는 무효 연산이다 (이 객체를 반환). `removeAll()`은 없으며 — 반복하거나 `destroy()`하라.

### 2.4 destroy — 잎 우선 재귀적 해체

`Entity.destroy()` (`:1525`) — `_destroyed` 보호로 멱등원:

```ts
while (this.children.length > 0) this.children.at(-1)!.destroy();
animations = null;
for (const d of this._drivers.values()) this._settleDriver(d); // animateTo 약속 해결
this._drivers.clear();
listeners.clear();
captureListeners.clear();
if (this.parent) this.parent.remove(this);
```

- 잎 우선 (꼬리에서 파괴)으로 각 자식의 `parent.remove(this)`가 반복 중인 꼬리를 변경하므로 — 스냅샷이 없고 인덱스 왜곡이 없다.
- GPU/DOM 리소스를 소유한 하위 클래스는 이를 해제한 후 `super.destroy()`를 호출한다 (`ComputeParticleEntity.ts:419`, `DOMPortalEntity.ts:142`).
- `_settleDriver` (`:1329`)를 통한 약속 해결이 `animateTo`/`springTo` 호출자를 영원히 멈추지 않도록 한다.

`Scene.destroy()` (`Scene.ts:2957`)는 씬 수준 쌍을 추가한다:

- 보호 `if (destroyed) return` (`:2958`), `destroyed = true` 설정.
- `while (root.children.length) destroyEntitySubtree(root.children.at(-1)!)`과 `overlayRoot` (`:2964`)에 대해 동일하게, 각각 `entity.destroy()` (`:2951`)로 위임.
- `pointRenderer`, `WebGPU device/manager`, `ResizeObserver`, DPR 감시, 포인터 리스너(`pointerEventTarget`에서 분리), `a11yRoot`/`portalRoot` 해체, `keydownHandlers/shortcuts` 지우기.
- 멱등원 — `destroyed`일 때 `start()`는 조기 반환 (`:3143`), WebGPU 장치 복구는 `if (destroyed) newDevice.destroy()` (`:5813`)를 확인한다.

파괴된 엔티티는 다시 추가되지 않아야 한다 — `_destroyed` 플래그는 추가 `destroy()`를 무효로 만들지만 `parent`는 이미 `null`이고 자식은 사라진 상태다.

## 3. 더티 / 무효화 세분화

### 3.1 불리언 플래그와 그 귀속

`Scene.dirty: boolean` (`Scene.ts:534`)이 유일한 스케줄링 신호다. `onDemand`는 `!dirty && !frameHadAnimation && !contentSemanticDeferred` (`Scene.ts:5594` `isIdle`)일 때 렌더링을 건너뛰고; `always`는 `autoThrottle`이 `idleFPS`로 떨어지지 않는 한 모든 `rAF`를 렌더링한다.

소유권은 `DirtyTracker.ts:2` 헤더에 따라 분할된다:

- `DirtyTracker` (`scene/DirtyTracker.ts:70`)가 플래그(`isDirty`), 선택적 귀속 맵, FIFO 한계(`MAX_DIRTY_REASONS = 200`, `:71`)를 소유한다.
- `Scene.markDirty(source?)` (`Scene.ts:3443`)는 정확한 이름/서명을 유지하며 `_dirty.mark(source, currentFrame)`으로 위임한다 — `Entity.ts`의 129개 호출 사이트가 `scene.markDirty()` (`DirtyTracker.ts:33`)에 의존한다.
- `Scene._dirty: DirtyTracker` (`Scene.ts:1220`)는 비공개 getter/setter (`:1229`)를 갖는다 — `set dirty(true)`는 `mark(undefined, currentFrame)`, `set dirty(false)`는 `clear()`를 호출한다.

빠른 경로 비용 (`DirtyTracker.ts:47`): `tracking`이 꺼져 있으면 `mark()`는 한 필드 쓰기(`isDirty = true`)와 이미 거짓인 한 분기뿐이다. `record()`는 별도 메서드이므로 V8이 한 필드 버전을 인라인할 수 있다.

### 3.2 플래그가 설정되는 시점과 소비되는 시점

**설정** — 수십 개의 사이트, 각각 귀속용 `reason` 문자열과 함께:

- `Entity.add` → `child-added` (`:1086`), `remove` → `child-removed` (`:1123`), `animate` → `animation-start`, `_spawnDriver` → `driver-added` (`:1305`), `tickDrivers` → `driver-tick` (`:1389`), `ComputeParticleEntity` → 입자 변경당 `markDirty()` (`ComputeParticleEntity.ts:113`).
- `Scene` 자체: 스타일 변경, 크기 조정, 폰트 로드 (`:2717`), 접근성 재정렬 (`:3674`), 스크롤 (`:3931`).

**소비** — `Scene.loop` (`:5569`)는 `update/render` 통과 **전에** (`:5650`) `this.dirty = false`를 수행한다. `entity.update()` 내의 `markDirty()`는 다음 프레임으로 살아남는다; 렌더 후 지우면 자체 애니메이션 재무장을 지우고 엔티티를 멈춘다 (`DirtyTracker.ts:98`). `Scene.step(dt)` (`:3420`)는 예외 — 결정성이 목적이므로 렌더링 모드/더티/`maxFPS`를 무시하고 무조건 렌더링하며 (`DirtyTracker.ts:33` 계약) 이후 (`:3434`) 지운다.

### 3.3 귀속 — `onDemand` 씬을 깨어 있게 하는 것을 찾기

기본적으로 꺼져 있다. `scene.setDirtyTracking(true)` (`Scene.ts:3475`)로 활성화한 후 `scene.dirtyReasons: DirtyReasonEntry[]` (`:3489`, 가장 빈번한 순으로 정렬)을 읽는다. 각 항목은 `{ entity?, reason, property?, count, firstFrame, lastFrame }` (`DirtyTracker.ts:59`)이다. 키는 `entity:reason.property` (`:120`)다. FIFO로 제한 — 200에서 가장 오래된 항목이 삭제된다 (`:127`). `scene.clearDirtyReasons()` (`:3495`)로 지운다. 이전에는 "더티가 참이지만 이유를 모른다"이던 `onDemand` 진단이 이제 정렬된 테이블이 되었다.

`structureVersion` (`Scene.ts:3462`, `_structureVersion` `:1636`로 지원)은 동반 신호다: 추가/제거/재부모화는 이를 증가시키고, 속성 변경은 그렇지 않는다. 트리 형태의 캐시는 이 값이 변경되지 않는 동안 정확히 유효하다 — O(1) 대 재탐색.

## 4. 월드 행렬 합성

### 4.1 아핀 변환과 그 캐시

`AffineTransform { a,b,c,d,e,f }` (`Entity.ts:33`)는 `CanvasRenderingContext2D`와 일치한다 — 노드당 `T * S * R`, 6개의 스칼라.

`getWorldTransform(): AffineTransform` (`Entity.ts:1668`)는 두 경로를 갖는다:

**빠른 경로** — 씬의 렌더링 탐색이 작성한 프레임당 캐시 (`_setWorldCache` `:1784`, `_wa.._wf` 및 `_worldFrame` 스탬프). `_worldFrame === scene.currentFrame` (`:1672`)이면 반환된 객체 외에 추가 할당 없이 6개의 스칼라를 그대로 반환한다. 오래된 캐시(이 프레임에 렌더링되지 않은 엔티티, 또는 프레임 사이에 쿼리된 경우)는 확인에 실패하고 통과한다. 캐시는 작업을 건너뛸 수만 있고 잘못된 행렬은 반환하지 못한다.

**권위 있는 탐색** — `this`에서 실제 루트(`parent === null`, `id === 'root'`이 아닌 — 사용자가 설정 가능, `:1690`)까지 `path: Entity[]`를 구성한 후 루트→자신으로 합성:

```ts
for (let i = path.length - 1; i >= 0; i--) {
  const { cos, sin } = node._getTrig(); // 캐시, :1746
  const la = scaleX * cos,
    lb = scaleY * sin,
    lc = -scaleX * sin,
    ld = scaleY * cos;
  const le = x,
    lf = y;
  nextA = a * la + c * lb;
  nextB = b * la + d * lb;
  nextC = a * lc + c * ld;
  nextD = b * lc + d * ld;
  nextE = a * le + c * lf + e;
  nextF = b * le + d * lf + f;
}
```

`_getTrig()` (`:1746`)는 `{cos, sin}` 쌍을 캐시하고 `rotation`이 변경된 경우(`_trigRotation` 확인)에만 재계산한다 — V8의 `Math.cos/sin`은 다른 엔진보다 약 2.5배 느리며, 이는 엔티티당 프레임당 비용이다. `_readWorldCache(frame, out)` (`:1647`)는 엔티티당 수집용(예: G3의 `gatherHitAABBs`) 제로 할당 형제 — 엔티티당 객체 하나 대신 호출자 소유 `out`으로 6개의 스칼라 읽기다.

무효화는 O(1)이다: `Scene.render`는 권위 있는 탐색 시작 시 `currentFrame++` (`:5806`)를 증가시키므로 엔티티를 건드리지 않고 한 증분으로 모든 엔티티의 캐시를 무효화한다.

### 4.2 WASM G1 경로 — SoA 변환 저장소

변환 백엔드가 활성(`transformBackend: 'wasm'` / 모듈이 로드된 `'auto'`)일 때 `Scene`은 상주 SoA 저장소(`WasmBackendFacade.ts:228` `structureVersion`, `scene-store.ts:buildTreeStore`)를 유지한다. `markStructureChanged` 시 저장소는 토폴로지(부모 인덱스, 슬롯 할당)를 재구축한다. 각 `Entity._storeSlot` (`:865`)은 그때 할당되고 슬롯 테이블과 대조하여 신뢰하기 전에 검증된다. 프레임당 `ensureAabbs()`는 SoA 버퍼에 대한 한 WASM 패스로 모든 월드 행렬을 합성한다 — JS 탐색과 동일한 `T·S·R` 수학, 비트 동일. 히트 테스트 융합 수집(`HitTester.ts:144`)은 `transform.aabbView()`가 사용 가능할 때 선호하며, `getWorldTransform()`을 엔티티당 호출하는 JS `gatherHitAABBs` (`wasm/hit-store.ts:47`)로 대체한다. 오래된 `_storeSlot`은 느리지만 정확한 JS 대체만 비용을 치르며 잘못된 읽기는 절대 아니다.

### 4.3 파생 쿼리

- `localToWorld(x,y)` (`:1784`) / `worldToLocal(x,y)` (`:1796`) — 월드 행렬 적용/역변환; `worldToLocal`은 특이 행렬(`|det| < 1e-12`)에서 `null`을 반환한다.
- `getWorldBounds()` (`:1819`) — `getBounds() ?? {x:0,y:0,width,height}`를 네 모서리로 변환하여 제거 및 히트 그리드 입력에 사용되는 월드 AABB를 생성한다.
- `getWorldScale()` (`:1850`) — 부모 체인을 따라 `scaleX/scaleY`를 곱한다(회전 무시 — 히트 테스트 역변환용).

## 5. 이벤트 디스패치 — 캡처 / 버블 및 포인터 소유

### 5.1 VectoJSEvent

`VectoJSEvent<N>` (`Entity.ts:607`)은 DOM 표면을 반영한다: `type: VectoEvent` (`:538`, `click | dblclick | hover | pointerdown/up/move/cancel/leave | wheel | keydown/keyup | scroll | change | ...`), `target: Entity`, `currentTarget: Entity`(디스패치 중 노드당 설정), `nativeEvent: N | undefined`, `bubbles: boolean`(기본 `true`; `hover`/`pointerleave`는 `false`), 그리고 `stopPropagation()`, `stopImmediatePropagation()`, `preventDefault()`, 전달된 `clientX/Y`, `sceneX/Y`, `localX/Y`, `deltaX/Y`, `key/shiftKey/ctrlKey/altKey/metaKey`.

### 5.2 등록

`Entity.on(event, cb, { capture })` (`:1470`) 및 `off(event, cb, { capture })` (`:1485`):

- 두 개의 지연 할당 맵: `listeners`(버블) 및 `captureListeners` (`:1030`), 각각 `Map<VectoEvent, Array<cb>>`.
- `capture: true`는 `captureListeners`에 등록한다; 기본은 버블이다. `off`는 단계가 일치해야 한다.
- `emit(event, payload)` (`:1540`)는 직접 자체 전용 경로(버블 리스너만, 전파 없음) — 컴포넌트 내부 `change` 이벤트용. `dispatchEvent`는 트리 경로다.

### 5.3 디스패치 — 캡처 후 버블

`Entity.dispatchEvent(event)` (`:1610`):

1. `parent` 체인을 통해 `path: Entity[]` target→root를 구성한다.
2. 캡처: root→target (`for i = path.length-1 .. 0`)으로 `captureListeners` (`:1618`) 발화. 각 노드 전에 `propagationStopped` 확인.
3. 버블: target→root (`for i = 0 .. path.length-1`)로 `listeners` (`:1622`) 발화. 대상 이후 `if (!event.bubbles) return` — 버블하지 않는 이벤트는 캡처는 실행하지만 대상의 버블만 실행한다.
4. `fireListeners(node, map, event)` (`:1595`)는 디스패치 중간에 핸들러가 리스너 추가/제거를 방해하지 않도록 `handlers.slice()`를 스냅샷하고 `immediatePropagationStopped`를 존중한다.

씬의 접근성 투영은 네이티브 DOM 이벤트를 이 트리로 연결한다: `Scene.ts:3802`의 미러별 리스너(`click`, `dblclick`, `pointerdown/up/cancel/move`, `wheel`, `keydown/keyup`)는 각각 `node.dispatchEvent(new VectoJSEvent(type, node, nativeEvent))`를 수행한다. `scroll` (`:3912`)은 특별하다 — DOM에서 버블하지 않으므로 씬이 `node.emit('scroll', { scrollTop, scrollLeft, ... })` (`:3920`)를 직접 소유 엔티티로 수행한다.

씬 수준 키보드(`Scene.ts:3272` `on('keydown'|'keyup')`)는 별도의 채널 — 엔티티 대상 없음, `stopPropagation()`은 네이티브 이벤트로 전달(`scene/keyboard.ts:79`), `registerShortcut(chord, handler)`는 `keydown`에서만 일치한다.

### 5.4 포인터 소유

섀도 요소의 `pointerdown`이 포인터를 캡처한다 (`Scene.ts:3851`):

```ts
if (e.target === capEl && typeof capEl.setPointerCapture === 'function')
  capEl.setPointerCapture(e.pointerId);
```

`e.target === capEl` 보호는 부하를 견딘다: 대상이 자손인 버블된 `pointerdown`은 재캡처하지 않아야 한다 — 자손이 이미 소유하고 있으며 조상이 재정의하면 `pointerup` + `click`이 공통 조상으로 재대상된다(옵션이 목록 상자 컨테이너에 클릭이 착륙한 Dropdown 옵션으로 측정됨, `Scene.ts:3844`). `pointerup`/`pointercancel`은 `hasPointerCapture(pointerId)`로 보호되고 `NotFoundError` DOMException을 잡는 `releasePointer` (`:3831`)를 통해 해제된다. `pointerEvents: 'none'` (`Entity.ts:431` `a11yAttributes.pointerEvents`)는 자식에 영향을 주지 않고 노드가 히트 테스트에서 제외되도록 한다 — §6.3 참조.

## 6. 히트 테스트 — 일치해야 하는 두 경로

`Scene.findEntityAt(x, y)` (`Scene.ts:2777`)는 `HitTester.findEntityAt(x, y, currentFrame, width, height)` (`HitTester.ts:121`)로 위임된다:

1. 오버레이 루트 먼저 — 항상 `findHitRecursively` (오버레이는 적고 WASM 인덱싱되지 않음).
2. 메인 트리 — `backends.hit`과 `ensureHitGrid(frame, width, height)` (`:144`)이 성공하면 `findEntityAtWasm` (`:185`); 아니면 `findHitRecursively` (`:227`). WASM 경로는 결정적이다 — 정확한 엔티티 또는 `null`, "결론 없음"이 아니다 — 따라서 신뢰할 수 있는 그리드 이후 JS 대체는 없다.

`findHitRecursively(node, x, y, clip)` (`:227`):

- `opacity <= 0` 하위 트리 건너뜀 (누적 불투명도).
- `clipChildren`이 `intersectBounds` (`:32`)를 통해 `childClip`으로 교차 — 아래로 전달, 노드 자체는 들어오는 클립에 대해 여전히 테스트 가능.
- 자식은 역 그리기 순서 (최상위 우선).
- 노드는 `isPointInside(x,y) && isInsideAllClippers(node,x,y) && !isPointerTransparent(node)`일 때 히트된다.

`isInsideAllClippers` (`:284`)는 권위 있는 회전 인식 게이트다 — 모든 `clipChildren` 조상의 `worldToLocal(x,y)`이 `[0, width]×[0, height]` 내에 있어야 한다. 탐색의 AABB 클립 스택은 하위 트리 제거 사전 필터일 뿐이다; 두 히트 경로는 정확한 사각형을 다시 적용해야 하며, 그렇지 않으면 회전된 클리퍼가 백엔드별 다른 답변을 내놓는다 (#680).

`isHitEligible(node,x,y)` (`:326`, WASM 경로)는 동일한 게이팅을 평면으로 재적용한다: `!isPointerTransparent`, 노드와 모든 조상의 `opacity>0`, `isInsideAllClippers`. `isPointerTransparent` (`:284`)는 `attrs.disabled === true || attrs.pointerEvents === 'none'` (`Entity.ts:431`)다 — 투명 컨테이너의 자식은 여전히 탐색된다.

## 7. 렌더링 스케줄링 — 더티와 루프의 만남

`Scene.loop(time)` (`Scene.ts:5569`)은 `requestAnimationFrame`에서 실행된다:

1. `!_canvasOnScreen` (IntersectionObserver)일 때 탈출 — 숨겨진 동안의 `markDirty()`는 무해하며 플래그는 지속된다.
2. `isIdle = !dirty && !frameHadAnimation && !contentSemanticDeferred` (`:5594`) 계산 — `onDemand` 건너뜀과 `always` 자동 제한(`idleFPS`)을 모두 구동한다.
3. `effectiveMaxFPS()` (`:5556`) — `prefersReducedMotion`이 일치할 때 명시적 `maxFPS`를 `30`으로 낮춘다.
4. 프레임 속도 제한: `if (cap>0 && time - lastTime < 1000/cap -1) skip` (`:5605`).
5. 합성기 지터를 제거하기 위해 `dt`를 공칭 `1000/cap`으로 30% 내에서 맞춘다; 배경 탭 이후 스프링 폭발을 피하기 위해 `MAX_FRAME_DT`로 제한 (`:5630`).
6. `onDemand && isIdle → skip` (`:5640`).
7. `dirty = false` **`render()` 이전** (`:5650`) — §3.2 참조.
8. `render(renderer, dt, time)` (`:5730`) — `currentFrame` 증가, 배치 드라이버 틱(`_tickBatchedDrivers`), 입자 시뮬레이션 진행, 엔티티 탐색.
9. 렌더링 후 접근성/콘텐츠 투영 동기화 — `frameHadAnimation` 동안 완전히 건너뜀 (캔버스 루프의 DOM 리플로우 방지).

`Scene.step(dt)` (`Scene.ts:3420`)는 동기적 결정적 드라이버 (비디오 내보내기, 테스트, 벤치마크) — `renderMode`/`dirty`/`maxFPS`를 무시하고 무조건 렌더링하며 이후 `dirty`를 지운다. `step()`을 사용하는 벤치마크는 `onDemand` 건너뜀을 관찰할 수 없다 (`Scene.ts:3406` 문서).

## 8. 어려운 부분 — 영수증 포함

### 8.1 조상 탐색은 O(깊이)이고 많다

`getWorldTransform`, `getWorldScale`, `isInsideAllClippers`, `isHitEligible`, `dispatchEvent` 경로 구성, `Entity.scene` getter — 각각 `parent`를 루트까지 탐색한다. 깊이는 일반적으로 얕다(Stack → Card → RichText)이므로 호출당 O(깊이)는 저렴하지만, 히트 테스트와 렌더링 탐색이 엔티티당 프레임당 이를 호출한다. 세 가지 완화책:

- **프레임당 캐시** (`_worldFrame` / `currentFrame`, `:845`/`5806`) — O(1) 무효화, 렌더링 탐색이 이미 행렬을 스탬프한 경우 빠른 경로. `getWorldTransform`은 놓쳤을 때만 탐색으로 대체된다.
- **제로 할당 읽기** (`_readWorldCache`, `:1647`) — 엔티티당 객체 하나 대신 호출자 소유 객체로 6개의 스칼라 읽기. G2 통합 벤치마크는 엔티티당 클로저 할당이 실제 비용임을 확인했다 (`DriverTicker.ts:40` 헤더).
- **WASM SoA 저장소** (G1) — 엔티티당 탐색 대신 타입 배열에 대한 한 선형 패스; `ensureHitGrid` 융합 수집 (`HitTester.ts:144`)이 `transform.aabbView()`를 재사용하여 엔티티당 네 모서리 재도출을 피한다 (JS 수집은 100k 엔티티에서 11.2ms 대 39µs, 본질적으로 커널 앞의 모든 비용).

여전히 500깊이 체인을 삽입하고 `getWorldTransform`을 타이트 루프에서 호출하면 O(n·깊이)가 된다. 트리를 넓게, 깊지 않게 유지하라.

### 8.2 변환 비용 — cos/sin 함정

V8에서 `Math.cos/sin`은 소프트웨어 libm 호출로 다른 엔진보다 약 2.5배 느리다 (`Entity.ts:828` 헤더). `Entity._getTrig()` (`:1746`)는 쌍을 캐시하고 회전 변경 시에만 재계산한다; `getWorldTransform`과 렌더링 탐색이 모두 이를 읽는다. 없으면 회전하는 입자(Danmaku)가 많은 씬이 변경되지 않은 각도에 대해 엔티티당 프레임당 libm 비용을 지불한다. `_hasTransitions` 플래그 (`:812`)는 동일한 미세 최적화 클래스다 — 대부분의 엔티티는 애니메이션하지 않으므로 `x = v`는 전환/드라이버 맵을 건드리지 않아야 한다.

### 8.3 라이프사이클 누수 — 세 가지 반복

**드라이버 하위 트리 누수.** `DriverTicker.active: Set<Entity>` (`DriverTicker.ts:84`)는 배치 후보 집합이다. `Entity.add`는 하위 트리를 등록 (`:1087` 거울)하고 `remove`는 등록 해제 (`:1130`)한다. 호출이 누락되면 — 예: `add`/`remove` 대신 `children`을 직접 변경하는 사용자 컨테이너 — 드라이버가 오프 트리 상태로 매 프레임 틱을 계속하고 엔티티를 집합에 고정한다. 감사: `Entity.ts` 외부의 `\.children\.push|\.children\.splice`를 검색하라.

**파괴 보호.** `Entity.destroy()` (`:1525`)는 `_destroyed`를 먼저 설정한 후 재귀한다. 두 번째 `destroy()`는 무효; 자식의 `onMounted`나 드라이버의 `onDone`를 통해 재진입하는 `destroy()`는 플래그를 보고 멈춘다. `Scene.destroy()` (`:2957`)는 자식을 해체하기 전에 `destroyed`를 설정하고, 모든 비동기 콜백(WebGPU 장치 복구 `:5813`, `requestAnimationFrame` 루프 `:5569`)은 `if (destroyed) return/newDevice.destroy()`를 확인한다. 보호가 없으면 반쯤 해체된 씬이 부활하거나 SPA 경로 변경 간 GPU 장치가 누수된다.

**접근성 / 포털 누수.** `remove`는 `detachA11y(child)` (`:1117`)를 호출하고 `destroy`는 `A11yProjectionManager.ts:227`를 통해 `removeA11yRecursively`를 호출한다. 투영의 `contentSemanticBudget`과 `contentViewportEpoch`은 제거된 엔티티의 운반자/투영 상태가 `syncA11y` 탐색 간 유지되지 않도록 한다. `detachA11y`를 잊으면 투명한 섀도 요소가 포인터 이벤트를 계속 캡처하고 `getA11yTree()`에 나타난다.

### 8.4 렌더 스케줄러 분해 함정

`Scene.ts`는 약 6.5k 줄이다. 네 도메인이 변하는 프레임 상태를 공유하기 때문이다: `DirtyTracker` (`DirtyTracker.ts:70`), `DriverTicker` (`DriverTicker.ts:57`), `HitTester` (`HitTester.ts:17`), `WasmBackendFacade` (`WasmBackendFacade.ts:1`)는 `forge/decisions/file-decomposition-2026-08.md`에 따라 추출되었지만, `loop`/`render`와 `a11yRoot`/`canvas` 기하학은 Scene에 남아 있다. `Scene._updateWalkDt` (`:5806`)는 `Entity._spawnDriver`의 중간 탐색 후속 틱을 위해 게시된다 — 배치 통과가 엔티티를 주장한 후 생성된 드라이버는 WASM 경로에서는 다음 프레임까지 기다려야 하지만 JS 경로에서는 같은 프레임에서 틱한다. `loop`를 `dt`/`currentFrame`/`frameHadAnimation`을 함께 운반하지 않고 분할하면 `DEC-0019` 규칙 5를 위반한다.

## 9. 개발자가 지켜야 할 불변 조건

1. **`add`/`remove`/`destroy` 외에는 `children`을 변경하지 마라.** 직접 배열 변경은 `markStructureChanged`, `markDirty`, 드라이버 등록, 접근성 분리를 건너뛴다 — 네 가지 불변 조건이 모두 조용히 깨진다. `Entity.ts` 외부의 `\.children\.push|\.children\.splice`를 grep하라.
2. **작업 예약 전에 `destroyed`를 확인하라.** `requestAnimationFrame`, `setTimeout`, `ResizeObserver`, 또는 `scene`이나 `entity.scene`을 건드리는 WebGPU 약속은 `if (destroyed) return`을 보호해야 한다. `Scene.ts:3137`의 `destroy()` 문서는 명시적이다.
3. **더티 계약을 존중하라.** `onDemand` 씬은 `markDirty()` 또는 활성 드라이버까지 잠든다. `Entity.animate`/`setTransition` 외부에서 `x/y/scale/rotation/opacity/width/height`를 변경하면서 `markDirty({ reason })`를 하지 않으면 변경이 보이지 않는다. 반대로 `update()`가 매 프레임 자신을 재무장하는 `markDirty`는 `onDemand`를 깨어 있게 한다 — 매 프레임 발화하는 `reason`을 찾으려면 `scene.dirtyReasons` (`:3489`)를 사용하라.
4. **히트 테스트 게이트를 동기화 상태로 유지하라.** 새로운 가시성/입력/클립 조건은 `findHitRecursively` (`HitTester.ts:227`)와 `isHitEligible` (`:326`) 모두에 추가되어야 한다. 한 경로에만 있으면 WASM과 JS 경로가 불일치한다 — 가속기가 버그 생성기가 된다.
5. **`e.target === capEl`일 때만 포인터 캡처.** `Scene.ts:3851` 보호는 선택이 아니다. 제거하면 옵션이 캡처 요소의 자식인 Dropdown/Select 메뉴가 깨진다.
6. **월드 행렬 소비자는 오래된 캐시 경우를 처리해야 한다.** `getWorldTransform()`은 `currentFrame`에 대해서만 캐시된 행렬을 반환할 수 있다; 프레임 사이 또는 오프 트리 엔티티는 탐색한다. `_readWorldCache` 호출자는 `false`를 반환할 때 전체 탐색으로 대체해야 한다 (`HitTester.ts:144` 융합 수집 주석).
7. **버전 메트릭을 사용하라, 전체를 훑지 마라.** 폰트/DPR/뷰포트 변경은 모든 운반자에 닿지 않고 생성 카운터(`ContentProjectionManager.ts:524`)를 통해 `scaleX`/교정을 무효화한다. 트리 형태 캐시에 대해서도 `structureVersion`에 동일한 패턴이 적용된다.

## 10. 디버그 체크리스트 — 씬이 잘못 보일 때

- **`onDemand` 모드에서 변경 후 아무것도 렌더링되지 않음** → `dirty`가 여전히 `false`인가? `scene.setDirtyTracking(true)`를 활성화하고, 변경 후 `scene.dirtyReasons`를 읽으라. `markDirty` 누락이 ~90%의 원인이다. devtools에서 `scene.frameStats.dirty` (`Scene.ts:3528`)를 확인하라.
- **`remove()` 후 유령 히트 대상** → `children`이 직접 변경되었는가? `structureVersion` 증가와 `HitTester.ensureHitGrid`의 오래된 상태(`hitGridStructureVersion` 대 `structureVersion`)를 확인하라. `hitGridOk=true`인 오래된 그리드는 잘못된 후보를 제공한다.
- **하위 트리 제거 후 드라이버가 계속 실행됨** → `DriverTicker.active` 크기가 줄어들어야 한다. `scene._tickBatchedDrivers` 게이트를 검사하라 — `DriverTicker.ts:101`의 `unregisterSubtree`는 전체 하위 트리를 탐색하므로 매우 깊은 분리된 하위 트리는 제거 시 O(하위 트리) 비용을 지불한다(프레임당이 아님).
- **JS 대 WASM 변환 발산** → `entity.getWorldTransform()`(JS 탐색)과 `transform.aabbView()` 슬롯을 비교하라. 오래된 `_storeSlot` (`Entity.ts:865`, 저장소에 없으면 `-1`)은 느리지만 정확한 JS 대체만 비용을 치르며 잘못된 행렬은 절대 아니다 — 행렬이 다르면 토폴로지 재구축이 `markStructureChanged`를 놓쳤다.
- **이벤트가 두 번 발화되거나 전혀 발화되지 않음** → `bubbles` 플래그 (`VectoJSEvent.ts:607`)와 리스너가 `captureListeners` 대 `listeners`에 있는지 확인하라. 버블하지 않는 `hover`/`pointerleave`는 대상의 버블 단계에서만 발화한다.
- **탭 재포커스 시 스프링 폭발** → `loop`는 `dt`를 `MAX_FRAME_DT` (`Scene.ts:5630`)로 제한한다. 사용자 `step(dt)`가 거대한 `dt`를 `tickDrivers`에 직접 제공하면 호출자가 동일한 제한을 적용해야 한다.

---

_시리즈: 00 개요 → 01 선택 → 02 텍스트+레이아웃 → 03 투영+가상화 → 04 스트리밍 마크다운 → 05 TeX → **06 VMT 런타임** → 07 렌더러 → 08 WASM G1/G2/G3 → 09 Three/XR → 10 비디오 내보내기 → 11 그래프 레이아웃 → 12 개발 도구 → 99 종합._
