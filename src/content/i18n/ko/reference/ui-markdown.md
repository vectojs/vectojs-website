---
title: 'Markdown'
description: '리치 텍스트, 코드 블록, 테이블, 스트리밍 추가 및 링크 콜백이 있는 캔버스 네이티브 Markdown 렌더러 — 독립형 @vectojs/markdown 패키지.'
order: 14
---

# `Markdown` — `@vectojs/markdown`

`Markdown`과 `CodeBlock`은 독립형 **`@vectojs/markdown`** 패키지에 있습니다
(`@vectojs/ui@2.2.0`부터 더 이상 `@vectojs/ui`의 일부가 아니므로,
`marked` + `@vectojs/tex` 의존성은 Markdown을 렌더링할 때만 로드됩니다). 이는
`@vectojs/ui` 컴포넌트를 조합하므로 `@vectojs/ui` 및 `@vectojs/core`와 함께 설치하세요:
`bun add @vectojs/markdown @vectojs/ui @vectojs/core`.

`Markdown`은 `marked`로 Markdown을 파싱하고 결과를 VectoJS Entity 서브트리로 렌더링합니다.
문단과 제목은 `RichText`가 되고, 펜스 코드는 `CodeBlock`이 되며, GFM 테이블은 `Table`이 됩니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Markdown</span></div>
  <iframe src="/sandbox/ui/markdown.html?v=core-1.32.6-ui-2.15.0" class="sandbox-frame component-demo-frame component-demo-frame-xl" loading="eager" title="Markdown 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>샘플은 산문, 링크, 인라인 코드 및 펜스 블록을 하나의 집중된 뷰포트에 유지하여 레이아웃 결함을 확인할 수 있습니다.</figcaption>
</figure>

## 최소 예제

```ts
import { Markdown } from '@vectojs/markdown';

const md = new Markdown(source, {
  maxWidth: 640,
  selectable: true,
  onLinkClick(href) {
    router.open(href);
  },
});

scene.add(md.setPosition(24, 24));
```

## 생성자

```ts
new Markdown(markdownText: string, opts?: MarkdownOptions)

interface MarkdownOptions {
  maxWidth?: number;
  theme?: MarkdownTheme;
  onLinkClick?: (href: string) => void;
  selectable?: boolean; // default true
  userTiming?: boolean; // emit a `vecto:markdown:parse` measure, default false
}
```

`selectable`은 현재 및 향후 제목, 산문, 목록, 펜스 코드 및 테이블 셀로 전파됩니다.
`markdown.setSelectable(false)`로 런타임에 변경할 수 있습니다.
브라우저가 드래그 선택, Ctrl/Command+C 및 페이지 내 검색을 소유하며, VMT Entity는 여전히 레이아웃과 픽셀을 소유합니다. 정렬 및 비정렬 목록 항목은 선택 가능한 `RichText`를 사용하며, 모든 GFM 테이블 셀은 하나의 선택 가능한 프로젝션을 소유합니다. 논리적 소스 순서와 하드/소프트 구분선은 중첩된 Markdown 출력을 통해서도 그대로 유지됩니다.
Core 1.8은 변환된 산문을 2차원 커서 지오메트리로 라우팅하고 펜스 코드는 공유 준비 그리드(shared prepared grid)를 통해 라우팅하므로, 목록, GFM 테이블, 줄바꿈된 아랍어/RTL 텍스트 및 코드가 분수 DPR 및 zoom에서도 논리적 복사 순서를 유지합니다.
애플리케이션이 컨테이너 크기 또는 CSS zoom을 소유하는 경우, Firefox가 네이티브 Range 메트릭을 재보정할 수 있도록 `scene.resize(width, height)`로 Scene에 알리세요.

## 반응형 너비: `setMaxWidth()`

```ts
markdown.setMaxWidth(width: number): this
```

