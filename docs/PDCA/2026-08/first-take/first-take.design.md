# first-take 설계서

> **요약**: 클린 아키텍처 4계층으로 sing-diary M1(부트스트랩 + 세션 + 오늘의 플리)을 설계한다.
>
> **프로젝트**: sing-diary
> **버전**: v0.1.0 (예정)
> **사이클**: first-take
> **작성일**: 2026-08-23
> **상태**: Draft
> **계획서**: [first-take.plan.md](./first-take.plan.md)

---

## Context Anchor

| Key | Value |
| --- | --- |
| **WHY** | 노래방 기록이 휘발된다. 기록할 도구 자체가 존재하지 않는다. |
| **WHO** | sing-diary 사용자 본인(1인). 모바일 현장 기록이 주 사용 맥락. |
| **RISK** | Neon HTTP 드라이버가 다중 문장 트랜잭션을 지원하지 않아 §5.1 세션 전환의 원자성이 깨질 수 있다. → **본 설계에서 WebSocket Pool + `db.transaction()`으로 해소 확정** |
| **SUCCESS** | 실제 노래방 방문 1회를 이 앱만으로 기록 완료. DB 불변식 4종이 테스트로 강제됨. |
| **SCOPE** | 부트스트랩 → 스키마/인증 → 세션 API → 오늘의 플리 UI → 순서변경 → 배포 |

---

## 1. Overview

### 1.1 설계 목표

1. ARCHITECT.md §4 스키마와 §5 핵심 플로우를 **컬럼·제약 단위로 일치**하게 구현한다.
2. 도메인 규칙(세션 단일성, 번호 3-state, position 연속성)을 **DB 제약 + 도메인 계층** 이중으로 방어한다.
3. 향후 MCP 서버화(ARCHITECT §7 "이후")를 위해 유스케이스 계층을 **전송 방식(HTTP)과 무관**하게 만든다.

### 1.2 설계 원칙

- **의존성은 안쪽으로만.** Domain은 무의존, Application은 Domain만, Infrastructure·Presentation이 바깥에서 구현을 공급한다.
- **불변식은 DB가 최종 방어선.** 애플리케이션 검증은 UX를 위한 조기 실패일 뿐, 강제는 제약조건이 한다 (ARCHITECT §2-3).
- **현장 입력 최소.** 모든 쓰기 API는 1 왕복으로 끝난다. 곡 추가는 번호 하나로 stub 생성까지 원자 처리 (ARCHITECT §2-2).

---

## 2. Architecture Options

### 2.0 설계안 비교 (Checkpoint 3 완료)

| 기준 | A안: 최소 구현 | **B안: 클린 아키텍처** | C안: 실용 절충 |
| --- | :-: | :-: | :-: |
| 접근 | 라우트에 쿼리 직행 | 4계층 + 포트/어댑터 | 얇은 라우트 + lib/domain |
| 신규 파일 | ~25 | ~45 | ~32 |
| 복잡도 | 낮음 | 높음 | 중간 |
| 유지보수성 | 낮음 | 높음 | 높음 |
| 공수 | 낮음 | 높음 | 중간 |

**선택**: **B안 — 클린 아키텍처** (사용자 결정, Checkpoint 3).
**근거**: MCP 서버화·기능 확장(M2 검색, M3 큐)을 앞두고 유스케이스를 전송 계층에서 완전히 분리해 둔다. 공수 증가는 수용한다. 이에 따라 Plan §7.3의 폴더 구조 스케치는 본 문서 §9로 대체된다.

### 2.1 컴포넌트 다이어그램

```
┌──────────────────────────── Presentation ────────────────────────────┐
│  RSC 페이지 (오늘의 플리 / 세션 생성)      Route Handlers (/api/*)   │
│  클라이언트 컴포넌트 (dnd, 인라인 입력)                              │
└──────────────┬───────────────────────────────────┬───────────────────┘
               │ 호출                               │ 호출
┌──────────────▼───────────── Application ─────────▼───────────────────┐
│  use-cases: startSession / getCurrentSession / addEntryByNumber      │
│             updateEntryScore / reorderEntries / deleteEntry          │
│  ports: SessionRepo · SongRepo · EntryRepo · TransactionRunner       │
└──────────────┬───────────────────────────────────────────────────────┘
               │ 인터페이스 (구현은 주입)
┌──────────────▼──────────── Infrastructure ───────────────────────────┐
│  Drizzle 리포지토리 구현 · Neon Pool(WebSocket) · Clerk 어댑터       │
└──────────────┬───────────────────────────────────────────────────────┘
               ▼
        Neon PostgreSQL          ※ Domain(엔티티·불변식·에러)은 전 계층이 참조
```

### 2.2 데이터 흐름 — 대표: 번호로 곡 추가 (ARCHITECT §5.3)

```
[번호 입력] → POST /api/sessions/{id}/entries
 → zod 검증 (Presentation)
 → addEntryByNumber (Application, TransactionRunner 안에서)
    1. 세션 조회 + owner 검증 + 열린 세션 확인
    2. SongRepo.findByBrandNumber(brand, number)
    3. 없으면: SongRepo.createStub(title=NULL) + song_numbers(AVAILABLE)
    4. EntryRepo.append(sessionId, songId)  — position = max+1
 → { data: entry } 반환 → 클라이언트 낙관적 목록 갱신
```

