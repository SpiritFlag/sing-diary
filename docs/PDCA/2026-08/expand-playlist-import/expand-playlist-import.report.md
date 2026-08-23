# expand-playlist-import 완료 보고서

> **상태**: Complete
>
> **프로젝트**: sing-diary
> **버전**: 미정 (사이클 종료 시 사용자가 결정 — 직전 태그 `v1.1.0`)
> **사이클**: expand-playlist-import
> **작성일**: 2026-08-23
> **Match Rate**: 100%

---

## Executive Summary

### 1.1 프로젝트 개요

| 항목 | 내용 |
| --- | --- |
| **사이클** | expand-playlist-import |
| **기간** | 2026-08-23 (Plan → Report 1일) |
| **범위** | 지난 플리 목록·상세 화면 신설, `songId` 기반 곡 추가 경로 신설, ARCHITECT §5.2 브랜드 변환 3분기 완성 |
| **설계안** | **B (클린 분리)** — Checkpoint 3에서 사용자 선택 |
| **커밋** | 5건 (`5cc11ad` · `84f07ab` · `9800d90` · `898e157` · `fa1b44d`) |
| **변경량** | 30 files, 약 +1,300 / -110 |

### 1.2 결과 요약

| 지표 | 값 |
| --- | --- |
| 기능 요구사항 | **FR-01 ~ FR-20 전부 구현** (20/20) |
| Match Rate | **100%** (Structural 100 · Functional 100 · Contract 100 · Runtime 100) |
| L1 (Preview) | **28/28**, module-6·Check·Act **3회 연속** 전건 통과 |
| UNIT (Vitest) | **8 files / 57 tests** 통과 |
| 수동 확인 | **5/5** 통과 |
| Vercel 빌드 | Compiled + lint·typecheck 에러 0 |
| 신규 마이그레이션 | **0건** |
| 신규 에러 코드 | **0건** |
| Act 반복 | 1회 |

### 1.3 전달된 가치

| 관점 | 계획 시 | 실제 결과 |
| --- | --- | --- |
| **문제** | 지난 세션을 볼 화면이 아예 없고, 곡을 세션에 넣는 길은 번호 기반 하나뿐이었다 | 목록·상세 두 화면이 섰고, `songId` 경로가 정식 배관으로 들어섰다 |
| **해결** | 세션 읽기 포트 신설 + `songId` 추가 경로로 번호 우회 제거 | `SessionQuery` 포트·`addEntryBySong` 유스케이스. `SearchResults`에서 우회 코드 **105줄이 사라졌다** |
| **기능/UX 효과** | 지난주 부른 곡을 목록으로 보고 오늘로 가져온다 | AVAILABLE 곡은 **2탭**. 번호가 없는 곡도 그 자리에서 채우거나 건너뛰고 넣는다 — 세 분기 전부 열렸다 |
| **핵심 가치** | M2 완료 기준("과거 데이터 기반 선곡")이 닫힌다 | **닫혔다.** 그리고 임시 배관(번호 우회)이 정식 배관으로 교체됐다 — 有始有終(유시유종) |

**숫자로 남은 성과 하나**: 번호 등록 + 곡 추가 왕복이 **4,199ms**다. 두 요청으로 나눴다면 8초대였다(쓰기 1회가 3~4초대인 것이 이 프로젝트의 상수다). Plan에서 ★로 찍은 R2가 실측으로 갚였다.

---

## 1.4 Success Criteria 최종 상태 (Plan §4.1)

