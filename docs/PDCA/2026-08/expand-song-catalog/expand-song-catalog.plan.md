# expand-song-catalog 계획서

> **요약**: 곡 카탈로그를 처음으로 사용자 앞에 꺼낸다 — 통합검색과 PC 곡 관리 표를 올리고, 그 과정에서 늘어나는 신규 API 라우트가 인증 가드를 빠뜨릴 수 없도록 강제 수단을 함께 세운다.
>
> **프로젝트**: sing-diary
> **버전**: v1.1.0 (예정)
> **사이클**: expand-song-catalog
> **작성일**: 2026-08-23
> **상태**: Draft

---

## Executive Summary

| 관점 | 내용 |
| --- | --- |
| **문제** | `songs` 테이블에 곡이 쌓이는데 **꺼내 볼 수단이 없다.** M1은 세션 안에서 번호로 곡을 만들기만 했고, 곡 목록을 보거나 검색하거나 stub의 빈 제목을 채우는 화면이 하나도 없다. `SongRepo` 포트에 있는 메서드도 `findByOwnerBrandNumber` / `createStubWithNumber` 둘뿐이다. 동시에, 직전 사이클에서 미들웨어 방어선을 걷어낸 탓에 **신규 API 라우트는 첫 줄 `requireOwnerId()`가 유일한 방어선**인데 그것을 강제하는 수단이 없다. |
| **해결** | 통합검색(ARCHITECT §5.7)과 PC 곡 관리 표(§6)를 올려 카탈로그를 조회·수정 가능하게 만든다. 검색 결과에서의 곡 추가는 세션 브랜드 번호가 이미 있는(AVAILABLE) 경우로 한정해 §5.2 변환 3분기를 다음 사이클에 남긴다. 라우트를 처음 대거 늘리는 이 사이클에서 가드 강제 수단(ESLint 규칙 또는 wrapper)을 하나 도입한다. |
| **기능/UX 효과** | 모바일에서 제목·아티스트·메모 어느 것으로든 곡을 찾고, 번호가 맞는 곡은 그 자리에서 오늘의 플리에 넣는다. PC에서는 표로 전체 곡을 보고 잘못 들어간 stub의 제목·아티스트·번호를 그 자리에서 고친다. 쓰기 응답이 4초대이므로 인라인 수정은 낙관적 UI로 즉시 반영하고 실패 시 되돌린다. |
| **핵심 가치** | M2의 완료 기준("과거 데이터 기반 선곡")에 절반을 딛는다. 그리고 담장은 도둑 들기 전에 세운다 — **有備無患(유비무환)**. 라우트가 5개일 때 가드 강제를 넣는 것과 15개로 불어난 뒤 넣는 것은 값이 다르다. |

---

## Context Anchor

| Key | Value |
| --- | --- |
| **WHY** | 곡이 쌓이는데 꺼내 볼 화면이 없다. 그리고 라우트를 대거 늘리기 직전인 지금이 가드 강제 수단을 넣을 마지막으로 싼 시점이다. |
| **WHO** | sing-diary 사용자 본인(1인). 모바일=현장 검색·추가, PC=사후 정리. |
| **RISK** | 통합검색은 **owner 스코프가 처음으로 다수 행을 가로지르는 노출면**이다. 스코프를 한 군데라도 빠뜨리면 곧 타인 데이터 노출이다. 그리고 인라인 수정이 stub 3-state 계약(title NULL 유지 · UNSUPPORTED 임의 생성 금지)을 깨면 M3 빈칸채우기 큐가 통째로 망가진다. |
| **SUCCESS** | 검색이 title·artist·memo 어느 쪽으로든 잡히고, PC 표에서 곡을 고칠 수 있으며, 신규 라우트가 가드를 빠뜨리면 **자동으로 걸린다.** `npm run l1` 전 케이스 통과(신규 케이스 포함). |
| **SCOPE** | SongRepo 확장 → 검색 API·화면 → 곡 관리 표·인라인 수정 API → 가드 강제 수단 → L1 확장 → Preview 실측 |

---

## 1. Overview

### 1.1 목적

곡 카탈로그를 **읽고 고칠 수 있게** 만든다. 구체적으로 ARCHITECT §7 M2의 네 항목 중 **통합검색**과 **PC 곡 관리 표** 둘을 완성하고, 이 사이클이 처음으로 API 라우트를 대거 늘리는 사이클이므로 백로그 `bc6382f1`(라우트 가드 강제)을 같이 닫는다.

### 1.2 배경

**곡 데이터는 M1부터 쌓이고 있었으나 출구가 없었다.** first-take는 "세션 안에서 번호를 입력하면 stub 곡이 생긴다"까지만 만들었다(§5.3). 그 stub은 `title = NULL`인 채로 남고, 그것을 채울 화면은 M3(빈칸채우기 큐)까지 없다. 그 사이를 메우는 것이 곡 관리 표다 — 큐만큼 체계적이진 않아도 **표에서 그냥 고칠 수 있으면** 지금 당장 쓸모가 있다.

**검색은 인프라만 미리 깔려 있었다.** first-take가 `pg_trgm` 확장과 `idx_songs_trgm` GIN 인덱스를 미리 만들어 뒀다(`drizzle/0000_enable_pg_trgm.sql`, `drizzle/0001_cool_next_avengers.sql:49`). 쓰는 쪽이 없어 지금까지 놀고 있었을 뿐이다.

