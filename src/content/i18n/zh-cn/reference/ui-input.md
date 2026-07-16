---
title: 'UI：Input'
description: '将原生编辑行为镜像到 canvas 上的单行文本输入框。'
order: 23
---

# `Input`

`Input` 使用真实的透明 `<input>` 进行编辑，同时在 canvas 上绘制可见字段。IME、剪贴板、选择和自动化都保持原生。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Input</span></div>
  <iframe src="/sandbox/ui/component.html?name=input&v=core-1.9.0-ui-1.9.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Input live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
  <figcaption>通过键盘输入或基于角色的自动化填充文本框。</figcaption>
</figure>

## 最小示例

```ts
import { Input } from '@vectojs/ui';

const name = new Input({
  width: 320,
  placeholder: 'Project name',
  onChange: (value) => updateProjectName(value),
});
```

## 维护者检查清单

- 使用 `Input` 而不是自定义的文本输入实体。
- 保持 placeholder 有意义；它同时也是默认的无障碍标签。
- 在实现受控更新时有意保留选择。
