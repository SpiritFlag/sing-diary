# expand-song-catalog 설계서

> **요약**: 곡 카탈로그의 읽기(SongQuery)와 쓰기(SongRepo)를 포트 수준에서 가르고, 라우트를 `withAuth()`로 감싸 인증 누락을 구조적으로 불가능하게 만든 뒤, 그 위에 통합검색과 PC 곡 관리 표를 올린다.
>
> **프로젝트**: sing-diary
> **버전**: v1.1.0 (예정)
> **사이클**: expand-song-catalog
> **작성일**: 2026-08-23
> **상태**: Draft
> **계획서**: [expand-song-catalog.plan.md](./expand-song-catalog.plan.md)

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

### 1.1 설계 목표

1. **인증 누락을 컴파일·리뷰가 아니라 타입과 lint가 막는다** — 라우트가 5개에서 9개로 늘어나는 이 사이클에서.
2. **곡 카탈로그의 읽기와 쓰기를 다른 포트로 가른다** — 읽기는 조인된 뷰 모델(번호 2종 포함)이 필요하고, 쓰기는 3-state 불변식을 지켜야 한다. 한 인터페이스에 섞으면 둘 다 어중간해진다.
3. **M3 빈칸채우기 큐가 딛고 설 계약을 지킨다** — `title IS NULL`과 "번호 행 없음"이 이번 사이클의 신규 쓰기 경로에서도 유지된다.
4. **인라인 수정의 4초 지연을 셀 단위로 가린다** — 리스트 전체가 아니라.

### 1.2 설계 원칙

- **불변식은 가장 안쪽에서** — 3-state 규칙은 UI가 아니라 유스케이스와 Zod 스키마에서 강제하고, DB CHECK는 최후 방어선으로만 둔다.
- **owner 스코프는 시그니처로** — 읽기·쓰기 포트의 모든 메서드가 `ownerId`를 **첫 인자**로 받는다. 잊을 수 있는 자리에 두지 않는다.
- **경계는 한 번만 넘는다** — presentation이 infrastructure를 참조하는 지점은 여전히 `container.ts` 하나다.
- **관행을 규칙으로** — "라우트 첫 줄에 가드를 부른다"는 관행을 `withAuth()`라는 **형태**로 바꾸고, 그 형태를 ESLint가 강제한다.

### 1.3 근거 확인 (Plan ★ 불확실 지점의 해소)

Plan §5의 ★ 세 건 중 둘을 Design 단계에서 실측·확정했다.

#### ★ⓐ (R2) — `idx_songs_trgm` 사용 여부: **실측 완료. 결론은 "안 쓴다, 그래도 괜찮다"**

Neon dev DB에 직접 `EXPLAIN`을 날렸다. `songs` 행 수가 **1건**이라 자연 플랜은 무조건 Seq Scan이므로, `SET enable_seqscan = off`로 **인덱스가 쓸 수 있는 물건인지**를 갈랐다.

| # | 쿼리 | 플랜 | 해석 |
| --- | --- | --- | --- |
| A | `owner_id = $1 AND <표현식> ILIKE '%3자%'` (자연) | `Seq Scan on songs (cost=0.00..1.07)` | 1행짜리 테이블이므로 당연 |
| B | 위와 동일, `enable_seqscan=off` | `Index Scan using idx_songs_owner` + Filter | **owner 필터가 붙으면 플래너가 owner btree를 고른다** |
| C | owner + **2자** 키워드, seqscan off | B와 동일 | trgm 최소 길이 이슈가 **애초에 안 걸린다** |
| D | **owner 필터 없이** 표현식 ILIKE (3자), seqscan off | `Bitmap Index Scan on idx_songs_trgm` | **표현식 GIN은 살아 있고 정상 동작한다** |
| E | `owner_id AND (title ILIKE .. OR artist .. OR memo ..)` | B와 동일 | 결합 표현식을 고집할 실익이 **현 규모엔 없다** |

확인된 인덱스 정의(실물):

```
idx_songs_trgm | CREATE INDEX idx_songs_trgm ON public.songs USING gin (
  ((((COALESCE(title,''::text) || ' '::text) || COALESCE(artist,''::text)) || ' '::text)
   || COALESCE(memo,''::text)) gin_trgm_ops)
pg_trgm 버전: 1.6
```

**결정(D-H)**: 인덱스를 새로 만들지 않는다. **마이그레이션 0건**이다.
근거 — 이 앱은 owner 하나가 곧 전체 데이터의 1/N이고 N=1이 될 수도 있지만, 어차피 owner 파티션은 수백 건 규모다. `idx_songs_owner`로 좁힌 뒤 그 안을 필터링하는 것이 GIN 비트맵을 만드는 것보다 싸다. `owner_id`를 포함한 복합 GIN(`btree_gin` 확장 필요)은 ARCHITECT 설계 원칙 4("확장 가능성은 스키마로만 열어둔다")에 어긋나는 선제 최적화다.
**단, 결합 표현식은 그대로 쓴다** — 규모가 커져 trgm 경로가 필요해지는 날 쿼리를 바꾸지 않아도 되도록. 그러려면 §3.4의 표현식 상수화가 필수다.

> **미해소로 남는 것**: 위는 **1행짜리 dev DB**에서 잰 값이다. "인덱스를 쓸 수 있는가"는 확정됐지만 "실데이터에서 어느 쪽이 빠른가"는 확정되지 않았다. Analysis에서 시드를 늘려 재확인하지 않는다 — 현 규모에서 무의미하기 때문이다. 이 한계를 그대로 기록한다.

#### ★ⓒ (R6) — 가드 강제 수단: **커스텀 플러그인 없이 core ESLint로 된다**

`no-restricted-syntax` 셀렉터 두 개로 "핸들러가 `withAuth()`로 감싸여 있지 않으면 에러"를 표현할 수 있다(§7.2). 별도 플러그인 패키지도, 커스텀 룰 작성도 필요 없다. Plan D-E가 "실증 후 확정"이라 했으므로 **module-1에서 FR-15로 실증한 뒤 확정**하며, 실증 실패 시 §7.4의 폴백으로 내려간다.

#### R1(낙관적 UI 롤백) — 코드에서 위험의 실체를 확인했다

