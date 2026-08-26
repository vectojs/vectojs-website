+++
title = "引擎概念"
description = "VectoJS 背後八個數學與架構理念。"
weight = 4
+++

# 引擎概念

VectoJS 建立在一個精簡的數學與執行環境理念集合之上。本頁是導覽圖；更深入的推導請見[數學基礎](/learn/math-foundations/)。

<figure>
  <img src="/images/engine-concepts-map.svg" alt="概念圖，以虛擬數學樹為中心，連接仿射變換、命中測試、冷熱布局、集合差文字流、語意投射、彈簧運動和 SpatialHashGrid。" class="diagram" />
  <figcaption>虛擬數學樹是樞紐；變換、布局、命中測試、運動和語意投射是執行環境的輻條。</figcaption>
</figure>

## 1. 虛擬數學樹

VMT 將可視 DOM 子樹替換為一個由局部化座標系統組成的 JavaScript 場景圖。遍歷、命中測試和無障礙同步仍然是實際工作，但視覺布局避免了為每個實體進行瀏覽器樣式和重排。

- 理論：[數學基礎：VMT](/learn/math-foundations/#1-xu-ni-shu-xue-shu-vmt)
- 實作：[核心場景](/learn/core-scene/)

## 2. 語意投射覆蓋層

符合條件的可互動實體會在其畫布邊界上方投射真實的透明 DOM 節點。畫布擁有像素；DOM 投射擁有角色/名稱/狀態和原生輸入行為。

- 理論：[數學基礎：a11yRoot](/learn/math-foundations/#2-yu-yi-yin-ying-dom-a11yroot)
- 實作：[無障礙](/learn/accessibility/)

## 3. 仿射變換

實體的平移、縮放和旋轉沿樹向下組合。`worldToLocal()` 以解析方式反轉變換，使指標事件能對應到目標實體的本地座標。

- 理論：[數學基礎：仿射變換](/learn/math-foundations/#3-fang-she-bian-huan)

## 4. 冷/熱布局

文字布局將昂貴的內容準備與響應式換行分開。內容變化走冷路徑；寬度變化可以重用已準備好的測量結果。

- 理論：[數學基礎：冷/熱分離](/learn/math-foundations/#4-leng-re-fen-li-bu-ju-yin-qing)
- 實作：[文字與排版](/learn/text-typography/)

## 5. 集合差文字流

繞過障礙物的換行可以建模為區間減法：

$$I_{\text{allowed}} = I_0 \setminus \bigcup E_k$$

- 理論：[數學基礎：集合差代數](/learn/math-foundations/#5-wen-zi-liu-de-ji-he-chai-dai-shu)

## 6. 取樣樣條命中測試

`SplineEntity` 將曲線取樣為快取的線段，並比較指標與這些線段的平方距離。這避免了像素讀取，並且比僅使用 AABB 的命中測試更精確。

- 理論：[數學基礎：取樣樣條命中測試](/learn/math-foundations/#6-qu-yang-yang-tiao-ming-zhong-ce-shi)

## 7. 半隱式尤拉動力學

中斷的 UI 過渡被建模為彈簧系統，而非一次性 CSS 計時器。目標可以在運動途中改變，而運動保持連續。

- 理論：[數學基礎：ODE 動力學](/learn/math-foundations/#7-wei-fen-fang-cheng-shi-yu-ban-yin-shi-you-la-qiu-jie-qi)
- 實作：[物理與動畫](/learn/physics-engine/)

## 8. SpatialHashGrid 工具

VectoJS 匯出一個固定單元的 `SpatialHashGrid`，用於應用程式擁有的近鄰查詢。Scene 不會自動為每個實體填充它。

- 理論：[數學基礎：SpatialHashGrid 工具](/learn/math-foundations/#8-spatialhashgrid-gong-ju)
- 實作：[效能](/learn/performance/)

## 下一步

- [執行環境架構](/learn/runtime-architecture/) 將這些概念連接到幀管線。
- [數學基礎](/learn/math-foundations/) 深入探討公式。
