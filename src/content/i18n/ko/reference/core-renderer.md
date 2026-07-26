---
title: '렌더러'
description: '@vectojs/core/renderer 하위 경로: 백엔드에 독립적인 IRenderer 계약, CanvasRenderer, SVGRenderer, WebGL 포인트/직렬/스프라이트/MSDF 레이어, Entity 콘텐츠 투영 및 parseColorToRGBA.'
order: 5
---

# 렌더러 — `@vectojs/core/renderer`

[`@vectojs/core`](/reference/core-api/)의 일부입니다.

## IRenderer

모든 `Entity.render`가 받는 백엔드에 독립적인 그리기 표면.

```ts
interface IRenderer {
  clear(): void;
  save(): void;
  restore(): void;
  translate(x, y): void;
  scale(x, y): void;
  rotate(angle): void; // 라디안, 시계 방향
  setGlobalAlpha(alpha): void; // [0,1]
  clip(x, y, width, height): void; // 클립 rect를 교차 (save/restore로 감싸기)

  beginPath(): void;
  moveTo(x, y): void;
  lineTo(x, y): void;
  bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y): void;
  closePath(): void;
  arc(x, y, radius, startAngle, endAngle, counterclockwise?): void;
  roundRect(x, y, width, height, radii: number | number[]): void;

  drawImage(source: CanvasImageSource, dx, dy, dw, dh): void;
  fill(colorOrGradient: string | any): void;
  stroke(colorOrGradient: string | any, lineWidth = 1): void;
  fillText(text, x, y, font, color): void; // font = CSS 약식, 예: '16px monospace'

  fillCircle(cx, cy, radius, color, alpha = 1): void; // 순서-보존 동일-스타일 배치
  flush(): void; // 보류 중인 배치 커밋 (유휴 시 no-op)
  present?(): void; // 선택적 프레임-종료 커밋
  createLinearGradient(x0, y0, x1, y1, colorStops: { stop; color }[]): any;
  dispose?(): void; // 멱등성 백엔드 정리; Scene.destroy()가 호출
}
```

`fillCircle`은 연속된 동일-`color`/`alpha` 호출을 하나의 경로로 병합하여
`flush()`(또는 스타일이 변경될 때) 커밋됩니다. Scene은 각 형제 그룹과 각 프레임 끝에서
플러시하여 페인터의 순서를 보존합니다.

## `Entity.getContentProjection()`

```ts
getContentProjection(): ContentProjection | null // 기본값 null
// ContentProjection: {
//   text: string; font?: string; lineHeight?: number; selectable?: boolean;
//   contentX?: number; contentY?: number; baseline?: number;
//   lines?: Array<{ text; x; y; baseline; font?; lineHeight?; runs? }>;
//   grid?: PreparedContentGrid;
// }
```

정적 텍스트를 렌더링하는 엔터티를 위한 옵트인 훅: Scene은 반환된 문자열을
투명하고 위치가 동기화된 DOM 노드(뷰포트-지연, 더티-체크됨,
엔터티가 대화형일 때 `aria-hidden`)로 미러링하여, 캔버스 텍스트를
찾을 수 있고, 스크린 리더/크롤러가 볼 수 있으며, 번역 가능하고,
`selectable: true`로 네이티브 선택 가능하게 만듭니다. `TextEntity`/`MSDFTextEntity`
([Text & Bidi](/reference/core-text/) 참조)가 구현합니다. Scene-전체 끄기 스위치:
`new Scene(canvas, { contentProjection: false })`.

Scene은 투영 노드가 나타나거나 사라질 때 VMT 순서를 보존하고,
엔터티 하위 트리와 함께 하위 투영을 제거하며,
투영이 뷰포트 밖에 있거나 `clipChildren` 조상 아래에 있을 때 숨깁니다.
도구는 DOM을 쿼리하지 않고 현재 구체화된 미러를 검사할 수 있습니다:

```ts
scene.getContentElement(entityId): HTMLElement | undefined;
```

가상화되었거나 구체화되지 않은 오프-뷰포트 텍스트는 애플리케이션이
활성 Scene으로 가져올 때까지 검색할 수 없습니다.