### 2.3 의존성

| 컴포넌트 | 의존 대상 | 목적 |
| --- | --- | --- |
| Presentation | Application(use-cases), Domain(타입·에러) | 유스케이스 호출, 에러 매핑 |
| Application | Domain, ports(자기 소유 인터페이스) | 비즈니스 규칙 조율 |
| Infrastructure | Domain, Application ports | 포트 구현 |
| Domain | 없음 (순수 TS) | 엔티티·불변식·도메인 에러 |

| 외부 패키지 | 용도 |
| --- | --- |
| `next@15` `react@19` | 프레임워크 |
| `drizzle-orm` `drizzle-kit` | ORM·마이그레이션 |
| `@neondatabase/serverless` + `ws` | **Pool(WebSocket) 드라이버 — R1 해소** |
| `@clerk/nextjs` | 인증 |
| `zod` | 입력 검증 |
| `@dnd-kit/core` `@dnd-kit/sortable` | 순서변경 |
| `tailwindcss@4` | 스타일 |
| `vitest` | 테스트 |

---

## 3. Data Model

### 3.1 도메인 엔티티 (`src/domain/`)

```typescript
// src/domain/song.ts
type Brand = 'TJ' | 'KY';
type NumberStatus = 'AVAILABLE' | 'UNSUPPORTED';

interface Song {
  id: string;
  ownerId: string;
  title: string | null;      // NULL = stub (M3 큐 B 대상)
  artist: string | null;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SongNumber {
  songId: string;
  brand: Brand;
  number: string | null;     // AVAILABLE이면 필수 (CHECK로 강제)
  status: NumberStatus;
}

// src/domain/session.ts
interface Session {
  id: string;
  ownerId: string;
  visitDate: string;         // date (YYYY-MM-DD)
  venue: string;
  brand: Brand;
  isPublic: boolean;         // M1에서는 항상 false
  closedAt: Date | null;     // NULL = 진행 중
  createdAt: Date;
}

// src/domain/entry.ts
interface Entry {
  id: string;
  sessionId: string;
  songId: string;
  position: number;          // 1..N
  score: string | null;      // numeric(5,2) — 정밀도 보존 위해 string
  createdAt: Date;
}
```

```typescript
// src/domain/errors.ts — 도메인 에러 (HTTP 무관)
class DomainError extends Error { code: DomainErrorCode }
type DomainErrorCode =
  | 'SESSION_NOT_FOUND'      // 세션 없음/타인 소유
  | 'SESSION_CLOSED'         // 닫힌 세션에 쓰기 시도
  | 'ENTRY_NOT_FOUND'
  | 'INVALID_SCORE'          // 0..100 범위 밖
  | 'INVALID_POSITION_SET';  // 재정렬 id 집합 불일치
```

### 3.2 관계

```
User(Clerk userId, 테이블 없음)
 ├─ 1..N Song ─ 0..2 SongNumber (brand별 최대 1행)
 └─ 1..N Session ─ 0..N Entry ─▶ Song (RESTRICT)
```

### 3.3 DB 스키마 — ARCHITECT §4 전사 (`src/infrastructure/db/schema.ts` + 마이그레이션 SQL)

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE brand_enum    AS ENUM ('TJ', 'KY');
CREATE TYPE number_status AS ENUM ('AVAILABLE', 'UNSUPPORTED');

CREATE TABLE songs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   text NOT NULL,
  title      text,
  artist     text,
  memo       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_songs_owner ON songs (owner_id);
CREATE INDEX idx_songs_trgm  ON songs
  USING gin ((coalesce(title,'') || ' ' || coalesce(artist,'') || ' ' || coalesce(memo,'')) gin_trgm_ops);
  -- M2 통합검색 대비 선반영 (Plan §6.2)

CREATE TABLE song_numbers (
  song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  brand   brand_enum NOT NULL,
  number  text,
  status  number_status NOT NULL,
  PRIMARY KEY (song_id, brand),
  CHECK (status <> 'AVAILABLE' OR number IS NOT NULL)
);

CREATE TABLE sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   text NOT NULL,
  visit_date date NOT NULL,
  venue      text NOT NULL,
  brand      brand_enum NOT NULL,
  is_public  boolean NOT NULL DEFAULT false,
  closed_at  timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX  idx_sessions_owner_date ON sessions (owner_id, visit_date DESC);
CREATE UNIQUE INDEX idx_sessions_open ON sessions (owner_id) WHERE closed_at IS NULL;

CREATE TABLE entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  song_id    uuid NOT NULL REFERENCES songs(id) ON DELETE RESTRICT,
  position   int  NOT NULL,
  score      numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_entries_session ON entries (session_id, position);
