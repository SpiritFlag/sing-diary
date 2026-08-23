# expand-playlist-import 설계서

> **요약**: 세션 읽기를 `SessionQuery` 포트로 갈라 지난 플리 목록·상세를 열고, `addEntryBySong` 유스케이스 하나로 "번호 등록 + 엔트리 추가"를 단일 트랜잭션·왕복 1회에 담아 §5.2 3분기를 완성한다. 판정 로직은 순수 함수 모듈로 먼저 뽑아 vitest로 고정한 뒤 그 위에 짓는다.
>
> **프로젝트**: sing-diary
> **버전**: 미정 (사이클 종료 시 사용자가 결정)
> **사이클**: expand-playlist-import
> **작성일**: 2026-08-23
> **상태**: Draft
> **계획서**: [expand-playlist-import.plan.md](./expand-playlist-import.plan.md)

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

### 1.1 설계 목표

1. **번호 우회를 정식 배관으로 바꾼다** — `songId` 기반 추가 경로를 신설하되, M1의 번호 기반 경로는 한 줄도 건드리지 않는다(Plan R1·D-E).
2. **번호 입력 분기를 왕복 1회로 담는다** — "번호 등록 → 엔트리 추가"가 요청 2번이면 8초대다. 한 트랜잭션이면 4초대이고 원자적이다(Plan R2).
3. **세션 읽기를 뷰 모델로 가른다** — 목록은 곡 수 집계가, 상세는 양쪽 브랜드 번호가 필요하다. 도메인 `Session`을 뱉는 `SessionRepo`에 섞지 않는다(직전 사이클 D-B 선례).
4. **판정 로직을 먼저 뽑고 그 위에 짓는다** — 3-state dirty-check(기존)와 §5.2 3분기(신규)를 한 순수 함수 모듈에 넣어 vitest로 고정한 뒤, UI 두 곳(검색·지난 플리)이 같은 함수를 쓴다(Plan R4·FR-16).

### 1.2 설계 원칙

- **owner 스코프는 시그니처로** — 신규 포트 메서드 전부가 `ownerId`를 첫 인자로 받는다 (승계).
- **경계는 한 번만 넘는다** — presentation → infrastructure 참조는 `container.ts` 하나 (승계).
- **불변식은 가장 안쪽에서** — 3-state는 기존 `SongRepo.setNumber`와 Zod 유니언이 강제하고, DB CHECK는 최후 방어선 (승계).
- **핵심 경로는 격리한다** — `add-entry-by-number`·`AddByNumber`는 읽지만 쓰지 않는 파일이다. diff에 이 파일들이 나타나면 그 자체가 리뷰 경보다.

### 1.3 근거 확인 (Plan ★ 불확실 지점의 해소)

#### ★R2 (왕복 횟수) — **해소. 배관이 이미 있다: 왕복 1회·단일 트랜잭션으로 확정**

`src/application/ports/transaction.ts`의 `TxRepos`가 `sessions`·`songs`·`entries` 셋을 이미 묶어 준다. 그리고 `SongRepo.setNumber`는 직전 사이클부터 `TxRepos.songs`에 물려 있다. 즉 아래가 **새 배선 없이** 성립한다:

```
tx.run(repos => {
  세션 확인(repos.sessions) → 번호 등록(repos.songs.setNumber) → 엔트리 추가(repos.entries)
})
```

번호 입력 분기의 왕복은 1회다. NFR "2회 이내"를 여유로 만족하며, 등록만 되고 추가가 안 되는 어중간한 상태도 트랜잭션이 막는다. **결정 D-K.**

#### ★R1 (핵심 경로 격리) — **코드로 재확인. 격리 가능하다**

`add-entry-by-number.ts`는 `{ ownerId, sessionId, number }`만 알고, 라우트 디스패치는 Zod 스키마 파싱 결과의 **형태**로 가를 수 있다(§4.2). 기존 스키마 `{ number }`는 유니언의 한 갈래로 형태가 그대로 보존되므로 `AddByNumber`·기존 L1 케이스는 요청 한 바이트도 바뀌지 않는다. **결정 D-J.**

단, 한 가지가 부족하다 — **"건너뛰고 추가" 분기에서 곡 소유권을 확인할 수단이 `SongRepo`에 없다.** `entries.song_id`는 FK일 뿐 owner를 모르므로, 소유권 확인 없이 append하면 **타 owner의 songId를 내 세션에 연결**할 수 있다. `SongRepo.findByIdForOwner(ownerId, songId)`를 신설한다(§3.3). 번호를 등록하는 분기는 `setNumber`의 owner 확인이 겸하지만, 확인 로직을 분기별로 다르게 두면 리뷰가 어려우므로 **두 분기 모두 `findByIdForOwner`를 먼저 통과**시킨다.

#### ★R5 (두 브랜드 표시) — **표시는 기록대로, 판정은 오늘 기준으로 확정**

`EntryRepo.listWithSongBySession(sessionId, brand)`는 한 브랜드 번호만 실어 주므로 상세 화면에 못 쓴다. `SessionQuery.findDetail`이 곡별 `numbers: Record<Brand, NumberView>`(직전 사이클 `SongListItem`과 같은 표현)를 통째로 내려준다. 화면 규칙(**D-N**):

- 곡 행에 표시하는 번호 = **그 세션 브랜드의 번호** (그날 부른 기록 그대로)
- [오늘로] 버튼의 활성·분기 = **오늘 열린 세션 브랜드** 기준 판정
- 두 브랜드가 다르면 버튼 옆에 오늘 브랜드 칩(`KY` 등)을 붙여 "판정 기준이 다르다"를 드러낸다

#### ★R6 (곡 수 집계) — **GROUP BY 단일 쿼리로 확정**