| # | 기준 | 상태 | 근거 |
| --- | --- | :-: | --- |
| 1 | FR-01 ~ FR-20 전부 구현 | ✅ Met | Analysis §2.4 — 20/20 |
| 2 | `npm run l1` 전 케이스 통과 (기존 19 회귀 0 + 신규) | ✅ Met | 28/28, 3회 연속 |
| 3 | `AddByNumber` 현장 경로 회귀 없음 | ✅ Met | L1 #5 201. C-7 diff 검증 0건 |
| 4 | 3-state 계약 확인 (행 1개 유지 / 1개 생성) | ✅ Met | L1 #25 · #26 + 수동 M-1 |
| 5 | 순수 함수 유닛이 3-state·touched·3분기 전부 커버 | ✅ Met | `tests/song-state.test.ts` 10케이스 |
| 6 | build 성공, lint 0, typecheck 0 (Vercel 로그) | ✅ Met | `fa1b44d` 빌드 로그 |
| 7 | ARCHITECT §5.4 주석 반영 | ✅ Met | FR-20 |
| 8 | Preview 검증 통과 후 develop → main 병합 | ⏳ 절차 | §8.1에서 수행 |

**7/7 Met** (8번은 종료 절차 항목).

**비기능 요구사항 (Plan §3.2)** — 전항 충족, **기준 재조정 0건**.

| 범주 | 기준 | 실측 | 판정 |
| --- | --- | --- | :-: |
| 데이터 격리 | 타 owner 노출·변경 0 | L1 #21·#22·#24 | ✅ |
| 응답성(읽기) | 1.5초 이내 | 목록 697ms · 상세 682ms | ✅ |
| 응답성(쓰기) | 5초 이내 | 4,199ms | ✅ |
| 분기 왕복 횟수 | 2회 이내 | **1회** | ✅ |
| 모바일 UX | AVAILABLE 2탭 이내 | 2탭 (수동 M-4) | ✅ |
| 인증 계약 | 신규 라우트 401 | L1 #20 | ✅ |

---

## 1.5 Decision Record Summary

| 결정 | 채택 | 결과 |
| --- | --- | --- |
| **D-J** 유니언 스키마 (새 라우트 없음) | ✅ | 기존 `{number}` 갈래 바이트 보존. entries 라우트 변경 14줄. L1 #5 무회귀 |
| **D-K** 단일 트랜잭션·왕복 1회 | ✅ | **4,199ms** — 8초대를 피했다. 이 사이클 최대 성과 |
| **D-L** `SessionQuery` 포트 신설 | ✅ | `SessionRepo`가 diff에 없다. CQRS-lite 승계 |
| **D-M** 진행 중 세션 배지 + `/`로 라우팅 | ✅ | 수동 M-5에서 배지 이동까지 확인 |
| **D-N** 표시는 세션 브랜드 · 판정은 오늘 브랜드 | ✅ | 수동 M-2 칩 병기 확인 |
| **D-O** LEFT JOIN + GROUP BY 단일 쿼리 | ✅ | N+1 회피. L1 #21이 집계값을 상세 `entries.length`와 대조 |
| **D-P** `findByIdForOwner` 신설 | ✅ | **Design 단계에서 발견한 IDOR 공백.** L1 #24가 404를 실측 |
| **D-Q** 타 owner 세션 404 | ✅ | L1 #22 |
| **D-R** `AddSongFlow` 공유 컴포넌트 | ✅ | 두 화면이 같은 규칙. `SearchResults` 105줄 감소 |
| **D-S** "그냥 추가"는 번호 상태 불변 | ✅ | L1 #26 + 수동 M-1 — API·UI 두 층이 같은 말을 한다 |
| **D-T** `registerNumber` 덮어쓰기 | ✅ | 유닛 테스트 고정 |

**11/11 준수. 설계 결정을 뒤집은 것이 하나도 없다.**

---

## 2. 관련 문서

- [계획서](./expand-playlist-import.plan.md) · [설계서](./expand-playlist-import.design.md) · [분석서](./expand-playlist-import.analysis.md)
- 아키텍처: [ARCHITECT.md](../../../architect/ARCHITECT.md) — §4.2 · §5.2 · **§5.4(이번에 정정)** · §6
- 직전 사이클: [expand-song-catalog](../expand-song-catalog/)

---

## 3. 완료 항목