```

**ARCHITECT 대비 결정 사항**

| 항목 | 결정 | 근거 |
| --- | --- | --- |
| trgm 인덱스 형태 | 결합 표현식 단일 GIN | ARCHITECT는 "GIN (title, artist, memo)"로 표기했으나 다컬럼 trgm GIN은 컬럼별 연산자클래스가 필요하다. M2 통합검색이 "하나라도 매칭"(§5.7)이므로 결합 표현식이 쿼리와도 맞다. M2에서 재평가 |
| `updated_at` 갱신 | 애플리케이션에서 set | 트리거 도입은 M1 과잉 |
| score 표현 | TS에서 string | numeric 정밀도를 float 변환 없이 보존 |

### 3.4 트랜잭션 전략 — R1 해소 (v0.4 개정)

| 항목 | 결정 |
| --- | --- |
| 읽기 드라이버 | `@neondatabase/serverless`의 `neon()` **HTTP**(무상태) — `drizzle-orm/neon-http` |
| 쓰기(트랜잭션) 드라이버 | **`pg` (node-postgres, 순수 TCP)** — `drizzle-orm/node-postgres`. 요청마다 `new Client()` → `connect()` → 트랜잭션 → `end()` |
| 트랜잭션 경계 | **Application 계층**이 `TransactionRunner.run(fn)` 포트로 소유. Presentation·Infrastructure는 경계를 만들지 않는다 |
| 적용 유스케이스 | `startSession`(UPDATE+INSERT), `addEntryByNumber`(stub 생성 시 3-INSERT), `reorderEntries`(전체 재부여) |
| 격리 수준 | 기본 READ COMMITTED. 세션 단일성은 부분 유니크 인덱스가 직렬화 없이도 보장 |

**개정 이력 (프로덕션 장애 대응)**

1. **v0.1(최초)**: `neon-serverless` Pool(WebSocket, 모듈 싱글턴) + `db.transaction()`. 로컬·테스트는 통과했으나 프로덕션 Vercel에서 `Connection terminated unexpectedly` — 싱글턴 Pool이 서버리스 함수 freeze/thaw 사이에 죽은 채 재사용됨.
2. **v0.2~0.3**: 읽기를 `neon-http`로 분리하고, 쓰기는 **요청마다 새로 만드는** `neon-serverless` Pool로 유지. 읽기 경로(`/`)는 고쳐졌으나, 쓰기 경로(`POST /api/sessions`)에서 `TypeError: b.mask is not a function`(Uncaught Exception, 프로세스 종료)로 재발 — Pool을 요청마다 새로 만들어도 안 됐다. 원인은 재사용이 아니라 **freeze 자체**: `ws`가 내부적으로 스케줄하는 heartbeat 타이머가 함수가 얼어있는 동안 발화해 이미 종료된 소켓에 프레임을 쓰려다 터진다.
3. **v0.4(현재)**: `ws` 기반 WebSocket을 완전히 배제하고 **순수 TCP(`pg`)** 로 전환. 백그라운드 타이머를 스케줄하지 않는 일반 Postgres 클라이언트라 freeze/thaw와 무관하다 — 서버리스+Postgres에서 검증된 표준 패턴(요청당 connect/end, 커넥션 재사용 없음).

`DATABASE_URL`은 여전히 Neon **pooled connection string**(PgBouncer, `-pooler` 호스트)을 그대로 쓴다 — `pg.Client`가 그 앞단의 PgBouncer에 짧게 붙었다 끊는 것이므로 문제 없음.

```typescript
// src/application/ports/transaction.ts
interface TransactionRunner {
  run<T>(fn: (repos: TxRepos) => Promise<T>): Promise<T>;
}
interface TxRepos {
  sessions: SessionRepo;
  songs: SongRepo;
  entries: EntryRepo;
}
```

---

## 4. API Specification

### 4.1 엔드포인트 목록

| Method | Path | 설명 | 인증 | 유스케이스 |
| --- | --- | --- | :-: | --- |
| GET | `/api/sessions/current` | 진행 중 세션 + entries(+곡 정보) | 필수 | getCurrentSession |
| POST | `/api/sessions` | 세션 생성 (열린 세션 자동 종료) | 필수 | startSession |
| POST | `/api/sessions/:id/entries` | 번호로 곡 추가 (stub 자동 생성) | 필수 | addEntryByNumber |
| PUT | `/api/sessions/:id/entries/order` | 순서 재부여 | 필수 | reorderEntries |
| PATCH | `/api/entries/:id` | 점수 수정 | 필수 | updateEntryScore |
| DELETE | `/api/entries/:id` | entry 삭제 | 필수 | deleteEntry |

모든 엔드포인트는 Clerk 미들웨어 뒤에 있으며, `owner_id = auth().userId` 스코프를 유스케이스가 강제한다.
응답 형태는 성공 `{ data }`, 실패 `{ error: { code, message, details? } }`로 통일한다.

### 4.2 상세 명세

#### `GET /api/sessions/current`

> **의도적으로 미사용 상태로 유지**: `(app)/page.tsx`·`layout.tsx`는 §7 데이터 페칭 결정에 따라
> 이 라우트를 거치지 않고 `getCurrentSession` 유스케이스를 RSC에서 직접 호출한다. 이 엔드포인트는
> ARCHITECT §7 "이후" 로드맵(MCP 서버화, 모바일/외부 클라이언트)을 위해 계약을 미리 굳혀둔 것 —
> Analysis(§2.6, v0.1)에서 "호출자 없음"으로 플래그됐으나 삭제하지 않기로 확정(2026-08-23).

**Response 200:**
```json
{
  "data": {
    "session": { "id": "…", "visitDate": "2026-08-23", "venue": "수노래방", "brand": "TJ", "closedAt": null },
    "entries": [
      {
        "id": "…", "position": 1, "score": "97.52",
        "song": { "id": "…", "title": "곡명 또는 null", "number": "12345" }
      }
    ]
  }
}
```
- `entries[].song.number`: 세션 브랜드 기준 song_numbers의 번호 (없으면 null)
- 진행 중 세션 없음 → `{ "data": null }` (에러 아님 — 첫 화면의 정상 상태)

#### `POST /api/sessions`

**Request:** `{ "visitDate": "2026-08-23", "venue": "수노래방 강남점", "brand": "TJ" }`
- zod: visitDate는 `YYYY-MM-DD`, venue 1..100자, brand는 enum

**Response 201:** `{ "data": { ...session } }`
**트랜잭션:** `UPDATE sessions SET closed_at=now() WHERE owner_id=$u AND closed_at IS NULL` → `INSERT` (ARCHITECT §5.1 그대로)
**Error:** 유니크 위반(23505) 발생 시 트랜잭션 재시도 1회 후 `409 SESSION_CONFLICT` — 정상 경로에서는 도달 불가

#### `POST /api/sessions/:id/entries`

**Request:** `{ "number": "12345" }`
- zod: number 1..10자, 숫자 문자열

**Response 201:**
```json
{ "data": { "id": "…", "position": 4, "score": null, "song": { "id": "…", "title": null, "number": "12345" }, "isNewStub": true } }
```
- `isNewStub`: stub이 새로 생성됐는지 — UI가 "새 곡으로 등록됨" 배지 표시
**트랜잭션 내부:** ① 세션 owner·open 검증(닫힘 → 409 SESSION_CLOSED) ② (세션 brand, number)로 `song_numbers JOIN songs(owner)` 검색 ③ 없으면 songs(title NULL) + song_numbers(AVAILABLE, number) 생성 — **title은 반드시 NULL, 빈 문자열 금지** (Plan §6.2 하향 계약) ④ `position = coalesce(max,0)+1`로 entry INSERT
**중복 허용:** 같은 곡 재추가 가능 (ARCHITECT §4.4)

#### `PUT /api/sessions/:id/entries/order`

**Request:** `{ "entryIds": ["e3", "e1", "e2"] }` — 새 순서의 전체 id 배열
- 검증: 배열이 해당 세션 entries 집합과 **정확히 일치**해야 함 (아니면 400 INVALID_POSITION_SET — 드래그 중 다른 기기에서 추가된 경우)

**Response 200:** `{ "data": { "entries": [ ...position 재부여된 목록 ] } }`
**트랜잭션 내부:** 충돌 없는 재부여를 위해 2단계 — ① `position = position + 1000` 시프트 ② 배열 순서대로 1..N UPDATE

#### `PATCH /api/entries/:id`

**Request:** `{ "score": 97.52 }` 또는 `{ "score": null }` (미채점/오류로 되돌림)
- zod: null 또는 0 ≤ score ≤ 100, 소수 2자리까지

**Response 200:** `{ "data": { ...entry } }`
- owner 검증은 entry → session JOIN으로. 닫힌 세션의 entry도 점수 수정 허용 (사후 정리 용도)

#### `DELETE /api/entries/:id`

**Response 200:** `{ "data": { "deletedId": "…" } }`
- 삭제 후 해당 세션 position 1..N 재부여 (트랜잭션)

### 4.3 공통 에러

| HTTP | code | 상황 |
| :-: | --- | --- |
| 400 | `VALIDATION_ERROR` | zod 실패. `details.fieldErrors` 포함 |
| 401 | `UNAUTHORIZED` | Clerk 미인증 |
| 404 | `SESSION_NOT_FOUND` / `ENTRY_NOT_FOUND` | 없거나 타인 소유 (존재 노출 방지 위해 403 대신 404) |
| 409 | `SESSION_CLOSED` / `SESSION_CONFLICT` | 닫힌 세션 쓰기 / 세션 생성 경합 |
| 500 | `INTERNAL_ERROR` | 그 외. PG 에러코드는 로그에만 |

---

## 5. UI/UX Design

### 5.1 색상 토큰 — 다크 파스텔 (Tailwind theme)

| 토큰 | 값(초안) | 용도 |
| --- | --- | --- |
| `bg` | `#1a1625` | 페이지 배경 (딥 퍼플 블랙) |
| `surface` | `#241f33` | 카드·목록 행 |
| `surface-raised` | `#2e2842` | 입력·호버 |
| `primary` | `#b8a7e9` | 파스텔 라벤더 — 주 동작 |
| `accent` | `#f2a7c3` | 파스텔 핑크 — 점수·강조 |
| `mint` | `#a7e9c3` | 파스텔 민트 — 성공·신곡 배지 |
| `text` | `#ede9f7` | 본문 |
| `text-dim` | `#9a92b0` | 보조 텍스트 |
| `danger` | `#e9a7a7` | 삭제·에러 |

