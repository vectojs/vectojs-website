---
title: 'UI: Table'
description: '컴팩트한 데이터 미리보기 및 Markdown 테이블 출력을 위한 캔버스 네이티브 그리드 테이블'
order: 31
---

# `Table`

`Table`은 `role="grid"`를 노출하고, 캔버스에 자체 크롬을 그리며, 각 셀을 자식 Entity로 소유합니다. 문자열 셀은 `Text`로 정규화되며, 제공된 Entity 셀은 공개 `setMaxWidth()` 및 `setSelectable()` 기능을 통해 참여할 수 있습니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Table</span></div>
  <iframe src="/sandbox/ui/component.html?name=table&v=core-1.9.2-ui-1.9.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Table 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>거대한 갤러리 내부에서 테이블 출력을 디버깅하는 대신 컬럼 크기 조정에 초점을 맞춘 데모를 사용하세요.</figcaption>
</figure>

## 최소 예제

```ts
import { Table } from '@vectojs/ui';

const table = new Table({
  width: 520,
  headers: ['Component', 'Role'],
  rows: [
    ['Button', 'button'],
    ['Input', 'textbox'],
  ],
  selectable: true,
});
```

`layout()`은 모든 셀을 제약하고, 행/테이블 높이를 계산하며, 렌더링 전에 자식을 배치합니다. `render()`는 그리기 전용입니다. 외부에서 제공된 Entity 셀을 변경하거나 공개 문자열 데이터를 변경한 후에는 `table.layout()`을 호출하세요. 각 논리적 셀은 하나의 콘텐츠 프로젝션을 소유하므로, 브라우저 선택 및 페이지 내 검색이 테이블 텍스트를 중복하지 않습니다.

선택은 셀이 소유하며 테이블이 소유하지 않습니다: 문자열 셀은 선택 가능한 `Text`로 정규화되고, 제공된 Entity는 지원 시 `setSelectable()`을 받으며, Markdown 테이블도 동일한 계약을 상속합니다. 따라서 셀 간 드래그는 Canvas가 유일한 시각적 렌더러로 남아 있는 동안 논리적 셀 텍스트를 정확히 한 번 복사합니다. 구조적 `role="grid"` 섀도우는 셀 프로젝션에서 포인터 이벤트를 캡처하지 않습니다. 이 리프 소유권이 VMT 텍스트와 정확히 한 번 정렬된 셀 간 드래그 선택, Ctrl/Command+C 및 페이지 내 검색을 유지하는 방식입니다.

## 유지보수 체크리스트

- `colWidths` 길이를 헤더와 일치시키세요. 유효한 너비는 Table 너비로 정규화됩니다.
- 논리적 셀당 고유한 Entity 인스턴스를 사용하세요.
- 셀 콘텐츠 또는 크기가 변경된 후 `layout()`을 호출하세요.
- 대규모 데이터 세트에는 가상화를 사용하세요. `Table`은 컴팩트 그리드용입니다.
- 그리드 레이블을 설명적으로 유지하세요.
- 너비 또는 애플리케이션 zoom 변경 후 헤더/본문 셀 간 드래그 선택을 확인하세요.
