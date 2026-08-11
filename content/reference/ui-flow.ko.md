+++
title = "UI: Flow"
description = "칩, 태그 및 반응형 툴바를 위한 가로 줄바꿈 레이아웃 컨테이너"
weight = 22

[extra]
order = 22
+++

# `Flow`

`Flow`는 가로 줄바꿈용으로 미리 구성된 `Stack`입니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Flow</span></div>
  <iframe src="/sandbox/ui/component.html?name=flow&v=core-1.34.0-ui-2.15.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Flow 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>`maxWidth`를 사용하여 자식 요소가 다음 줄로 넘어가는 위치를 정의하세요.</figcaption>
</figure>

## 최소 예제

```ts
import { Button, Flow } from '@vectojs/ui';

const chips = new Flow({ gap: 8, maxWidth: 360 });
for (const label of ['Canvas', 'WebGL', 'WebGPU']) {
  chips.add(new Button(label, { padding: 8 }));
}
```

## 유지보수 체크리스트

- 자식 크기가 변경된 후 `layout()`을 다시 실행하세요.
- 칩 터치 대상이 모바일에서 충분히 크게 유지되도록 하세요.
- 태그 행에는 수동 x/y 배치보다 `Flow`를 선호하세요.