### 3.1 기능 요구사항 (20/20)

| 묶음 | FR | 결과 |
| --- | --- | --- |
| 판정 분리 | FR-01·02·03 | `song-state.ts`에 `commitDecision`·`addDecision` 두 상태 머신. G-1(UNSUPPORTED→행없음 전이)을 **테스트 이름에 그대로 박아** 고정 |
| 세션 읽기 | FR-04·05·06·07 | 목록(최신순·곡 수) · 상세(position 순·읽기 전용) · owner 스코프 404 · 오늘 브랜드 기준 판정 |
| 추가 경로 | FR-08·09·10 | `songId` 경로 신설, 번호 우회 제거, **기존 번호 경로 무변경** |
| 3분기 | FR-11·12·13·14·15·16 | AVAILABLE 즉시 / UNSUPPORTED·행없음은 시트(입력·건너뛰기·취소). `setNumber` 재사용으로 3-state 자동 준수 |
| 정리 | FR-17·18 | `brand` 파라미터 제거, `AppHeader` 진입점 |
| 검증·문서 | FR-19·20 | L1 #20~#28, ARCHITECT §5.4 미구현 명시 |

### 3.2 산출물

**신규 (16)**

```
application/ports/session-query.ts                 SessionListItem·SessionDetail·SessionQuery
application/use-cases/list-sessions.ts
application/use-cases/get-session-detail.ts
application/use-cases/add-entry-by-song.ts         이 사이클의 몸통 (단일 tx)
infrastructure/repositories/drizzle-session-query.ts
app/api/sessions/[id]/route.ts                     GET 상세
app/(app)/sessions/page.tsx                        목록 화면
app/(app)/sessions/[id]/page.tsx                   상세 화면 (notFound 연결)
presentation/components/sessions/SessionList.tsx
presentation/components/sessions/SessionDetailView.tsx
presentation/components/songs/AddSongFlow.tsx      3분기 공유 UI
presentation/components/songs/song-state.ts        판정 순수 함수
tests/song-state.test.ts · entry-schemas.test.ts · session-use-cases.test.ts
```

**수정 (14)** — `song-repo.ts`(+`findByIdForOwner`) · `drizzle-song-repo.ts` · `schemas.ts`(유니언) · `container.ts` · `sessions/route.ts`(GET 추가) · `sessions/[id]/entries/route.ts`(유니언 디스패치) · `songs/search/route.ts`(brand 제거) · `NumberCell.tsx` · `SearchResults.tsx`(재작성 수준) · `AppHeader.tsx` · `seed.ts` · `run-l1.mjs`(+167줄) · `ARCHITECT.md`

**무변경 약속 준수** — `add-entry-by-number.ts` · `AddByNumber.tsx` (C-7) · `session-repo.ts` (D-L) · 마이그레이션 0건.

### 3.3 신설 컨벤션

| # | 규칙 | 실전 결과 |
| --- | --- | --- |
| C-6 | UI 상태 판정은 순수 함수 모듈에 둔다 | `SearchResults`에서 105줄이 빠졌다. 규칙이 값을 했다 |
| C-7 | 핵심 경로 두 파일은 diff에 나타나지 않는다 | diff 검증 0건 — **R1이 발현하지 않은 이유가 이 한 줄이다** |
| C-8 | 유니언 갈래는 전부 `.strict()` | L1 #27이 혼합 본문 400을 실측 |

---

## 4. 미완료 / 이월 항목

### 4.1 다음 조치 필요 (백로그 후보 — 사용자 승인 시 backlog-sync)