`src/presentation/components/playlist/Playlist.tsx`의 기존 낙관적 갱신 3곳(`handleScoreChange` · `handleDelete` · `handleDragEnd`)은 전부 **`prevEntries` = 리스트 전체를 스냅샷 떠서 실패 시 통째로 복원**한다. 세션 화면에서는 한 번에 한 조작만 하므로 안전하다. **표에서는 안전하지 않다** — 여러 셀이 동시에 저장 중일 수 있고, 4초 뒤 도착한 실패가 그 사이의 다른 성공을 덮는다. §5.3에서 셀 단위 롤백으로 대체한다.

---

## 2. Architecture Options

### 2.0 설계안 비교 (Checkpoint 3 완료)

| 기준 | A: 최소 변경 | B: 클린 분리 | C: 실용 균형 |
| --- | :-: | :-: | :-: |
| 수정 전송 | Server Action | **API 라우트 (전면 분리)** | API 라우트 |
| 라우트 파일 | 1 | **4** | 2 |
| 유스케이스 | 2 | **4** | 3 |
| 포트 | `SongRepo` 확장 | **읽기 Query / 쓰기 Repo 분리** | `SongRepo` 확장 |
| 가드 강제 | ESLint만 | **`withAuth` wrapper + ESLint 백스톱** | ESLint 우선, wrapper 폴백 |
| 신규/수정 파일 | ~5 / ~6 | **~14 / ~11** | ~9 / ~7 |
| first-take §7 준수 | ❌ 위배 | ✅ | ✅ |

**선택: B — 클린 분리** (사용자 결정, Checkpoint 3)

**채택 사유**: A는 가드 강제를 넣는 사이클에 **강제 밖 경로(Server Action)를 새로 만드는 자기모순**이라 탈락. B와 C의 실질 차이는 "wrapper를 쓰느냐"인데, wrapper는 ESLint 규칙과 **배타적이지 않고 상보적**이다 — wrapper가 형태를 만들고 ESLint가 그 형태를 강제한다. 이 조합이 FR-14를 가장 확실히 만족한다.

**대가로 지는 것 (숨기지 않는다)**
1. **refine-auth-boundary의 D-C/D-D를 부분적으로 뒤집는다** — §2.3 D-A에 결정 기록으로 남긴다.
2. 파일이 C 대비 약 1.5배 늘어난다. 1인 앱에 CQRS-lite는 과할 수 있다 — 다만 읽기 뷰 모델(번호 2종 조인)과 쓰기 불변식(3-state)이 실제로 다른 모양이라 명분은 있다.
3. **Checkpoint 3 시점 추정(라우트 3개)이 설계 중 4개로 늘었다** — 3-state를 REST로 정직하게 표현하면 번호 조작이 별도 리소스가 되기 때문이다(§4.1). 추정 오차를 그대로 기록한다.

### 2.1 컴포넌트 다이어그램

```
┌──────────────────────── presentation ────────────────────────┐
│  (app)/songs/page.tsx          (app)/songs/search/page.tsx   │
│        │ RSC                          │ RSC                   │
│        ▼                              ▼                       │
│  SongTable (client)             SearchResults (client)        │
│    └ InlineCell                   └ AddButton                 │
│        │ fetch                        │ fetch                 │
│        ▼                              ▼                       │
│  src/app/api/songs/**  ── 전부 withAuth()로 감싼다 ──────────  │
│        │                                                      │
│        ├── auth/with-auth.ts  (ownerId 주입 + mapError)        │
│        └── container.ts       (조립 지점, 유일)                │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────────────── application ─────────────────────────┐
│  use-cases: searchSongs · listSongs · updateSongMeta          │
│             · setSongNumber                                   │
│  ports:  SongQuery (읽기, 신규)   SongRepo (쓰기, 확장)        │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌────────────────────── infrastructure ────────────────────────┐
│  drizzle-song-query.ts (신규)   drizzle-song-repo.ts (확장)   │
│         │ Neon HTTP (읽기)            │ pg Pool (쓰기, tx)     │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
                    songs · song_numbers  (스키마 무변경)
```

### 2.2 데이터 흐름

**검색 (읽기)**

```
검색어 입력 → GET /api/songs/search?q=&brand=
  → withAuth: requireOwnerId() → ownerId
  → searchSongs(ownerId, keyword, brand)
  → SongQuery.search: owner 스코프 + 이스케이프된 ILIKE + 번호 2종 조인
  → SongListItem[] (각 행에 brand 기준 numberState 포함)
  → 결과 목록. numberState === "AVAILABLE"인 행만 [추가] 활성
```

**인라인 수정 (쓰기, 셀 단위 낙관적)**

```
셀 확정(blur/Enter)
  → 셀만 낙관적 반영 + prevValue 보관 + 그 셀 잠금(readOnly)
  → PATCH /api/songs/[id]  또는  PUT|DELETE /api/songs/[id]/numbers/[brand]
  → (4초대)
  ├ 성공: 응답의 확정값으로 셀 갱신, 잠금 해제. router.refresh() 호출 안 함
  └ 실패: 그 셀만 prevValue로 복원 + 토스트. 다른 셀은 건드리지 않음
```

### 2.3 의존성 · 결정 기록

