# expand-playlist-import 계획서

> **요약**: 지난 플리를 처음으로 화면에 꺼내고, 거기서 곡을 오늘로 가져온다. 그 과정에서 지금까지 "번호로만" 곡을 추가하던 유일한 경로를 곡 단위 추가 경로로 넓혀 ARCHITECT §5.2 브랜드 변환 3분기를 완성한다.
>
> **프로젝트**: sing-diary
> **버전**: 미정 (사이클 종료 시 사용자가 결정)
> **사이클**: expand-playlist-import
> **작성일**: 2026-08-23
> **상태**: Draft

---

## Executive Summary

| 관점 | 내용 |
| --- | --- |
| **문제** | **지난 세션을 볼 화면이 없다.** `SessionRepo`에는 `findOpenByOwner`·`findByIdForOwner`·`closeAllOpen`·`create` 넷뿐으로 "내 세션 목록"을 뽑는 메서드가 아예 없고, 화면도 오늘의 플리 하나뿐이다. 그리고 곡을 세션에 넣는 경로는 여전히 **번호 기반 하나**(`add-entry-by-number`)다. 직전 사이클의 검색 결과 추가는 "AVAILABLE 곡의 번호를 도로 POST해 같은 곡을 찾게 하는" 우회로 그 하나를 빌려 쓰고 있다. |
| **해결** | 세션 목록·상세 읽기 경로를 신설하고, **`songId` 기반 추가 경로**를 만들어 번호 우회를 걷어낸다. 그 위에서 §5.2 변환 3분기(AVAILABLE 즉시 / UNSUPPORTED 안내 / 행 없음 안내 — 세 분기 모두 "번호 입력 제안"과 "건너뛰고 추가"를 갖춘다)를 지난 플리·검색 두 진입점에 동일하게 적용한다. 판정 로직은 컴포넌트 밖 순수 함수로 뽑아 vitest로 고정한다. |
| **기능/UX 효과** | 지난주에 뭘 불렀는지 목록으로 보고, 그중 한 곡을 탭해 오늘의 플리에 넣는다. 오늘 기기에 번호가 없는 곡이어도 그 자리에서 번호를 채워 넣거나, 그냥 건너뛰고 넣은 뒤 나중에 정리한다. 검색 결과의 "AVAILABLE만 추가 가능" 반쪽 제약이 사라진다. |
| **핵심 가치** | M2 완료 기준("과거 데이터 기반 선곡")이 **닫힌다**. 그리고 番號(번호) 우회라는 임시 배관을 정식 배관으로 바꾼다 — 임시로 세운 것은 반드시 무너진다. **有始有終(유시유종)**, 벌여놓은 마일스톤은 끝을 봐야 한다. |

---

## Context Anchor

| Key | Value |
| --- | --- |
| **WHY** | M2의 남은 절반이다. 그리고 §5.2 3분기를 열려면 번호 우회를 정식 경로로 바꿔야 하는데, 라우트가 아직 9개인 지금이 그 배관을 바꾸기 가장 싼 시점이다. |
| **WHO** | sing-diary 사용자 본인(1인). 모바일=현장에서 지난 플리 뒤져 선곡, PC=사후 정리(직전 사이클 산출물). |
| **RISK** | 곡 추가 경로가 **M1 이래 한 번도 안 바뀐 핵심 경로**다. 여기를 넓히다 현장 번호 입력(`AddByNumber`)을 회귀시키면 서비스의 본체가 멈춘다. 그리고 3분기의 "번호 입력 → AVAILABLE 전환"은 `songs`·`song_numbers`에 대한 **세 번째 쓰기 경로**다 — 3-state 계약을 여기서 깨면 M3 빈칸채우기 큐가 통째로 망가진다. |
| **SUCCESS** | 지난 세션 목록·상세가 보이고, 거기서 곡을 오늘로 가져올 수 있으며, 오늘 기기에 번호가 없는 곡도 세 분기 모두에서 넣을 수 있다. 기존 L1 19케이스 회귀 0 + 신규 케이스 통과. |
| **SCOPE** | 상태 판정 순수 함수 분리 → 세션 목록·상세 읽기 경로 → songId 기반 추가 + 번호 등록 API → 3분기 UI(지난 플리·검색 공통) → L1 확장 → Preview 실측 |

---

## 1. Overview

### 1.1 목적

ARCHITECT §7 M2의 남은 두 항목 — **§5.4 지난 플리 가져오기**와 **§5.2 브랜드 변환 3분기 완성** — 을 구현해 M2를 닫는다. 그 과정에서 백로그 `55992dd3`(UI 상태 판정 로직 순수 함수 분리)과 `2ab85325`(검색 API `brand` 파라미터 문서-구현 불일치)를 같이 처리한다.

### 1.2 배경

**M2는 직전 사이클에 절반만 닫혔다.** expand-song-catalog가 통합검색과 PC 곡 관리 표를 올렸고(Report §1.2, Match Rate 98%), 남은 것이 §5.4와 §5.2다. 백로그 `27178302`의 detail이 그 둘을 명시적으로 남겨두고 있다.

**직전 사이클은 §5.2를 AVAILABLE 분기만 열어두고 멈췄다.** 그것이 D-A(사용자 결정)였고, 그 결과 검색 결과 화면은 지금 "번호가 아직 없어요" / "이 기기에선 미지원"인 곡의 추가 버튼을 **비활성으로 잠가둔 상태**다(`SearchResults.tsx`). 이번에 그 자물쇠를 푼다.

**§5.4와 §5.2는 같은 배관을 쓴다.** 지난 플리에서 곡을 탭해 가져오는 것도, 검색 결과에서 추가하는 것도, 결국 "이 곡을 오늘 세션의 브랜드로 넣을 수 있는가"라는 같은 질문을 통과한다. 두 화면이 같은 판정 함수와 같은 추가 API를 공유해야 하고, 그래서 한 사이클로 묶었다(`cycle-propose` 안 1).

