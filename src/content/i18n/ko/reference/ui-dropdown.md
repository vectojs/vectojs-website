---
title: 'UI: Dropdown'
description: '오버레이 리스트박스와 키보드 내비게이션이 있는 콤보박스 컨트롤'
order: 27
---

# `Dropdown`

`Dropdown`은 캔버스 버튼을 감싸고 `role="combobox"`를 프로젝션하며 오버레이 리스트박스를 엽니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Dropdown</span></div>
  <iframe src="/sandbox/ui/component.html?name=dropdown&v=core-1.18.0-ui-2.3.2" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Dropdown 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>포인터나 키보드로 열 수 있습니다. 메뉴는 씬 오버레이 경로를 통해 마운트됩니다.</figcaption>
</figure>

## 최소 예제

```ts
import { Dropdown } from '@vectojs/ui';

const backend = new Dropdown(['Canvas', 'WebGL', 'WebGPU'], {
  label: 'Renderer backend',
  width: 220,
  onChange: (value) => setBackend(value),
});
```

> **`label`을 설정하세요.** 접근 가능한 이름이 없는 `role=\"combobox\"`는 단순히 "콤보박스"로 읽힙니다(WCAG 4.1.2). 선택된 값만으로는 컨트롤의 용도를 알 수 없습니다. 캔버스에 그려진 시각적 레이블은 의미론적 계층에 도달하지 않으므로 여기에도 전달하세요. `@vectojs/ui@2.2.0`부터 사용 가능합니다.

## 유지보수 체크리스트

- `expanded`, `controls`, `activedescendant` 메타데이터를 동기화된 상태로 유지하세요.
- 외부 클릭과 Escape 키로 오버레이를 닫으세요.
- ArrowUp, ArrowDown, Enter, Space, Escape 키를 테스트하세요.
