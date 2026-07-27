---
title: 'UI: RichText'
description: '링크 핫스팟과 스트리밍 추가 지원이 있는 다중 스타일 인라인 텍스트 컴포넌트'
order: 17
---

# `RichText`

`RichText`는 혼합된 스팬을 공유 기준선에 배치합니다: 볼드, 이탤릭, 색상, 크기 및 인라인 링크.
프로젝션은 모양이 지정된 시각적 글리프가 아닌 논리적 소스 실행을 재구성하여, 혼합 폰트 크기, 합자, 아랍어/히브리어 텍스트, 소프트 줄바꿈 및 하드 줄바꿈을 통해 정확한 클립보드 텍스트를 보존합니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · RichText</span></div>
  <iframe src="/sandbox/ui/component.html?name=richtext&v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame-tall" loading="eager" title="RichText 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>인라인 링크는 캔버스 텍스트 위의 투명한 앵커 핫스팟입니다.</figcaption>
</figure>

## 최소 예제

```ts
import { RichText } from '@vectojs/ui';

const copy = new RichText(
  [
    { text: 'Mixed ' },
    { text: 'weight', style: { bold: true, color: '#22d3ee' } },
    { text: ' with ' },
    { text: 'links', style: { href: '/learn/accessibility/' } },
  ],
  {
    maxWidth: 420,
    selectable: true,
    onLinkClick: (href) => router.open(href),
  },
);
```

## 유지보수 체크리스트

- 문단, 제목 및 목록 렌더러를 통해 링크 콜백이 연결되도록 유지하세요.
- 토큰 스트리밍에는 `appendSpans()`를 사용하세요.
- `getContentProjection()`은 실행별 폰트, 공유 Canvas 기준선 및 실제 라인 진행이 포함된 하나의 명시적 시각적 행을 전달합니다. 이렇게 하면 브라우저가 스팬을 다시 흐르게 하지 않고 혼합 크기 선택 사각형이 정렬됩니다.
  논리적 구분선은 선행하는 배치된 행에 속하므로, 여러 줄 선택이 루트-원점 강조 표시 조각을 생성하지 않습니다.
  Core 1.8은 변환된 2차원 Range 지오메트리(회전, 반사 및 비균일 배율 포함)에서 합법적 그래핌 커서를 해결합니다.
  네이티브 드래그 선택이 필요하지 않은 경우 `setSelectable(false)`를 사용하세요.
- 텍스트가 로컬 사각형 주위로 흘러야 할 때 `setExclusions()`를 사용하세요.