```sql
SELECT s.*, count(e.id) AS entry_count
FROM sessions s LEFT JOIN entries e ON e.session_id = s.id
WHERE s.owner_id = $1
GROUP BY s.id
ORDER BY s.visit_date DESC, s.created_at DESC;
```

`idx_sessions_owner_date`가 owner 필터·정렬을 받친다. 세션 수는 1인 방문 횟수 규모라 N+1을 걱정할 크기도 아니지만, 한 쿼리로 되는 것을 나눌 이유가 없다. **결정 D-O.**

---

## 2. Architecture Options

### 2.0 설계안 비교 (Checkpoint 3 완료)

| 기준 | A: 최소 변경 | B: 클린 분리 | C: 실용 균형 |
| --- | :-: | :-: | :-: |
| 세션 읽기 | `SessionRepo` 확장 | **`SessionQuery` 포트 신설** | `SessionRepo` 확장 + 보강 조회 |
| songId 추가 | `add-entry-by-number` 직접 확장 ❌ | **별도 유스케이스 + 유니언 스키마** | B와 동일 |
| 번호 입력 분기 | PUT→POST 2요청 (8초대) | **단일 tx 1왕복** | B와 동일 |
| 세션 API | 없음 (RSC만) — L1 타 owner 404 실측 불가 ❌ | **목록·상세 라우트 신설** | B와 동일 |
| 신규/수정 파일 | ~7 / ~7 | **~14 / ~9** | ~11 / ~9 |
| Plan R1·§2.1-F 준수 | ❌ 위반 2건 | ✅ | ✅ |

**선택: B — 클린 분리** (사용자 결정, Checkpoint 3)

**채택 사유**: A는 M1 핵심 경로를 직접 수정(R1 위반)하고 타 owner 404를 실측할 수 없다(Plan §2.1-F 위반) — 탈락. B와 C의 실질 차이는 세션 읽기를 별도 포트로 가르느냐뿐인데, 목록(곡 수 집계)과 상세(양쪽 브랜드 번호)가 요구하는 것은 도메인 모델이 아니라 **뷰 모델**이다. 직전 사이클이 정확히 같은 이유로 `SongQuery`를 갈랐고(D-B), 그 선택은 Check 98%로 실증됐다. 같은 상황에 같은 답을 쓴다.

**대가로 지는 것 (숨기지 않는다)**
1. 파일이 C 대비 3개쯤 늘어난다. 세션 읽기 포트·어댑터가 곡 쪽과 거의 같은 모양의 반복이다 — 1인 앱에 두 벌의 CQRS-lite는 과하다는 비판이 가능하다. 반론은 하나뿐이다: 섞었을 때 깨지는 방식(도메인 모델에 집계 필드가 슬금슬금 붙는 것)을 직전 두 사이클에서 이미 봤다.
2. 유니언 스키마 디스패치(D-J)는 라우트 본문에 분기 하나를 만든다. 라우트는 "파싱→위임"만 한다는 관행에 분기가 하나 늘어나는 셈 — §4.2의 형태 판별을 스키마 쪽에 최대한 밀어 라우트 분기를 한 줄로 유지한다.

### 2.1 컴포넌트 다이어그램

```
┌─────────────────────────── presentation ───────────────────────────┐
│ (app)/sessions/page.tsx        (app)/sessions/[id]/page.tsx        │
│      │ RSC: listSessions            │ RSC: getSessionDetail        │
│      ▼                              │      + getCurrentSession     │
│ SessionList (client)                ▼                              │
│                                SessionDetailView (client)          │
│                                     └ AddSongFlow ◄──┐ 공유(D-R)   │
│ (app)/songs/search/page.tsx                          │             │
│      └ SearchResults (client) ── AddSongFlow ────────┘             │
│                                     │                              │
│              song-state.ts (순수 함수: 3-state·touched·3분기)       │
│                                     │ fetch                        │
│                                     ▼                              │
│  GET /api/sessions        GET /api/sessions/[id]                   │
│  POST /api/sessions/[id]/entries  ← 유니언 {number}|{songId,...}    │
│         │  전부 withAuth() (기존 강제 수단이 그대로 받는다)          │
└─────────┼──────────────────────────────────────────────────────────┘
          ▼
┌───────────────────────────── application ──────────────────────────┐
│ use-cases: listSessions · getSessionDetail (신규, 읽기)             │
│            addEntryBySong (신규, 쓰기·단일 tx)                      │
│            addEntryByNumber (기존, 무변경 — R1)                     │
│ ports: SessionQuery (신규)   SongRepo (+findByIdForOwner)           │
└─────────┼──────────────────────────────────────────────────────────┘
          ▼
┌─────────────────────────── infrastructure ─────────────────────────┐
│ drizzle-session-query.ts (신규)     drizzle-song-repo.ts (+1)      │
│        │ Neon HTTP (읽기, D-C 승계)       │ pg Pool (쓰기, tx)      │
└─────────┼──────────────────────────────────────────────────────────┘
          ▼
   sessions · entries · songs · song_numbers   (스키마 무변경)
```

### 2.2 데이터 흐름

**지난 플리 → 오늘로 가져오기 (핵심 흐름)**

```
목록 GET /api/… (RSC) → 세션 탭 → 상세 (entries + 곡별 양쪽 브랜드 번호)
  → 곡 행의 [오늘로] — addDecision(numbers, 오늘 brand) 판정 (song-state.ts)
  ├ AVAILABLE  → 탭 1회 → POST entries { songId }                    (2탭 NFR)
  ├ UNSUPPORTED → 안내 "이 기기에선 미지원" + 번호 입력 제안
  │    ├ 입력 → POST entries { songId, registerNumber } — tx 안에서 AVAILABLE 전환 후 추가
  │    └ [그냥 추가] → POST entries { songId }         — UNSUPPORTED 행 유지(변경 금지)
  └ 행 없음   → 안내 "번호가 아직 없어요" + 번호 입력 제안
       ├ 입력 → POST entries { songId, registerNumber } — tx 안에서 행 생성 후 추가
       └ [그냥 추가] → POST entries { songId }         — 행 없음 유지(생성 금지)
```

