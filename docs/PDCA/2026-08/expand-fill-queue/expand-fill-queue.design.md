# expand-fill-queue 설계서

> **요약**: 빈칸채우기 큐(ARCHITECT §5.6)를 서버 완결(B안)로 짓는다 — 큐 선별 SQL을 `SongQuery` 포트에 신설하고, 스냅샷 전체를 한 번에 내주는 읽기 라우트 하나를 계약으로 세운다. 화면은 한 화면 세 탭, 저장은 기존 라우트 3종 재사용, 진행은 낙관적 즉시 이동이다.
>
> **프로젝트**: sing-diary
> **버전**: v1.2.0
> **사이클**: expand-fill-queue
> **작성일**: 2026-08-23
> **상태**: Draft
> **계획서**: [expand-fill-queue.plan.md](./expand-fill-queue.plan.md)

---

## Context Anchor

| Key | Value |
| --- | --- |
| **WHY** | 결손 생산 경로를 먼저 열어놓은 상태다. 회수자가 따라붙지 않으면 결손이 눈덩이가 되고, 그 순간 "건너뛰고 추가"를 허용한 §5.2 결정 자체가 잘못이 된다. 本末顚倒(본말전도)를 이번에 바로잡는다. |
| **WHO** | sing-diary 사용자 본인(1인). PC·사후 정리 동선 전용(ARCHITECT §6). 현장 모바일 동선은 이번 사이클에서 한 줄도 바뀌지 않는다. |
| **RISK** | ★ 낙관적 즉시 이동에서 실패한 건을 어떻게 되찾는가. 조용히 사라지는 결손은 이 사이클의 목적 자체를 배반한다. |
| **SUCCESS** | 큐 세 탭이 §5.6 쿼리대로 대상을 뽑고, 저장하면 큐에서 빠지며, 실패 건이 유실 없이 돌아온다. 기존 L1 28케이스 회귀 0. 3-state 무손상. |
| **SCOPE** | 큐 읽기 포트·유스케이스·라우트 → 큐 화면 셸 → 입력·낙관적 연속 저장·실패 회수 → 표 잔손질 → L1 확장·Preview 실측 |

---

## 1. Overview

### 1.1 설계 목표

1. **§5.6의 SQL을 서버에 그대로 이행한다.** 큐 선별은 이 서비스의 계약이지 화면 편의가 아니다 — 세 사이클이 지켜온 3-state 계약(title NULL / 행 없음)을 소비하는 첫 공식 소비자가 이 쿼리다.
2. **쓰기 배관을 하나도 만들지 않는다.** 큐의 모든 저장은 기존 라우트 3종(`PATCH /api/songs/:id` · `PUT/DELETE /api/songs/:id/numbers/:brand`)을 그대로 부른다. 3-state 계약이 자동으로 지켜지는 유일한 방법이다(Plan §1.3-2).
3. **4초 쓰기를 체감에서 지운다 — 단, 정직하게.** 낙관적 이동은 지연을 가리는 것이지 없애는 게 아니다(Plan R4). 실패 건 회수(R1)와 이탈 경고(FR-13)가 이 속임수의 대가이며, 그 대가를 깎지 않는다.

### 1.2 설계 원칙

- **계약은 서버, 진행은 클라이언트.** "무엇이 결손인가"는 서버 SQL이 판정하고, "지금 몇 번째 카드인가"는 입장 시 스냅샷 위에서 클라이언트가 굴린다. 두 책임을 섞지 않는다.
- **판정은 순수 함수로** (컨벤션 C-6). 큐 진행 상태 머신은 React를 모르는 모듈에 두고 vitest로 고정한다.
- **손대지 않기로 한 것은 diff에 없다** (컨벤션 C-7). 이번 대상: `SongTable.tsx`의 `commitCell`·`writeCell`·`extractField`, 그리고 `song-state.ts`의 기존 두 함수.

### 1.3 Plan ★ 6건의 해소

Plan §7.3이 Design으로 넘긴 결정 여섯을 여기서 닫는다. 근거는 §2.3 Decision Record.

| ★ | 질문 | 결정 |
| :-: | --- | --- |
| 1 | 큐 조회를 API로도 내나 | **낸다** — 사용자가 B안 선택. `GET /api/songs/fill` 단일 라우트가 스냅샷 전체를 반환 (D-A) |
| 2 | 스냅샷 수명 | **입장 시 1회 로드, 이후 클라이언트 소유.** 재조회는 명시적 새로고침 버튼뿐 (D-B) |
| 3 | 큐 정렬 | **`created_at ASC, id ASC`** — 묵은 결손부터. `updated_at`은 쓰지 않는다 (D-C) |
| 4 | 세 탭 중복 곡 | **songId 기준 정규화 저장소** — 한 탭의 저장이 다른 탭 카드에 즉시 반영 (D-D) |
| 5 | `commitDecision` 재사용 | **재사용하지 않는다** — 큐 A에는 "지울 행"이 없어 clear 분기가 무의미. 큐 전용 상태 머신 신설 (D-E) |
| 6 | in-flight 상한·이탈 경고 | **동시 4건 상한 + `beforeunload` 경고** (D-F) |

### 1.4 직전 사이클 회고 Try의 반영

expand-playlist-import report §6.3이 남긴 Try 중 둘을 이 문서가 실행한다:

1. **동선 체크리스트** — §5.5에 "이 화면에서 나가는 문" 목록을 신설했다. 파일 단위로는 다 있는데 동선 단위로 끊긴 공백(지난 사이클의 "새 플리 진입점" 류)을 설계 단계에서 세기 위함이다.
2. **자기모순 점검** — Design 확정 전 같은 동작을 서술한 절들을 나란히 읽는다. 이번 문서의 점검 결과는 §12에 적었다.

---

## 2. Architecture

### 2.0 설계안 비교 (Checkpoint 3)

갈림의 축: **"무엇이 큐 대상인가"를 어느 층이 판정하는가.**