| 항목 | 근거 | 우선순위 |
| --- | --- | :-: |
| **M3 빈칸채우기 큐 (`002e953e`) 시급성 상승** | "건너뛰고 추가"가 세 분기 모두에서 열렸다. 번호 없는 entry가 **이번 사이클부터 흔해진다**(Plan R7, 의도된 설계). 회수 수단은 현재 곡 관리 표뿐 | **High** |
| **쓰기 경로 커넥션 재사용 (`baea17b1`) 압력 증가** | 쓰기 3~4초대가 그대로다. 읽기(697ms)와 6배 차이. D-K로 왕복을 1회로 줄여 급한 불은 껐지만 **단가 자체는 안 내려갔다** | Medium |
| 설계서 §5.2 흐름도의 stub 곡 제목 표기 불일치 (Analysis G-4) | 같은 문서 안에서 흐름도와 체크리스트가 다른 말을 했다 | Low |
| 직전 사이클 설계서의 `?brand=` 표기 (Analysis G-3) | 닫힌 문서를 사후 수정할지 관례 결정 필요 | Low |

### 4.2 범위 밖으로 결정된 것 (Plan §2.2)

| 항목 | 사유 |
| --- | --- |
| 타인 세션 곡 → 사본 복사 (ARCHITECT §5.4 D1) | `sessions.is_public`을 true로 만드는 경로가 없다(M3 범위). **검증할 대상 자체가 없다** → ARCHITECT §5.4에 미구현을 명시(FR-20) |
| 세션 상세 편집(점수·순서) | 오늘 화면이 이미 그 역할이다. 상세는 읽기 전용 |

---

## 5. 품질 지표

### 5.1 최종 분석 결과

| 축 | 가중치 | 점수 |
| --- | :-: | :-: |
| Structural | 0.15 | 100% |
| Functional | 0.25 | 100% (Act로 G-1 해소) |
| Contract | 0.25 | 100% |
| Runtime | 0.35 | 100% |
| **Overall** | | **100%** |

### 5.2 해결된 이슈

| # | 내용 | 조치 |
| --- | --- | --- |
| G-1 | `SESSION_CLOSED`(409)일 때 화면이 낡은 채 남아 몇 번을 눌러도 같은 409를 봤다 | 409일 때만 시트를 닫고 `router.refresh()`. 다른 실패는 시트를 유지해 입력값을 지킨다 (`fa1b44d`) |
| — | **새 플리를 여는 문이 UI에 없었다** — 진입점이 `EmptyToday` 하나뿐이라 세션이 열려 있으면 새 세션을 열 길이 없었다. **M1부터의 공백**이 이번 목록 화면으로 드러났다 | 목록 상단 [새 플리]. 즉시 생성이 아니라 폼 페이지로 — `closeAllOpen`이 오늘 기록을 마감하기 때문 (`fa1b44d`) |
| G-2 | `addDecision`이 설계의 `as string` 단언 대신 방어 분기를 뒀다 | 안전한 쪽 이탈로 수용. 주석에 사유 기재 |

---

## 6. 회고 (Lessons Learned)

### 6.1 잘된 것 (Keep)

- **★ 위험을 Design 단계에서 코드로 확인한 것.** Plan이 ★로 찍은 R1·R2·R5·R6 넷을 Design에서 전부 해소했다. 특히 R2는 "`TxRepos`에 배관이 이미 있다"를 코드로 확인해 단일 트랜잭션을 확정했고, 그 판단이 **4,199ms**로 갚였다. 추측으로 남겼다면 구현 중에 8초를 보고 뒤집었을 것이다.
- **손대지 않기로 한 것을 정말로 안 건드린 것.** C-7 한 줄이 R1(High/Medium)을 통째로 무력화했다. 통합의 유혹을 규칙으로 미리 묶어둔 것이 주효했다.
- **모듈 순서를 지킨 것.** module-1(판정 분리)을 맨 먼저 하고 G-1을 테스트로 고정한 뒤 그 위에 3분기를 지었다. R4(리팩터링이 G-1을 되돌린다)가 발현할 자리를 아예 없앴다.
- **Design 단계에서 IDOR 공백을 발견한 것(D-P).** 설계서를 쓰다 "FK는 owner를 모른다"를 깨달아 `findByIdForOwner`를 넣었다. 요구사항에 없던 방어선이고, L1 #24가 그것이 실재함을 보였다.