**검색 결과에서 추가** — 위와 동일한 `AddSongFlow`를 쓴다. 기존 "AVAILABLE 번호를 도로 POST하는" 우회는 제거된다(FR-09).

### 2.3 의존성 · 결정 기록

| # | 결정 | 선택 | 근거 |
| --- | --- | --- | --- |
| **D-J** | songId 추가의 API 표현 | **기존 `POST /api/sessions/[id]/entries`의 유니언 스키마** — 새 라우트를 만들지 않는다 | REST상 같은 리소스(엔트리 컬렉션)에 대한 같은 동사다. "무엇으로 곡을 지목하는가"만 다르므로 본문 형태로 가른다. 기존 `{ number }` 형태는 유니언의 한 갈래로 바이트 단위 보존 — `AddByNumber`·기존 L1 무영향 |
| **D-K** | 번호 등록 + 추가 | **단일 트랜잭션·왕복 1회** (`registerNumber` 선택 필드) | §1.3 R2. 2요청이면 8초대 + 중간 실패 시 어중간한 상태. tx면 4초대 + 원자적 |
| **D-L** | 세션 읽기 | **`SessionQuery` 포트 신설** (Neon HTTP, D-C 승계) | §2.0. 목록·상세가 요구하는 건 뷰 모델이다. `SessionRepo`는 무변경 |
| **D-M** | 목록에 진행 중 세션 | **포함하되 "진행 중" 배지, 탭하면 오늘 화면(`/`)으로** | 목록에서 오늘 세션이 빠지면 "아까 그 세션 어디 갔지"가 된다. 상세 화면은 지난(닫힌) 세션 전용 — 열린 세션 상세는 오늘 화면이 이미 그 역할이다 |
| **D-N** | 상세의 브랜드 표시 | **번호 표시는 그 세션 브랜드 기록, [오늘로] 판정은 오늘 브랜드. 다르면 오늘 브랜드 칩 병기** | §1.3 R5. 기록을 오늘 기준으로 덮어 보여주면 "그날 부른 번호"라는 일지 본연의 의미가 죽는다 |
| **D-O** | 곡 수 집계 | **LEFT JOIN + GROUP BY 단일 쿼리** | §1.3 R6 |
| **D-P** | 곡 소유권 확인 | **`SongRepo.findByIdForOwner` 신설, `addEntryBySong` 두 분기 모두 첫 단계에서 통과** | §1.3 R1 말미. FK는 owner를 모른다 — 확인 없으면 타 owner 곡을 내 세션에 연결 가능 |
| **D-Q** | 타 owner 세션 접근 | **404 `SESSION_NOT_FOUND`** | refine-auth-boundary D-E 승계(403은 존재를 누설). 기존 에러 코드 재사용, 신규 코드 0 |
| **D-R** | 3분기 UI | **`AddSongFlow` 공유 컴포넌트 + `song-state.ts` 순수 함수** | FR-16. 검색·지난 플리가 각자 만들면 규칙이 갈린다. 판정은 함수가, 표현은 컴포넌트가, 두 화면은 조립만 |
| **D-S** | "그냥 추가" 시 번호 상태 | **일절 건드리지 않는다** — UNSUPPORTED 유지, 행 없음 유지 | ARCHITECT §5.2 "결손은 빈칸채우기 큐가 회수한다". 여기서 UNSUPPORTED 행을 지우거나 만들면 M3 큐 계약이 깨진다(Plan R3) |
| **D-T** | `registerNumber`가 이미 AVAILABLE인 곡에 오면 | **덮어쓴다 (setNumber 그대로)** | UI는 AVAILABLE 분기에서 입력을 제안하지 않으므로 정상 경로에선 안 온다. 왔다면(동시 편집 등) 최신 입력 우선이 자연스럽다. 거부 분기를 늘려 얻는 것이 없다 |

---

## 3. Data Model

### 3.1 DB 스키마

**변경 없음. 마이그레이션 0건.** 필요한 것이 전부 이미 있다:

```
sessions:      idx_sessions_owner_date (owner_id, visit_date DESC)  → 목록 쿼리
entries:       idx_entries_session (session_id, position)           → 상세 정렬
song_numbers:  PRIMARY KEY (song_id, brand)                         → setNumber upsert
               CHECK (status <> 'AVAILABLE' OR number IS NOT NULL)  → 3-state 최후 방어선
```

### 3.2 세션 읽기 포트 (`src/application/ports/session-query.ts`, 신규)

```ts
import type { Brand } from "@/domain";
import type { NumberView } from "./song-query";

export interface SessionListItem {
  id: string;
  visitDate: string;         // YYYY-MM-DD
  venue: string;
  brand: Brand;
  isOpen: boolean;           // closed_at IS NULL — D-M 배지·라우팅 분기용
  entryCount: number;        // D-O 단일 쿼리 집계
}

export interface SessionDetailEntry {
  id: string;
  position: number;
  score: string | null;      // numeric은 문자열로 온다 (기존 Entry와 동일)
  song: {
    id: string;
    title: string | null;
    artist: string | null;
    numbers: Record<Brand, NumberView>;  // 양쪽 브랜드 — D-N의 전제
  };
}

export interface SessionDetail {
  id: string;
  visitDate: string;
  venue: string;
  brand: Brand;              // 그 세션의 브랜드 — 표시 기준
  isOpen: boolean;
  entries: SessionDetailEntry[];
}

export interface SessionQuery {
  /** owner 스코프 전체 목록. visit_date DESC, created_at DESC */
  listByOwner(ownerId: string): Promise<SessionListItem[]>;
  /** 타 owner·부재 시 null → 유스케이스가 SESSION_NOT_FOUND (D-Q) */
  findDetail(ownerId: string, sessionId: string): Promise<SessionDetail | null>;
}
```

