---
title: 'Slider'
description: 'WAI-ARIA 슬라이더 규약을 노출하고 온디맨드(on-demand) 씬에서 부드럽게 다시 그리는 캔버스 슬라이더 컴포넌트'
order: 13
---

# `Slider`

`Slider`는 포인터 기반 범위 컨트롤입니다. 트랙, 진행 및 thumb을 캔버스에 그리고, `role="slider"`를 `valuemin`, `valuemax` 및 실시간 `value` 메타데이터와 함께 노출합니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Slider</span></div>
  <iframe src="/sandbox/ui/slider.html?v=core-1.9.2-ui-1.10.0" class="sandbox-frame component-demo-frame component-demo-frame-tall" loading="eager" title="Slider 라이브 데모" sandbox="allow-scripts allow-same-origin"></iframe>
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
  min?: number;              // default 0
  max?: number;              // default 100
  value?: number;            // default min
  width?: number;            // default 200
  height?: number;           // default 24
  trackColor?: string;
  progressColor?: string;
  handleColor?: string;
  onChange?: (value: number) => void;
})
```

## 이벤트

`Slider`는 포인터 입력이 반올림된 값을 변경한 후 `{ value }`와 함께 `change`를 방출합니다. 동일한 값에서 반복되는 포인터 이벤트는 중복 변경을 방출하지 않습니다.

## 유지보수 체크리스트

- 포인터 업데이트는 로컬 X를 `[0,width]`로 클램프해야 합니다.
- 값 변경은 `scene.markDirty()`를 호출하여 `renderMode = 'onDemand'`가 부드럽게 유지되도록 해야 합니다.
- 역할 메타데이터를 현재 값과 동기화된 상태로 유지하세요.

관련 문서: [`ProgressBar`](/reference/ui-components/#progressbar), [`Input`](/reference/ui-components/#input), [`Button`](/reference/ui-button/).