> Core 1.6.0 이상 필요: Canvas는 기준선으로 텍스트 위치를 받는 반면
> CSS는 라인 박스를 받습니다. 정확한 선택 지오메트리를 위해 단순 텍스트 실행에는
> `contentX`/`contentY`와 `baseline`을 제공하거나, 컴포넌트가 이미
> 줄바꿈, 삽입 또는 혼합 타이포그래피를 소유하고 있는 경우 시각적 행당 하나의 명시적
> `lines` 항목을 제공하세요. Scene은 해당 로컬 좌표를 엔터티 변환을 통해 매핑하고
> CSS 라인 박스를 Canvas 폰트 메트릭과 동기화합니다.

```ts
getContentProjection() {
  return {
    text: 'small large',
    selectable: true,
    lines: [{
      text: 'small large', x: 18, y: 12, baseline: 25,
      font: '28px sans-serif', lineHeight: 42,
      runs: [
        { text: 'small ', font: '16px sans-serif' },
        { text: 'large', font: 'bold 28px sans-serif' },
      ],
    }],
  };
}
```

커스텀 Canvas-네이티브 편집기에서 동일한 텍스트가 네이티브 컨트롤 또는
콘텐츠 투영과 정렬되어야 할 때 `cssLineBoxBaseline(font, lineHeight)`를 사용하세요.

> Core 1.8은 코드형 렌더러를 위해 `prepareContentGrid(source, metrics)`를 추가합니다.
> 변경 불가능한 결과를 `ContentProjection.grid`로 반환하고 동일한
> 셀을 Canvas 페인트에 사용하세요. 그리드는 UTF-16 소스 범위, 법적 그래핌
> 캐럿, CR/LF/CRLF 구분자, 탭, 넓은 CJK 및 이모지 진행, 아랍어
> 쉐이핑 및 유니코드 bidi 위치를 유지하는 반면 투영된 DOM은 복사 및 찾기를 위해
> 정확한 논리적 소스를 유지합니다.

```ts
const grid = prepareContentGrid(source, {
  font: codeFont,
  cellWidth,
  lineHeight: 24,
  baseline: 18,
});

getContentProjection() {
  return { text: source, selectable: true, grid };
}
```

Core는 폰트 로드 후 보유 캐리어를 보정하고 로컬 그리드 공간에서 포인터 선택을 라우팅합니다.
Firefox 폰트 대체, DPR, 브라우저 줌,
회전, 미러 변환 및 비균일 스케일링은 따라서 하나의 지오메트리 계획을 사용합니다.
보정 프로브는 투영의 줌 컨텍스트를 상속하고 Firefox의
누락-글리프 폴백 메트릭을 고려합니다; 커스텀 리사이즈/줌 소유자는
`scene.resize()`를 호출하여 보유된 보정을 무효화해야 합니다. 일반 `lines` 투영 및
라인-리스 커스텀 투영도 변환된 2차원 그래핌 캐럿 지오메트리를 사용합니다.

`present()`는 Scene에 의해 각 렌더 패스의 끝에서 정확히 **한 번** 호출됩니다.
한 번에 전체 프레임을 제출하는 보유 백엔드(예: [`@vectojs/three`](/reference/three-renderer/)의 `ThreeRenderer`)는
여기서 단일 값비싼 커밋을 수행하고 `flush()`를 저렴하게 유지해야 합니다 —
Scene은 모든 비-배치 노드 주위에서 `flush()`를 호출하므로, 값비싼 `flush()`는
프레임 비용을 엔터티 수에 대해 2차로 만듭니다.

## CanvasRenderer

```ts
new CanvasRenderer(canvas: HTMLCanvasElement)
```

기본 `IRenderer`. 생성 시 `devicePixelRatio` 스케일링을 적용합니다. 각 배치된
`fill()`을 `MAX_BATCH = 64` 서브-경로로 제한합니다(단일 Canvas2D `fill()`은
서브-경로 수에 대해 초선형입니다). `scene.getRenderer()`를 통해 핸들을 얻으세요.

## TextRasterCache

_Core 1.12.0부터._

```ts
new TextRasterCache(options?: { maxEntries?: number; dpr?: number })
cache.get(font: string, color: string, text: string): TextRaster | null
cache.clear(): void
cache.stats: { hits: number; misses: number; size: number }
```