| 기준 | A안: 클라이언트 파생 | **B안: 서버 완결 ✅** | C안: 서버 쿼리 + RSC 직결 |
| --- | :-: | :-: | :-: |
| 접근 | `listSongs` 재사용, 큐 선별을 클라이언트 순수 함수로 | §5.6 SQL 포트 신설 + **전용 읽기 라우트가 계약** | §5.6 SQL 포트 신설 + RSC 직접 호출 + 검증용 라우트 |
| 신규 파일 | ~5 | ~10 | ~8 |
| 수정 파일 | ~3 | ~6 | ~5 |
| §5.6 SQL 이행 | ❌ 죽은 명세 | ✅ | ✅ |
| R7 (L1 검증) | 불가 | **직접 검증** | 라우트 1개로 검증 |
| 위험 | 3-state 해석 이원화 | 배관 과잉(소비자 1) | 균형 |

**선택: B안** — Checkpoint 3 사용자 결정. 추천은 C였으나, 검증 강도(큐 선별 SQL을 L1이 직접 대조)와 장래 MCP 계약 선례를 근거로 B를 택했다. 다만 B 안에서도 라우트는 **읽기 1개**로 절제한다 — 쓰기 라우트는 절대 신설하지 않는다(§1.1 목표 2). `GET /api/sessions/current`처럼 외부 클라이언트용 계약을 미리 굳혀두는 자리다(first-take Design §4.2 선례).

### 2.1 컴포넌트 다이어그램

```
[페이지 로드]
  fill/page.tsx (RSC) ── requireOwnerIdOrRedirect()
        │ initial 스냅샷: useCases.getFillQueue(ownerId)   ← 첫 페인트는 RSC가 공급
        ▼
  FillQueue.tsx (client) ── songId 정규화 저장소 + 탭 3개 + 진행 상태 머신
        │                          fill-queue-state.ts (순수 함수)
        │
        ├─ [새로고침]  GET /api/songs/fill ──────────────┐
        ├─ [번호 확정] PUT    /api/songs/:id/numbers/:b  │ 기존 라우트 재사용
        ├─ [미지원]    PUT    (UNSUPPORTED)              │ (신규 쓰기 경로 0건)
        └─ [메타 확정] PATCH  /api/songs/:id ────────────┘

[서버]
  GET /api/songs/fill (신규 · withAuth)
        └─ useCases.getFillQueue ─ SongQuery.fillQueue(ownerId)
                                        └─ Neon HTTP(db) — 읽기 전용, 쿼리 3발 병렬
```

### 2.2 데이터 흐름

```
입장: RSC → getFillQueue → { tj[], ky[], meta[] } → 클라이언트 정규화(songId → Song, 탭별 id 목록)
저장: 카드 확정 → 낙관적으로 다음 카드 표시 → fetch(기존 라우트)
      ├─ 성공: 저장소의 그 곡을 서버 확정값으로 갱신 → 다른 탭 카드에도 반영(D-D)
      └─ 실패: 입력값을 실은 채 그 탭 큐 끝으로 복귀 + 토스트(R1)
이탈: in-flight > 0 이면 beforeunload 경고(D-F)
```

### 2.3 Decision Record

