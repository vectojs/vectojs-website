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
  <iframe src="/sandbox/ui/component.html?name=dropdown&v=core-1.32.2-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Dropdown 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

닫힌 트리거는 `bg`/`color`를 사용하며, 열린 메뉴의 옵션 행은 모두 2.7.0에서 추가된 자체 5개 props를 사용합니다:

| 속성              | 기본값                      | 적용 대상               |
| ----------------- | --------------------------- | ----------------------- |
| `menuBg`          | `'rgba(15, 23, 42, 0.95)'`  | 모든 옵션 행            |
| `menuColor`       | `'#fff'`                    | 옵션 행 텍스트          |
| `menuSelectedBg`  | `'rgba(0, 240, 255, 0.25)'` | 선택된 행               |
| `menuHighlightBg` | `'rgba(0, 240, 255, 0.4)'`  | 키보드로 강조 표시된 행 |
| `focusColor`      | `'#00f0ff'`                 | 트리거 및 옵션 행       |

```ts
new Dropdown(['1x', '1.5x', '2x'], {
  label: 'Playback rate',
  bg: 'rgba(18, 23, 34, 0.98)',
  menuBg: 'rgba(18, 23, 34, 0.98)',
  menuColor: '#e2e8f0',
  menuSelectedBg: 'rgba(244, 63, 94, 0.30)',
  menuHighlightBg: 'rgba(244, 63, 94, 0.55)',
  focusColor: '#60a5fa',
});
```

이러한 props가 존재하기 전에는 트리거만 테마를 지정할 수 있었고 메뉴는 불가능했으므로, 밝은 또는 따뜻한 팔레트용으로 스타일된 드롭다운은 시안 선택 색상이 있는 어두운 패널을 열었습니다 — 이는 스타일 선택이 아닌 렌더링 버그처럼 보입니다.

값을 고를 때 알아두면 좋은 두 가지:

- **두 행 상태가 동시에 적용될 수 있으며**, 메뉴를 열면 선택된 행이 강조 표시되므로 `menuHighlightBg`가 둘 중 더 강한 것으로 읽혀야 합니다.
- **옵션 행 자체가 포커스 가능**하며(`role="option"`), 따라서 `focusColor` 링은 강조 표시된 행_위에_ 그려집니다. 링과 `menuHighlightBg` 사이에 최소 3:1(WCAG SC 1.4.11)의 대비를 유지하세요 — 강조의 알파를 `menuSelectedBg`와 구분될 만큼 높이면 링이 그 기준 아래로 조용히 떨어질 수 있습니다.

거의 불투명한 메뉴 배경이 일반적으로 옳습니다: 움직이는 캔버스 콘텐츠 위의 반투명 메뉴는 대비로는 읽을 수 있지만 여전히 노이즈처럼 보입니다.

## 유지보수 체크리스트

- `expanded`, `controls`, `activedescendant` 메타데이터를 동기화된 상태로 유지하세요.
- 외부 클릭과 Escape 키로 오버레이를 닫으세요.
- ArrowUp, ArrowDown, Enter, Space, Escape 키를 테스트하세요.
