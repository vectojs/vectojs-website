+++
title = "시작하기"
description = "VectoJS를 설치하고, Scene을 생성한 후 Input, Toggle, Slider, Button, ScrollView로 구성된 완전한 설정 패널을 구축합니다."
weight = 7

[extra]
order = 7
+++

# 시작하기

이 가이드는 VectoJS를 설치하고 완전한 인터랙티브 설정 패널을 구축하는 과정을 안내합니다 — 폼, 레이아웃, 스크롤, 접근성을 모두 다루는 실용적인 예제입니다.

## 설치

```bash
bun add @vectojs/core @vectojs/ui
```

VectoJS는 코어 런타임과 고수준 컴포넌트 라이브러리로 분할되어 있습니다. 대부분의 앱은 두 패키지를 모두 임포트합니다. `@vectojs/core`는 그것이 기반으로 하는 독립형 엔진 — `@vectojs/text`, `@vectojs/layout`, `@vectojs/math`, `@vectojs/animation` — 을 번들하고 재-내보내기하므로 이 두 패키지 설치만으로 충분합니다. 더 작은 의존성 표면을 원할 때만 이들 패키지를 개별적으로 사용하세요.

## HTML 설정

VectoJS는 위치가 지정된 부모 요소를 가진 `<canvas>` 요소가 필요합니다:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My VectoJS App</title>
    <style>
      body {
        margin: 0;
        overflow: hidden;
        background: #0a0a0f;
      }
      #app {
        position: relative;
        width: 100vw;
        height: 100vh;
      }
      #canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
    </style>
  </head>
  <body>
    <div id="app">
      <canvas id="canvas"></canvas>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

부모 `<div id="app">`는 `position: relative`여야 합니다 — VectoJS는 접근성 섀도우 레이어를 캔버스의 형제 요소로 absolute-positioned로 삽입합니다. `Scene`이 자동으로 이를 강제하지만, 명시적으로 설정하면 시각적 점프를 방지할 수 있습니다.

## Scene 생성

```typescript
// src/main.ts
import { Scene } from '@vectojs/core';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, {
  maxFPS: 60,
  pointBackend: 'canvas', // 대규모 포인트 클라우드는 'webgl'
});

scene.start();
```

> [!NOTE]
> 생성자는 `new Scene(canvas: HTMLCanvasElement, options?)`입니다. DOM 요소를 받으며, `{ canvasId }` 문자열이 아닙니다.

## 라이브로 체험하기

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · @vectojs/core</span></div>
  <iframe src="/sandbox/getting-started.html" class="sandbox-frame" loading="lazy" title="시작하기 인터랙티브 예제" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>카운터 + Toggle + Slider — 모두 DOM 컴포넌트 없이 캔버스에서 실행됩니다. 클릭하여 상호작용해 보세요.</figcaption>
</figure>

## 첫 번째 컴포넌트

`Toggle`을 추가하여 모든 것이 제대로 연결되었는지 확인합니다:

```typescript
import { Toggle } from '@vectojs/ui';

const toggle = new Toggle({
  label: 'Dark mode',
  checked: true,
  onChange: (checked) => console.log('dark mode:', checked),
});

toggle.setPosition(40, 40);
scene.add(toggle);
```

브라우저를 열고 DOM을 검사해 보면 캔버스 위에 실제 `<div role="switch" aria-checked="true" aria-label="Dark mode">`가 있는 것을 확인할 수 있습니다. `page.getByRole('switch', { name: 'Dark mode' }).click()`을 호출하는 Playwright 테스트도 정상 작동합니다.

---

## 설정 패널 구축

이제 더 완성도 높은 예제를 만들어 보겠습니다: 텍스트 입력, 토글, 슬라이더, 제출 버튼이 있는 스크롤 가능한 설정 패널입니다. 모든 상태는 일반 객체에 저장되며, 컴포넌트는 이를 읽고 씁니다.

