# expand-playlist-import 분석 보고서

> **상태**: Complete
>
> **프로젝트**: sing-diary
> **버전**: 미정 (사이클 종료 시 사용자가 결정)
> **작성일**: 2026-08-23
> **Match Rate**: 99% → **100%** (Act 1회 반영)
> **계획서**: [expand-playlist-import.plan.md](./expand-playlist-import.plan.md) · **설계서**: [expand-playlist-import.design.md](./expand-playlist-import.design.md)

---

## Context Anchor

| Key | Value |
| --- | --- |
| **WHY** | M2의 남은 절반이다. 그리고 §5.2 3분기를 열려면 번호 우회를 정식 경로로 바꿔야 하는데, 라우트가 아직 9개인 지금이 그 배관을 바꾸기 가장 싼 시점이다. |
| **WHO** | sing-diary 사용자 본인(1인). 모바일=현장에서 지난 플리 뒤져 선곡, PC=사후 정리. |
| **RISK** | 곡 추가 경로가 M1 이래 한 번도 안 바뀐 핵심 경로다. 3분기의 "번호 입력 → AVAILABLE 전환"은 `songs`·`song_numbers`에 대한 세 번째 쓰기 경로다 — 3-state 계약을 깨면 M3 빈칸채우기 큐가 망가진다. |
| **SUCCESS** | 지난 세션 목록·상세가 보이고, 거기서 곡을 오늘로 가져올 수 있으며, 오늘 기기에 번호가 없는 곡도 세 분기 모두에서 넣을 수 있다. 기존 L1 19케이스 회귀 0 + 신규 케이스 통과. |
| **SCOPE** | 상태 판정 순수 함수 분리 → 세션 목록·상세 읽기 경로 → songId 기반 추가 + 번호 등록 API → 3분기 UI(지난 플리·검색 공통) → L1 확장 → Preview 실측 |

---

## Strategic Alignment Check

### Success Criteria Status (Plan §4.1 Definition of Done)

| # | 기준 | 상태 | 근거 |
| --- | --- | :-: | --- |
| 1 | FR-01 ~ FR-20 전부 구현 | ✅ Met | §2.4 요구사항 추적표 — 20/20 |
| 2 | `npm run l1` 전 케이스 통과 (기존 19 회귀 0 + 신규 9) | ✅ Met | §2.5 — **28/28**, module-6·Check·Act 후 **3회 연속** |
| 3 | 번호 기반 현장 추가(`AddByNumber`) 회귀 없음 | ✅ Met | L1 #5 `POST entries 정상` 201 (4388ms). C-7 diff 검증 §2.3 |
| 4 | 3-state 계약 확인 — UNSUPPORTED 곡에 번호 시 행 1개 유지, 행 없던 곡에 번호 시 행 1개 생성 | ✅ Met | L1 #25(행 생성·AVAILABLE/31337) · #26(UNSUPPORTED/null 불변). PK 충돌 0 |
| 5 | 순수 함수 유닛 테스트가 3-state 3분기 + touched + §5.2 3분기 전부 커버 | ✅ Met | `tests/song-state.test.ts` 10케이스, G-1 케이스명 명기 |
| 6 | `npm run build` 성공, lint 0, typecheck 0 — Vercel 로그 확인 | ✅ Met | HEAD `fa1b44d` 빌드 로그: `✓ Compiled successfully in 4.2s` + `Linting and checking validity of types` 통과, 에러 0 |
| 7 | ARCHITECT §5.4 주석 반영 (FR-20) | ✅ Met | `docs/architect/ARCHITECT.md` §5.4 "구현 현황" 인용구 |
| 8 | Preview 검증 통과 후 develop → main PR 병합 | ⏳ 대기 | 사이클 종료 절차에서 수행 (RULE.md) |

### 품질 기준 (Plan §4.2)

