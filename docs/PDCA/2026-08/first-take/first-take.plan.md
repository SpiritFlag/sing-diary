# first-take 계획서

> **요약**: 빈 저장소에서 출발하여 노래방 현장에서 실제로 쓸 수 있는 "오늘의 플리" 기록 기능까지를 한 사이클로 구축한다.
>
> **프로젝트**: sing-diary
> **버전**: v0.1.0 (예정)
> **사이클**: first-take
> **작성일**: 2026-08-23
> **상태**: Draft

---

## Executive Summary

| 관점 | 내용 |
| --- | --- |
| **문제** | 노래방에서 부른 곡과 점수가 어디에도 남지 않는다. 저장소에는 아직 코드가 한 줄도 없어, 기록을 시작하려면 인프라부터 세워야 한다. |
| **해결** | Next.js 15 + Neon + Clerk + Vercel 기반을 세우고, ARCHITECT.md M1 범위(세션 수명주기 · 오늘의 플리 CRUD · 순서변경 · 번호 즉석 등록)를 도메인 배포까지 완료한다. |
| **기능/UX 효과** | 노래방 현장에서 번호만 입력해 곡을 쌓고, 부른 뒤 점수를 인라인으로 채우고, 드래그로 순서를 바꾼다. 자정을 넘겨도 세션이 유지된다. |
| **핵심 가치** | "다음 노래방 방문에서 실사용 가능" — 부분 기능이 아니라 하나의 완결된 기록 루프를 손에 쥔다. |

---

## Context Anchor

| Key | Value |
| --- | --- |
| **WHY** | 노래방 기록이 휘발된다. 기록할 도구 자체가 존재하지 않는다. |
| **WHO** | sing-diary 사용자 본인(1인). 모바일 현장 기록이 주 사용 맥락. |
| **RISK** | Neon HTTP 드라이버가 다중 문장 트랜잭션을 지원하지 않아 §5.1 세션 전환의 원자성이 깨질 수 있다. |
| **SUCCESS** | 실제 노래방 방문 1회를 이 앱만으로 기록 완료. DB 불변식 4종이 테스트로 강제됨. |
| **SCOPE** | 부트스트랩 → 스키마/인증 → 세션 API → 오늘의 플리 UI → 순서변경 → 배포 |

---

## 1. Overview

### 1.1 목적

ARCHITECT.md §7 마일스톤 **M1**(인증 · 스키마 · 세션 · 오늘의 플리 CRUD · 순서변경 · 번호 즉석 등록)을,
그 전제인 **프로젝트 부트스트랩**과 함께 완료하여 완료 기준인 "다음 노래방 방문에서 실사용 가능" 상태에 도달한다.

### 1.2 배경

저장소는 커밋이 없는 상태다. ARCHITECT.md §7의 마일스톤 표는 M1에 부트스트랩을 명시하지 않았으나,
스키마·인증·화면은 프레임워크와 DB 연결 없이는 존재할 수 없다. 따라서 부트스트랩은 M1에 암묵적으로 포함된 것으로 해석하고
본 사이클 범위에 명시적으로 편입한다.

M1 완료 기준이 "실사용 가능"이므로 배포까지가 완료 조건이다. 로컬 동작만으로는 기준을 충족할 수 없다.

### 1.3 관련 문서

- 아키텍처: [ARCHITECT.md](../../../architect/ARCHITECT.md)
- 문서 규약: [RULE.md](../../../RULE.md)
- 브랜치·커밋 규약: [CONTRIBUTING.md](../../../../CONTRIBUTING.md)

---

## 2. Scope

### 2.1 In Scope

**A. 부트스트랩**

- [ ] Next.js 15 App Router + TypeScript 프로젝트 생성
- [ ] Tailwind CSS 설정 및 다크 파스텔 컬러 토큰 정의
- [ ] Drizzle ORM + Neon PostgreSQL 연결, 마이그레이션 파이프라인
- [ ] Clerk 인증 연동 (미들웨어, 로그인/로그아웃, 보호 라우트)
- [ ] Vercel 프로젝트 연결 및 `sing-diary.spiritflag.work` 도메인 배포
- [ ] ESLint / Prettier / tsconfig 등 컨벤션 기반