임의 hex 사용 금지 — 전 컴포넌트가 토큰만 참조한다 (Plan NFR "하드코딩 색상 0건").

### 5.2 사용자 흐름

```
로그인(Clerk)
 → / 진입
    ├─ 열린 세션 없음 → 빈 상태 + [세션 시작] → /sessions/new → 생성 → /
    └─ 열린 세션 있음 → 오늘의 플리
         ├─ 번호 입력 → 추가 (기존곡이면 제목 표시, 신곡이면 "#번호 · 새 곡" 배지)
         ├─ 점수 칸 탭 → 인라인 입력 → blur/엔터 시 저장
         ├─ 핸들 드래그 → 순서변경 → 저장
         └─ 스와이프/버튼 → 삭제
```

### 5.3 컴포넌트 목록

| 컴포넌트 | 위치 | 책임 | 유형 |
| --- | --- | --- | --- |
| `TodayPage` | `presentation/app/(app)/page.tsx` | 현재 세션 SSR 조회 · 분기 | RSC |
| `EmptyToday` | `presentation/components/session/` | 빈 상태 + 세션 시작 CTA | RSC |
| `NewSessionForm` | `presentation/components/session/` | 날짜(기본 오늘)·지점·브랜드 폼 | Client |
| `Playlist` | `presentation/components/playlist/` | entries 상태 소유 · dnd 컨텍스트 · 낙관적 갱신 | Client |
| `EntryRow` | `presentation/components/playlist/` | 순번·제목(null→`#번호`)·번호·점수·삭제 | Client |
| `ScoreInput` | `presentation/components/playlist/` | 인라인 numeric 입력, null 허용 | Client |
| `AddByNumber` | `presentation/components/playlist/` | 하단 고정 번호 입력 바 | Client |
| `AppHeader` | `presentation/components/` | 세션 정보(지점·브랜드 칩)·UserButton | RSC |