### 1.3 착수 전에 코드로 확인한 것

Plan 단계에서 실제 코드를 열어 확인한 사실이다. 추정이 아니므로 Design은 여기서 출발한다.

1. **세션 목록을 뽑을 메서드가 없다.**
   `src/application/ports/session-repo.ts`의 `SessionRepo`는 `findOpenByOwner` / `findByIdForOwner` / `closeAllOpen` / `create` 넷뿐이다. "owner의 세션 목록"은 신설이다. 다만 인덱스는 이미 있다 — `idx_sessions_owner_date (owner_id, visit_date DESC)`(`schema.ts`, ARCHITECT §4.3). **스키마 무변경으로 목록 쿼리가 그대로 인덱스를 탄다.**

2. **★ 곡 추가 경로는 번호 기반 하나뿐이고, 검색 결과 추가는 그것을 우회로 빌려 쓴다.**
   `add-entry-by-number.ts`의 입력은 `{ ownerId, sessionId, number }`다. `songId`로 넣는 경로가 없다. `SearchResults.tsx`는 주석에 그 우회를 명시해두었다 — "AVAILABLE 곡의 번호를 그대로 넘기면 `findByOwnerBrandNumber`가 같은 곡을 찾아 stub 생성 없이 정확히 그 곡을 추가한다".
   **이 우회는 3분기를 열면 즉시 깨진다.** UNSUPPORTED·행 없음 곡에는 넘길 번호가 아예 없기 때문이다. 따라서 **`songId` 기반 추가 경로 신설이 이 사이클의 몸통**이다.

3. **★ `EntryRepo.listWithSongBySession(sessionId, brand)`는 브랜드를 인자로 받는다.**
   ```ts
   const number = row.song.numbers.find((n) => n.brand === brand)?.number ?? null;
   ```
   즉 세션 상세는 "그 세션의 브랜드" 번호를 실어 보인다. 그런데 **오늘로 가져올 때 판정에 필요한 것은 "오늘 세션의 브랜드" 번호**다. 지난 세션이 TJ이고 오늘이 KY면 두 브랜드가 다르다 — §5.2 변환이 필요해지는 지점이 정확히 여기다. 상세 화면은 **두 브랜드 정보를 동시에** 다뤄야 한다.

4. **`songs`·`song_numbers`에 대한 세 번째 쓰기 경로가 생긴다.**
   지금까지의 쓰기는 ① `createStubWithNumber`(현장 번호 입력) ② 곡 관리 표 인라인 수정(직전 사이클) 둘이다. 3분기의 "번호 입력 → AVAILABLE 전환"이 세 번째다. 다만 **`SongRepo.setNumber` / `clearNumber`가 이미 있다**(직전 사이클 산출물) — 새 저장 로직을 만들 필요 없이 그 포트를 재사용하면 3-state 계약이 자동으로 지켜진다.

5. **검색 API의 `brand`는 파싱만 하고 버려진다.**
   `src/app/api/songs/search/route.ts`가 `searchSongsQuerySchema.parse({ q, brand })`로 받아놓고 `useCases.searchSongs(ownerId, q)`에만 넘긴다. 백로그 `2ab85325`(G-5)가 지적한 그대로다. 3분기가 열려도 **판정은 여전히 클라이언트가 한다**(`SongListItem.numbers`가 TJ·KY를 둘 다 실어 보내므로) — 즉 이 파라미터는 앞으로도 쓰이지 않는다. **제거가 맞다.**

6. **`NumberCell`의 상태 판정은 컴포넌트 안 `useState`에 묶여 있다.**
   `touched` 플래그 기반 dirty-check(G-1 수정 산출물)이 `commit()` 안에 인라인으로 들어 있어 유닛 테스트가 닿지 않는다. 백로그 `55992dd3`이 지적한 그대로다. 판정부는 인자 → 결과가 명확한 순수 함수로 뽑을 수 있는 형태다.

7. **`sessions.is_public`은 항상 false다.** M1부터 지금까지 이 값을 true로 만드는 경로가 없다(M3 범위). 따라서 §5.4의 "타인 곡 → 사본 복사"(ARCHITECT D1) 분기는 **이번 사이클에 검증할 대상 자체가 존재하지 않는다** → §2.2에서 범위 제외(사용자 결정).

8. **번호 없는 엔트리를 오늘의 플리 UI가 이미 견딘다.**
   `EntryRow.tsx`: `entry.song.title ?? (entry.song.number ? '#' + number : '#—')`. "건너뛰고 추가"로 들어온 번호 없는 곡도 제목이 있으면 제목으로, 없으면 `#—`로 표시된다. **UI 신규 대응이 필요 없다** — 다만 `#—`가 사용자에게 무엇으로 읽히는지는 Design에서 한 번 본다.

### 1.4 관련 문서

- 아키텍처: [ARCHITECT.md](../../../architect/ARCHITECT.md) — §4.2(3-state), §4.3(세션 인덱스), §5.2, §5.4, §5.6, §6, §7
- 직전 사이클: [expand-song-catalog.plan.md](../expand-song-catalog/expand-song-catalog.plan.md) · [.design.md](../expand-song-catalog/expand-song-catalog.design.md) · [.report.md](../expand-song-catalog/expand-song-catalog.report.md)
- 인증 경계: [refine-auth-boundary.design.md](../refine-auth-boundary/refine-auth-boundary.design.md) — §2.3 D-C/D-D/D-E
- M1: [first-take.design.md](../first-take/first-take.design.md) — §9(계층 구조)
- 문서 규약: [RULE.md](../../../RULE.md) · 브랜치·커밋 규약: [CONTRIBUTING.md](../../../../CONTRIBUTING.md)
- 백로그: `27178302`(M2 나머지) · `55992dd3`(상태 로직 분리) · `2ab85325`(brand 파라미터, G-5)

