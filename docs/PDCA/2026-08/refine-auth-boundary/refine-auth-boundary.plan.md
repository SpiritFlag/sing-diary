# refine-auth-boundary 계획서

> **요약**: 인증 경계를 미들웨어 경로매칭에서 리소스 단위 체크로 옮기고, 그 결과로 무인증 API 응답을 401로 되돌린 뒤, 같은 L1 실행에서 NFR 수치를 처음으로 실측한다.
>
> **프로젝트**: sing-diary
> **버전**: v1.0.1 (예정)
> **사이클**: refine-auth-boundary
> **작성일**: 2026-08-23
> **상태**: Draft

---

## Executive Summary

| 관점 | 내용 |
| --- | --- |
| **문제** | 인증 경계가 `src/middleware.ts`의 경로매칭(`createRouteMatcher`)에 얹혀 있다. Clerk가 다음 메이저에서 이 API를 제거하겠다고 예고했고, 같은 미들웨어의 handshake 특성 때문에 무인증 API 요청이 401이 아닌 404로 떨어진다. 게다가 M1에서 정의만 하고 재보지 못한 NFR 수치가 아직 공백이다. |
| **해결** | `auth.protect()`와 `createRouteMatcher`를 걷어내고 보호 책임을 전량 리소스 쪽(`requireOwnerId()` 계열)으로 이관한다. 그 과정에서 API는 401을, 페이지는 sign-in 리다이렉트를 각각 자기 자리에서 내도록 `requireOwnerId()`를 두 갈래로 쪼갠다. 마지막으로 `scripts/run-l1.mjs`에 왕복시간 계측을 붙여 세 항목을 한 번의 실행으로 닫는다. |
| **기능/UX 효과** | 사용자가 보는 화면은 달라지지 않는다. 미인증 접근 시 sign-in으로 가는 동작도 그대로다. 달라지는 것은 경계가 어디에 있는지와, 그 경계가 내는 응답이 명세와 일치하는지다. |
| **핵심 가치** | M2가 화면·API를 대거 추가하기 전에 경계를 옮긴다 — 지금 옮기면 대상은 라우트 8개, M2 뒤에 옮기면 그 두 배다. **先手必勝(선수필승)**. |

---

## Context Anchor

| Key | Value |
| --- | --- |
| **WHY** | Clerk가 `createRouteMatcher`를 다음 메이저에서 제거한다. 마이그레이션 대상이 M2에서 두 배로 불어나기 전에 경계를 옮긴다. |
| **WHO** | sing-diary 사용자 본인(1인). 화면상 변화는 없고, 수혜자는 M2를 짓는 후속 사이클이다. |
| **RISK** | 미들웨어의 `auth.protect()`를 걷어내면 `(app)` RSC에서 `requireOwnerId()`가 던지는 `UnauthorizedError`가 리다이렉트가 아닌 500으로 노출된다 — 지금은 미들웨어가 앞에서 막아줘서 드러나지 않았을 뿐이다. |
| **SUCCESS** | `npm run l1` 9/9 통과(무인증 API 401 + 무인증 페이지 리다이렉트 포함), Clerk deprecation 경고 소멸, NFR 2종 수치가 문서에 남는다. |
| **SCOPE** | 미들웨어 축소 → `requireOwnerId()` 2갈래 분리 → 페이지 리다이렉트 이관 → L1 계측 추가/9번 케이스 추가 → Preview 실측 |

---

## 1. Overview

### 1.1 목적

인증 경계를 **경로 기반(path matching)** 에서 **리소스 기반(resource-based)** 으로 완전히 이관하고,
그 부수 효과로 열려 있던 두 개의 결손(무인증 401/404, NFR 미실측)을 같은 실행으로 닫는다.

### 1.2 배경

first-take Design §7은 "Clerk middleware 기반 라우트 보호"를 명시적 결정으로 채택했다.
그 결정 자체는 당시 옳았으나, 이후 세 가지가 드러났다.

