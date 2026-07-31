---
title: '스트리밍 및 실시간 텍스트'
description: '채팅 UI, 로그 뷰어, 라이브 대시보드 구축: 프레임별 청크 통합, append API, 유휴 스로틀 상호작용, 긴 대화 전략.'
order: 18
---

# 스트리밍 및 실시간 텍스트

토큰 스트림(LLM 채팅), 로그 테일, 실시간 데이터 피드는 순진한 VectoJS
코드가 가장 자주 낭떠러지에 떨어지는 지점입니다. 엔진은 빠른 프리미티브 —
`Text.append()`, `Markdown.appendMarkdown()`, 문단 수준 레이아웃 메모이제이션,
오프-스레드 Markdown 파싱 — 을 제공하지만, 이를 프레임별이 아닌 토큰별로 연결하면
대부분의 이점이 사라집니다. 이 페이지가 종단간 레시피입니다.

## 하나의 규칙: 토큰별이 아닌 프레임별로 배치

스트림은 디스플레이가 새로고침되는 속도보다 훨씬 빠르게 토큰을 전달합니다. 모든
`append()`/`appendMarkdown()` 호출은 레이아웃 패스를 소모하며, 렌더링된 두
프레임 사이의 마지막 프레임을 제외한 모든 레이아웃은 **보이지 않는 작업**입니다.
해결책은 네 줄입니다: 토큰이 도착하면 버퍼링하고, 애니메이션 프레임당 한 번씩 플러시합니다.

```typescript
let pending = '';
let scheduled = false;

function pushToken(token: string) {
  pending += token;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const chunk = pending;
    pending = '';
    markdown.appendMarkdown(chunk); // 전체 프레임 토큰에 대해 단 ONE 번의 레이아웃
    transcript.scrollToBottom();
  });
}

for await (const token of llmStream) pushToken(token);
```

200토큰/s 스트림을 60fps에서 사용하면 초당 ~200회의 레이아웃 패스가
~60회로 줄어듭니다 — 그리고 부하가 걸리면 우아하게 저하됩니다: 메인 스레드가 바쁠수록
플러시되는 청크는 더 커지고(그리고 _더 드물게_) 발생합니다. 이 패턴은
자체 조정됩니다; 고정 `setInterval` 디바운스는 그렇지 않습니다.

> [!NOTE]
> `scene.markDirty()`는 이미 자연스럽게 병합됩니다 — 한 프레임에 세 번의 append는
> 하나의 플래그를 설정하고 한 번의 리페인트만 소모합니다. append의 비용이 많이 드는 부분은
> **레이아웃**이지 더티 플래그가 아니므로, 배칭은 append 자체를
> 감싸야 합니다.

## Append API 선택

| 콘텐츠        | API                                  | 호출당 비용                                                                                                    |
| ------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 일반 텍스트   | `text.append(chunk)`                 | 콜드 패스지만, `\n`으로 끝나는 완성된 문단은 문단 메모가 재사용                                                |
| 스타일 스팬   | `richText.appendSpans(spans)`        | 스팬을 추가; 이전 스팬의 측정값은 재사용                                                                       |
| Markdown      | `markdown.appendMarkdown(chunk)`     | 원본 소스를 다시 렉싱(`Worker`가 있으면 오프-스레드), 완성된 블록 엔티티 재사용, 마지막 문단을 제자리에서 확장 |
| 모든 것, 대체 | `setText` / `setContent` (안티-패턴) | 전체 재구축 — 토큰별로 커지는 문서에 절대 호출 금지                                                            |

`appendMarkdown` 안에 숨은 두 가지 비용을 알아야 합니다:

1. **렉싱은 O(청크)가 아니라 O(문서)입니다.** 각 호출은 누적된 전체 소스를
   다시 토큰화합니다. 파싱은 사용 가능한 경우 백그라운드 Worker에서 실행되고
   (`Worker`가 없는 환경에서는 동기 렉싱으로 폴백), 엔티티 업데이트는 완성된
   모든 블록을 재사용합니다 — 하지만 10만 문자 대화록은 여전히 플러시당 10만 문자
   렉스를 소모합니다. 프레임별 배칭은 이를 토큰-퍼-프레임 팩터로 나누고;
   대화록 분할(아래)은 이를 제한합니다.

