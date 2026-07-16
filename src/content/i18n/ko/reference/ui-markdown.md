---
title: 'Markdown'
description: '리치 텍스트, 코드 블록, 테이블, 스트리밍 추가 및 링크 콜백이 있는 캔버스 네이티브 Markdown 렌더러'
order: 14
---

# `Markdown`

`Markdown`은 `marked`로 Markdown을 파싱하고 결과를 VectoJS Entity 서브트리로 렌더링합니다.
문단과 제목은 `RichText`가 되고, 펜스 코드는 `CodeBlock`이 되며, GFM 테이블은 `Table`이 됩니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Markdown</span></div>
  <iframe src="/sandbox/ui/markdown.html?v=core-1.9.2-ui-1.9.5" class="sandbox-frame component-demo-frame component-demo-frame-xl" loading="eager" title="Markdown 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>샘플은 산문, 링크, 인라인 코드 및 펜스 블록을 하나의 집중된 뷰포트에 유지하여 레이아웃 결함을 확인할 수 있습니다.</figcaption>
</figure>

## 최소 예제

```ts
import { Markdown } from '@vectojs/ui';

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

토큰 스트림의 경우, 새로운 델타만 추가하세요:

```ts
for await (const token of llmStream) {
  markdown.appendMarkdown(token);
  scrollView.scrollToBottom();
}
```

모든 토큰에 대해 `setContent(fullDocumentSoFar)`를 호출하지 마세요. 전체 서브트리를 재구축합니다.

## 확장 지점

`renderToken(token)`은 protected이므로, 커스텀 렌더러가 앱별 블록을 위해 `Markdown`을 서브클래싱하면서 일반 토큰은 내장 렌더러에 위임할 수 있습니다.

## 유지보수 체크리스트

- 링크 콜백은 문단, 제목 및 목록 `RichText` 노드로 전달되어야 합니다.
- 코드 블록은 토큰이나 라인 세그먼트당 하나의 Entity가 아닌 단일 리프 Entity로 유지되어야 합니다.
- 펜스 코드는 정확한 소스 텍스트와 줄바꿈을 프로젝션해야 합니다.
- 테이블 헤더는 heading 색상/볼드 스타일을 사용하며, 각 논리적 셀은 정확히 하나의 콘텐츠 프로젝션을 소유합니다.
- 포인터 소유권은 리프 텍스트/코드 프로젝션에 유지되며, 구조적 목록 및 테이블 Entity는 네이티브 선택을 가로채지 않아야 합니다.
- 스트리밍 추가는 변경되지 않은 접두사 Entity를 재사용해야 합니다.

관련 문서: [`RichText`](/reference/ui-components/#richtext), [`CodeBlock`](/reference/ui-components/#codeblock), [`Table`](/reference/ui-components/#table).