### 6.2 개선 필요 (Problem)

- **설계서가 제 앞뒤로 두 말을 했다.** §5.3("실패 시 시트 유지")과 §6("SESSION_CLOSED면 refresh")이 어긋났고 구현이 §5.3을 택해 G-1이 났다. Gap 4건 중 **셋이 코드가 아니라 설계서의 흠**이다. 문서가 길어지면 스스로 모순된다 — 見木不見林(견목불견림).
- **"기능이 있는데 닿을 수 없는" 공백을 아무도 못 봤다.** 새 플리 진입점이 그것이다. Plan §1.3에서 코드를 여덟 항목이나 확인하고도 "이 화면에서 사용자가 다음에 할 일"을 세지 않았다. **파일 단위로는 다 있는데 동선 단위로는 끊긴 것**을 문서 검토로는 못 잡는다. 사용자의 한마디가 잡았다.
- **로그를 사용자에게 읽어달라고 한 것.** Vercel 토큰이 `~/.local/share/com.vercel.cli/auth.json`에 있는데 확인하지 않고 사용자에게 미뤘다. 지적받고서야 REST API로 직접 읽었다. 이후 모듈은 전부 스스로 확인했다.

### 6.3 다음에 시도할 것 (Try)

1. **설계서에 "동선 체크리스트"를 넣는다.** 지금의 Page UI Checklist는 화면 하나의 구성 요소를 센다. 그 화면에서 사용자가 다음에 할 일 —— 그 문이 있는가 —— 를 세는 칸이 없었다. 새 화면을 내는 사이클마다 "이 화면에서 나가는 문" 목록을 적는다.
2. **설계서 자기모순 점검을 Design 종료 전에 한 번.** 같은 동작을 두 절에서 서술했으면 둘을 나란히 놓고 읽는다. 이번 Gap의 75%가 여기서 잡혔을 것이다.
3. **환경이 쥔 자격증명·도구를 먼저 뒤진다.** "못 한다"고 말하기 전에 이 기계에 무엇이 깔려 있는지부터 본다.

---

## 7. 프로세스 개선 제안

### 7.1 PDCA 프로세스

- **`--scope` 분할이 이번에도 값을 했다.** 여섯 모듈을 네 세션(1+2 / 3 / 4+5 / 6)으로 끊었고, module-3 직후 L1 기존 19케이스를 먼저 돌려 **핵심 경로 회귀부터 확인**한 뒤 UI로 넘어갔다. 위험이 몰린 모듈을 단독 검증 지점으로 세우는 배치는 계속 쓸 만하다.
- **Checkpoint 5에서 사용자가 범위 밖 결함을 지적한 것**이 이번 사이클 최대 수확이다. 체크포인트를 형식으로 넘기지 않고 실제 화면을 두고 물은 결과다.

### 7.2 도구 / 환경

- L1이 28케이스로 늘었고 전 케이스 왕복이 1분 안쪽이다. 아직 여유가 있지만 40케이스를 넘기면 분할 실행을 고민할 시점이 온다.
- 로컬 검증 수단이 vitest뿐인 제약(RAM 1.9GB) 아래서, **Vercel 빌드 로그 직접 조회**가 이번 사이클에 자리를 잡았다. 다음 사이클부터는 처음부터 그렇게 한다.

---

## 8. Next Steps

### 8.1 즉시 (사이클 종료 절차, RULE.md 기준)

