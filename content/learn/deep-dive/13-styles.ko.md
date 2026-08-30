---
title: '13 — 스타일 & 테마 — 숫자 VMT 위의 CSS 패리티'
description: 'VectoJS 스타일이 Virtual Math Tree 위에 사는 이유, CSS 속성 이름 객체가 숫자 엔티티 필드로 매핑되는 방식, CSS처럼 느껴지면서도 CSS가 아닌 모든 메커니즘 — 토큰과 var() 해석, css() 병합, 폰트 합성, 축별 패딩, 원자적 테마 전환, 숫자 트리의 정직함을 유지하는 이전 함정.'
order: 33
---

# 13 — 스타일 & 테마 — 숫자 VMT 위의 CSS 패리티

> VectoJS는 스타일시트도, 캐스케이드도, 브라우저도 없다. Virtual Math Tree는 CSS 문자열이 아닌 숫자 — `x`, `width`, `bg`, `font` —를 저장한다. `@vectojs/styles`는 숫자로 착지하면서도 CSS처럼 쓸 수 있게 하는 다리다: 타입 객체, 고정 조회 테이블, 전환 시 재해결되는 평면 토큰 테마.

- **배울 내용**: 스타일이 숫자 VMT 위에 사는 이유, `Style`이 엔티티 필드로 매핑되는 방식, `var(--token)` 토큰이 어떻게 해석되는지(고정, 내장, 전이적, 사이클 감지 포함), `css()` 병합과 `style()` 타입, `composeFont`이 캔버스 약어를 유효하게 유지하는 방식, 축별 `padding: {x,y}`의 확산, `setTheme`이 `WeakRef` 추적 쌍을 통해 원자적으로 교체하는 방식, CSS 습관을 이전할 때 조용히 실패하지 않고 크게 실패하는 모든 방법.
- **배우지 않을 내용**: 텍스트 형태나 레이아웃(boss 02), 씬이 더러워지고 렌더링하는 방식(boss 06/07), 마크다운이 코드 블록을 테마화하는 방식(`packages/markdown/src/markdown-presets.ts:281` `resolvePresetTheme` — 별도 토큰 시스템). 이 문서는 숫자 트리 위의 얇고 타입이 지정된 CSS 이름 스킨이다.

## 1. VMT 위의 스타일 — 그리고 CSS가 아닌 이유

VMT는 씬을 숫자로 저장한다. `Entity.x: number`(`packages/core/src/tree/Entity.ts:1`), `UIComponent.paddingX: number`(`packages/ui/src/UIComponent.ts:28`), `Text.font: string`(`packages/ui/src/Text.ts:111`) — 여전히 _유효한 캔버스 폰트 약어_이지 스타일시트 규칙이 아니다. 상속할 DOM 요소도, 해석할 캐스케이드도, 매칭할 선택자도 없다. 브라우저의 스타일 엔진은 의도적으로 부재한다: VectoJS는 그리기, 히트 테스트, 투영을 직접 소유하므로 크기도 직접 소유한다.

`@vectojs/styles`는 이를 싸우지 않고 제약을 받아들인다:

- `Style`은 선택적 키를 가진 평문 객체(`packages/styles/src/types.ts:16`) — `x?: CssLength`(`types.ts:18`), `backgroundColor?: string`(`types.ts:28`), `fontSize?:`${number}px``(`types.ts:46`), `display?: 'flex'`(`types.ts:62`). 클래스도, 프록시도, 레지스트리도 없다.
- `applyStyle(entity, style)`(`packages/styles/src/apply.ts:294`)는 각 CSS 이름 키를 하나의 숫자/문자열/불리언 쓰기로 변환하는 **고정 조회 테이블** `RULES: Record<string, Rule>`(`apply.ts:54`)이다. 모든 키는 열거된다; 알 수 없는 키는 예외를 던진다(`apply.ts:258`). 파싱도, 상속도, `%`도 없다.
- 토큰은 평면 `Record<string, string|number>`(`packages/styles/src/theme.ts:38` `ThemeTokenSet`)이며, 값 내 `var(--key)`로 참조되고 활성 테마에 대한 문자열 치환으로 해석된다 — CSS 엔진이 아니다.
- 패키지는 `@vectojs/core`(`packages/styles/package.json:14`)에만 의존하며 런타임 의존성이 0이다; `@vectojs/ui`는 `@vectojs/styles` 의존성이 0이다(의존성 그래프는 `core → styles`, 섭취는 선택).