**B. 스키마 (ARCHITECT §4 전량)**

- [ ] enum `brand_enum`('TJ','KY'), `number_status`('AVAILABLE','UNSUPPORTED')
- [ ] `songs` · `song_numbers` · `sessions` · `entries` 4테이블
- [ ] 제약: `song_numbers` PK(song_id, brand) + CHECK, `sessions` 부분 유니크(열린 세션 1개), `entries` FK RESTRICT
- [ ] 인덱스: `idx_songs_owner`, `idx_sessions_owner_date`, `idx_entries_session`
- [ ] `pg_trgm` 확장 + `idx_songs_trgm` GIN 인덱스 생성 (검색 기능은 M2, 인덱스만 선반영)

**C. 세션 (ARCHITECT §5.1)**

- [ ] 세션 생성 = 이전 열린 세션 자동 종료 (원자적 처리)
- [ ] 진행 중 세션 조회 (`closed_at IS NULL`)
- [ ] 세션 생성 화면: 날짜 · 지점 · 브랜드

**D. 오늘의 플리 (ARCHITECT §5.3, §5.5, §6)**

- [ ] 번호 입력으로 곡 추가 — 기존 곡 매칭 or `songs` stub(title NULL) + `song_numbers` 동시 생성
- [ ] entry 목록 표시 (순서 · 번호 · 제목 · 점수)
- [ ] 점수 인라인 수정 (numeric(5,2), NULL 허용)
- [ ] entry 삭제
- [ ] dnd-kit 드래그 순서변경 → 세션 전체 position 1..N 재부여

**E. 품질**

- [ ] DB 불변식 4종 테스트 (§4.1 참조)

### 2.2 Out of Scope

| 제외 항목 | 사유 |
| --- | --- |
| 통합검색 (§5.7) | M2. 본 사이클은 번호 입력 전용 추가 경로만 구현 |
| 지난 플리 목록·상세·가져오기 (§5.4) | M2 |
| 브랜드 변환 분기 (§5.2) | M2. M1은 세션 브랜드 기준 번호 직접 입력만 |
| 곡 관리 표 / 빈칸채우기 큐 / 일괄 입력 (§6 PC) | M2·M3 |
| 공개 설정 `is_public` UI | M3. 컬럼은 스키마에 존재하되 항상 false |
| 통계 · MCP 서버화 | ARCHITECT §7 "이후" |
| PWA · 오프라인 대응 | ARCHITECT §8 D6에서 미구현 결정 |

---

## 3. Requirements

### 3.1 기능 요구사항

| ID | 요구사항 | 우선순위 | 근거 |
| --- | --- | --- | --- |
| FR-01 | 사용자는 Clerk로 로그인하며, 모든 데이터 조회·변경은 `owner_id = 로그인 사용자`로 한정된다 | High | §2-1 개인 소유 원칙 |
| FR-02 | 세션 생성 시 해당 사용자의 열린 세션이 있으면 `closed_at`이 설정되고, 새 세션이 생성된다. 두 동작은 원자적이다 | High | §5.1 |
| FR-03 | 사용자당 열린 세션은 항상 1개 이하임을 DB 부분 유니크 인덱스가 강제한다 | High | §4.3, §2-3 |
| FR-04 | 세션 생성 화면에서 날짜(기본 오늘) · 지점(자유 입력) · 브랜드(TJ/KY)를 받는다 | High | §6 |
| FR-05 | "오늘의 플리"는 `closed_at IS NULL`인 세션을 가리키며, 자정을 넘겨도 유지된다 | High | §5.1 |
| FR-06 | 번호 입력 시 (세션 브랜드 + 번호)로 내 곡을 검색하여 있으면 그 곡으로, 없으면 stub 곡(title NULL)을 생성하여 entry를 추가한다 | High | §5.3 |
| FR-07 | entry 추가 시 점수는 NULL이며, 목록에서 인라인으로 점수를 입력·수정한다 | High | §6, §8 D4 |
| FR-08 | 점수는 numeric(5,2)로 소수점을 허용하고, 비워두면 NULL(미채점/오류)로 저장된다 | High | §8 D4 |
| FR-09 | entry를 삭제할 수 있다 | Medium | 오늘의 플리 CRUD |
| FR-10 | 드래그로 순서를 바꾸면 세션 전체 entries의 position이 1..N으로 재부여된다 | High | §5.5 |
| FR-11 | 동일 곡의 중복 entry 등록을 허용한다 (유니크 제약 없음) | Medium | §4.4 |
| FR-12 | `songs` 삭제는 참조 중인 entry가 있으면 FK RESTRICT로 거부된다 | Medium | §4.4 |
| FR-13 | 앱은 `sing-diary.spiritflag.work`에서 접근 가능하다 | High | §1 |

