+++
title = "執行環境架構"
description = "Scene、Entity、渲染迴圈、無障礙投射和後端如何組合在一起。"
weight = 3

[extra]
order = 3
+++

# 執行環境架構

VectoJS 圍繞著每個畫布一個 `Scene` 和一個保留的 `Entity` 實例樹來組織。該樹儲存視覺狀態、布局狀態、事件行為和語意元資料。

<figure>
  <img src="/images/vmt-architecture.svg" alt="VMT 架構圖，顯示實體樹、畫布渲染和無障礙陰影層" class="diagram" />
  <figcaption>Scene 遍歷虛擬數學樹，將像素渲染到畫布，並將語意投射到 DOM。</figcaption>
</figure>

## 虛擬數學樹

每個實體具有：

- `x`、`y`、`scaleX`、`scaleY`、`rotation` 和 `opacity`；
- `width` 和 `height` 作為邊界；
- 一個 `children` 陣列；
- 用於狀態變化的 `update(dt, time)`；
- 用於在本地座標中繪製的 `render(renderer)`；
- 用於命中測試的 `isPointInside(globalX, globalY)`；
- 可選的用於投射語意的 `getA11yAttributes()`。

變換會沿樹向下組合。在對巢狀或已變換的實體進行命中測試時，請使用 `worldToLocal()`。

## 幀管線

<figure>
  <iframe src="/sandbox/diagram-pipeline.html" class="diagram-frame" loading="lazy" title="VectoJS 渲染迴圈：一個髒幀的六個階段，由 VectoJS 即時渲染" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>一個髒幀：更新、剔除、渲染、提交後端批次，然後同步投射的 DOM。</figcaption>
</figure>

## 無障礙投射

一個透明的 DOM 層位於畫布上方。可互動的實體可以投射真實元素，如 `<button>`、`<input>`、`<a>` 和帶有角色的 `<div>` 節點。

該層使畫布 UI：

- 可被螢幕閱讀器發現；
- 可透過鍵盤和原生表單控制項操作；
- 可使用 Playwright 角色選擇器進行測試；
- 可被依賴 DOM 語意的 AI 代理驅動。

投射並不能取代設計審查。應用程式仍需負責標籤、焦點順序、鍵盤行為、對比度和減少動畫行為。

## 渲染後端

| 後端             | 使用時機                    | 能力                            |
| ---------------- | --------------------------- | ------------------------------- |
| `CanvasRenderer` | 預設                        | Canvas 2D，支援裝置像素比例縮放 |
| WebGL 點層       | `pointBackend: 'webgl'`     | 批次化圓形/矩形和 GPU 字形路徑  |
| WebGPU 計算      | `particleBackend: 'webgpu'` | 計算驅動的粒子系統，附備援方案  |
| `SVGRenderer`    | `scene.toSVG()`             | 無頭 SVG 匯出                   |

後端選擇只有在後端匹配瓶頸時才有幫助。如果文字布局或應用計算佔主導地位，將 Canvas 改為 WebGL 並不會修復慢速路徑。

## 生命週期

```ts
const scene = new Scene(canvas, { maxFPS: 60 });
scene.renderMode = 'onDemand';
scene.resize(width, height);
scene.start();

// 稍後
scene.destroy();
```

當宿主元件卸載時，務必銷毀場景。一個 Scene 擁有渲染器資源、觀察者、工作執行緒、投射的 DOM 和事件狀態。

## 下一步

- [引擎概念](/learn/engine-concepts/) 說明數學支柱。
- [核心場景](/learn/core-scene/) 展示實際 API。