**가드 강제는 시점이 전부다.** refine-auth-boundary가 미들웨어의 `auth.protect()`를 걷어내면서 API 라우트의 이중 방어가 사라졌다(백로그 `bc6382f1`, refine-auth-boundary Design §10.4). 지금 라우트는 5개다. 이번 사이클이 검색·목록·수정으로 그 수를 늘린다. 백로그 detail의 표현 그대로 — "M2에서 신규 라우트를 추가하며 첫 줄 가드를 빠뜨리면 컴파일·lint 둘 다 통과한 채 무인증 데이터 노출로 이어질 수 있다."

### 1.3 착수 전에 코드로 확인한 것

Plan 단계에서 실제 코드를 열어 확인한 사실이다. 아래 넷은 **추정이 아니라 확인된 것**이므로 Design은 여기서 출발한다.

1. **`idx_songs_trgm`은 다컬럼 GIN이 아니라 결합 표현식 GIN이다.**
   ```sql
   CREATE INDEX "idx_songs_trgm" ON "songs" USING gin (
     (coalesce("title",'') || ' ' || coalesce("artist",'') || ' ' || coalesce("memo",'')) gin_trgm_ops
   );
   ```
   ARCHITECT §4.1은 `GIN (title, artist, memo)`로 적어놨으나 실제와 다르다(first-take Design §3.3에 사유가 기록돼 있고, 백로그 `27178302`도 "M2에서 확인할 것"으로 남겨뒀다). **문서 쪽이 틀렸으므로 이번에 정정한다.** 실무적 함의: 검색 쿼리를 **이 표현식과 한 글자도 다르지 않게** 써야 인덱스를 탄다.
2. **그 인덱스에 `owner_id`가 없다.** owner 필터는 별도 `idx_songs_owner`(btree) 몫이라 플래너가 둘 중 하나만 고른다. 개인 1인 데이터 규모에서는 어느 쪽이든 빠르겠지만, "인덱스를 탄다고 믿는 것"과 "탄다고 확인한 것"은 다르다.
3. **`SongRepo` 포트에는 검색·목록·수정 메서드가 하나도 없다.** 지금 있는 건 `findByOwnerBrandNumber`와 `createStubWithNumber` 둘뿐이다(`src/application/ports/song-repo.ts`). 전부 신설이다.
4. **`songs.updated_at`은 자동 갱신되지 않는다.** `src/infrastructure/db/schema.ts`의 `updatedAt`은 `.defaultNow()`만 있고 `$onUpdate`가 없다. 인라인 수정에서 `updated_at`을 **명시적으로 써주지 않으면** 생성 시각에 영원히 머문다.

### 1.4 관련 문서

- 아키텍처: [ARCHITECT.md](../../../architect/ARCHITECT.md) — §4.1, §5.2, §5.3, §5.6, §5.7, §6, §7
- 직전 사이클: [refine-auth-boundary.plan.md](../refine-auth-boundary/refine-auth-boundary.plan.md) · [refine-auth-boundary.design.md](../refine-auth-boundary/refine-auth-boundary.design.md) · [refine-auth-boundary.report.md](../refine-auth-boundary/refine-auth-boundary.report.md)
- M1 사이클: [first-take.design.md](../first-take/first-take.design.md) — §3.3(trgm 인덱스 형태 사유), §9(계층 구조)
- 문서 규약: [RULE.md](../../../RULE.md)
- 브랜치·커밋 규약: [CONTRIBUTING.md](../../../../CONTRIBUTING.md)
- 백로그: `27178302`(M2 — 이번엔 2항목만) · `bc6382f1`(라우트 가드 강제)

---

## 2. Scope

### 2.1 In Scope

**A. 통합검색 (ARCHITECT §5.7 · 백로그 `27178302` 일부)**

- [ ] `SongRepo`에 검색 메서드 신설 — owner 스코프 + `title`/`artist`/`memo` 결합 표현식 ILIKE
- [ ] 검색 유스케이스 신설 (`src/application/use-cases/`)
- [ ] 검색 API 라우트 신설 — 무인증 401, 빈 키워드·과단문 키워드 처리 포함
- [ ] 모바일 곡 검색 화면 (ARCHITECT §6 "곡 검색")
- [ ] 검색 결과에 세션 브랜드 기준 번호 상태(AVAILABLE / UNSUPPORTED / 행 없음)를 함께 표시
- [ ] **`EXPLAIN`으로 `idx_songs_trgm` 사용 여부를 실측**하고 결과를 Analysis에 기록

**B. 검색 결과에서 오늘로 추가 — AVAILABLE 한정 (사용자 결정)**

- [ ] 세션 브랜드에 **AVAILABLE 번호가 있는 곡만** 추가 버튼 활성 → 오늘의 플리에 entry 생성
- [ ] UNSUPPORTED / 행 없음인 곡은 버튼 비활성 + "다음 사이클에서 지원" 취지의 안내
- [ ] 열린 세션이 없으면 추가 경로 자체를 노출하지 않는다
- [ ] §5.2 변환 3분기(번호 입력 제안 → AVAILABLE 전환) 완성은 **다음 사이클**