### 5.4 Page UI Checklist

#### 오늘의 플리 `/` (세션 있음)

- [ ] 헤더: venue 텍스트 + 브랜드 칩(TJ/KY) + visit_date
- [ ] 목록: EntryRow × N — 순번, 곡 제목(title NULL이면 `#<번호>` 표기), 브랜드 번호, 점수, 드래그 핸들, 삭제 버튼
- [ ] 점수: 미채점이면 `—` 표시, 탭하면 인라인 입력(inputmode="decimal"), 소수 2자리, 빈값 저장 = null
- [ ] 신곡 배지: `isNewStub` 응답 시 "새 곡" 민트 배지
- [ ] 하단 고정 바: 번호 입력(inputmode="numeric") + 추가 버튼, 제출 후 입력 초기화·포커스 유지
- [ ] 드래그: dnd-kit sortable, 핸들 터치 시작, 드롭 시 PUT order 호출, 실패 시 원복 + 토스트
- [ ] 낙관적 갱신: 추가·점수·삭제·순서 모두 즉시 반영 후 실패 시 원복
- [ ] 빈 목록 상태: "번호를 입력해 첫 곡을 추가하세요" 안내

#### 오늘의 플리 `/` (세션 없음)

- [ ] 빈 상태 일러스트/문구 + [세션 시작] 버튼 → `/sessions/new`

#### 세션 생성 `/sessions/new`

- [ ] 날짜 입력 (기본값 오늘, date picker)
- [ ] 지점 입력 (text, 1..100자)
- [ ] 브랜드 선택 (TJ/KY 세그먼트 토글, 기본 미선택·필수)
- [ ] 제출 버튼: "시작하기" — 성공 시 `/`로 이동
- [ ] 열린 세션 존재 시 경고 문구: "진행 중인 플리는 자동으로 마감됩니다"

#### 인증

- [ ] 미로그인 → Clerk 로그인 화면 리다이렉트, 로그인 후 `/` 복귀

---

## 6. Error Handling

### 6.1 에러 매핑 (Presentation 단일 지점)

`presentation/api/error-mapper.ts` 하나가 DomainError·ZodError·PG 에러를 §4.3 표로 변환한다.
라우트 핸들러는 `try { … } catch (e) { return mapError(e) }` 패턴만 사용.

| 원천 | 변환 |
| --- | --- |
| `ZodError` | 400 `VALIDATION_ERROR` + fieldErrors |
| `DomainError` | code별 4.3 표의 HTTP 코드 |
| PG `23505` (idx_sessions_open) | 재시도 1회 → 실패 시 409 `SESSION_CONFLICT` |
| PG `23503` (entries→songs RESTRICT) | 409 (M1 UI에는 곡 삭제가 없어 도달 불가, 방어만) |
| 기타 | 500 `INTERNAL_ERROR`, 상세는 서버 로그만 |

### 6.2 클라이언트 처리

- 낙관적 갱신 실패 → 이전 상태 원복 + 토스트 (danger 토큰)
- 401 → Clerk 로그인으로 리다이렉트
- `SESSION_CLOSED` → "이미 마감된 플리입니다" 토스트 + `router.refresh()`

---

## 7. Security Considerations