> `NumberView`는 `song-query.ts`의 기존 타입을 import한다 — 번호 3-state의 읽기 표현을 두 벌 만들지 않는다.

### 3.3 쓰기 포트 확장 (`src/application/ports/song-repo.ts`, 메서드 1개 추가)

```ts
export interface SongRepo {
  // 기존 5개 무변경 …
  /** 소유권 확인 겸 단건 조회. 타 owner·부재 시 null (D-P) */
  findByIdForOwner(ownerId: string, songId: string): Promise<Song | null>;
}
```

구현은 `drizzle-song-repo.ts`에 `where(and(eq(songs.id, songId), eq(songs.ownerId, ownerId)))` 단건 select — `touch`와 달리 **부수효과 없음**(조회일 뿐이므로 `updated_at`을 건드리지 않는다).

### 3.4 신규 유스케이스 — `addEntryBySong` (이 사이클의 몸통)

```ts
// src/application/use-cases/add-entry-by-song.ts
export interface AddEntryBySongInput {
  ownerId: string;
  sessionId: string;
  songId: string;
  registerNumber?: string;   // 있으면: 오늘 브랜드로 AVAILABLE 등록 후 추가 (D-K)
}

export function createAddEntryBySong(tx: TransactionRunner) {
  return async (input: AddEntryBySongInput): Promise<AddEntryBySongResult> =>
    tx.run(async (repos) => {
      const session = await repos.sessions.findByIdForOwner(input.sessionId, input.ownerId);
      if (!session) throw new DomainError("SESSION_NOT_FOUND", …);
      if (session.closedAt) throw new DomainError("SESSION_CLOSED", …);

      const song = await repos.songs.findByIdForOwner(input.ownerId, input.songId);  // D-P: 두 분기 공통
      if (!song) throw new DomainError("SONG_NOT_FOUND", …);

      if (input.registerNumber !== undefined) {
        await repos.songs.setNumber(input.ownerId, input.songId, session.brand, {
          status: "AVAILABLE", number: input.registerNumber,
        });                                       // 기존 코드 재사용 — 3-state 자동 준수 (Plan D-F)
      }                                           // registerNumber 없으면 번호 상태 불변 (D-S)

      const entry = await repos.entries.appendToSession(session.id, input.songId);
      return {
        entry,
        song: { id: song.id, title: song.title, number: input.registerNumber ?? null },
        isNewStub: false,                         // 기존 응답 형태와 정렬 — 곡이 이미 존재하므로 항상 false
      };
    });
}
```

`add-entry-by-number.ts`와 결과 형태를 맞춰 라우트가 두 유스케이스의 응답을 같은 모양으로 내보낸다. **`add-entry-by-number.ts`는 이 사이클에서 한 줄도 바뀌지 않는다.**

### 3.5 판정 순수 함수 모듈 (`src/presentation/components/songs/song-state.ts`, 신규)

백로그 `55992dd3`의 몸통. **두 상태 머신이 이 한 파일에 산다.**

```ts
import type { Brand } from "@/domain";
import type { NumberView } from "@/application/ports/song-query";

// ① NumberCell의 확정 판정 — G-1 수정(touched 기반)을 그대로 이관 (Plan R4·FR-03)
export type CommitDecision =
  | { kind: "noop" }                       // 안 건드림 — 조용히 편집만 닫는다
  | { kind: "clear" }                      // 지우고 확정 → DELETE (행 없음)
  | { kind: "available"; number: string }; // 번호 확정 → PUT AVAILABLE

export function commitDecision(draft: string, touched: boolean): CommitDecision {
  if (!touched) return { kind: "noop" };
  const trimmed = draft.trim();
  if (trimmed === "") return { kind: "clear" };
  return { kind: "available", number: trimmed };
}

// ② §5.2 3분기 판정 — AddSongFlow가 쓴다 (FR-02)
export type AddDecision =
  | { kind: "available"; number: string }  // 즉시 추가
  | { kind: "unsupported" }                // 안내 + 번호 제안 + 건너뛰기
  | { kind: "missing" };                   // 안내 + 번호 제안 + 건너뛰기

export function addDecision(numbers: Record<Brand, NumberView>, todayBrand: Brand): AddDecision {
  const n = numbers[todayBrand];
  if (!n) return { kind: "missing" };
  if (n.status === "UNSUPPORTED") return { kind: "unsupported" };
  return { kind: "available", number: n.number as string };  // CHECK 제약상 non-null
}
```

`NumberCell`은 인라인 판정을 지우고 `commitDecision`을 호출하는 형태로 바뀐다(동작 무변경 — §8.4 유닛으로 고정). `SearchResults`의 `numberState`는 `addDecision`으로 대체된다.

---

## 4. API Specification

### 4.1 엔드포인트 목록

| # | 메서드 · 경로 | 용도 | 성공 |
| --- | --- | --- | --- |
| 1 | `GET /api/sessions` | 지난 플리 목록 (곡 수 포함, D-O) | 200 `{ data: SessionListItem[] }` |
| 2 | `GET /api/sessions/{id}` | 세션 상세 (곡별 양쪽 브랜드 번호, D-N) | 200 `{ data: SessionDetail }` |
| 3 | `POST /api/sessions/{id}/entries` | **유니언** — `{number}` 기존 그대로 / `{songId, registerNumber?}` 신규 (D-J·D-K) | 201 기존 응답 형태 |
| 4 | `GET /api/songs/search?q=` | `brand` 파라미터 **제거** (FR-17) | 200 (형태 무변경) |