이전 편의성 — `backgroundColor: 'var(--accent)'`이 CSS처럼 읽히면서도 `entity.bg: string`(`apply.ts:63`)에 착지 — 을 얻으면서도 VMT가 단일 진실의 원천으로 남는다. 대가는 숫자 백업 필드가 없는 CSS 기능이 존재하지 않고 크게 실패해야 한다는 것이다(§10 참조).

## 2. `Style`과 규칙 테이블 — 모든 키는 계약

`CssLength = number |`${number}px``(`packages/styles/src/types.ts:2`) — 숫자는 px, `px` 문자열은 숫자로 파싱. 구분은 `fontSize`에만 중요하며, 유형이 `` `${number}px` ``(`types.ts:46`)로 좁혀지므로`16`은 타입 오류다 — 합성된 폰트 약어는 유효해야 한다.

`Style`(`types.ts:16`)은 키가 구동하는 것에 따라 그룹화된다:

| 그룹     | 키                                                                                        | 백업 필드                                                            | 변환                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 기하학   | `x,y,width,height`                                                                        | 동일(`apply.ts:55`)                                                  | `isCssLength`(`apply.ts:23`) — 숫자 또는 `/^[+-]?(\d+\.?\d*                                \| \.\d+)px$/` |
| 변환     | `scaleX,scaleY,rotation,opacity`                                                          | 동일(`apply.ts:59`)                                                  | `isFiniteNumber`(`apply.ts:33`); `rotation`은 CSS 도가 아닌 **라디안**(`types.ts:25`)                     |
| 상자     | `backgroundColor→bg`, `color`, `borderColor`, `borderRadius→radius`, `padding`            | `apply.ts:63`                                                        | `isString` / `isCssLength`                                                                                |
| 텍스트   | `font`, `lineHeight`, `textAlign`                                                         | 동일 / `oneOf(['left','justify'])`(`apply.ts:70`)를 통한 `textAlign` | `types.ts:55` — `center`/`right`는 크게 거부됨                                                            |
| 레이아웃 | `display→null`, `flexDirection→direction`, `gap→gap`, `alignItems→align`, `flexWrap→wrap` | `apply.ts:71`                                                        | `oneOf` + 열거 리매핑(`row→horizontal`, `flex-start→start`, `wrap→true`)                                  |

`applyStyle`은 고정 테이블(`apply.ts:54`)을 통해 각 키를 정확히 하나의 엔티티 필드 쓰기로 매핑한다. `%`는 지원되지 않으며(`types.ts:2` 주석), `padding`은 `padding: { x: number, y: number }`(`types.ts:72`)로 축별이며 각 축은 별도의 쓰기로 분산된다(`apply.ts:118`).

## 3. 토큰과 `var()` 해석

토큰(`ThemeTokenSet` `packages/styles/src/theme.ts:38`)은 값(`string|number`)에 대한 키(`string`)의 평면 맵이다. `var(--key)`는 값 문자열 내에서 치환된다(`packages/styles/src/theme.ts:112` `resolveVar`):

```typescript
function resolveVar(value: string, theme: ThemeTokenSet): string {
  return value.replace(/var\(--([\w-]+)\)/g, (_, k) => {
    if (!(k in theme)) throw new StyleError(`unknown token --${k}`);
    return String(theme[k]);
  });
}
```

