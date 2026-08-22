# first-take 분석 보고서 (Gap Analysis)

> **분석 유형**: Gap Analysis (Design vs 구현) + 배포 검증
>
> **프로젝트**: sing-diary
> **사이클**: first-take
> **분석일**: 2026-08-23
> **설계 문서**: [first-take.design.md](./first-take.design.md)

---

## Context Anchor

| Key | Value |
| --- | --- |
| **WHY** | 노래방 기록이 휘발된다. 기록할 도구 자체가 존재하지 않는다. |
| **WHO** | sing-diary 사용자 본인(1인), 모바일 현장 기록 |
| **RISK** | Neon 트랜잭션 원자성 — WebSocket Pool로 해소를 시도했으나 프로덕션에서 재발, 최종적으로 `pg`(순수 TCP)로 재해소 (아래 §Decision Record 참조) |
| **SUCCESS** | 실제 방문 1회 이 앱만으로 기록 완료 + 불변식 4종 테스트 통과 |
| **SCOPE** | 부트스트랩 → 스키마/인증 → 세션 API → 오늘의 플리 UI → 순서변경 → 배포 |

---

## Strategic Alignment Check

PRD는 작성하지 않았다(Plan 단계에서 바로 시작, `/pdca pm` 생략) — PRD Alignment 항목은 해당 없음.

### Success Criteria Status (Plan §4.1 Definition of Done)

| # | 기준 | 상태 | 근거 |
| --- | --- | :---: | --- |
| SC-1 | FR-01~FR-13 전부 구현 | ✅ | 아래 §2.1~2.5 |
| SC-2 | DB 불변식 테스트 4종 통과 | ✅ | `tests/invariants.test.ts` INV-1~4, 실 Neon(테스트 브랜치) 12/12 중 4개 |
| SC-3 | 도메인 배포 후 로그인→세션생성→곡추가→점수입력→순서변경 전 구간 동작 | ⚠️ **부분** | develop Preview(`dev.sing-diary.spiritflag.work`)에서는 전 구간 확인됨. **프로덕션 도메인(`sing-diary.spiritflag.work`, main 브랜치)은 아직 수정 전 버전** — 사용자가 "사이클 끝나고 한 번에 머지"를 명시적으로 선택해 의도적으로 지연 중 |
| SC-4 | 빌드 성공, lint 에러 0 | ✅ | `npm run typecheck`/`npm run lint` 클린, Vercel Preview 빌드 성공 |

**Success Rate**: 3.5/4 (SC-3은 코드상으로는 완료, 배포 반영만 사용자 결정으로 대기 중)

### Decision Record Verification

| 소스 | 결정 | 그대로 따름? | 편차 |
| --- | --- | :---: | --- |
| [Design §2] | B안(클린 아키텍처) 4계층 | ✅ | 없음 — domain/application/infrastructure/presentation 구조 그대로, ESLint 계층 규칙 위반 0건 |
| [Design §3.4 v0.1] | R1: Neon WebSocket Pool + `db.transaction()` | ❌→❌→✅(v0.4) | **세 번 개정**. v0.1(싱글턴 Pool) → 프로덕션 500(연결 끊김) → v0.3(요청별 Pool, 읽기 분리) → 쓰기 경로에서 재발(ws heartbeat가 freeze 중 크래시) → v0.4(`pg` 순수 TCP)로 최종 해소. Design 문서 자체를 그때그때 개정해 현재 구현과 100% 일치 |
| [Design §7] | 데이터 페칭: RSC 직접 유스케이스 호출, 변경은 fetch+`router.refresh()` | ✅ | `(app)/page.tsx`·`layout.tsx`가 `getCurrentSessionCached` 직접 호출. 단, 이 결정의 부산물로 `GET /api/sessions/current`는 명세·구현 다 있지만 **어떤 클라이언트 코드도 호출하지 않는 사실상 죽은 엔드포인트** (§2.6 참조) |
| [Design §7] | 인증: Clerk 미들웨어 기반 라우트 보호 | ✅ | 그대로. 단 Clerk 7.x가 `createRouteMatcher` deprecation 경고를 내고 있어 장기적으로는 페이지별 `auth.protect()`로 이전 권고 중 (지금은 경고일 뿐, 동작엔 문제 없음) |
| [Design §8] | 테스트: "실 Neon **브랜치** DB 대상" | ❌→✅ | **애초에 브랜치를 만들지 않고 `.env.local`의 단일 DB로 테스트를 돌렸다.** 그 DB가 Vercel Production과 동일해, `npm test`(매번 4테이블 delete)를 여러 번 실행하며 실사용 데이터가 반복적으로 삭제됨 — 사용자가 발견. 이후 `TEST_DATABASE_URL` 분리로 뒤늦게 correct. 이 사이클에서 발생한 **가장 심각한 프로세스 실수** |

