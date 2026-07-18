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
  <iframe src="/sandbox/ui/component.html?name=radiogroup&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="RadioGroup 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## 유지보수 체크리스트

- 선택된 시각적 상태와 방출된 값을 일치시키세요.
- 비활성화된 스타일링과 동작을 함께 사용하세요.
- 레이블, 폰트 또는 방향이 변경될 때 레이아웃을 다시 계산하세요.