| # | 결정 | 대안 | 근거 |
| --- | --- | --- | --- |
| **D-A** | 큐 읽기 라우트는 **`GET /api/songs/fill` 하나**. 세 큐 + 잔여 건수를 한 응답에 담는다 | 큐별 라우트 3개 | FR-05(탭 전환 재조회 없음)가 요구하는 단위가 "스냅샷 전체"다. 세 쿼리는 서버에서 `Promise.all`로 병렬 — 읽기 1발 ~700ms 실측(직전 사이클)이므로 응답도 ~700ms대. 라우트 3개는 왕복 3회를 유혹한다 |
| **D-B** | 스냅샷은 **입장 시 1회**(RSC 공급). 이후 큐 상태는 클라이언트 소유 — 성공=제거, 실패=끝으로, 건너뛰기=뒤로. 서버 재조회는 명시적 새로고침 버튼뿐 | 저장마다 재조회 | 저장마다 재조회하면 매 건 +700ms에 카드 순서가 흔들린다(Plan R2). 큐는 소모품 목록이다 — 입장 시점의 할 일을 다 하면 끝나는 것이지, 실시간 동기화 대상이 아니다. 다른 창에서 생긴 변화는 새로고침이 줍는다 |
| **D-C** | 큐 정렬 **`created_at ASC, id ASC`** | `updated_at` / 표와 같은 title 정렬 | 묵은 결손부터(선입선출). `created_at`은 불변이라 저장·건너뛰기가 순서를 못 흔든다 — `updated_at`은 `setNumber`·`updateMeta`가 touch하므로 정렬 키로 쓰면 저장할 때마다 곡이 튄다(Plan R6). title 정렬은 큐 B가 title을 채우는 순간 기준 자체가 변한다. `findByIdForOwner` 주석의 "updated_at 신선도 신호" 약속은 유효하되 이번 소비자는 없다 — 주석은 그대로 둔다 |
| **D-D** | 클라이언트 스냅샷을 **songId 기준 단일 저장소**(Map)로 정규화하고, 탭은 id 목록만 쥔다 | 탭별 독립 배열 | 한 곡이 세 탭에 다 뜰 수 있다(TJ·KY 둘 다 없고 title NULL인 stub — Plan R3). 독립 배열이면 큐 B에서 채운 제목이 큐 A 카드에 안 보여 "왜 또 나오나"가 된다. 단일 저장소면 저장 성공이 모든 탭 카드에 즉시 반영된다 — R3의 완화가 구조에서 공짜로 나온다 |
| **D-E** | 큐 진행 상태 머신을 **`fill-queue-state.ts` 신설**로 분리. `commitDecision`은 재사용하지 않는다 | `song-state.ts`의 `commitDecision` 재사용 | `commitDecision`의 clear 분기는 "있던 번호를 지우고 확정"인데, 큐 A 카드에는 지울 행 자체가 없다(행 없음이라 큐에 온 것). 빈 입력의 저장 버튼은 그냥 비활성이다. 재사용하면 도달 불가 분기를 끌고 다니게 된다. 새 머신의 관심사는 판정이 아니라 **목록 진행**(성공/실패/건너뛰기/정산)이고, 파일을 나누되 C-6(순수 함수 모듈)은 동일하게 지킨다 |
| **D-F** | 동시 in-flight **상한 4건**, 초과분은 클라이언트 대기열. in-flight > 0에서 이탈 시 `beforeunload` 경고 | 무제한 / 1건 직렬 | 무제한이면 20건 몰아치기에서 뒤에 80초어치가 쌓인 채 이탈 유실 위험이 커진다(Plan R4). 1건 직렬이면 낙관적 이동의 의미가 없다(다음 카드 입력을 마쳐도 전송을 못 하고 대기). 4는 pg Pool 요청별 연결 구조에서 서버리스가 무리 없이 받는 수준이며, 이탈 시 잃을 수 있는 최대치를 4건+대기열로 묶는다 |
| **D-G** | 큐 A 카드의 곡 식별자는 **제목·아티스트, 없으면 반대 브랜드 번호**(`#12345 (TJ)` 형태) | 제목만 | 큐 A에 온 곡은 그 브랜드 번호가 없다. stub(title NULL)이면 제목도 없다 — 그때 유일한 단서가 반대 브랜드 번호다. `EntryRow`의 `#—` 폴백 선례를 따르되, 반대 브랜드 번호는 스냅샷의 `numbers`에 이미 실려 있으므로 추가 조회가 없다 |
| **D-H** | **표 내부 검색은 클라이언트 substring 필터로 확정** — ARCHITECT §8 결정 기록에 D8로 등재한다. 재검토 조건: 곡 목록에 페이지네이션이 필요해지는 시점 | 통합검색 API 재사용으로 교체 | 백로그 `47765514`의 요구는 코드 변경이 아니라 결정의 기록이다. 표는 이미 전체 목록을 로드하므로(직전 사이클 D-J 정렬 포함) 클라이언트 필터가 왕복 0회로 같은 결과를 낸다. 1인 수백 곡 규모에서 우위가 명확하다 |
| **D-I** | 저장 중 셀 피드백은 **`animate-pulse` + `cursor-wait`** 를 disabled 상태에 추가 — `NumberCell`·`InlineCell`의 표시 계층만 | 스피너 오버레이 / 토스트 | 백로그 `80c2fe1d`는 표시의 문제다(Plan §1.3-5). 잠금 로직(`commitCell`·`pendingRef`)은 C-7 대상으로 diff 금지(R5). 셀 폭 80px에 스피너는 과하다 — 깜빡임+커서로 "일하는 중"이 전달된다. 큐 화면의 카드 저장 표시도 같은 토큰을 쓴다 |
| **D-J** | 실패 복귀 카드는 **입력값(draft)을 실은 채** 그 탭 큐 끝으로 | 빈 카드로 복귀 | R1의 핵심. 사용자가 친 번호가 살아 돌아와야 "다시 저장"이 탭 한 번이다. 빈 카드로 돌아오면 뭘 쳤었는지 기억을 요구한다 — 조용한 유실과 다를 바 없다 |

---

## 3. Data Model

### 3.1 스키마 변경

**없음.** 마이그레이션 0건. §5.6 쿼리는 기존 `songs` · `song_numbers` · `idx_songs_owner` 로 돈다.

### 3.2 포트 변경 — `SongQuery` (읽기 전용)

```ts
// src/application/ports/song-query.ts 에 추가
export interface FillQueueSnapshot {
  /** 큐 A — 해당 브랜드 song_numbers 행이 없는 곡. created_at ASC (D-C) */
  tj: SongListItem[];
  ky: SongListItem[];
  /** 큐 B — title IS NULL OR artist IS NULL. created_at ASC */
  meta: SongListItem[];
  /** owner 전체 곡 수. 빈 상태 3종 판정용 — Check Gap-1로 추가됨(v0.2) */
  totalSongs: number;
}

export interface SongQuery {
  // ...기존 3개 시그니처 무변경...
  /** 빈칸채우기 큐 스냅샷. 세 쿼리를 병렬 실행 (§5.6) */
  fillQueue(ownerId: string): Promise<FillQueueSnapshot>;
}
```

`SongListItem`을 그대로 쓴다 — 카드가 필요로 하는 것(제목·아티스트·양 브랜드 `numbers`·메모)이 전부 이미 들어 있고, 저장 응답(기존 유스케이스의 확정값)과 같은 형태라 저장소 갱신이 대입 한 번이다(D-D).

### 3.3 큐 선별 SQL (§5.6 이행)

```sql
-- 큐 A (브랜드별 ×2, Drizzle notExists로 표현)
SELECT s.* FROM songs s
WHERE s.owner_id = $1
  AND NOT EXISTS (SELECT 1 FROM song_numbers n
                   WHERE n.song_id = s.id AND n.brand = $brand)
ORDER BY s.created_at ASC, s.id ASC;

-- 큐 B
SELECT s.* FROM songs s
WHERE s.owner_id = $1 AND (s.title IS NULL OR s.artist IS NULL)
ORDER BY s.created_at ASC, s.id ASC;
```

- §5.6 원문의 `LEFT JOIN … IS NULL`을 `NOT EXISTS`로 표현한다 — 의미 동일, Drizzle `notExists` + 기존 `with: { numbers: true }` 패턴과 결이 맞다(행 없음 판정은 서브쿼리, 카드 표시용 `numbers`는 relation 로드).
- **memo는 큐 B 조건에 없다** — §5.6 원문 준수.
- 세 쿼리는 유스케이스에서 `Promise.all` 병렬 (D-A).

### 3.4 클라이언트 상태 (D-D · D-E)