---

## 1. 분석 개요

### 1.1 목적

first-take 사이클의 Design 문서와 실제 구현·배포 상태 사이의 간극을 측정하고, Report 단계로 넘어가기 전 남은 위험을 명시한다.

### 1.2 범위

- 설계 문서: `docs/PDCA/2026-08/first-take/first-take.design.md`
- 구현 경로: `src/` 전체(45개 신규 파일 상당)
- 배포: Vercel(`sing-diary` 프로젝트), develop Preview + Production(main, 아직 구버전)

---

## 2. Gap Analysis (Design vs 구현)

### 2.1 API 엔드포인트

| Design (§4.1) | 구현 | 상태 | 비고 |
| --- | --- | :---: | --- |
| GET /api/sessions/current | `app/api/sessions/current/route.ts` | ✅ 일치 | 단 실제 호출자 없음(§2.6) |
| POST /api/sessions | `app/api/sessions/route.ts` | ✅ 일치 | |
| POST /api/sessions/:id/entries | `app/api/sessions/[id]/entries/route.ts` | ✅ 일치 | 초기 구현에 `song` 필드 누락 버그, 브라우저 QA로 발견·수정 |
| PUT /api/sessions/:id/entries/order | `app/api/sessions/[id]/entries/order/route.ts` | ✅ 일치 | |
| PATCH /api/entries/:id | `app/api/entries/[id]/route.ts` | ✅ 일치 | |
| DELETE /api/entries/:id | 〃 | ✅ 일치 | |

**6/6 일치, 구조적 누락 없음.**

### 2.2 데이터 모델

Design §3.3 SQL과 `src/infrastructure/db/schema.ts`를 대조 — 컬럼·타입·제약(부분 유니크, CHECK, FK CASCADE/RESTRICT) 전부 일치. 추가된 것은 `relations()` 정의(리포지토리 조인용, module-3에서 필요해져 추가 — Design §3.3에 이미 사유 기록됨)뿐이며 스키마 자체의 편차는 없음.

### 2.3 컴포넌트 구조

Design §9.4 파일 트리와 실제 구조를 대조한 결과 거의 1:1 일치. Design에 없었지만 합리적으로 추가된 파일:

| 파일 | 사유 |
| --- | --- |
| `domain/index.ts` | barrel export, 계층 규칙과 무관 |
| `infrastructure/db/transaction-client.ts` | R1 재개정(v0.3~0.4)으로 신설, Design §3.4에 문서화됨 |
| `presentation/api/auth.ts`, `current-session.ts` | Clerk 인증 헬퍼, 요청 스코프 캐시 — Design §7 결정의 자연스러운 구현 세부사항 |
| `tests/support/db.ts` | 테스트 DB 분리 수정으로 신설 |

**누락된 파일 없음.**

### 2.4 Functional Depth

전 파일이 스켈레톤·목데이터 없이 완전히 구현됨. Placeholder(TODO, `throw new Error("not implemented")` 등) 검색 결과 없음. 점수: **97/100** (song 필드 누락 버그가 발견 시점엔 실동작 결함이었으나 현재는 수정 완료 — 과거 결함 이력만 감점 요인으로 남김).

### 2.5 Page UI Checklist 검증 (Design §5.4)

