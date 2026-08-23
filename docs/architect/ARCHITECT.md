# ARCHITECT.md

> **sing-diary** — 노래방 점수 기록 서비스
> Version 2 · 2026-08-23

---

## 1. 개요

노래방 방문을 세션 단위로 기록하고, 부른 곡의 순서·번호·점수를 관리한다.
모바일에서 빠르게 기록하고, PC에서 데이터를 정리한다.

| 항목 | 결정 |
| --- | --- |
| 배포 | Vercel (서버리스) |
| 데이터베이스 | Neon PostgreSQL |
| 인증 | Clerk |
| 프레임워크 | Next.js 15 App Router |
| ORM | Drizzle |
| 스타일 | Tailwind CSS · 다크 파스텔 |
| 도메인 | `sing-diary.spiritflag.work` |

---

## 2. 설계 원칙

1. **개인 소유가 기본이다.** 곡 마스터를 포함한 모든 데이터는 사용자별로 소유한다. 공용 데이터는 모더레이션 책임을 낳으므로 두지 않는다. 공유가 필요해지면 참조가 아닌 **사본 복사**로 해결한다.
2. **현장 입력은 최소, 정리는 사후에.** 노래방에서는 번호와 점수만 빠르게 남기고, 메타데이터는 집에서 큐 방식으로 채운다.
3. **상태는 DB가 강제한다.** 열린 세션 단일성, 번호 3-state 등 핵심 불변식은 애플리케이션 코드가 아닌 제약조건으로 보장한다.
4. **확장 가능성은 스키마로만 열어둔다.** UUID 부여, 중복 곡 허용 등 구조는 미리 갖추되, 기능 구현은 필요해질 때 한다.

---

## 3. 도메인 모델

```
User (Clerk)
 ├── Song ──── SongNumber (brand별 0..2)
 └── Session ─ Entry ──▶ Song
```

- **Song** — 사용자가 소유한 곡. 동일 곡의 다른 버전(라이브, 듀엣 등)은 별도 레코드.
- **SongNumber** — 브랜드(TJ/KY)별 곡 번호와 지원 상태.
- **Session** — 하루의 노래방 방문. 사용자당 열린 세션은 항상 1개 이하.
- **Entry** — 세션 안에서 부른 곡 한 건. 순서와 점수를 가진다.

---

## 4. 스키마

### 4.1 songs

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | |
| owner_id | text | NOT NULL | Clerk userId |
| title | text | | 번호만 등록된 신곡은 NULL |
| artist | text | | |
| memo | text | | |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |

```
INDEX idx_songs_owner        (owner_id)
INDEX idx_songs_trgm         GIN ((coalesce(title,'') || ' ' || coalesce(artist,'') || ' ' || coalesce(memo,'')) gin_trgm_ops)
                              -- pg_trgm, 결합 표현식 단일 GIN. 다컬럼 GIN이 아님 — 정정
                              -- (expand-song-catalog §1.3 ★ⓐ). owner 스코프 검색에서는
                              -- idx_songs_owner가 선택되어 이 인덱스가 실사용되지 않는다
                              -- (EXPLAIN 실측, 같은 사이클 Design §1.3). 규모가 커질 때를
                              -- 대비해 표현식은 유지한다.
```

### 4.2 song_numbers

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| song_id | uuid | FK → songs, CASCADE | |
| brand | brand_enum | | 'TJ' \| 'KY' |
| number | text | | |
| status | number_status | NOT NULL | 'AVAILABLE' \| 'UNSUPPORTED' |

```
PRIMARY KEY (song_id, brand)
CHECK (status <> 'AVAILABLE' OR number IS NOT NULL)
```

**번호 3-state**

| 상태 | 의미 | 표현 |
| --- | --- | --- |
| NULL | 아직 입력하지 않음 | 행이 존재하지 않음 |
| NONE | 해당 브랜드 미지원 | status = 'UNSUPPORTED' |
| 지원 | 번호 보유 | status = 'AVAILABLE' + number |

### 4.3 sessions

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | |
| owner_id | text | NOT NULL | Clerk userId |
| visit_date | date | NOT NULL | |
| venue | text | NOT NULL | 자유 입력 |
| brand | brand_enum | NOT NULL | 세션의 기기 브랜드 |
| is_public | boolean | NOT NULL DEFAULT false | |
| closed_at | timestamptz | | NULL = 진행 중 |
| created_at | timestamptz | NOT NULL | |

```
INDEX  idx_sessions_owner_date (owner_id, visit_date DESC)
UNIQUE idx_sessions_open       (owner_id) WHERE closed_at IS NULL
```

부분 유니크 인덱스가 **"열린 세션은 사용자당 1개"** 를 DB 레벨에서 강제한다.

### 4.4 entries

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| id | uuid | PK | |
| session_id | uuid | FK → sessions, CASCADE | |
| song_id | uuid | FK → songs, RESTRICT | |
| position | int | NOT NULL | 1..N, 순서변경 대상 |
| score | numeric(5,2) | | NULL = 미채점/오류 |
| created_at | timestamptz | NOT NULL | |

```
INDEX idx_entries_session (session_id, position)
```

동일 곡의 중복 등록을 허용한다 (유니크 제약 없음).

---

## 5. 핵심 플로우

### 5.1 세션 수명주기

새 세션 생성이 이전 세션을 닫는 유일한 트리거다.

```sql
BEGIN;
UPDATE sessions SET closed_at = now()
 WHERE owner_id = $1 AND closed_at IS NULL;
INSERT INTO sessions (owner_id, visit_date, venue, brand) VALUES (...);
COMMIT;
```

"오늘의 플리"는 항상 `closed_at IS NULL` 인 세션을 가리킨다.
자정을 넘겨도 세션은 유지된다.