```ts
// fill-queue-state.ts — 순수 함수 모듈 (React·fetch를 모른다)
interface FillState {
  songs: Map<string, SongListItem>;      // songId → 최신 확정값 (단일 저장소)
  tabs: Record<"tj" | "ky" | "meta", string[]>; // 탭별 남은 songId 순서
  inFlight: Map<string, PendingSave>;    // songId:field → 전송 중 정보(draft 포함)
}
// 전이: save(성공) → 탭에서 제거·저장소 갱신 / save(실패) → draft 실은 채 탭 끝 복귀(D-J)
//       skip → 탭 뒤로 (이번 방문 한정, 저장 없음 — Plan FR-12)
//       resolveTab → 조건 충족 곡의 자동 이탈(예: 큐 B에서 title·artist 둘 다 채워짐)
// v0.2 정정(Check Gap-9): 구현에서 resolveTab은 독립 함수가 아니라 판정부 qualifies()로 나오고
// 재배치는 settleSuccess 안에 접혀 있다. 저장 응답 없이는 판정할 수 없어 분리할 실익이 없었다.
// 동작은 §8.3 #3 그대로다 — 이름만 다르다.
```

---

## 4. API Specification

### 4.1 엔드포인트 목록

| Method | Path | 설명 | 인증 | 신규 여부 |
| --- | --- | --- | :-: | :-: |
| GET | `/api/songs/fill` | 큐 스냅샷 (세 큐 + 건수) | `withAuth` | **신규 (유일)** |
| PUT | `/api/songs/:id/numbers/:brand` | 번호 확정 / 미지원 | 기존 | 재사용 |
| DELETE | `/api/songs/:id/numbers/:brand` | 번호 삭제 | 기존 | ~~재사용~~ **소비자 없음** |
| PATCH | `/api/songs/:id` | 제목·아티스트 | 기존 | 재사용 |

### 4.2 `GET /api/songs/fill`

> **정정** (v0.2, Check Gap-8): 위 표가 DELETE를 "재사용"으로 등재했으나 **큐에는 소비자가 없다.**
> D-E가 이미 말한 대로 큐 A 카드에는 지울 행 자체가 없기 때문이다(행 없음이라 큐에 온 것). 표가 D-E와
> 어긋나 있었다. 라우트 자체는 곡 관리 표가 계속 쓰므로 변경 대상이 아니다.

**요청**: 파라미터 없음 (owner 스코프는 인증에서, 브랜드는 응답에 둘 다 포함).

**응답 (200)**:
```json
{
  "data": {
    "tj":   [ { "id": "…", "title": null, "artist": null, "memo": null,
                "numbers": { "TJ": null, "KY": { "status": "AVAILABLE", "number": "12345" } },
                "updatedAt": "…" } ],
    "ky":   [ …SongListItem… ],
    "meta": [ …SongListItem… ]
  }
}
```

- **탭별 건수**는 배열 길이로 파생 — 별도 필드 없음.
- **`totalSongs`는 예외다** (v0.2, Check Gap-1). 세 배열이 전부 비었을 때 "아직 곡이 없어요"와
  "다 채웠어요"는 배열만으로 구분되지 않는다 — 둘 다 길이 0이기 때문이다. 이 값만이 둘을 가른다.
  서버에서 `count(*)`를 같은 `Promise.all`에 네 번째로 실어 보내므로 벽시계 증가는 없다.
- 한 곡이 여러 배열에 중복 등장할 수 있다(정상 — Plan R3). 클라이언트가 songId로 정규화(D-D).
- **에러**: 401 `UNAUTHORIZED` (기존 `error-mapper` 계약 그대로). **신규 에러 코드 0건.**
- Zod 스키마 추가 없음 — 본문·쿼리 파라미터가 없다.

### 4.3 쓰기 계약 (변경 없음 — 소비자만 추가)

기존 세 라우트의 요청·응답이 **바이트 하나 안 바뀐다.** 큐가 추가 소비자로 붙을 뿐이다. 응답의 `data`(SongListItem 확정값)를 저장소 갱신에 그대로 쓴다 — `SongTable.extractField`와 달리 큐는 **행 전체를 갱신해도 안전**한데, 큐 카드는 셀 단위 동시 편집이 없기 때문이다(카드 하나가 화면에 하나). 단 같은 곡이 표와 큐 두 창에서 동시에 편집되는 경우는 서버가 최종 판정하고 나중 새로고침이 줍는다(D-B).

---

## 5. UI/UX Design

### 5.1 화면 배치 — `/songs/fill`

```
┌──────────────────────────────────────────┐
│ AppHeader (…기존 + [빈칸채우기] 링크)      │
├──────────────────────────────────────────┤
│ [TJ 번호 12] [KY 번호 3] [제목·아티스트 8] │  ← 탭 + 잔여 배지
├──────────────────────────────────────────┤
│                3 / 12                    │  ← 진행 (이번 방문 기준)
│  ┌────────────────────────────────────┐  │
│  │ 밤편지 — 아이유          (큐 A 카드) │  │  ← 식별자: 제목·아티스트,
│  │ KY 48727 ✓                         │  │     없으면 반대 브랜드 번호(D-G)
│  │ TJ 번호 [________]                  │  │
│  │ [저장] [미지원] [건너뛰기]           │  │
│  └────────────────────────────────────┘  │
│  (저장 중 카드가 위로 잠깐 스치고 다음 카드) │
├──────────────────────────────────────────┤
│ 전송 중 2건 · 실패 0건        [새로고침]   │  ← in-flight 정산 표시줄
└──────────────────────────────────────────┘
```

- **큐 B 카드**: 제목·아티스트 입력 2칸 + 양 브랜드 번호 칩(참고 표시) + [저장] [건너뛰기]. 한쪽만 채워도 저장 가능 — 남은 쪽이 여전히 NULL이면 그 곡은 큐 B에 남는다(서버 판정 기준과 동일하게 클라이언트도 `title IS NULL OR artist IS NULL`로 잔류 판정, D-D의 `resolveTab`).
- **빈 상태 구분** (Plan R8): 곡 자체가 0건 → "아직 곡이 없어요". 해당 탭 결손 0건 → "이 탭은 다 채웠어요 🎉". 세 탭 모두 0건 → "빈칸이 없어요. 다 채웠어요."
  > **판정 기준** (v0.2, Check Gap-1): 첫 갈래는 **`totalSongs === 0`**이지 스냅샷 크기가 아니다.
  > 스냅샷 크기로 재면 다 채운 사용자에게 "아직 곡이 없어요"라고 거짓말한다 — §4.2가 "별도 필드 없음"이라
  > 적어둔 탓에 초판 구현이 실제로 그렇게 됐다. 이 절과 §4.2가 서로 모순이었던 것이 근인이다.
