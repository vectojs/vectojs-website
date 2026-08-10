---
title: 'UI: CodeBlock'
description: 'Markdown에서 펜스 코드(fenced code)에 사용하는 단일 리프 캔버스 코드 블록'
order: 40
---

# `CodeBlock`

`CodeBlock`은 `Markdown`에서 사용하는 저수준 펜스 코드 렌더러입니다. 둘 다 독립형 **`@vectojs/markdown`** 패키지에 있습니다(`@vectojs/ui@2.2.0`에서 `@vectojs/ui` 밖으로 이동됨). 배경과 구문 강조 텍스트를 자체적으로 그리며, 토큰당 하나의 자식 Entity를 사용하지 않습니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · CodeBlock</span></div>
  <iframe src="/sandbox/ui/component.html?name=codeblock&v=core-1.34.0-ui-2.15.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="CodeBlock 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>커스텀 렌더러가 아니라면 일반 문서에서는 `Markdown`을 통해 사용하세요.</figcaption>
</figure>

## 최소 예제

````ts
import { CodeBlock, Markdown } from '@vectojs/markdown';

// 대부분의 호출자는 Markdown이 CodeBlock 인스턴스를 생성하도록 해야 합니다:
const md = new Markdown('```ts\nscene.markDirty();\n```', { maxWidth: 520 });

// 커스텀 Markdown 서브클래스는 앱별 펜스 블록에 대해 CodeBlock을 반환할 수 있습니다.
````

펜스 블록은 정확한 소스를 Canvas와 동일한 삽입(inset) 및 기준선(baseline)에서 개별적으로 배치된 시각적 행으로 프로젝션합니다. 따라서 긴 소스 줄이 브라우저에 의해 자동 줄바꿈되어 복사, 페이지 내 검색 또는 네이티브 선택과 어긋나지 않습니다. 각 하드 줄바꿈은 선행하는 배치된 행에 속하므로, Firefox가 프로젝션 루트에서 선택된 조각을 생성하는 것을 방지합니다. 기본 스택은 `ui-monospace`로 시작하여, 명시적 커스텀 폰트를 존중하면서도 데스크톱 Firefox의 코드-비례 세리프 폰트 대체를 방지합니다.
Markdown은 `selectable` 설정을 전파하며, 직접 CodeBlock 사용자는 `setSelectable(boolean)`을 호출할 수 있습니다.

UI 1.9는 Core 1.8의 유지된 준비 콘텐츠 그리드(prepared-content grid)를 구문 강조 Canvas 페인트와 시맨틱 캐리어(carrier) 모두에 사용합니다. 탭, 이모지/ZWJ, 넓은 CJK, 아랍어 정렬, 혼합 방향 실행, 정확한 CR/LF/CRLF 소스 경계가 하나의 계획을 공유합니다. 보정(Calibration)은 콜드 폰트 로딩 패스이며, 안정적인 프로젝션 동기화는 Range 지오메트리를 읽거나 셀 캐리어를 교체하지 않습니다.

## 너비: `setWidth()`

```ts
codeBlock.setWidth(width: number): this
```

박스 너비를 변경합니다(`0.9.0+`). 그리드를 다시 만들거나 하이라이트를 다시 실행하지 **않습니다**. 의도된 동작입니다: 코드는 재배치되지 않습니다. 줄은 `col × cellWidth` 위치의 고정 고정폭 그리드에 놓이고 긴 줄은 줄바꿈 없이 넘치므로, `height`는 줄 **수**만의 함수이며 너비는 둥근 배경의 크기만 정합니다.

글리프 형상을 바꾸는 것—소스, 언어, 폰트—은 모두 `setCode()`를 거치며 거기서 그리드가 무효화됩니다. 너비가 변하지 않으면 아무 일도 하지 않고 `this`를 반환합니다.

`Markdown.setMaxWidth()`가 자신이 소유한 각 펜스 코드 블록에 대해 이를 호출하므로, `CodeBlock`을 직접 만들 때만 직접 호출이 필요합니다.

## 유지보수 체크리스트

- 펜스 코드를 하나의 리프 Entity로 유지하세요.
- 실시간 업데이트에는 `setCode()`를 사용하세요.
- 너비만 변경할 때는 `setWidth()`를 사용하세요. `setCode()`가 수행하는 그리드 재구축을 건너뜁니다.
- 콘텐츠 프로젝션을 정확한 소스, 폰트 및 줄 높이와 동기화된 상태로 유지하세요.
- Canvas 페인트, 포인터 커서, 복사 및 검색에 하나의 준비된 그리드를 재사용하세요.
- 분수 DPR/zoom에서 Chromium과 Firefox를 확인하세요(대체 폰트 및 변환된 블록 포함).
- 렌더러 확장을 작성하는 경우가 아니라면 상위 수준의 `Markdown` 컴포넌트를 선호하세요.
