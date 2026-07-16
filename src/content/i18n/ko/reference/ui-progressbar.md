---
title: 'UI: ProgressBar'
description: '선택적 백분율 레이블과 progressbar 시맨틱이 있는 캔버스 진행 표시기'
order: 30
---

# `ProgressBar`

`ProgressBar`는 트랙, 채워진 강조 영역 및 선택적 백분율 텍스트를 그립니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · ProgressBar</span></div>
  <iframe src="/sandbox/ui/component.html?name=progressbar&v=core-1.9.2-ui-1.9.5" class="sandbox-frame component-demo-frame-tall" loading="eager" title="ProgressBar 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>`setValue()`를 사용하여 진행 변경사항을 클램프하고 다시 그리세요.</figcaption>
</figure>

## 최소 예제

```ts
import { ProgressBar } from '@vectojs/ui';

const progress = new ProgressBar({
  value: 0.72,
  width: 320,
  height: 22,
  showText: true,
});

progress.setValue(0.9);
```

## 유지보수 체크리스트

- 값을 `[0, 1]` 범위로 클램프하세요.
- 진행 색상을 텍스트 또는 시맨틱 값과 함께 사용하세요.
- 값이 변경될 때 `scene.markDirty()`를 호출하세요.