- 모바일 폭: 카드 1열이 그대로 동작(전용 대응 없음 — Plan §2.2).

### 5.2 사용자 흐름

```
곡 관리(또는 헤더) → /songs/fill → 탭 선택 → 카드 확정/건너뛰기 반복
  → 탭 소진 → 다른 탭 or 완료 → in-flight 정산(실패 복귀분 처리) → 헤더로 이탈
```

### 5.3 컴포넌트 목록

| 컴포넌트 | 위치 | 책임 |
| --- | --- | --- |
| `fill/page.tsx` | `app/(app)/songs/fill/` | RSC. 가드 + 초기 스냅샷 공급 |
| `FillQueue.tsx` | `presentation/components/fill/` | 클라이언트 루트. 정규화 저장소·탭·in-flight 관리, fetch 발사 |
| `FillCardNumber.tsx` | 〃 | 큐 A 카드 (번호 입력·미지원·건너뛰기) |
| `FillCardMeta.tsx` | 〃 | 큐 B 카드 (제목·아티스트·건너뛰기) |
| `fill-queue-state.ts` | 〃 | **순수 함수** — 상태 전이 전부 (D-E) |
| `NumberCell.tsx` · `InlineCell.tsx` | 기존 수정 | disabled 시 `animate-pulse`·`cursor-wait` 추가 (D-I) |
| `AppHeader.tsx` | 기존 수정 | [빈칸채우기] 진입점 |

### 5.4 Page UI Checklist

#### /songs/fill

- [ ] 탭 3개: `TJ 번호` / `KY 번호` / `제목·아티스트` — 각각 잔여 건수 배지, 전환 시 fetch 0회
- [ ] 진행 표시: `n / N` (이번 방문 시작 시점 기준 분모 고정)
- [ ] 큐 A 카드: 곡 식별자(제목·아티스트 → 폴백 반대 브랜드 번호 `#12345 (TJ)`), 번호 입력(inputMode="numeric"), [저장](입력 비면 disabled) · [미지원] · [건너뛰기]
- [ ] 큐 B 카드: 제목·아티스트 입력 2칸, 양 브랜드 번호 칩(읽기 전용), [저장](둘 다 비면 disabled) · [건너뛰기]
- [ ] in-flight 표시줄: 전송 중 N건 · 실패 N건, [새로고침] 버튼(D-B — 유일한 서버 재조회)
- [ ] 실패 복귀 카드: 탭 끝에 입력값 유지된 채 재등장 + danger 토스트(곡 식별자 포함)
- [ ] 빈 상태 3종: 곡 0건 / 이 탭 완료 / 전체 완료 — 문구 구분
- [ ] beforeunload: in-flight > 0 일 때 이탈 경고

#### 곡 관리 표 (기존 화면 수정분)

- [ ] 저장 중 셀: `opacity-50` + `animate-pulse` + `cursor-wait` (NumberCell·InlineCell 공통)

### 5.5 동선 체크리스트 — 이 화면에서 나가는 문 (Try 1 반영)

| 문 | 목적지 | 존재 근거 |
| --- | --- | --- |
| AppHeader 로고·링크 | `/` · 검색 · 지난 플리 · 곡 관리 | 기존 헤더가 모든 화면에 상주 — 이탈 경로 확보 |
| "곡 관리에서 보기" | `/songs` | 큐 카드에서 못 고치는 것(memo 등)을 표에서 고치러 가는 문. **완료 화면과 카드 하단에 링크** |
| 전체 완료 화면 | `/songs` 링크 | 다 채운 뒤 갈 곳이 있어야 한다 — "화면은 있는데 나가는 문이 없다"를 여기서 차단 |
| 진입하는 문 (역방향) | AppHeader [빈칸채우기] | FR-15. **`/songs` 표 상단에도 결손 요약 배지 → `/songs/fill` 링크** — 표를 보다가 큐로 넘어오는 자연 동선 |

### 5.6 큐 화면과 곡 관리 표의 관계

| | 곡 관리 표 (`/songs`) | 빈칸채우기 큐 (`/songs/fill`) |
| --- | --- | --- |
| 보여주는 것 | 전부 | 결손만, 한 건씩 |
| 낙관적 갱신 단위 | 셀 (동시 여러 셀) | 카드 (직렬 진행 + in-flight 병렬 상한 4) |
| 실패 처리 | 그 셀만 원복 | 카드가 입력값 실은 채 큐 끝 복귀 |
| 재사용 경계 | `commitCell` 등 C-7 diff 금지 | 저장 라우트만 공유, 상태 관리는 독립 |

두 화면의 낙관적 갱신 패턴이 **다른 것은 의도**다(Plan §8.2) — 표는 제자리 수정, 큐는 소모 목록이다. 이 구분을 컨벤션 **C-9**로 §10.4에 명문화한다.

---

## 6. Error Handling

### 6.1 에러 경로

| 상황 | HTTP | 코드 | 클라이언트 처리 |
| --- | :-: | --- | --- |
| 미인증 페이지 진입 | — | — | `requireOwnerIdOrRedirect` → sign-in |
| 미인증 API | 401 | `UNAUTHORIZED` | (L1 검증용 — UI 경로 없음) |
| 타 owner 곡 저장 시도 | 404 | `SONG_NOT_FOUND` | 실패 복귀 + 토스트. 스냅샷이 낡아 곡이 삭제된 경우도 동일 |
| 검증 실패 (번호 형식 등) | 400 | `VALIDATION_ERROR` | 실패 복귀 + 토스트 |
| 네트워크 실패 | — | — | 실패 복귀 + 토스트 ("네트워크 문제로 저장 못 했어요") |