---

## 2. Scope

### 2.1 In Scope

**A. 상태 판정 로직 순수 함수 분리 (백로그 `55992dd3`) — 가장 먼저**

- [ ] 번호 3-state 판정과 dirty-check(touched)을 컴포넌트 밖 순수 함수 모듈로 분리
- [ ] 이번에 새로 만드는 §5.2 3분기 판정도 **같은 모듈에** 넣는다 (사용자 결정)
- [ ] vitest 유닛 테스트로 전 분기 고정. `NumberCell` 회귀 0 (G-1 수정 내용 보존 확인)

**B. 지난 플리 목록 · 상세 (ARCHITECT §5.4 · §6 "지난 플리")**

- [ ] `SessionRepo`에 owner 세션 목록 메서드 신설 (`idx_sessions_owner_date` 활용, §1.3-1)
- [ ] 세션 목록 화면 — 날짜 · 지점 · 브랜드 · 곡 수. 최신순
- [ ] 세션 상세 화면 — 그 세션의 entries를 순서대로. 제목 · 아티스트 · 점수 **읽기 전용**
- [ ] 상세는 **그 세션의 브랜드 번호와 오늘 세션의 브랜드 번호를 함께** 다룬다 (§1.3-3)
- [ ] `AppHeader`에 "지난 플리" 진입점 추가
- [ ] 타 owner 세션 접근 시 **404** (refine-auth-boundary D-E 승계)

**C. songId 기반 추가 경로 (§1.3-2 — 이 사이클의 몸통)**

- [ ] `songId`로 오늘 세션에 entry를 추가하는 유스케이스·API 신설
- [ ] `SearchResults.tsx`의 **번호 우회 폐기** — 신규 경로로 이관
- [ ] 기존 번호 기반 경로(`add-entry-by-number` · `AddByNumber` 현장 입력)는 **그대로 존치** (§5 R1)
- [ ] 열린 세션이 없으면 추가 경로를 노출하지 않는다 (`SearchResults` 선례 승계)

**D. 브랜드 변환 3분기 완성 (ARCHITECT §5.2 · 백로그 `27178302`)**

- [ ] **AVAILABLE** — 즉시 추가
- [ ] **UNSUPPORTED** — "미지원 곡입니다" 안내 → 번호 입력 제안 → 입력 시 AVAILABLE 전환 후 추가
- [ ] **행 없음** — "번호가 아직 없습니다" 안내 → 번호 입력 제안 → 입력 후 추가
- [ ] **세 분기 모두 "건너뛰고 추가" 허용** (ARCHITECT §5.2 원문, 사용자 결정)
- [ ] 번호 저장은 기존 `SongRepo.setNumber`를 재사용해 3-state 계약을 자동 준수 (§1.3-4)
- [ ] 이 3분기 UI를 **지난 플리 상세와 검색 결과가 공유**한다

**E. 잔가지 정리**

- [ ] 검색 API `brand` 파라미터 **제거** — 라우트·Zod 스키마·클라이언트 호출부·Design 문서 표기 (백로그 `2ab85325`, §1.3-5)
- [ ] ARCHITECT §5.4에 "타인 곡 사본 복사 분기는 M3(공개 설정)와 함께" 를 명시

**F. 검증**

- [ ] `scripts/run-l1.mjs`에 신규 케이스 추가 — 세션 목록 무인증 401 / 정상 조회 / **타 owner 세션 404** / songId 추가 정상 · 타 owner 곡 차단 / 3분기 번호 등록
- [ ] Preview에서 `npm run l1` **전 케이스 통과** (기존 19건 회귀 0)
- [ ] 3-state 계약 SQL 확인 — UNSUPPORTED→AVAILABLE 전환 후 행이 하나로 유지되는지

### 2.2 Out of Scope

| 제외 항목 | 사유 |
| --- | --- |
| **타인 곡 사본 복사 (ARCHITECT §5.4 · D1)** | `is_public`이 항상 false라 **공개 세션이 존재하지 않는다**(§1.3-7). 검증 대상 없는 코드를 한 사이클 이상 방치하게 된다. M3 공개 설정과 함께 연다 (사용자 결정) |
| `sessions.is_public` 토글 UI | 위와 한 몸. M3 범위 |
| **세션 곡 일괄 가져오기** | ARCHITECT §5.4는 "곡을 탭하면"이라고만 적었다. 일괄은 쓰기가 N번 일어나 4초×N이 그대로 쌓인다 — 백로그 `baea17b1`(커넥션 재사용)이 열려 있는 동안엔 만들지 않는다 (사용자 결정) |
| 지난 세션의 점수·순서 **편집** | ARCHITECT §6 "지난 플리"는 목록→상세→가져오기까지다. 편집은 명세에 없다 |
| 세션 삭제 | 명세에 없다. `entries` CASCADE 분기 설계가 붙어 값에 비해 비싸다 |
| M3 빈칸채우기 큐 (§5.6) · 일괄 입력 | 백로그 `002e953e`. 3분기의 "건너뛰고 추가"가 만드는 결손을 회수하는 것이 그 큐의 일이다 |
| 쓰기 경로 커넥션 재사용 (백로그 `baea17b1`) | 별도 사이클(`cycle-propose` 안 3). 이번에도 4초대 지연은 그대로 남는다 |
| 곡 관리 표 잔가지 `47765514` · `80c2fe1d` | `cycle-propose` 안 2(`refine-song-table`) 몫 |
| 세션 목록 페이지네이션 | 1인 사용자의 노래방 방문 횟수 규모. 설계 원칙 4 |

---

## 3. Requirements

### 3.1 기능 요구사항

