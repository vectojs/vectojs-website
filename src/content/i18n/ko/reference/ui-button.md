---
title: 'Button'
description: '접근성과 자동화를 위한 시맨틱 버튼 프로젝션이 있는 캔버스 렌더링 버튼 컴포넌트'
order: 12
---

# `Button`

`Button`은 둥근 캔버스 버튼을 렌더링하고 동일한 영역 위에 실제 투명 `<button>`을 프로젝션합니다. 사용자는 캔버스 픽셀을 보고, 스크린 리더와 자동화 도구는 시맨틱 노드를 조작합니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Button</span></div>
  <iframe src="/sandbox/ui/button.html?v=core-1.16.3-ui-2.2.0" class="sandbox-frame component-demo-frame" loading="eager" title="Button 라이브 데모" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>호버(Hover)하면 그려진 상태가 변경됩니다. 클릭은 Playwright가 찾을 수 있는 동일한 button 역할(role)을 통해 전달됩니다.</figcaption>
</figure>

## 최소 예제

```ts
import { Scene } from '@vectojs/core';
import { Button } from '@vectojs/ui';

const scene = new Scene(canvas);
scene.renderMode = 'onDemand';

scene.add(
  new Button('Save changes', {
    onClick: () => save(),
  }).setPosition(40, 40),
);

scene.start();
```

## 생성자

```ts
new Button(label: string, opts?: ButtonOptions & { width?: number; height?: number })

interface ButtonOptions {
  onClick?: (event: unknown) => void;
  bg?: string;
  hoverBg?: string;
  color?: string;
  font?: string;
  padding?: number;
  radius?: number;
}
```

## 접근성 및 자동화

`Button`은 `{ tag: 'button', role: 'button', label }`을 노출하므로, 테스트는 픽셀 대신 시맨틱 컨트롤을 대상으로 해야 합니다:

```ts
await page.getByRole('button', { name: 'Save changes' }).click();
```

## 강제 색상(고대비)

`Button`은 [`Scene.forcedColors`](/reference/core-scene/#accessibility--appearance)를 읽고, OS가 강제 색상 모드일 때 테마 팔레트 대신 CSS 시스템 색상으로 다시 칠합니다: `ButtonFace` 채우기, `ButtonText` 레이블과 1px `ButtonText` 테두리(시스템 배경에서 모양이 보이도록),그리고 `Highlight` 포커스 링. Canvas 픽셀은 브라우저의 강제 색상 리매핑에서 면제되므로, 이 처리를 건너뛴 컴포넌트는 고대비 모드에서 읽을 수 없습니다. 설정이 전환되면 씬이 자동으로 다시 칠해집니다.

## 유지보수 체크리스트

- `onDemand` 씬에서 호버와 포인터 이동 시 `scene.markDirty()`를 호출해야 합니다.
- 시각적 버튼 레이블과 접근 가능한 레이블은 향후 옵션이 명시적 접근 가능한 이름을 추가하지 않는 한 동일하게 유지해야 합니다.
- 문서 예제에서는 사용자 정의 클릭 가능한 사각형 대신 `Button`을 우선 사용하세요.
- 사용자 정의 버튼 컴포넌트는 위의 강제 색상 분기를 미러링해야 합니다.

관련 문서: [`Toggle`](/reference/ui-components/#toggle), [`Checkbox`](/reference/ui-components/#checkbox), [`Overlay`](/reference/ui-overlay/).
