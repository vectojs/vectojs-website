---
title: 'Events & Hit-Testing'
description: 'ポインターとキーボードのイベントがVectoJSエンティティツリーをどう流れるか：キャプチャ、バブル、VectoJSEvent、フォーム変更ペイロード、findEntityAt。'
order: 10
---

# Events & Hit-Testing

VectoJSはDOMライクな**キャプチャ + バブル**のイベントモデルを使います。ブラウザの`addEventListener`を使ったことがあれば、その仕組みは同一です——ただしツリーのトラバーサルはDOMではなくVirtual Math Tree上で実行されます。

## ライブで試す

<figure class="sandbox">
  <div class="sandbox-bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="sandbox-label">ライブ · @vectojs/core</span></div>
  <iframe src="/sandbox/events.html" class="sandbox-frame" loading="lazy" title="Events & Hit-Testing interactive example" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>3つのカスタム Entity サブクラス——ホバーでスケール、クリックでカウント。それぞれが<code>on('hover')</code>、<code>on('pointerleave')</code>、<code>on('click')</code>を配線します。</figcaption>
</figure>

## イベントのライフサイクル

ユーザーがキャンバス上でクリック（またはタップ、ホバー）すると、Sceneは：

1. `findEntityAt(x, y)`を呼び出して**ターゲット**——`isPointInside()`が`true`を返す最前面のエンティティ——を見つけます。
2. **イベントパス**を構築します：`[target, parent, grandparent, …, root]`。
3. **キャプチャフェーズ**を実行します：`{ capture: true }`で登録されたリスナーを、ルートからターゲットへ下る順に発火します。
4. **バブルフェーズ**を実行します：リスナー（デフォルトフェーズ）を、ターゲットからルートへ戻る順に発火します。

<figure>
  <iframe src="/sandbox/diagram-events.html" class="diagram-frame" loading="lazy" title="Event capture and bubble phases, rendered live by VectoJS" sandbox="allow-scripts allow-same-origin"></iframe>
  <figcaption>キャプチャはルート → ターゲットに発火し、バブルはターゲット → ルートに発火します。ターゲットは両方を受け取ります。<em>（VectoJSによってライブでレンダリングされています。）</em></figcaption>
</figure>

## イベントをリッスンする

```typescript
entity.on(event, callback, options?)
entity.off(event, callback, options?)
```

デフォルトのフェーズは**バブル**です。キャプチャフェーズ中に横取りするには`{ capture: true }`を渡します：

```typescript
// Bubble phase (default) — fires after children
btn.on('click', (e) => console.log('button clicked'));

// Capture phase — fires before children (interceptor pattern)
card.on(
  'click',
  (e) => {
    console.log('card sees click first');
    e.stopPropagation(); // prevents bubble reaching card again
  },
  { capture: true },
);
```

利用可能なイベントタイプ：

| イベント          | トリガー                                                           |
| ----------------- | ------------------------------------------------------------------ |
| `'click'`         | 同じエンティティ上でのポインターの押下 + 解放                      |
| `'hover'`         | ポインターがエンティティに入る                                     |
| `'pointerdown'`   | ポインターが押される                                               |
| `'pointerup'`     | ポインターが解放される                                             |
| `'pointercancel'` | アクティブなポインターストリームがブラウザによってキャンセルされる |
| `'pointermove'`   | ポインターが移動する（エンティティ上にある間）                     |
| `'pointerleave'`  | ポインターがエンティティから離れる                                 |
| `'wheel'`         | マウスホイール / トラックパッドのスクロール                        |
| `'keydown'`       | キーが押される（エンティティがフォーカスを保持している間）         |
| `'keyup'`         | キーが解放される                                                   |
| `'change'`        | フォームコントロールの値が変わる                                   |
| `'focus'`         | シャドウDOMノードがフォーカスを得る                                |
| `'blur'`          | シャドウDOMノードがフォーカスを失う                                |

## VectoJSEvent

コールバックは、次のメンバーを持つ`VectoJSEvent`を受け取ります：

```typescript
interface VectoJSEvent {
  type: string; // event name
  target: Entity; // entity where the event originated
  currentTarget: Entity; // entity whose listener is currently running

  bubbles: boolean;

  // Propagation control
  stopPropagation(): void; // stop after current node
  stopImmediatePropagation(): void; // also skip remaining listeners on this node
  preventDefault(): void;

  defaultPrevented: boolean;

  // Browser viewport coordinates from the native event
  clientX?: number;
  clientY?: number;

  // Scene logical coordinates, then coordinates local to currentTarget
  sceneX?: number;
  sceneY?: number;
  localX?: number;
  localY?: number;

  // Wheel events
  deltaX?: number;
  deltaY?: number;

  // Keyboard events
  key?: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;

  // The original native DOM event
  nativeEvent?: Event;
}
```

