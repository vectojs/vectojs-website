+++
title = "UI：Input"
description = "将原生编辑行为镜像到 canvas 上的单行文本输入框。"
weight = 23
+++

# `Input`

`Input` 使用真实的透明 `<input>` 进行编辑，同时在 canvas 上绘制可见字段。IME、剪贴板、选择和自动化都保持原生。

## 试试看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Input</span></div>
  <iframe src="/sandbox/ui/component.html?name=input&v=core-1.39.0-ui-2.20.1" class="sandbox-frame component-demo-frame-tall" loading="eager" title="Input live demo" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
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

## 验证状态 (2.3.0+)

`required` 和 `invalid` 不仅仅影响边框，还会传达到无障碍树中：

```ts
const email = new Input({ width: 240, placeholder: 'Email', required: true });
email.invalid = !isValidEmail(email.value); // 红色边框 + aria-invalid
```

`required` 会作为**原生** `required` 属性投影到影子 `<input>`/`<textarea>` 上，因此它参与表单验证和 `:invalid` 样式，而不仅仅是描述约束条件。`invalid` 会变为 `aria-invalid`。

清除 `invalid` 会**移除**该属性，而不是将其设置为 `"false"` —— 这两者含义不同，因为 `aria-invalid="false"` 断言的是“明确有效”。

单独一个红色边框对于屏幕阅读器和无法分辨颜色的用户是不可见的（WCAG 1.4.1），这就是为什么该状态会被投影出来而不仅仅是绘制出来。在强制色彩模式下，这两种状态都会遵循系统颜色。

`TextArea` 接受相同的两个选项。

## IME 输入法组合

当 IME 组合处于活动状态时，组件会在组合范围下方绘制下划线。在此期间**选择高亮被抑制**：在选中文本上进行组合会在逻辑上替换该范围，但原生元素在组合提交之前仍报告组合前的 `selectionStart`/`selectionEnd`——绘制它会显示一个在组合下划线后面（且更宽）的过时高亮。零长度组合（初始 `compositionstart`）仍然显示选择，因为尚未有任何内容替换它。

## 维护者检查清单

- 使用 `Input` 而不是自定义的文本输入实体。
- 保持 placeholder 有意义；它同时也是默认的无障碍标签。
- 在实现受控更新时有意保留选择。