- #1은 기존 `sessions/route.ts`(POST 세션 생성)에 GET 핸들러 추가 — 파일 재사용.
- #2는 신규 `sessions/[id]/route.ts`. 기존 `sessions/current`는 정적 세그먼트라 `[id]`보다 우선 매칭 — 충돌 없음(코드로 확인).
- #3은 기존 파일 수정. 경로·기존 형태 응답 무변경.
- 신규·수정 라우트 전부 `withAuth()` — ESLint `apiRouteGuard`가 이미 강제한다(직전 사이클 산출물, 첫 실전).

### 4.2 요청 스키마 (`schemas.ts` 변경분)

```ts
// D-J — 유니언. 기존 { number } 갈래는 addEntryByNumberSchema 그대로 재사용해 바이트 보존.
// .strict()가 없으면 { songId, number } 혼합이 조용히 한쪽으로 흡수된다 — 직전 사이클 선례 승계.
export const addEntrySchema = z.union([
  addEntryByNumberSchema.strict(),                       // { number }
  z.object({
    songId: z.string().uuid(),
    registerNumber: z.string().trim().min(1).max(10).optional(),
  }).strict(),                                           // { songId, registerNumber? }
]);

// searchSongsQuerySchema — brand 필드 삭제 (FR-17)
export const searchSongsQuerySchema = z.object({
  q: z.string().trim().min(1, "검색어를 입력하세요").max(100),
});
```

라우트 디스패치는 한 줄이다: `"number" in parsed ? useCases.addEntryByNumber(...) : useCases.addEntryBySong(...)`.

### 4.3 에러 계약

**신규 에러 코드 0.** 전부 기존 재사용:

| 코드 | HTTP | 이번 사이클의 발생 지점 |
| --- | --- | --- |
| `SESSION_NOT_FOUND` | 404 | 타 owner·부재 세션 상세(D-Q), addEntryBySong의 세션 확인 |
| `SESSION_CLOSED` | 409 | 닫힌 세션에 추가 시도 (상세 화면을 열어둔 채 세션이 바뀐 경우) |
| `SONG_NOT_FOUND` | 404 | 타 owner·부재 songId (D-P) |
| `VALIDATION_ERROR` | 400 | 유니언 어느 갈래에도 안 맞는 본문 (`{songId, number}` 혼합 등) |
| `UNAUTHORIZED` | 401 | 무인증 — `withAuth()` 경유 |

`error-mapper.ts` · `domain/errors.ts` **무변경.**

---

## 5. UI/UX Design

### 5.1 화면 목록

| 화면 | 경로 | 대상 | 비고 |
| --- | --- | --- | --- |
| 지난 플리 목록 | `(app)/sessions` | 모바일 | 진행 중 세션 포함 + 배지 (D-M). 기존 `(app)/sessions/new`는 정적 세그먼트라 충돌 없음 |
| 세션 상세 | `(app)/sessions/[id]` | 모바일 | 읽기 전용 + [오늘로] 가져오기 |
| 곡 검색 | `(app)/songs/search` | 모바일 | **수정** — AddSongFlow로 이관, 3분기 개방 |

`AppHeader` nav에 "지난 플리"(`/sessions`)를 추가한다 — 검색·곡 관리와 나란히.

### 5.2 사용자 흐름

**목록 → 상세 → 가져오기 (AVAILABLE이면 2탭, NFR)**

```
[헤더 지난 플리] → 목록 (날짜·지점·브랜드칩·곡 N곡)
  ├ 진행 중 세션 행 → 배지 "진행 중" → 탭하면 / (오늘 화면)
  └ 닫힌 세션 행 → 탭 → 상세
       헤더: 2026-08-15 · 강남점 · [TJ]        ← 그 세션 브랜드
       곡 행: 순번 · 제목(NULL→"제목 없음") · 그날 번호 · 점수 · [오늘로 KY]
                                                        ↑ 오늘 브랜드가 다르면 칩 병기 (D-N)
  [오늘로] 탭 → addDecision(오늘 브랜드) 판정
  ├ available   → 즉시 POST { songId } → 토스트 "오늘의 플리에 추가했어요"   (탭 2회 합계)
  ├ unsupported → AddSongFlow 시트: "이 기기(KY)에선 미지원이에요"
  │               [번호 입력 → 저장하고 추가] / [그냥 추가] / [취소]
  └ missing     → AddSongFlow 시트: "KY 번호가 아직 없어요" + 같은 3버튼
  열린 세션이 없으면 [오늘로] 열 자체를 렌더하지 않는다 (기존 SearchResults 선례)
  상세 세션 == 열린 세션이면 (목록에서 막지만 URL 직접 진입 대비) [오늘로] 비노출
```

**"그냥 추가"의 결과**: 번호 없는 entry가 오늘의 플리에 `제목` 또는 `#—`로 뜬다. 기존 `EntryRow`가 이미 견디는 형태(Plan §1.3-8)다. 다만 **제목도 번호도 없는 곡**(검색으로는 도달 불가, 지난 플리의 stub 곡)은 `#—`가 유일한 표식이 되므로, 상세 화면의 곡 행에서 stub 곡(title NULL)은 그날 번호를 제목 자리에 대신 보여준다(`#12345` — `EntryRow`와 같은 규칙).

### 5.3 AddSongFlow (D-R — 공유 컴포넌트)