이미 렌더링된 모든 블록을 새 너비로 다시 줄바꿈합니다(`0.9.0+`). 크기 변경 시 `maxWidth`에 대입하는 대신 이 메서드를 호출하세요. 대입은 필드만 설정하고 보이는 변화는 없습니다: 너비는 각 블록이 **생성될 때** 읽히므로, 대입만으로는 기존 블록이 이전 너비로 측정된 상태로 남습니다.

```ts
window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
  markdown.setMaxWidth(window.innerWidth - INSET * 2);
});
```

재구축이 아니라 제자리에서 재배치하며, 그래서 스트리밍 도중에도 쓸 수 있습니다:

- 동일한 블록 엔티티 **인스턴스**가 살아남으므로, 그 참조를 들고 있는 것(스크롤 앵커, 히트 타깃, devtools 선택)이 계속 동작합니다;
- 열려 있는 [`createStream()`](#스트리밍) 라이터는 영향을 받지 않고 계속 추가합니다;
- 어떤 것도 다시 어휘 분석되지 않습니다.

두 엔진에서 5개 블록 문서로 실측: 520 → 260 px에서 투영 줄 수가 2 → 4, 높이가 88 → 160으로 바뀌었고, 동일한 두 단락 인스턴스 위에서 라이터는 여전히 `open`이었으며 어휘 분석기에 넘어간 문자 수 증가는 **0**이었습니다.

너비가 변하지 않으면 아무 일도 하지 않으므로 높이만 바뀌는 크기 변경에는 비용이 없고, 호출자가 별도 가드를 둘 필요도 없습니다. 음수 너비는 0으로 제한됩니다.

> [!NOTE]
> `0.9.0` 이전에는 유일하게 올바른 우회책이 전체 재구축이었습니다 — 스트림을 해제하고, 드러난 소스를 `setContent()`로 재생하고, 새 라이터를 열고, 스크롤 오프셋을 손으로 옮기는 것. 이는 문서를 정확히 재현하며, 그래서 계속 남아 있기 쉬웠습니다: 재구축도 올바른 지오메트리를 만들어 냅니다. 그 대가는 크기 변경마다 문서 전체를 다시 어휘 분석하는 것과 모든 엔티티 인스턴스였습니다.

디스플레이 수식은 의도적으로 자체 너비를 유지합니다: `@vectojs/tex`는 조판 박스 크기를 사용 가능한 너비가 아니라 `ex` 기준 메트릭으로 정하므로, 늘리면 수식이 왜곡됩니다. 펜스 코드도 다시 줄바꿈되지 않습니다 — 코드는 고정 고정폭 그리드를 가지며 긴 줄은 설계상 넘칩니다 — 배경만 크기가 조정됩니다.

[`onStable`](#1회성-완료one-shot-completion-onstable) 콜백에서 호출하면 `setContent()`와 같은 이유로 예외를 던집니다: 그 콜백은 자신이 무효화할 커밋 내부에서 실행되기 때문입니다.

## GFM 커버리지

문단, 제목, 목록, 펜스 코드, 테이블 외에:

| 구성요소            | 렌더링 결과                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `~~strikethrough~~` | 취소선이 그어진 텍스트 — 합쳐진 런 하나당 선 하나, 선 굵기는 글자 크기에 비례 (`0.8.0+`)                  |
| `- [ ]` / `- [x]`   | ☐ 또는 ☑ 글리프에 공백 하나를 더한 것이 불릿을 대체하며, 정렬된 목록에서는 `1.` 뒤에 그 글리프 (`0.8.0+`) |
| `\|:--\|--:\|:-:\|` | 열 정렬. `Table.align`으로 전달됩니다 (`0.8.0+`)                                                          |
| `$…$` / ` ```math ` | `@vectojs/tex`로 조판된 수식(인라인 / 블록). 구분자가 닫힌 후에만 변환됩니다                              |

## 프런트매터(Front matter)

문서 맨 앞의 `---`로 구분된 YAML 블록은 콘텐츠가 아니라 메타데이터입니다 (`0.8.0+`):

```ts
const md = new Markdown('---\ntitle: Release notes\ndate: 2026-08-03\n---\n# Body');

md.frontMatter; // 'title: Release notes\ndate: 2026-08-03\n'
md.frontMatterFields; // { title: 'Release notes', date: '2026-08-03' }
```

`0.8.0` 이전에는 이 블록이 콘텐츠로 렌더링되었습니다. `marked`에는 프런트매터라는 개념이
없으므로 여는 `---`는 수평선 규칙에 걸리고 닫는 `---`는 **그 키들을 setext 제목으로 밑줄
처리했습니다**. 그래서 메타데이터가 있는 문서는 수평선과, 자기 자신의 키로 이루어진 28px
굵은 제목을 그렸습니다.

`frontMatterFields`는 YAML이 아니라 좁은 범위의 편의 기능입니다 — 들여쓴 줄은 건너뛰므로
중첩된 매핑과 시퀀스가 최상위 키로 새어 나오는 일은 없습니다(부모 키는 빈 값으로
존재합니다). 더 풍부한 처리가 필요하면 `md.frontMatter`를 진짜 파서에 넘기세요.
`scanFrontMatter(text, complete)`와 `parseFrontMatterFields(raw)`는 모두 원시 텍스트에
사용할 수 있도록 익스포트되어 있습니다.

인식은 의도적으로 보수적입니다. 오탐이 문서의 앞부분을 조용히 삭제해 버리기 때문입니다.
맨 앞의 `---`가 프런트매터가 되는 것은 다음 줄이 YAML 매핑 항목(`key: value`, YAML이
요구하는 대로 콜론 뒤에 공백이 있는 형태)이고 **또한** 닫는 `---` 또는 `...`가 뒤따를
때뿐입니다. 그래서 `---\n\n# Title`, `---\n# Title\n---`, `----\nkey: v\n----`,
`---\n- a\n---`는 모두 계속 수평선으로 렌더링됩니다.

스트리밍 중에는 닫히지 않은 블록 안에 떨어진 청크가 렉싱되지 않고 보류되므로, 문서가
수평선을 그린 다음 닫는 구분자가 그것을 다시 허물어야 하는 일이 없습니다. 스트림이 닫힐
때까지 열려 있는 블록은 콘텐츠로 방출되며, 보류에는 상한이 있으므로 긴 문서 맨 앞의
수평선이 스트리밍을 지연시킬 수는 없습니다.

## 스트리밍

`createStream()`은 이 `Markdown`에 프레임 단위로 합치는 라이터 하나를 연결합니다.
소스를 소비하는 동안 `write()`를 await 하세요. `close()`는 또 다른 애니메이션
프레임을 기다리지 않고 꼬리를 강제로 커밋합니다:

```ts
const stream = markdown.createStream();

try {
  for await (const token of llmStream) {
    await stream.write(token);
  }
  await stream.close();
} catch (error) {
  stream.abort(error);
  throw error;
}
```

```ts
interface StreamControllerOptions {
  maxBufferedChars?: number; // default 64 * 1024 UTF-16 code units
  pacing?: {
    graphemesPerSecond: number;
  };
  signal?: AbortSignal;
  incompleteMode?: IncompleteMarkdownMode; // default 'literal'
  onStable?: (blocks: readonly Entity[]) => void;
}

type IncompleteMarkdownMode = 'literal' | 'optimistic';

type StreamControllerState = 'open' | 'closed' | 'aborted';

interface StreamController {
  readonly state: StreamControllerState;
  readonly bufferedChars: number; // accepted + one blocked write
  write(chunk: string): Promise<void>;
  flush(): void;
  close(): Promise<void>;
  abort(reason?: unknown): void;
  destroy(): void;
}
```

기본 모드는 다음 rAF 이전에 수락된 모든 청크를 하나의 파싱/레이아웃 커밋으로
묶습니다. `write()`는 가시성이 아니라 유계 버퍼 수락 시점에 resolve 됩니다. 용량이
부족하면 하나의 write가 대기하며, 그 대기자가 있는 동안의 다른 write는 reject 되므로
백프레셔를 무시하는 프로듀서가 큐를 무한히 키울 수는 없습니다.

`pacing.graphemesPerSecond`는 프레임당 한 번의 커밋이라는 상한을 유지하면서 고정된
실시간 타이프라이터 페이싱을 더합니다. `Intl.Segmenter`는 일반 결합 시퀀스, 이모지 ZWJ
클러스터, 국기, 서로게이트 페어를 청크/프레임 경계를 넘어 하나로 유지합니다. 전체
라이프사이클, 병리적 클러스터에 대한 유계 폴백, 하단 고정 패턴, 트랜스크립트 전략은
[스트리밍 및 실시간 텍스트](/learn/streaming/)에 있습니다.

### 후행 미닫힘 구문(Trailing unclosed syntax): `incompleteMode`

스트림은 지속적으로 토큰 중간에 잘리므로 청크의 마지막 몇 글자는 일상적으로 구성요소의 절반에 불과합니다. `incompleteMode`는 컨트롤러가 열려 있는 동안 이 꼬리(tail)를 렌더링하는 방법을 선택합니다:

| Mode                   | `a **bo` 스트리밍 중일 때                  |
| ---------------------- | ------------------------------------------ |
| `'literal'` _(기본값)_ | text `a **bo` — 별표는 일반 텍스트입니다   |
| `'optimistic'`         | text `a bo`, `bo` 굵게 — 구문이 숨겨집니다 |

`'optimistic'`은 후행 문단의 마지막 미닫힘 strong/emphasis/inline-code/link 구성요소가 닫힐 것이라고 추측합니다. 이 추측은 **디스플레이 전용**이며 — 토큰 상태는 결코 변형(mutate)되지 않습니다 — `close()` 시 풀리게 되므로, 동일한 소스의 `'literal'`과 `'optimistic'` 스트림은 바이트가 동일한 문서로 끝납니다. `'literal'`은 이 옵션 이전의 모든 릴리스에서 제공된 방식입니다.

모드는 컨트롤러가 아닌 `Markdown`에 의해 해석됩니다: 컨트롤러는 버퍼링과 페이싱을 소유하는 반면, 추측은 후행 문단에 대한 렌더링 시간 변환입니다.

### 1회성 완료(One-shot completion): `onStable`

```ts
const stream = markdown.createStream({
  onStable: (blocks) => {
    // 완성된 문서와 함께 한 번 실행됩니다. 스트림 중간에는 낭비가 될 수 있는
    // 작업을 수행하기에 안전한 장소입니다.
    console.log(`settled with ${blocks.length} top-level blocks`);
  },
});
```

`close()`가 최종 텍스트를 커밋하고 진행 중인 모든 워커 파싱이 적용된 후, 그 순간 문서의 최상위 블록 엔티티 스냅샷과 함께 **정확히 한 번** 실행됩니다. `incompleteMode`와 독립적이므로 `'literal'` 기본값과 함께 작동합니다.

이는 의도적으로 일반적인 "스트림 진행(stream progressed)" 훅이 아닙니다:

- **`flush()`, `abort()` 또는 `destroy()`에 의해 절대 발생하지 않습니다.** 이들 중 어느 것도 콘텐츠가 변경을 완료했다는 것을 의미하지 않습니다.
- 콜백 내부에서 `appendMarkdown()` 또는 `setContent()`를 호출하면 **동기적으로 throw됩니다** — 재진입 변형(reentrant mutation)은 방금 전달받은 스냅샷을 무효화하기 때문입니다.
- 콜백에서 throw가 발생하면 `close()` 프라미스(promise)가 reject됩니다. 어느 쪽이든 컨트롤러는 해제됩니다.

스트림 이후 한 번만 해야 하는 작업 — 하이라이트 캐시 굽기, 등장 애니메이션 시작 —
을 위한 것입니다. 아직 바뀔 가능성이 있는 콘텐츠에 대해 스트림 중간에 실행해서는
안 되는 종류의 작업입니다.

하나의 `Markdown`에 대해 열 수 있는 컨트롤러는 하나뿐입니다. `setContent()`는 교체
전에 그것을 중단하고, `destroy()`는 중단한 뒤 rAF/`AbortSignal` 리스너를 제거합니다.
종료 상태의 컨트롤러는 등록이 해제됩니다. 공개 `appendMarkdown()`은 여전히
동기적입니다. 먼저 이전에 제출된 모든 컨트롤러 청크를 플러시한 다음, 직접 전달된
청크를 정확한 호출 순서로 적용합니다.

모든 토큰에 대해 `setContent(fullDocumentSoFar)`를 호출하지 마세요. 전체 서브트리를
재구축합니다.

## 성능 모델

각 호출의 실제 비용을 통해 스트리밍 코드를 합리적으로 분석할 수 있습니다:

- **파싱은 기본적으로 오프-스레드입니다.** `appendMarkdown`은 누적된 소스를 임베디드 번들로 빌드된 `Worker`에 게시합니다(네트워크 요청 없음); 파싱이 반환될 때 토큰 diff와 엔터티 업데이트가 적용됩니다. `Worker`가 없는 환경(일부 테스트 러너, SSR)은 동기식 렉싱으로 폴백합니다 — 동일한 결과, 메인 스레드 비용.
- **렉싱은 추가당 O(문서)입니다**, O(청크)가 아닙니다: 호출할 때마다 누적된 전체 소스가 다시 토큰화됩니다. `createStream()`으로 프레임별로 배치 처리하고 긴 트랜스크립트를 메시지당 하나의 `Markdown` 엔터티로 분할하여 라이브 문서를 작게 유지하세요.
- **완료된 블록은 재사용되며 재구축되지 않습니다.** `appendMarkdown`은 새 토큰 목록을 원시 소스로 이전 목록과 접두사 일치시킵니다; 이미 렌더링된 모든 블록은 해당 엔터티 인스턴스를 유지합니다. 일반적인 스트리밍 사례 — 마지막 단락이 커짐 — 해당 단락의 스팬을 제자리에서 업데이트합니다.
- **`setContent()`는 아무것도 재사용하지 않습니다.** 모든 자식을 제거하고 전체 토큰 목록을 다시 렌더링합니다. 이는 문서를 _대체_하는 경우 올바른 호출이며, 문서를 _성장_시키는 경우 잘못된 호출입니다.

## 확장 지점

`renderToken(token)`은 protected이므로 커스텀 렌더러는 `Markdown`을 서브클래싱하여
앱별 블록을 처리하면서도 일반 토큰은 내장 렌더러에 계속 위임할 수 있습니다.

## 유지보수 체크리스트

- 링크 콜백은 문단, 제목 및 목록 `RichText` 노드로 전달되어야 합니다.
- 코드 블록은 토큰이나 라인 세그먼트당 하나의 Entity가 아닌 단일 리프 Entity로 유지되어야 합니다.
- 펜스 코드는 정확한 소스 텍스트와 줄바꿈을 프로젝션해야 합니다.
- 테이블 헤더는 heading 색상/볼드 스타일을 사용하며, 각 논리적 셀은 정확히 하나의 콘텐츠 프로젝션을 소유합니다.
- 포인터 소유권은 리프 텍스트/코드 프로젝션에 유지되며, 구조적 목록 및 테이블 Entity는 네이티브 선택을 가로채지 않아야 합니다.
- 스트리밍 추가는 변경되지 않은 접두사 Entity를 재사용해야 합니다.

관련 문서: [`RichText`](/reference/ui-components/#richtext), [`CodeBlock`](/reference/ui-components/#codeblock), [`Table`](/reference/ui-components/#table).