### 5.2 곡 추가 — 브랜드 변환

세션 브랜드 기준으로 대상 곡의 SongNumber 를 조회한다.

| 조회 결과 | 동작 |
| --- | --- |
| AVAILABLE | 즉시 추가 |
| UNSUPPORTED | "미지원 곡입니다" 안내 → 번호 입력 제안 → 입력 시 AVAILABLE 전환 후 추가 |
| 행 없음 | "번호가 아직 없습니다" 안내 → 번호 입력 제안 → 입력 후 추가 |

모든 분기에서 **입력을 건너뛰고 추가하는 경로를 허용**한다. 결손은 빈칸채우기 큐가 회수한다.

### 5.3 신곡 즉석 등록

현장에서 번호만으로 추가하는 흐름:

```
번호 입력
 → 세션 브랜드 + 번호로 기존 곡 검색
 → 없으면: songs stub 생성 (title NULL)
          + song_numbers (brand, number, AVAILABLE)
 → entry 생성
```

stub 은 자동으로 빈칸채우기 큐 대상이 된다.

### 5.4 과거 플리에서 가져오기

과거 세션(본인 또는 공개된 타인)의 곡을 탭하면:

- **본인 곡** → 오늘의 플리에 entry 추가 (5.2 변환 로직 적용)
- **타인 곡** → 해당 시점 데이터를 내 songs 로 **사본 복사** 후 추가

사본 정책: 원본과의 연결을 유지하지 않는다. 이후 원본의 변경·훼손은 내 데이터에 영향을 주지 않는다.

### 5.5 순서 변경

드래그 종료 시 세션 전체 entries 의 position 을 1..N 으로 재부여한다.
세션당 항목 수가 수십 건 규모이므로 단순 재인덱싱으로 충분하다.

### 5.6 빈칸채우기 큐

```sql
-- 큐 A · 번호 결손 (브랜드별)
SELECT s.* FROM songs s
LEFT JOIN song_numbers n
  ON n.song_id = s.id AND n.brand = $brand
WHERE s.owner_id = $1 AND n.song_id IS NULL;

-- 큐 B · 메타 결손
SELECT * FROM songs
WHERE owner_id = $1 AND (title IS NULL OR artist IS NULL);
```

큐 UI: 한 건씩 제시 → 외부 검색 링크 + 입력 폼 → 저장 시 다음 건으로 자동 이동.
memo 결손은 큐 대상이 아니다.

### 5.7 통합검색

키워드가 title / artist / memo 중 하나라도 매칭되면 반환.
초기엔 `pg_trgm` + ILIKE, 규모가 커지면 tsvector 로 전환한다.

---

## 6. 화면 구성

### 모바일 — 기록

| 화면 | 역할 |
| --- | --- |
| 오늘의 플리 | 진행 중 세션. 곡 추가 · 점수 입력 · 슬라이딩 순서변경 |
| 세션 생성 | 날짜 · 지점 · 브랜드 |
| 지난 플리 | 세션 목록 → 상세. 곡 탭하여 오늘로 가져오기 |
| 곡 검색 | 통합검색 → 결과에서 바로 추가 |

### PC — 정리

| 화면 | 역할 |
| --- | --- |
| 곡 관리 | 표 (TJ · KY · 제목 · 아티스트 · 메모), 검색, 인라인 수정. 기본정렬: 제목 → 아티스트 가나다순 |
| 빈칸채우기 | 큐 방식 순차 처리 |
| 일괄 입력 | 표 형태 반복 입력 (사후 기록) |

---

## 7. 마일스톤

| 단계 | 범위 | 완료 기준 |
| --- | --- | --- |
| **M1** | 인증 · 스키마 · 세션 · 오늘의 플리 CRUD · 순서변경 · 번호 즉석 등록 | 다음 노래방 방문에서 실사용 가능 |
| **M2** | 통합검색 · 지난 플리 가져오기 · 브랜드 변환 · 곡 관리 표 | 과거 데이터 기반 선곡 가능 |
| **M3** | 빈칸채우기 큐 · 일괄 입력 · 공개 설정 | 사후 정리 워크플로우 완성 |
| 이후 | 통계(곡별 이력 · 최고점) · MCP 서버화 | — |

---

## 8. 결정 기록

| # | 결정 | 근거 |
| --- | --- | --- |
| D1 | 곡 마스터를 사용자별 소유로 분리 | 공용 마스터는 어뷰징 대응·모더레이션 부담을 낳음. 공유는 사본 복사로 대체 |
| D2 | 노래방 번호는 전량 수동 입력 | 공식 API 부재. 크롤링은 불안정하며 사용 곡 풀이 한정적 |
| D3 | 곡 버전(라이브·듀엣 등)은 별도 레코드 | 곡명 자체가 다르며 번호도 다름 |
| D4 | 점수 numeric(5,2), NULL 허용 | KY 소수점 지원. 채점 오류·미채점도 기록 대상 |
| D5 | 세션 종료는 새 세션 생성 시점 | 자정 초과 사용이 일상적. 수동 종료는 누락됨 |
| D6 | 오프라인 대응·PWA 미구현 | 사용 환경에서 네트워크 안정적 |
| D7 | §4.1 `idx_songs_trgm` 표기 정정 — 다컬럼 GIN → 결합 표현식 단일 GIN | first-take 설계 의도와 실제 구현이 처음부터 달랐다(사유는 first-take Design §3.3). M2 착수 전 `EXPLAIN` 실측(expand-song-catalog Design §1.3)으로 확인 후 문서를 실물에 맞춘다 |

---

*Version 2 부터의 변경은 본 문서 상단 버전과 §8 결정 기록에 반영한다.*