| 기준 | 상태 | 근거 |
| --- | :-: | --- |
| 기존 Vitest 전량 통과 + 신규 유닛 | ✅ Met | `npm test` **8 files / 57 tests passed** (41.4s) |
| ESLint 계층 경계 위반 0 | ✅ Met | Vercel 빌드 lint 통과. presentation→infrastructure 참조는 `container.ts` 1곳 |
| ESLint `apiRouteGuard` 위반 0 (첫 실전 검증) | ✅ Met | 신규 3핸들러 전부 `withAuth(...)` 형태 — §2.3 |
| Gap Match Rate ≥ 90% | ✅ Met | **100%** (§2.6 + §2.8) |

### Decision Record Verification

| 결정 | 준수 | 근거 |
| --- | :-: | --- |
| **D-J** 유니언 스키마 (새 라우트 없음) | ✅ | `entries/route.ts` 14줄 변경, `"number" in body` 분기. 기존 갈래 바이트 보존 |
| **D-K** 단일 트랜잭션·왕복 1회 | ✅ | `add-entry-by-song.ts` 전체가 `tx.run` 안. **L1 #28 = 4199ms** — 2요청이었다면 8초대 |
| **D-L** `SessionQuery` 포트 신설, `SessionRepo` 무변경 | ✅ | `session-repo.ts`가 diff에 없다 |
| **D-M** 진행 중 세션 배지 + `/`로 라우팅 | ✅ | `SessionList.tsx:22` `href={s.isOpen ? "/" : ...}` |
| **D-N** 표시는 세션 브랜드, 판정은 오늘 브랜드, 다르면 칩 | ✅ | `SessionDetailView.tsx:29,50` — 수동 확인은 §4 대기 |
| **D-O** LEFT JOIN + GROUP BY 단일 쿼리 | ✅ | `drizzle-session-query.ts` `listByOwner`. L1 #21이 집계값을 상세 `entries.length`와 대조 |
| **D-P** `findByIdForOwner`로 곡 소유권 확인 | ✅ | L1 #24 **404 SONG_NOT_FOUND** |
| **D-Q** 타 owner 세션 404 | ✅ | L1 #22 **404 SESSION_NOT_FOUND** |
| **D-R** `AddSongFlow` + `song-state.ts` 공유 | ✅ | 검색·상세 두 화면이 같은 컴포넌트 import |
| **D-S** "그냥 추가"는 번호 상태 불변 | ✅ | L1 #26 재조회에서 `UNSUPPORTED`/`null` 유지 |
| **D-T** `registerNumber`가 AVAILABLE 곡에 오면 덮어씀 | ✅ | `tests/session-use-cases.test.ts` 덮어쓰기 케이스 |

**전략 정합성**: PRD 없음(이 프로젝트는 Plan부터 시작). Plan의 WHY —— "M2의 남은 절반" —— 은 닫혔다. 지난 세션을 목록·상세로 꺼내 보고 거기서 곡을 오늘로 가져오는 경로가 실제로 동작한다. 미정렬 없음.

---

## 1. 분석 개요

### 1.1 목적

설계서와 구현 코드를 맞대어 누락·이탈을 찾고, 런타임 실측으로 계약이 실제로 지켜지는지 확인한다.

### 1.2 범위

커밋 5건 — `5cc11ad`(module-1,2) · `84f07ab`(module-3) · `9800d90`(module-4,5) · `898e157`(module-6) · `fa1b44d`(Act 1회, §2.8). 기준선은 직전 사이클 병합 커밋 `806e5fd`. 아래 변경량은 Act 이전(`898e157`) 기준이다.

```
28 files changed, 1236 insertions(+), 104 deletions(-)
```

설계서 §11.3 예상은 "신규 약 12 · 수정 약 10 · 900~1,200줄"이었다. 실제 신규 15 · 수정 13 · 1,236줄 — **예상 상한을 3% 넘겼다**. 초과분은 전부 테스트(`tests/` 3파일 288줄, `run-l1.mjs` +167줄)다. 본 코드만 세면 예상 안이다.