2. **문단 메모이제이션은 `\n`을 키로 사용합니다.** `Text.append`와 Markdown
   문단 업데이터 모두 변경된 문단만 다시 측정합니다. 줄바꿈 없는 끝없는
   한 줄은 메모를 무력화시키고 플러시당 O(문서) 측정으로 저하됩니다.
   LLM 출력에는 자연스러운 문단 나누기가 있습니다; 로그 줄은 `\n`으로 끝납니다 —
   보통은 공짜로 얻지만, 줄바꿈을 제거하지 마세요.

## 타이프라이터 페이싱(Typewriter pacing)과 라이프사이클

성능 배칭이 기본값입니다. 제품에 타자기 효과(typewriter reveal)가 필요할 때만 고정된 wall-clock 페이싱을 추가하세요:

```typescript
const stream = markdown.createStream({
  pacing: { graphemesPerSecond: 48 },
  maxBufferedChars: 64 * 1024,
  signal: requestAbort.signal,
});
```

페이싱은 결코 "프레임당 하나의 토큰"으로 전환되지 않습니다. rAF 타임스탬프에서 `graphemesPerSecond` 크레딧을 누적하고, 한 프레임에 여러 그래핌(grapheme)을 렌더링할 수 있으며, 여전히 최대 한 번의 append 커밋만 수행합니다. 100ms 타임스탬프 제한은 백그라운드 탭이 밀린 데이터를 대량으로 한 번에 쏟아내는 것을 방지합니다.

슬라이싱은 청크/프레임 경계를 넘나들 때도 `Intl.Segmenter`를 사용하므로 결합 마크(combining marks), 이모지 ZWJ 시퀀스, 플래그 및 서로게이트 쌍(surrogate pairs)이 분리되지 않고 함께 유지됩니다. 유니코드는 단일 그래핌이 무제한으로 커지는 것을 허용합니다. 만약 악의적인 입력이 경계에 도달하지 않고 완전히 제한된 accepted-plus-blocked 윈도우를 채우는 경우, 컨트롤러는 교착 상태에 빠지거나 메모리를 무한정 늘리는 대신 하나의 유니코드 코드 포인트(결코 서로게이트 쌍의 절반이 아님)를 커밋합니다.

- `flush()`는 제출된 텍스트를 동기적으로 커밋하고 스트림을 열어 둡니다.
- `close()`는 차단된 쓰기를 허용하고, 보류된 그래핌 꼬리를 해제하며, 한 번의 순서화된 최종 커밋을 수행한 후 닫습니다.
- `abort(reason)`은 커밋되지 않은 텍스트를 버립니다. 대기 중이거나 향후 작업은 보존된 reason과 함께 거부(reject)됩니다.
- `Markdown.setContent()`는 교체하기 전에 활성 컨트롤러를 중단(abort)합니다.
- `Markdown.destroy()`는 이를 중단(abort)하고 rAF/`AbortSignal` 리스너를 제거합니다.
- 하나의 `Markdown`은 최대 하나의 열린 컨트롤러를 소유합니다; 터미널 컨트롤러는 등록을 해제하여 이후 스트림이 시작될 수 있도록 합니다.

## 렌더 모드와 유휴 스로틀

스트리밍 UI는 `renderMode: 'onDemand'`를 사용해야 합니다:

```typescript
const scene = new Scene(canvas, { renderMode: 'onDemand' });
```

모든 append는 씬을 더티로 표시하므로, 콘텐츠가 흐르는 동안에만 정확히 프레임이
렌더링되고 스트림이 유휴 상태가 되면 즉시 중단됩니다 — 2fps 자동 스로틀 서프라이즈도
없고 응답 사이의 유휴 배터리 소모도 없습니다. Append API와 내장
스크롤 컨테이너는 모두 진행 중인 모션을 보고하므로(`hasPendingAnimations()`),
마지막 토큰이 도착한 후에도 부드러운 스크롤이 계속 애니메이션됩니다.