사이클 감지는 해석 전에 수행된다: `resolveVar`는 이미 방문한 키를 `visited` 집합으로 추적하고(`theme.ts:145`), 사이클이 감지되면 `StyleError('token cycle')`를 던진다. 고정 토큰(`--primary`, `--surface`, `--accent`)과 내장 토큰(`--font-body`, `--line-height-base`)은 `packages/styles/src/theme.ts:78`에 정의되어 있다.

테마 전환은 `setTheme(newTheme)`(`packages/styles/src/theme.ts:234`)이 `WeakRef`-추적 쌍(`themeRef`, `entityRef`)을 통해 원자적으로 수행한다. 각 엔티티는 `entity.themeRef = WeakRef(newTheme)`를 기록하고, 다음 렌더 시 `applyStyle`이 `theme`이 변경된 경우 (`entity.themeRef.deref() !== currentTheme`) 다시 적용한다. `WeakRef`는 엔티티가 파괴되면 테마 참조가 GC될 수 있도록 하여 메모리 누수를 방지한다(`theme.ts:267` 주석).

## 4. `css()` 병합과 `style()` 타입

`css()`(`packages/styles/src/css.ts:45`)는 `Style` 객체의 배열을 병합한다: 이후 키가 이전 키를 덮어쓴다(`css.ts:78` `Object.assign`). `style(entity, ...styles)`(`packages/styles/src/style.ts:34`)는 `entity`가 `UIComponent`(`packages/ui/src/UIComponent.ts:28`)일 때 `css()`를 적용하고, 그렇지 않으면 `applyStyle()`를 직접 호출한다.

`style()`는 타입 안전하다: 인수는 `Style`(`types.ts:16`)이며, `CssLength`(`number | \`${number}px\``)와`CssString`(`string`)이 올바른 유형인지 확인한다(`style.ts:56` `isCssLength`,`style.ts:67` `isCssString`). 잘못된 유형은`type error`가 아닌`StyleError('invalid value')`를 던진다.

## 5. 폰트 합성과 축별 패딩

`composeFont`(`packages/styles/src/font.ts:89`)는 `font: '700 16px Inter'`와 같은 약어를 `fontSize: '16px', fontFamily: 'Inter', fontWeight: '700'`로 분해한다. 약어는 반드시 `fontSize`를 포함해야 하며(`font.ts:112` `parseInt` 보호), 그렇지 않으면 `StyleError('font shorthand missing size')`를 던진다.

`padding`(`types.ts:72`)는 `padding: { x: number, y: number }`로 축별이며, 각 축은 별도의 쓰기로 분산(`apply.ts:118`)된다. `padding: 8`은 `padding: { x: 8, y: 8 }`으로 해석된다(`types.ts:75` `isCssLength` — 숫자는 px로 해석).

## 6. 이전 함정

- `Style`은 평문 객체이므로 `Object.assign`이 아닌 `css()`를 사용하지 않으면 이전 키가 삭제되지 않고 덮어써진다(`css.ts:78`).
- `var(--token)`이 존재하지 않는 토큰을 참조하면 `resolveVar`가 `StyleError`를 던진다(`theme.ts:145`) — 조용히 무시되지 않는다.
- `font` 약어는 반드시 `fontSize`를 포함해야 한다(`font.ts:112`); `font: 'bold Inter'`는 `StyleError`를 던진다.
- `padding`은 축별이므로 `padding: 8`이 `paddingX`와 `paddingY`를 모두 설정하지만, `padding: { x: 8 }`은 `y`를 설정하지 않아 이전 값을 유지한다(`apply.ts:118`).
- 테마 전환은 원자적이지만, `setTheme()`이 호출된 후 `applyStyle()`이 호출되지 않으면 엔티티는 이전 테마를 유지한다 — `WeakRef`는 테마가 변경되었음을 기록하지만, 다시 적용은 렌더 시 수행된다.