**C. PC 곡 관리 표 (ARCHITECT §6 · 백로그 `27178302` 일부)**

- [ ] 표 화면 — 컬럼 TJ · KY · 제목 · 아티스트 · 메모
- [ ] 기본 정렬: 제목 → 아티스트 가나다순 (ARCHITECT §6). **stub(title NULL)의 정렬 위치를 Design에서 확정**
- [ ] 표 안에서 통합검색(A와 같은 경로 재사용)
- [ ] 인라인 수정 — 제목 · 아티스트 · 메모 · TJ 번호 · KY 번호
- [ ] **낙관적 UI**(사용자 결정) — 즉시 반영 + 저장 중 표시 + 실패 시 롤백
- [ ] 수정 시 `songs.updated_at` 명시적 갱신 (§1.3-4)
- [ ] 번호 인라인 수정이 **3-state 규칙**을 지킨다 (§3.1 FR-09, §5 R3)

**D. API 라우트 가드 강제 (백로그 `bc6382f1`)**

- [ ] 신규 라우트가 인증 가드를 빠뜨리면 **사람 눈이 아닌 도구가 걸러내는** 수단을 하나 도입
- [ ] 수단 선정(ESLint 커스텀 규칙 / wrapper / 그 밖)은 **Design에서 실증 후 확정**(사용자 결정, §7.2 D-E)
- [ ] 도입한 수단이 실제로 걸러내는지 **의도적으로 가드를 뺀 라우트로 검증**

**E. 검증**

- [ ] `scripts/run-l1.mjs`에 신규 API 케이스 추가 (무인증 401 · 정상 조회 · 타 owner 격리 · 잘못된 입력 400)
- [ ] Preview에서 `npm run l1` 전 케이스 통과
- [ ] ARCHITECT §4.1의 `idx_songs_trgm` 표기 정정

### 2.2 Out of Scope

| 제외 항목 | 사유 |
| --- | --- |
| §5.4 지난 플리 목록 → 상세 → 오늘로 가져오기 | 백로그 `27178302`의 나머지 절반. 사본 복사 정책(D1)까지 걸려 있어 별도 사이클이 맞다 |
| §5.2 브랜드 변환 3분기 완성 | 이번엔 AVAILABLE 분기만(사용자 결정). 번호 입력 제안 → AVAILABLE 전환 경로는 다음 사이클 |
| 곡 삭제 | ARCHITECT §6 표에 없다. `entries.song_id`가 RESTRICT라 분기 안내가 붙어야 해서 값에 비해 비싸다 |
| PC에서 곡 신규 등록 | M3 "일괄 입력"(§6)과 역할이 겹친다 |
| M3 빈칸채우기 큐 (§5.6) | 백로그 `002e953e`. 표 인라인 수정이 그 일부를 임시로 대신할 뿐, 큐 UI는 별건 |
| 쓰기 경로 커넥션 재사용 (백로그 `baea17b1`) | 4초대 지연은 낙관적 UI로 가린다(사용자 결정). 근본 개선은 별도 사이클 |
| `is_public` 공개 설정 | M3 범위 |
| tsvector 전환 | ARCHITECT §5.7이 "규모가 커지면"으로 못박았다. 지금 규모가 아니다 |
| 페이지네이션 · 무한 스크롤 | 1인 곡 수가 수백 건 규모. 필요해지면 그때 연다(설계 원칙 4) |

---

## 3. Requirements

### 3.1 기능 요구사항