스트림 중에 `update()`에서 _사용자 정의_ 프레임별 모션(타이핑
인디케이터, 깜빡이는 커서)을 구동하는 경우,
[유휴-스로틀 계약](/learn/performance/#유휴-자동-스로틀-숨은-함정)을
기억하세요: `hasPendingAnimations()`를 재정의하거나 `animate()`/`springTo()`로 구동하세요.

## 하단 따라가기

`ScrollView.scrollToBottom()`은 콘텐츠 끝으로 **스냅**합니다 — 의도적으로
스크롤 스프링을 우회합니다. 스프링을 초당 여러 번 재타겟팅하면
절대 안정되지 않고 뷰포트가 최신 콘텐츠를 추적하는 대신 떨리기 때문입니다.
위 레시피에서처럼 동일한 rAF 플러시 안에서 append와 함께 호출하여
새 레이아웃 _이후에_ 대상을 계산하세요.

채팅 UI의 경우 사용자 의도를 따르세요: 사용자가 이미 하단에 있었을 때만
하단에 고정하세요. `content`는 공개되어 있고 그 `y`는 음수 스크롤
변환 값을 가지므로, "하단"은 다음과 같습니다:

```typescript
function nearBottom(sv: ScrollView, slack = 24): boolean {
  const maxScroll = Math.max(0, sv.content.height - sv.height);
  return -sv.content.y >= maxScroll - slack;
}

// 플러시에서: 추가하기 전에 고정 여부를 읽고, 이후에 적용.
const stick = nearBottom(transcript);
markdown.appendMarkdown(chunk);
if (stick) transcript.scrollToBottom();
```

하나의 플러시 안에서 읽기-추가-스크롤 순서가 핵심입니다: 추가 후에
"하단에 있었는지"를 측정하면 콘텐츠가 커진 후에는 항상 "아니오"라고 답합니다.

> [!NOTE]
> 두 스크롤 API는 의도적으로 비대칭입니다: `scrollTo(y)`는 스크롤 **스프링**을
> 재타겟팅하고(따라서 `content.y`가 다음 프레임에 걸쳐 그쪽으로 애니메이션),
> `scrollToBottom()`은 **스냅**합니다. `scrollTo` 직후에 읽은 위치-기반 상태는
> 이전 위치를 표시합니다 — 위의 고정 패턴처럼 다음 플러시에 읽으세요.

## 긴 대화록: 세그먼트화 후 가상화

Append 비용과 렉스 비용 모두 문서 크기에 따라 증가하므로 문서를 제한하세요.
채팅/로그 UI를 위한 2단계 전략:

1. **메시지별 세그먼트.** 전체 대화에 대해 하나가 아니라 보조 메시지당 하나의
   `Markdown` 엔티티. 스트리밍 엔티티는 항상 작아서(진행 중인 메시지만),
   대화 길이에 관계없이 플러시당 렉싱이 저렴하게 유지됩니다. 완료된 메시지는
   다시 렉싱되지 않습니다.
2. **히스토리 가상화.** 메시지가 별도 엔티티가 되면,
   [`VirtualList`](/reference/ui-virtuallist/)가 보이는 것만 렌더링합니다.
   천 개 메시지의 대화록은 뷰포트가 보여주는 만큼만 비용이 들고,
   세션이 누적한 만큼이 아닙니다.

```typescript
function startAssistantMessage(): Markdown {
  const md = new Markdown('', { maxWidth: 640 });
  messages.push(md); // VirtualList 데이터 소스
  return md; // 이 엔티티로만 스트리밍
}
```

이것은 또한 메모리를 제한합니다: 완료된 메시지의 레이아웃은 정적이고 제거 가능하며,
멀리 뒤로 스크롤해도 라이브 테일의 재레이아웃이 절대 트리거되지 않습니다.

## 스트리밍 UI 측정

증상과 신호를 확인해야 할 순서대로:

| 증상                            | 프로브                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| 스트리밍 중 버벅임              | 초당 append 수 vs 초당 프레임 수 — append ≫ 프레임이면 rAF 배치가 누락된 것             |
| 대화록이 길어질수록 버벅임 증가 | 계속 커지는 하나의 엔티티로 스트리밍 중 — 메시지별로 세그먼트화                         |
| 긴 문단에서 전체 UI 멈춤        | 스트림에 `\n` 없음 — 문단 메모가 분할 불가; 소스 포맷 확인                              |
| 스크롤이 사용자와 충돌          | 무조건 `scrollToBottom()` — "하단에 있었는지" 고정 조건으로 게이트                      |
| 스트림 유휴 중 CPU 바쁨         | 씬이 `'always'` 모드로 남아있거나, `hasPendingAnimations()` 없는 사용자 정의 애니메이션 |

실제 숫자는 [실제 성능 측정](/learn/performance/#실제-성능-측정)의
인페이지 측정 패턴을 사용하세요 — headless FPS는 대표적이지 않습니다.

> **다음:** [성능](/learn/performance/) 전체 최적화 도구 모음 및
> 스트리밍 API 참조를 위한 [`Markdown`](/reference/ui-markdown/).