---

## 2. Gap Analysis (Design vs 구현)

### 2.1 방법

정적 3축(구조·기능·계약) + 런타임 3종(L1 Preview 28케이스 · Vitest 57케이스 · Vercel 빌드 로그). 로컬 build/lint/typecheck는 `.claude/CLAUDE.md`에 따라 실행하지 않고 **Vercel 빌드 로그로만** 판정했다.

### 2.2 구조 일치 (Structural) — 100%

설계서 §9.1 계층 배치가 지정한 파일이 전부 존재하고, 지정하지 않은 파일은 생기지 않았다.

| 계층 | 설계 | 구현 | 일치 |
| --- | --- | --- | :-: |
| application/ports | `session-query.ts` 신설, `song-repo.ts` +1 메서드 | 동일 | ✅ |
| application/use-cases | `list-sessions` · `get-session-detail` · `add-entry-by-song` | 동일 3건 | ✅ |
| infrastructure | `drizzle-session-query.ts` 신설, `drizzle-song-repo.ts` +1 | 동일 | ✅ |
| app/api | `sessions` GET 추가 · `sessions/[id]` 신설 · `entries` 유니언 · `search` brand 제거 | 동일 4건 | ✅ |
| app/(app) | `sessions/page.tsx` · `sessions/[id]/page.tsx` | 동일 2건 | ✅ |
| presentation/components | `SessionList` · `SessionDetailView` · `AddSongFlow` · `song-state.ts` | 동일 4건 | ✅ |
| 무변경 약속 | `add-entry-by-number.ts` · `AddByNumber.tsx` · `session-repo.ts` · 마이그레이션 | **diff에 없음** | ✅ |

빌드 산출 라우트 목록(Vercel 로그)에 `/sessions`, `/sessions/[id]`, `/api/sessions`, `/api/sessions/[id]`가 모두 잡혔다. `sessions/new`·`sessions/current`가 정적 세그먼트로 `[id]`보다 우선 매칭된다는 설계 §4.1의 예측도 라우트 목록에 나란히 찍혀 확인됐다.

### 2.3 API Contract (3-way: Design §4 ↔ 서버 ↔ 클라이언트)

| 엔드포인트 | 설계 | 서버 | 클라이언트 | 일치 |
| --- | --- | --- | --- | :-: |
| `GET /api/sessions` | `{ data: SessionListItem[] }` | `route.ts:15` `withAuth` | RSC 직접 호출(`listSessions`) | ✅ |
| `GET /api/sessions/{id}` | `{ data: SessionDetail }` | `[id]/route.ts:8` `withAuth<{params}>` | RSC 직접 호출 + L1 | ✅ |
| `POST /api/sessions/{id}/entries` | 유니언 `{number}` \| `{songId, registerNumber?}` | `"number" in body` 분기 | `AddSongFlow.post()`가 두 형태만 전송 | ✅ |
| `GET /api/songs/search?q=` | `brand` 제거 | `parse({ q })`만 | `SearchResults`가 `q`만 전송 | ✅ |

- **에러 코드 신규 0건** — `SESSION_NOT_FOUND`(404) · `SESSION_CLOSED`(409) · `SONG_NOT_FOUND`(404) 전부 `error-mapper.ts`의 기존 코드다. 설계 §4.3 약속대로다.
- **C-8(유니언 갈래 `.strict()`)** — L1 #27이 혼합 본문 `{songId, number}`에 **400 VALIDATION_ERROR**를 실측했다. `.strict()`가 없었다면 조용히 한쪽으로 흡수됐을 자리다.
- **C-7(핵심 경로 무변경)** — `git diff --name-only 806e5fd..HEAD | grep -Ei 'add-entry-by-number|AddByNumber'` → **0건**.