- [x] **owner 스코프**: 모든 유스케이스 첫 단계에서 `ownerId` 필터. 리포지토리 메서드 시그니처에 `ownerId` 필수 인자로 강제
- [x] **입력 검증**: 전 엔드포인트 zod. SQL은 Drizzle 파라미터 바인딩만
- [x] **인증**: `clerkMiddleware`로 `/` 이하 전체 보호, API는 `auth().userId` 부재 시 401
- [x] **존재 노출 방지**: 타인 리소스는 403이 아닌 404
- [x] **XSS**: React 기본 이스케이프, `dangerouslySetInnerHTML` 금지
- [ ] Rate Limiting: M1 제외 (1인 사용, Vercel 기본 방어에 위임) — 결정 기록

---

## 8. Test Plan

> Plan 결정: 전체 커버리지 목표 없음. **DB 불변식 4종 + 핵심 플로우 집중** (Vitest, 실 Neon 브랜치 DB 대상).
> 테스트 코드는 Do 단계에서 모듈과 함께 작성한다. L2/L3는 배포본 수동 검증으로 대체한다 (Playwright 미도입 — 결정 기록).

### 8.1 테스트 범위

| 유형 | 대상 | 도구 | 단계 |
| --- | --- | --- | --- |
| INV: DB 불변식 | 제약조건 4종 (Plan §4.1) | Vitest + 테스트 DB | Do (module-2) |
| UC: 유스케이스 | 6개 유스케이스 핵심 경로 | Vitest + 테스트 DB | Do (module-3) |
| L1: API | 엔드포인트 상태코드·응답 형태 | curl (로컬 dev 서버) | Check |
| 수동: UI/E2E | §5.4 체크리스트 + 배포본 전 구간 | 사람 | Check |

### 8.2 INV: 불변식 테스트 (Plan §4.1의 4종)

| # | 시나리오 | 기대 |
| :-: | --- | --- |
| INV-1 | 열린 세션 보유 상태에서 `closed_at IS NULL` 세션 raw INSERT | PG 23505 (idx_sessions_open) |
| INV-2 | `song_numbers(status='AVAILABLE', number=NULL)` INSERT | CHECK 위반 |
| INV-3 | `startSession` 2회 연속 호출 | 1회차 세션 closed_at 설정 + 2회차 세션만 열림 |
| INV-4 | 5개 entry 재정렬 + 1개 삭제 후 | position 집합 = 정확히 {1..N} |

### 8.3 UC: 유스케이스 테스트

| # | 유스케이스 | 시나리오 | 기대 |
| :-: | --- | --- | --- |
| UC-1 | addEntryByNumber | 미등록 번호 | stub 생성(title IS NULL) + song_numbers(AVAILABLE) + entry position=1, isNewStub=true |
| UC-2 | addEntryByNumber | 기존 곡 번호 | 새 songs 행 없음, entry만 추가 |
| UC-3 | addEntryByNumber | 같은 번호 2회 | entry 2건 (중복 허용, ARCHITECT §4.4) |
| UC-4 | addEntryByNumber | 닫힌 세션에 | SESSION_CLOSED |
| UC-5 | addEntryByNumber | 타인 세션에 | SESSION_NOT_FOUND |
| UC-6 | updateEntryScore | 97.52 / null / 150 | 저장 / null 저장 / INVALID_SCORE |
| UC-7 | reorderEntries | 목록과 불일치 id 배열 | INVALID_POSITION_SET |
| UC-8 | getCurrentSession | 열린 세션 없음 | null (에러 아님) |

### 8.4 L1: API 테스트 시나리오 (Check 단계 curl)

| # | 엔드포인트 | 케이스 | 기대 |
| :-: | --- | --- | :-: |
| 1 | GET /api/sessions/current | 미인증 | 401 |
| 2 | POST /api/sessions | brand='XX' | 400 + fieldErrors |
| 3 | POST /api/sessions | 정상 | 201, data.id |
| 4 | POST /api/sessions/:id/entries | number='' | 400 |
| 5 | POST /api/sessions/:id/entries | 정상 | 201, data.position |
| 6 | PATCH /api/entries/:id | score=101 | 400 |
| 7 | PUT …/entries/order | id 누락 배열 | 400 INVALID_POSITION_SET |
| 8 | DELETE /api/entries/:id | 정상 | 200 후 GET에서 position 연속 |

### 8.5 시드 데이터

| 엔티티 | 최소 | 필수 필드 |
| --- | :-: | --- |
| 테스트 사용자 | 2 | Clerk userId 문자열 2개 (mock — 'user_a', 'user_b') |
| songs | 3 | 정상 곡 1(TJ+KY 번호), stub 1(title NULL), 타인 소유 1 |
| sessions | 2 | user_a 열린 세션 1, 닫힌 세션 1 |
| entries | 3 | 열린 세션에 position 1..3 |

`src/infrastructure/db/seed.ts` — module-2에서 구현, 테스트 setup에서 호출.

---

## 9. Clean Architecture

### 9.1 계층 구조 (B안 확정)

| 계층 | 책임 | 위치 |
| --- | --- | --- |
| **Domain** | 엔티티 타입·도메인 에러·순수 검증(점수 범위 등) | `src/domain/` |
| **Application** | 유스케이스 6종, 포트 인터페이스 | `src/application/` |
| **Infrastructure** | Drizzle 리포지토리, Neon Pool, 스키마, 시드 | `src/infrastructure/` |
| **Presentation** | App Router 페이지·라우트 핸들러·컴포넌트·에러 매퍼 | `src/presentation/` + `src/app/` |

