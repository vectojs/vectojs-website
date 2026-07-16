---
title: 'VectoJS 簡介'
description: '簡要概述 VectoJS 是什麼、用途為何，以及下一步該往哪裡走。'
order: 1
---

# VectoJS 簡介

**VectoJS** 是一個畫布原生的 UI 執行環境，適用於視覺或互動複雜度無法以「每個東西一個 DOM 元素」來處理的介面。它將可見樹狀結構保存在 JavaScript 實體圖中——即**虛擬數學樹 (Virtual Math Tree)**——並將結果繪製到畫布分層上。

可互動的元件仍能將真實的語意 DOM 節點（`<button>`、`<input>`、`<a>` 等）投射到畫布上方。這種投射機制讓 VectoJS 的控制項保持無障礙、具備原生輸入能力，並可透過基於角色的自動化進行測試。

<figure>
  <img src="/images/intro-runtime-map.svg" alt="VectoJS 執行環境示意圖，顯示應用狀態流入虛擬數學樹，再進入布局、命中測試、畫布或 GPU 渲染，以及語意 DOM 投射。" class="diagram" />
  <figcaption>應用程式狀態更新一個保留的場景圖；該場景圖接著驅動像素、布局、事件和語意。</figcaption>
</figure>

## 接下來該讀什麼

原本的單頁簡介已拆分為多個主題章節：

| 如果你想了解…                                 | 請閱讀                                       |
| --------------------------------------------- | -------------------------------------------- |
| VectoJS 為何存在，以及何時 DOM 成了錯誤的工具 | [為何選擇 VectoJS](/learn/why-vectojs/)      |
| 執行環境、渲染迴圈和語意投射如何組合在一起    | [執行環境架構](/learn/runtime-architecture/) |
| 實作背後的八個核心數學/引擎概念               | [引擎概念](/learn/engine-concepts/)          |
| 哪些產品類別適合，哪些不適合                  | [使用案例](/learn/use-cases/)                |
| 如何建立第一個運行的場景                      | [快速入門](/learn/getting-started/)          |

## 簡短版

在你需要以下情況時使用 VectoJS：

- 數以千計的視覺實體，但不需要數千個帶樣式的 DOM 節點；
- 精確的變換、曲線、命中測試和數學布局；
- 畫布級別的視覺效果，搭配基於角色的無障礙和自動化；
- 高資料量、串流 UI、遊戲、圖表或 WebXR 面板；
- 用於測試、模擬和影片匯出的確定性步進。

當你在建立以文件為主的網站、重視 SEO 的文章、一般表單，或不需要自訂布局數學的 UI 時，請優先使用一般的 HTML/CSS。

## 套件地圖

| 套件                      | 用途                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `@vectojs/core`           | `Scene`、`Entity`、布局、文字、渲染器、事件、無障礙投射和數學工具                       |
| `@vectojs/ui`             | 高階元件：`Button`、`Input`、`Toggle`、`Markdown`、`ScrollView`、`Dropdown`、`Table` 等 |
| `@vectojs/three`          | 將 VectoJS 場景投射到 Three.js 紋理上，並將光線投射輸入路由回 2D                        |
| `@vectojs/video-exporter` | 用於 VectoJS 場景的固定步進 Chromium + FFmpeg H.264 匯出                                |

## 心智模型

VectoJS 不是 React 的替代品，不是 ECS，也不是零分配的宣稱。它是一個保留模式的畫布 UI 執行環境：

1. 應用狀態更新實體；
2. 實體計算布局、變換、命中測試和語意；
3. 髒場景透過選定的後端渲染；
4. 投射的 DOM 節點將互動表面暴露給輔助技術和代理。

本指南的其餘部分將詳細說明這些取捨。

## 下一步

- [為何選擇 VectoJS](/learn/why-vectojs/) — 問題空間與取捨。
- [快速入門](/learn/getting-started/) — 安裝並建立你的第一個場景。
- [核心場景](/learn/core-scene/) — 深入探討渲染迴圈、實體和變換。