| 화면 | 항목 수 | 구현 | 미구현 | 비율 |
| --- | :---: | :---: | :---: | :---: |
| 오늘의 플리(세션 있음) | 8 | 8 | 0 | 100% |
| 오늘의 플리(세션 없음) | 1 | 1 | 0 | 100% |
| 세션 생성 | 5 | 5 | 0 | 100% |
| 인증 | 1 | 1 | 0 | 100% |

**Functional Match Rate: 100%** (사용자 브라우저 전수 테스트로 실측 확인 — 로그인, 세션 생성, 곡 추가/중복, 점수 입력, 순서변경, 삭제)

### 2.6 API Contract 검증 (3-way: Design ↔ Server ↔ Client)

| # | 엔드포인트 | Design | Server | Client | 판정 |
| :-: | --- | :-: | :-: | :-: | :-: |
| 1 | GET /api/sessions/current | ✅ | ✅ | ❌ 호출 없음 | **주석 필요** (아래) |
| 2 | POST /api/sessions | ✅ | ✅ | ✅ | PASS |
| 3 | POST /api/sessions/:id/entries | ✅ | ✅(수정 후) | ✅ | PASS |
| 4 | PUT /api/sessions/:id/entries/order | ✅ | ✅ | ✅ | PASS |
| 5 | PATCH /api/entries/:id | ✅ | ✅ | ✅ | PASS |
| 6 | DELETE /api/entries/:id | ✅ | ✅ | ✅ | PASS |

**#1 관련**: 계약 위반은 아니다(명세·구현 모두 맞음). 다만 §7 데이터 페칭 결정(RSC 직접 호출)에 따라 프런트엔드가 이 라우트를 전혀 쓰지 않는다 — 죽은 코드는 아니지만 "지금 당장은 미사용"인 상태다. ARCHITECT §7 "이후" 로드맵(MCP 서버화)을 위해 의도적으로 남겨둔 것으로 해석 가능하나, Design에 그 의도가 명시돼 있지는 않다.

**Contract Match Rate: 6/6 = 100%** (위반 0건)

### 2.7 Runtime Verification 결과

#### L1: API 엔드포인트 테스트 (curl 등가 — 실제 Clerk 세션으로 완전 실행)

curl 자체는 Clerk handshake(JS 리다이렉트 체인)를 완주하지 못해 인증 라우트를 못 찍는다(module-1부터 확인된 한계). 이를 우회하기 위해 `scripts/run-l1.mjs`를 신설 — Clerk Backend API로 전용 테스트 유저를 만들고 **sign-in token(ticket 전략)으로 실제 로그인을 리딤**해 배포가 신뢰하는 바로 그 Clerk 인스턴스의 진짜 세션 JWT를 발급받은 뒤, `Authorization: Bearer`로 8개 시나리오를 전부 `fetch`로 실행한다. 끝나면 그 테스트 유저 소유 DB 행(owner_id로 정확히 scope)과 Clerk 유저 자체를 삭제한다 — `resetAndSeed`류의 전체 delete는 쓰지 않는다.

develop Preview(`sing-diary-fjrpmbpy0-...vercel.app`, Vercel Protection Bypass 헤더로 접근)에 대해 실행:

| # | 테스트 | 기대 | 실제 | 결과 |
| :-: | --- | --- | --- | :-: |
| 1 | GET current (미인증) | 401 | **404** | ❌ |
| 2 | POST /sessions brand=XX | 400 + fieldErrors | 400 + fieldErrors | ✅ |
| 3 | POST /sessions 정상 | 201 | 201 | ✅ |
| 4 | POST entries number='' | 400 | 400 | ✅ |
| 5 | POST entries 정상 | 201, data.position | 201, position 존재 | ✅ |
| 6 | PATCH score=101 | 400 | 400 | ✅ |
| 7 | PUT order 불일치 집합 | 400 INVALID_POSITION_SET | 400 INVALID_POSITION_SET | ✅ |
| 8 | DELETE entry 정상 | 200 | 200 | ✅ |

**L1 Score: 7/8 = 87.5%** (실제 실행, 더 이상 추정치 아님)

