---
title: 'UI: Link'
description: '시맨틱 앵커 프로젝션이 있는 독립형 캔버스 렌더링 링크'
order: 18
---

# `Link`

`Link`는 독립형 내비게이션 텍스트를 위한 것입니다. 문장 내 인라인 링크는 `RichText` 또는 `Markdown`을 사용하세요.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Link</span></div>
  <iframe src="/sandbox/ui/component.html?name=link&v=core-1.16.0-ui-2.1.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Link 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>보이는 텍스트는 캔버스이며, 자동화 및 보조 기술은 실제 앵커를 인식합니다.</figcaption>
</figure>

## 최소 예제

```ts
import { Link } from '@vectojs/ui';

scene.add(
  new Link('Open docs ↗', {
    href: 'https://vectojs.org',
  }).setPosition(24, 24),
);
```

## 유지보수 체크리스트

- `href`를 열거나 프로젝션하기 전에 URL을 살균(sanitize)하세요.
- 보이는 레이블과 접근 가능한 이름을 일치시키세요.
- 문단에 포함된 링크에는 `RichText`를 선호하세요.