### 3.2 비기능 요구사항

| 범주 | 기준 | 측정 방법 |
| --- | --- | --- |
| 모바일 UX | 곡 추가는 세션 화면에서 3탭 이내(번호 입력 → 확인) | 수동 조작 카운트 |
| 응답성 | 서버리스 콜드스타트 포함 곡 추가 응답 2초 이내 | Vercel 로그 / 수동 계측 |
| 데이터 격리 | 타 사용자 `owner_id` 데이터가 어떤 API로도 노출되지 않음 | 라우트별 owner 스코프 코드 리뷰 + 테스트 |
| 스타일 | 다크 파스텔 토큰만 사용, 하드코딩 색상 0건 | grep 검사 |
| 정합성 | DB 불변식이 애플리케이션이 아닌 제약조건으로 강제됨 | 마이그레이션 SQL 검토 + 위반 삽입 테스트 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01 ~ FR-13 전부 구현
- [ ] **DB 불변식 테스트 4종 통과**
  1. 열린 세션이 있는 상태에서 `closed_at IS NULL` 세션 직접 INSERT → 유니크 위반으로 실패
  2. `song_numbers`에 `status='AVAILABLE'` + `number IS NULL` INSERT → CHECK 위반으로 실패
  3. 세션 생성 API 호출 후 → 이전 세션 `closed_at` 설정 + 신규 세션 열림이 동시에 성립
  4. 순서변경 후 해당 세션 entries의 position 집합이 정확히 `{1..N}`
- [ ] `sing-diary.spiritflag.work` 배포 및 로그인→세션생성→곡추가→점수입력→순서변경 전 구간 동작
- [ ] 빌드 성공, lint 에러 0

### 4.2 품질 기준

- [ ] 타입 에러 0 (`tsc --noEmit`)
- [ ] 전체 커버리지 목표는 두지 않음 — 불변식·핵심 플로우 집중 검증 (사용자 결정)
- [ ] Gap 분석 Match Rate ≥ 90%

---

## 5. Risks and Mitigation

| # | 리스크 | 영향 | 가능성 | 완화 |
| --- | --- | --- | --- | --- |
| R1 | **Neon HTTP 드라이버가 다중 문장 트랜잭션 미지원** → §5.1 세션 전환의 원자성 확보 불가 | High | High | 세션 전환을 CTE 단일 SQL 문장으로 작성(UPDATE ... RETURNING + INSERT를 하나의 statement로). 불가하면 `@neondatabase/serverless` Pool(WebSocket) 드라이버로 전환. **Design 단계에서 반드시 확정** |
| R2 | 부분 유니크 인덱스 위반이 사용자에게 500 에러로 노출 | Medium | Medium | 유니크 위반 에러코드(23505)를 잡아 "이미 진행 중인 세션이 있습니다"로 변환 |
| R3 | 순서변경 재인덱싱 중 동시 곡 추가 → position 충돌 | Medium | Low | 재인덱싱을 단일 문장으로 처리하고 응답 후 목록 재검증. 1인 사용이라 실제 발생 확률 낮음 |
| R4 | 서버리스 콜드스타트로 현장 입력 체감 지연 | Medium | Medium | Neon HTTP 드라이버 사용(커넥션 핸드셰이크 없음), 오늘의 플리 화면 낙관적 업데이트 |
| R5 | 번호 stub 곡이 title NULL이라 목록에서 식별 불가 | Low | High | 목록에서 title이 NULL이면 "#번호"로 표기. 결손 회수는 M3 빈칸채우기 큐 담당 |
| R6 | 부트스트랩 + M1 통합으로 사이클이 커져 Check 단계가 흐려짐 | Medium | Medium | Design §11에서 모듈 5개로 분할하고 모듈 단위 커밋(CONTRIBUTING 규약) |
| R7 | Clerk userId(text)를 owner_id로 쓰므로 인증 교체 시 마이그레이션 부담 | Low | Low | 수용. ARCHITECT 결정사항 |

