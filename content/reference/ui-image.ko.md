+++
title = "UI: Image"
description = "플레이스홀더 렌더링과 시맨틱 img 프로젝션이 있는 캔버스 이미지 컴포넌트"
weight = 19
+++

# `Image`

`Image`는 비동기적으로 로드된 비트맵을 캔버스에 그리고 시맨틱 `<img>` 노드를 프로젝션합니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Image</span></div>
  <iframe src="/sandbox/ui/component.html?name=image&v=core-1.32.0-ui-2.13.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Image 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## 맞춤(fitting), 초점 크롭, 그리고 둥근 모서리

`fit`은 로드된 비트맵이 `width` × `height` 박스에 매핑되는 방식을 제어하고, `focalPoint`는 `'cover'` 크롭을 세밀하게 조정합니다 — 둘 다 2.18.0+입니다.

| `fit`       | 동작                                                                              |
| ----------- | --------------------------------------------------------------------------------- |
| `'fill'`    | 박스에 맞게 늘립니다(기본값, 레거시 동작).                                        |
| `'cover'`   | 종횡비를 유지하고, 박스를 채우며, 넘치는 부분을 `focalPoint` 기준으로 크롭합니다. |
| `'contain'` | 종횡비를 유지하고, 전체 비트맵을 박스 안에 맞춥니다(중앙 정렬).                   |

`focalPoint`는 각 축이 `0..1` 범위인 `{ x, y }`입니다 — `0`은 위/왼쪽, `1`은 아래/오른쪽, 기본값은 `{ x: 0.5, y: 0.5 }`입니다. `'cover'`만 이를 읽으며, `[0, 1]`을 벗어난 값은 클램프됩니다. `radius`는 이제 플레이스홀더뿐 아니라 로드된 비트맵의 모서리도 둥글게 만들므로, `fit: 'cover'`가 적용된 둥근 아바타는 크롭된 넘침을 동일한 실루엣으로 잘라냅니다.

```ts
import { Image, type ImageFit, type ImageFocalPoint } from '@vectojs/ui';

const avatar = new Image('/avatar.jpg', {
  width: 96,
  height: 96,
  fit: 'cover',
  focalPoint: { x: 0.5, y: 0.25 }, // bias toward the top of the frame
  radius: 48, // circle-crop the loaded bitmap
  alt: 'Profile photo',
});
```

## 유지보수 체크리스트

- 항상 `width`와 `height`를 제공하세요.
- 장식용이 아닌 이미지에는 의미 있는 `alt` 텍스트를 제공하세요.
- `onDemand` 씬에서는 `onLoad`에서 `scene.markDirty()`를 호출하세요.
- 옵션 객체는 **필수**입니다 — 옵션 없이 `new Image(src)`를 호출하면 오류가 발생합니다.
- 교차 출처(cross-origin) `src`(예: CORS 헤더가 없는 CDN SVG)는 캔버스를 오염시켜 이후의 모든 `getImageData`/`toDataURL`을 깨뜨립니다. 동일 출처에서 안전하게 그리려면 자산을 `data:image/svg+xml` URL로 인라인하세요.
