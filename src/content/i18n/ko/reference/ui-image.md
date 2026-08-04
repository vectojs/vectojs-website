---
title: 'UI: Image'
description: '플레이스홀더 렌더링과 시맨틱 img 프로젝션이 있는 캔버스 이미지 컴포넌트'
order: 19
---

# `Image`

`Image`는 비동기적으로 로드된 비트맵을 캔버스에 그리고 시맨틱 `<img>` 노드를 프로젝션합니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Image</span></div>
  <iframe src="/sandbox/ui/component.html?name=image&v=core-1.30.0-ui-2.12.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Image 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>이미지 로드 콜백이 씬을 더티(dirty)로 표시할 때까지 플레이스홀더가 그려집니다.</figcaption>
</figure>

## 최소 예제

```ts
import { Image } from '@vectojs/ui';

const logo = new Image('/logo.svg', {
  width: 160,
  height: 80,
  alt: 'Vecto logo',
  onLoad: () => scene.markDirty(),
});
```

## 유지보수 체크리스트

- 항상 `width`와 `height`를 제공하세요.
- 장식용이 아닌 이미지에는 의미 있는 `alt` 텍스트를 제공하세요.
- `onDemand` 씬에서는 `onLoad`에서 `scene.markDirty()`를 호출하세요.
