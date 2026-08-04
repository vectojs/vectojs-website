---
title: 'UI: Card'
description: '선택적 role=group 시맨틱이 있는 둥근 캔버스 패널 컴포넌트'
order: 20
---

# `Card`

`Card`는 `@vectojs/ui` 예제 전반에서 사용되는 기본 시각적 패널입니다. 기본적으로 장식용이며, `label`을 전달하면 시맨틱 그룹이 됩니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Card</span></div>
  <iframe src="/sandbox/ui/component.html?name=card&v=core-1.30.0-ui-2.12.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Card 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>Card는 배경과 테두리를 소유하며, 자식 요소는 Card의 로컬 공간에 배치됩니다.</figcaption>
</figure>

## 최소 예제

```ts
import { Card, Text } from '@vectojs/ui';

const card = new Card({
  width: 320,
  height: 180,
  radius: 18,
  border: 'rgba(148,163,184,0.2)',
  label: 'Settings panel',
});

card.add(new Text('Settings').setPosition(24, 24));
scene.add(card);
```

## 카드 전체 클릭 대상

`onClick`을 전달하면 전체 카드를 누를 수 있게 됩니다 — 더 이상 투명한 `Button`을 `Card` 위에 쌓아 클릭 가능하게 만들 필요가 없으며, 이전에는 빈 레이블 버튼으로 a11y 프로젝션을 오염시키고 씬 감사에서 `overlap` 노이즈를 생성했습니다. `onClick`에는 `label`이 필요합니다: 접근 가능한 이름이 없는 대화형 영역은 한 레벨 위에서 동일한 문제를 재현하므로, `Card`는 조용히 받아들이는 대신 오류를 throw합니다.

```ts
const card = new Card({
  width: 320,
  height: 96,
  label: 'Open settings',
  onClick: () => openSettingsPanel(),
});
```

## 호스팅된 콘텐츠 크기 조정 (`setContent`)

`Card.setContent(content, fit?)`는 카드 내에 단일 콘텐츠 엔터티를 배치하고, 기본적으로 해당 `width`/`height`를 카드 자체 박스에 동기화합니다 — `Panel.setContent`가 사용하는 것과 동일한 `fitContent` 계약입니다([`ResizablePanel`](/reference/ui-resizable-panel/) 참조). `fit`의 기본값은 `true`(양축 추적)입니다. `false` 또는 축별 `{ width, height }`를 전달하면 기존 위치-전용 동작으로 폴백합니다.

```ts
const card = new Card({ width: 320, height: 180 });
card.setContent(new SomeContentEntity()); // 320×180으로 크기 조정, card.width/height 변경 시 재동기화
```

이는 일반 `add()`와 별개입니다: 수동으로 배치하는 장식(아이콘, 레이블)에는 `add()`를 사용하여 카드 리사이즈와 관계없이 작성자 지정 크기를 유지합니다. 카드를 항상 채워야 하는 단일 엔터티에는 `setContent()`를 사용하세요.

자체 크기 조정 콘텐츠에는 `fit: false`를 전달하세요 — 자체 `width`/`height`가 작성자 설정이 아닌 콘텐츠에서 파생되는 엔터티(예: `maxWidth` 없는 기본 `Text`). 기본 `fit: true`는 해당 엔터티의 자체 계산된 박스를 매 프레임 덮어씁니다. 카드 내에서 중앙/채우기를 원하면 먼저 `Stack`/`Flow`로 래핑하거나, `fit: false`로 직접 크기를 조정하세요. 자세한 내용은 [Resizable panels](/reference/ui-resizable-panel/)의 전체 설명을 참조하세요 — 동일한 `fitContent` 계약, 동일한 주의사항.

## 유지보수 체크리스트

- 영역이 검색 가능해야 하는 경우에만 `label`을 사용하세요.
- `padding`이 자식 레이아웃을 자동으로 배치한다고 가정하지 마세요.
- 유지보수 가능한 레이아웃을 위해 Card 내부에서는 `Stack` 또는 `Flow`를 선호하세요.
- 카드 전체 클릭 대상에는 오버레이 `Button`을 쌓는 것보다 `onClick`을 선호하세요.
- 카드를 채우는 단일 엔터티에는 `add()` + 수동 크기 동기화보다 `setContent()`를 선호하세요.