**신규 에러 코드 0건** — 전부 기존 `error-mapper` 계약이다.

### 6.2 실패 복귀의 불변식 (R1 — 이 사이클의 심장)

1. 전송 시작 시 `inFlight`에 **draft를 함께** 기록한다 — 응답이 어떻게 오든 입력값의 원본은 클라이언트가 쥔다.
2. 실패 판정 시 그 draft를 실은 카드를 **해당 탭 끝에** 재삽입한다 (D-J). 토스트에 곡 식별자를 싣는다.
3. 마지막 카드 처리 후 in-flight가 남았으면 "전송 중 N건" 표시줄이 정산될 때까지 완료 화면을 확정하지 않는다 (FR-13).
4. 이 세 전이는 전부 `fill-queue-state.ts` 순수 함수라 vitest가 직접 고정한다.

---

## 7. Security Considerations

- [x] 인증: 페이지 `requireOwnerIdOrRedirect()` / 신규 라우트 `withAuth()` — ESLint `apiRouteGuard`가 형태를 강제
- [x] 데이터 격리: `fillQueue(ownerId)` — 모든 쿼리가 `owner_id = $1` 스코프. 타 owner 곡은 스냅샷에 실리지 않고, 저장은 기존 라우트의 owner 확인(`setNumber` 등의 touched=false → 404)이 그대로 방어
- [x] 입력 검증: 기존 Zod 스키마 재사용 (`setSongNumberSchema` · `updateSongMetaSchema`) — 신규 스키마 0건
- [x] IDOR: 신규 표면 없음 — 클라이언트가 songId를 보내는 곳은 전부 기존 라우트(직전 사이클 D-P가 이미 방어)
- [ ] Rate limiting: 없음(기존과 동일) — 1인 서비스, in-flight 상한 4가 사실상의 클라이언트측 억제

---

## 8. Test Plan

### 8.1 테스트 범위

| 층 | 대상 | 도구 | 단계 |
| --- | --- | --- | :-: |
| UNIT | `fill-queue-state.ts` 전이 전부 | vitest | Do (코드+테스트=1세트) |
| L1 | `GET /api/songs/fill` + 큐 선별 정확성 + 3-state 전이 | `run-l1.mjs` (Preview) | Do·Check |
| 수동 | 낙관적 이동 체감 · 실패 복귀 · beforeunload · 표 피드백 | 브라우저 | Check |

Playwright 없음(RAM 1.9GB 제약) — 기존 체제 유지.

### 8.2 L1 시나리오 (신규 #29~)

| # | 시나리오 | 기대 |
| :-: | --- | --- |
| 29 | `GET /api/songs/fill` 미인증 | 401 `UNAUTHORIZED` |
| 30 | 시드 상태에서 스냅샷 조회 | 200. `data.tj`·`ky`·`meta`가 배열, 시드의 알려진 결손 곡이 정확히 포함 |
| 31 | **선별 정확성 (큐 A 이탈)**: 결손 곡에 `PUT numbers` AVAILABLE → 재조회 | 그 곡이 해당 브랜드 큐에서 빠짐. **반대 브랜드 큐 잔류는 불변** |
| 32 | **선별 정확성 (UNSUPPORTED도 이탈)**: `PUT` UNSUPPORTED → 재조회 | 큐 A에서 빠짐 — §5.6 기준은 "행 없음"이지 "AVAILABLE"이 아니다 |
| 33 | **복귀**: `DELETE numbers` → 재조회 | 그 곡이 큐 A에 되돌아옴 (행 없음 = 결손) |
| 34 | **큐 B 이탈**: title·artist 둘 다 `PATCH` → 재조회 | meta에서 빠짐 |
| 35 | **큐 B 잔류**: title만 채움 → 재조회 | meta에 남음 (`OR` 조건) |
| 36 | 타 owner 곡이 스냅샷에 0건 | 시드의 타 owner 결손 곡 id가 세 배열 어디에도 없음 |
| 37 | 3-state 무손상: #31~33 사이클 후 행 수 | `song_numbers` 해당 (song, brand) 행 ≤ 1 — 재조회 값으로 확인 |
| 38 | 정렬: 시드 곡 2건의 스냅샷 내 순서 | `created_at ASC` (D-C) |

기존 #1~28 **회귀 0**이 전제다. 신규 라우트가 읽기 전용이라, 큐 검증의 몸통은 **기존 쓰기 라우트를 치고 스냅샷 재조회로 대조**하는 시나리오다(Plan R7의 해소 — 엔드포인트 단위가 아니라 시나리오 단위).

### 8.3 UNIT 시나리오 (`fill-queue-state.test.ts`)

| # | 전이 | 고정할 것 |
| :-: | --- | --- |
| 1 | 정규화 적재 | 세 배열 중복 곡이 저장소에 1건, 탭 목록엔 각각 등장 |
| 2 | 저장 성공 | 탭에서 제거 + 저장소 갱신 → **다른 탭 카드 표시값도 갱신** (D-D) |
| 3 | 큐 B 부분 저장 | title만 채우면 meta 잔류, 둘 다 채우면 이탈 (`resolveTab`) |
| 4 | 저장 실패 | draft 실은 채 그 탭 **끝**에 복귀 (D-J) — 유실 0 |
| 5 | 건너뛰기 | 탭 뒤로. 저장소·서버 무접촉 (FR-12) |
| 6 | in-flight 상한 | 5번째 요청은 대기열, 슬롯 나면 발사 (D-F) |
| 7 | 정산 | 마지막 카드 + in-flight 잔존 시 완료 미확정 (FR-13) |
| 8 | 미지원 저장 성공 | 큐 A 이탈 + 저장소의 `numbers`가 UNSUPPORTED로 |

### 8.4 수동 확인 (Check)