| # | 결정 | 선택 | 근거 |
| --- | --- | --- | --- |
| **D-A** | **refine-auth-boundary D-C/D-D의 부분 번복** | 가드 호출을 라우트 본문에서 **`withAuth()` wrapper 안으로** 옮긴다 | 직전 사이클은 "미들웨어 경로매칭 → 리소스 기반"이 요지였고, `withAuth()`는 **여전히 리소스(라우트) 쪽에서** 호출된다. 경로 매칭으로 되돌아가는 것이 아니다. 바뀌는 것은 호출 위치가 핸들러 첫 줄에서 그 핸들러를 감싼 함수로 옮겨간다는 것뿐이며, 그 대가로 **누락이 형태상 불가능**해진다. Clerk가 지적한 "경로 매칭과 실제 라우팅의 괴리" 위험은 재도입되지 않는다 |
| **D-B** | 읽기/쓰기 포트 분리 | `SongQuery`(읽기) 신설, `SongRepo`(쓰기) 확장 | 읽기는 번호 2종이 조인된 **뷰 모델**이 필요하고 쓰기는 3-state **불변식**을 지켜야 한다. 한 인터페이스에 넣으면 `SongRepo`가 도메인 모델과 뷰 모델을 동시에 뱉게 된다 |
| **D-C** | 읽기 경로의 DB 드라이버 | 읽기는 **Neon HTTP**(기존 `db`), 쓰기는 **pg Pool**(기존 `txRunner`) | first-take Design §3.4의 현행 구조를 그대로 승계. 이번 사이클은 이 구조를 건드리지 않는다(백로그 `baea17b1` 몫) |
| **D-D** | 번호 조작의 API 표현 | **별도 하위 리소스** `PUT`/`DELETE /api/songs/[id]/numbers/[brand]` | 3-state의 "행 없음"을 정직하게 표현하는 유일한 방법이 `DELETE`다. `PATCH` 본문에 `null`을 섞으면 "비움"과 "미변경"이 구분되지 않는다(JSON에서 둘 다 표현 가능하나 클라이언트가 헷갈린다) |
| **D-E** | 타 owner 리소스 접근 응답 | **404 `SONG_NOT_FOUND`** (403 아님) | 403은 "존재는 한다"를 누설한다. owner 스코프 조회에서 안 나오면 없는 것으로 취급한다 |
| **D-F** | NULL 정규화 지점 | **Zod 스키마의 `.transform()` 단일 지점** | Plan D-F 확정. 컴포넌트·유스케이스·repo에 흩으면 R4가 반드시 터진다. 스키마 하나만 테스트하면 전 경로가 고정된다 |
| **D-G** | 낙관적 롤백 단위 | **셀 단위 + 저장 중 셀 잠금** | §1.3 R1 참조. 리스트 전체 스냅샷 복원은 표에서 다른 셀 편집을 덮어쓴다. 잠금을 걸면 "덮어쓸 상황" 자체가 성립하지 않는다 |
| **D-H** | trgm 인덱스 대응 | **인덱스 신설 없음, 결합 표현식 유지** | §1.3 ★ⓐ 실측 근거 |
| **D-I** | 표 화면의 레이아웃 | **기존 `(app)` 레이아웃 재사용** | 별도 라우트 그룹을 만들면 `ToastProvider`·`AppHeader`·세션 컨텍스트가 이중이 된다. 표는 `overflow-x-auto` 컨테이너 안에서 가로 스크롤한다 |
| **D-J** | stub 정렬 위치 | **맨 앞** (`title ASC NULLS FIRST`) | 표의 실질 용도가 stub 메꾸기다. 제목 없는 곡을 맨 뒤로 밀면 정작 고쳐야 할 것이 안 보인다(Plan R10) |
| **D-K** | 성공 후 `router.refresh()` | **호출하지 않는다** (표에 한해) | 인라인 수정은 연타된다. 매번 RSC 전체를 재요청하면 4초짜리 왕복이 겹쳐 쌓인다. 응답의 확정값으로 셀만 갱신한다. `Playlist.tsx`의 기존 동작은 그대로 둔다 |

---

## 3. Data Model

### 3.1 DB 스키마

**변경 없음. 마이그레이션 0건.** (§1.3 D-H)

`songs` · `song_numbers`를 그대로 쓴다. 다만 이번 사이클이 처음으로 이 테이블들에 **수정**을 가하므로 아래 두 제약이 실질적으로 시험대에 오른다.

```
song_numbers:  PRIMARY KEY (song_id, brand)
               CHECK (status <> 'AVAILABLE' OR number IS NOT NULL)
songs:         title/artist/memo 는 NULL 허용, 빈 문자열 금지 (코드 계약)
```

`songs.updated_at`은 `$onUpdate`가 없다(Plan §1.3-4). **쓰기 경로에서 명시적으로 `new Date()`를 세팅한다.**

### 3.2 읽기 포트 (`src/application/ports/song-query.ts`, 신규)

```ts
import type { Brand, NumberStatus } from "@/domain";

/** 번호 3-state의 읽기 표현. null = 행 없음(아직 입력 안 함) */
export type NumberView = { status: NumberStatus; number: string | null } | null;

export interface SongListItem {
  id: string;
  title: string | null;
  artist: string | null;
  memo: string | null;
  numbers: Record<Brand, NumberView>;   // { TJ: ..., KY: ... } 항상 두 키 모두 존재
  updatedAt: Date;
}

export interface SongQuery {
  /** owner 스코프 통합검색. keyword는 이미 trim된 비어있지 않은 문자열 */
  search(ownerId: string, keyword: string): Promise<SongListItem[]>;
  /** owner 스코프 전체 목록. 정렬: title NULLS FIRST → artist NULLS FIRST */
  list(ownerId: string): Promise<SongListItem[]>;
  /** 수정 후 확정값 반환용 단건 조회. 타 owner면 null */
  findById(ownerId: string, songId: string): Promise<SongListItem | null>;
}
```

> `numbers`가 `Record<Brand, NumberView>`인 이유: 브랜드별로 "행 없음"이 유효한 상태라서, 배열로 주면 소비자가 매번 `find`한 뒤 `undefined` 처리를 해야 한다. 두 키를 항상 채워 보내 3-state를 타입으로 드러낸다.

### 3.3 쓰기 포트 (`src/application/ports/song-repo.ts`, 확장)

```ts
export interface SongMetaPatch {
  title?: string | null;    // 키 부재 = 미변경, null = 비움
  artist?: string | null;
  memo?: string | null;
}

/** 번호 조작의 3-state 표현 — "행 없음"은 clearNumber()가 담당한다 */
export type NumberInput =
  | { status: "AVAILABLE"; number: string }   // number 필수 (빈 문자열 불가)
  | { status: "UNSUPPORTED" };                // number 없음

export interface SongRepo {
  // 기존
  findByOwnerBrandNumber(ownerId, brand, number): Promise<Song | null>;
  createStubWithNumber(ownerId, brand, number): Promise<Song>;

  // 신규 — 전부 ownerId 우선, 타 owner면 0 rows affected
  updateMeta(ownerId: string, songId: string, patch: SongMetaPatch): Promise<boolean>;
  setNumber(ownerId: string, songId: string, brand: Brand, input: NumberInput): Promise<boolean>;
  clearNumber(ownerId: string, songId: string, brand: Brand): Promise<boolean>;
}
```

세 신규 메서드의 반환 `boolean`은 **"해당 owner의 곡을 실제로 건드렸는가"** 다. `false`면 유스케이스가 `SONG_NOT_FOUND`를 던진다(D-E).

### 3.4 검색 표현식의 상수화 (D-H의 전제)