### 2.4 Functional Depth — 요구사항 추적 (FR-01 ~ FR-20)

| FR | 상태 | 근거 |
| --- | :-: | --- |
| FR-01 판정·dirty-check 순수 함수 분리 + vitest | ✅ | `song-state.ts` `commitDecision`, `tests/song-state.test.ts` |
| FR-02 3분기 판정도 같은 모듈 | ✅ | 같은 파일의 `addDecision` |
| FR-03 `NumberCell` 회귀 없음 (G-1 보존) | ✅ | 테스트명에 G-1 명기. `commit()`이 `commitDecision` 호출만 |
| FR-04 세션 목록 최신순 + 날짜·지점·브랜드·곡 수 | ✅ | `orderBy(desc(visitDate), desc(createdAt))`, L1 #21 |
| FR-05 상세 position 순 읽기 전용 | ✅ | `orderBy: asc(entries.position)`, 유닛 UC-2 |
| FR-06 owner 스코프 + 타 owner 404 | ✅ | L1 #21(미포함)·#22(404) |
| FR-07 오늘 브랜드 기준 판정 | ✅ | `SessionDetailView`가 `todayBrand`를 `AddSongFlow`에 전달 |
| FR-08 songId 추가 경로 + 타 owner 곡 차단 | ✅ | L1 #24 |
| FR-09 검색의 번호 우회 제거 | ✅ | `SearchResults.tsx` 105줄 삭제, `numberState` 소멸 |
| FR-10 기존 번호 기반 추가 동작 | ✅ | L1 #5 201 |
| FR-11 AVAILABLE 즉시 추가 | ✅ | `AddSongFlow` available 분기 — 시트 없음 |
| FR-12 UNSUPPORTED 안내 + 입력 시 AVAILABLE 전환 | ✅ | 시트 + `registerNumber`. L1 #25가 전환을 실측 |
| FR-13 행 없음 안내 + 입력 시 행 생성 | ✅ | L1 #25 (행 없던 곡 → 행 1개) |
| FR-14 세 분기 모두 건너뛰기 허용 | ✅ | 시트의 [그냥 추가]. AVAILABLE 분기는 입력 자체가 없어 무의미(설계 의도대로) |
| FR-15 `setNumber` 재사용으로 3-state 준수 | ✅ | `add-entry-by-song.ts`가 `repos.songs.setNumber` 호출. 새 저장 로직 0줄 |
| FR-16 3분기 UI를 두 화면이 공유 | ✅ | `AddSongFlow` 단일 컴포넌트 |
| FR-17 `brand` 파라미터 제거 + 문서 정정 | ⚠️ Partial | 코드는 완전 제거. 문서는 §2.7 G-3 참조 |
| FR-18 `AppHeader` 진입점 | ✅ | `AppHeader.tsx:29` |
| FR-19 L1 신규 케이스 + 전 케이스 통과 | ✅ | 28/28 |
| FR-20 ARCHITECT §5.4 미구현 명시 | ✅ | 인용구 5줄 |

**19 Met / 1 Partial** → Functional 97%.

### 2.5 Runtime Verification

**L1 (Preview, `dev.sing-diary.spiritflag.work`) — 28/28 통과.** module-6에서 1회, Check 단계에서 1회, **2회 연속 전건 통과**.

| # | 케이스 | 결과 | ms |
| --- | --- | :-: | --- |
| 20 | `GET /sessions` 미인증 | 401 | 437 |
| 21 | `GET /sessions` 인증 (타owner 미포함 · 집계 일치) | 200 | 697 |
| 22 | `GET /sessions/{타owner}` | **404** | 702 |
| 23 | `GET /sessions/{내 세션}` 상세 (양쪽 브랜드 키) | 200 | 682 |
| 24 | `POST entries {타owner songId}` | **404** | 3037 |
| 25 | `POST entries {songId, registerNumber}` → 행 생성 | 201 | 4199 |
| 26 | `POST entries {songId}` 건너뛰기 → 상태 불변 · entryCount 2 | 201 | 3767 |
| 27 | `POST entries {songId, number}` 혼합 | **400** | 436 |
| 28 | #25 왕복시간 판정 | ≤5000ms | 4199 |

