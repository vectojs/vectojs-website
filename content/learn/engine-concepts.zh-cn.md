+++
title = "引擎概念"
description = "VectoJS背后的八个数学和架构思想。"
weight = 4
+++

# 引擎概念

VectoJS建立在一小组数学和运行时思想之上。本页是一张地图；更深入的推导在[数学基础](/learn/math-foundations/)中。

<figure>
  <img src="/images/engine-concepts-map.svg" alt="概念图，虚拟数学树在中心，连接到仿射变换、命中测试、冷热布局、集合差文本流、语义投影、弹簧运动和SpatialHashGrid。" class="diagram" />
  <figcaption>虚拟数学树是枢纽；变换、布局、命中测试、运动和语义投影是运行时辐条。</figcaption>
</figure>

## 1. 虚拟数学树

VMT将可视化DOM子树替换为JavaScript场景图，由局部坐标系组成。遍历、命中测试和无障碍同步仍然是实际工作，但视觉布局避免了每个实体的浏览器样式和重排。

- 理论：[数学基础：VMT](/learn/math-foundations/#1-xu-ni-shu-xue-shu-vmt)
- 实践：[核心场景](/learn/core-scene/)

## 2. 语义投影覆盖层

符合条件的交互实体在其canvas边界上投影透明的真实DOM节点。Canvas拥有像素；DOM投影拥有角色/名称/状态和原生输入行为。

- 理论：[数学基础：a11yRoot](/learn/math-foundations/#2-yu-yi-ying-zi-dom-a11yroot)
- 实践：[无障碍](/learn/accessibility/)

## 3. 仿射变换

实体的平移、缩放和旋转在树中向下组合。`worldToLocal()`分析地反转变换，以便指针事件可以映射到目标实体的局部坐标中。

- 理论：[数学基础：仿射变换](/learn/math-foundations/#3-fang-she-bian-huan)

## 4. 冷/热布局

文本布局将昂贵的内容准备与响应式换行分开。内容变化走冷路径；宽度变化可以重用准备好的度量。

- 理论：[数学基础：冷/热拆分](/learn/math-foundations/#4-leng-re-chai-fen-bu-ju-yin-qing)
- 实践：[文本与排版](/learn/text-typography/)

## 5. 集合差文本流

围绕障碍物的换行可以建模为区间减法：

$$I_{\text{allowed}} = I_0 \setminus \bigcup E_k$$

- 理论：[数学基础：集合差代数](/learn/math-foundations/#5-wen-ben-liu-de-ji-he-chai-dai-shu)

## 6. 采样样条命中测试

`SplineEntity`将曲线采样到缓存的线段中，并比较指针到这些线段的平方距离。这避免了像素读取，并且比纯AABB命中测试更精确。

- 理论：[数学基础：采样样条命中测试](/learn/math-foundations/#6-cai-yang-yang-tiao-ming-zhong-ce-shi)

## 7. 半隐式欧拉动量

中断的UI过渡被建模为类似弹簧的系统，而不是一次性CSS定时器。目标可以在途中改变，而运动保持连续。

- 理论：[数学基础：ODE动力学](/learn/math-foundations/#7-wei-fen-fang-cheng-yu-ban-yin-shi-ou-la-qiu-jie-qi)
- 实践：[物理与动画](/learn/physics-engine/)

## 8. SpatialHashGrid工具

VectoJS导出一个固定单元格的`SpatialHashGrid`，供应用程序拥有的邻近查询使用。Scene不会自动为每个实体填充它。

- 理论：[数学基础：SpatialHashGrid工具](/learn/math-foundations/#8-spatialhashgridgong-ju)
- 实践：[性能](/learn/performance/)

## 下一步

- [运行时架构](/learn/runtime-architecture/) 将这些概念连接到帧管线。
- [数学基础](/learn/math-foundations/) 深入探讨公式。