인덱스 표현식과 쿼리 표현식이 어긋나면 §1.3 D의 경로가 영영 닫힌다. **한 곳에서만 정의한다.**

```ts
// src/infrastructure/repositories/drizzle-song-query.ts
// Design Ref: §1.3 ★ⓐ — drizzle/0001_cool_next_avengers.sql:49 의 idx_songs_trgm 표현식과
// 문자열이 일치해야 한다. 여기를 고치면 마이그레이션도 함께 고칠 것.
const SEARCH_EXPR = sql`(coalesce(${songs.title},'') || ' ' || coalesce(${songs.artist},'') || ' ' || coalesce(${songs.memo},''))`;
```

**ILIKE 패턴 이스케이프 (Plan R9)** — 파라미터 바인딩은 SQL 인젝션을 막을 뿐 `%`·`_`는 여전히 와일드카드다.

```ts
function toLikePattern(keyword: string): string {
  return "%" + keyword.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
}
// ... ILIKE ${pattern} ESCAPE '\\'
```

---

## 4. API Specification

### 4.1 엔드포인트 목록

| # | 메서드 · 경로 | 용도 | 성공 |
| --- | --- | --- | --- |
| 1 | `GET /api/songs/search?q={keyword}&brand={TJ\|KY}` | 통합검색. `brand` 지정 시 각 행의 해당 브랜드 번호 상태로 추가 가능 여부 판정 | 200 `{ data: SongListItem[] }` |
| 2 | `GET /api/songs` | 곡 관리 표용 전체 목록 (정렬 고정, D-J) | 200 `{ data: SongListItem[] }` |
| 3 | `PATCH /api/songs/{id}` | 메타(title·artist·memo) 인라인 수정 | 200 `{ data: SongListItem }` |
| 4 | `PUT /api/songs/{id}/numbers/{brand}` | 번호를 AVAILABLE 또는 UNSUPPORTED로 확정 | 200 `{ data: SongListItem }` |
| 5 | `DELETE /api/songs/{id}/numbers/{brand}` | 번호 행 삭제 = "아직 입력 안 함" | 200 `{ data: SongListItem }` |

**라우트 파일 4개**: `search/route.ts` · `route.ts` · `[id]/route.ts` · `[id]/numbers/[brand]/route.ts` (4·5는 한 파일의 두 핸들러).

기존 5개 라우트는 **경로·응답 무변경**, `withAuth()` 이관만 한다.

### 4.2 요청 스키마 (`src/presentation/api/schemas.ts` 추가분)

```ts
// 빈 문자열 → null 정규화의 단일 지점 (D-F, Plan R4)
const nullableText = (max: number) =>
  z.string().max(max).transform((v) => (v.trim() === "" ? null : v.trim())).nullable();

export const searchSongsQuerySchema = z.object({
  q: z.string().trim().min(1, "검색어를 입력하세요").max(100),
  brand: z.enum(["TJ", "KY"]).optional(),
});

export const updateSongMetaSchema = z
  .object({
    title: nullableText(200).optional(),
    artist: nullableText(200).optional(),
    memo: nullableText(500).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "변경할 필드가 없습니다");

// 3-state를 타입으로 강제 — AVAILABLE엔 번호 필수, UNSUPPORTED엔 번호 금지 (Plan R3)
export const setSongNumberSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("AVAILABLE"), number: z.string().trim().min(1).max(10) }),
  z.object({ status: z.literal("UNSUPPORTED") }),
]);

export const brandParamSchema = z.enum(["TJ", "KY"]);
```

### 4.3 에러 계약

기존 `error-mapper.ts` 형태(`{ error: { code, message, details } }`)를 그대로 쓴다. **신규 코드 1종**:

| 코드 | HTTP | 발생 조건 |
| --- | --- | --- |
| `SONG_NOT_FOUND` | 404 | 해당 곡이 없거나 **타 owner의 곡** (D-E) |
| `VALIDATION_ERROR` | 400 | 빈 검색어, AVAILABLE인데 번호 없음, 변경 필드 없음, 잘못된 brand |
| `UNAUTHORIZED` | 401 | 무인증 — `withAuth()`가 `mapError`로 넘김 |

**변경 파일**: `src/domain/errors.ts`의 `DomainErrorCode`에 `SONG_NOT_FOUND` 추가, `error-mapper.ts`의 `DOMAIN_HTTP_STATUS`에 `SONG_NOT_FOUND: 404`, `ApiErrorCode` union에 추가.

---

## 5. UI/UX Design

### 5.1 화면 목록

| 화면 | 경로 | 대상 | 비고 |
| --- | --- | --- | --- |
| 곡 검색 | `(app)/songs/search` | 모바일 | 열린 세션이 있으면 그 브랜드로 `?brand=` 전달 |
| 곡 관리 | `(app)/songs` | PC 우선 | 첫 데스크톱 화면. `(app)` 레이아웃 재사용(D-I) |

`AppHeader`에 두 화면으로 가는 진입점을 추가한다.

### 5.2 사용자 흐름

**검색 → 추가 (2탭, Plan NFR)**

```
[헤더 검색 진입] → 키워드 입력 → 결과 목록
   ├ numberState=AVAILABLE  → [추가] 활성 → 탭 1회로 오늘의 플리에 들어감
   ├ numberState=UNSUPPORTED → 버튼 비활성 + "이 기기에선 미지원"
   ├ numberState=null(행 없음) → 버튼 비활성 + "번호가 아직 없어요"
   └ 열린 세션 없음 → 추가 열 자체를 렌더하지 않음
```

> 비활성 버튼에는 **왜 못 누르는지**를 반드시 붙인다. 조용히 죽은 버튼은 고장으로 읽힌다.
> 번호 입력 제안 → AVAILABLE 전환 경로는 **다음 사이클**(§5.2 변환 3분기).

**표 인라인 수정**

```
셀 탭 → 편집 → blur/Enter로 확정
  → 즉시 반영 + 셀 흐림(저장 중) + 그 셀만 readOnly
  → 성공: 확정값으로 갱신, 잠금 해제
  → 실패: 그 셀만 원복 + 토스트
```

### 5.3 셀 단위 낙관적 갱신 (D-G · Plan R1의 해소)

**금지**: `Playlist.tsx`처럼 `const prev = rows; setRows(...); ... setRows(prev)` 하는 **전체 스냅샷 복원**. 표에서는 4초 뒤 도착한 실패가 그 사이의 다른 성공을 되돌린다.