| ID | 요구사항 | 우선순위 | 근거 |
| --- | --- | --- | --- |
| FR-01 | 번호 3-state 판정과 dirty-check(touched)이 **컴포넌트 밖 순수 함수**로 분리되고, vitest로 전 분기가 고정된다 | High | 백로그 `55992dd3`, §1.3-6 |
| FR-02 | §5.2 3분기 판정도 FR-01과 **같은 모듈**에 위치한다 | High | 사용자 결정 |
| FR-03 | `NumberCell`의 기존 동작이 회귀하지 않는다 — 특히 G-1이 고친 "UNSUPPORTED→행없음 전이 도달 가능성" | High | §5 R4 |
| FR-04 | owner의 세션 목록을 최신순(`visit_date DESC`)으로 조회한다. 각 행에 날짜·지점·브랜드·곡 수 | High | ARCHITECT §5.4, §6 |
| FR-05 | 세션 상세가 그 세션의 entries를 `position` 순으로 보여준다 (제목·아티스트·점수, **읽기 전용**) | High | ARCHITECT §6 |
| FR-06 | 세션 목록·상세는 **호출자의 `owner_id`로 스코프**되고, 타 owner 세션 요청은 **404**를 반환한다 | High | 설계 원칙 1, refine-auth-boundary D-E |
| FR-07 | 세션 상세의 각 곡에 대해 **오늘 세션의 브랜드 기준** 번호 상태가 판정된다 (그 세션의 브랜드가 아니다) | High | §1.3-3 |
| FR-08 | `songId`로 오늘 세션에 entry를 추가하는 경로가 존재한다. 타 owner의 곡은 추가되지 않는다 | High | §1.3-2 |
| FR-09 | `SearchResults`의 **번호 우회가 제거**되고 FR-08 경로를 쓴다 | High | §1.3-2 |
| FR-10 | 기존 번호 기반 추가(`AddByNumber` 현장 입력)가 **그대로 동작**한다 | High | §5 R1 — M1 핵심 경로 |
| FR-11 | AVAILABLE 곡은 즉시 추가된다 | High | ARCHITECT §5.2 |
| FR-12 | UNSUPPORTED 곡은 "미지원" 안내와 함께 **번호 입력을 제안**하고, 입력하면 **AVAILABLE로 전환**한 뒤 추가한다 | High | ARCHITECT §5.2 |
| FR-13 | 번호 행이 없는 곡은 "번호가 아직 없습니다" 안내와 함께 번호 입력을 제안하고, 입력하면 **행을 생성**한 뒤 추가한다 | High | ARCHITECT §5.2 |
| FR-14 | **세 분기 모두에서 번호 입력을 건너뛰고 추가할 수 있다** | High | ARCHITECT §5.2 원문, 사용자 결정 |
| FR-15 | 번호 등록은 기존 `SongRepo.setNumber`를 재사용해 3-state 계약을 지킨다 — `AVAILABLE`은 번호 없이 저장되지 않고, `UNSUPPORTED` 행이 임의로 생성되지 않는다 | High | ARCHITECT §4.2, §5 R3 |
| FR-16 | 3분기 UI를 **지난 플리 상세와 검색 결과가 공유**한다 (같은 컴포넌트·같은 판정 함수) | Medium | 중복 구현 시 두 화면의 규칙이 갈린다 |
| FR-17 | 검색 API의 `brand` 파라미터가 라우트·스키마·클라이언트 호출부에서 **제거**되고 Design 문서 표기가 정정된다 | Medium | 백로그 `2ab85325`, §1.3-5 |
| FR-18 | `AppHeader`에 지난 플리 진입점이 추가된다 | Medium | ARCHITECT §6 |
| FR-19 | `npm run l1`에 신규 케이스가 추가되고 **전 케이스가 통과**한다 (기존 19건 회귀 0) | High | 검증 관행 승계 |
| FR-20 | ARCHITECT §5.4에 타인 곡 사본 복사 분기의 미구현 사실과 사유가 명시된다 | Medium | §2.2 — 문서가 구현을 앞질러 읽히지 않게 |

### 3.2 비기능 요구사항

| 범주 | 기준 | 측정 방법 | 비고 |
| --- | --- | --- | --- |
| **데이터 격리** | 타 owner의 세션·엔트리·곡이 목록·상세·추가 어떤 경로로도 노출·변경되지 않음 | L1에 **타 owner 세션 404 케이스** 신설 + owner 스코프 코드 리뷰 | 세션 목록은 검색에 이어 **두 번째로 다수 행을 가로지르는 노출면**이다 |
| **응답성 (읽기)** | 세션 목록·상세 **1.5초 이내**(Preview, 워밍) | `npm run l1` 왕복시간(ms) | 직전 사이클 검색 실측 459~1358ms가 근거 |
| **응답성 (쓰기)** | 곡 추가·번호 등록 왕복 **5초 이내** | 동일 | refine-auth-boundary Analysis §5.3에서 재조정된 현행 기준. **이번에도 완화하지 않는다** |
| **분기 왕복 횟수** | 번호를 입력해 추가하는 분기는 서버 왕복 **2회 이내**(번호 등록 + 엔트리 추가) | 코드 근거 | 쓰기가 4초대다. 3회가 되면 12초다 — Design에서 단일 트랜잭션 통합 여부를 검토 |
| **모바일 UX** | 지난 플리 상세에서 곡 가져오기는 **2탭 이내**(AVAILABLE 분기 기준) | 코드 근거 예상치 (Plan 단계에서 미리 허용) | 직전 사이클 선례 승계 — 물리 실측이 어려운 항목을 Check에서 즉흥 합의하지 않는다 |
| **인증 계약** | 신규 라우트 전부 무인증 시 401 + `UNAUTHORIZED` | L1 신규 케이스 | `withAuth()` + ESLint가 이미 강제(직전 사이클 산출물) |