> Next.js 제약상 `src/app/`(라우팅 뼈대)은 프레임워크 규약 위치에 두되, 실질 코드는 `src/presentation/`에서 import한다. `src/app/`의 파일은 얇은 재수출·조립만 한다.

### 9.2 의존 규칙

```
Presentation ──→ Application ──→ Domain ←── Infrastructure
      │                                          ▲
      └── composition root (DI 조립) ────────────┘
```

- **composition root**: `src/presentation/container.ts` 단 한 곳에서 Pool 생성 + 리포지토리 구현을 유스케이스에 주입
- Domain은 어떤 외부 패키지도 import하지 않는다 (zod조차 금지 — zod 스키마는 Presentation 소유)
- Infrastructure는 Application의 포트 타입만 구현하고 Presentation을 모른다

### 9.3 Import 규칙

| From | 허용 | 금지 |
| --- | --- | --- |
| `domain/` | (없음) | 전부 |
| `application/` | `domain/` | drizzle, next, clerk, zod |
| `infrastructure/` | `domain/`, `application/ports/` | next, react, `presentation/` |
| `presentation/` | `application/`, `domain/` | `infrastructure/` 직접 참조 (container.ts만 예외) |

ESLint `no-restricted-imports`로 강제한다 (module-1에서 설정).

### 9.4 파일 배치

```
src/
├── domain/
│   ├── song.ts  session.ts  entry.ts  errors.ts  score.ts(0..100 검증)
├── application/
│   ├── ports/
│   │   ├── session-repo.ts  song-repo.ts  entry-repo.ts  transaction.ts
│   └── use-cases/
│       ├── start-session.ts        get-current-session.ts
│       ├── add-entry-by-number.ts  update-entry-score.ts
│       ├── reorder-entries.ts      delete-entry.ts
├── infrastructure/
│   ├── db/
│   │   ├── client.ts(Pool)  schema.ts  seed.ts
│   └── repositories/
│       ├── drizzle-session-repo.ts  drizzle-song-repo.ts
│       ├── drizzle-entry-repo.ts    drizzle-tx-runner.ts
├── presentation/
│   ├── container.ts            ← composition root (유일한 infra 참조점)
│   ├── api/
│   │   ├── error-mapper.ts  schemas.ts(zod)
│   └── components/
│       ├── session/  playlist/  ui/(버튼·입력·토스트)
├── app/
│   ├── layout.tsx  globals.css(토큰)
│   ├── (app)/page.tsx  (app)/sessions/new/page.tsx
│   ├── api/sessions/route.ts
│   ├── api/sessions/current/route.ts
│   ├── api/sessions/[id]/entries/route.ts
│   ├── api/sessions/[id]/entries/order/route.ts
│   └── api/entries/[id]/route.ts
├── middleware.ts (clerkMiddleware)
drizzle/            ← 마이그레이션 SQL
tests/
├── invariants.test.ts  use-cases.test.ts
```

---

## 10. Coding Convention Reference

### 10.1 네이밍

| 대상 | 규칙 | 예 |
| --- | --- | --- |
| 컴포넌트 | PascalCase | `EntryRow.tsx` |
| 함수·변수 | camelCase | `addEntryByNumber()` |
| 상수 | UPPER_SNAKE_CASE | `MAX_SCORE` |
| 타입 | PascalCase | `Session`, `TxRepos` |
| 유틸 파일 | kebab-case.ts | `error-mapper.ts` |
| 폴더 | kebab-case | `use-cases/` |
| DB | snake_case (Drizzle 스키마에서 camelCase 매핑 단일 지점) | `visit_date` ↔ `visitDate` |

### 10.2 Import 순서

외부 라이브러리 → `@/domain` → `@/application` → `@/presentation`(상대) → type import → styles. `@/` 절대경로 사용.

### 10.3 환경변수

Plan §8.3 그대로. `DATABASE_URL`은 **Pooled connection string**(`-pooler` 호스트)을 사용한다 — WebSocket Pool 전제.

**module-5에서 추가된 변수** (`env.example` 갱신):

| 변수 | 필요 조건 | 값 |
| --- | --- | --- |
| `NEXT_PUBLIC_CLERK_DOMAIN` | 프로덕션(`pk_live_*`) + Vercel 커스텀 도메인 배포 | Clerk 대시보드에 등록한 Frontend API 커스텀 도메인 (예: `clerk.sing-diary.spiritflag.work`) |

Clerk 7.x는 프로덕션 키 + Vercel 배포 조합에서 `NEXT_PUBLIC_CLERK_DOMAIN`(또는 `_PROXY_URL`)이 없으면 same-origin 자동 프록시(`/__clerk`)로 자동 전환한다(`@clerk/shared/proxy`의 `getAutoProxyUrlFromEnvironment` — Vercel 배포 여부는 `VERCEL_TARGET_ENV`로 감지하므로 커스텀 도메인으로 접속해도 트리거된다). 이 프록시 경로를 실제 Frontend API로 넘기는 rewrite가 앱에 없으면 `clerkMiddleware`의 handshake 리다이렉트가 자기 자신을 향해 루프를 돌다 404로 떨어진다 — `/` 최초 배포 후 실제로 재현됨. `NEXT_PUBLIC_CLERK_DOMAIN`을 설정해 자동 프록시를 끄고 이미 검증된 Frontend API 도메인으로 직접 통신하도록 해 해결.