```typescript
import { Scene } from '@vectojs/core';
import { Stack, Card, Text, Input, Toggle, Slider, Button, ScrollView } from '@vectojs/ui';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  username: '',
  notifications: true,
  highPerformance: false,
  particleCount: 5000,
};

// ── Helper: section heading ───────────────────────────────────────────────────
function heading(text: string): Text {
  return new Text(text, { font: '600 13px Inter', color: '#64748b' });
}

// ── Username field ────────────────────────────────────────────────────────────
const usernameLabel = heading('USERNAME');

const usernameInput = new Input({
  width: 320,
  height: 40,
  placeholder: 'your-username',
  value: state.username,
  font: '16px Inter',
  onChange: (value) => {
    state.username = value;
  },
});

// ── Toggle: notifications ─────────────────────────────────────────────────────
const notifLabel = heading('NOTIFICATIONS');

const notifToggle = new Toggle({
  label: 'Email notifications',
  checked: state.notifications,
  accent: '#6366f1',
  onChange: (checked) => {
    state.notifications = checked;
  },
});

// ── Toggle: high performance ──────────────────────────────────────────────────
const perfToggle = new Toggle({
  label: 'High-performance mode',
  checked: state.highPerformance,
  accent: '#6366f1',
  onChange: (checked) => {
    state.highPerformance = checked;
  },
});

// ── Slider: particle count ────────────────────────────────────────────────────
const particleLabel = heading('MAX PARTICLES');

const particleCountDisplay = new Text(`${state.particleCount.toLocaleString()}`, {
  font: '600 14px Inter',
  color: '#00f0ff',
});

const particleSlider = new Slider({
  min: 1000,
  max: 50000,
  value: state.particleCount,
  width: 280,
  progressColor: '#6366f1',
});

particleSlider.on('change', (e) => {
  state.particleCount = e.value;
  particleCountDisplay.setText(e.value.toLocaleString());
});

// Lay out label + display side by side
const particleRow = new Stack({ direction: 'horizontal', gap: 12, align: 'center' });
particleRow.add(particleLabel);
particleRow.add(particleCountDisplay);

// ── Save button ───────────────────────────────────────────────────────────────
const saveBtn = new Button('Save settings', {
  bg: '#6366f1',
  hoverBg: '#818cf8',
  padding: 14,
  onClick: () => {
    console.log('Saved:', state);
    saveBtn.animate({ scaleX: 0.95, scaleY: 0.95 }, 80).animate({ scaleX: 1, scaleY: 1 }, 80);
  },
});

// ── Main layout stack ─────────────────────────────────────────────────────────
const content = new Stack({ direction: 'vertical', gap: 20 });
content.add(usernameLabel);
content.add(usernameInput);
content.add(notifLabel);
content.add(notifToggle);
content.add(perfToggle);
content.add(particleRow);
content.add(particleSlider);
content.add(saveBtn);

// ── Scrollable card ───────────────────────────────────────────────────────────
const PANEL_W = 400;
const PANEL_H = 480;
const PADDING = 24;

const scroll = new ScrollView({ width: PANEL_W - PADDING * 2, height: PANEL_H - PADDING * 2 });
content.setPosition(0, 0);
scroll.add(content);

const card = new Card({
  width: PANEL_W,
  height: PANEL_H,
  radius: 16,
  border: 'rgba(255,255,255,0.08)',
  label: 'Settings panel', // makes the card a role="group" landmark
});

const titleText = new Text('Settings', { font: '700 22px Inter', color: '#f8fafc' });
titleText.setPosition(PADDING, PADDING);
card.add(titleText);

scroll.setPosition(PADDING, PADDING + 40);
card.add(scroll);

// Centre the card on screen
const cx = (window.innerWidth - PANEL_W) / 2;
const cy = (window.innerHeight - PANEL_H) / 2;
card.setPosition(cx, cy);
scene.add(card);

scene.start();

// ── Responsive resize ─────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  scene.resize(window.innerWidth, window.innerHeight);
  card.setPosition((window.innerWidth - PANEL_W) / 2, (window.innerHeight - PANEL_H) / 2);
});
```

### 결과물

- **`Stack`**은 자식을 수직으로 20px 간격으로 배치합니다 — 수동 `x`/`y` 계산이 필요 없습니다.
- **`ScrollView`**는 콘텐츠가 패널 높이를 초과하면 클리핑하고 스크롤할 수 있게 합니다.
- **`Card`**는 둥근 사각형 배경을 그리며, `label`이 설정되면 `role="group"` 랜드마크를 투영하여 스크린 리더가 영역을 인식합니다.
- **`Input`**은 실제 `<input>` 섀도우 요소로 뒷받침되므로 IME, 클립보드, 실행 취소, 자동 완성이 모두 작동합니다.
- **`Button`**은 레이블에 맞게 자동 크기가 조정되며, 캔버스 클릭과 섀도우 `<button>` 모두에서 `onClick`을 실행합니다.
- 모든 컴포넌트는 `state` 객체에 직접 연결됩니다.