> **기준 재조정 규칙 (승계)**: 실측이 기준을 넘기면 숫자만 올리지 않는다. 원인을 특정한 뒤 그 근거를 문구에 박아 재조정하거나, 특정하지 못했으면 미충족으로 그대로 보고한다.

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01 ~ FR-20 전부 구현
- [ ] `npm run l1` **전 케이스 통과** (Preview 대상) — 기존 19건 회귀 0 + 신규 케이스
- [ ] **번호 기반 현장 추가(`AddByNumber`) 회귀 없음** — L1 기존 케이스 + 수동 1회 확인 (FR-10)
- [ ] 3-state 계약 SQL 확인 — UNSUPPORTED 곡에 번호를 넣었을 때 `song_numbers` 행이 **하나로 유지되며 status만 AVAILABLE로 바뀌는지**, 행 없던 곡에 넣었을 때 행이 **하나만 생기는지**
- [ ] 순수 함수 모듈의 유닛 테스트가 3-state 3분기 + touched 판정 + §5.2 3분기를 전부 덮는다
- [ ] `npm run build` 성공, lint 0, typecheck 0 — **Vercel 빌드 로그로 확인**(로컬 실행 금지, `.claude/CLAUDE.md`)
- [ ] ARCHITECT §5.4 주석 반영 (FR-20)
- [ ] Preview 검증 통과 후 develop → main PR 병합 (프로덕션 선반영 금지)

### 4.2 품질 기준

- [ ] 기존 Vitest 스위트 전량 통과 (`npm test`) + 신규 유닛 테스트 추가
- [ ] ESLint 계층 경계 위반 0 (presentation → infrastructure 직접 참조는 `container.ts`만)
- [ ] ESLint `apiRouteGuard` 규칙 위반 0 — 신규 라우트가 전부 `withAuth()` 형태 (직전 사이클 산출물이 이번에 처음 실전 검증된다)
- [ ] Gap 분석 Match Rate ≥ 90%

---

## 5. Risks and Mitigation

| # | 리스크 | 영향 | 가능성 | 완화 |
| --- | --- | --- | --- | --- |
| **R1** | **★ 곡 추가 경로를 넓히다 현장 번호 입력을 회귀시킨다.** `add-entry-by-number`는 M1 이래 한 번도 안 바뀐 이 서비스의 본체다. songId 경로를 만들며 이걸 "통합"하려 들면 노래방에서 번호를 못 넣는 사태가 난다 | **High** | Medium | **기존 유스케이스를 건드리지 않는다.** songId 경로를 별도 유스케이스로 신설하고, 공통화는 하지 않는다(중복을 감수한다). L1 기존 케이스가 회귀 감시자다. Design에서 "두 경로 병존"을 명시적 결정으로 기록 |
| **R2** | **★ 번호 입력 분기가 서버 왕복 2회가 되어 8초대가 된다.** 번호 등록(4초) → 엔트리 추가(4초). 현장에서 이건 못 쓴다 | **High** | **High** | Design에서 **단일 트랜잭션 통합**(번호 등록 + entry 생성을 한 요청으로)을 우선 검토한다. `TransactionRunner`가 이미 있어 구조적으로 가능하다. 통합하지 않기로 하면 그 사유와 실측 왕복시간을 문서에 남긴다. NFR §3.2에 "2회 이내" 기준을 미리 박아뒀다 |
| **R3** | **★ 3분기의 번호 등록이 3-state 계약을 깬다.** UNSUPPORTED 곡에 번호를 넣을 때 기존 행을 갱신하지 않고 새 행을 만들거나(PK 충돌 → 500), `AVAILABLE`을 번호 없이 저장하면 M3 큐 A가 망가진다 | **High** | Low | **기존 `SongRepo.setNumber`를 그대로 재사용한다**(§1.3-4) — 직전 사이클에서 이미 3-state를 지키도록 만들어졌고 유닛 테스트도 있다. 새 저장 로직을 만들지 않는 것이 완화책 그 자체다. DB `PRIMARY KEY (song_id, brand)`와 `CHECK`가 최후 방어선 |
| **R4** | **순수 함수 분리 리팩터링이 G-1 수정을 되돌린다.** `touched` 기반 판정은 "값이 아니라 조작 여부로 판정한다"는 미묘한 로직이라, 옮기다 문자열 비교로 되돌아가기 쉽다 | Medium | Medium | **분리를 가장 먼저 하고(A), 유닛 테스트로 UNSUPPORTED→행없음 전이를 명시적으로 고정한 뒤** 다음 작업으로 넘어간다. 직전 사이클의 "핵심 가설 먼저" 전략 승계. G-1 케이스를 테스트 이름에 그대로 적는다 |
| **R5** | **지난 세션 브랜드와 오늘 브랜드가 달라 사용자가 혼동한다.** TJ 세션 상세를 보는데 표시되는 번호가 KY(오늘) 기준이면 "지난주엔 이 번호였는데?"가 된다 | Medium | **High** | Design에서 표시 규칙을 확정한다. **두 브랜드를 함께 보이되 오늘 기준 판정을 강조**하는 안을 우선 검토(§1.3-3). 어느 쪽이든 화면에 브랜드 라벨을 명시한다 |
| **R6** | **세션 목록의 "곡 수"가 N+1 쿼리를 부른다.** 세션마다 entries를 세면 목록 하나에 쿼리 N+1개다 | Medium | Medium | 집계를 한 쿼리로(`GROUP BY session_id` 조인) 처리한다. 어렵거나 값이 없다고 판단되면 **곡 수 표시를 빼는 것도 선택지**다 — Design에서 결정 |
| **R7** | **"건너뛰고 추가"가 결손을 대량 생산한다.** 세 분기 모두 건너뛰기를 허용하므로 번호 없는 entry가 쌓인다 | Low | **High** | 이것은 **의도된 설계다**(ARCHITECT §5.2 "결손은 빈칸채우기 큐가 회수한다"). 다만 M3가 아직 없으므로 그때까지는 곡 관리 표(직전 사이클)가 회수 수단이다. Report에 "M3의 시급성이 이 사이클로 올라갔다"를 기록 |
| **R8** | **`brand` 파라미터 제거가 클라이언트를 깨뜨린다.** `SearchResults.tsx`가 지금 이 파라미터를 붙여 보낸다 | Low | Low | 서버가 무시하고 있으므로 어느 쪽을 먼저 지워도 동작은 같다. 라우트·스키마·호출부를 **한 커밋에서** 지운다 |
| **R9** | **지난 플리가 이 프로젝트의 두 번째 다중 화면 흐름이다.** 목록→상세 라우팅과 뒤로가기 처리가 처음 생긴다 | Low | Medium | Next.js App Router의 중첩 라우트를 그대로 쓴다. RSC 직접 호출 패턴(first-take Design §7)을 승계해 별도 상태 관리를 만들지 않는다 |
| **R10** | **`#—` 표시가 사용자에게 무의미하다.** 건너뛰고 추가한 무제목·무번호 곡이 오늘의 플리에 `#—`로 뜬다 | Low | Medium | 기존 UI가 이미 견디긴 한다(§1.3-8). 이번에 그런 entry가 **처음으로 흔해지므로** Design에서 문구를 한 번 본다 |