**#1 실패 분석**: 인증된 6개 API는 전부 명세와 정확히 일치했다 — 이는 실사용자 경로(항상 로그인된 상태로만 호출됨)가 100% 정상 동작함을 실측으로 증명한다. #1만 실패한 이유는 Clerk 미들웨어가 세션 쿠키/토큰이 **전혀 없는** 요청에 대해 즉시 401을 반환하지 않고 handshake용 interstitial로 rewrite하기 때문 — 그 결과가 매칭되는 페이지가 없어 404로 떨어진다. **접근 자체는 확실히 거부되므로 보안 결함은 아니다.** Design §4.3 에러 계약과 상태 코드가 다를 뿐 — 우리 프런트엔드는 이 라우트를 무인증으로 호출하는 경로가 없어(§2.6 참조) 실사용에 영향 없음.

**교훈**: 처음엔 dev Clerk 인스턴스 키로 이 스크립트를 더 간단히(`sessions.createSession()` 직접 호출) 만들려 했으나, Clerk 인스턴스는 서로 다른 서명 도메인이라 dev 인스턴스가 발급한 토큰은 배포가 신뢰하는 production 인스턴스에서 그냥 미인증 취급된다는 걸 실측으로 확인 — Neon 브랜치(§Decision Record 참조)와 달리 "동일 종류의 다른 사본"이 아니었다.

#### L2/L3 대체: 브라우저 수동 검증 (Plan 결정에 따름)

Plan §8 결정("L2/L3는 배포본 수동 검증으로 대체")에 따라 Playwright 대신 사용자가 `dev.sing-diary.spiritflag.work`에서 직접 전 시나리오를 수행:

| # | 시나리오 | 결과 |
| :-: | --- | :-: |
| 1 | 로그인 → 오늘의 플리 진입 | ✅ (경로상 2개 프로덕션 크래시 발견·수정 후 통과) |
| 2 | 세션 생성(날짜·지점·브랜드) | ✅ |
| 3 | 번호로 곡 추가(신곡) | ✅ (song 필드 버그 수정 후) |
| 4 | 동일 번호 중복 추가 | ✅ |
| 5 | 점수 인라인 입력 | ✅ |
| 6 | 드래그 순서변경 | ✅ |
| 7 | entry 삭제 | ✅ |

**수동 검증: 7/7 통과**

#### DB 계층 자동 테스트 (INV+UC)

`npm test` — 이제 격리된 Neon 테스트 브랜치 대상. INV-1~4 + UC-1~8 **12/12 통과**.

### 2.8 Match Rate 종합

```
┌─────────────────────────────────────────────┐
│  Structural Match Rate:   98%                │
│  Functional Match Rate:  100%                │
│  Contract Match Rate:    100%                │
│  Runtime Match Rate:      95%                │
│  ───────────────────────────────────────────  │
│  Overall Match Rate:      97%                │
│  = (98×0.15)+(100×0.25)+(100×0.25)+(95×0.35) │
├─────────────────────────────────────────────┤
│  Runtime 95% 산정 근거(전부 실측):             │
│   L1(실제 인증 세션, curl 등가) 7/8=87.5%,     │
│   자동(INV+UC, 실 Neon 테스트 브랜치) 12/12=  │
│   100%, 수동 UI(브라우저 전수) 7/7=100%        │
│   → 87.5×0.4 + 100×0.3 + 100×0.3 = 95        │
└─────────────────────────────────────────────┘
```

**Overall Match Rate: 97%** — Plan §4.2 목표(≥90%) 충족. 초판(96%, 추정 포함)보다 상향 — L1을 실측으로 채운 결과.

---

## 3. Clean Architecture Compliance

### 3.1 계층 의존성 검증

| 계층 | 기대 의존 | 실제 | 상태 |
| --- | --- | --- | :-: |
| Presentation | Application, Domain | 동일(container.ts만 infrastructure 참조 — ESLint `ignores`로 명시 허용) | ✅ |
| Application | Domain만 | 동일 | ✅ |
| Domain | 없음 | 동일(zod조차 미참조) | ✅ |
| Infrastructure | Domain, Application/ports | 동일 | ✅ |

