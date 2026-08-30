---
title: '04 — 스트리밍 Markdown — 점진적 Reconcile'
description: '모든 prefix가 왜 불완전한 문법일 수 있는지, committed-prefix 렉서, 워커 델타 프로토콜, in-place 뮤테이터를 동반한 토큰→엔티티 reconcile, O(C·N²)와 wrapper-instanceof 함정, 그리고 새 확장을 안전하게 추가하는 방법.'
order: 24
---

# 04 — 스트리밍 Markdown — 점진적 Reconcile

LLM 스트림은 **추가 전용** 및 **토큰 단위**(청크당 최대 4자)입니다. VectoJS는 모든 청크 후에 읽을 수 있는 문서를 표시해야 합니다. `close()`까지 공백이 없습니다. 명백한 전략(누적된 전체 소스를 다시 추출하고 매번 엔터티 트리를 다시 작성)은 청크당 `O(document)`이므로 스트림에 대해 `O(N²)`입니다. 이 장은 대신에 `O(unstable tail)`을 만드는 메커니즘이며, 각 절반을 자동으로 작동하지 않게 만드는 트랩입니다.

## 왜 모든 prefix가 불완전한 문법인가

`marked`은 **원샷** 어휘분석기입니다. 전체 소스가 존재한다고 가정합니다. 종료자가 아직 도착하지 않은 모든 Markdown 구문은 일단 도착하면 접두사의 의미를 변경합니다.