**동일한 짧은 문자열을 프레임당 수천 번** 그리는 뷰(단막/탄막, 채팅/로그 꼬리,
데이터-그리드 셀, 파티클 레이블)를 위한 미리-래스터화된 텍스트 실행의 캐시입니다.
`ctx.fillText()`는 규모가 커지면 의외로 비용이 많이 듭니다: 각 호출은 문자열을
다시 셰이핑하고, CSS 색상을 다시 파싱하며, CPU 메인 스레드에서 글리프를
래스터화합니다 — 프로파일을 보면 GPU가 굶주려 유휴 상태인 동안 메인 스레드가
네이티브(`(program)`) 코드에 고정되어 있습니다.

`get()`은 서로 다른 각 `(font, color, text)` 실행을 작은 오프스크린 캔버스에
한 번 래스터화합니다; 이후 모든 프레임에서는 다시 셰이핑하는 대신 `drawImage`로
블리팅합니다. 반환된 오프셋을 빼서 `fillText` 기준선에 블리팅하세요:

```ts
const r = cache.get('600 24px system-ui', '#38bdf8', label);
if (r) renderer.drawImage(r.canvas, x - r.offsetX, baselineY - r.offsetY, r.width, r.height);
else renderer.fillText(label, x, baselineY, '600 24px system-ui', '#38bdf8'); // headless fallback
```

`TextRaster`는 `{ canvas, width, height, offsetX, offsetY }`입니다(치수는 CSS
px 단위). 인스턴스는 격리되어 있습니다(공유 전역 상태 없음); `dpr > 1`은 블리트
크기가 CSS px로 유지되는 동안 HiDPI에서 텍스트를 선명하게 유지하며;
삽입-순서 제거 상한(`maxEntries`, 기본값 4096)은 무제한(사용자가 입력한)
콘텐츠에 대해 메모리를 제한하고; `get()`은 헤드리스/비-DOM 컨텍스트에서 `null`을
반환하므로 `fillText` 폴백을 유지할 수 있습니다. 이점은 **재사용**에서 나옵니다 —
한 번만 그려지는 실행은 순수한 오버헤드입니다.

## SVGRenderer

```ts
new SVGRenderer(width: number, height: number)
toXMLString(): string
```

소프트웨어 `IRenderer`로, 그리기를 평면 SVG 문자열(행렬/알파/클립
스택, 그라데이션 중복 제거)로 기록합니다. 텍스트와 속성 값은 XML 이스케이프되며,
외부 이미지 URL은 실행/데이터/파일/커스텀 스킴을 거부합니다(Canvas 생성 래스터
데이터 URL은 계속 지원됨). `scene.toSVG()`를 지원합니다. `SVGLinearGradient`는
그라데이션 디스크립터 타입입니다.

## WebGL 포인트 레이어

```ts
createWebGLPointRenderer(canvas: HTMLCanvasElement): PointRenderer | null   // WebGL2 / 셰이더를 사용할 수 없으면 null

interface PointRenderer {
  resize(width, height): void;                 // 논리적 크기; DPR 적용
  begin(): void;                               // 프레임별 버퍼 리셋
  addCircle(x, y, radius, color, alpha?): void;        // 세계 좌표
  addRect(x, y, width, height, color, alpha?, rotation?): void;
  setTexture(source: TexImageSource): void;
  addSprite(x, y, width, height, u0, v0, u1, v1, color?, alpha?, rotation?): void;
  setMSDFTexture(source: TexImageSource, distanceRange: number): void;
  addGlyph(x, y, width, height, u0, v0, u1, v1, color?, alpha?, rotation?): void;
  flush(): void;                               // 모든 누적 기본 요소 지우기 + 그리기
  destroy(): void;
}
```

하나의 WebGL2 캔버스, 네 개의 배치된 프로그램: 포인트(둥근, `gl_PointSize`로 AA),
사각형(확장된 삼각형), 텍스처 스프라이트, MSDF 글리프(중앙값-3
거리 재구성, 모든 줌에서 선명). `color`는 틴트; 흰색 텍셀은 변경 없이 통과합니다.
스프라이트/글리프 추가는 텍스처가 설정될 때까지 no-op입니다.
Scene은 `pointBackend: 'webgl'`일 때 `getBatchCircle`/`getBatchRect`(그리고 CPU 파티클, MSDF 텍스트)를
여기로 라우팅합니다. GPU 기본 요소가 정확히 표현할 수 없는 변환
(예: 비균일 스케일 또는 전단) 아래의 잎은 일반 렌더러로 폴백됩니다.

