+++
title = "Button"
description = "具有語意 button 投射的 canvas 渲染按鈕元件，用於無障礙和自動化。"
weight = 12
+++

# `Button`

`Button` 渲染一個圓角 canvas 按鈕，並在相同的框上投射一個真實的透明 `<button>`。使用者看到 canvas 像素；螢幕閱讀器和自動化工具則操作語意節點。

## 試試看

<figure class="sandbox component-demo">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">live · Button</span></div>
  <iframe src="/sandbox/ui/button.html?v=core-1.39.0-ui-2.20.1" class="sandbox-frame component-demo-frame" loading="eager" title="Button live demo" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>懸停會改變繪製的狀態。點擊會透過 Playwright 能找到的相同 button 角色路由。</figcaption>
</figure>

## 最小範例

```ts
import { Scene } from '@vectojs/core';
import { Button } from '@vectojs/ui';

const scene = new Scene(canvas);
scene.renderMode = 'onDemand';

scene.add(
  new Button('Save changes', {
    onClick: () => save(),
  }).setPosition(40, 40),
);

scene.start();
```

## 建構函式

```ts
new Button(label: string, opts?: ButtonOptions & { width?: number; height?: number })

interface ButtonOptions {
  onClick?: (event: unknown) => void;
  bg?: string;
  hoverBg?: string;
  color?: string;
  font?: string;
  padding?: number;
  radius?: number;
  focusColor?: string;       // 2.7.0+ — focus-ring color, default '#00f0ff'
}
```

焦點環以 2px 描邊繪製，顏色為 `focusColor`。在任何不是青色預設值所針對的深色預設調色盤主題上設定它：

```ts
const save = new Button('Save', { bg: '#f43f5e', focusColor: '#60a5fa' });
```

焦點環是鍵盤使用者不可或缺的唯一提示，因此它應在你的表面上清晰可辨，而不只是存在——目標應超過 3:1 非文字對比度下限（WCAG SC 1.4.11），並選擇與強調色不同的色相，使焦點永遠不會被誤讀為普通的強調效果。強制色彩模式會忽略它而使用系統的 `Highlight` 顏色，因此設定它不會破壞高對比度。

## 無障礙與自動化

`Button` 公開 `{ tag: 'button', role: 'button', label }`，因此測試應鎖定語意控制項而非像素：

```ts
await page.getByRole('button', { name: 'Save changes' }).click();
```

### `disabled` (2.3.0+)

`disabled` 繪製時會呈現靜音（暗淡）狀態，**並且**投射到陰影 `<button>` 上，因此視力正常使用者看到的內容與螢幕閱讀器報告的內容不會產生分歧。可在建構後設定：

```ts
const save = new Button('Save', { onClick: submit });
save.disabled = true; // 靜音填色，投射 `disabled`，丟棄懸停/焦點狀態
```

它同時也阻擋了來自**雙方**輸入路徑的 `onClick`。瀏覽器會抑制對已停用 `<button>` 的 DOM 點擊，但 canvas 的點擊測試會獨立分派 — 因此單靠原生屬性是不夠的。

啟用狀態的按鈕會省略該屬性，而不是寫入 `disabled="false"`，這在原生 `<button>` 上仍會將其停用。

## 強制色彩（高對比度）

`Button` 讀取 [`Scene.forcedColors`](/reference/core-scene/#無障礙與外觀)，當作業系統處於強制色彩模式時，使用 CSS 系統色彩而非主題調色盤重新繪製：`ButtonFace` 填色、`ButtonText` 標籤加上 1px `ButtonText` 邊框（使形狀在系統背景上可見），以及 `Highlight` 焦點環。Canvas 像素不受瀏覽器強制色彩重映射的影響，因此跳過此步驟的元件在高對比度模式下將無法辨識。當設定切換時，場景會自動重新繪製。

## 維護者檢查清單

- 在 `onDemand` 場景中，懸停和指標離開必須呼叫 `scene.markDirty()`。
- 除非未來的選項加入明確的無障礙名稱，否則視覺按鈕標籤和無障礙標籤必須保持一致。
- 在文件範例中優先使用 `Button` 而非自訂的可點擊矩形。
- 自訂按鈕元件應鏡像上述強制色彩分支。

相關：[`Toggle`](/reference/ui-components/#toggle)、[`Checkbox`](/reference/ui-components/#checkbox)、[`Overlay`](/reference/ui-overlay/)。