- [ ] `docs/PDCA/_INDEX.md`에 행 추가
- [ ] 최신 태그 확인(`v1.1.0`) 후 **다음 버전을 사용자가 결정**
- [ ] `npx pdcaw@latest upload --cycle expand-playlist-import --version <사용자 결정>`
- [ ] README.md 최신화
- [ ] docs 문서(본 4종 + ARCHITECT.md) + README + `.bkit/state/pdca-status.json` 커밋 1개 (develop)
- [ ] develop 푸시 → PR(develop→main, **Merge commit**) 생성 → 병합 (병합 전 확인)
- [ ] main squash 커밋에 태그 → 푸시 (푸시 전 확인)
- [ ] develop을 `reset --hard`로 main에 정렬 (되머지 금지)
- [ ] 태그 diff를 프로젝트 폴더에 txt로 저장 (커밋 안 함)
- [ ] backlog-sync — `27178302` · `55992dd3` · `2ab85325` 닫고, `002e953e`(M3 큐)에 "건너뛰고 추가로 결손 증가 — 시급성 상승" 기입

### 8.2 다음 PDCA 사이클

| 항목 | 우선순위 | 비고 |
| --- | :-: | --- |
| **M3 빈칸채우기 큐 (`002e953e`)** | **High** | 이번 사이클이 결손 생산 경로를 열었다. 회수 수단이 따라붙어야 한다 |
| 쓰기 경로 커넥션 재사용 (`baea17b1`) | Medium | 쓰기 단가 3~4초대가 그대로. 왕복을 줄이는 수는 이번에 다 썼다 |
| 세션 공개(`is_public`) + 타인 곡 사본 복사 | Medium | ARCHITECT §5.4의 남은 절반. FR-20이 미구현으로 명시해둔 자리 |
| 설계 문서 정정 2건 (G-3·G-4) | Low | 사용자 승인 시 backlog-sync |

---

## 9. Changelog

### (버전 미정 — 사이클 종료 시 사용자가 결정), 2026-08-23

**Added:**
- 지난 플리 목록·상세 화면(`/sessions`, `/sessions/[id]`) — 최신순 목록(곡 수 집계 포함), 읽기 전용 상세
- 세션 읽기 API — `GET /api/sessions`, `GET /api/sessions/{id}` (owner 스코프, 타 owner 404)
- `songId` 기반 곡 추가 — `POST /api/sessions/{id}/entries`의 유니언 본문 `{songId, registerNumber?}`. 번호 등록과 추가를 **단일 트랜잭션·왕복 1회**로 처리
- 브랜드 변환 3분기 UI(`AddSongFlow`) — AVAILABLE 즉시 추가 / UNSUPPORTED·행없음은 번호 입력 제안 + 건너뛰고 추가. 지난 플리 상세와 검색 결과가 공유
- 판정 순수 함수 모듈(`song-state.ts`) — 번호 확정 판정과 3분기 판정, 유닛 테스트 10케이스
- 곡 소유권 확인 `SongRepo.findByIdForOwner` — songId 직접 지정에 대한 IDOR 방어
- 지난 플리 목록에 **[새 플리] 진입점** — 세션이 열려 있어도 새 세션을 시작할 수 있다

**Changed:**
- `AppHeader`에 "지난 플리" 진입점 추가
- `SearchResults`가 번호 우회를 버리고 `songId` 경로 사용 — UNSUPPORTED·행없음 곡의 추가 버튼이 열렸다
- `GET /api/songs/search`에서 미사용 `brand` 파라미터 제거
- L1 검증이 19 → 28케이스

**Fixed:**
- 곡 추가 실패가 `SESSION_CLOSED`(409)일 때 화면이 갱신되지 않던 문제

**Unchanged (의도적):**
- `add-entry-by-number.ts` · `AddByNumber.tsx` — 현장 번호 입력 경로는 한 줄도 바뀌지 않았다
- DB 스키마 · 마이그레이션 · 에러 코드 · 환경변수

---

## Version History

| 버전 | 날짜 | 변경 | 작성자 |
| --- | --- | --- | --- |
| 0.1 | 2026-08-23 | 최초 작성. Match Rate 100%, FR 20/20, 설계 결정 11/11 준수, L1 28/28 · UNIT 57 · 수동 5/5 | Claude |