---

## 6. Impact Analysis

### 6.1 변경 리소스

| 리소스 | 유형 | 변경 내용 |
| --- | --- | --- |
| 저장소 전체 | 신규 | 빈 저장소에 Next.js 15 프로젝트 생성 |
| `songs` / `song_numbers` / `sessions` / `entries` | DB 스키마 | 신규 생성 |
| `/api/sessions`, `/api/entries` 계열 | API | 신규 생성 |
| Neon 프로젝트 · Vercel 프로젝트 · Clerk 애플리케이션 | 외부 리소스 | 신규 프로비저닝 |
| DNS `sing-diary.spiritflag.work` | 인프라 | 신규 레코드 |

### 6.2 기존 소비자

**없다.** 그린필드 프로젝트로 커밋이 0건이므로 기존 코드 경로가 존재하지 않는다.
단, 아래는 이번 사이클이 후속 마일스톤에 남기는 **하향 계약**이므로 Design 단계에서 고정한다.

| 리소스 | 후속 소비자 | 유의점 |
| --- | --- | --- |
| `songs` (title NULL 허용) | M3 빈칸채우기 큐 B | stub 생성 시 title을 빈 문자열이 아닌 NULL로 저장해야 큐 쿼리(§5.6)에 잡힌다 |
| `song_numbers` 부재 행 | M3 빈칸채우기 큐 A | 미입력을 "행 없음"으로 표현. UNSUPPORTED 행을 임의 생성하지 말 것 |
| `sessions.is_public` | M3 공개 설정 | 컬럼 생성하되 항상 false |
| `idx_songs_trgm` | M2 통합검색 | M1에서 미리 생성 |
| API 라우트 형태 | "이후" MCP 서버화 | 도메인 로직을 라우트 핸들러가 아닌 `lib/` 레이어에 두어 재사용 가능하게 유지 |

### 6.3 검증

- [ ] 스키마가 ARCHITECT §4와 컬럼·제약 단위로 일치
- [ ] M2·M3가 요구하는 결손 표현 규약(NULL / 행 없음)을 위반하지 않음
- [ ] 모든 API가 Clerk userId로 owner 스코프를 적용

---

## 7. Architecture Considerations

### 7.1 프로젝트 레벨

| 레벨 | 특성 | 선택 |
| --- | --- | :-: |
| Starter | 단순 구조 | ☐ |
| **Dynamic** | 기능 단위 모듈, 백엔드 연동 | ☑ |
| Enterprise | 엄격한 레이어 분리, DI | ☐ |

Neon·Clerk를 쓰는 풀스택 웹앱이므로 Dynamic. 단 BaaS는 bkend.ai가 아닌 Neon + 자체 서버리스 API다.

### 7.2 주요 아키텍처 결정

| 결정 | 선택 | 근거 |
| --- | --- | --- |
| 프레임워크 | Next.js 15 App Router | ARCHITECT §1 |
| **서버↔클라이언트 경로** | **Route Handlers (`/api/*`, Vercel 서버리스)** | 사용자 결정. Server Action 대비 계약이 명시적이고, ARCHITECT §7 "이후"의 MCP 서버화·외부 연동 경로가 그대로 열린다 |
| ORM | Drizzle | ARCHITECT §1 |
| DB 드라이버 | Neon serverless (HTTP 우선, 트랜잭션 필요 시 Pool) | R1 참조. Design에서 확정 |
| 인증 | Clerk (middleware 기반 라우트 보호) | ARCHITECT §1 |
| 상태 관리 | 별도 전역 스토어 없음 — 서버 컴포넌트 + `useOptimistic` | 화면 수가 적고 상태가 서버 소유. 과한 도입 회피 |
| 데이터 페칭 | 서버 컴포넌트 초기 렌더 + 변경은 fetch → `router.refresh()` | 라이브러리 추가 없이 M1 규모에 충분 |
| 폼 | native form + zod 검증 | 필드 수가 적음 |
| 순서변경 | dnd-kit | 사용자 결정. 모바일 터치·접근성 대응 |
| 스타일 | Tailwind CSS, 다크 파스텔 토큰 | ARCHITECT §1 |
| 테스트 | Vitest (DB 불변식·도메인 로직) | 불변식 검증에 초점 |
| 배포 | Vercel + 커스텀 도메인 | ARCHITECT §1 |