`localX`/`localY`は、ネストされた回転や不均一なスケールを含めて、各リスナーの`currentTarget`ごとに再計算されます。コントロールの内部ではこれらを使ってください。別のエンティティと比較したり、シーン空間のポインターを保存したりするときは`sceneX`/`sceneY`を使ってください。`clientX`/`clientY`は生のブラウザビューポート値のままです。

## `emit()` と `dispatchEvent()`

VectoJSには2つのディスパッチパスがあります：

| メソッド                             | その動作                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `entity.emit(event, payload)`        | **このエンティティ自身のバブルフェーズのリスナーのみ**を発火します。ツリーのトラバーサルはありません。 |
| `entity.dispatchEvent(vectoJSEvent)` | ツリー全体にわたる、完全なDOMライクな**キャプチャ + バブル**のトラバーサル。                           |

`emit()`は、組み込みコンポーネントが自身の状態変化を内部的に伝える方法です（例：`Toggle`が自身の`'change'`をemitする）。`dispatchEvent()`を直接呼ぶことはほとんどありません——ブラウザから来るポインターとキーボードのイベントに対して、`Scene`がそれを呼び出します。

```typescript
// Correct: listen to a button's click in bubble phase
btn.on('click', (e) => {
  /* ... */
});

// Correct: intercept a subtree's clicks before children handle them
container.on(
  'click',
  (e) => {
    if (isLocked) e.stopPropagation();
  },
  { capture: true },
);

// Correct: a component emitting its own state change (internal use)
this.emit('change', { value: this._value });
```

## フォーム変更イベントのペイロード

フォームコントロール（`Input`、`TextArea`、`Checkbox`、`Toggle`、`Slider`、`Dropdown`）は、型付きペイロードとともに`'change'`イベントをemitします：

**`Input`と`TextArea`：**

```typescript
{
  value: string;
  selectionStart?: number;   // caret / selection start offset
  selectionEnd?: number;     // caret / selection end offset
  composition?: {
    start: number;
    length: number;
  } | null;                  // active IME pre-edit range, or null
}
```

**`Checkbox`と`Toggle`：**

```typescript
{
  checked: boolean;
}
```

**`Slider`：**

```typescript
{
  value: number;
}
```

**`Dropdown`：**

```typescript
{
  value: string;
}
```

例——テキスト入力の値を読む：

```typescript
const input = new Input({ width: 300, placeholder: 'Search…' });
input.on('change', (e) => {
  const { value, selectionStart } = e;
  console.log(`"${value}" — caret at ${selectionStart}`);
});
```

## Hit-testing：Sceneがどうやってターゲットを見つけるか

`scene.findEntityAt(x, y)`は、ツリーを**子の逆順で深さ優先に**辿ります（最前面に描画された子から先にテストされます）：

1. オーバーレイのルートがメインのルートより先にチェックされるため、オーバーレイ（ドロップダウン、モーダル）は常に勝ちます。
2. 子は**逆順**でトラバースされます——最後に追加された子（上に描画される）が最初にhit-testされます。
3. **インタラクティブフィルターはありません**：`isPointInside()`が`true`を返せば、非インタラクティブなエンティティでも返される可能性があります。インタラクティブフィルタリングはシャドウDOM投影にのみ影響し、hit-testingには影響しません。
4. トラバーサルは、リスナーを持つかどうかにかかわらず、`isPointInside()`が`true`を返す最初のエンティティを返します。

```typescript
// This works — returns the entity under the cursor
const hit = scene.findEntityAt(pointerX, pointerY);
if (hit) console.log('hit', hit.id);
```

## 伝播を止める

```typescript
child.on('click', (e) => {
  e.stopPropagation(); // parent won't see this click in bubble phase
});

// stopImmediatePropagation also stops other listeners on the same node
child.on('click', (e) => {
  e.stopImmediatePropagation();
});
child.on('click', () => {
  // This second listener on 'child' is NOT called if the first stops immediate propagation
});
```

## Wheelイベントと`preventDefault()`

`Scene`はキャンバスから`wheel`イベントを転送します。ページがスクロールするのを止めるには`e.preventDefault()`を呼び出してください：

```typescript
myScroller.on('wheel', (e) => {
  this.scrollY += e.deltaY;
  e.preventDefault(); // stops the browser scroll
  this.scene?.markDirty();
});
```

> [!NOTE] > `ScrollView`は、`Ctrl`が押されている場合（ブラウザのズームを許可）を除き、wheelイベントで自動的に`e.preventDefault()`を呼びます。カスタムのスクロールコンテナを構築する場合は、同じパターンに従ってください。

## キーボードイベント

