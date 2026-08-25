+++
title = "Slider"
description = "WAI-ARIA 슬라이더 규약을 노출하고 온디맨드(on-demand) 씬에서 부드럽게 다시 그리는 캔버스 슬라이더 컴포넌트"
weight = 13
+++

# `Slider`

`Slider`는 포인터 기반 범위 컨트롤입니다. 트랙, 진행 및 thumb을 캔버스에 그리고, `role="slider"`를 `valuemin`, `valuemax` 및 실시간 `value` 메타데이터와 함께 노출합니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Slider</span></div>
  <iframe src="/sandbox/ui/slider.html?v=core-1.39.0-ui-2.20.1" class="sandbox-frame component-demo-frame component-demo-frame-tall" loading="eager" title="Slider 라이브 데모" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>thumb을 드래그하면 동일한 변경 이벤트에서 레이블과 진행 표시줄이 업데이트되는 것을 확인하세요.</figcaption>
</figure>

## 최소 예제

```ts
import { Slider, Text } from '@vectojs/ui';

const label = new Text('Quality: 64%');
const slider = new Slider({
  min: 0,
  max: 100,
  value: 64,
  width: 320,
  onChange(value) {
    label.setText(`Quality: ${value}%`);
    scene.markDirty();
  },
});
```

## 생성자

```ts
new Slider({
  label?: string;            // accessible name — set this
  min?: number;              // default 0
  max?: number;              // default 100
  value?: number;            // default min
  width?: number;            // default 200
  height?: number;           // default 24
  trackColor?: string;
  progressColor?: string;
  handleColor?: string;
  focusColor?: string;       // 2.7.0+ — focus ring around the handle
  onChange?: (value: number) => void;
})
```

`focused`는 키보드 포커스를 추적하고 핸들 주위에 2px의 `focusColor` 링(기본값 `'#00f0ff'`)을 그립니다. `@vectojs/ui@2.7.0` 이전에는 슬라이더가 키보드로 완전히 조작 가능했음에도 **포커스 표시를 전혀 그리지 않았습니다** — 화살표 키, `Home`, `End` 모두 작동했지만 포커스가 어디 있는지 알려줄 화면 표시가 없었습니다(WCAG 2.4.7). 강제 색상 모드에서는 대신 시스템 `Highlight` 색상을 사용합니다.

`Slider`를 서브클래스화하고 `render()`를 재구현하는 경우 링을 그대로 구현하세요. 또한 `focus`/`blur` 시 씬을 더티로 표시하지 않으면 `onDemand` 씬은 이를 표시하기 위해 다시 칠해지지 않습니다.

> **`label`을 설정하세요.** 접근 가능한 이름이 없는 `role=\"slider\"`는 단순히 "슬라이더"로 읽히며, 스크린 리더 사용자에게 무엇을 제어하는지 전혀 알려주지 않습니다(WCAG 4.1.2). 캔버스에 그린 시각적 레이블은 의미론적 계층에 도달하지 않으므로 여기에도 전달하세요. `label`을 생략하면 값에서 이름을 파생하지 않고 `aria-label`이 설정되지 않은 상태로 남습니다 — 잘못된 이름은 없는 것보다 나쁩니다. `@vectojs/ui@2.2.0`부터 사용 가능합니다.

## 이벤트

`Slider`는 포인터 입력이 반올림된 값을 변경한 후 `{ value }`와 함께 `change`를 방출합니다. 동일한 값에서 반복되는 포인터 이벤트는 중복 변경을 방출하지 않습니다.

## 유지보수 체크리스트

- 포인터 업데이트는 로컬 X를 `[0,width]`로 클램프해야 합니다.
- 값 변경은 `scene.markDirty()`를 호출하여 `renderMode = 'onDemand'`가 부드럽게 유지되도록 해야 합니다.
- 역할 메타데이터를 현재 값과 동기화된 상태로 유지하세요.

관련 문서: [`ProgressBar`](/reference/ui-components/#progressbar), [`Input`](/reference/ui-components/#input), [`Button`](/reference/ui-button/).
