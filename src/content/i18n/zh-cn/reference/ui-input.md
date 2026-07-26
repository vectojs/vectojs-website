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
  <iframe src="/sandbox/ui/component.html?name=input&v=core-1.16.3-ui-2.2.0" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Input live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## IME 输入法组合

当 IME 组合处于活动状态时，组件会在组合范围下方绘制下划线。在此期间**选择高亮被抑制**：在选中文本上进行组合会在逻辑上替换该范围，但原生元素在组合提交之前仍报告组合前的 `selectionStart`/`selectionEnd`——绘制它会显示一个在组合下划线后面（且更宽）的过时高亮。零长度组合（初始 `compositionstart`）仍然显示选择，因为尚未有任何内容替换它。

## 维护者检查清单

- 使用 `Input` 而不是自定义的文本输入实体。
- 保持 placeholder 有意义；它同时也是默认的无障碍标签。
- 在实现受控更新时有意保留选择。