**채택**: 셀 키(`${songId}:${field}`) 단위 관리.

```ts
type CellKey = `${string}:${"title" | "artist" | "memo" | "TJ" | "KY"}`;

const [rows, setRows] = useState<SongListItem[]>(initial);
const [pending, setPending] = useState<Map<CellKey, unknown>>(new Map()); // key → prevValue

async function commitCell(key: CellKey, next: unknown, send: () => Promise<Response>) {
  if (pending.has(key)) return;                 // 저장 중인 셀은 재편집 불가 (잠금)
  const prev = readCell(rows, key);
  setPending((m) => new Map(m).set(key, prev));
  setRows((rs) => writeCell(rs, key, next));    // 그 셀만
  try {
    const res = await send();
    if (!res.ok) throw new Error(await parseErrorMessage(res, "저장에 실패했어요"));
    const { data } = await res.json();
    setRows((rs) => replaceRow(rs, data));      // 서버 확정값 — 그 행만
  } catch (e) {
    setRows((rs) => writeCell(rs, key, prev));  // 그 셀만 원복
    toast.show(String(e instanceof Error ? e.message : e));
  } finally {
    setPending((m) => { const n = new Map(m); n.delete(key); return n; });
  }
}
```

**핵심은 `if (pending.has(key)) return`이다.** 저장 중인 셀을 잠그면 "롤백이 사용자 입력을 덮어쓰는" 상황이 **성립할 수 없다.** 다른 셀은 자유롭게 편집되며 서로 간섭하지 않는다.

`replaceRow`가 행 전체를 서버 값으로 갈아끼우므로, **같은 행의 다른 셀이 저장 중이면 그 셀은 건너뛴다**(pending에 있는 셀은 로컬 값 유지). 이 예외 처리를 빠뜨리면 같은 행 두 셀을 연달아 고칠 때 앞선 편집이 되돌아간다.

### 5.4 번호 셀의 3-state 조작 (Plan R3)

| 표시 | 의미 | 사용자 조작 | 호출 |
| --- | --- | --- | --- |
| `12345` | AVAILABLE | 숫자 고쳐 확정 | `PUT .../numbers/TJ` `{status:"AVAILABLE", number:"12345"}` |
| `미지원` 칩 | UNSUPPORTED | [미지원] 토글 | `PUT .../numbers/TJ` `{status:"UNSUPPORTED"}` |
| `—` (흐림) | 행 없음 | 값을 지우고 확정 | `DELETE .../numbers/TJ` |

**"비움"과 "미지원"은 서로 다른 조작이다.** 입력칸을 비우는 것이 곧 미지원이 되어서는 안 된다 — 그렇게 되면 M3 큐 A가 그 곡을 영영 못 찾는다. UI에서 [미지원]은 **명시적 토글 버튼**으로만 도달한다.

### 5.5 Page UI Checklist

**`(app)/songs/search`**
- [ ] 검색 입력 (자동 포커스, `inputMode` 기본)
- [ ] 빈 키워드로는 요청하지 않는다 (400을 UI에서 미리 막는다)
- [ ] 결과 0건 안내 문구
- [ ] 각 행: 제목(또는 "제목 없음") · 아티스트 · 번호 상태 · [추가]
- [ ] 비활성 [추가]에 사유 문구
- [ ] 열린 세션 없을 때의 안내

**`(app)/songs`**
- [ ] 표 헤더: TJ · KY · 제목 · 아티스트 · 메모
- [ ] 정렬 제목 NULLS FIRST → 아티스트 (D-J)
- [ ] `overflow-x-auto` 컨테이너 (좁은 화면에서 body 가로 스크롤 금지)
- [ ] 셀 편집 · 저장 중 표시 · 잠금
- [ ] 검색 입력 (같은 표를 필터링)
- [ ] 0건일 때 안내

---

## 6. Error Handling

### 6.1 매핑 변경분

`error-mapper.ts`에 `SONG_NOT_FOUND: 404` 한 줄과 union 한 항목이 추가된다. **`mapError`의 나머지 로직은 무변경.**

### 6.2 `withAuth()`가 에러를 삼키지 않는 보장

```ts
// src/presentation/auth/with-auth.ts
export function withAuth<C>(
  handler: (ctx: { ownerId: string }, req: Request, routeCtx: C) => Promise<Response>,
) {
  return async (req: Request, routeCtx: C): Promise<Response> => {
    try {
      const ownerId = await requireOwnerId();   // UnauthorizedError → 401
      return await handler({ ownerId }, req, routeCtx);
    } catch (error) {
      return mapError(error);                    // Zod·Domain·PG 전부 여기로
    }
  };
}
```

핸들러 본문에서 `try/catch`를 없앤다 — wrapper가 유일한 경계다. **`next/navigation`의 `redirect()`류를 이 안에서 절대 호출하지 않는다**(refine-auth-boundary가 확인한 함정: `redirect()`는 예외를 던지므로 `catch`에 삼켜진다). 페이지 리다이렉트는 여전히 `page-guard.ts` 몫이며 이 wrapper와 무관하다.

### 6.3 owner 스코프 누락 방지 (Plan R5)

| 지점 | 보장 수단 |
| --- | --- |
| 포트 시그니처 | 모든 신규 메서드의 **첫 인자가 `ownerId`** — 생략하면 타입 에러 |
| 쿼리 | `SongQuery` 3개 메서드 전부 `where(eq(songs.ownerId, ownerId))` 필수 |
| 쓰기 | `updateMeta`·`setNumber`·`clearNumber`가 `songs.owner_id` 조건 없이는 0행을 건드림 → `false` → 404 |
| 실측 | L1 신규 케이스에서 **타 owner 곡이 검색에 안 나오고 수정도 404** 임을 확인 (§8.2) |

---

## 7. Security Considerations

### 7.1 이번 사이클이 새로 여는 노출면

1. **다수 행 조회** — 지금까지 조회는 단건·세션 스코프뿐이었다. 검색·목록은 테이블을 훑는다. §6.3이 이에 대한 방어다.
2. **곡 수정** — 처음 생기는 곡 쓰기 경로. 타 owner 곡 수정 시도는 404(D-E).
3. **라우트 4개 증가** — FR-14의 존재 이유.

### 7.2 `withAuth` 강제 — ESLint 백스톱 (★ⓒ)

커스텀 플러그인 없이 core `no-restricted-syntax` 두 개로 표현된다.