### 7.3 폴더 구조 예정 (Design에서 대체됨)

> **개정 안내**: Design 단계 Checkpoint 3에서 사용자가 B안(클린 아키텍처)을 선택하여
> 아래 스케치는 [first-take.design.md](./first-take.design.md) §9의 4계층 구조로 대체되었다.

```
src/
  app/
    (auth)/               로그인 관련
    (app)/
      page.tsx            오늘의 플리
      sessions/new/       세션 생성
    api/
      sessions/           POST(생성=이전종료+신규), GET current
      sessions/[id]/entries/       POST(곡추가), PUT(순서변경)
      entries/[id]/       PATCH(점수), DELETE
  lib/
    db/                   drizzle 클라이언트, schema.ts
    domain/               세션 전환·곡 해석·재인덱싱 (MCP 재사용 대비)
    auth.ts               Clerk userId 취득 + owner 스코프 헬퍼
  components/
drizzle/                  마이그레이션 SQL
```

도메인 로직을 `lib/domain/`에 두어 라우트 핸들러를 얇게 유지한다 — §6.2의 MCP 서버화 대비.

---

## 8. Convention Prerequisites

### 8.1 기존 컨벤션 현황

- [x] `.claude/CLAUDE.md` 존재 (대화 규칙, 코딩 컨벤션은 없음)
- [x] `CONTRIBUTING.md` 존재 (브랜치·커밋 규약)
- [x] `docs/RULE.md` 존재 (문서 규약)
- [ ] ESLint / Prettier / tsconfig — 없음, 본 사이클에서 생성

### 8.2 정의할 컨벤션

| 범주 | 현황 | 정의할 내용 | 우선순위 |
| --- | --- | --- | :-: |
| 네이밍 | 없음 | DB snake_case ↔ TS camelCase 매핑을 Drizzle 스키마에서 단일 지점으로 처리 | High |
| 폴더 구조 | 없음 | §7.3 확정 | High |
| 색상 토큰 | 없음 | 다크 파스텔 팔레트를 Tailwind theme에 정의, 임의 색상 금지 | High |
| 에러 처리 | 없음 | API 응답 형태 `{ data }` / `{ error }` 통일, PG 에러코드 → 사용자 메시지 매핑 | High |
| 환경변수 | 없음 | §8.3 | High |

### 8.3 필요한 환경변수

| 변수 | 용도 | 범위 |
| --- | --- | --- |
| `DATABASE_URL` | Neon 연결 문자열 | Server |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk 클라이언트 키 | Client |
| `CLERK_SECRET_KEY` | Clerk 서버 키 | Server |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `_SIGN_UP_URL` | 인증 라우트 | Client |
| `PDCAW_PAT` | 사이클 종료 시 문서 업로드 (`.env.local`, RULE.md §종료절차) | Local only |

`.pdcarc.json`(baseUrl/projectId)은 저장소에 커밋한다 — RULE.md 종료 절차 3.

---

## 9. Next Steps

1. [ ] `first-take.design.md` 작성 — 특히 R1(트랜잭션 전략), API 계약, 모듈 5분할 확정
2. [ ] develop 브랜치 생성 후 모듈 단위 구현 (CONTRIBUTING 규약)
3. [ ] `first-take.analysis.md` Gap 분석
4. [ ] `first-take.report.md` 및 사이클 종료 절차 (RULE.md §종료절차, 태그 v0.1.0 예정)

---

## Version History

| 버전 | 날짜 | 변경 | 작성자 |
| --- | --- | --- | --- |
| 0.1 | 2026-08-23 | 최초 작성. ARCHITECT.md M1 + 부트스트랩을 first-take 사이클로 확정 | Claude |
| 0.2 | 2026-08-23 | Design에서 B안(클린 아키텍처) 선택됨에 따라 §7.3 폴더 구조를 Design §9로 대체 표기 | Claude |
