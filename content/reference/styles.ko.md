+++
title = "스타일 (@vectojs/styles)"
description = "숫자 Virtual Math Tree 위의 CSS-프로퍼티-이름 스타일 객체: 토큰 테마(var() + setTheme), css() 병합, 그리고 폰트 구성 — 파서, 캐스케이드, 셀렉터 없음."
weight = 55
+++

# `@vectojs/styles`

숫자 Virtual Math Tree 위의 선언적 스타일 레이어: **CSS 프로퍼티 이름과
CSS-유사 값**으로 스타일을 작성하면 `applyStyle`이 이를 엔티티 필드에 매핑합니다.
목적은 마이그레이션 편의성입니다 — CSS처럼 읽히는 코드도 여전히 VectoJS 개발자가
손으로 설정할 동일한 타입의 숫자 필드에 도달하며, 캔버스는 단일 소스 오브
트루스(single source of truth)로 유지됩니다.

이것은 **CSS 엔진이 아닙니다**: 파서, 셀렉터, 캐스케이드, 상속, 그리고 전역
스타일 레지스트리가 없습니다. 스타일 객체는 일반적이고 타입이 있는 선택적 키
객체입니다; 토큰 참조(`var(--key)`)는 평면 테마를 기준으로 해석되며, 테마를
전환하면 추적된 모든 스타일이 다시 적용됩니다.

```ts
import { style, css, applyStyle, tokens, setTheme, PRESET_THEMES } from '@vectojs/styles';

setTheme(tokens(PRESET_THEMES.dark));

const primary = css(
  style({
    backgroundColor: 'var(--accent)',
    color: '#fff',
    borderRadius: 'var(--radius-md)',
  }),
  {
    padding: 12,
    fontFamily: 'Inter',
  },
);
const muted = css(primary, { backgroundColor: 'var(--muted)' });

applyStyle(button, muted);
applyStyle(stack, style({ flexDirection: 'row', gap: '8px', alignItems: 'center' }));
```

## 내보내기 (Exports)

- `style()` — 객체 리터럴을 `Style`로 타입 지정하는 아이덴티티 팩토리입니다.
- `css(...styles)` — 병합 팩토리 (0.2.0): 나중 소스가 우선합니다; `null`,
  `undefined`, `false` 소스는 건너뛰므로 변형을 조건부로 만들 수 있습니다.
  입력은 변경되지 않습니다 — 축별 `padding` 객체도 복사되므로 "새로운 평범한
  객체" 계약은 중첩된 값에도 성립합니다.
- `applyStyle(entity, style)` — 매핑된 필드를 작성하고
  `{ applied: string[] }`를 반환합니다 (실제로 작성된 CSS 키, 객체 순서대로).
- `tokens(set)` — 평면 토큰 세트에서 `Theme`를 생성합니다.
- `setTheme(theme)` / `getTheme()` — 활성 테마를 전환/읽습니다; `var()`를
  참조하는 스타일은 전환 시 다시 해석되고 다시 적용됩니다.
- `untrackVarStyles(entity)` — 엔터티의 `var()` 추적을 즉시 해제합니다
  (0.3.x); 다음 테마 전환의 약참조 스윕을 기다리는 대신 destroy 정리에서 호출하여
  결정적으로 해제하세요.
- `PRESET_THEMES` — `light` (기본 테마), `dark`, `github`,
  `dracula` 토큰 세트.