```js
// eslint.config.mjs 추가 블록
const apiRouteGuard = {
  files: ["src/app/api/**/route.ts"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        // ① export async function GET(...) 형태 금지
        selector:
          "ExportNamedDeclaration > FunctionDeclaration[id.name=/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/]",
        message:
          "라우트 핸들러는 `export const GET = withAuth(...)` 형태여야 한다 (expand-song-catalog §7.2).",
      },
      {
        // ② export const GET = <withAuth 아닌 것> 금지
        selector:
          "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.name=/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/]:not([init.callee.name='withAuth'])",
        message:
          "라우트 핸들러는 withAuth()로 감싸야 한다 — 인증 가드 누락 방지 (expand-song-catalog §7.2).",
      },
    ],
  },
};
```

**한계를 정직하게 적는다**: ①②는 *형태*를 강제할 뿐 `withAuth`가 **정말로 그 이름의 우리 함수인지**는 보증하지 않는다(동명의 다른 함수를 import하면 통과한다). 그러나 그건 의도적 우회이지 실수가 아니다. 이 규칙이 막으려는 것은 **실수로 빠뜨리는 것**이며, 그 목적에는 충분하다.

### 7.3 FR-15 실증 절차 (module-1에서 수행, 결과를 Analysis에 원문 기록)

```
1. src/app/api/__guard-probe/route.ts 에 `export async function GET() { return Response.json({}) }` 작성
2. npm run lint  → 규칙 ①에 걸리는지 확인 (출력 캡처)
3. `export const GET = async () => ...` 로 고침
4. npm run lint  → 규칙 ②에 걸리는지 확인 (출력 캡처)
5. `export const GET = withAuth(async () => ...)` 로 고침 → lint 통과 확인
6. 프로브 파일 삭제 (커밋에 남기지 않는다)
```

### 7.4 폴백 (§7.2가 실증에 실패하면)

셀렉터가 동작하지 않으면 — 우선순위대로 —
1. 셀렉터를 단순화한다(②만 유지, ①은 포기).
2. 그래도 안 되면 **wrapper만 도입하고 lint 강제는 포기**한다. 이 경우 FR-14는 **미충족**으로 Analysis에 기록한다. `withAuth`가 형태를 통일하므로 리뷰 난이도는 낮아지지만, 그것은 "도구가 검출한다"가 아니다.
3. 되는 척하지 않는다.

---

## 8. Test Plan

### 8.1 범위

| 레벨 | 대상 | 수단 |
| --- | --- | --- |
| UNIT | Zod 정규화(D-F), 3-state 판정, ILIKE 이스케이프, 유스케이스 4종 | Vitest |
| LINT | `withAuth` 강제 규칙 | §7.3 실증 |
| L1 | 신규 API 5종 + 기존 9케이스 회귀 | `npm run l1` (Preview) |
| 수동 | 셀 잠금·롤백, 표 반응형 | Analysis에 결과 기록 |

### 8.2 L1 신규 케이스

기존 `#1~#9`는 **번호·판정식 무변경**. 아래를 뒤에 잇는다.

| # | 시나리오 | 기대 |
| --- | --- | --- |
| 10 | `GET /api/songs/search?q=x` 미인증 | 401 + `UNAUTHORIZED` |
| 11 | `GET /api/songs/search?q=` (빈 키워드) 인증 | 400 + `VALIDATION_ERROR` |
| 12 | `GET /api/songs` 인증 | 200, `data`가 배열 |
| 13 | `GET /api/songs/search?q={시드곡 메모의 일부}` | 200, 해당 곡이 결과에 포함 (**memo 매칭 확인** — FR-01의 핵심) |
| 14 | `GET /api/songs/search?q={타 owner 곡 제목}` | 200, **결과에 없음** (R5 실측) |
| 15 | `PATCH /api/songs/{타 owner 곡 id}` | **404 + `SONG_NOT_FOUND`** |
| 16 | `PUT .../numbers/TJ` `{status:"AVAILABLE", number:""}` | 400 |
| 17 | `PUT .../numbers/TJ` `{status:"UNSUPPORTED"}` → `GET /api/songs` | 해당 곡 `numbers.TJ.status === "UNSUPPORTED"` |
| 18 | `DELETE .../numbers/TJ` → `GET /api/songs` | 해당 곡 `numbers.TJ === null` (**행 삭제 확인** — R3의 핵심) |
| 19 | `PATCH /api/songs/{id}` `{title:"  "}` → 재조회 | `title === null` (**빈 문자열 아님** — R4의 핵심) |

### 8.3 시드와 정리 — Plan 문구로부터의 **의도적 편차**

Plan §2.1-E와 §9-4는 "`finally` 정리 블록은 손대지 않는다"고 못박았다. 그러나 #14·#15가 **타 owner 곡**을 요구하므로 시드와 그 정리가 불가피하다. 편차를 숨기지 않고 조건을 붙인다.

- 타 owner 시드는 L1 스크립트가 **직접 만든 1건**뿐이며, 생성 시 받은 **id를 변수에 보관**한다.
- `finally`에서의 삭제는 **그 id 하나만** 대상으로 한다. `owner_id`나 다른 조건으로 범위 삭제하지 않는다.
- **기존 삭제문은 한 줄도 수정하지 않고** 그 아래에 append한다.
- first-take가 낸 사고(범위 없는 delete)의 재발 조건은 "조건절로 지우는 것"이었다. id 화이트리스트는 그 조건에 해당하지 않는다.

### 8.4 UNIT 케이스