```
props: { song: { id, title, numbers }, sessionId, todayBrand, onDone }
내부: addDecision(song.numbers, todayBrand) 로 분기
      available   → 버튼 탭 즉시 POST, 시트 없음
      그 외       → 바텀시트: 안내문 + 번호 입력(inputMode="numeric") + 3버튼
POST body: { songId } 또는 { songId, registerNumber }
성공: toast + router.refresh() + onDone()
실패: 시트 유지 + parseErrorMessage 토스트 (기존 관례)
연타 방지: 요청 중 버튼 disabled (SearchResults의 addingId 선례)
```

- 검색 결과(`SearchResults`)와 세션 상세(`SessionDetailView`)가 **이 컴포넌트를 그대로** 쓴다. 화면별 커스텀은 안내문 앞머리(곡명) 정도다.
- 저장 중 표시는 버튼 스피너 하나 — 왕복 1회(D-K)라 표의 셀 잠금 같은 다중 pending 관리가 필요 없다.

### 5.4 Page UI Checklist

**`(app)/sessions` (목록)**
- [ ] 최신순, 각 행: 날짜 · 지점 · 브랜드 칩 · 곡 수
- [ ] 진행 중 세션 배지 + `/`로 라우팅 (D-M)
- [ ] 0건 안내 ("아직 기록이 없어요")

**`(app)/sessions/[id]` (상세)**
- [ ] 헤더: 날짜 · 지점 · 그 세션 브랜드 칩
- [ ] 곡 행: 순번 · 제목(stub은 `#그날번호`) · 그날 번호 · 점수 (읽기 전용)
- [ ] [오늘로] — 열린 세션 있을 때만, 오늘 브랜드 다르면 칩 병기 (D-N)
- [ ] 타 owner·부재 id → 404 화면 (Next `notFound()`)
- [ ] 뒤로가기로 목록 복귀 (스크롤 위치는 브라우저 기본에 맡긴다)

**`(app)/songs/search` (수정)**
- [ ] UNSUPPORTED·행없음 버튼이 **비활성 → AddSongFlow 진입**으로 바뀜 (FR-09)
- [ ] 기존 AVAILABLE 즉시 추가 동작 유지 (탭 수 불변)

---

## 6. Error Handling

- **경계는 기존 그대로** — API는 `withAuth()` → `mapError` 단일 지점, 페이지는 `requireOwnerIdOrRedirect()`. 신규 코드가 이 경계 밖에서 에러를 처리하지 않는다.
- 상세 RSC에서 `getSessionDetail`이 null이면 `notFound()` — API의 404(D-Q)와 페이지의 404 화면이 같은 의미를 가리킨다.
- `addEntryBySong`의 `SESSION_CLOSED`(409): 상세 화면을 열어둔 사이 다른 기기에서 새 세션을 만든 경우다. 토스트로 알리고 `router.refresh()` — 조용히 죽지 않는다.

### 6.1 owner 스코프 누락 방지 (Plan §6.3)