`npm run lint` 계층 규칙(no-restricted-imports) 위반 **0건**.

### 3.2 위반 사항

없음.

### 3.3 Architecture Score

```
┌─────────────────────────────────────────────┐
│  Architecture Compliance: 100%               │
├─────────────────────────────────────────────┤
│  계층 위반: 0건 / ESLint 규칙으로 강제됨       │
└─────────────────────────────────────────────┘
```

---

## 4. Convention Compliance

| 항목 | 상태 | 근거 |
| --- | :-: | --- |
| 다크 파스텔 토큰만 사용(하드코딩 색상 0건) | ✅ | `grep`으로 `globals.css` 외 hex 색상 0건 확인 |
| 네이밍(PascalCase 컴포넌트, camelCase 함수, kebab-case 유틸) | ✅ | 전 파일 육안 확인, 위반 없음 |
| DB snake_case ↔ TS camelCase 매핑 단일 지점 | ✅ | Drizzle 스키마에서만 처리 |
| Import 순서 | ✅ | ESLint import 규칙 통과 |

---

## 5. 보안 점검 (Design §7)

| 항목 | 상태 |
| --- | :-: |
| owner 스코프(모든 리포지토리가 ownerId로 필터) | ✅ 코드 확인 |
| 입력 검증(zod, 전 라우트) | ✅ |
| 인증(Clerk middleware) | ✅ |
| 존재 노출 방지(404, 403 아님) | ✅ |
| XSS(React 기본 이스케이프) | ✅ |
| Rate Limiting | ☐ M1 범위 제외(Plan에서 이미 결정) |

---

## 6. 발견된 이슈 (심각도순, 확신도 ≥80%)

| 심각도 | 이슈 | 확신도 | 조치 |
| :-: | --- | :-: | --- |
| 🔴 Critical | **프로덕션 도메인(main)이 아직 구버전** — ws 크래시·song 필드 버그가 실사용자에게 그대로 노출됨 | 100% | 코드 문제 아님. 사용자가 "사이클 종료 후 일괄 머지"를 명시적으로 선택한 상태 — Report 이후 종료 절차에서 반드시 처리 필요 |
| 🟢 Minor | 무인증 GET 요청이 401 대신 404를 반환(Clerk handshake 특성) | 95% | L1 실측(#1)으로 확인. 접근 차단 자체는 정상 — 상태 코드만 명세와 다름. 우리 프런트엔드는 이 경로를 무인증으로 호출하지 않아 실사용 영향 없음 |
| 🟢 Minor | NFR(3탭 이내, 2초 이내 응답) 수치 미측정 | 80% | Plan에 측정 방법은 정의됐으나 실측은 안 함. M1 완료를 막을 사안 아님 |

**Critical 1건은 "배포 반영 지연"이라는 사용자의 명시적 결정에 기인 — 코드 결함이 아니다.**
**Important 2건은 모두 이번 세션에서 직접 해소**: `GET /api/sessions/current`는 유지 결정 후 Design에 의도 명시(§4.2), L1 curl 매트릭스는 Clerk sign-in token 리딤 스크립트(`scripts/run-l1.mjs`)로 7/8 실측 완료.

---

## 7. Next Steps

- [ ] Report 작성(`first-take.report.md`)
- [ ] RULE.md 종료 절차: develop→main 최종 머지, 태그, `pdcaw upload`
- [ ] (선택) M2 착수 전 `GET /api/sessions/current` 존치 여부 결정

---

## Version History

| 버전 | 날짜 | 변경 | 작성자 |
| --- | --- | --- | --- |
| 0.1 | 2026-08-23 | 최초 작성. Overall Match Rate 96%, Critical 1건(배포 반영 지연, 코드 결함 아님) | Claude |
| 0.2 | 2026-08-23 | Important 2건 해소: `GET /api/sessions/current` 유지 결정(Design 반영), L1을 Clerk sign-in token 리딤 스크립트로 실측(7/8). Overall Match Rate 96%→97% | Claude |