기존 19케이스 전건 통과 — 핵심인 #5(`POST entries` 번호 기반) 201/4388ms.

**NFR 실측 판정**

| 기준 | 목표 | 실측 | 판정 |
| --- | --- | --- | :-: |
| 읽기 응답성 | 1.5초 이내 | 목록 697ms · 상세 682ms | ✅ |
| 쓰기 응답성 | 5초 이내 | 등록+추가 4199ms | ✅ |
| 분기 왕복 횟수 | 2회 이내 | **1회** (D-K) | ✅ |
| 인증 계약 | 신규 라우트 401 + `UNAUTHORIZED` | #20 401 | ✅ |
| 모바일 UX | AVAILABLE 2탭 이내 | 상세 진입 1탭 + [오늘로] 1탭 = 2탭 (코드 근거) | ✅ |

읽기가 쓰기의 1/6이다. 쓰기 3~4초대는 이번에도 그대로다 — 백로그 `baea17b1`(커넥션 재사용)이 겨누는 자리이고, 이번 사이클이 그 압력을 한 단계 더 올렸다. 다만 **기준 재조정은 하지 않았다.** 넘긴 항목이 없으므로 숫자를 손댈 일이 없다.

**Vitest — 8 files / 57 tests passed** (41.4s, `maxWorkers: 1`).
**Vercel 빌드 (HEAD `898e157`)** — `✓ Compiled successfully in 4.1s`, `Linting and checking validity of types` 통과, 에러·경고 0(npm allow-scripts 안내 제외).

### 2.6 Match Rate 종합

| 축 | 가중치 | 점수 | 근거 |
| --- | :-: | :-: | --- |
| Structural | 0.15 | 100% | §2.2 — 누락 0, 무변경 약속 준수 |
| Functional | 0.25 | 97% | §2.4 — FR-17 문서분 Partial |
| Contract | 0.25 | 100% | §2.3 — 3-way 일치, 신규 에러 코드 0 |
| Runtime | 0.35 | 100% | §2.5 — L1 28/28 · Vitest 57/57 · 빌드 통과 |

**Overall = 15 + 24.25 + 25 + 35 = 99.25 → 99%**

### 2.7 발견된 Gap (심각도순)

| # | 심각도 | 내용 | 위치 |
| --- | :-: | --- | --- |
| **G-1** | Important | **[수정 완료 — `fa1b44d`]** **`SESSION_CLOSED` 시 `router.refresh()`가 없다.** 설계 §6은 "다른 기기에서 새 세션을 만들어 이 세션이 닫힌 경우 토스트로 알리고 `router.refresh()` — 조용히 죽지 않는다"고 적었다. 구현은 실패 경로 전부를 "토스트 + 시트 유지"로 일원화했다(§5.3의 문구를 따랐다). 결과: 세션이 닫힌 뒤에도 화면이 낡은 채로 남아 사용자가 몇 번을 눌러도 같은 409를 본다. **설계서 §5.3과 §6이 서로 다른 말을 하고 있었고 구현이 §5.3을 택한 것** — 구현자의 자의가 아니라 설계서 내부 모순이 원인이다. **조치**: 409 `SESSION_CLOSED`일 때만 시트를 닫고 `router.refresh()`. 그 밖의 실패는 종전대로 시트를 유지해 입력한 번호를 지킨다 | `AddSongFlow.tsx` |
| **G-2** | Minor | `addDecision`에 설계서에 없는 방어 분기가 하나 늘었다 — `status === "AVAILABLE"`인데 `number`가 null/빈 문자열이면 `missing`으로 떨어뜨린다. 설계서는 DB `CHECK` 제약을 믿고 `n.number as string`으로 단언했다. 구현이 단언 대신 분기를 택했다 — 계약 위반이 화면에서 빈 번호로 새는 것보다 낫다는 판단. **설계 이탈이되 안전한 쪽 이탈** | `song-state.ts` |
| **G-3** | Minor | FR-17의 "Design 문서 표기 정정" 중 **직전 사이클 설계서 `expand-song-catalog.design.md:280`의 `?brand={TJ\|KY}` 표기가 그대로다.** ARCHITECT.md에는 이 파라미터 언급이 없어 살아있는 문서에는 오기가 없고, 이번 사이클 설계서 §4.1에 제거 사실이 기록돼 있다. 닫힌 사이클 문서를 사후 수정하지 않는 관례와 FR 문구가 충돌한 자리다 | 직전 사이클 문서 |
| **G-4** | Minor | 설계서 §5.2 흐름도는 상세 곡 행 제목을 "NULL→'제목 없음'"으로, 같은 절 본문과 §5.4 체크리스트는 "stub은 `#그날번호`"로 적었다. **설계서 내부 표기 불일치.** 구현은 체크리스트를 따라 `#번호`/`#—`로 냈다(`EntryRow`와 같은 규칙이므로 옳은 선택) | 설계서 §5.2 |