**★ 표시(R1·R2·R3)는 Design 단계에서 반드시 확정하고 근거를 남긴다.**

---

## 6. Impact Analysis

### 6.1 변경 리소스

| 리소스 | 유형 | 변경 내용 |
| --- | --- | --- |
| `src/presentation/components/songs/` (신규 판정 모듈) | **신규** | 3-state 판정 · touched dirty-check · §5.2 3분기 판정 순수 함수 (배치 경로는 Design) |
| `src/presentation/components/songs/NumberCell.tsx` | 수정 | 판정부를 신규 모듈로 이관. **동작 무변경**(R4) |
| `src/application/ports/session-repo.ts` | 수정 | owner 세션 목록 메서드 신설 (`ownerId` 필수) |
| `src/infrastructure/repositories/drizzle-session-repo.ts` | 수정 | 위 구현. 곡 수 집계 포함 여부는 Design(R6) |
| `src/application/use-cases/` | **신규** | 세션 목록 / 세션 상세 / songId 기반 엔트리 추가 (+ 번호 등록 통합 여부는 R2) |
| `src/app/api/sessions/**` | **신규** | 세션 목록·상세 라우트 |
| `src/app/api/sessions/[id]/entries/route.ts` | 수정 또는 신규 라우트 | songId 기반 추가를 기존 라우트에 합칠지 가를지 Design에서 확정 |
| `src/app/api/songs/search/route.ts` · `schemas.ts` | 수정 | `brand` 파라미터 제거 (FR-17) |
| `src/app/(app)/sessions/**` | **신규** | 지난 플리 목록·상세 화면 |
| `src/presentation/components/` | **신규** | 세션 목록 · 세션 상세 · **3분기 추가 다이얼로그**(검색 결과와 공유, FR-16) |
| `src/presentation/components/songs/SearchResults.tsx` | 수정 | 번호 우회 제거 → songId 경로 + 3분기 UI 사용 (FR-09) |
| `src/presentation/components/AppHeader.tsx` | 수정 | 지난 플리 진입점 |
| `src/presentation/container.ts` | 수정 | 신규 유스케이스 등록 |
| `scripts/run-l1.mjs` | 수정 | 신규 케이스 추가. **`finally` 정리 블록은 손대지 않는다** |
| `tests/` | **신규·수정** | 판정 모듈 유닛 테스트 + 신규 유스케이스 테스트 |
| `docs/architect/ARCHITECT.md` | 수정 | §5.4 타인 분기 미구현 명시 (FR-20) |
| **DB 스키마 · 마이그레이션** | **무변경** | 목록 인덱스·3-state 제약이 이미 전부 있다(§1.3-1·4) |
| `src/application/use-cases/add-entry-by-number.ts` | **무변경** | R1 — 손대지 않는 것이 완화책이다 |
| `src/presentation/auth/**` · `eslint.config.mjs` | **무변경** | 직전 사이클 산출물. 이번엔 그 규칙 아래서 라우트를 늘릴 뿐 |
| 환경변수 | **무변경** | 신규 없음 |

### 6.2 기존 소비자

| 소비자 | 영향 | 유의점 |
| --- | --- | --- |
| **`AddByNumber` 현장 입력 흐름** | **간접 — 최우선 회귀 대상** | R1. 이 경로가 멈추면 서비스가 멈춘다. 기존 유스케이스·라우트를 건드리지 않는 것이 원칙 |
| `SearchResults.tsx` | **직접** | 번호 우회 제거 + 3분기 UI 도입으로 사실상 재작성 수준 |
| `NumberCell.tsx` | **직접** | 판정부 이관. G-1 수정 내용 보존이 조건(R3·FR-03) |
| `songs` · `song_numbers` 테이블 | **직접** | **세 번째 쓰기 경로**가 생긴다(§1.3-4). 기존 `setNumber` 재사용으로 계약 준수 |
| M3 빈칸채우기 큐 (백로그 `002e953e`) | **하향 계약 + 수요 증가** | "건너뛰고 추가"가 결손을 늘린다(R7) — 큐의 시급성이 이 사이클로 올라간다 |
| `EntryRepo.listWithSongBySession` | 재사용 | 브랜드 인자 의미가 상세 화면에서 처음으로 문제가 된다(§1.3-3, R5). 시그니처 변경 여부는 Design |
| `withAuth()` + ESLint `apiRouteGuard` | 수혜·검증 | 직전 사이클이 만든 강제 수단이 **이번에 처음 실전에서 신규 라우트를 받는다**. 규칙이 실제로 값을 하는지가 여기서 드러난다 |
| `npm run l1` 기존 19케이스 | 회귀 대상 | 신규 케이스 추가 시 기존 번호·정리 로직이 흔들리지 않아야 한다 |
| 백로그 `baea17b1`(커넥션 재사용) | 압력 증가 | R2가 현실화하면 4초대 지연이 **곱셈으로** 체감된다. 이 사이클의 실측이 다음 사이클의 근거가 된다 |
| ARCHITECT §5.4 | 문서 | 타인 분기 미구현을 명시(FR-20) |