| # | 확인 | 기대 |
| :-: | --- | --- |
| M-1 | 저장 → 다음 카드 등장 사이 체감 | 네트워크 대기 0 (즉시) |
| M-2 | 의도적 실패(비행기 모드/타 owner) 후 | 입력값 실린 카드가 큐 끝에, 토스트에 곡 이름 |
| M-3 | 5건 연속 몰아치기 | 화면 진행은 즉시, 표시줄 정산까지 총 시간 기록 (체감/실제 분리 — Plan NFR) |
| M-4 | in-flight 중 탭 닫기 시도 | beforeunload 경고 |
| M-5 | 표에서 저장 중 셀 | pulse + cursor-wait 보임 (`80c2fe1d` 닫힘 확인) |
| M-6 | 빈 상태 3종 | 문구 구분 정확 |

### 8.5 시드 데이터 요건

| 대상 | 최소 | 필수 조건 |
| --- | :-: | --- |
| 본인 곡 — TJ만 결손 | 2 | KY AVAILABLE 보유, created_at 상이 (#38 정렬용) |
| 본인 곡 — 양 브랜드 결손 + title NULL (stub) | 1 | 세 탭 중복 등장 검증 (#30, UNIT #1) |
| 본인 곡 — title만 NULL | 1 | 큐 B `OR` 조건 (#35) |
| 본인 곡 — 결손 없음 | 1 | 스냅샷 비포함 대조군 |
| 타 owner 곡 — 결손 | 1 | #36 격리 |

기존 `seed.ts`에 큐 시나리오 블록을 추가한다 (기존 시드 불변 — L1 #1~28 회귀 방지).

---

## 9. Clean Architecture

### 9.1 이 기능의 계층 배치

| 구성물 | 계층 | 위치 |
| --- | --- | --- |
| `FillQueueSnapshot` 타입 · `SongQuery.fillQueue` | Application (port) | `src/application/ports/song-query.ts` |
| `createGetFillQueue` | Application (use-case) | `src/application/use-cases/get-fill-queue.ts` |
| `fillQueue` 구현 (Drizzle, Neon HTTP) | Infrastructure | `src/infrastructure/repositories/drizzle-song-query.ts` |
| `GET /api/songs/fill` | Presentation (route) | `src/app/api/songs/fill/route.ts` |
| `fill/page.tsx` | Presentation (RSC) | `src/app/(app)/songs/fill/page.tsx` |
| `FillQueue` · 카드 2종 | Presentation (client) | `src/presentation/components/fill/` |
| `fill-queue-state.ts` | Presentation (순수 함수) | 〃 |
| container 배선 | Composition root | `src/presentation/container.ts` |

### 9.2 의존 규칙 준수

- 도메인·유스케이스 계층에 **UI 개념이 들어가지 않는다** — `FillQueueSnapshot`은 "결손 곡 목록"이지 "탭"이 아니다. 탭·카드·진행은 전부 presentation의 `fill-queue-state.ts` 소관.
- 읽기는 Neon HTTP(`db`), 쓰기는 기존 라우트 경유 — first-take D-C 구조 그대로.
- `/api/songs/fill`이 라우팅상 `/api/songs/[id]`와 겹치지 않는지: Next.js는 정적 세그먼트(`fill`)를 동적(`[id]`)보다 우선 매칭한다 — 충돌 없음. 단 `id`에 `"fill"`이 올 수 없게 된 것은 UUID 검증이 이미 거른다.

---

## 10. Coding Convention Reference

### 10.4 이 기능의 컨벤션

| 항목 | 적용 |
| --- | --- |
| Design Ref 주석 | 신규 파일 상단 `// Design Ref: §…` — 기존 관례 |
| C-6 | 상태 판정·전이는 `fill-queue-state.ts` 순수 함수. 컴포넌트 인라인 판정 금지 |
| **C-7 (이번 대상)** | `SongTable.tsx`의 `commitCell`·`writeCell`·`extractField`, `song-state.ts`의 `commitDecision`·`addDecision`, `add-entry-by-number.ts`, `AddByNumber.tsx` — **diff에 나타나지 않는다** |
| C-8 | 신규 유니언 스키마 없음 — 해당 없음 |
| **C-9 (신설)** | 낙관적 갱신 패턴 구분: **제자리 수정은 셀 단위 원복**(표), **소모 목록은 draft 보존 재삽입**(큐). 새 화면은 이 둘 중 하나를 고르고 Design에 명시한다 |

---

## 11. Implementation Guide

### 11.1 파일 구조

```
신규 (9)
  src/application/use-cases/get-fill-queue.ts
  src/app/api/songs/fill/route.ts
  src/app/(app)/songs/fill/page.tsx
  src/presentation/components/fill/FillQueue.tsx
  src/presentation/components/fill/FillCardNumber.tsx
  src/presentation/components/fill/FillCardMeta.tsx
  src/presentation/components/fill/fill-queue-state.ts
  tests/fill-queue-state.test.ts
  tests/fill-queue-use-case.test.ts        (fillQueue 선별 — 테스트 DB)

수정 (9)                                     ← v0.2 정정: 초판이 "(7)"로 세면서 아래 두 줄을 빠뜨렸다
  src/application/ports/song-query.ts       (+fillQueue, +FillQueueSnapshot, +totalSongs)
  src/infrastructure/repositories/drizzle-song-query.ts
  src/presentation/container.ts
  src/presentation/components/AppHeader.tsx
  src/app/(app)/songs/page.tsx              (§5.5 역방향 동선 — 표 상단 결손 요약 배지)
  tests/support/db.ts                       (Check Gap-6 — DB 스위트 skip 가시화)
  src/presentation/components/songs/NumberCell.tsx   (D-I 표시만)
  src/presentation/components/songs/InlineCell.tsx   (D-I 표시만)
  scripts/run-l1.mjs                        (+#29~38) · src/infrastructure/db/seed.ts (+큐 블록)

문서 (2)
  docs/architect/ARCHITECT.md               (§5.6 구현 현황 인용구, §8 D8 — D-H)
```

### 11.2 구현 순서

1. [ ] **module-1 — 서버 읽기 경로**: 포트 확장 → Drizzle 구현(§3.3) → 유스케이스 → 라우트 → container → 시드 확장 → L1 #29·30·36·38 + use-case 테스트. *여기서 큐 선별의 정확성이 확정된다 — UI가 없어도 계약이 선다.*
2. [ ] **module-2 — 상태 머신 + 화면 셸**: `fill-queue-state.ts` + UNIT 8케이스 **먼저**(직전 사이클의 "순수 함수 먼저" 승계) → `FillQueue` 탭·배지·빈 상태·진행 표시 → AppHeader·`/songs` 배지 진입점.
3. [ ] **module-3 — 카드와 연속 저장 (위험 중심 R1)**: 카드 2종 → 낙관적 발사·실패 복귀·in-flight 상한·beforeunload → L1 #31~35·37 + 수동 M-1~4.
4. [ ] **module-4 — 잔손질·문서·최종 검증**: NumberCell·InlineCell 피드백(D-I, C-7 diff 검증 동반) → ARCHITECT §5.6·§8 갱신 → L1 전 케이스 3연속 + 수동 M-5·6.

### 11.3 Session Guide

#### Module Map

| Module | Scope Key | 내용 | 예상 턴 |
| --- | --- | --- | :-: |
| 서버 읽기 경로 | `module-1` | 포트·SQL·유스케이스·라우트·시드·L1 4건 | 30-40 |
| 상태 머신 + 셸 | `module-2` | 순수 함수+UNIT → 탭 UI·진입점 | 30-40 |
| 카드·연속 저장 | `module-3` | R1의 몸통. 낙관적 발사·실패 복귀 | 40-50 |
| 잔손질·문서 | `module-4` | D-I·ARCHITECT·최종 검증 | 20-30 |

#### Recommended Session Plan

| 세션 | 단계 | 범위 | 비고 |
| --- | --- | --- | --- |
| S1 | Do | `--scope module-1` | 끝에 L1 신규 4건 + 기존 28건 회귀 확인 |
| S2 | Do | `--scope module-2,module-3` | module-2의 UNIT 통과 후에만 module-3 진입 |
| S3 | Do + Check | `--scope module-4` → analyze | C-7 diff 검증 포함 |

---

## 12. 자기모순 점검 (Try 2 반영 — Design 확정 전 1회)

같은 동작을 두 절 이상에서 서술한 자리를 나란히 놓고 읽은 결과다.

| 겹치는 절 | 판정 |
| --- | --- |
| §2.3 D-B(스냅샷 1회) ↔ §5.4 [새로고침] ↔ §6.1(낡은 스냅샷 404) | 일치 — 재조회는 새로고침 버튼 하나뿐이고, 낡음의 대가는 404 실패 복귀로 수렴 |
| §2.3 D-D(정규화) ↔ §5.6 표(두 화면 상태 독립) | 일치 — 정규화는 큐 화면 **안**의 탭 간 공유다. 표(`/songs`)와는 공유하지 않는다 (다른 창 문제는 D-B가 담당) |
| §6.2-3(정산 전 완료 미확정) ↔ §8.3 #7 ↔ §5.4 표시줄 | 일치 — 셋 다 "in-flight 0이 완료의 조건" |
| §5.1 카드 [저장] disabled ↔ D-E(빈 입력은 판정 대상 아님) | 일치 — 빈 입력은 버튼이 막지, 판정 함수가 거르지 않는다 |
| §3.3 정렬 `created_at ASC` ↔ §8.2 #38 ↔ D-C | 일치 |

발견된 모순 0건으로 확정.

> **v0.2 — 이 점검은 실패했다** (Check Gap-1). 모순이 실제로는 **1건 있었고 이 표가 놓쳤다.**
>
> | 놓친 짝 | 모순 |
> | --- | --- |
> | §5.1 빈 상태 3종 ↔ §4.2 "건수는 배열 길이 파생, 별도 필드 없음" | §5.1은 "곡 0"과 "결손 0"을 **다른 화면으로** 요구하는데, §4.2의 응답 계약은 그 둘을 **구분할 수 없다**(둘 다 배열 길이 0). 구현은 계약을 따랐고, 그래서 다 채운 사용자에게 "아직 곡이 없어요"라고 거짓말했다 |
>
> **왜 놓쳤나**: 위 5쌍은 전부 *같은 동작을 서술한* 절끼리 짝지은 것이다. 이번 모순은 **화면이 요구한 상태 구분**과
> **응답 계약이 낼 수 있는 정보량** 사이에 있었다 — 서술이 겹치지 않으니 "겹치는 절" 기준에 안 걸렸다.
>
> **다음 사이클 점검 항목 추가**: *"UI가 구분하겠다고 한 상태를, 응답 계약이 실제로 구분해 낼 수 있는가."*
> 화면의 분기 개수와 그 분기를 가르는 데 필요한 서버 값이 짝이 맞는지 센다.

(직전 사이클 Gap 4건 중 3건이 설계서 자기모순이었다 — 이 표가 그 재발 방지였고, 이번엔 한 겹 덜 잡았다.)

---

## Version History

| 버전 | 날짜 | 변경 | 작성자 |
| --- | --- | --- | --- |
| 0.1 | 2026-08-23 | 최초 작성. B안(서버 완결, Checkpoint 3 사용자 선택 — 추천 C 대신 검증 강도·MCP 계약 선례 근거). Plan ★ 6건 전부 결정(D-A~F), 결정 기록 10건(D-A~J). 회고 Try 반영: §5.5 동선 체크리스트 신설, §12 자기모순 점검 1회(모순 0건). 컨벤션 C-9 신설 | Claude |
| 0.2 | 2026-08-23 | Check 반영. **계약 변경 1건** — §3.2·§4.2에 `totalSongs` 추가(Gap-1: §5.1↔§4.2 자기모순으로 "다 채웠어요"가 도달 불가였다). 문서 정정 3건 — §4.1 DELETE 소비자 없음(Gap-8), §11.1 수정 파일 7→9(Gap-7), §3.4 `resolveTab`→`qualifies` 명명(Gap-9). §12에 **점검 실패 기록**과 다음 사이클 점검 항목 추가 | Claude |