キーボードイベントは、（シャドウDOMノードを介して）フォーカスを保持しているエンティティに配送されます。それらは通常のキャプチャ/バブルでツリーを上に伝播します：

```typescript
inputEntity.on('keydown', (e) => {
  if (e.key === 'Enter') submitForm();
  if (e.key === 'Escape') cancelForm();
});
```

（フォーカスされた要素に紐づかない）グローバルなショートカットには、`Scene`のルートでリッスンするか、ネイティブな`document.addEventListener`を使ってください：

```typescript
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});
```

## キャプチャフェーズのパターン

### 外側クリックで閉じる

```typescript
scene.add(overlay); // a dropdown, modal backdrop, etc.

// Root capture: fires before any entity handles the click
scene.getRoot().on(
  'click',
  (e) => {
    if (
      e.sceneX !== undefined &&
      e.sceneY !== undefined &&
      !overlay.isPointInside(e.sceneX, e.sceneY)
    ) {
      closeOverlay();
    }
  },
  { capture: true },
);
```

### サブツリーをロックする

```typescript
panel.on(
  'click',
  (e) => {
    if (disabled) e.stopPropagation(); // all children are blocked
  },
  { capture: true },
);
```

## 完全な例：ホバーカード

```typescript
import { Entity } from '@vectojs/core';
import type { IRenderer } from '@vectojs/core/renderer';

class HoverCard extends Entity {
  private hovered = false;

  constructor(private label: string) {
    super();
    this.width = 200;
    this.height = 80;
    this.interactive = true;

    this.on('hover', () => {
      this.hovered = true;
      this.animate({ scaleX: 1.04, scaleY: 1.04 }, 120);
    });

    this.on('pointerleave', () => {
      this.hovered = false;
      this.animate({ scaleX: 1, scaleY: 1 }, 120);
    });

    this.on('click', () => {
      console.log(`${this.label} clicked`);
    });
  }

  isPointInside(gx: number, gy: number): boolean {
    const p = this.worldToLocal(gx, gy);
    return !!p && p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height;
  }

  getA11yAttributes() {
    return { tag: 'button' as const, role: 'button', label: this.label };
  }

  render(renderer: IRenderer) {
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 12);
    renderer.fill(this.hovered ? '#1e293b' : '#0f172a');
    renderer.stroke('rgba(255,255,255,0.12)', 1);
    renderer.fillText(this.label, 16, 28, '600 18px Inter', '#f8fafc');
  }
}
```

## トラブルシューティング

### クリックは発火するが、間違ったエンティティがターゲットになる

`findEntityAt`は子を**逆順**（最後に追加＝最初にテスト）でトラバースします。2つのエンティティが重なっている場合、後から追加された方が勝ちます。あるエンティティを常に勝たせるには、他のものより後に`add()`してください。常に負けさせるには、前に`add()`してください。

**キャプチャフェーズ**中に間違ったエンティティが横取りする場合は、祖先での`stopPropagation()`呼び出しを確認してください——伝播を止めるキャプチャリスナーは、イベントが目的のターゲットに到達するのを妨げます。

### イベントリスナーが一度は発火するがその後止まる

`on()`で追加されたイベントリスナーは、`off()`が呼ばれるまで永続的です。リスナーが止まったように見える場合は、次を確認してください：

1. エンティティがシーンから削除された。`scene.remove(entity)`はそれをデタッチしますが、リスナーは消さないため、後で再び追加できます。
2. 親のリスナーが、イベントがあなたのエンティティに到達する前に`e.stopPropagation()`を呼んでいる。
3. うっかり`off()`を呼んでしまった——予想より早く実行されるクリーンアップ関数を介する場合があります。

### wheelイベントは発火するがページがまだスクロールする

キャンバスからの`wheel`イベントは、エンティティ上でそれらをリッスンしていても、ブラウザにバブルします。ページのスクロールを止めるには、明示的に`e.preventDefault()`を呼ぶ必要があります：

```typescript
myEntity.on('wheel', (e) => {
  // ... handle scroll ...
  e.preventDefault(); // ← required to stop the browser scroll
});
```

注：`ScrollView`は（`Ctrl`が押されている場合を除き）自身のwheelイベントに対してこれを自動的に行います。

### キーボードイベントで`e.clientX` / `e.clientY`が欠落している

`clientX`/`clientY`はポインターイベントのフィールドであり、ネイティブイベントがそれらを提供しない場合は`undefined`です。キーボードイベントには、`e.key`、`e.shiftKey`、`e.ctrlKey`、`e.altKey`、`e.metaKey`を使ってください。

> **次へ：** [Physics & Animation](/learn/physics-engine/) — スプリング、空間ハッシュ、そして`update()`ループ。
