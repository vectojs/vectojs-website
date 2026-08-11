+++
title = "VectoJS 简介"
description = "VectoJS 是什么、用于什么场景，以及下一步去哪里。"
weight = 1

[extra]
order = 1
+++

# VectoJS 简介

VectoJS 是一个**基于 Canvas 的原生 UI 运行时**，使用虚拟数学树（VMT）架构直接在 HTML5 Canvas 上渲染界面。

## 为什么选择 VectoJS？

传统 Web UI 依赖 DOM——通过 CSS 样式化和 JavaScript 操作的 HTML 元素树。这对文档很有效，但对以下场景会引入开销：

- **高频更新**（动画、实时数据）
- **大量实体**（数千个 UI 元素）
- **复杂布局**（自定义定位、基于物理的运动）

VectoJS 完全绕过 DOM，在单个 `<canvas>` 元素上渲染一切，同时通过语义投影保持完整的可访问性。

## 核心概念

这是占位符介绍。完整内容迁移推迟到下一个会话。