| ID | 대상 | 확인 |
| --- | --- | --- |
| SN-1 | `updateSongMetaSchema` | `"  "` → `null`, `"곡"` → `"곡"`, 빈 객체 → 실패 |
| SN-2 | `setSongNumberSchema` | AVAILABLE+빈번호 실패, UNSUPPORTED+번호 동봉 실패 |
| SQ-1 | `toLikePattern` | `%`·`_`·`\` 이스케이프, 앞뒤 `%` 부착 |
| UC-1 | `updateSongMeta` | repo가 `false` 반환 시 `SONG_NOT_FOUND` throw |
| UC-2 | `setSongNumber` / `clearNumber` | 동일 |

### 8.5 수동 확인 (Analysis에 기록)

- 같은 행의 두 셀을 연달아 수정 → 앞선 편집이 되돌아가지 않는가 (§5.3 `replaceRow` 예외)
- 저장 중 셀 재편집 시도 → 잠겨 있는가
- 네트워크를 끊고 셀 확정 → 그 셀만 원복되고 다른 셀은 그대로인가
- 좁은 화면에서 표가 body 가로 스크롤을 만들지 않는가

---

## 9. Clean Architecture

### 9.1 계층 배치

```
src/
├── domain/
│   └── errors.ts                              수정: SONG_NOT_FOUND 추가
├── application/
│   ├── ports/
│   │   ├── song-query.ts                      신규: 읽기 포트 (D-B)
│   │   └── song-repo.ts                       수정: 쓰기 3메서드 추가
│   └── use-cases/
│       ├── search-songs.ts                    신규
│       ├── list-songs.ts                      신규
│       ├── update-song-meta.ts                신규
│       └── set-song-number.ts                 신규 (set/clear 겸용)
├── infrastructure/repositories/
│   ├── drizzle-song-query.ts                  신규: 읽기 어댑터 + SEARCH_EXPR
│   └── drizzle-song-repo.ts                   수정: 쓰기 3메서드
└── presentation/
    ├── auth/with-auth.ts                      신규: 가드 wrapper (D-A)
    ├── api/schemas.ts                         수정: 스키마 3종
    ├── api/error-mapper.ts                    수정: SONG_NOT_FOUND 매핑
    ├── container.ts                           수정: SongQuery·유스케이스 조립
    ├── components/songs/                      신규: SongTable · InlineCell · NumberCell
    │                                                · SearchBox · SearchResults
    └── ...
src/app/
├── (app)/songs/page.tsx                       신규: 표 (RSC → SongTable)
├── (app)/songs/search/page.tsx                신규: 검색
└── api/songs/
    ├── route.ts                               신규: GET 목록
    ├── search/route.ts                        신규: GET 검색
    ├── [id]/route.ts                          신규: PATCH 메타
    └── [id]/numbers/[brand]/route.ts          신규: PUT · DELETE