| ID | 요구사항 | 우선순위 | 근거 |
| --- | --- | --- | --- |
| FR-01 | 키워드가 `title`·`artist`·`memo` 중 하나라도 매칭되면 결과에 포함된다 | High | ARCHITECT §5.7 |
| FR-02 | 검색은 **호출자의 `owner_id`로 스코프**된다. 타 사용자 곡은 어떤 키워드로도 나오지 않는다 | High | 설계 원칙 1, §5 R6 |
| FR-03 | 검색 쿼리가 `idx_songs_trgm`을 사용하는지 `EXPLAIN`으로 확인하고 결과를 기록한다. 사용하지 못하면 **사유와 대안을 문서화**한다 | High | §1.3-1·2, 백로그 `27178302` |
| FR-04 | 검색 API는 무인증 요청에 **401 + `UNAUTHORIZED`**를 반환한다 | High | refine-auth-boundary FR-03 계약 승계 |
| FR-05 | 빈 키워드·공백만·trgm 최소 길이 미만 키워드에 대한 동작이 정의되어 있다 (전체 반환 / 빈 결과 / 400 중 Design에서 확정) | High | §5 R2 |
| FR-06 | 검색 결과 각 행에 **세션 브랜드 기준 번호 상태**(AVAILABLE / UNSUPPORTED / 행 없음)가 표시된다 | Medium | ARCHITECT §5.2 |
| FR-07 | **AVAILABLE인 곡만** 검색 결과에서 오늘의 플리로 바로 추가된다. 나머지는 버튼 비활성 + 안내 | High | 사용자 결정 |
| FR-08 | PC 곡 관리 표가 TJ · KY · 제목 · 아티스트 · 메모를 보여주고, 기본 정렬은 제목 → 아티스트 가나다순이다 | High | ARCHITECT §6 |
| FR-09 | 표에서 제목·아티스트·메모·TJ 번호·KY 번호를 인라인 수정할 수 있다. **번호 수정은 3-state 규칙을 지킨다** — 값을 비우면 `song_numbers` 행을 **삭제**(= "아직 입력 안 함")하고, `UNSUPPORTED`는 사용자가 명시적으로 고를 때만 저장하며, `AVAILABLE`은 번호 없이 저장되지 않는다 | High | ARCHITECT §4.2, §5 R3 |
| FR-10 | 제목·아티스트·메모를 비우면 **빈 문자열이 아니라 NULL**로 저장된다 | High | M3 큐 B 계약(백로그 `002e953e`), `src/domain/song.ts` 주석 |
| FR-11 | 인라인 수정은 **낙관적 UI**로 즉시 반영되고, 저장 중임이 표시되며, 실패 시 이전 값으로 롤백되고 사용자에게 알린다 | High | 사용자 결정, §5 R1 |
| FR-12 | 곡 수정 시 `songs.updated_at`이 갱신된다 | Medium | §1.3-4 |
| FR-13 | 곡 수정 API는 **타 owner의 곡을 수정할 수 없다.** 시도 시 404 또는 403으로 차단된다(둘 중 무엇인지 Design에서 확정) | High | 설계 원칙 1 |
| FR-14 | **신규 API 라우트가 인증 가드를 호출하지 않으면 도구가 이를 검출한다.** 검출 실패가 조용히 통과되지 않는다 | High | 백로그 `bc6382f1` |
| FR-15 | FR-14의 수단이 실제로 동작함을 **가드를 일부러 뺀 라우트**로 검증한다 | High | 자체 검증 없는 강제 수단은 강제가 아니다 |
| FR-16 | `npm run l1`에 신규 API 케이스가 추가되고 전 케이스가 통과한다 | High | 검증 관행 승계 |
| FR-17 | ARCHITECT §4.1의 `idx_songs_trgm` 표기가 실제 구현(결합 표현식 GIN)과 일치하도록 정정된다 | Medium | §1.3-1 |

### 3.2 비기능 요구사항

| 범주 | 기준 | 측정 방법 | 비고 |
| --- | --- | --- | --- |
| **데이터 격리** | 타 사용자 곡이 검색·표·수정 어떤 경로로도 노출·변경되지 않음 | L1에 **타 owner 격리 케이스** 신설 + owner 스코프 코드 리뷰 | 이번 사이클의 최우선 NFR. 검색은 처음으로 다수 행을 가로지르는 노출면이다 |
| **응답성 (읽기)** | 검색 응답 **1.5초 이내**(Preview, 워밍) | `npm run l1` 왕복시간(ms) — 직전 사이클에서 만든 계측 재사용 | 근거: refine-auth-boundary 실측에서 읽기 경로(`GET current`)가 콜드 987ms / 워밍 578ms. 검색은 인덱스 조회가 더해질 뿐이다 |
| **응답성 (쓰기)** | 인라인 저장 왕복 **5초 이내** | 동일 | refine-auth-boundary Analysis §5.3에서 실측 근거로 재조정된 현행 기준. 이번에 다시 완화하지 않는다 |
| **체감 응답성** | 인라인 수정은 **입력 즉시** 화면에 반영된다 (서버 왕복을 기다리지 않음) | 낙관적 UI 구현 확인 + 수동 조작 | 쓰기 4초대를 가리는 수단이지 없애는 수단이 아니다 |
| **인증 계약** | 신규 라우트 전부 무인증 시 401 + `UNAUTHORIZED` | L1 신규 케이스 | refine-auth-boundary가 굳힌 계약 |
| **모바일 UX** | 검색 결과에서 곡 추가는 **2탭 이내** (결과 탭 → 추가) | 코드 근거 예상치 허용(직전 사이클 선례, Report §7.1) | 물리 실측이 어려운 항목임을 **Plan 단계에서 미리 명시** — 직전 회고의 Problem 반영 |

> **기준 재조정 규칙 (직전 사이클에서 승계)**: 실측이 기준을 넘기면 숫자만 올리지 않는다.
> 원인을 특정한 뒤 그 근거를 문구에 박아 재조정하거나, 특정하지 못했으면 미충족으로 그대로 보고한다.

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01 ~ FR-17 전부 구현
- [ ] `npm run l1` **전 케이스 통과** (Preview 대상) — 기존 9건 회귀 0 + 신규 케이스
  - 신규: 검색 무인증 401 / 검색 정상 조회 / **타 owner 곡 미노출** / 잘못된 키워드 처리 / 수정 무인증 401 / 타 owner 곡 수정 차단
- [ ] `EXPLAIN` 결과(인덱스 사용 여부)가 Analysis에 원문과 함께 기록됨
- [ ] **가드를 일부러 뺀 라우트가 도구에 걸리는 것을 실증**하고 그 출력이 Analysis에 기록됨 (FR-15)
- [ ] 3-state 규칙 준수 확인 — 번호를 비운 곡이 `song_numbers`에 행 없이 남고, `title`을 비운 곡이 NULL로 남음 (SQL로 직접 확인)
- [ ] 낙관적 UI 실패 롤백을 **의도적 실패 주입으로 1회 확인**
- [ ] `npm run build` 성공, `npm run lint` 에러 0, `npm run typecheck` 에러 0
- [ ] ARCHITECT §4.1 정정 반영
- [ ] Preview 검증 통과 후 develop → main PR 병합 (프로덕션 선반영 금지)