- `Style` — 스타일 인터페이스입니다. 모든 키는 선택적입니다.
- `composeFont(current, changes)` — CSS 폰트 속기 문자열을 재구성합니다
  ([폰트 구성](#폰트-구성) 참조).
- `ThemeTokenSet` — `Record<string, string | number>`; `tokens()` 세트와
  `Theme.tokens`의 타입입니다.
- `Theme` — `{ readonly tokens: ThemeTokenSet }`, `tokens()`로 생성됩니다.

이 패키지는 `@vectojs/core`에만 의존합니다.

## 키 매핑

| CSS 키                                   | 엔티티 필드                            | 값                                                                          |
| ---------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| `x`, `y`, `width`, `height`              | 동일                                   | 단순 숫자 또는 `px` 문자열                                                  |
| `opacity`, `scaleX`, `scaleY`            | 동일                                   | 숫자                                                                        |
| `rotation`                               | 동일                                   | 숫자, **라디안** (CSS 도(degree)가 아닌 VectoJS 관례)                       |
| `backgroundColor`                        | `bg`                                   | 색상 문자열, 그대로 전달                                                    |
| `color`, `borderColor`                   | 동일                                   | 색상 문자열, 그대로 전달                                                    |
| `borderRadius`                           | `radius`                               | 단순 숫자 또는 `px` 문자열                                                  |
| `padding`                                | `padding` (또는 `paddingX`/`paddingY`) | 단일 값, 또는 축별 `{ x, y }` (0.2.0)                                       |
| `font`                                   | `font`                                 | CSS 폰트 속기 문자열, 예: `"16px Inter"`                                    |
| `fontFamily` / `fontSize` / `fontWeight` | `font`로 구성                          | 0.2.0: 세그먼트 대체, 나머지는 보존                                         |
| `lineHeight`                             | `lineHeight`                           | 단순 숫자 또는 `px` 문자열                                                  |
| `textAlign`                              | `textAlign`                            | `"left"` \| `"justify"`만                                                   |
| `display`                                | — (유효성 검증만)                      | `"flex"`; 엔티티가 컨테이너임을 단언                                        |
| `flexDirection`                          | `direction`                            | `"row"` → `"horizontal"`, `"column"` → `"vertical"`                         |
| `gap`                                    | `gap`                                  | 단순 숫자 또는 `px` 문자열                                                  |
| `alignItems`                             | `align`                                | `"flex-start"` → `"start"`, `"center"` → `"center"`, `"flex-end"` → `"end"` |
| `flexWrap`                               | `wrap`                                 | `"wrap"` → `true`, `"nowrap"` → `false`                                     |

## 토큰과 테마

테마는 평면 토큰 세트입니다; 키는 `--` 접두사 없이 작성되고 `var(--<key>)`로
참조되어 CSS 커스텀 프로퍼티를 반영합니다:

```ts
const theme = tokens({ accent: '#2563eb', 'radius-md': 8, gap: 10 });
setTheme(theme);
applyStyle(btn, style({ backgroundColor: 'var(--accent)', borderRadius: 'var(--radius-md)' }));
```

- `var(--key)`는 값 변환기가 실행되기 전에 활성 테마의 토큰을 기준으로
  해석되므로, 토큰은 색상, px 문자열 또는 단순 숫자를 담을 수 있습니다.
  전체 문자열 참조(`backgroundColor: "var(--accent)"`)는 정확히 해석됩니다;
  더 큰 문자열에 **내장된** 참조(`color: "rgba(var(--rgb), 0.4)")는 치환으로
  해석되며, 토큰이 토큰을 참조하는 체인은 경로 기반 순환 감지와 함께 전이적으로
  해석되고, 참조하는 키는 추적되어 테마 전환 시 복합값이 다시 해석됩니다. 알 수
  없는 토큰은 이름과 함께 예외를 던집니다; 순환도 위반 체인과 함께 던집니다.
- `var(--token, fallback)`에는 **폴백 해결이 없으며** 절대 조용히 통과하지
  않습니다: 이 형태는 어디에 나타나든(직접 값, 복합 문자열에 내장, padding 축
  안, 또는 토큰 체인을 통해) 감지되어 위반 값을 이름 지정하는 `TypeError`를
  던집니다. 감지기는 `var(` 뒤의 공백을 허용하므로 `var( --accent, #fff)`도
  잡힙니다. 여기서의 침묵이 결함이었습니다: 해석되지 않은 문자열이 매핑된 필드에
  도달하는 동안 Canvas2D는 조용히 이전 그리기를 유지했습니다.
- 토큰을 참조하는 스타일은 테마별로 **추적**되며 (파괴된 엔터티는 더 이상
  보존되지 않습니다 — 추적은 약하게 보유하며, destroy 정리에서 즉시 해제할 수
  있도록 `untrackVarStyles(entity)`를 제공합니다) `setTheme(next)`가 전환될 때
  다시 적용되므로, 테마 교체가 호출자 측 변경 없이 전체 씬을 다시 채색합니다.
  `var()`가 없는 스타일은 추적되지 않습니다. 전환 시 토큰 값이 매핑된 프로퍼티의
  유효성 검증을 통과하지 못하면 (예: `--radius-md: "50%"`), `setTheme`가 예외를
  던집니다.
- 기본 테마는 `light` 프리셋입니다; `tokens()` 세트는 평범한 객체이므로 호출자
  테마는 스프레드입니다: `tokens({ ...PRESET_THEMES.dark, accent: "#f00" })`.

## 폰트 구성

`fontFamily`, `fontSize`, `fontWeight`는 독립 필드가 아닙니다 — ui
컴포넌트는 전체 폰트를 하나의 속기 문자열로 전달합니다. 이 키들은 엔티티의 현재
`font`를 파싱하고, 존재하는 세그먼트만 대체한 후 재구성된 문자열을 작성합니다:

```ts
applyStyle(text, style({ font: '700 16px Inter' })); // entity font
applyStyle(text, style({ fontSize: '20px' })); // -> "700 20px Inter"
applyStyle(text, style({ fontFamily: 'ui-monospace' })); // -> "700 20px ui-monospace"
```

빈 폰트의 엔티티는 `16px`에서 시작합니다; 패밀리가 없으면 `sans-serif`로
대체됩니다. `font` 필드가 없는 엔티티에서는 이 키들이 건너뛰어집니다.

기본 문자열 헬퍼가 직접 사용을 위해 내보내집니다:

```ts
composeFont(
  current: string,                                       // e.g. "700 16px Inter"
  changes: { fontFamily?: string; fontSize?: string; fontWeight?: string },
): string                                               // -> "700 20px ui-monospace"
```

`composeFont`는 CSS 폰트 속기를 파싱하고 `changes`에 존재하는 세그먼트만
대체한 후 재구성합니다; 누락된 크기/패밀리는 `16px` / `sans-serif`로 채워져
결과가 항상 유효한 캔버스 폰트 문자열이 되도록 합니다.

파서는 캔버스의 전체 접두사 문법
(`[style || variant || weight]? size[/line-height]? family`)을 이해하므로,
`italic 700 16px Georgia`와 `16px/24px Inter`는 올바르게 구성되며 이후 세그먼트
변경이 잘못된 문자열을 재구성할 수 없습니다 — 배치할 수 없는 크기 같은 세그먼트는
조용히 통과하는 대신 명확하게 실패합니다. weight 슬롯이 첫 번째 `normal`을 가져간
후(문서화된 호환성 선택), 추가 `normal`은 style, 그다음 variant를 채우므로 유효한
CSS 형식 `normal normal 16px Inter`은 예외 대신 파싱됩니다. `fontSize`는 런타임에
`${number}px` 형태를 강제합니다: 토큰이나 JS 호출자를 통해 도착하는 px가 아닌
단위는 Canvas2D가 버릴 속기를 조용히 구성하는 대신 예외를 던집니다.

## 의미론

- **크로스-컴포넌트 재사용.** 엔티티에 필드가 존재하지 않는 키는 조용히
  건너뛰어지므로, 하나의 스타일 객체를 `Button`, `Text`, `Stack`에 걸쳐
  공유할 수 있습니다 — 각자는 가진 것을 사용합니다. `applied`는 정확히 무엇이
  작성되었는지 보고합니다.
- **카테고리 오류에 대한 명확한 실패.** 컨테이너가 아닌 엔티티의 레이아웃 키
  (`display`, `flexDirection`, `gap`, `alignItems`, `flexWrap`)는
  `TypeError`를 던집니다 — `Text`를 flex 컨테이너로 스타일링하는 것은
  무-연산이 아니라 실수입니다. 알 수 없는 CSS 키도 예외를 던집니다.
- **잘못된 값에 대한 명확한 실패.** `"50%"`, `"8em"`, 또는
  `textAlign: "center"`는 프로퍼티 이름과 함께 예외를 던집니다. VectoJS
  텍스트는 `left`와 `justify`만 구현합니다 (`Text`, `RichText`,
  `TextEntity`, 그리고 레이아웃 엔진이 모두 `"left" | "justify"`를 공유),
  따라서 `center`/`right`는 존중될 수 없으며 조용히 실패해서는 안 됩니다.
  값은 단순 숫자(px) 또는 `px` 문자열입니다; `%`, `em`, `rem`은 거부됩니다.
- **더티 시그널링.** 하나 이상의 키가 작성되면 `applyStyle`은
  `entity.scene.markDirty()`를 한 번 호출하므로 `onDemand` 씬이 다시 칠해집니다.

## 의도적으로 범위 밖 (v0.2.0)

- `transform` (CSS transform 문자열은 파싱 필요), `justifyContent` (지원
  필드 없음 — Stack 자식은 `align`으로 정렬), `border` 객체 (아직 캔버스
  테두리 렌더링 없음 — `borderColor`만), `%`/`em`/`rem` 길이, 의사-상태
  (`:hover`), 미디어 쿼리, 셀렉터와 캐스케이드 — 이 중 어느 것도 엔티티
  필드로 존재하지 않으며, 추가하면 숫자 VMT가 제거하기 위해 존재하는
  메커니즘을 다시 도입하게 됩니다.

## FAQ

**왜 `applyStyle`이 `textAlign: "center"`에서 예외를 던지나요?** `textAlign`이
전체 스택에 걸쳐 `"left" | "justify"`이기 때문입니다 — ui `Text`/`RichText`,
core `TextEntity`, 그리고 레이아웃 엔진 (`LayoutEngine.textAlign`).
`center`/`right`를 존중할 방법이 있는 엔티티가 없으므로, 예외는 마이그레이션
중인 스타일시트가 왼쪽 정렬 텍스트를 조용히 렌더링하지 않도록 합니다.

**`rotation`은 도(degrees) 단위인가요?** 아닙니다 — 다른 모든 VectoJS 회전
표면과 마찬가지로 라디안입니다. CSS `rotate(30deg)` 마이그레이션은
`Math.PI / 6`로 변환해야 합니다.

**`padding: { x, y }`는 Button의 크기를 조정하나요?** 아닙니다. Box 컴포넌트는
생성자에서 자신의 크기를 정하므로, 나중에 설정된 축별 패딩은 내재적 크기 조정이
아니라 `paddingX`/`paddingY`를 실시간으로 검사하는 소비자(예: Card 레이아웃)가
읽습니다. 생성 시 크기 조정을 위해 컴포넌트의 옵션에 `padding`을 설정하세요.

**스타일을 적용한 후 테마를 어떻게 전환하나요?** `var(--key)` 토큰을 참조하는
스타일을 적용한 다음 `setTheme(tokens({ ... }))`을 호출하세요 — 모든 추적된
스타일이 새 토큰을 기준으로 다시 해석되고 다시 칠해집니다. 리터럴 값이 있는
스타일은 건드리지 않습니다.
