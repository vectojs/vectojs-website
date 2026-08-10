---
title: 'UI: Table'
description: '컴팩트한 데이터 미리보기 및 Markdown 테이블 출력을 위한 캔버스 네이티브 그리드 테이블'
order: 31
---

# `Table`

`Table`은 완전한 `grid` › `row` › `gridcell`/`columnheader` 트리를 프로젝션하고, 캔버스에 자체 크롬을 그리며, 각 셀을 자식 Entity로 소유합니다. 문자열 셀은 `Text`로 정규화됩니다; 제공된 Entity 셀은 공개 `setMaxWidth()` 및 `setSelectable()` 기능을 통해 참여할 수 있습니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Table</span></div>
  <iframe src="/sandbox/ui/component.html?name=table&v=core-1.34.0-ui-2.15.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Table 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## 반응형 너비: `setWidth()`

```ts
table.setWidth(width: number): this
```

전체 너비를 변경하고 열을 비례적으로 재조정한 뒤 다시 레이아웃합니다(`2.11.0+`). `width`에 대입하는 대신 이 메서드를 사용하세요. 대입만으로는 충분하지 않습니다: `colWidths`는 **생성자에서 한 번만** 그때 주어진 너비로부터 해결되며, 각 셀의 줄바꿈 너비와 위치, 정렬은 `width`가 아니라 그 **열별** 수치에서 파생됩니다. 따라서 `width`를 재대입한 테이블은 테두리는 새 크기로 그리면서 셀은 이전 크기 기준으로 배치된 상태로 남습니다.

열은 상대 비율을 유지하므로 명시적인 `colWidths` 비율은 첫 호출에서 균등 분할로 되돌려지지 않고 크기 변경을 견딥니다. 너비가 변하지 않으면 아무 일도 하지 않고, 최소 1로 제한되며 `this`를 반환합니다.

## 접근성 및 키보드

프로젝션된 트리는 실제 ARIA 그리드입니다: 고정된 `columnheader` 행과 **보이는** 각 행당 하나의 `row` (가상화 인식), 각 셀은 포커스 가능한 `gridcell` 핫스팟입니다. 정확히 하나의 셀이 **루빙 tabindex**를 가지므로 그리드 전체가 하나의 탭 정지입니다.

| 키                   | 동작                                             |
| -------------------- | ------------------------------------------------ |
| 화살표               | 포커스된 셀을 2D에서 한 단계 이동 (헤더는 행 -1) |
| Home / End           | 현재 행의 첫 번째/마지막 열                      |
| Ctrl+Home / Ctrl+End | 첫 번째 헤더 셀 / 마지막 본문 셀                 |

대상 셀은 포커스가 이동하기 전에 뷰로 스크롤됩니다. [복합 위젯](/reference/core-a11y/#복합-위젯-로빙-tabindex)을 참조하세요.

## 포인터 및 터치

- **셀 간 드래그**는 네이티브로 텍스트를 선택합니다 (셀 프로젝션이 포인터를 소유—위 참조).
- **수직 드래그**로 가상화된 본문을 1:1로 스크롤하므로 터치스크린에서도 사용 가능하며, 휠에만 국한되지 않습니다.
- **휠**로 가상화된 본문을 스크롤합니다.

## 유지보수 체크리스트

- `colWidths` 길이를 헤더와 정렬하세요; 유효한 너비는 Table 너비로 정규화됩니다.
- 각 논리적 셀에 고유한 Entity 인스턴스를 사용하세요.
- 셀 내용이나 차원이 변경된 후 `layout()`을 호출하세요.
- 대규모 데이터셋에는 가상화를 사용하세요; `Table`은 컴팩트 그리드용입니다.
- 그리드 레이블을 설명적으로 유지하세요.
- 너비나 애플리케이션 zoom 변경 후 헤더/본문 셀 간 드래그 선택을 확인하세요.
- 가상화나 열 수를 변경한 후 키보드 탐색이 모든 셀에 도달하는지 확인하세요.