> 엔터티 훅 `getBatchCircle()` → `{ radius, color }` 및 `getBatchRect()` →
> `{ width, height, color }` ([`Entity`](/reference/core-entity/#a11y--배치-훅-오버라이드하여-옵트인) 참조)는
> 이 레이어에 공급하는 엔터티별 옵트인입니다.

`flush()`는 **프리미티브 타입당 최대 한 번의 드로우 콜**을 발행하므로, 드로우 콜 횟수는 스케일링 제한이 아닙니다 — 업로드되는 바이트가 제한입니다. core 1.16.2부터 모든 쿼드 배치(rect, sprite, 글리프, 조각된 원)는 **4개의 정점**을 업로드하고, 6개의 정점으로 확장하여 `drawArrays`하는 대신 하나의 공유 정적 32비트 인덱스 버퍼에 대해 `drawElements`로 그립니다. 이렇게 하면 쿼드당 중복된 두 모서리가 제거되어 업로드 양이 1/3 줄어듭니다. 인덱스 버퍼는 한 번 구축되고 기하급수적으로 재성장하며, 프레임마다 다시 전송되지 않습니다. 인덱스는 32비트입니다. `Uint16Array`는 배치를 16,383 쿼드로 제한하지만 실제 장면은 이를 초과하기 때문입니다.

실제 하드웨어(RTX 4060 노트북, `gl.finish()` 포함, 12회 중앙값)에서 이전 6-정점 경로와 비교하여 측정:

| quads/frame | Chrome         | Firefox         |
| ----------- | -------------- | --------------- |
| 12,000      | 0.61 → 0.09ms  | 2.66 → 1.47ms   |
| 50,000      | 2.22 → 0.87ms  | 9.02 → 6.24ms   |
| 100,000     | 12.62 → 3.12ms | 16.81 → 10.88ms |

대략 **35,000–50,000 quads/frame** 미만에서는 정점 버퍼를 채우는 JS 비용이 GPU 제출보다 더 큽니다; 그 이상에서는 GPU 제출이 지배적이며, 유용한 레버는 (컬링, 가상화를 통한) 드로잉 감소이지 필 조정이 아닙니다. Firefox는 정점 레이아웃에 관계없이 ~1 GB/s의 유효 업로드 대역폭을 유지하므로, 해당 엔진에서는 바이트를 줄이는 것이 유일한 신뢰할 수 있는 레버입니다.

## parseColorToRGBA

```ts
parseColorToRGBA(css: string): RGBA           // RGBA = [number, number, number, number] in [0,1]
```

`#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa` 및 `rgb()`/`rgba()`에 대한 고속 경로; 다른
형식(이름, `hsl()`, …)은 DOM이 존재할 때 캐시된 1×1 캔버스를 통해 해결됩니다.
결과는 **identity로 캐시 및 공유되므로 — 반환된 배열을 읽기 전용으로 취급하세요.**
DOM이 없고 파싱 불가능한 입력 → 불투명 검정 `[0,0,0,1]`.

캐시는 1,000개의 항목을 보유하고 **삽입 순서(FIFO)**로 제거합니다. 캐시 히트는 의도적으로 해당 항목을 승격**하지 않습니다**: 이 함수는 쿼드당 한 번 호출되며, ~25,000 quads/frame에서 실제 LRU에 필요한 `Map.delete` + re-`set` 쌍의 비용이 함수의 다른 모든 부분을 합친 것보다 큽니다. 실제 결과는, 장면의 고유 색상 작업 세트가 1,000을 초과하면 초기에 삽입된 인기 색상이 제거되고 다시 파싱될 수 있다는 것입니다. 일반적인 장면에서는 작업 세트가 작고 안정적이므로 FIFO와 LRU가 동일한 항목을 제거합니다.

## 관련 항목

[`Entity`](/reference/core-entity/) (배치 훅, 콘텐츠 투영) ·
[`ComputeParticleEntity`](/reference/core-particles/) (WebGL/WebGPU 소비자) ·
[Text & Bidi](/reference/core-text/) (MSDF 글리프 소비자) ·
[`@vectojs/three`의 `ThreeRenderer`](/reference/three-renderer/) (대체 `IRenderer`) ·
[`@vectojs/core` 개요](/reference/core-api/)