### 4.2 품질 기준

- [ ] 기존 Vitest 스위트 전량 통과 (`npm test`) + 신규 유스케이스 단위 테스트 추가
- [ ] ESLint 계층 경계 위반 0 (presentation → infrastructure 직접 참조는 `container.ts`만)
- [ ] Gap 분석 Match Rate ≥ 90%
- [ ] 신규 API 라우트 전부가 첫 줄 가드를 갖는다 — **grep이 아니라 FR-14의 도구로 확인**

---

## 5. Risks and Mitigation

| # | 리스크 | 영향 | 가능성 | 완화 |
| --- | --- | --- | --- | --- |
| **R1** | **낙관적 UI 롤백이 사용자 편집과 충돌한다** — 4초 뒤 실패가 돌아올 때 사용자는 이미 다른 셀(혹은 같은 셀)을 편집 중이다. 그때 이전 값으로 되돌리면 **사용자가 방금 친 것을 덮어쓴다**. 이번 사이클의 진짜 몸통 | **High** | **High** | Design에서 롤백 정책을 셀 단위로 명시한다 — 저장 중인 셀은 잠그거나, 실패 시 "되돌림" 대신 "재시도/폐기" 선택을 제시하는 방식 중 택일. **저장 중 편집을 허용할지부터 결정**한다. 서버 응답을 무조건 신뢰해 화면을 덮어쓰는 구현은 금지 |
| **R2** | **★ⓐ 검색 쿼리가 `idx_songs_trgm`을 타지 못한다** — 표현식이 한 글자라도 다르거나, owner 필터 쪽 인덱스가 선택되거나, 키워드가 trgm 최소 길이(기본 3자) 미만이면 순차 스캔이 된다 | Medium | **Medium** | Design 단계에서 **Preview DB에 직접 `EXPLAIN`을 날려 확인한다**(추정 금지). 못 타면 (a) 쿼리를 인덱스 표현식과 동일하게 맞추거나 (b) owner_id를 포함한 복합 인덱스를 새로 만들거나 (c) 1인 규모에서는 순차 스캔도 충분하다고 판단하고 **그 판단을 근거와 함께 기록**한다 — 셋 중 무엇이든 문서로 남긴다 |
| **R3** | **★ⓑ 번호 인라인 수정이 3-state 계약을 깬다** — 빈 문자열 번호를 `AVAILABLE`로 저장하거나, 값을 지웠을 때 행을 지우는 대신 `UNSUPPORTED` 행을 만들어버리면 **M3 큐 A의 `LEFT JOIN … WHERE n.song_id IS NULL`이 그 곡을 영영 못 찾는다** | **High** | Medium | ARCHITECT §4.2의 3-state를 Design에 표로 다시 옮겨 적고, UI에서 "비움"과 "미지원"을 **서로 다른 조작**으로 분리한다. DB `CHECK (status <> 'AVAILABLE' OR number IS NOT NULL)`가 최후 방어선이지만 여기까지 오면 500이므로 그 앞에서 막는다. 단위 테스트로 3분기 전부 고정 |
| **R4** | **`title`을 빈 문자열로 저장해 M3 큐 B가 망가진다** — `WHERE title IS NULL`이 빈 문자열을 못 잡는다 | **High** | Medium | 입력 정규화를 **한 지점**(유스케이스 또는 Zod 스키마)에서 하고 `""` → `null` 변환을 강제. 컴포넌트마다 따로 처리하지 않는다. 단위 테스트로 고정 |
| **R5** | **검색이 owner 스코프를 빠뜨린다** — 지금까지의 조회는 전부 단건·세션 스코프였다. 검색은 처음으로 **테이블 전체를 훑는** 쿼리다. 한 번의 누락이 곧 전체 노출 | **High** | Low | `SongRepo` 검색 메서드 시그니처의 **첫 인자를 `ownerId`로 고정**하고 쿼리에서 생략 불가능하게 만든다. L1에 타 owner 격리 케이스를 신설해 실측으로 확인한다(코드 리뷰만으로 끝내지 않는다) |
| **R6** | **★ⓒ 가드 강제 수단이 실제로는 아무것도 못 걸러낸다** — ESLint 규칙의 정밀도가 낮거나(핸들러 판별 실패), wrapper를 안 쓴 라우트를 못 잡거나 | Medium | **Medium** | FR-15가 이 리스크의 대응책이다 — 가드를 일부러 뺀 라우트를 만들어 **걸리는 것을 눈으로 본 뒤에** 채택한다. 걸러내지 못하면 다른 수단으로 전환하고, 둘 다 실패하면 그 사실을 Analysis에 적고 최소 대응(코드리뷰 체크리스트)으로 내려앉는다 — **되는 척하고 넘어가지 않는다** |
| **R7** | **wrapper 방식이 refine-auth-boundary의 결정(D-C/D-D)을 뒤집는다** — 리소스 기반 체크를 다시 전송 계층 wrapper로 감싸는 셈 | Medium | Medium | Design에서 결정 뒤집기를 **명시적 결정 기록**으로 남긴다(직전 사이클이 first-take Design §7을 뒤집을 때 한 방식 그대로). 뒤집지 않고 되는 수단(ESLint)이 실증되면 그쪽을 우선한다 |
| **R8** | **PC 표가 이 프로젝트의 첫 데스크톱 화면이다** — 기존 컴포넌트는 전부 모바일 전제로 만들어졌다. 레이아웃·헤더가 넓은 화면에서 깨질 수 있다 | Medium | Medium | Design에서 표 화면의 반응형 정책을 정한다. 기존 `AppHeader`·`(app)` 레이아웃을 표 화면이 그대로 쓸지, 별도 레이아웃으로 갈지를 **Design에서 결정**한다 |
| **R9** | **검색어의 ILIKE 특수문자(`%`, `_`, `\`)가 이스케이프되지 않는다** — `%`만 입력하면 전체가 나오고, 의도치 않은 매칭이 생긴다 | Low | Medium | 파라미터 바인딩만으로는 막히지 않는다(SQL 인젝션이 아니라 패턴 문자 문제). Design에서 이스케이프 처리를 명시하고 단위 테스트로 고정 |
| **R10** | **stub(title NULL)의 정렬 위치가 애매하다** — "제목 가나다순"인데 제목이 없는 곡이 있다. 맨 뒤로 밀면 정작 고쳐야 할 곡이 안 보인다 | Low | High | Design에서 확정한다. **stub을 맨 앞으로** 올리는 안을 우선 검토한다 — 표의 실질 용도가 stub 메꾸기이기 때문이다 |
| **R11** | **검색과 표가 같은 API를 쓸지 갈라질지 정해지지 않았다** — 표는 전체 목록 + 정렬이 필요하고 검색은 키워드가 필요하다 | Low | Medium | Design에서 한 라우트의 선택적 파라미터로 갈지 두 라우트로 갈지 확정한다. 라우트가 늘수록 FR-14의 값이 커진다는 점도 함께 고려 |

---

## 6. Impact Analysis

### 6.1 변경 리소스

| 리소스 | 유형 | 변경 내용 |
| --- | --- | --- |
| `src/application/ports/song-repo.ts` | 수정 | 검색·목록·수정 메서드 신설 (전부 `ownerId` 필수) |
| `src/infrastructure/repositories/drizzle-song-repo.ts` | 수정 | 위 메서드의 Drizzle 구현. 결합 표현식 ILIKE + 3-state 준수 번호 갱신 |
| `src/application/use-cases/` | **신규** | 곡 검색 / 곡 목록 / 곡 수정 유스케이스 |
| `src/presentation/api/schemas.ts` | 수정 | 검색 쿼리·곡 수정 Zod 스키마 추가 (`""` → `null` 정규화 포함, R4) |
| `src/app/api/songs/**` | **신규** | 검색·목록·수정 라우트 (개수는 Design에서 확정, R11) |
| `src/presentation/container.ts` | 수정 | 신규 유스케이스 등록 |
| 모바일 곡 검색 화면 | **신규** | `src/app/(app)/` 하위 (경로는 Design) |
| PC 곡 관리 표 화면 | **신규** | 위 동일. 첫 데스크톱 화면(R8) |
| `src/presentation/components/` | **신규** | 검색 결과 목록 · 표 · 인라인 편집 셀 |
| 가드 강제 수단 | **신규** | `eslint.config.mjs` 규칙 또는 wrapper 모듈 (Design에서 확정) |
| `scripts/run-l1.mjs` | 수정 | 신규 케이스 추가. **`finally` 정리 블록은 손대지 않는다** |
| `docs/architect/ARCHITECT.md` | 수정 | §4.1 `idx_songs_trgm` 표기 정정 (FR-17) |
| **DB 스키마 · 마이그레이션** | **무변경 예정** | 기존 스키마로 충분하다. 단 R2 대응으로 인덱스를 추가하게 되면 **마이그레이션 1건이 생긴다** — Design에서 확정 |
| `src/middleware.ts` · 인증 가드 2종 | **무변경** | 직전 사이클 산출물. 이번엔 그 위에 강제 수단만 얹는다 |
| 환경변수 | **무변경** | 신규 없음 |

### 6.2 기존 소비자

| 소비자 | 영향 | 유의점 |
| --- | --- | --- |
| `songs` · `song_numbers` 테이블 | **직접** | 지금까지 쓰기 경로는 `createStubWithNumber` 하나뿐이었다. 이번에 **수정 경로가 처음 생긴다** — 3-state와 NULL 계약(R3·R4)이 여기서 깨지면 M3가 통째로 망가진다 |
| `add-entry-by-number` 유스케이스 | 간접 | 검색 결과에서의 추가(FR-07)가 이 경로를 재사용할지 새로 만들지 Design에서 결정. 재사용하면 M1 회귀 위험, 새로 만들면 중복 |
| M3 빈칸채우기 큐 (백로그 `002e953e`) | **하향 계약** | 큐 A는 `song_numbers` 행 없음에, 큐 B는 `title IS NULL`에 의존한다. **이번 사이클이 그 두 계약을 지키는 첫 쓰기 경로다** |
| M2 나머지 (§5.4 지난 플리 · §5.2 변환) | 수혜 | `SongRepo` 확장과 검색 경로를 그대로 쓴다. 브랜드 변환 3분기는 이번에 만든 번호 상태 표시(FR-06)를 재사용 |
| `(app)` 레이아웃 · `AppHeader` | 간접 | 데스크톱 표 화면이 붙는다(R8). 모바일 전제 레이아웃이 견디는지 확인 필요 |
| 기존 API 라우트 5종 | 간접 | FR-14의 수단이 **기존 라우트에도 적용된다**. wrapper 방식이면 5개 전부 수정 대상이 되므로 회귀 확인 필요 |
| `npm run l1` 기존 9케이스 | 회귀 대상 | 신규 케이스 추가 시 기존 케이스 번호·정리 로직이 흔들리지 않아야 한다 |
| ARCHITECT §4.1 | 문서 | 실제 구현과 어긋난 표기를 정정한다(FR-17) |

### 6.3 검증

- [ ] `SongRepo` 신규 메서드 전부가 `ownerId`를 필수 인자로 받고, 쿼리에서 실제로 사용한다 (누락 0건)
- [ ] 타 owner의 곡이 검색·목록·수정 어떤 경로로도 닿지 않음 — **L1 실측으로 확인**
- [ ] 번호 3-state 3분기와 NULL 계약이 SQL 확인으로 입증됨
- [ ] 기존 L1 9케이스 회귀 0
- [ ] FR-14의 수단이 가드 누락을 실제로 검출함 (FR-15)
- [ ] `pdcaw` 업로드 대상에 본 사이클 문서 4종 + 정정된 ARCHITECT가 포함됨

---

## 7. Architecture Considerations

### 7.1 프로젝트 레벨

first-take 이래 동일 — **Dynamic**. 레벨 변경 없음. 계층 구조(`domain` / `application` / `infrastructure` / `presentation`)도 그대로 승계한다.

### 7.2 주요 아키텍처 결정 (Plan 시점 확정분)

| # | 결정 | 선택 | 근거 |
| --- | --- | --- | --- |
| **D-A** | 검색 결과에서의 추가 범위 | **AVAILABLE 분기만** | §5.2 3분기 완성은 별도 사이클. 반쪽이지만 "번호가 이미 있는 곡을 찾아 바로 넣는다"는 가장 잦은 경로는 이번에 열린다 (사용자 결정) |
| **D-B** | 인라인 수정의 응답 전략 | **낙관적 UI + 실패 롤백** | 쓰기 왕복이 4초대다. 기다리게 하면 표가 못 쓸 물건이 된다. 지연을 없애는 게 아니라 가리는 선택임을 명시한다 (사용자 결정) |
| **D-C** | 곡 관리 표의 기능 범위 | **조회 · 검색 · 인라인 수정만** | ARCHITECT §6 그대로. 삭제·신규 등록은 각각 FK RESTRICT 분기와 M3 일괄 입력에 걸린다 (사용자 결정) |
| **D-D** | 검색 인프라 | **`pg_trgm` + ILIKE 유지** | ARCHITECT §5.7. tsvector 전환은 "규모가 커지면". 1인 수백 건 규모가 아니다 |
| **D-E** | 가드 강제 수단 | **Design에서 실증 후 확정** | ESLint 규칙과 wrapper 중 어느 쪽이 실제로 누락을 잡는지 모른다. 고르는 게 아니라 **FR-15로 확인한 뒤** 채택한다 (사용자 결정) |
| **D-F** | NULL 정규화 지점 | **단일 지점 강제** (유스케이스 또는 Zod, Design에서 택일) | 컴포넌트마다 처리하면 R4가 반드시 터진다. 지점이 하나여야 테스트로 고정된다 |
| **D-G** | 물리 실측이 어려운 NFR | **"모바일 2탭"은 코드 근거 예상치를 미리 허용** | 직전 사이클 회고 Problem — Check 단계에서 즉흥적으로 합의하느라 멈췄다. 이번엔 Plan에서 미리 못박는다 |

### 7.3 이번 사이클이 만드는 구조

```
[지금]                                  [이번 사이클 후]
songs 테이블                             songs 테이블
 └ 쓰기: createStubWithNumber (세션 안)    ├ 쓰기: createStubWithNumber (세션 안)
 └ 읽기: findByOwnerBrandNumber (단건)     ├ 쓰기: updateSong ★신규 (표 인라인)
    └ 출구 없음                            ├ 읽기: findByOwnerBrandNumber (단건)
                                          ├ 읽기: search ★신규 (owner 스코프 전체 훑기)
                                          └ 읽기: list ★신규 (표)
                                             ↓
                                     모바일 검색 화면 / PC 곡 관리 표

API 라우트 5개                          API 라우트 5+N개
 └ 첫 줄 requireOwnerId() = 관행         └ 첫 줄 requireOwnerId() = 도구가 강제 ★신규
```

**핵심은 위쪽 두 줄이다.** 지금까지 `songs`에 쓰는 경로는 하나(stub 생성)뿐이었고 그 하나가 3-state와 NULL 계약을 지켰다. 이번에 **두 번째 쓰기 경로**가 생긴다. M3 빈칸채우기 큐가 딛고 설 계약을 지키는 책임이 이 사이클로 넘어온다.

---

## 8. Convention Prerequisites

### 8.1 기존 컨벤션 현황

- [x] `docs/RULE.md` — 문서 규약. 본 사이클도 `plan`/`design`/`analysis`/`report` 4종만, 경로 `docs/PDCA/2026-08/expand-song-catalog/`
- [x] `CONTRIBUTING.md` — 브랜치·커밋 규약
- [x] ESLint(계층 경계 규칙 포함) / tsconfig / Vitest — first-take 구축분
- [x] Design Ref 주석 컨벤션 — `// Design Ref: §N — 사유`
- [x] 에러 계약 — `error-mapper.ts` 단일 지점, `{ error: { code, message, details } }`
- [x] 인증 가드 2갈래 — `api-guard.ts`(throw→401) / `page-guard.ts`(리다이렉트)

### 8.2 정의할 컨벤션

| 범주 | 현황 | 정의할 내용 | 우선순위 |
| --- | --- | --- | :-: |
| 라우트 가드 강제 | 관행뿐 | FR-14 수단 확정 + 신규 라우트 작성 규칙 문서화 | **High** |
| NULL 정규화 | 없음 | `""` → `null` 변환 지점 단일화 (D-F) | **High** |
| 3-state 번호 조작 | DB CHECK만 | UI·API에서 "비움"과 "미지원"을 분리하는 규칙 | **High** |
| 에러 코드 | 5종 (`SONG_*` 없음) | 곡 관련 에러 코드 신설 여부 — `SONG_NOT_FOUND` 등. `error-mapper.ts`의 `DOMAIN_HTTP_STATUS` 표에 행 추가 | Medium |
| 낙관적 UI | 없음 | 저장 중 표시·롤백·재시도 패턴 (R1) | Medium |
| 데스크톱 반응형 | 없음 (모바일 전용) | 표 화면의 breakpoint 정책 (R8) | Medium |
| 검색 파라미터 | 없음 | 쿼리스트링 이름·최소 길이·정렬 파라미터 규약 | Low |

### 8.3 필요한 환경변수

**신규 없음.** 기존 변수만 사용한다.

| 변수 | 용도 | 이번 사이클 |
| --- | --- | --- |
| `L1_TARGET_URL` · `L1_VERCEL_BYPASS` | L1 Preview 검증 | 값만 이번 Preview URL로 |
| `DATABASE_URL` | Neon 연결. `EXPLAIN` 실행에도 사용 | 변경 없음 |
| `CLERK_SECRET_KEY` · `NEXT_PUBLIC_CLERK_DOMAIN` | 인증 | 변경 없음 |

---

## 9. Next Steps

1. [ ] `expand-song-catalog.design.md` 작성 — 특히 아래 다섯을 확정한다
   - **R1 낙관적 UI 롤백 정책** (저장 중 편집 허용 여부부터)
   - **R2 `EXPLAIN` 실측** 후 인덱스 대응 확정 (쿼리 정렬 / 인덱스 신설 / 순차 스캔 수용)
   - **R3 3-state 조작 UI**와 저장 규칙 3분기
   - **R11 라우트 분할** (검색·목록·수정을 몇 개 라우트로)
   - **R8 데스크톱 레이아웃** 정책
2. [ ] Do — **가드 강제 수단(FR-14·15)을 가장 먼저** 세운다. 그 뒤에 라우트를 늘려야 강제가 처음부터 걸린다 (직전 사이클의 "핵심 가설 먼저 검증" 전략 승계)
3. [ ] Do — `SongRepo` 확장 → 검색 API·화면 → 곡 관리 표·인라인 수정
4. [ ] Do — L1 신규 케이스 추가 (**`finally` 정리 블록 무수정**)
5. [ ] Preview에서 `npm run l1` 전 케이스 통과 + 왕복시간 수치 확보
6. [ ] `expand-song-catalog.analysis.md` — Gap 분석 + `EXPLAIN` 원문 + 가드 강제 실증 출력 + 3-state SQL 확인 결과
7. [ ] ARCHITECT §4.1 정정 (FR-17)
8. [ ] `expand-song-catalog.report.md` 및 사이클 종료 절차 (RULE.md §종료절차, 태그 **v1.1.0** 예정)
9. [ ] 백로그 갱신 — `bc6382f1` 종료, `27178302`(M2)는 **2항목 소진분을 detail에 반영하고 열린 채 유지** (§5.4·§5.2가 남음). `backlog-sync`

---

## Version History

| 버전 | 날짜 | 변경 | 작성자 |
| --- | --- | --- | --- |
| 0.1 | 2026-08-23 | 최초 작성. `cycle-propose` 안 3 채택 — 백로그 `27178302`(M2 중 통합검색·곡 관리 표 2항목)와 `bc6382f1`(라우트 가드 강제)을 expand-song-catalog 사이클로 확정. Checkpoint 1·2 사용자 결정 반영 — 검색→추가는 AVAILABLE 한정 / 인라인 수정은 낙관적 UI / 가드 수단은 Design에서 실증 후 확정 / 표 범위는 ARCHITECT §6 그대로. Plan 단계 코드 확인으로 §1.3 4건(trgm 표현식 인덱스 · owner_id 미포함 · SongRepo 메서드 부재 · `updated_at` 미갱신) 확정 | Claude |