1. **Clerk가 그 API를 걷어낸다.** `createRouteMatcher`는 7.x에서 deprecated이며 다음 메이저에서 제거된다.
   Clerk의 사유는 "경로 매칭이 Next.js의 실제 라우팅과 어긋날 수 있어 보호 대상이 노출될 수 있다"는 것이다.
2. **같은 미들웨어가 상태 코드를 오염시킨다.** 세션 토큰이 전혀 없는 요청을 Clerk 미들웨어가 401로 끊지 않고
   handshake용 interstitial로 rewrite하는데, 매칭되는 페이지가 없어 최종 404가 된다
   (first-take Analysis §2.7, L1 #1 실패).
3. **NFR 수치가 공백이다.** Plan §3.2에 기준과 측정 방법은 적었으나 측정 도구를 만들지 않아 실측하지 못했다
   (first-take Report §111-112). 특히 `pg`(순수 TCP) 전환 이후 콜드스타트 특성은 아무도 재보지 않았다.

이 세 건은 같은 파일(`src/middleware.ts`)을 건드리고 같은 수단(`npm run l1` 1회)으로 검증되므로 한 사이클로 묶는다.

### 1.3 이미 절반은 되어 있다

`requireOwnerId()`가 **모든 API 라우트와 `(app)` 페이지에서 이미 개별 호출되고 있다.**
즉 Clerk가 권장하는 리소스 기반 체크는 사실상 절반 이상 적용된 상태이고, 미들웨어는 이중 방어였다.
남은 일은 `auth.protect()` 제거와 **리다이렉트 책임의 이관**뿐이다.

### 1.4 관련 문서

- 아키텍처: [ARCHITECT.md](../../../architect/ARCHITECT.md)
- 직전 사이클: [first-take.design.md](../first-take/first-take.design.md) · [first-take.analysis.md](../first-take/first-take.analysis.md) · [first-take.report.md](../first-take/first-take.report.md)
- 문서 규약: [RULE.md](../../../RULE.md)
- 브랜치·커밋 규약: [CONTRIBUTING.md](../../../../CONTRIBUTING.md)
- Clerk 마이그레이션 가이드: <https://clerk.com/docs/guides/development/upgrading/upgrade-guides/migrate-from-create-route-matcher>

---

## 2. Scope

### 2.1 In Scope

**A. 인증 경계 이관 (백로그 `391c54d6`)**

- [ ] `src/middleware.ts`에서 `createRouteMatcher` import와 `isPublicRoute` 제거
- [ ] `auth.protect()` 호출 제거 — `clerkMiddleware()`는 **껍데기로 유지**한다
      (`auth()`가 미들웨어 없이는 동작하지 않으므로 파일 삭제는 불가. §7.2 D-A 참조)
- [ ] `requireOwnerId()`를 두 갈래로 분리 — API용(throw → 401) / 페이지용(sign-in 리다이렉트)
- [ ] `(app)` 하위 3개 진입점(`layout.tsx`, `page.tsx`, `sessions/new/page.tsx`)을 페이지용 헬퍼로 교체
- [ ] `middleware.ts`의 Design Ref 주석을 새 결정으로 갱신
- [ ] dev 서버 기동 시 Clerk DEPRECATION WARNING이 사라짐을 확인

**B. 무인증 응답 정상화 (백로그 `c37bd457`)**

- [ ] L1 #1(`GET /api/sessions/current` 미인증)이 401을 반환
- [ ] 에러 본문이 Design §4.3 계약(`{ error: { code: "UNAUTHORIZED", ... } }`)과 일치

**C. NFR 실측 (백로그 `25c9f2bb`)**

- [ ] `scripts/run-l1.mjs`에 케이스별 **클라이언트 측 왕복시간(ms)** 계측 추가, 결과표에 컬럼 신설
- [ ] L1 **9번 케이스** 신설 — 무인증 `GET /`가 sign-in으로 리다이렉트되는지 확인
- [ ] 재배포 직후 1회차(콜드) / 연속 2회차(워밍) 두 벌 실측하여 수치를 Analysis에 기록
- [ ] 곡 추가 조작 카운트를 실제 화면 경로로 세어 문서화
- [ ] 실측값을 근거로 NFR 기준을 확정한다 — 초과 시 **기준 문구 자체를 재조정**한다 (사용자 결정)

### 2.2 Out of Scope

| 제외 항목 | 사유 |
| --- | --- |
| 응답성 튜닝(커넥션 재사용·캐싱·리전 조정) | 이번 사이클은 **측정과 기준 확정**까지다. 개선이 필요하다고 판명되면 별도 백로그로 연다 |
| Playwright(L2) 도입 | 3탭은 수동 조작 카운트로 확정(사용자 결정). 도구 도입 비용을 이번에 지지 않는다 |
| M2 기능(통합검색·지난 플리·브랜드 변환·곡 관리 표) | 백로그 `27178302`. 본 사이클은 그 **직전**에 경계만 옮긴다 |
| Clerk 메이저(8.x) 업그레이드 자체 | 본 사이클은 8.x에서 제거될 API의 **사용을 끊는** 것까지. 버전 올리기는 별건 |
| 미들웨어 `matcher` config 축소 | `clerkMiddleware()`가 `auth()` 지원을 위해 계속 전 라우트에 걸려야 한다. 좁히면 §5 R2가 커진다 |
| API 라우트의 owner 스코프 로직 변경 | 이미 전 라우트에 적용되어 있고 first-take Analysis에서 검증됨. 손대지 않는다 |

---

## 3. Requirements

### 3.1 기능 요구사항

| ID | 요구사항 | 우선순위 | 근거 |
| --- | --- | --- | --- |
| FR-01 | `src/middleware.ts`가 `createRouteMatcher`를 더 이상 import하지 않는다 | High | 백로그 `391c54d6` |
| FR-02 | `src/middleware.ts`가 `auth.protect()`를 호출하지 않는다. `clerkMiddleware()` 자체는 남아 `auth()`가 계속 동작한다 | High | 백로그 `391c54d6` |
| FR-03 | 모든 API 라우트는 무인증 요청에 **401**과 `{ error: { code: "UNAUTHORIZED" } }`를 반환한다 | High | 백로그 `c37bd457`, first-take Design §4.3 |
| FR-04 | `(app)` 하위 페이지는 무인증 접근 시 **sign-in으로 리다이렉트**한다. 500이 노출되지 않는다 | High | §5 R1 |
| FR-05 | sign-in 완료 후 원래 요청했던 경로로 복귀한다 | Medium | Clerk `redirectToSignIn()` 기본 동작 |
| FR-06 | 인증된 요청의 동작·응답은 이번 변경 전후로 동일하다 (L1 #2~8 회귀 없음) | High | 회귀 방지 |
| FR-07 | `npm run l1`이 케이스별 왕복시간(ms)을 출력한다 | High | 백로그 `25c9f2bb` |
| FR-08 | L1에 무인증 페이지 접근 케이스(#9)가 추가되어 리다이렉트를 검증한다 | High | 사용자 결정 |
| FR-09 | L1은 `L1_TARGET_URL` / `L1_VERCEL_BYPASS`로 Preview를 찌를 수 있다 (기존 기능 유지) | High | 검증 대상 결정 |
| FR-10 | 테스트 유저·데이터 정리(scope된 삭제)는 계측 추가 후에도 그대로 동작한다 | High | first-take 사고 재발 방지 |

### 3.2 비기능 요구사항

| 범주 | 기준(현행) | 측정 방법 | 이번 사이클 처리 |
| --- | --- | --- | --- |
| 모바일 UX | 곡 추가는 세션 화면에서 3탭 이내 | 실제 화면 조작 카운트를 세어 문서 기록 | **실측 후 확정** |
| 응답성 | 콜드스타트 포함 곡 추가 응답 2초 이내 | L1 스크립트의 클라이언트 왕복시간(ms). 재배포 직후 1회차=콜드, 연속 2회차=워밍 | **실측 후 확정 — 초과 시 기준 재조정** |
| 데이터 격리 | 타 사용자 `owner_id` 데이터가 어떤 API로도 노출되지 않음 | L1 #2~8 회귀 없음 + owner 스코프 코드 리뷰 | 회귀 확인 |
| 인증 계약 | 무인증 응답이 Design §4.3 계약과 일치 | L1 #1 + #9 | 신규 확정 |

> **기준 재조정 시의 규칙**: 2초를 넘긴 경우 임의로 숫자를 늘리지 않는다.
> 콜드/워밍 두 수치를 나란히 제시하고, 각각에 대해 별도 기준을 세우거나
> "워밍 X초 / 콜드 Y초"처럼 실측 근거를 문구에 박아 넣는다. 근거 없는 완화는 하지 않는다.

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01 ~ FR-10 전부 구현
- [ ] **`npm run l1` 9/9 통과** (Preview 대상)
  1. `#1` 무인증 `GET /api/sessions/current` → **401** (기존 404에서 복구)
  2. `#2~8` 인증 API 6종 → 기존과 동일하게 통과 (회귀 0)
  3. `#9` 무인증 `GET /` → sign-in 리다이렉트 (신규)
- [ ] 케이스별 왕복시간 ms가 출력되고, 콜드/워밍 2벌 수치가 Analysis에 표로 남음
- [ ] 곡 추가 조작 카운트 실측값이 Analysis에 기록됨
- [ ] NFR 2종의 **확정 기준 문구**가 실측 근거와 함께 확정됨 (재조정한 경우 그 사유 포함)
- [ ] dev 서버 기동 로그에 Clerk DEPRECATION WARNING 없음
- [ ] `npm run build` 성공, `npm run lint` 에러 0, `npm run typecheck` 에러 0
- [ ] Preview 검증 통과 후 develop → main PR 병합 (프로덕션 선반영 금지)

### 4.2 품질 기준

- [ ] 기존 Vitest 스위트 전량 통과 (`npm test`)
- [ ] `grep -rn "createRouteMatcher\|auth.protect" src/` 결과 0건
- [ ] Gap 분석 Match Rate ≥ 90%

---

## 5. Risks and Mitigation

| # | 리스크 | 영향 | 가능성 | 완화 |
| --- | --- | --- | --- | --- |
| **R1** | **`auth.protect()` 제거 후 `(app)` RSC의 `requireOwnerId()`가 던진 `UnauthorizedError`가 리다이렉트가 아닌 500으로 노출** — 지금은 미들웨어가 앞에서 막아 드러나지 않았다. 이번 작업의 진짜 몸통 | **High** | **High** | 페이지용 헬퍼를 별도로 만들어 `auth()` + `redirectToSignIn()`을 쓴다. API용 throw 경로와 **한 함수로 겸용하지 않는다**(Next.js `redirect()`는 예외를 던지는 방식이라 `try/catch` 매핑 경로와 섞이면 삼켜진다). Design 단계에서 반드시 확정 |
| R2 | 미들웨어에서 `auth.protect()`가 빠져 보호 공백 발생 | High | Low | `requireOwnerId()`가 이미 전 API 라우트·페이지에서 호출 중(§1.3). Design에서 **호출 지점 전수 목록**을 만들어 누락 0건을 확인한다 |
| R3 | **★ⓐ** 미들웨어를 걷어내도 401이 안 나올 수 있다 — 백로그도 "가능성이 높다"고만 적혀 있고 아무도 실측 안 했다 | Medium | Low | `auth.protect()`가 빠지면 rewrite 사유가 사라져 라우트 핸들러까지 도달하고 `mapError`가 401을 낸다는 것이 근거 있는 기대. 그래도 **Do 초반에 이 한 케이스만 먼저 배포해 실측**하고, 401이 아니면 라우트 핸들러에서 명시적으로 처리하는 대안으로 전환한다 |
| R4 | **★ⓑ** `pg`(순수 TCP) 전환 이후 콜드스타트가 2초를 넘긴다 | Medium | Medium | 기준 재조정으로 대응(사용자 결정, §3.2). 튜닝은 별도 백로그. 다만 콜드/워밍을 분리 측정해 **어느 쪽이 문제인지**는 이번에 특정한다 |
| R5 | **★ⓒ** Clerk 공식 가이드가 App Router RSC 미인증 리다이렉트를 충분히 커버하지 않는다 | Medium | Low | Clerk는 `auth()` + `redirectToSignIn()` 패턴을 App Router용으로 명시 제공한다. Design 단계에서 실제 버전(`@clerk/nextjs` 7.8.x)의 시그니처를 코드로 확인하고, 미흡하면 `redirect("/sign-in")` 직접 호출로 대체 |
| R6 | L1 스크립트 수정 중 정리(cleanup) 로직이 깨져 테스트 유저·데이터가 남는다 | High | Low | 계측은 `req()` 래퍼와 `record()`에만 넣고 `finally` 블록은 **손대지 않는다**. first-take에서 낸 사고(전체 delete)를 되풀이하지 않는다 |
| R7 | 9번 케이스가 리다이렉트를 따라가버려 판정이 흐려진다 | Low | Medium | `fetch(..., { redirect: "manual" })`로 3xx와 Location 헤더를 직접 본다. Design에서 판정 조건 명시 |
| R8 | Preview 검증만 하고 프로덕션에서 다르게 동작한다 | Medium | Low | Preview와 프로덕션이 같은 Clerk 인스턴스·같은 Neon을 쓰는지 Design에서 확인. 다르면 병합 후 프로덕션 1회 재검증을 Next Steps에 추가 |

---

## 6. Impact Analysis

### 6.1 변경 리소스

| 리소스 | 유형 | 변경 내용 |
| --- | --- | --- |
| `src/middleware.ts` | 수정 | `createRouteMatcher`·`isPublicRoute`·`auth.protect()` 제거. `clerkMiddleware()` 껍데기 + `config.matcher` 유지 |
| `src/presentation/api/auth.ts` | 수정 | `requireOwnerId()` 2갈래 분리 (API용 / 페이지용) |
| `src/app/(app)/layout.tsx` | 수정 | 페이지용 헬퍼로 교체 |
| `src/app/(app)/page.tsx` | 수정 | 페이지용 헬퍼로 교체 |
| `src/app/(app)/sessions/new/page.tsx` | 수정 | 페이지용 헬퍼로 교체 |
| `scripts/run-l1.mjs` | 수정 | 왕복시간 계측 + 9번 케이스 추가 |
| API 라우트 5종 | **무변경** | `requireOwnerId()` 호출부 그대로. 이름이 바뀌면 그만큼만 반영 |
| DB 스키마 · 마이그레이션 | **무변경** | 이번 사이클은 코드만으로 닫힌다 |
| 환경변수 | **무변경** | `L1_TARGET_URL` / `L1_VERCEL_BYPASS`는 기존 지원. 값만 Preview로 |

### 6.2 기존 소비자

| 소비자 | 영향 | 유의점 |
| --- | --- | --- |
| `(app)` 3개 페이지 | 직접 | 리다이렉트 책임이 미들웨어에서 이쪽으로 넘어온다. **하나라도 빠뜨리면 그 화면만 500이 된다** |
| API 라우트 5종 | 간접 | 무인증 응답이 404 → 401로 바뀐다. 프런트엔드는 이 경로를 무인증으로 호출하지 않아 실사용 영향 없음 |
| `GET /api/sessions/current` | 간접 | 미사용 상태로 유지 중이나 "이후" MCP 서버화의 첫 소비자 예정(백로그 `32fa1c76`). **401 계약이 여기서 굳는다** |
| M2 (백로그 `27178302`) | **수혜** | M2가 추가할 화면·API는 처음부터 리소스 기반 경계 위에 올라간다. 이번에 옮기지 않으면 M2 뒤 대상이 두 배 |
| first-take Design §7 | 문서 | "middleware 기반 라우트 보호" 결정이 이번에 뒤집힌다. Design에서 결정 기록으로 명시 |

### 6.3 검증

- [ ] `requireOwnerId()` 계열 호출 지점 전수 목록과 실제 코드가 일치 (누락 0건)
- [ ] 무인증으로 `(app)` 3개 경로 각각 접근 시 전부 sign-in 리다이렉트 (500 없음)
- [ ] L1 #2~8이 변경 전후 동일 (회귀 0)
- [ ] `pdcaw` 업로드 대상에 본 사이클 문서 4종이 포함됨

---

## 7. Architecture Considerations

### 7.1 프로젝트 레벨

first-take와 동일 — **Dynamic**. 레벨 변경 없음.

### 7.2 주요 아키텍처 결정

| # | 결정 | 선택 | 근거 |
| --- | --- | --- | --- |
| **D-A** | 미들웨어 파일 처리 | **`clerkMiddleware()` 껍데기 유지** (파일 삭제 아님) | Clerk `auth()`는 미들웨어가 요청을 거쳐야 컨텍스트를 얻는다. 파일을 지우면 전 라우트의 `auth()`가 죽는다. 지우는 것은 `createRouteMatcher`와 `auth.protect()`뿐 |
| **D-B** | 인증 헬퍼 형태 | **API용 / 페이지용 2갈래 분리** | Next.js `redirect()`는 예외 throw 방식이라 `mapError`의 `try/catch`에 삼켜진다. 한 함수 겸용은 R1을 부른다. 전송 계층별로 실패 표현이 다르다는 사실을 타입으로 드러낸다 |
| **D-C** | 헬퍼 위치 | `src/presentation/` 유지 | first-take Design §7 "인증은 domain 관심사가 아니다" 결정을 승계. 페이지용 헬퍼도 presentation 계층 |
| **D-D** | 무인증 API 응답 | **401 + `UNAUTHORIZED`** (기존 계약 유지) | Design §4.3 계약을 바꾸는 게 아니라 **계약대로 돌려놓는** 작업이다 |
| **D-E** | 미들웨어 `matcher` config | **현행 유지** | `auth()` 지원을 위해 계속 전 라우트에 걸려야 한다. 좁히면 R2가 커진다 |
| **D-F** | NFR 계측 지점 | **L1 스크립트 클라이언트 측 왕복시간** | 네트워크·콜드스타트를 포함한 사용자 체감에 가장 가깝다. Vercel 함수 실행시간은 서버 순수 시간이라 체감과 다르다 |
| **D-G** | 콜드 상태 정의 | **재배포 직후 첫 요청 = 콜드, 연속 2회차 = 워밍** | 추가 도구 없이 두 수치를 분리할 수 있는 가장 싼 방법 |

### 7.3 경계 이동 그림

```
[변경 전]                          [변경 후]
요청                                요청
 └─ middleware                       └─ middleware
     ├ createRouteMatcher (제거예정)      └ clerkMiddleware() 껍데기만
     └ auth.protect() ──▶ 차단/리다이렉트      (auth() 컨텍스트 제공)
 └─ 라우트/페이지                     └─ 라우트/페이지
     └ requireOwnerId() (이중방어)         ├ API   : requireOwnerId()      → throw → 401
                                          └ 페이지 : requireOwnerIdOrRedirect() → sign-in
```

이중 방어가 단일 방어로 줄지만, 그 단일 지점은 **보호 대상 리소스에 가장 가까운 곳**이다.
Clerk가 deprecation 문구에서 지적한 "경로 매칭이 실제 라우팅과 어긋나는" 위험이 구조적으로 사라진다.

---

## 8. Convention Prerequisites

### 8.1 기존 컨벤션 현황

- [x] `docs/RULE.md` — 문서 규약 (본 사이클도 `plan`/`design`/`analysis`/`report` 4종만)
- [x] `CONTRIBUTING.md` — 브랜치·커밋 규약
- [x] ESLint / tsconfig — first-take에서 구축 완료
- [x] Design Ref 주석 컨벤션 — `// Design Ref: §N — 사유`

### 8.2 정의할 컨벤션

| 범주 | 현황 | 정의할 내용 | 우선순위 |
| --- | --- | --- | :-: |
| 인증 헬퍼 네이밍 | `requireOwnerId()` 단일 | API용/페이지용 2갈래의 이름을 Design에서 확정. **호출부에서 어느 쪽인지 이름만 보고 알 수 있어야 한다** | High |
| L1 결과 출력 형식 | 통과/실패만 | ms 컬럼 추가 형식 확정. 콜드/워밍 회차 구분 표기 | Medium |
| 결정 뒤집기 기록 | 없음 | first-take Design §7을 뒤집으므로 ARCHITECT §8 결정 기록에 행 추가 여부를 Design에서 판단 | Medium |

### 8.3 필요한 환경변수

**신규 없음.** 기존 변수만 사용하며 값만 달라진다.

| 변수 | 용도 | 이번 사이클 |
| --- | --- | --- |
| `L1_TARGET_URL` | L1 대상 | develop **Preview URL**로 지정 |
| `L1_VERCEL_BYPASS` | Preview Deployment Protection 우회 | Preview 검증에 필요 |
| `CLERK_SECRET_KEY` · `NEXT_PUBLIC_CLERK_DOMAIN` · `DATABASE_URL` | 기존 | 변경 없음 |

---

## 9. Next Steps

1. [ ] `refine-auth-boundary.design.md` 작성 — 특히 **R1(페이지 리다이렉트 이관)**, 헬퍼 2갈래의 시그니처, `requireOwnerId()` 호출 지점 전수 목록, L1 #9 판정 조건 확정
2. [ ] Do — 미들웨어 축소를 **가장 먼저** 배포해 ★ⓐ(401 실측)를 조기에 확인 (R3)
3. [ ] Do — 헬퍼 분리 → 페이지 3곳 이관 → L1 계측/9번 케이스
4. [ ] Preview에서 `npm run l1` 콜드·워밍 2벌 실행, 9/9 + 수치 확보
5. [ ] `refine-auth-boundary.analysis.md` — Gap 분석 + NFR 확정 기준 기록
6. [ ] `refine-auth-boundary.report.md` 및 사이클 종료 절차 (RULE.md §종료절차, 태그 **v1.0.1** 예정)
7. [ ] 백로그 3건(`391c54d6` · `c37bd457` · `25c9f2bb`) 상태 갱신 — `backlog-sync`

---

## Version History

| 버전 | 날짜 | 변경 | 작성자 |
| --- | --- | --- | --- |
| 0.1 | 2026-08-23 | 최초 작성. 백로그 3건(`391c54d6`·`c37bd457`·`25c9f2bb`)을 refine-auth-boundary 사이클로 확정. Checkpoint 1·2에서 확정된 사용자 결정 반영 — NFR 초과 시 기준 재조정 / 3탭은 수동 카운트 / L1 왕복시간 계측 / Preview 검증 후 병합 / 무인증 페이지 접근을 L1 #9로 추가 | Claude |