### 6.3 검증

- [ ] 신규 `SessionRepo`·유스케이스 전부가 `ownerId`를 필수 인자로 받고 쿼리에서 실제로 사용한다 (누락 0건)
- [ ] 타 owner의 세션·엔트리·곡이 어떤 경로로도 닿지 않음 — **L1 실측으로 확인**
- [ ] `AddByNumber` 현장 경로 회귀 0 (L1 + 수동 1회)
- [ ] 3-state 전환 3분기가 SQL 확인으로 입증됨
- [ ] 기존 L1 19케이스 회귀 0
- [ ] `pdcaw` 업로드 대상에 본 사이클 문서 4종 + 갱신된 ARCHITECT가 포함됨

---

## 7. Architecture Considerations

### 7.1 프로젝트 레벨

first-take 이래 동일 — **Dynamic**. 계층 구조(`domain` / `application` / `infrastructure` / `presentation`)와 인증 경계(`withAuth()` / `requireOwnerIdOrRedirect()`)를 그대로 승계한다. 레벨 변경 없음.

### 7.2 주요 아키텍처 결정 (Plan 시점 확정분)

| # | 결정 | 선택 | 근거 |
| --- | --- | --- | --- |
| **D-A** | 타인 곡 사본 복사(ARCHITECT D1) | **이번 사이클 제외** | `is_public`이 항상 false라 검증 대상이 없다(§1.3-7). M3 공개 설정과 함께 연다 (사용자 결정) |
| **D-B** | 번호 입력 건너뛰기 | **세 분기 모두 허용** | ARCHITECT §5.2 원문. 현장 입력 최소화가 설계 원칙 2다. 결손은 M3 큐가 회수한다 (사용자 결정) |
| **D-C** | 세션 곡 일괄 가져오기 | **제외 — 곡 단위만** | 쓰기 4초×N. `baea17b1`이 열려 있는 동안엔 만들지 않는다 (사용자 결정) |
| **D-D** | 상태 판정 로직 분리 범위 | **기존 `NumberCell` + 신규 3분기 둘 다** | 두 상태 머신이 한 모듈에서 vitest로 고정된다. 백로그 `55992dd3` 완전 종료 (사용자 결정) |
| **D-E** | 기존 번호 기반 추가 경로 | **존치 — 통합하지 않는다** | R1. M1 핵심 경로를 리팩터링 대상으로 삼지 않는다. 중복을 감수한다 |
| **D-F** | 번호 저장 로직 | **기존 `SongRepo.setNumber` 재사용** | 3-state 준수가 이미 검증된 코드다(§1.3-4). 새로 만들면 R3가 다시 열린다 |
| **D-G** | 검색 API `brand` 파라미터 | **제거** (문서 정정이 아니라) | 3분기가 열려도 판정은 클라이언트 몫이다 — 앞으로도 안 쓴다(§1.3-5). 안 쓰는 계약을 문서에만 맞추면 다음 사람이 또 속는다 |
| **D-H** | 타 owner 세션 접근 | **404** | refine-auth-boundary D-E 승계. 존재 여부 자체를 숨긴다 |
| **D-I** | 물리 실측이 어려운 NFR | **"모바일 2탭"은 코드 근거 예상치를 미리 허용** | 직전 사이클 선례. Check 단계에서 즉흥 합의하지 않는다 |

### 7.3 이번 사이클이 만드는 구조

```
[지금]                                   [이번 사이클 후]
세션                                      세션
 └ 읽기: findOpenByOwner (오늘 1건)         ├ 읽기: findOpenByOwner (오늘 1건)
 └ 읽기: findByIdForOwner (단건)            ├ 읽기: findByIdForOwner (단건)
    └ 지난 세션 = 볼 수 없음                 └ 읽기: listByOwner ★신규 (목록)
                                                ↓
                                          지난 플리 목록 → 상세

곡 추가 경로 1개                           곡 추가 경로 2개
 └ 번호 기반 (현장 입력)                    ├ 번호 기반 (현장 입력) ← 무변경
    └ 검색 결과 추가가                      └ songId 기반 ★신규
       "번호 되돌려 보내기"로 빌려 씀            ↑ 검색 결과 · 지난 플리가 함께 쓴다

§5.2 변환: AVAILABLE 분기만               §5.2 변환: 3분기 완성
                                          └ UNSUPPORTED·행없음 → 번호 입력 제안 → 전환
                                          └ 세 분기 모두 "건너뛰고 추가" 가능
```

**핵심은 가운데 블록이다.** 지금 검색 결과의 추가는 "AVAILABLE 곡의 번호를 서버로 되돌려 보내 같은 곡을 다시 찾게 하는" 임시 배관이다. 3분기를 열면 그 배관에 흘려보낼 번호 자체가 없는 곡이 생긴다. **이 사이클은 기능을 두 개 붙이는 일이 아니라, 임시 배관을 정식 배관으로 바꾸고 그 위에 기능 두 개를 얹는 일이다.**

---

## 8. Convention Prerequisites

### 8.1 기존 컨벤션 현황