---

## 프레임워크 통합

VectoJS는 `<canvas>`에 마운트되므로, WebGL 라이브러리와 동일한 방식으로 모든 프레임워크와 통합됩니다.

### React

```typescript
import { useEffect, useRef } from 'react';
import { Scene } from '@vectojs/core';
import { Button } from '@vectojs/ui';

export function VectoCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const scene = new Scene(ref.current!, { maxFPS: 60 });
    const btn = new Button('Click me');
    btn.setPosition(40, 40);
    scene.add(btn);
    scene.start();

    return () => scene.destroy();
  }, []);

  return <canvas ref={ref} style={{ width: '100%', height: '100%' }} />;
}
```

### Vue 3

```typescript
<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { Scene } from '@vectojs/core';

const canvasRef = ref(null);
let scene;

onMounted(() => {
  scene = new Scene(canvasRef.value, { maxFPS: 60 });
  scene.start();
});

onUnmounted(() => scene?.destroy());
</script>

<template>
  <canvas ref="canvasRef" style="width:100%;height:100%" />
</template>
```

---

## 도전 과제

### 카운터 추가

설정 패널을 확장하여 Save 버튼이 클릭된 횟수를 추적하고 버튼 옆에 누적 합계를 표시하세요.

- `state` 객체에 `0`으로 초기화된 `clickCount` 변수를 추가합니다.
- `'Saved 0 times'`를 표시하는 `Text` Entity를 생성하고, 수평 `Stack`을 사용하여 `saveBtn` 옆에 배치합니다.
- 매 클릭마다 `entity.setText(...)`를 사용하여 텍스트를 업데이트하고, 각 누름 후 카운트가 올바르게 증가하는지 확인합니다.

### 반응형 레이아웃

뷰포트가 480px보다 좁을 때 패널이 우아하게 재배치되도록 만드세요. 카드가 창 가장자리를 초과하지 않아야 합니다.

- `resize` 이벤트 핸들러에서 `window.innerWidth`를 `PANEL_W`와 비교하고, 양쪽에 최소 여백 16px을 적용한 클램프된 패널 너비를 계산합니다.
- 모든 리사이즈 시 `card.width`, `ScrollView` 너비, `usernameInput` 너비를 새 패널 너비에 맞게 업데이트합니다.
- 브라우저 창을 320px 너비로 리사이즈하여 모든 콘텐츠가 계속 표시되고 카드 경계 밖으로 클리핑되지 않는지 확인합니다.

### 테마 토글

패널 헤더에 다크/라이트 테마 전환 스위치를 추가하여 모든 컴포넌트의 시각적 스타일을 즉시 업데이트하세요.

- 두 개의 테마 객체를 정의합니다 — 하나는 다크(현재 색상), 하나는 라이트 — 각각 카드 테두리 색상, 제목 텍스트 색상, 레이블 텍스트 색상, 버튼 배경 값을 지정합니다.
- `'Light mode'` 레이블이 있는 `Toggle`을 `ScrollView` 위에 추가하고, `change` 이벤트를 연결하여 활성 테마의 색상 값을 모든 관련 Entity에 적용합니다.
- 테마가 변경될 때 카드의 `border` 속성과 `titleText` 색상이 모두 업데이트되고, 각 속성 업데이트 후 `scene.markDirty()`를 호출하여 캔버스가 다시 그려지도록 합니다.

## 다음 단계

- [Core Scene](/learn/core-scene/) — 렌더 루프, 변환 시스템, 유휴 스로틀 심층 탐구
- [커스텀 Entity](/learn/custom-entity/) — 나만의 캔버스 컴포넌트 구축하기
- [이벤트 및 히트 테스팅](/learn/events/) — 포인터 및 키보드 이벤트가 트리를 통해 전파되는 방식
- [Core API 레퍼런스](/reference/core-api/) — 전체 `Scene`, `Entity`, `IRenderer` 시그니처