| 화면의 접두사               | 지금은 어떤 모습인가요                                               | 다음 덩어리는 무엇을 만들 수 있나요                                                                                      |
| --------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `## Heading` 후행 없음 `\n` | `heading(depth:2)`                                                   | `heading(depth:1)` 선행 `#`이 아직 비행 중인 경우(`#` → `##`) — 선이 끝날 때까지 깊이가 안정적이지 않습니다              |
| `**bold`                    | `text("**bold")` + 리터럴 `**`                                       | `strong("bold")` 마감 `**`이 도착하면                                                                                    |
| `[label](https://ex`        | `text("[label](https://ex")` + 자동 링크된 기본 URL                  | `link(label → https://example.com)` — URL이 아직 완전한 href가 아닙니다                                                  |
| ````js\nconst a=1 `         | `code(lang:js, text:"const a=1")` with unclosed fence                | still a `code` — but the fence may also become ` ```수학 ` and then typeset as display math                              |
| `\| \| b \|\n\| --- \| ---` | `table(header:[a,b], 행:[])` — delimiter row, zero body rows         | `table(rows:[[…]])` — `marked` materializes a partial row as a full row of **empty cells** then fills them one at a time |
| `$$\nx`                     | `paragraph("$$\\nx")` (the extension clips marked's paragraph input) | `blockMath("x")` once `$$` closes — plus marked's `start()` clip can **retroactively merge** two prior `paragraph` 토큰  |

스트리밍 인식 레이어가 없으면 이러한 모든 뒤집기는 렌더링된 엔터티의 분해가 됩니다. 레이어에는 lex와 reconcile의 두 부분이 있으며 결함은 이음새에 존재합니다.

## 아키텍처 — lex · transfer · reconcile

```text
chunk ──► consumeFrontMatter ──► dispatchAppend ──► MarkdownWorker (off-thread)
                │                        │                    │
                │ rawMarkdown            │ postMessage         │ incrementalLex
                │ (body only)            │ {append,expectedLen}│ lexAppend / lexFull
                │                        │  or {text,oldRaws}  │ findStableCut + verify
                │                        │                    │
                ◄────── matchLen + tail ─┘                    │
                              │                               │
                     updateTokens(matchLen, tail)  ◄──────────┘
                              │
              ┌───────────────┼───────────────────┐
              │ prefix [0,matchLen) kept          │  entitiesReused++
              │ tail: reuse / rebuild / mutate    │  inPlaceUpdates vs entitiesRebuilt
              └───────────────┼───────────────────┘
                              │
                    content Stack + width/height republish
                              │
                    Scene.markDirty() + notifyLayoutUpdated()
```

세 가지 모듈은 세 단계를 소유합니다.

- **렉스** — `packages/markdown/src/incrementalLex.ts:446` `lexFull` / `packages/markdown/src/incrementalLex.ts:477` `lexAppend` 더하기 `MarkdownWorker.ts:230` `self.onmessage`. 캐시는 `IncrementalLexCache` (`incrementalLex.ts:207`): `source`, `tail = source.slice(stableOffset)`, `tokens`, `stableCount`, `stableOffset`, `degraded`입니다.
- **이전** — `Markdown.ts:2244` `dispatchAppend` 및 `MarkdownWorker.ts:345` 차이. 안정된 상태에서는 `{append, expectedLength}`(델타)을 보냅니다. first/resync/recovery는 `{text, oldRaws}`(전체)을 보냅니다. 작업자 diff는 `matchLen`을 계산하고 `tail = tokens.slice(matchLen)`을 반환합니다.
- **화해** — `Markdown.ts:3674` `updateTokens(oldTokens → newTokens, knownMatchLen)`. `tokenChildPrefix`(`Markdown.ts:1030`, `Markdown.ts:1041`에서 `setTokens`에 의해 증분적으로 유지 관리됨)을 통해 토큰 인덱스를 하위 슬롯에 매핑한 다음 토큰당 세 가지 경로(**손대지 않은 재사용**, **내부 변경**(`setSpans`/`setCode`/`appendRows`) 또는 **파괴 + 재구축**)을 매핑합니다.

머리말은 어휘 분석(`frontMatter.ts:94` `scanFrontMatter`, `Markdown.ts:1116` `initSource` / `Markdown.ts:1157` `consumeFrontMatter`) **앞에서** 제거되므로 작업자는 이에 대한 개념을 유지하지 않습니다. `workerSourceLen` 및 `expectedLength`은 본문 텍스트에만 오프셋을 유지합니다. 해결되지 않은 오프너는 최대 `MAX_PENDING_CHARS = 4096`(`frontMatter.ts:62`)까지 보류되고 `waitForAppendSettled`(`Markdown.ts:1409`) 이전에 스트림의 `onClose`에서 `finalizeFrontMatter()`에 의해 해제됩니다.

### 기존 경로가 하던 일

`incrementalLex` 이전에는 `MarkdownWorker`이 `{source, raws, version}`(`MarkdownWorker.ts:213` 이전 형태)를 보유하고 델타를 추가한 다음 누적된 **전체** 소스를 렉싱했습니다. `99.5%` 원시 접두사 일치는 lex _후에_ 실행되었으므로 엔터티 재빌드를 저장했지만 어휘 분석은 저장할 수 없었습니다. 선형 파서는 증가하는 접두사에 대해 `N`번 호출했습니다. `postMessage`은 전체 토큰 트리를 다시 보냈습니다. 두 절반 모두 청크당 `O(document)`이었습니다. § Numbers의 벤치마크는 수정 사항이 적용되기 전에 이를 인용 가능하게 만들었습니다.

## 점진적 lex — committed-prefix 아이디어

`marked`에는 증분 API가 없습니다. 수정 사항은 **안정적인 블록 경계**(토큰 목록이 더 이상 변경될 수 없는 문자 오프셋)를 추적하고 그 뒤의 텍스트만 다시 검색합니다.

### stable-cut 규칙

`findStableCut`(`incrementalLex.ts:331`)은 **뒤에 최소 하나의 토큰**이 있는 `space` 토큰을 거꾸로 검색합니다. 두 개의 인접한 `paragraph` 토큰 중 첫 번째 토큰을 절대 지나치지 않으며, 확정된 경우에만 다음을 수행합니다.

- 푸시된 `space`은 항상 **실제 빈 줄**을 의미합니다. 단독 `\n`은 이전 토큰의 `raw`(`incrementalLex.ts:36`)에 병합됩니다.
- 모든 기본 제공 규칙에 대해 소스 끝 부분에 인접한 토큰만 변경할 수 있습니다. `nFollow >= 1` 형식은 무차별 대입 방식으로 처리되었습니다. 모든 선행 유형(`blockquote`, `code`, `heading`, `hr`, `html`, `list`, `paragraph`, `table`)에는 안전하지만 `nFollow == 0`은 `code`/`list`/`paragraph`(`incrementalLex.ts:39`)에 실패합니다.
- **`list`에는 2개의 토큰 지연이 필요합니다.** `'- a\n\n- b\n'`는 빈 줄 수에 관계없이 하나의 `list`입니다. 동일한 마커는 항상 병합됩니다. `cutIsSettled`(`incrementalLex.ts:314`)에서는 이전 `list`을 통한 컷이 수행되기 전에 `space` 자체가 정산된 후 토큰이 필요합니다.
- **`blockMath` 앞으로 도달**은 토크나이저의 빈 줄(`(?:(?!\n[ \t]*\n)[\s\S])+?` (`Markdown.ts:294`, `MarkdownWorker.ts:122`))으로 제한됩니다. 이전 `(?!\n\n)`는 공백 전용 줄을 보호하지 않은 상태로 두었습니다. — `'$$\nx\n   \n$$\n'`은 여전히 `blockMath`(`incrementalLex.ts:67`)이었습니다.
- **`blockMath` 뒤로 도달**은 `paragraphPairCap`(`incrementalLex.ts:289`)입니다. 표시된 `startBlock` 클립은 **두 개의 인접한** `paragraph` 토큰만 융합할 수 있으며 안정적인 절단은 항상 `space` 후에 끝나므로 쌍이 경계를 넘을 수 없습니다. 오래된 치료법(라인 스타트 `$$`의 성능 저하)은 충분했지만 결코 필요하지 않았습니다. `139×`을(를) 회수한 상한선을 좁혔습니다(§ 숫자 참조).
- **링크 참조, `:::` 컨테이너, `[^label]:` 각주** 성능이 완전히 저하됩니다(`incrementalLex.ts:225`에서 `DegradeReason`): `def`는 이전 인라인 토큰(`incrementalLex.ts:122`)을 소급하여 다시 작성하고, 컨테이너 펜스 및 각주 연속 스캐너(`markdown-footnote.ts` `consumeContinuation`)는 무제한 앞으로 도달할 수 있습니다. Degrade는 정확성을 유지합니다. 비타일링 진행(`incrementalLex.ts:360`의 `advanceTiles`)을 거부하면 대신 창 성장의 한 덩어리가 필요합니다.

모든 대출은 **검증**됩니다(`advanceTiles`, `incrementalLex.ts:360`). `source.slice`는 이를 포함하는 토큰의 연결된 `raw`과 동일해야 합니다. 베어 목록 마커 `'- a\n- '`로 끝나는 소스는 원시 `'- a\n-\n'`로 렉싱됩니다. 즉, `raw` 타일 소스가 일반적으로 사실이지만 항상 그런 것은 아니라는 가정(`incrementalLex.ts:130`)이므로 확인되지 않은 발전은 저하되기보다는 거부됩니다.

### 비용 모델

- `tail = prev.tail + append` — `tail`만 스캔하면 `O(document)`(`incrementalLex.ts:490`)이 아닌 `O(window)` 수표가 유지됩니다.
- `charsLexed` (`incrementalLex.ts:248`)는 실제로 `marked.lexer()`에 전달된 문자를 보고합니다. 이는 경계가 저장한 내용을 직접적으로 측정한 것입니다. `reusedTokens`은 캐시에서 가져온 선행 토큰을 보고합니다.
- 순진한 `sourceCharsLexed` 합계 자체는 스트림(#657)을 통해 응답당 `matchLen` 원시(`O(n²)`)를 다시 합산했습니다. 이제 `IncrementalLexCache.stableOffset`이 lex에서 제공되고 `O(1)`(`Markdown.ts:989`, `Markdown.ts:2289`)이 추가됩니다.

### 핫 패스의 확장 — 왜 PX-0524가 중요한가

각 `marked` 확장은 `start()` 스캔 + 토크나이저를 등록합니다. 증분 경로는 이를 분류해야 합니다(§ 확장 추가 참조). 그렇지 않으면 `sourceCharsLexed`가 문서 길이로 회귀합니다. 즉, 이 인스턴스의 성능이 저하된 `getDevtoolsDescriptor`의 `Parser cost` 그룹(`Markdown.ts:2112`)에 있는 신호입니다.

## 워커 프로토콜 — 왜 전송도 중요한가

Re-lexing은 유일한 `O(N²)` 용어가 아니었습니다. `postMessage` **구조화된 클론**은 기본 스레드에서 해당 인수를 동기식으로 실행합니다. 청크당 전체 문서를 재전송하면 lex가 창을 연 후에도 `O(document)`이 전송됩니다. 청크 크기 게시물(`Markdown.ts:1017`)의 경우 플랫 `~2 µs`에 비해 8KB에서 `4 µs`이 512KB에서 `220 µs`로 증가하는 것으로 측정되었습니다.

수정 사항은 `workerInstanceId` + `tokenVersion`(`Markdown.ts:1008`)으로 키가 지정된 작업자(`MarkdownWorker.ts:213` `rawCache`)의 원시 토큰 **및** 소스를 모두 캐시합니다. `tokenVersion`이 매 `setTokens`(`Markdown.ts:1043`)마다 충돌하지 않으면 `setContent` 뒤에 추가가 있으면 오래된 원시 파일과 다릅니다.

- **델타** — `append` + `expectedLength`(`Markdown.ts:2345`). 작업자는 `cached.lex.source`을 `append`로 확장하고 `cached.lex.source.length + append.length === expectedLength`(`MarkdownWorker.ts:308`)(하나의 정수, 문자열 작업 없음)을 확인하고 `lexAppend`을 실행합니다.
- **전체** — `text` + `oldRaws` (`Markdown.ts:2355`), 첫 번째 요청의 경우 `setContent`, 동기화 대체 또는 `needResync`. 작업자는 분산된 소스를 렉싱하는 대신 한 번의 재동기화(`MarkdownWorker.ts:294`, `299`, `334`)를 요청합니다. 잘못된 `matchLen`은 호출자의 `updateTokens`을 손상시킬 수 있습니다.

`matchLen`은 호출자가 비교한 **동일한** 이전 목록에서 계산됩니다. 작업자가 lex의 `reusedTokens`을 재사용하면 스캔은 `reusedTokens` (`MarkdownWorker.ts:385`) — `O(window)`에서 시작됩니다. 0에서 스캔으로 다시 돌아가면 다시 `O(document)`이 됩니다. 제거는 가장 오래된 항목 삭제로 제한됩니다(`RAW_CACHE_MAX = 256`, `MarkdownWorker.ts:228`).

호출자는 디스패치(`Markdown.ts:2252`) 시 `this.tokens` 및 `this.tokenVersion`의 스냅샷을 생성하고 `appendInFlight`이 true인 동안(`Markdown.ts:2220`) 통합합니다. `dispatchedAt` 타임스탬프는 `streamStats.workerMs / workerMsMax`(`Markdown.ts:2273`)을 피드하며 최악의 값은 드롭된 프레임 신호입니다.

## Reconcile — 토큰 트리 → 엔티티 트리, 바뀌지 않은 것은 재구축하지 않기

### committed-prefix 아이디어 — 직관

문서를 `stableOffset`에서 분할된 두 영역으로 생각하세요.

```text
[████████████ stable █████████████████] [ unstable tail ]
 |  already committed — never re-lexed  |  may still change |
 |  raw-equal, entity-reused            |  this chunk's work |
```

**꼬리에만** 추가된 텍스트는 안정적인 접두사에 영향을 미칠 수 없습니다. 즉, `findStableCut`은 무차별 대입으로 얻는 불변의 접두사입니다. 꼬리는 `O(window)`입니다. 즉, 빈 줄과 열려 있는 컨테이너 사이의 거리로 제한됩니다. 따라서 청크당 작업은 문서 길이가 아닌 열린 영역에 따라 확장됩니다.

### DevTools — 실시간으로 관찰하기

`getDevtoolsDescriptor`(`Markdown.ts:1989`)은 위의 인용문에 따라 스트리밍 카운터를 표시합니다.

- `Streaming` — `appends` / `workerResponses` / `workerMsAvg` / `workerMsMax`(삭제된 프레임은 `avg`이 아니라 `max`입니다).
- `Delta shape` — `stablePrefixChars` / `changedTailChars` 비율(1에 가까울수록 높은 재사용을 의미함) 및 `entitiesReused` / `entitiesRebuilt` / `inPlaceUpdates`(빠른 경로).
- `Incremental reuse` — `tokensPrefixMatched` / `tokensReturned` / `tokenPrefixReuseRatio`.
- `Parser cost` — `lexerMs` / `sourceCharsLexed`. `sourceCharsLexed`이 문서 길이를 추적하는 경우 이 인스턴스의 성능이 저하됩니다.

### 토큰을 자식 슬롯에 매핑하기

모든 블록 토큰이 엔터티를 렌더링하는 것은 아닙니다(`space`, SVG가 아닌 `html`, 주석과 같은 토큰이 `null`를 렌더링함). `producesEntity` (`Markdown.ts:4044`)은 술어입니다. `tokenChildPrefix`는 접두사 합계이며 `setTokens(validFrom)`(`Markdown.ts:1041`)에 의해 변경된 접미사에 대해서만 다시 작성됩니다. `updateTokens` 다음:

1. `matchLen` — 원시와 동일한 접두사 길이를 파생합니다. 작업자가 `knownMatchLen`을 제공하면 맹목적으로 신뢰(`Markdown.ts:3689`)하는 대신 검증(`0 ≤ knownMatchLen ≤ minLen`)됩니다.
2. `abbreviations`이 변경된 경우 `matchLen`을 `0`로 제한합니다(`collectAbbreviations`에 대한 `Markdown.ts:3711` `mapsEqual`). 늦은 `*[TERM]: …`은 변경되지 않은 `raw`(`hasLinkDefinitions`과 평행한 `markdown-abbr.ts`)에도 불구하고 이전 단락의 인라인 토큰에 영향을 미칠 수 있습니다.
3. `matchLen === oldTokens.length - 1`과 유형이 일치할 때 **내부** 빠른 경로를 시도합니다(`Markdown.ts:3760` `lastTokenSameType`). 그렇지 않으면 접미사에 대해 파괴 + 재구축이 발생합니다.

참고: `updateTokens`' 파괴 루프는 `matchLen`에서 **에서 시작됩니다. 이는 `i >= matchLen` 가드를 사용하여 `0`에서 걸어가는 데 사용되었으며 접두사가 완전히 재사용된 경우에도(`Markdown.ts:3956`) 청크당 `O(total blocks)`이 되었습니다.

### In-place 뮤테이터 — 꼬리가 자라는 경우

스트리밍 현실은 **꼬리가 커지는 추가 전용**입니다. 7개의 돌연변이는 하천이 실제로 생성하는 꼬리 모양을 포괄합니다.

| 테일 토큰                   | 돌연변이                                                                             | 파일:줄                                                        |
| --------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `paragraph` (이미지 없음)   | `RichText.setSpans(literalSpans)`                                                    | `Markdown.ts:3833`                                             |
| `paragraph`(이미지 포함)    | `[RichText, Image, …]` 중 `Stack`: `setSpans`을 통해 후행 `RichText` 확장            | `Markdown.ts:3846` `updateImageParagraph` (`Markdown.ts:3085`) |
| `code` (닫히지 않은 울타리) | `CodeBlock.setCode(text, lang)`                                                      | `Markdown.ts:3796`                                             |
| `heading`                   | `RichText.setSpans(headingSpans)`(깊이 가드 포함)                                    | `Markdown.ts:3875`                                             |
| `blockquote`                | `innerStack` tail 래퍼로 내려와 단일 하위 항목을 다시 작성                           | `Markdown.ts:3900` `updateBlockquoteTail` (`Markdown.ts:3306`) |
| `list`                      | 마지막으로 보관된 항목의 `setSpans`, `append` 새 항목 다시 쓰기                      | `Markdown.ts:3914` `updateStreamedList` (`Markdown.ts:2987`)   |
| `table`                     | 마지막으로 유지된 행의 셀에서는 `RichText.setSpans`, 새 행의 경우 `Table.appendRows` | `Markdown.ts:3932` `updateStreamedTable` (`Markdown.ts:3203`)  |

모든 테일 재동기화는 전체 `Stack.layout()`(`Markdown.ts:3843`, `3859`, `3886`, `3904`, `3945`)이 아닌 `resizeLastChild`(`Stack.ts` 빠른 경로) — `O(1)`입니다. 속성 arm `reflowToken`(`Markdown.ts:1520`)은 `setMaxWidth`에 대한 비스트리밍 대응입니다. `renderToken`과 arm-for-arm을 유지하므로 너비 변경 시 재구축이 필요하지 않습니다.

`renderToken`(`Markdown.ts:4150`)은 건설 현장입니다. `producesEntity` 및 `reflowToken`은 추가된 암에서 **3방향 잠금 단계**를 유지해야 합니다. 다른 두 개가 없는 새 암은 세 호출 사이트 중 하나에 대한 조용한 버그입니다.

### 마크다운 블록의 레이아웃

블록 형상은 `LayoutEngine`(`packages/layout/src/LayoutEngine.ts:808`)에 의해 구동됩니다. `RichText`는 수직 `Stack` 간격 `theme.blockGap`을 통해 `availableWidth`(`Markdown.ts:4158`)에서 래핑됩니다. 큰따옴표와 `:::` 컨테이너는 `innerStack`을 `quoteIndent`/`containerIndent`만큼 들여쓰고 결과 `Stack` 높이(`Markdown.ts:3403`, `Markdown.ts:4402`)에 `QuoteBorder`/`ContainerBackground`을 걸어 놓습니다. 어포던스 버튼용 `measureText`은 문서 글꼴(`blockAffordances.ts:379`)을 사용하므로 컨트롤은 그리기 전에 크기가 조정됩니다. `LayoutEngine.prepareRich`은 `RichText`의 줄바꿈입니다. 메모는 너비가 아닌 내용에 맞춰져 있으므로 `setMaxWidth`은 재측정이 아닌 모양을 통해 다시 래핑됩니다. `reflowToken`이 존재하는 것과 같은 이유입니다.

### 스크롤과 선택 훅

가상화되지 않은 `Markdown`은 `ScrollView`(`packages/ui/src/ScrollView.ts:219` 스프링 드라이버)의 일반적인 하위 항목입니다. 호스트는 `content.y`을 설정하여 스크롤하고 재레이아웃이 블록을 이미지 아래로 이동할 때 `notifyLayoutUpdated`(`Markdown.ts:2643`)를 호출합니다. `virtualize`을 켜면 `Markdown.setVisibleRange`(`Markdown.ts:1265`)이 스크롤 드라이버입니다. 오프스크린 높이는 분리된 엔터티가 아닌 `RowHeights`에 있습니다. 선택은 `RichText` 범위에 있습니다. `updateTokens` 접두사 재사용은 컴포지터 경로 외부에 고정된 선의 `InlineObject` 캐리어(이미지/수학 `OBJECT_REPLACEMENT`)를 유지하는 반면, 성장하는 꼬리의 `setSpans`는 선 형상을 다시 작성하지 않고 내부 선택을 유지합니다.

## O(C·N²) 함정과 wrapper-instanceof 버그

### O(C·N²) — 테스트가 생성하지 못한 형태

`table` 토큰은 **모든 행**을 전달합니다. `list` 토큰은 **모든 항목**을 운반합니다. `blockquote`는 **모든 내부 블록**을 운반합니다. 순진한 조정은 모든 청크에서 모든 것을 재구성했습니다.

- `N` 항목 목록, 항목별로 스트리밍됨: `1 + 2 + … + N = Θ(N²)` `RichText` 구성 — 32개 항목 목록에 대해 `32`에 대해 `528`을 측정했습니다(`Markdown.ts:3908` 주석).
- `N` 행 중 Table, `C` 열: `Θ(C·N²)` 셀 구성 **플러스** `Table.layout()` 모든 셀에서 `fitCell` 재실행 — 맨 위에 `2×`.

종합 성적표 벤치는 `mixed`이 모든 후속 산문 덩어리에 대해 방금 도착한 전체 목록을 여전히 재구축했음을 나타냈습니다. 이는 단일 구성 형태(`benchmarks/markdown-transcript/corpus.ts`)에는 보이지 않습니다.

### wrapper-instanceof 미스 — 왜 스트리밍이 opt-in 플래그 아래에서 퇴보했는가

`blockAffordances: true`은 `BlockWithAffordances`(`blockAffordances.ts:433`)의 코드와 테이블을 래핑합니다. `UIComponent`은 블록과 해당 복사/다운로드 `BlockAffordanceButton` 하위 항목을 소유하고 블록(`blockAffordances.ts:457`)에서 자체 크기를 지정하며 `role: group`(`blockAffordances.ts:488`)으로 프로젝트합니다. 래퍼는 DOM 순서 = 탭 순서를 수정하고 `Stack`/`Table`에서 레이아웃을 도용하는 것을 방지합니다.

스트리밍 빠른 경로는 `existingEntity instanceof Table` / `instanceof CodeBlock`을 직접 테스트했습니다. 래퍼를 켠 상태에서 해당 테스트는 **항상 false를 반환**하므로 모든 청크가 전체 재구축 비용을 지불했습니다.

수정 전 영향을 받은 사이트: `updateTokens`(`Markdown.ts:3781`, `Markdown.ts:3209`), `updateBlockquoteTail` 꼬리 추출(`Markdown.ts:3348`), `reflowToken` `code`/`table` 암(`Markdown.ts:1557`, `Markdown.ts:1651`), `updateStreamedTable`(`Markdown.ts:3212`). 패턴은 다음과 같습니다

```ts
const target = entity instanceof BlockWithAffordances ? entity.block : entity;
if (!(target instanceof Table)) return false;
// … and after a width/content change:
if (entity instanceof BlockWithAffordances) entity.refreshAffordances();
```

`#789` / `#795` (`vectojs` 문제)는 이 버그입니다. `code-review-2026-08.md:167`은 클러스터되기 때문에 모든 사이트를 함께 기록합니다.

### 왜 스냅샷 테스트가 이를 놓쳤는가

마크다운 제품군은 `setContent` 기반 스냅샷이 지배합니다. `setContent` **항상 재구축**(`Markdown.ts:1740`): `tokenVersion`을 재설정하고 하위 항목을 지우고 `renderMarkdown`을 호출합니다. 스트리밍 조정 경로(`updateTokens` + `inPlaceUpdates`/`entitiesRebuilt`/`tokenChildPrefix` + 래퍼 언래핑)를 **절대 실행하지 않습니다**. 재사용 경로만 중단하는 확장 또는 옵션은 모든 스냅샷을 통과했으며 토큰 세분성에서 `appendMarkdown`에서만 실패했습니다. `setContent`을 몰고 재사용을 보호한다고 주장한 `1/11` 파괴 행위가 표준적인 예입니다(`forge/findings/text-richtext-and-markdown.md:552`).

게이트 규칙: 모든 스트리밍 변경에는 **스트리밍 동등 방해 행위**가 포함되어야 합니다. 즉, 모든 접두사(`incrementalLex.test.ts` 패턴)에서 `marked.lexer()`에 대해 깊은 `toEqual`을 사용하고 조정을 위해 `appendMarkdown` 세분성을 사용하여 한 번에 한 문자씩 코퍼스를 스트리밍해야 합니다.

### PX-0524 확장 폭증 — 점진적이어도 공짜가 아닐 때

구문 적용 범위(각주, 컨테이너, 이모티콘, abbr, ins/mark, 위 첨자 — `markdown-footnote.ts` `FOOTNOTE_EXTENSIONS`, `markdown-container.ts` `CONTAINER_EXTENSIONS`, `markdown-emoji.ts` `EMOJI_EXTENSIONS`, `markdown-abbr.ts` `ABBR_EXTENSIONS`, `markdown-ins-mark.ts`, `markdown-superscript.ts`)를 추가하면 `faeeb0b7`의 `2` 확장에서 공유 `marked` 인스턴스를 `12`로 가져왔습니다. `2a4bd52`. 각각은 `marked`이 **블록당 및 인라인 범위당** 참조하는 `start()`/`tokenizer` 쌍입니다. 따라서 `incrementalLex`이 lex를 `O(tail)`로 윈도우화하더라도 청크당 비용은 `O(tail × extensions)`입니다. § 숫자의 `1.67×` 구문 분석 상승은 이 클러스터의 가격이 청크별로 책정된 것이며 배송 시 측정되지 않았습니다. `markdown-math.ts:258` `blockMath`/`inlineMath`는 이미 지불된 두 가지입니다. 나머지 10개는 단계 변경입니다. 교훈: 모든 확장 추가는 `markdown-transcript` 및 `stream-markdown-smd` 패리티 게이트를 다시 실행해야 합니다. 증분식의 상수 요소 승리는 확장 개수의 상수 요소 손실로 인해 잠식될 수 있습니다.

### 파괴와 늦게 도착하는 래스터

두 개의 다른 수명 주기 후크가 스트리밍과 경쟁합니다. `Markdown.destroy()` (`Markdown.ts:1938`)은 클로저를 통해 `this`을 고정하는 모든 `workerCallbacks` 항목을 삭제합니다. 그렇지 않으면 중간 스트림 삭제가 작업자가 응답할 때까지 전체 하위 트리를 활성 상태로 유지합니다. `isDestroyed` 게이트 `mathLoadPending` 연속(`Markdown.ts:1952`)이므로 철거된 트리가 분리된 하위 트리로 다시 렌더링되지 않습니다.

인라인 이미지와 수학에는 자체 스트림 후 수정 사항이 있습니다. `Markdown.ts:2562`에 있는 단락 이미지의 `onLoad`은 `naturalWidth`/`naturalHeight`에서 다시 측정하고 `reflowAfterImageResize`(`Markdown.ts:2604`)를 호출하여 래퍼 상자 상향식(`Markdown.ts:2674`의 `resyncWrapperBox`)을 다시 파생합니다. 베어 `content.layout()`은 오래된 상위 캐시(`Markdown.ts:2591` 주석)를 다시 읽습니다. 제목이나 표 셀 내부의 인라인 이미지는 같은 방식으로 크기를 조정할 수 없습니다. 해당 상자는 `LayoutEngine`의 줄에 구워집니다. 대신 `subscribeInlineImageRemeasure` (`Markdown.ts:1819`)은 `inlineImageBoxesStale` (`Markdown.ts:1855`)이 정사각형이 아닌 디코드를 보고할 때 다시 조판하지만 URL(`Markdown.ts:1894`의 `inlineImagesMeasured`)당 한 번만 가능합니다. 수학은 유사합니다. `ensureMathJax`(`Markdown.ts:3518`)은 동시 로드를 하나의 `preloadMathJax` 약속으로 통합하고 `retypesetFromTokens`(`Markdown.ts:3551`)은 이미 렉싱된 토큰에서 전체를 다시 빌드합니다. 이는 `tokenChildPrefix`을 사소하게 정확하게 유지하는 유일한 경로입니다.

## 다섯 방향의 장력 — 설계는 한 번에 모두 만족해야 한다

| 힘                  | 그것이 요구하는 것                                                                                                                                                                                                                     | 어디에 사는지                                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **정확성**          | `lexFull(source)` 및 스트리밍 추가는 모든 접두사 길이에서 `marked.lexer(source)`과 **완전히 동일**합니다. `updateTokens` 결과는 `setContent` 결과와 같습니다                                                                           | `incrementalLex.test.ts` 한 번에 문자 퍼즈, `markdownWorkerProtocol.test.ts` diff 게이트가 **트리 평등**으로 강화됨                                                   |
| **증분성**          | 청크당 작업은 `O(document)`이 아니라 `O(window)`(불안정한 꼬리)입니다. 무한한 꼬리 성장은 회귀입니다. `stableOffset` / `charsLexed` / `changedTailChars` 카운터; `sourceCharsLexed`은 문서 길이가 아닌 페이로드 공유를 추적해야 합니다 |                                                                                                                                                                       |
| **선택 안정성**     | 추가는 고정되고 고정된 화면 블록 내에서 선택 항목을 이동하거나 파괴해서는 안 됩니다                                                                                                                                                    | `tokenChildPrefix` + `matchLen` 접두사 엔터티 재사용; `updateTokens`은 접두사 하위 항목을 건드리지 않습니다(`Markdown.ts:3956`)                                       |
| **레이아웃 안정성** | 오프스크린 블록은 스트림 중간에 이미 칠해진 온스크린 블록의 레이아웃을 변경해서는 안 됩니다                                                                                                                                            | `rawMarkdown`의 `finalizeFrontMatter` 축소 없음(프로토콜 요구 사항) `resizeLastChild` 테일 전용 재동기화; 오래된 상위 상자를 다시 읽는 이미지 크기 조정 리플로우 없음 |
| **성능**            | 청크당 렌더링/레이아웃 작업은 증분 승리 후 프레임 예산 내에서 유지됩니다. § 숫자 — 지금 총계의 `~5%`를 조정합니다. `61%`을 렌더링하고 `33%`을 구문 분석하여 지배                                                                       |                                                                                                                                                                       |

다른 사람을 돕기 위해 하나를 위반하는 것은 반복되는 패턴입니다. "명백한" 머리 부분 수정(lex 이후 제거)은 `rawMarkdown`을 축소하고 작업자 프로토콜의 `expectedLength`을 중단합니다. 래퍼를 다시 동기화하지 않고 `content`에서만 다시 레이아웃하는 이미지 수정 사항은 오래된 상위 상자(`Markdown.ts:2595` `reflowAfterImageResize`)를 남깁니다.

## StreamController — 페이싱, 백프레셔, 그리고 누가 close를 소유하는가

`Markdown.appendMarkdown(chunk)`은 원시 추가입니다. `Markdown.createStream(opts)`(`Markdown.ts:1384`)은 원시 경로에 없는 세 가지 항목(모두 선택 사항, 모두 표시 전용, 문자 삭제가 허용되지 않음)을 추가하는 `StreamController`(`StreamController.ts:129`)으로 래핑합니다.

- **프레임 병합.** 간격 없이 각 `write()`은 작업자에게 게시하고 조정을 예약합니다. 컨트롤러는 `requestAnimationFrame` 틱(`StreamController.ts:351` `schedule` / `onFrame`)으로 일괄 처리됩니다. 가장 간단한 호출자는 `pacing` 옵션을 사용하지 않고 RAF 일괄 처리만 사용합니다. 이는 일반적인 ChatGPT 스타일 SSE 사례입니다.
- **자소 속도.** `pacing: { graphemesPerSecond }`(`StreamController.ts:22`)은 `Intl.Segmenter` 자소 계산을 사용하여 `commitPaced`(`StreamController.ts:378`)을 통해 내부 `chunks` 대기열을 비우므로 타자기 효과는 하나의 UTF-16 코드 단위가 아닌 틱당 하나의 그라핌 클러스터를 전진시킵니다(이모지는 그대로 유지됨).
- **배압.** `maxBufferedChars`(`StreamController.ts:29`, 기본값 `64 KiB`)는 대기열을 제한합니다. 가득 차면 `write()` 배압(`StreamController.ts:183` `canAdmit` / `blocked`). 이는 증분 정확성이 아닌 흐름 제어입니다. 제한된 버퍼는 문서를 자르지 않습니다.

수명 주기는 `createStream → write* → close() → onStable`입니다. `createStream`은 `virtualize`가 켜져 있거나(`Markdown.ts:1385`) 스트림이 이미 존재하는 경우(`Markdown.ts:1388`) 발생합니다. 인스턴스당 최대 하나의 컨트롤러입니다. `updateTokens`의 단일 슬롯 `appendInFlight` + `appendPending` 합체는 이를 가정합니다. `close()`은 보류 중인 모든 청크를 동기식으로 커밋하고(`StreamController.ts:244` `commitAllSubmitted`) 상태를 `closed`로 전환한 다음 `finalizeFrontMatter` 및 `waitForAppendSettled`(`Markdown.ts:1413` — 마지막 작업자 응답 + 모든 `mathLoadPending` `preloadMathJax` + `fencedRebuildPending`)를 실행하는 호스트의 `onClose` 후크(`Markdown.ts:1404`)를 기다립니다. 그런 다음에만 `onStable`이 `Array.from(content.children)`로(`Markdown.ts:1419`) 실행됩니다. 즉, 라이브 참조(`incompleteMode.test.ts:313`)가 아닌 스냅샷입니다. `onStable`는 `appendMarkdown`/`setContent`/`setMaxWidth` (`Markdown.ts:3669` `assertNotInStableCallback`)을 호출하면 안 됩니다. 하이라이트 캐시 베이킹과 같은 일회성 작업을 위해 완성된 문서가 전달됩니다.

## 낙관적 불완전 문법 — trailing edge에서 추측하기

`**bo`으로 끝나는 스트리밍 접두사는 원시 `**`이 아닌 즉시 **굵게** 표시되어야 합니다. `StreamControllerOptions.incompleteMode`(`StreamController.ts:43`)이 이를 제어합니다. `Markdown.streamIncompleteMode`(`Markdown.ts:853`)는 정책을 보유하고 `StreamController`은 버퍼링만 소유합니다.

- `'literal'`(기본값) — 이 옵션이 제공되기 전의 모든 릴리스: 닫히지 않은 구문은 `marked.lexer`의 일반 텍스트로 렌더링되므로 `**bo`는 더 가까운 것이 도착할 때까지 `**bo`을 유지합니다.
- `'optimistic'` — `optimisticParagraphSpans` (`Markdown.ts:3415`)는 **후행** 단락의 **마지막 인라인 토큰**만 스캔합니다(닫힌 구성은 이미 자체 `strong`/`em`/`codespan`/`link` 토큰이므로 최종 일반 텍스트 실행만 오프너를 보유할 수 있습니다). `findUnclosedInline`(`markdown-inline.ts:546`)은 백틱(완전히 승리 - 코드 범위 내에서 구문이 아닌 다른 것은 없음), 강조 `*`/`_`(`\*{1,2}(?!\*)` 전체 마커와 비공백 가드, `_`은 `markdown-inline.ts:570`에서 `snake_case`을 제외함) 및 `[label](url`(`markdown-inline.ts:581`)의 세 가지 구문을 우선적으로 확인합니다. 추측된 형식(`Markdown.ts:3484`의 `optimisticStyle`)으로 실행되고 `optimisticTail`(`Markdown.ts:866`)에서 추적하는 추측 렌더링입니다. 병합된 추가는 추측된 단락을 후행되지 않은 상태로 남겨둘 수 있습니다. — `dropStaleOptimisticTail` (`Markdown.ts:3611`)는 `close()`을 기다리지 않고 즉시 되감습니다. `close()`에서 나머지 추측은 리터럴 범위(`Markdown.ts:3574` `unwindOptimisticTail`)로 해제되므로 `literal` 및 `optimistic` 스트림은 동일하게 끝납니다. 수학(`$…$`)은 추측되지 않습니다. `InlineObject`(`markdown-inline.ts:301`)는 범위 스타일이 아닌 `exToPx`(`markdown-math.ts`)을 통해 `width/height/depth`을 예약합니다.

## 가상화 vs 스트리밍 — 상호 배제는 정책 선택이 아니다

`virtualize`(`Markdown.ts:760`)은 호스트의 `setVisibleRange`에 의해 구동되는 `virtualTokens`/`virtualHeights`(`RowHeights`) 및 `reconcileVirtual`(`Markdown.ts:1340`)를 통해 최상위 블록을 엔터티로 윈도우화합니다(`ScrollView`은 이 작업을 자동으로 수행합니다). 스트리밍과 결합할 수 **없습니다**(둘 다 발생): 오프스크린 블록에 대한 엔터티가 존재하지 않으므로 `updateTokens`의 `tokenChildPrefix` + `matchLen` 접두사 재사용은 마운트되지 않은 하위 슬롯을 처리합니다.

`tableViewportHeight`(`Markdown.ts:771`)은 탈출구입니다. `Table.appendRows` + `reconcileVirtualRows`(`Table.ts:334`) 및 `bodyClip` 고정을 통해 **각 테이블 내부의 행**을 가상화하고, `updateStreamedTable`이 이미 느리게 마운트된 동일한 `appendRows`을 통해 행을 추가하기 때문에 스트리밍 중에 작동합니다_. 거대한 정적 문서의 경우 `virtualize`을 선택하십시오. 넓은 테이블이 지배하는 스트리밍 문서의 경우 `tableViewportHeight`을 선택하세요.

### 단락 형태 함정 — 왜 `producesEntity`가 단순 최적화가 아닌가

`producesEntity`이 `paragraphHasImage`(`Markdown.ts:3807` 가드)를 통해 `text → image`을 결정하는 것은 속도가 아니라 정확성입니다. 이것이 없으면 첫 번째 이미지를 얻는 단락은 `RichText`을 유지하고 그림은 자동으로 삭제됩니다(`collectSpans`는 `image` 토큰에 대해 아무것도 방출하지 않습니다). 목록 항목 아날로그는 `itemIsInlineOnly`(`Markdown.ts:2759`)입니다. `INLINE_ITEM_TOKENS`(`Markdown.ts:2738`)에서 `checkbox`을 던지면 모든 작업 항목이 블록 경로를 통과하도록 강제되고 작업 목록 렌더링이 중단됩니다. 허용 목록은 향후 블록 유형이 `RichText`로 평면화되는 것을 방지하는 것입니다.

## 측정된 수치 — 베이스라인과 함께 인용하기

`benchmarks/run-browsers.sh` 번호(실제 Chrome/Firefox, 실제 GPU, `calibrateRefreshRate()`, `hyprland-browser-bench` 스킬당 전용 Hyprland 작업 공간)만 인용 가능합니다. 헤드리스 `script/benchmark.ts` 및 `benchmarks/debug-page.ts`은 트립와이어/디버그입니다.

### Reconcile win — aggregate transcript (`markdown-transcript-aggregate-2026-07-30`, CTX-0148, PR #296, commit `0e4a4233`)

작업량: `6` 회전, `176` 블록, `27,882` 문자, `6,543` 청크, **`token` 세분성** — 세분성이 지배적입니다: `token` 대 `48`-char에서 동일한 문서에 대한 `151` 대 `14` 청크, `7×` 재사용 차이(`markdown-transcript-aggregate-2026-07-30.md:111`). 팔당 2회 실행; `lastTokenSameType`만 뒤집혔습니다.

|                      | 재사용 불가 | 오늘      | 델타       |
| -------------------- | ----------- | --------- | ---------- |
| 화해하다, 크롬       | 1635.2 ms   | 319.5 ms  | **−80.5%** |
| 화해하다, 파이어폭스 | 992.2 ms    | 245.0 ms  | **−75.3%** |
| 렌더링, 크롬         | 3626.8 ms   | 3393.7 ms | −6.4%      |
| 파싱, 크롬           | 1978.3 ms   | 1826.2 ms | −7.7%      |
| 전체, 크롬           | 7240.4 ms   | 5539.4 ms | **−23.5%** |
| 전체, 파이어폭스     | 6334.1 ms   | 5404.3 ms | **−14.7%** |

**배송된 단계 공유** (배송된 총 `5539 ms` Chrome / `5404 ms` Firefox, 청크당 `0.86 / 0.82 ms`): `61.3 / 61.4%` 렌더링, `32.9 / 34.1%` 구문 분석, **조정 `5.8 / 4.6%`** — 조정은 이제 **가장 작은** 단계입니다. 유형별 남은 재사용 여유 공간은 해당 한도에 따라 제한됩니다.

### Panel-rate re-run (2026-08-08, `2a4bd52`, Firefox now at panel Hz)

| 엔진       | 헤르츠          | 구문 분석   | 화해하다  | 렌더링      | 합계        |
| ---------- | --------------- | ----------- | --------- | ----------- | ----------- |
| 크롬       | 240.09 / 239.95 | 2826/2830   | 459 / 456 | 3386 / 3388 | 6670 / 6674 |
| 파이어폭스 | 229.01 / 241.26 | 3190 / 3282 | 311 / 315 | 3581 / 3691 | 7082 / 7288 |

청크당 렌더링 `0.517 / 0.556 ms` = `4.16 ms` 프레임의 `12.4 / 13.3%`; 청크당 총계 `1.02 / 1.10 ms` = `24.5 / 26.4%`. 원래 실행의 `≈60 Hz` Firefox 수치(`58.75 Hz`)는 초점이 맞지 않는 창 아티팩트가 **아닙니다** — `layout.frame_rate = -1`(`forge/findings/devtools-and-telemetry.md:2026-08-03`)였습니다.

**실제 회귀 표면:** 두 엔진 모두에서 rose `1.67×`을 구문 분석합니다. 기본 `marked` 대 공유 12개 확장 인스턴스: `1871 → 3127 ms`(`1.671×`)에 대해 동일한 `6543` 청크 코퍼스를 렉싱합니다. 비용은 청크당 확장당 `start()`/`tokenizer`입니다. `faeeb0b7`에서 인스턴스는 `2` 확장을 수행했습니다. `2a4bd52`에는 **PX-0524 클러스터의 측정되지 않은 가격**인 `12`이 포함됩니다. 구문 분석 공유가 `33% → 42–45%` 이동되었습니다. `incrementalLex` 수치는 lex가 이미 창을 활성화한 _후_입니다. 그렇지 않으면 더 나쁠 것입니다.

### Incremental lex win — prose fixture (`comparisons/stream-markdown-smd`, Chrome 150 / Firefox 153, 784 chunks)

이전: 청크당 전체 re-lex, `419.6 / 440.2 ms`, 지수 `1.98`, 렉서 `9,847,040`에 전달된 문자. 이후: `6.02 / 9.06 ms`, **`69.8× / 48.6×`**, 지수 `0.94 / 1.21`, 문자 `63,806`, 지수 `1.00`(`forge/findings/text-richtext-and-markdown.md:2026-08-03`).

### Math streaming after the cap narrowed (`markdown-stream-math`, vectojs#398)

담요 `blockMath` 성능 저하 → 캡 전용: `26,760`-char, `200`-섹션 수학 문서의 **`139.3× Chrome / 96.5× Firefox`**; 렉서에 대한 문자 `215.9×` 감소; 경계는 문서의 `99.84%`에 설정됩니다. 모든 크기(`forge/baselines/markdown-stream-math-findings.md`)에서 최대 단일 청크 lex `105` 문자.

## 스트리밍을 퇴보시키지 않고 새 마크다운 확장 추가하기

확장은 두 개의 등록입니다(`Markdown.ts:240` 및 `MarkdownWorker.ts:95` — 동일한 `marked.use` 호출, **양쪽**, 동일한 토크나이저 — 드리프트는 작업자의 `marked` 보기를 깨뜨립니다). 순서대로 4가지 확인 사항:

### 1. 확장의 도달 범위 분류하기

- **`start()`이 없고 빈 줄로 묶여있습니다** → 안전합니다. 경계 변경 없음. 예: 인라인 규칙(`abbr` `markdown-abbr.ts`, `emoji` `markdown-emoji.ts`, `footnote` ref `markdown-footnote.ts` half)에는 성능 저하가 필요하지 않습니다.
- **공급 `start()`** → 뒤로 도달; `paragraphPairCap`이(가) 이미 캡을 씌웠지만 **확인** — 클립이 `blockMath`(`incrementalLex.ts:103`)이 아닌 `blockMath`(`incrementalLex.ts:103`)으로 표시되어 있으므로 새로운 `start()`이 씌워져 있습니다.
- **빈 줄에 걸쳐 있음** → 앞으로 무제한 도달; `hasContainerOpener` / `hasFootnoteDefOpener` 패턴(`markdown-container.ts: hasContainerOpener`, `markdown-footnote.ts: hasFootnoteDefOpener`). **디그레이드** via `DegradeReason` (`incrementalLex.ts:225`) — 컷된 천장으로 바인딩할 수 없습니다.
- **늦은 정의 수집**(`marked` `def` 패턴, `abbrDef`은 `Markdown.ts:3711`에서 `abbreviationsChanged`이 `matchLen`을 0으로 설정하도록 강제한 좁은 사례임) → 강제 재구축 또는 성능 저하; 이유를 문서화하세요.

확실하지 않은 경우 **성능 저하** — 항상 정확하며 실제로 오프너가 포함된 스트리밍 문서에만 비용이 듭니다.

### 2. 락스텝으로 등록하고 가드 검증하기

- `Markdown.ts:294` 및 `MarkdownWorker.ts:122`의 동일한 `blockMath` 토크나이저 복사본이 이미 한 번 드리프트되었으며(`[\s\S]+?` 대 빈 줄 가드) 작업자는 `scripts/build-worker.js` → `MarkdownWorkerSource.ts`를 통해 생성됩니다. 세 번째 드리프트하는 경우(`markdown-stream-math-findings.md: Also fixed`) 공유 모듈을 추출합니다.
- 빈 줄로 보호된 토크나이저의 경우 가드는 `(?!\n\n)`(`incrementalLex.ts:67`, #398)이 아닌 `(?!\n[ \t]*\n)`(공백 전용 줄 포함)이어야 합니다.

### 3. 모든 entity 인식 지점에 가르치기

토큰 유형의 경우 확장 프로그램이 다음을 추가합니다.

- `renderToken` — 건설(`Markdown.ts:4150`).
- `producesEntity` (`Markdown.ts:4044`) — `true` 엔터티를 렌더링하는 경우; `null`을 렌더링하는 토큰의 경우 `false`입니다(그렇지 않으면 `tokenChildPrefix`이 드리프트합니다).
- `reflowToken` (`Markdown.ts:1520`) — 너비 변경 경로; 팔이 없으면 블록이 이전 너비로 유지됩니다.
- `updateTokens` 내부 분기(`Markdown.ts:3760`) — 꼬리가 자라는 모양에 돌연변이(`setSpans`/`setCode`/`appendRows`)가 있는 경우에만 선택합니다. 컨테이너 유형(`blockquote`, `list`, `table`)은 직접적인 돌연변이가 아닌 꼬리 하강을 거칩니다.
- 블록을 어포던스 래핑할 수 있는 경우 래핑을 해제하고: `instanceof BlockWithAffordances ? .block : entity` — 내부 크기(`Markdown.ts:3209`, `Markdown.ts:3781` 패턴)를 변경한 후 `refreshAffordances()`를 호출합니다.
- 인라인 이미지/수학이 새 블록 내에 나타날 수 있는 경우 `containsImage`/`containsInlineMath` 구독(`Markdown.ts:4166`) 및 `reflowAfterImageResize` 래퍼 재동기화를 다룹니다.

### 4. 스냅샷뿐 아니라 사보타주도 추가하기

- `incrementalLex.test.ts` char-at-time fuzz: 새로운 구성이 포함된 말뭉치를 한 번에 한 문자씩 스트리밍하고, 모든 접두사에서 `marked.lexer()`에 대해 깊은 `toEqual`을 스트리밍합니다. `findStableCut`을 정당화한 `14 docs × every prefix × every cut`에 대해 무차별 대입을 계속하십시오. `nFollow >= 1`이 여전히 유효하다는 것을 증명하기 위해 확장 기능을 사용하거나 사용하지 않고 실행하세요.
- **조정 방해 행위 스트리밍**: `appendMarkdown`(`setContent` 아님)을 통해 **토큰 세분성**으로 구성이 포함된 문서를 스트리밍하고, `inPlaceUpdates`/`entitiesRebuilt`/`charsLexed`이 예상 방향으로 이동한다고 주장하고, `setContent`에 대해 깊은 토큰 트리 + 픽셀 동일성을 주장합니다. — `setContent`을 유도하는 방해 행위는 재사용 경로를 실패할 수 없습니다.
- Timed 루프 외부의 **딥 트리 동등성** 및 두 엔진의 임계값 게이트에서 `comparisons/stream-markdown-smd` 패리티 게이트를 다시 실행합니다. `forge/findings/text-richtext-and-markdown.md:2026-08-03`당 트리 동등성만이 깨진 구문 분석에 대해 빠른 숫자를 포착합니다.

### 타임라인 — 두 영역을 통과하는 하나의 청크

```text
chunk " world": "Hello **bo" → "Hello **world**"
  before: stable="Hello "  tail="**bo"        (paragraph, trailing plain run)
   lex:   tail re-lex → [text("Hello "), strong("world")]  charsLexed = tail.length
   diff:  matchLen=0 (paragraph raw changed), tail = [paragraph(strong)]
   reconcile: heading/paragraph didn't match → destroy old RichText, add new one
  after:  stable="Hello **world**\n\n"  tail=""  (blank line committed, entitiesReused++)
```

빈 줄이 도착하고 `findStableCut`이(가) 진행될 수 있을 때 커밋이 발생합니다. 그때까지 모든 청크는 문서 길이에 따라 커지지 않고 경계가 있는 동일한 꼬리를 다시 방문합니다.

## 스트리밍 디버깅 — 먼저 확인할 것

1. **`sourceCharsLexed`은 문서 길이를 추적합니다** → 품질이 저하되었습니다(`incrementalLex.ts:225`의 `DegradeReason`). 문서에서 `:::`/`[^`/`def`/`\r`을 확인하거나 누락된 꼬리 전용 스캔(`incrementalLex.ts:490`)을 확인하세요.
2. **`inPlaceUpdates` 평탄한 동안 `entitiesRebuilt` 상승** → 제자리 실패; grep `instanceof RichText`/`CodeBlock`/`Table` 없이 `BlockWithAffordances` unwrap — 전형적인 래퍼 버그(`code-review-2026-08.md:167`).
3. **스냅샷 통과, 스트리밍 실패** → `setContent` 경로(`Markdown.ts:1740`)는 `updateTokens`을 실행하지 않습니다. 한 번에 한 번씩 방해 행위를 작성하십시오.
4. **`close()` 이후 마지막 청크 누락** → `waitForAppendSettled` 기다리지 않음; `Markdown.ts:2429`에서 `appendInFlight`/`mathLoadPending`/`fencedRebuildPending` 게이팅을 확인하세요.
5. **추가 시 선택이 점프됩니다** → 접두사는 재사용되지 않습니다. `tokenChildPrefix` 유효 범위(`Markdown.ts:1041` `validFrom`) 및 `matchLen` 유효성 검사(`Markdown.ts:3689`)를 확인하세요.
6. **이미지 디코딩 후 오프스크린 블록 리플로우** → `reflowAfterImageResize` 래퍼 경로(`Markdown.ts:2604`) 오래됨; `resyncWrapperBox`에 래퍼 유형이 포함되어 있는지 확인하세요.

## 불변식 — PR 전 체크리스트

1. **깊은 lex 동일성.** `incrementalLex(charByChar(S))`은 공백 전용 빈 줄과 베어 목록 표시자를 포함하여 모든 접두사에서 `marked.lexer(S)`과 완전히 동일합니다.
2. **신원 전송.** `matchLen` 접두사는 원시와 동일하고 `[...oldTokens.slice(0,matchLen), ...tail]`은 전체 lex와 같습니다. — `Markdown.ts:3689` 및 `MarkdownWorker.ts:308`의 작업자에서 검증되었습니다.
3. **Entity-지수 일치.** `producesEntity ↔ renderToken null ↔ reflowToken arms ↔ tokenChildPrefix` 4방향; `BlockWithAffordances` **on**으로 테스트했습니다.
4. **테일 전용 돌연변이.** 내부 경로는 접두사 하위 항목에 닿지 않습니다. 모든 조기 반품은 엔터티를 그대로 유지하므로 거부된 재사용은 절반 업데이트가 아닙니다.
5. **스트리밍 비용의 할당량은 선형입니다.** 청크당 할당량(시행하는 경우)은 `append` 비용(`charsLexed` 창)에서 선형이며 원활한 입력만 제한됩니다. 버퍼링된 커밋 전체가 전송됩니다(`StreamController.ts` 속도는 표시 전용이며 정확성은 문자를 삭제하지 않습니다).
6. **깊이 안정 제목.** `heading` 내부는 `oldDepth === newDepth`(`Markdown.ts:3875`)인 경우에만 재사용됩니다. 그렇지 않으면 `font`은 유효하지 않습니다(`RichText` 생성자에만 해당).

## 참고 문헌

- `vectojs-docs/content/learn/streaming.md` — 사용자 지향 스트리밍 API 및 `createStream` 수명 주기.
- `vectojs-docs/content/learn/text-typography.md` — 인라인 수학/이미지 및 `RichText`/`LayoutEngine`이 스트리밍과 상호 작용하는 이유.
- `vectojs-docs/forge/findings/text-richtext-and-markdown.md` — 측정 결과가 위의 줄을 얻은 모든 스트리밍 버그에 대한 필드 노트입니다.
- `vectojs-docs/forge/baselines/markdown-transcript-aggregate-2026-07-30.md` 및 `markdown-stream-math-findings.md` — 할당 가능한 두 개의 기준선과 해당 엔진/커밋.
- `vectojs-docs/forge/code-review-2026-08.md:167,170` — `BlockWithAffordances` `instanceof` + `refreshAffordances` 클러스터(`#789`/`#795`, `#701`).
- `packages/markdown/test/incrementalLex.test.ts` 및 `markdownWorkerProtocol.test.ts` — 스트리밍 동등성 및 프로토콜 계약은 모든 새 확장이 녹색을 유지해야 합니다.

---

_다음: 05 Zero-DOM TeX — 스트리밍 수학 및 테이블이 측정하는 조판 커널, `InlineObject` 및 `SVGEntity` 방출._