Critical 0건. 신뢰도 80% 미만이라 목록에서 뺀 것은 없다.

### 2.8 Act 1회 — 설계 범위 밖에서 드러난 공백 (`fa1b44d`)

Checkpoint 5에서 사용자가 **"새 플리를 여는 기능이 없다"**를 지적했다. 확인 결과 기능은 M1부터 있었다 —
`/sessions/new` 페이지 · `POST /api/sessions` · `startSession`(L1 #3이 매 회 실측). **없던 것은 진입점이다.**
그 문으로 가는 링크가 `EmptyToday`(오늘 화면에 열린 세션이 없을 때) 하나뿐이라, **세션이 하나라도 열려 있으면
UI 어디에도 새 플리를 열 길이 없었다.**

- 이번 사이클의 회귀가 아니다. 계획서 §2.1·설계서 §5.4 어디에도 "새 세션 진입점"이 범위로 없다.
- **이번에 만든 목록 화면이 그 공백을 드러냈다.** 지난 것을 훑다 새로 하나 여는 것이 이 화면의 자연스러운 다음
  동작인데 그 자리가 비어 있었다. 화면을 만든 사이클이 그 화면의 공백을 지고 가는 것이 맞다(사용자 결정).
- **폼 페이지로 보낸다.** 즉시 생성이 아니다 — `startSession`이 `closeAllOpen`을 먼저 부르므로 버튼 한 번에
  오늘 기록이 마감되어선 안 된다. 새 API·새 판정 0건, `SessionList` 한 파일 변경.

| 검증 | 결과 |
| --- | --- |
| Vercel 빌드 (`fa1b44d`) | `✓ Compiled successfully in 4.2s` + 타입체크·lint 통과 |
| L1 재실행 (Preview) | **28/28 통과** — G-1 수정과 진입점 추가 후 회귀 0 |

이 조치로 §2.7 G-1이 닫히고 Functional 축이 100%가 된다 → **Overall 100%**.

---

## 3. Clean Architecture 준수

- **의존 방향 위반 0.** `SessionQuery`는 포트(application)로 선언되고 구현만 infrastructure에 있다. presentation은 `container.ts` 한 곳에서만 infrastructure를 만진다.
- **CQRS-lite 승계** — 읽기 `SessionQuery`(Neon HTTP)와 쓰기 `SessionRepo`(pg Pool/tx)가 갈라져 있고, 이번에 `SessionRepo`는 **한 줄도 바뀌지 않았다**(D-L).
- **C-6 신설 컨벤션이 실제로 지켜졌다** — 판정은 `song-state.ts`, 표현은 `AddSongFlow`, 조립은 두 화면. `SearchResults`에서 105줄이 사라진 것이 그 값이다.

## 4. 보안 점검

| 항목 | 판정 | 근거 |
| --- | :-: | --- |
| 세션 목록 owner 필터 (두 번째 다수 행 노출면) | ✅ | L1 #21 — 시드된 타 owner 세션이 목록에 없음 |
| 세션 상세 IDOR | ✅ | L1 #22 404 (403 아님 — 존재 누설 없음) |
| **songId 직접 지정 = 이번에 새로 열린 IDOR 표면** | ✅ | L1 #24 404. `findByIdForOwner`가 유일 방어선이고 실측으로 섰다 |
| 신규 라우트 인증 누락 | ✅ | 3핸들러 전부 `withAuth`. ESLint `apiRouteGuard`가 첫 실전에서 값을 했다 |
| 3-state 계약 (M3 큐 하향 계약) | ✅ | L1 #25·#26 |

## 5. 수동 확인 (설계서 §8.5) — **5/5 통과**

코드로도 L1로도 닿지 않는 육안 항목이다. **사용자가 Preview에서 직접 확인했다 (2026-08-23).**

| # | 확인 항목 | 관련 | 결과 |
| --- | --- | --- | :-: |
| M-1 | 상세에서 UNSUPPORTED 곡 [오늘로] → 시트 → [그냥 추가] → 오늘 화면에 곡이 있고, 곡 관리 표에서 그 곡의 오늘 브랜드가 **여전히 "미지원"** | D-S | ✅ 통과 |
| M-2 | 오늘 브랜드 ≠ 세션 브랜드일 때 [오늘로] 옆에 오늘 브랜드 칩 병기 | D-N | ✅ 통과 |
| M-3 | 열린 세션이 없을 때 [오늘로] 열이 사라짐 | §5.2 | ✅ 통과 |
| M-4 | 검색 결과의 AVAILABLE 추가가 여전히 2탭 (FR-09 이관 후 회귀) | FR-09 | ✅ 통과 |
| M-5 | 지난 플리 목록 상단 [새 플리] → 폼 → 세션 생성, 열려 있던 세션이 목록에서 "진행 중" 배지를 잃고 새 세션이 그 자리를 받는가 | §2.8 | ✅ 통과 |

M-1은 L1 #26이 API 층에서 같은 것을 이미 실측했고, 육안 확인은 UI가 그 상태를 옳게 비추는지를 봤다 — **두 층이 같은 말을 한다**. D-S가 지키려던 M3 큐 계약이 API와 화면 양쪽에서 섰다.

이로써 설계서 §8.1이 정한 검증 3층(UNIT · L1 · 수동)이 전부 닫혔다.

## 6. Next Steps

1. ~~Checkpoint 5 결정 — G-1 수정 여부~~ → **수정 완료** (§2.8)
2. ~~§5 수동 확인 기록~~ → **5/5 통과** (M-5 포함)
3. `/bkit:pdca report expand-playlist-import`
4. 사이클 종료 절차(RULE.md) — 버전은 **사용자가 결정한다**

---

## Version History

| 버전 | 날짜 | 변경 | 작성자 |
| --- | --- | --- | --- |
| 0.3 | 2026-08-23 | 수동 확인 5건 전부 통과 기록(§5). 검증 3층(UNIT·L1·수동) 종결 | Claude |
| 0.2 | 2026-08-23 | Act 1회 반영 — G-1 수정 + 새 플리 진입점 추가(`fa1b44d`). L1 28/28 재확인, 빌드 통과. Match Rate 99% → **100%** | Claude |
| 0.1 | 2026-08-23 | 최초 작성. Match Rate 99%. Gap 4건(Critical 0 · Important 1). L1 28/28 2회 연속, Vitest 57/57, Vercel 빌드 통과 | Claude |