| 지점 | 보장 수단 |
| --- | --- |
| `SessionQuery` 2메서드 · `SongRepo.findByIdForOwner` | **첫 인자 `ownerId`** + 쿼리 `where` 필수 |
| `addEntryBySong` | 세션(D-Q)과 곡(D-P)을 **각각** owner 확인 — 어느 한쪽 우회 불가 |
| 실측 | L1 신규 케이스: 타 owner 세션 404(#22) · 타 owner songId 404(#24) |

---

## 7. Security Considerations

1. **세션 목록 = 두 번째 다수 행 노출면** — `listByOwner`의 owner 필터가 유일한 방어. L1 #21에서 시드된 타 owner 세션이 **목록에 없음**까지 확인한다(404 케이스와 별개).
2. **songId 직접 지정 = 새 IDOR 표면** — 지금까지 곡은 번호→자기 소유 조회로만 도달했다. 이번에 클라이언트가 UUID를 직접 보낸다. D-P의 `findByIdForOwner`가 방어선이고 L1 #24가 실측한다.
3. **라우트 증가는 기존 강제 수단이 받는다** — `withAuth()` + ESLint `apiRouteGuard`(직전 사이클). 이번 사이클은 이 수단의 **첫 실전 소비자**다. 새 강제 수단은 만들지 않는다.

---

## 8. Test Plan

### 8.1 범위

| 레벨 | 대상 | 수단 |
| --- | --- | --- |
| UNIT | `song-state.ts` 두 함수 전 분기, `addEntrySchema` 유니언, `addEntryBySong`·`getSessionDetail` 유스케이스 | Vitest (`TEST_DATABASE_URL` 통합 포함, 로컬) |
| L1 | 신규 API 3종 + 기존 19케이스 회귀 | `npm run l1` (Preview) |
| 수동 | 3분기 시트 UX, D-N 브랜드 칩, 뒤로가기 | Analysis에 기록 |

빌드·lint·typecheck는 **Vercel 빌드 로그로만** 확인한다(`.claude/CLAUDE.md` — 로컬 실행 금지).

### 8.2 L1 신규 케이스

기존 `#1~#19`는 **번호·판정식 무변경**. 뒤에 잇는다.

| # | 시나리오 | 기대 |
| --- | --- | --- |
| 20 | `GET /api/sessions` 미인증 | 401 + `UNAUTHORIZED` |
| 21 | `GET /api/sessions` 인증 | 200, 시드 세션 포함 · entryCount 정확 · **타 owner 세션 미포함** |
| 22 | `GET /api/sessions/{타 owner 세션 id}` | **404 + `SESSION_NOT_FOUND`** (D-Q 실측) |
| 23 | `GET /api/sessions/{내 세션 id}` | 200, entries 배열 + 곡별 `numbers.TJ`·`numbers.KY` 키 존재 (D-N 전제) |
| 24 | `POST entries` `{ songId: 타 owner 곡 }` | **404 + `SONG_NOT_FOUND`** (D-P 실측) |
| 25 | `POST entries` `{ songId, registerNumber }` — 행 없음 곡 | 201, 이후 `GET /api/songs`로 해당 브랜드 `AVAILABLE`+번호 확인 (**행 1개 생성** — R3 핵심) |
| 26 | `POST entries` `{ songId }` — UNSUPPORTED 곡 건너뛰기 | 201, 이후 재조회로 **`UNSUPPORTED` 행이 그대로**임 확인 (D-S 핵심) |
| 27 | `POST entries` `{ songId, number: "1" }` 혼합 본문 | 400 + `VALIDATION_ERROR` (유니언 `.strict()` 검증) |
| 28 | #25의 왕복시간 | **5초 이내** (NFR — 등록+추가 1왕복 실측, D-K의 증명) |

### 8.3 시드와 정리

직전 사이클 §8.3의 규약을 그대로 승계한다 — **id 화이트리스트 방식만.**

- 타 owner **세션** 1건을 추가로 시드한다(#21·#22용). 기존 타 owner 곡 시드와 같은 가짜 owner id를 재사용한다.
- 시드 시 받은 id를 변수에 보관하고, `finally`에서 **그 id들만** 삭제한다. 조건절 범위 삭제 금지.
- **기존 삭제문·기존 시드는 한 줄도 수정하지 않고** append만 한다.

### 8.4 UNIT 케이스

| ID | 대상 | 확인 |
| --- | --- | --- |
| SS-1 | `commitDecision` | `(무엇이든, touched=false)` → noop / `("", true)` → clear / `(" 12 ", true)` → available "12" — **G-1 케이스를 테스트 이름에 명기** (Plan R4) |
| SS-2 | `addDecision` | 행없음 → missing / UNSUPPORTED → unsupported / AVAILABLE → available+번호. 브랜드 교차(TJ만 있는 곡을 KY로 판정 → missing) |
| SC-1 | `addEntrySchema` | `{number}` 통과(기존 형태 보존) / `{songId}` 통과 / `{songId, registerNumber}` 통과 / `{songId, number}` 실패 / `{}` 실패 |
| UC-1 | `addEntryBySong` (통합, TEST_DATABASE_URL) | 타 owner songId → SONG_NOT_FOUND / registerNumber 경로에서 행 생성+entry 원자성 / 건너뛰기 경로에서 번호 상태 불변 (D-S) |
| UC-2 | `getSessionDetail` (통합) | 타 owner → null / entries가 position 순 / numbers 두 키 존재 |

### 8.5 수동 확인 (Analysis에 기록)

- 상세에서 UNSUPPORTED 곡 [오늘로] → 시트 → [그냥 추가] → 오늘 화면에 곡이 있고, 곡 관리 표에서 그 곡의 오늘 브랜드가 여전히 "미지원"인가 (D-S 육안 확인)
- 오늘 브랜드 ≠ 그 세션 브랜드일 때 칩이 병기되는가 (D-N)
- 열린 세션이 없을 때 [오늘로] 열이 사라지는가
- 검색 결과의 기존 AVAILABLE 추가가 여전히 2탭인가 (FR-09 이관 후 회귀 확인)

---

## 9. Clean Architecture

### 9.1 계층 배치

```
src/
├── application/
│   ├── ports/
│   │   ├── session-query.ts                신규: 세션 읽기 포트 (D-L)
│   │   └── song-repo.ts                    수정: findByIdForOwner 추가 (D-P)
│   └── use-cases/
│       ├── list-sessions.ts                신규 (읽기)
│       ├── get-session-detail.ts           신규 (읽기)
│       ├── add-entry-by-song.ts            신규 (쓰기, 단일 tx — D-K)
│       └── add-entry-by-number.ts          ── 무변경 (R1) ──
├── infrastructure/repositories/
│   ├── drizzle-session-query.ts            신규: D-O 집계 + 상세 조인
│   └── drizzle-song-repo.ts                수정: findByIdForOwner
└── presentation/
    ├── api/schemas.ts                      수정: addEntrySchema 유니언, brand 삭제
    ├── container.ts                        수정: SessionQuery·유스케이스 3종 조립
    └── components/
        ├── songs/song-state.ts             신규: 순수 함수 2종 (§3.5)
        ├── songs/NumberCell.tsx            수정: commitDecision 이관 (동작 무변경)
        ├── songs/SearchResults.tsx         수정: 번호 우회 제거 → AddSongFlow
        ├── songs/AddSongFlow.tsx           신규: 3분기 공유 UI (D-R)
        ├── sessions/SessionList.tsx        신규
        ├── sessions/SessionDetailView.tsx  신규
        └── AppHeader.tsx                   수정: 지난 플리 진입점
src/app/
├── (app)/sessions/page.tsx                 신규: 목록 (RSC)
├── (app)/sessions/[id]/page.tsx            신규: 상세 (RSC + notFound)
└── api/
    ├── sessions/route.ts                   수정: GET 추가 (POST 기존 유지)
    ├── sessions/[id]/route.ts              신규: GET 상세
    ├── sessions/[id]/entries/route.ts      수정: 유니언 디스패치 (D-J)
    └── songs/search/route.ts               수정: brand 제거 (FR-17)
scripts/run-l1.mjs                          수정: #20~#28 append (§8.3 규약)
tests/song-state.test.ts 외                 신규·수정
docs/architect/ARCHITECT.md                 수정: §5.4 타인 분기 미구현 명시 (FR-20)
```

### 9.2 의존 규칙 점검

기존 ESLint 계층 경계를 그대로 만족한다. 유일하게 눈여겨볼 것: `song-state.ts`는 `@/domain`(Brand)과 `@/application/ports/song-query`(NumberView) **타입만** import한다 — presentation → application 방향은 기존 규칙상 허용(컴포넌트들이 이미 `SongListItem`을 쓴다).

### 9.3 세션 읽기 어댑터 스케치

```ts
// drizzle-session-query.ts — Neon HTTP(db), 읽기 전용 (D-C 승계)
async listByOwner(ownerId) {
  return db
    .select({ /* sessions 컬럼들 */, entryCount: count(entries.id) })
    .from(sessions)
    .leftJoin(entries, eq(entries.sessionId, sessions.id))
    .where(eq(sessions.ownerId, ownerId))
    .groupBy(sessions.id)
    .orderBy(desc(sessions.visitDate), desc(sessions.createdAt));  // D-O
}

async findDetail(ownerId, sessionId) {
  const row = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), eq(sessions.ownerId, ownerId)),
    with: { entries: {
      orderBy: asc(entries.position),
      with: { song: { with: { numbers: true } } },   // 양쪽 브랜드 통째로 (D-N)
    } },
  });
  return row ? toDetail(row) : null;   // numbers 배열 → Record<Brand, NumberView> (기존 toListItem 규칙)
}
```

---

## 10. Coding Convention Reference

### 10.1 신설 컨벤션

| # | 규칙 | 강제 수단 |
| --- | --- | --- |
| C-6 | **UI 상태 판정은 `song-state.ts` 같은 순수 함수 모듈에 둔다.** 컴포넌트 안 인라인 판정 금지 — 앞으로의 상태 머신도 여기 규칙을 따른다 | UNIT + 리뷰 |
| C-7 | `add-entry-by-number.ts` · `AddByNumber.tsx`는 이 사이클 diff에 나타나지 않는다 | 리뷰 (R1) |
| C-8 | 유니언 스키마 갈래는 전부 `.strict()` | UNIT SC-1 |

### 10.2 기존 승계

C-1~C-5(직전 사이클), `// Design Ref:` 주석, 에러 응답 형태, `withAuth()` 형태 강제 — 전부 그대로.

### 10.3 환경변수

**신규 없음.**

---

## 11. Implementation Guide

### 11.1 구현 순서

**module-1(순수 함수 분리)이 반드시 먼저다.** G-1 수정을 테스트로 고정한 뒤에 그 함수들 위에 3분기를 짓는다(Plan R4). 그다음 백엔드(포트→유스케이스→라우트)를 세우고 L1로 계약을 굳힌 뒤에 UI를 올린다.

### 11.2 Session Guide — Module Map

| 모듈 | 범위 | 산출 | 완료 판정 |
| --- | --- | --- | --- |
| **module-1** | `song-state.ts` 분리 + `NumberCell` 이관 | song-state.ts, NumberCell 수정, tests | `npm test` SS-1·SS-2 통과 (G-1 케이스 명기) |
| **module-2** | 포트·어댑터·유스케이스 | session-query.ts, song-repo +1, 어댑터, 유스케이스 3, container | `npm test` UC-1·UC-2·SC-1 통과 |
| **module-3** | API 라우트 + brand 제거 | sessions GET·[id] GET, entries 유니언, search 수정 | Vercel 빌드 통과 + L1 기존 19 회귀 0 |
| **module-4** | 지난 플리 UI | (app)/sessions 2페이지, SessionList·SessionDetailView, AppHeader | 수동: 목록→상세→AVAILABLE 가져오기 2탭 |
| **module-5** | AddSongFlow + 검색 이관 | AddSongFlow.tsx, SearchResults 수정 | 수동: 3분기 각 1회 + §8.5 |
| **module-6** | L1 확장·문서 | run-l1.mjs #20~#28, ARCHITECT §5.4 | Preview 전 케이스(19+9) 통과 |

**권장 세션 분할**: `module-1` → `module-2,3` → `module-4,5` → `module-6`
module-3까지 마치면 develop에 푸시해 **기존 L1 19케이스 회귀부터 확인**한 뒤 UI로 넘어간다 — 기존 엔트리 라우트를 건드리는 유일한 지점(유니언)이 module-3에 있다.

### 11.3 예상 변경량

| 구분 | 수 |
| --- | --- |
| 신규 파일 | 약 12 (포트 1 · 어댑터 1 · 유스케이스 3 · 라우트 1 · 페이지 2 · 컴포넌트 3 · song-state 1 · 테스트 1+) |
| 수정 파일 | 약 10 (라우트 3 · schemas · container · NumberCell · SearchResults · AppHeader · run-l1 · ARCHITECT) |
| 예상 증분 | 900~1,200줄 |

---

## Version History

| 버전 | 날짜 | 변경 | 작성자 |
| --- | --- | --- | --- |
| 0.1 | 2026-08-23 | 최초 작성. Checkpoint 3에서 **설계안 B(클린 분리)** 채택. Design 단계 확인으로 Plan ★ 4건 해소 — R2는 `TxRepos`에 이미 있는 배관으로 **단일 트랜잭션·왕복 1회** 확정(D-K), R1은 유니언 스키마로 기존 경로 바이트 보존(D-J) + 곡 소유권 확인 공백을 발견해 `findByIdForOwner` 신설(D-P), R5는 "표시는 기록대로·판정은 오늘 기준"(D-N), R6은 GROUP BY 단일 쿼리(D-O). "그냥 추가"가 번호 상태를 일절 건드리지 않음을 결정으로 명문화(D-S — M3 큐 계약 방어). 신규 에러 코드 0·마이그레이션 0건 | Claude |