- [x] `docs/RULE.md` — 문서 규약. 본 사이클도 4종만, 경로 `docs/PDCA/2026-08/expand-playlist-import/`
- [x] `.claude/CLAUDE.md` — **로컬 build·lint·typecheck 금지**(Lightsail RAM 1.9GB). 검증은 Vercel 빌드 로그. vitest만 로컬
- [x] `CONTRIBUTING.md` — 브랜치·커밋 규약
- [x] 인증 — `withAuth()` wrapper + ESLint `apiRouteGuard` (직전 사이클)
- [x] 에러 계약 — `error-mapper.ts` 단일 지점, `{ error: { code, message, details } }`
- [x] NULL 정규화 — `schemas.ts`의 `nullableText()` 단일 지점 (D-F 승계)
- [x] Design Ref 주석 컨벤션 — `// Design Ref: §N — 사유`
- [x] 3-state 저장 — `SongRepo.setNumber` / `clearNumber`

### 8.2 정의할 컨벤션

| 범주 | 현황 | 정의할 내용 | 우선순위 |
| --- | --- | --- | :-: |
| 상태 판정 순수 함수 | 없음 (컴포넌트 내부) | 배치 경로·명명·테스트 규약. **앞으로 UI 상태 머신은 여기 넣는다**는 규칙 | **High** |
| 다단계 추가 흐름 | 없음 | 3분기 안내 → 번호 입력 → 추가의 UI 패턴(다이얼로그/인라인)과 왕복 횟수 규약(R2) | **High** |
| 목록→상세 라우팅 | 없음 (단일 화면뿐) | 중첩 라우트 경로 규약, 뒤로가기·`router.refresh()` 처리 (R9) | Medium |
| 에러 코드 | `SESSION_*` · `SONG_*` 존재 | 신규 코드 필요 여부 — 없으면 기존 재사용 | Low |
| 브랜드 라벨 표기 | 세션 헤더 칩만 | 지난 세션 브랜드 vs 오늘 브랜드 구분 표기 (R5) | Medium |

### 8.3 필요한 환경변수

**신규 없음.** 기존 변수만 사용한다.

| 변수 | 용도 | 이번 사이클 |
| --- | --- | --- |
| `L1_TARGET_URL` · `L1_VERCEL_BYPASS` | L1 Preview 검증 | 값만 이번 Preview URL로 |
| `DATABASE_URL` · `TEST_DATABASE_URL` | Neon 연결 / 통합 테스트 | 변경 없음 |
| `CLERK_SECRET_KEY` · `NEXT_PUBLIC_CLERK_DOMAIN` | 인증 | 변경 없음 |

---

## 9. Next Steps

1. [ ] `expand-playlist-import.design.md` 작성 — 특히 아래 다섯을 확정한다
   - **R2 번호 입력 분기의 왕복 횟수** (번호 등록 + 엔트리 추가를 단일 트랜잭션으로 합칠지)
   - **R1 두 추가 경로의 경계** (라우트를 가를지, 기존 라우트의 선택적 필드로 갈지)
   - **R5 지난 세션 브랜드 vs 오늘 브랜드 표시 규칙**
   - **R6 세션 목록의 곡 수 집계 방식** (또는 표시 제외)
   - **3분기 UI 형태** — 다이얼로그인지 인라인인지, 검색 결과와 어떻게 공유할지(FR-16)
2. [ ] Do — **A(순수 함수 분리)를 가장 먼저** 끝내고 테스트로 고정한다. 그 위에서 3분기를 짓는다 (직전 사이클의 "핵심 가설 먼저" 전략 승계, R4)
3. [ ] Do — 세션 목록·상세 읽기 경로 → songId 기반 추가 → 3분기 UI → 검색 결과 이관
4. [ ] Do — `brand` 파라미터 제거를 **한 커밋으로** (R8)
5. [ ] Do — L1 신규 케이스 추가 (**`finally` 정리 블록 무수정**)
6. [ ] Preview에서 `npm run l1` 전 케이스 통과 + 왕복시간 수치 확보 (특히 번호 입력 분기)
7. [ ] `expand-playlist-import.analysis.md` — Gap 분석 + 3-state 전환 SQL 확인 + 왕복시간 실측
8. [ ] ARCHITECT §5.4 갱신 (FR-20)
9. [ ] `expand-playlist-import.report.md` 및 사이클 종료 절차 (RULE.md §종료절차). **버전 번호는 종료 시점에 사용자가 결정한다**
10. [ ] 백로그 갱신 — `27178302`(M2) **종료**, `55992dd3` **종료**, `2ab85325` **종료**. `002e953e`(M3) detail에 "건너뛰고 추가로 결손 증가 — 큐 시급성 상승" 반영. `backlog-sync`

---

## Version History

| 버전 | 날짜 | 변경 | 작성자 |
| --- | --- | --- | --- |
| 0.1 | 2026-08-23 | 최초 작성. `cycle-propose` 안 1 채택 — 백로그 `27178302`(M2 나머지: §5.4 지난 플리 · §5.2 3분기) · `55992dd3`(상태 판정 로직 분리) · `2ab85325`(brand 파라미터)를 expand-playlist-import 사이클로 확정. Checkpoint 1·2 사용자 결정 반영 — 타인 곡 사본 복사 제외(D-A) / 세 분기 모두 건너뛰기 허용(D-B) / 일괄 가져오기 제외(D-C) / 상태 로직 분리는 기존+신규 둘 다(D-D). Plan 단계 코드 확인으로 §1.3 8건 확정 — 특히 **검색 결과 추가가 쓰는 번호 우회가 3분기를 열면 깨진다**(§1.3-2)와 **상세 화면이 두 브랜드를 동시에 다뤄야 한다**(§1.3-3)가 이번 사이클의 몸통 | Claude |
