---
title: 'UI: TextArea'
description: '캔버스 렌더링이 있는 여러 줄 네이티브 텍스트 편집'
order: 24
---

# `TextArea`

`TextArea`는 네이티브 `<textarea>`를 캔버스에 미러링하여 브라우저 편집 동작을 유지합니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TextArea</span></div>
  <iframe src="/sandbox/ui/component.html?name=textarea&v=core-1.11.1-ui-1.11.3" class="sandbox-frame component-demo-frame-tall" loading="eager" title="TextArea 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>여러 줄 편집은 네이티브이며, 캔버스는 시각적 미러를 그립니다.</figcaption>
</figure>

## 최소 예제

```ts
import { TextArea } from '@vectojs/ui';

const notes = new TextArea({
  width: 420,
  height: 140,
  placeholder: 'Write a note…',
  onChange: (value) => saveDraft(value),
});
```

## 유지보수 체크리스트

- 실제 여러 줄 텍스트 입력에는 이것을 사용하세요.
- 하나의 텍스트 편집 소유자를 유지하세요. 캔버스에서 IME나 클립보드를 가장(fake)하지 마세요.
- 포인터 클릭뿐만 아니라 키보드 선택 및 붙여넣기로도 테스트하세요.
- 투명한 네이티브 textarea는 캔버스 폰트, 줄 높이, 패딩 및 `border-box` 계약을 상속하므로, 클릭-투-캐럿 및 선택 행이 보이는 캔버스 미러와 동일한 지오메트리를 사용합니다.
