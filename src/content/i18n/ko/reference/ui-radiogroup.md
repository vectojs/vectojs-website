---
title: 'UI: RadioGroup'
description: '하나의 캔버스 컴포넌트로 렌더링된 상호 배타적 라디오 선택'
order: 28
---

# `RadioGroup`

`RadioGroup`은 상호 배타적인 옵션 집합을 렌더링하고 그룹 수준의 시맨틱 역할을 노출합니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · RadioGroup</span></div>
  <iframe src="/sandbox/ui/component.html?name=radiogroup&v=core-1.32.3-ui-2.13.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="RadioGroup 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>데모는 좁은 너비에서 가로와 세로 레이아웃 사이를 전환합니다.</figcaption>
</figure>

## 최소 예제

```ts
import { RadioGroup } from '@vectojs/ui';

const renderer = new RadioGroup({
  value: 'webgpu',
  direction: 'horizontal',
  options: [
    { value: 'canvas', label: 'Canvas' },
    { value: 'webgl', label: 'WebGL' },
    { value: 'webgpu', label: 'WebGPU' },
  ],
});
```

`RadioGroup`는 `{ role: 'radiogroup', label }`을 프로젝션합니다. 2.8.0부터 그룹 자체의 접근 가능한 이름을 설정할 수 있으며, 기본값은 일반적인 `'Radio group'`입니다:

```ts
new RadioGroup({
  label: 'Render backend',
  options: [
    { value: 'canvas', label: 'Canvas' },
    { value: 'webgl', label: 'WebGL' },
  ],
});
```

각 옵션은 고유한 이름을 가지지만, _어떤 선택이 이루어지는지_ 알려주는 것은 그룹의 이름입니다. 화면에 그룹이 두 개 이상 있는 경우 기본값으로는 스크린 리더 사용자가 "Radio group"을 반복적으로 듣게 되고 구분할 방법이 없습니다 — 그룹을 식별하는 시각적 제목이 그룹의 일부가 아니라 캔버스에 그려진 경우에는 반드시 설정하세요(WCAG 4.1.2). 또한 생성 후 공개 필드로 설정할 수도 있습니다.

## 유지보수 체크리스트

- 선택된 시각적 상태와 방출된 값을 일치시키세요.
- 비활성화된 스타일링과 동작을 함께 사용하세요.
- 레이블, 폰트 또는 방향이 변경될 때 레이아웃을 다시 계산하세요.
