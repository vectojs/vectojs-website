---
title: 'Markdown'
description: '리치 텍스트, 코드 블록, 테이블, 스트리밍 추가 및 링크 콜백이 있는 캔버스 네이티브 Markdown 렌더러 — 독립형 @vectojs/markdown 패키지.'
order: 14
---

# `Markdown` — `@vectojs/markdown`

`Markdown`과 `CodeBlock`은 독립형 **`@vectojs/markdown`** 패키지에 있습니다
(`@vectojs/ui@2.2.0`부터 더 이상 `@vectojs/ui`의 일부가 아니므로,
`marked` + MathJax 의존성은 Markdown을 렌더링할 때만 로드됩니다). 이는
`@vectojs/ui` 컴포넌트를 조합하므로 `@vectojs/ui` 및 `@vectojs/core`와 함께 설치하세요:
`bun add @vectojs/markdown @vectojs/ui @vectojs/core`.

`Markdown`은 `marked`로 Markdown을 파싱하고 결과를 VectoJS Entity 서브트리로 렌더링합니다.
문단과 제목은 `RichText`가 되고, 펜스 코드는 `CodeBlock`이 되며, GFM 테이블은 `Table`이 됩니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Markdown</span></div>
  <iframe src="/sandbox/ui/markdown.html?v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame component-demo-frame-xl" loading="eager" title="Markdown 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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
}
```

`selectable`은 현재 및 향후 제목, 산문, 목록, 펜스 코드 및 테이블 셀로 전파됩니다.
`markdown.setSelectable(false)`로 런타임에 변경할 수 있습니다.
브라우저가 드래그 선택, Ctrl/Command+C 및 페이지 내 검색을 소유하며, VMT Entity는 여전히 레이아웃과 픽셀을 소유합니다. 정렬 및 비정렬 목록 항목은 선택 가능한 `RichText`를 사용하며, 모든 GFM 테이블 셀은 하나의 선택 가능한 프로젝션을 소유합니다. 논리적 소스 순서와 하드/소프트 구분선은 중첩된 Markdown 출력을 통해서도 그대로 유지됩니다.
Core 1.8은 변환된 산문을 2차원 커서 지오메트리로 라우팅하고 펜스 코드는 공유 준비 그리드(shared prepared grid)를 통해 라우팅하므로, 목록, GFM 테이블, 줄바꿈된 아랍어/RTL 텍스트 및 코드가 분수 DPR 및 zoom에서도 논리적 복사 순서를 유지합니다.
애플리케이션이 컨테이너 크기 또는 CSS zoom을 소유하는 경우, Firefox가 네이티브 Range 메트릭을 재보정할 수 있도록 `scene.resize(width, height)`로 Scene에 알리세요.

## 스트리밍

토큰 스트림의 경우, 새로운 델타만 추가하세요 — 그리고 토큰마다 추가하는 대신 애니메이션 프레임별로 토큰을 배치 처리합니다:

```ts
let pending = '';
let scheduled = false;
function pushToken(token: string) {
  pending += token;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const chunk = pending;
    pending = '';
    markdown.appendMarkdown(chunk);
    scrollView.scrollToBottom();
  });
}
for await (const token of llmStream) pushToken(token);
```

모든 토큰에 대해 `setContent(fullDocumentSoFar)`를 호출하지 마세요. 전체 서브트리를 재구축합니다.
전체 레시피 — 하단 고정 스티키니스, 긴 트랜스크립트 세분화, 렌더 모드 선택 — 은 [스트리밍 및 실시간 텍스트](/learn/streaming/) 가이드에 있습니다.

## 성능 모델

각 호출의 실제 비용을 통해 스트리밍 코드를 합리적으로 분석할 수 있습니다:

- **파싱은 기본적으로 오프-스레드입니다.** `appendMarkdown`은 누적된 소스를 임베디드 번들로 빌드된 `Worker`에 게시합니다(네트워크 요청 없음); 파싱이 반환될 때 토큰 diff와 엔터티 업데이트가 적용됩니다. `Worker`가 없는 환경(일부 테스트 러너, SSR)은 동기식 렉싱으로 폴백합니다 — 동일한 결과, 메인 스레드 비용.
- **렉싱은 추가당 O(문서)입니다**, O(청크)가 아닙니다: 호출할 때마다 누적된 전체 소스가 다시 토큰화됩니다. 프레임별로 배치 처리하고(위 참조) 긴 트랜스크립트를 메시지당 하나의 `Markdown` 엔터티로 분할하여 라이브 문서를 작게 유지하세요.
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