src/app/api/{기존 5종}/route.ts                 수정: withAuth 이관
eslint.config.mjs                              수정: apiRouteGuard 블록
scripts/run-l1.mjs                             수정: #10~#19 추가 (§8.3 조건)
docs/architect/ARCHITECT.md                    수정: §4.1 인덱스 표기 정정 (FR-17)
```

### 9.2 의존 규칙 점검

기존 ESLint 계층 경계 4블록을 **그대로 만족**한다.

| 신규 파일 | 참조 | 위반? |
| --- | --- | --- |
| `application/ports/song-query.ts` | `@/domain`만 | ✅ |
| `application/use-cases/*.ts` | `@/domain`, 자신의 ports | ✅ |
| `infrastructure/repositories/drizzle-song-query.ts` | `@/domain`, `@/application/ports`, drizzle | ✅ |
| `presentation/auth/with-auth.ts` | `@/presentation/*`만 (`container`의 `requireOwnerId`, `error-mapper`) | ✅ |
| `src/app/api/**` | `@/presentation/container`, `@/presentation/auth/with-auth` | ✅ |

> `zod`는 application에서 금지되어 있다(`applicationBoundaries`). 스키마는 presentation에만 둔다 — D-F의 정규화 지점이 presentation이라는 뜻이며, 유스케이스는 **이미 정규화된 값**을 받는다.

### 9.3 코드 스케치

**라우트 (표준 형태 — 모든 신규 라우트가 이 모양이다)**

```ts
// src/app/api/songs/search/route.ts
// Design Ref: §4.1, §7.2 — withAuth가 유일한 인증·에러 경계
import { NextResponse } from "next/server";
import { withAuth } from "@/presentation/auth/with-auth";
import { searchSongsQuerySchema } from "@/presentation/api/schemas";
import { useCases } from "@/presentation/container";

export const GET = withAuth(async ({ ownerId }, req) => {
  const url = new URL(req.url);
  const { q } = searchSongsQuerySchema.parse({
    q: url.searchParams.get("q") ?? "",
    brand: url.searchParams.get("brand") ?? undefined,
  });
  const data = await useCases.searchSongs(ownerId, q);
  return NextResponse.json({ data });
});
```

**유스케이스 (owner 스코프와 404를 여기서 확정)**

```ts
// src/application/use-cases/update-song-meta.ts
// Design Ref: §3.3, §4.3 D-E — repo가 0행이면 타 owner이거나 없는 곡. 둘을 구분하지 않는다.
import { DomainError } from "@/domain";
import type { SongRepo, SongMetaPatch } from "@/application/ports/song-repo";
import type { SongQuery, SongListItem } from "@/application/ports/song-query";

export function createUpdateSongMeta(repo: SongRepo, query: SongQuery) {
  return async (ownerId: string, songId: string, patch: SongMetaPatch): Promise<SongListItem> => {
    const touched = await repo.updateMeta(ownerId, songId, patch);
    if (!touched) throw new DomainError("SONG_NOT_FOUND", "곡을 찾을 수 없습니다");
    const fresh = await query.findById(ownerId, songId);
    if (!fresh) throw new DomainError("SONG_NOT_FOUND", "곡을 찾을 수 없습니다");
    return fresh;   // D-K — 클라이언트가 이 확정값으로 셀을 갱신한다
  };
}
```

**쓰기 어댑터 — 3-state와 `updated_at`**

```ts
// drizzle-song-repo.ts (추가분)
// Design Ref: §3.1 — updated_at은 $onUpdate가 없으므로 명시적으로 쓴다 (Plan §1.3-4)
async updateMeta(ownerId, songId, patch) {
  const res = await db.update(songs)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(songs.id, songId), eq(songs.ownerId, ownerId)))
    .returning({ id: songs.id });
  return res.length > 0;
}

// Design Ref: §5.4, ARCHITECT §4.2 — 3-state. "행 없음"은 clearNumber가 담당한다.
async setNumber(ownerId, songId, brand, input) {
  if (!(await this.ownsSong(ownerId, songId))) return false;
  await db.insert(songNumbers)
    .values({ songId, brand, ...(input.status === "AVAILABLE"
      ? { number: input.number, status: "AVAILABLE" as const }
      : { number: null, status: "UNSUPPORTED" as const }) })
    .onConflictDoUpdate({ target: [songNumbers.songId, songNumbers.brand], set: { ... } });
  await this.touch(ownerId, songId);
  return true;
}
```

> `setNumber`/`clearNumber`가 **owner 확인 → 번호 조작 → `songs.updated_at` 갱신** 3단계라 원자성이 필요하다. **`txRunner`를 경유**한다(`TxRepos.songs`가 이미 있으므로 새 배선 없음).

### 9.4 읽기 쿼리 스케치

```ts
// drizzle-song-query.ts
// Design Ref: §1.3 ★ⓐ — 인덱스 표현식과 문자열 일치 필수(drizzle/0001..sql:49)
const SEARCH_EXPR = sql`(coalesce(${songs.title},'') || ' ' || coalesce(${songs.artist},'') || ' ' || coalesce(${songs.memo},''))`;

async search(ownerId, keyword) {
  const rows = await db.query.songs.findMany({
    where: and(eq(songs.ownerId, ownerId),
               sql`${SEARCH_EXPR} ILIKE ${toLikePattern(keyword)} ESCAPE '\\'`),
    with: { numbers: true },
    orderBy: [sql`${songs.title} ASC NULLS FIRST`, sql`${songs.artist} ASC NULLS FIRST`],
  });
  return rows.map(toListItem);   // numbers 배열 → Record<Brand, NumberView>
}
```

`toListItem`이 `numbers` 배열을 **TJ·KY 두 키가 항상 존재하는 Record**로 변환한다(§3.2). 없는 브랜드는 `null`이며, 이것이 곧 "행 없음" 상태다.

---

## 10. Coding Convention Reference

### 10.1 신설 컨벤션

| # | 규칙 | 강제 수단 |
| --- | --- | --- |
| C-1 | **API 라우트 핸들러는 `export const {METHOD} = withAuth(...)` 형태로만 작성한다.** 핸들러 본문에 `try/catch`를 두지 않는다 | ESLint §7.2 |
| C-2 | 곡 관련 포트 메서드의 **첫 인자는 `ownerId`** | 타입 + 리뷰 |
| C-3 | 사용자 입력 텍스트의 `"" → null` 변환은 **Zod 스키마에서만** 한다 | UNIT SN-1 |
| C-4 | 검색 표현식은 `SEARCH_EXPR` 상수 하나만 쓴다. 인라인 작성 금지 | 리뷰 + 주석 상호참조 |
| C-5 | 표의 낙관적 갱신은 **셀 단위**다. 리스트 전체 스냅샷 복원 금지 | 리뷰 (§5.3) |

### 10.2 기존 승계

- `// Design Ref: §N — 사유` 주석
- 에러 응답 `{ error: { code, message, details } }`
- import 순서·네이밍은 first-take 컨벤션 유지

### 10.3 환경변수

**신규 없음.** `L1_TARGET_URL` / `L1_VERCEL_BYPASS` / `DATABASE_URL` / Clerk 키 모두 기존.

---

## 11. Implementation Guide

### 11.1 구현 순서

**module-1이 반드시 먼저다.** 가드 강제를 세운 뒤에 라우트를 늘려야 강제가 처음부터 걸린다 — refine-auth-boundary의 "핵심 가설 먼저 검증" 전략을 그대로 승계한다. 여기서 ★ⓒ가 무너지면 §7.4로 내려간 채로 나머지를 진행한다.

### 11.2 Session Guide — Module Map

| 모듈 | 범위 | 산출 | 완료 판정 |
| --- | --- | --- | --- |
| **module-1** | `withAuth` 신설 + ESLint 규칙 + **기존 5라우트 이관** | `with-auth.ts`, `eslint.config.mjs`, 라우트 5수정 | §7.3 실증 5단계 통과 + `npm run l1` **기존 9/9 회귀 0** |
| **module-2** | 포트·어댑터·유스케이스 | `song-query.ts`, `song-repo.ts`, 어댑터 2, 유스케이스 4 | `npm test` UNIT 신규 케이스 통과 |
| **module-3** | API 라우트 4파일 | `api/songs/**` | L1 `#10~#19` 통과 |
| **module-4** | 모바일 검색 화면 | `(app)/songs/search`, `SearchBox`, `SearchResults` | 수동: 검색→추가 2탭 |
| **module-5** | PC 곡 관리 표 | `(app)/songs`, `SongTable`, `InlineCell`, `NumberCell` | §8.5 수동 4항목 |
| **module-6** | L1 마무리·문서 | `run-l1.mjs`, ARCHITECT §4.1 | Preview 전 케이스 통과 |

**권장 세션 분할**: `module-1` → `module-2,3` → `module-4,5` → `module-6`
module-1은 단독 세션으로 두고 **배포해서 기존 L1을 돌린 뒤** 다음으로 넘어간다. 기존 5라우트를 건드리는 유일한 모듈이라 회귀가 여기서만 난다.

### 11.3 예상 변경량

| 구분 | 수 |
| --- | --- |
| 신규 파일 | 약 16 (포트 1 · 어댑터 1 · 유스케이스 4 · 라우트 4 · 페이지 2 · wrapper 1 · 컴포넌트 5 내외) |
| 수정 파일 | 약 11 (기존 라우트 5 · schemas · error-mapper · errors · container · eslint · run-l1 · ARCHITECT) |
| 예상 증분 | 1,000~1,300줄 |

---

## Version History

| 버전 | 날짜 | 변경 | 작성자 |
| --- | --- | --- | --- |
| 0.1 | 2026-08-23 | 최초 작성. Checkpoint 3에서 **설계안 B(클린 분리)** 채택. Design 단계 실측으로 Plan ★ⓐ(trgm 인덱스) 해소 — owner 필터 하에서는 `idx_songs_owner`가 선택되어 trgm이 사용되지 않음을 `EXPLAIN` 5케이스로 확인, **인덱스 신설 없음·마이그레이션 0건**으로 확정(D-H). ★ⓒ(가드 강제)는 커스텀 플러그인 없이 core `no-restricted-syntax` 2규칙으로 가능함을 확인, module-1의 FR-15로 실증 예정. R1은 기존 `Playlist.tsx`의 전체 스냅샷 복원 패턴이 표에서 위험함을 코드로 확인하고 **셀 단위 롤백 + 저장 중 셀 잠금**으로 대체(D-G). Checkpoint 3 시점 추정보다 라우트가 1개 늘어난 사유(3-state의 REST 표현)와, Plan의 "`finally` 무수정" 문구로부터의 의도적 편차(§8.3)를 명시 | Claude |
