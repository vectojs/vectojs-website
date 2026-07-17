---
title: 'UI: TreeView'
description: '즉시 또는 지연 자식 로딩이 있는 계층적 트리 컴포넌트'
order: 34
---

# `TreeView`

`TreeView`는 확장 상태와 선택적 지연 자식 로딩으로 계층적 행을 렌더링합니다.

## 직접 사용해보기

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · TreeView</span></div>
  <iframe src="/sandbox/ui/component.html?name=treeview&v=core-1.9.2-ui-1.10.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="TreeView 라이브 데모" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>부모 행을 클릭하여 확장하거나 축소하세요.</figcaption>
</figure>

## 최소 예제

```ts
import { TreeView } from '@vectojs/ui';

const tree = new TreeView({
  width: 280,
  height: 360,
  nodes: [{ id: 'packages', label: 'packages', children: [{ id: 'ui', label: 'ui' }] }],
});
```

## 유지보수 체크리스트

- 확장, 축소 또는 노드 교체 후 행을 다시 빌드하세요.
- 지연 로더를 멱등(idempotent)으로 유지하세요.
- 선택 및 확장 상태에 안정적인 노드 ID를 사용하세요.