### 10.4 본 기능 컨벤션

| 항목 | 적용 |
| --- | --- |
| 상태 관리 | 전역 스토어 없음. `Playlist`가 로컬 상태 + 낙관적 갱신, 변경 후 `router.refresh()` |
| 에러 처리 | 서버: error-mapper 단일 지점 / 클라이언트: 원복 + 토스트 |
| 주석 | 핵심 결정에 `// Design Ref: §n` (bkit Do 규약) |
| 색상 | §5.1 토큰만. hex 직접 사용 금지 |

---

## 11. Implementation Guide

### 11.1 파일 구조

§9.4 참조 (신규 ~45파일).

### 11.2 구현 순서

1. [ ] module-1: 부트스트랩 (프로젝트·토큰·Clerk·Neon 연결·ESLint 계층 규칙)
2. [ ] module-2: Domain + 스키마·마이그레이션·시드 + INV 테스트
3. [ ] module-3: Application 포트·유스케이스 + Infrastructure 리포지토리 + API 라우트 + UC 테스트
4. [ ] module-4: UI (오늘의 플리·세션 생성·dnd·인라인 점수)
5. [ ] module-5: Vercel 배포·도메인·L1 검증

### 11.3 Session Guide

#### Module Map

| Module | Scope Key | 내용 | 산출물 | 예상 턴 |
| --- | --- | --- | --- | :-: |
| 부트스트랩 | `module-1` | create-next-app, Tailwind 토큰, Clerk 미들웨어, Neon Pool 연결 확인, ESLint import 규칙 | 로그인 되는 빈 앱 | 15-20 |
| 데이터 기반 | `module-2` | domain/ 전체, schema.ts, 마이그레이션, seed, INV-1~4 | 불변식 테스트 통과 | 15-20 |
| 백엔드 | `module-3` | ports, use-cases 6종, 리포지토리 4종, API 라우트 6개, error-mapper, UC-1~8 | curl로 전 API 동작 | 25-30 |
| 프론트엔드 | `module-4` | §5 화면 전부 (dnd, 인라인 점수, 낙관적 갱신) | 로컬 전 구간 조작 가능 | 25-30 |
| 배포 | `module-5` | Vercel + 도메인 + 프로덕션 마이그레이션 + L1 + §5.4 수동 체크 | 실기기 접속 확인 | 10-15 |

#### Recommended Session Plan

| Session | Phase | Scope | 비고 |
| --- | --- | --- | --- |
| 1 | Plan + Design | 전체 | 완료 (본 문서) |
| 2 | Do | `--scope module-1,module-2` | 기반 — 커밋 2개 |
| 3 | Do | `--scope module-3` | 백엔드 — 커밋 1개 |
| 4 | Do | `--scope module-4` | UI — 커밋 1개 |
| 5 | Do + Check | `--scope module-5` + analyze | 배포 후 Gap 분석 |
| 6 | Act + Report | 전체 | 종료 절차 (RULE.md) |

각 모듈 종료 시 커밋 (CONTRIBUTING 규약). develop 브랜치에서 작업.

---

## Version History

| 버전 | 날짜 | 변경 | 작성자 |
| --- | --- | --- | --- |
| 0.1 | 2026-08-23 | 최초 작성. B안(클린 아키텍처) 선택, R1은 Neon WebSocket Pool + db.transaction()으로 확정 | Claude |
| 0.2 | 2026-08-23 | module-5 배포 중 Clerk 7.x 프로덕션 same-origin 자동 프록시로 인한 404 루프 발견. `NEXT_PUBLIC_CLERK_DOMAIN` 환경변수를 §10.3에 추가해 해결 | Claude |
| 0.3 | 2026-08-23 | 프로덕션 500(로그인 후 `/`) — neon-serverless 싱글턴 Pool이 서버리스 freeze/thaw에 끊김. §3.4를 읽기(neon-http)/쓰기(요청별 Pool) 분리로 1차 개정 | Claude |
| 0.4 | 2026-08-23 | 1차 개정으로도 쓰기 경로(`POST /api/sessions`)에서 동일 계열 장애 재발(`ws` heartbeat 타이머가 freeze 중 죽은 소켓에 씀). §3.4를 `pg`(순수 TCP) 기반으로 재개정 — WebSocket 완전 배제 | Claude |
| 0.5 | 2026-08-23 | 브라우저 QA 중 발견: `POST /api/sessions/:id/entries` 구현이 §4.2 명세의 `song` 필드를 실제로 채우지 않아 클라이언트가 `entry.song.title` 접근 시 크래시. 명세(§4.2)는 원래 맞았고 module-3 구현 누락이었음 — `addEntryByNumber` 유스케이스가 `song` 정보를 반환하도록 수정 | Claude |
