---
title: 'UI: Text'
description: '줄바꿈, 핫 max-width 재흐름 및 시맨틱 레이블이 있는 캔버스 텍스트 컴포넌트'
order: 16
---

# `Text`

`Text`는 캔버스에 단일 스타일의 여러 줄 텍스트를 렌더링합니다. VectoJS UI 내에서 레이블, 도움말 텍스트, 제목 및 짧은 읽기 전용 텍스트를 위한 기본 선택입니다. 투명한 콘텐츠 프로젝션은 소프트 줄바꿈, 명시적 줄바꿈, CJK 텍스트, 합자 및 RTL 문단에서 정확한 논리적 소스 텍스트를 유지하므로, 네이티브 선택, 복사, 페이지 내 검색 및 번역이 시각적 글리프 순서를 상속받지 않습니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Text</span></div>
  <iframe src="/sandbox/ui/component.html?name=text&v=core-1.9.2-ui-1.10.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Text 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>페이지 크기를 조정하여 집중된 뷰포트에서 핫 `maxWidth` 재흐름을 확인하세요.</figcaption>
</figure>

## 최소 예제

```ts
import { Text } from '@vectojs/ui';

const heading = new Text('Mathematical canvas UI', {
  font: '700 24px Inter, system-ui',
  color: '#f8fafc',
  maxWidth: 360,
  lineHeight: 32,
  selectable: true,
});

scene.add(heading.setPosition(24, 24));
```

## 유지보수 체크리스트

- 반응형 너비 변경에는 `setMaxWidth()`를 사용하세요.
- 콘텐츠 변경에는 `setText()` 또는 `append()`를 사용하세요.
- 드래그 제스처가 브라우저 선택 대신 텍스트 영역을 소유해야 하는 경우 `setSelectable(false)`를 사용하세요.
- 애플리케이션 소스를 논리적 유니코드 순서로 유지하세요. VectoJS와 브라우저가 아랍어/히브리어 방향을 자동으로 처리합니다.
- Core 1.8은 변환된 2차원 지오메트리에서 포인터 커서를 해결합니다. 회전, 미러링 또는 비균일 배율 조정된 텍스트에 뷰포트-X 전용 선택 핸들러를 추가하지 마세요.
- 인라인 스타일이나 링크가 필요하면 `RichText`를 선호하세요.
