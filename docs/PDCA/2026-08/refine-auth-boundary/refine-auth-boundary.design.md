# refine-auth-boundary 설계서

> **요약**: 인증 경계를 Clerk 미들웨어 경로매칭에서 리소스 기반 체크로 옮긴다. "현재 사용자가 누구인가"는 Application 포트로 추상화하고(Clerk 어댑터 주입), API 가드와 페이지 가드를 전송 계층별로 분리한다. 같은 사이클에서 L1 스크립트에 왕복시간 계측과 무인증 페이지 케이스(#9)를 붙여 NFR을 처음 실측한다.
>
> **프로젝트**: sing-diary
> **버전**: v1.0.1 (예정)
> **사이클**: refine-auth-boundary
> **작성일**: 2026-08-23
> **상태**: Draft
> **계획서**: [refine-auth-boundary.plan.md](./refine-auth-boundary.plan.md)

---

## Context Anchor

> Plan에서 복사. Design→Do 인계 시 전략 맥락 보존.

| Key | Value |
| --- | --- |
| **WHY** | Clerk가 `createRouteMatcher`를 다음 메이저에서 제거한다. 마이그레이션 대상이 M2에서 두 배로 불어나기 전에 경계를 옮긴다. |
| **WHO** | sing-diary 사용자 본인(1인). 화면상 변화는 없고, 수혜자는 M2를 짓는 후속 사이클이다. |
| **RISK** | 미들웨어의 `auth.protect()`를 걷어내면 `(app)` RSC에서 `requireOwnerId()`가 던지는 `UnauthorizedError`가 리다이렉트가 아닌 500으로 노출된다 — 지금은 미들웨어가 앞에서 막아줘서 드러나지 않았을 뿐이다. |
| **SUCCESS** | `npm run l1` 9/9 통과(무인증 API 401 + 무인증 페이지 리다이렉트 포함), Clerk deprecation 경고 소멸, NFR 2종 수치가 문서에 남는다. |
| **SCOPE** | 미들웨어 축소 → `requireOwnerId()` 2갈래 분리 → 페이지 리다이렉트 이관 → L1 계측 추가/9번 케이스 추가 → Preview 실측 |

---

## 1. Overview

### 1.1 설계 목표

1. **보호 책임을 리소스 옆으로.** 라우트 핸들러와 RSC 페이지가 각자 자기 입구에서 인증을 확인한다. 미들웨어는 `auth()` 컨텍스트를 공급하는 껍데기만 남는다.
2. **"현재 사용자" 조회를 전송 계층에서 분리.** `CurrentUserProvider` 포트(Application)와 Clerk 어댑터(Infrastructure)로 나눠, 뒤에 올 MCP 서버화(백로그 `32fa1c76`)에서 어댑터만 바꿔 끼우면 되게 한다.
3. **실패 표현을 전송 계층별로 고정.** API는 `401 UNAUTHORIZED` JSON, 브라우저 문서 요청은 sign-in 리다이렉트(원래 경로 복귀 포함). 두 동작을 한 함수에 섞지 않는다.
4. **측정을 코드로.** L1 스크립트가 케이스별 왕복시간을 찍고, 무인증 페이지 접근(#9)까지 검증한다.

### 1.2 설계 원칙

- **first-take의 4계층·DI 규약을 그대로 승계한다.** 포트는 `application/ports/`, 구현은 `infrastructure/`, 조립은 `presentation/container.ts` 단 한 곳.
- **전송 계층이 다르면 가드도 다르다.** API 가드는 예외를 던지고(error-mapper가 401로), 페이지 가드는 리다이렉트한다. Next.js `redirect()`는 예외 throw 방식이라 `try/catch` 매핑 경로와 섞으면 삼켜진다(Plan R1).
- **L1 스크립트의 정리(cleanup) 블록은 손대지 않는다.** 계측은 `req()`·`record()`에만 넣는다(Plan R6).
- **변경하지 않는 것을 명시한다.** DB 스키마, 유스케이스 6종, 리포지토리, API 계약(성공 경로)은 이번 사이클에서 한 줄도 바뀌지 않는다.

### 1.3 근거 확인 (Plan ★ 불확실 지점의 해소)

Design 단계에서 실제 설치본(`@clerk/nextjs` 7.8.0, `@clerk/backend` 3.16.10)을 읽어 확인한 사실:

| # | Plan 항목 | 확인 결과 | 근거 |
| --- | --- | --- | --- |
| ★ⓐ | 미들웨어를 걷어내면 401이 나오는가 | **코드상 확정에 가깝다 — Do 초반 실측으로 마무리.** 404의 진짜 원인은 handshake rewrite가 아니라 **`auth.protect()` 자체**다. 타입 문서: *"For non-document requests, such as API requests, `auth.protect()` returns a 404 error to users who aren't authenticated."* handshake는 `isRequestEligibleForHandshake()`가 GET + (`Sec-Fetch-Dest: document/iframe` 또는 `Accept: text/html`)일 때만 건다 — Node `fetch`(Accept `*/*`)는 대상이 아니어서 `signedOut`으로 떨어진 뒤 `protect()`가 404를 냈던 것. `protect()`를 빼면 요청이 핸들러까지 도달하고 `mapError`가 401을 낸다 | `@clerk/nextjs/dist/types/app-router/server/auth.d.ts`, `@clerk/backend/dist/chunk-*.mjs` `isRequestEligibleForHandshake()` / `handleMaybeHandshakeStatus()` |
| ★ⓒ | Clerk 가이드가 App Router RSC 리다이렉트를 커버하는가 | **커버한다.** `auth()`는 `redirectToSignIn(returnBackUrl?)`·`redirectToSignUp()`을 반환하며 타입상 `RedirectFun<ReturnType<typeof redirect>>` — 내부적으로 `next/navigation`의 `redirect()`를 쓴다. 단 *"server-side can only access redirect URLs defined via environment variables"* — `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`이 Vercel Preview/Production 양쪽에 이미 설정돼 있음을 `vercel env ls`로 확인 | 같은 `auth.d.ts`, Vercel env 목록 |
| R8 | Preview와 프로덕션이 같은 Clerk·Neon을 쓰는가 | **같다.** `DATABASE_URL`·`CLERK_SECRET_KEY`·`NEXT_PUBLIC_CLERK_*` 전부 `Preview, Production` 동일 스코프 | `vercel env ls` |
| — | `clerkMiddleware()`를 핸들러 없이 호출할 수 있는가 | **있다.** 오버로드 `(options?: ClerkMiddlewareOptions): NextMiddleware` 존재. 내부도 `handler == null ? void 0 : handler(...)`로 null-safe | `clerkMiddleware.d.ts`, `dist/esm/server/clerkMiddleware.js` |
| — | `requireOwnerId()` 호출 지점 전수 | **페이지 3곳 + 라우트 파일 5개(핸들러 7개).** §6.3 표 참조 | `grep -rn requireOwnerId src` |

> ★ⓑ(pg 전환 후 콜드스타트)는 코드로 알 수 없다. §8.5 절차로 실측한다.

---

## 2. Architecture Options

### 2.0 설계안 비교 (Checkpoint 3 완료)

| 기준 | A안: 최소 변경 | **B안: 포트/어댑터** | C안: 파일 재배치 |
| --- | :-: | :-: | :-: |
| 접근 | `presentation/api/auth.ts`에 페이지용 가드 1개 추가 | Application 포트 + Infrastructure Clerk 어댑터 + Presentation 가드 2개 | `presentation/auth.ts`로 이동, 가드 2개 export |
| 신규 파일 | 0 | **4** (+테스트 1) | 1 (삭제 1) |
| 수정 파일 | 6 | **11** (+삭제 1) | 11 |
| 복잡도 | 낮음 | 중간 | 낮음 |
| 유지보수성 | 중간 | **높음** — 인증원 교체가 어댑터 1개 | 중간 |
| 공수 | 낮음 | 중간 | 낮음 |
| 리스크 | 낮음 | 낮음 | 낮음 |

**선택**: **B안 — 포트/어댑터** (사용자 결정, Checkpoint 3). 페이지용 가드 이름은 **`requireOwnerIdOrRedirect()`** (사용자 결정).
**근거**: first-take에서 B안(클린 아키텍처)을 고른 전제 — "MCP 서버화 시 도메인/유스케이스 계층은 손댈 필요가 없어야 한다"(백로그 `32fa1c76`) — 를 인증에도 적용한다. MCP 핸들러는 브라우저 세션이 아닌 다른 인증원(API 키 등)으로 `ownerId`를 얻게 될 텐데, 그때 `CurrentUserProvider` 어댑터 하나만 추가하면 API 가드·유스케이스는 그대로다. 공수 증가(신규 4, 수정 11)는 수용한다.

> **B안의 정직한 경계선**: 포트가 추상화하는 것은 *"현재 사용자가 누구인가"* 다. *"미인증 브라우저를 sign-in으로 보내고 원래 경로로 되돌린다"* 는 Next.js + Clerk에 본질적으로 묶인 **브라우저 전송 고유 동작**이라 포트 뒤로 밀지 않는다 — 페이지 가드는 Clerk `auth().redirectToSignIn()`을 직접 쓴다(Presentation은 이미 `<SignIn/>`·`<UserButton/>`·`ClerkProvider`로 Clerk를 알고 있다). 포트의 소비자는 **비브라우저 전송**(지금은 API 라우트, 나중엔 MCP)이다. 이 선을 §2.3 D-B에 결정으로 남긴다.

### 2.1 컴포넌트 다이어그램

```
요청 ─▶ middleware.ts : clerkMiddleware()            ← 껍데기. auth() 컨텍스트만 공급. 보호 안 함
          │
          ├─ /api/* ──▶ Route Handler ──▶ requireOwnerId()  ──▶ CurrentUserProvider.currentUserId()
          │                 │                 (api-guard)              ▲ 포트 (Application)
          │                 │  null ──▶ throw UnauthorizedError        │
          │                 └─ catch ──▶ mapError ──▶ 401 UNAUTHORIZED │
          │                                                            │ 구현 주입 (container.ts)
          └─ /(app)/* ──▶ RSC layout/page ──▶ requireOwnerIdOrRedirect()   ClerkCurrentUser (Infrastructure)
                                              (page-guard)                      └─ auth().userId
                                null ──▶ auth().redirectToSignIn()  ──▶ 307 → /sign-in?redirect_url=…
```

계층 배치:

```
┌──────────── Presentation ────────────┐
│ auth/api-guard.ts   (factory, 포트 소비)│  auth/page-guard.ts (Clerk 직접 — 브라우저 전송 고유)
│ api/error-mapper.ts (UnauthorizedError→401)│  container.ts (ClerkCurrentUser 조립·requireOwnerId 바인딩)
└──────────────┬───────────────────────┘
               │ 포트 타입만
┌──────────────▼──── Application ──────┐
│ ports/current-user.ts : CurrentUserProvider { currentUserId(): Promise<string|null> }
└──────────────▲───────────────────────┘
               │ 구현
┌──────────────┴──── Infrastructure ───┐
│ auth/clerk-current-user.ts : createClerkCurrentUser() — @clerk/nextjs/server auth()
└──────────────────────────────────────┘
```

### 2.2 데이터 흐름

**(a) 무인증 API 요청** — `GET /api/sessions/current`, 토큰 없음

```
fetch(Accept */*) → middleware: signedOut (handshake 비대상) → NextResponse.next()
→ route GET → requireOwnerId() → provider.currentUserId() = null → throw UnauthorizedError
→ catch → mapError → 401 { error: { code: "UNAUTHORIZED", message: "authentication required" } }
```

**(b) 무인증 문서 요청** — `GET /sessions/new`, 브라우저

```
브라우저 → middleware: signedOut → next() → RSC: (app)/layout + page 병렬 렌더
→ 각자 requireOwnerIdOrRedirect() → auth().userId = null → redirectToSignIn()
→ NEXT_REDIRECT → 307 Location: /sign-in?redirect_url=https://…/sessions/new
→ <SignIn/> 완료 → redirect_url로 복귀 (FR-05)
```

> layout과 page가 **둘 다** 가드한다. 둘 중 누가 먼저 throw하든 `redirectToSignIn()`은 실제 요청 URL로 `redirect_url`을 만들기 때문에 결과가 같다(명시 `returnTo` 인자 방식을 쓰지 않는 이유). layout 가드는 M2가 추가할 페이지가 가드를 빠뜨려도 리다이렉트되게 하는 **이중 방어**다.

**(c) 인증 요청** — 변경 전과 동일. `requireOwnerId()`가 `ownerId`를 돌려주고 유스케이스로 간다.

### 2.3 의존성 · 결정 기록

| # | 결정 | 선택 | 근거 |
| --- | --- | --- | --- |
| **D-A** | 미들웨어 파일 | **`clerkMiddleware()` 껍데기 유지**, `config.matcher` 현행 유지 | `auth()`는 "Requires `clerkMiddleware()` to be configured". 지우는 것은 `createRouteMatcher`·`isPublicRoute`·`auth.protect()`만. matcher를 좁히면 `auth()`가 안 도는 경로가 생긴다 |
| **D-B** | 포트 경계 | **`CurrentUserProvider.currentUserId()` 하나.** 리다이렉트는 포트 밖(페이지 가드가 Clerk 직접) | §2.0 "정직한 경계선". 포트는 비브라우저 전송(API·MCP)용 |
| **D-C** | 가드 분리 | `requireOwnerId()` (API, throw) / `requireOwnerIdOrRedirect()` (페이지, redirect) | Plan R1·D-B. `redirect()`는 throw 방식 — `try/catch` 경로와 섞으면 삼켜진다 |
| **D-D** | API 가드 주입 | **factory `createApiGuard(provider)`**, `container.ts`가 바인딩해 `requireOwnerId` export | 가짜 provider로 단위 테스트 가능(§8.3). 라우트는 이미 `useCases`를 container에서 import하므로 같은 줄에서 `requireOwnerId`도 가져온다 — 일관 |
| **D-E** | 페이지 가드 주입 | **주입 없음**, 일반 함수 | Clerk+Next 고유 동작. 검증은 L1 #9 + 브라우저 수동(§8.4) |
| **D-F** | `UnauthorizedError` 위치 | `presentation/auth/api-guard.ts` | first-take 결정 "인증은 domain 관심사가 아니다" 승계. `domain/errors.ts`에 넣지 않는다 |
| **D-G** | 무인증 API 응답 | **401 + `UNAUTHORIZED`** (first-take Design §4.3 그대로) | 계약을 바꾸는 게 아니라 계약대로 돌려놓는다 |
| **D-H** | NFR 계측 지점 | L1 스크립트 **클라이언트 측 왕복시간**(응답 헤더 수신까지) | 콜드스타트·네트워크 포함 체감에 가장 가깝다. Vercel 함수 시간은 보조 참고 |
| **D-I** | 콜드/워밍 정의 | **Preview 배포 Ready 직후 1회차 = 콜드, 곧바로 2회차 = 워밍** | 추가 도구 없이 분리 가능(Plan D-G) |
| **D-J** | 검증 환경 | **develop Preview** (`L1_TARGET_URL` + `L1_VERCEL_BYPASS`) | R8 확인 — 같은 Clerk·Neon. 프로덕션 선반영 금지 |
| **D-K** | ARCHITECT.md | **수정 없음** | ARCHITECT §1은 "인증: Clerk"만 명시하고 미들웨어 방식은 first-take Design §7의 결정이었다. 그 결정이 본 문서로 대체됨을 §7에 기록. 닫힌 사이클(first-take) 문서는 고치지 않는다 |

외부 의존성 변화: **없음**. `@clerk/nextjs` 7.8.0 그대로, 패키지 추가 없음.

---

## 3. Data Model

### 3.1 DB 스키마

**변경 없음.** 마이그레이션 없음.

### 3.2 포트 정의 (`src/application/ports/current-user.ts`)

```ts
// Design Ref: refine-auth-boundary §2.3 D-B — "현재 사용자가 누구인가"만 추상화한다.
// 리다이렉트 같은 전송 고유 실패 처리는 이 포트의 관심사가 아니다.
export interface CurrentUserProvider {
  /** 현재 요청의 인증 사용자 id. 미인증이면 null. */
  currentUserId(): Promise<string | null>;
}
```

Application ESLint 규칙(`@clerk/*`·`next/*` 금지)을 위반하지 않는다 — 순수 인터페이스.

### 3.3 어댑터 (`src/infrastructure/auth/clerk-current-user.ts`)

```ts
// Design Ref: refine-auth-boundary §2.1 — CurrentUserProvider의 Clerk 구현. 미들웨어 껍데기(D-A)가 공급하는 auth() 컨텍스트를 읽는다.
import { auth } from "@clerk/nextjs/server";
import type { CurrentUserProvider } from "@/application/ports/current-user";

export function createClerkCurrentUser(): CurrentUserProvider {
  return {
    async currentUserId() {
      const { userId } = await auth();
      return userId ?? null;
    },
  };
}
```

Infrastructure ESLint 규칙은 `@/presentation/*`·`next/*`만 금지 — `@clerk/nextjs/server`는 허용된다(drizzle·pg처럼 외부 라이브러리 어댑터).

---

## 4. API Specification

### 4.1 엔드포인트 목록

**신규·변경 엔드포인트 없음.** 기존 6개(`GET /api/sessions/current`, `POST /api/sessions`, `POST /api/sessions/:id/entries`, `PUT /api/sessions/:id/entries/order`, `PATCH /api/entries/:id`, `DELETE /api/entries/:id`) 전부 **성공 경로 무변경**.

### 4.2 바뀌는 것 — 무인증 응답

| 요청 | 변경 전 (실측) | 변경 후 |
| --- | :-: | :-: |
| 토큰 없는 `/api/*` 요청 (전 메서드) | `404` (Clerk `auth.protect()` 비문서 요청 규칙) | **`401`** |

응답 본문 (first-take Design §4.3 계약과 동일):

```json
{ "error": { "code": "UNAUTHORIZED", "message": "authentication required" } }
```

`details`는 `undefined`라 직렬화에서 빠진다 — 현행 `mapError` 동작 그대로.

### 4.3 페이지 응답 — 무인증 문서 요청

| 요청 | 변경 전 | 변경 후 |
| --- | --- | --- |
| `GET /`, `GET /sessions/new` (세션 없음) | 미들웨어 `auth.protect()`가 sign-in 리다이렉트 | **RSC 가드**가 `307 Location: /sign-in?redirect_url=<원래 URL>` |
| `GET /sign-in`, `GET /sign-up` | 공개 | 공개 (가드 없음, 변경 없음) |

---

## 5. UI/UX Design

### 5.1 화면 변경

**없음.** 컴포넌트·토큰·레이아웃 무변경.

### 5.2 사용자 흐름 (인증 관점만)

```
[미인증] 어떤 (app) 경로 → /sign-in?redirect_url=… → 로그인 → 원래 경로
[인증]   변경 없음
```

### 5.3 컴포넌트 목록

변경 없음.

### 5.4 Page UI Checklist

UI 변경이 없으므로 신규 체크 항목 없음. Gap 분석은 §8의 L1 9케이스와 §6.3 호출 지점 전수표로 기능 깊이를 본다.

---

## 6. Error Handling

### 6.1 에러 매핑 (변경 범위)

| 상황 | 전송 | 처리 지점 | 결과 |
| --- | --- | --- | --- |
| 미인증 | API | `api-guard` throw → `error-mapper` | `401 UNAUTHORIZED` |
| 미인증 | 페이지(RSC) | `page-guard` → `redirectToSignIn()` | `307 → /sign-in?redirect_url=…` |
| 그 외 전부 | — | 변경 없음 | 변경 없음 |

`error-mapper.ts`는 `UnauthorizedError`의 **import 경로만** 바뀐다(`./auth` → `@/presentation/auth/api-guard`). 매핑 로직 무변경.

### 6.2 `UnauthorizedError`가 페이지에서 새어 나오지 않는 보장

페이지 3곳은 전부 `requireOwnerIdOrRedirect()`로 교체되므로 RSC 경로에서 `UnauthorizedError`가 발생할 지점이 사라진다. 컴파일 타임 보장을 위해 **`presentation/api/auth.ts`를 삭제**한다 — 옛 import가 남아 있으면 `tsc`가 잡는다.

### 6.3 호출 지점 전수 (Plan R2 — 누락 0건 확인용)

| 파일 | 현행 | 변경 후 | 가드 |
| --- | --- | --- | --- |
| `src/app/(app)/layout.tsx` | `requireOwnerId()` ← `@/presentation/api/auth` | `requireOwnerIdOrRedirect()` ← `@/presentation/auth/page-guard` | 페이지 |
| `src/app/(app)/page.tsx` | 〃 | 〃 | 페이지 |
| `src/app/(app)/sessions/new/page.tsx` | 〃 | 〃 | 페이지 |
| `src/app/api/sessions/route.ts` (POST) | `requireOwnerId()` ← `@/presentation/api/auth` | `requireOwnerId` ← `@/presentation/container` | API |
| `src/app/api/sessions/current/route.ts` (GET) | 〃 | 〃 | API |
| `src/app/api/sessions/[id]/entries/route.ts` (POST) | 〃 | 〃 | API |
| `src/app/api/sessions/[id]/entries/order/route.ts` (PUT) | 〃 | 〃 | API |
| `src/app/api/entries/[id]/route.ts` (PATCH·DELETE) | 〃 ×2 | 〃 ×2 | API |
| `src/presentation/api/error-mapper.ts` | `UnauthorizedError` ← `./auth` | ← `@/presentation/auth/api-guard` | — |

검증 명령: `grep -rn "presentation/api/auth\|createRouteMatcher\|auth.protect" src/` → **0건**.

---

## 7. Security Considerations

- [x] **owner 스코프**: 변경 없음 — 유스케이스·리포지토리 `ownerId` 필수 인자 그대로
- [x] **인증 — 리소스 기반으로 이관**: API는 라우트 핸들러 첫 줄 `requireOwnerId()` → 401, 페이지는 RSC 첫 줄 `requireOwnerIdOrRedirect()` → sign-in. **first-take Design §7 "clerkMiddleware로 `/` 이하 전체 보호"는 본 항목으로 대체된다**
- [x] **미들웨어 껍데기 유지**: `clerkMiddleware()` + 전 라우트 matcher — `auth()` 컨텍스트 공급용. 보호는 하지 않는다
- [x] **이중 방어(페이지)**: `(app)/layout.tsx`도 가드 — M2가 페이지를 추가하며 가드를 빠뜨려도 layout이 리다이렉트한다. 단 **API 라우트는 이중 방어가 없다** — M2가 라우트를 추가할 때 첫 줄 `requireOwnerId()`는 필수. §10.4 컨벤션으로 명문화
- [x] **존재 노출 방지**: 타인 리소스 404 — 변경 없음
- [x] **Deprecation 제거**: `createRouteMatcher` import 0건 → 경고 소멸
- [ ] Rate Limiting: first-take와 동일하게 제외(1인 사용)

---

## 8. Test Plan

### 8.1 테스트 범위

| 유형 | 대상 | 도구 | 단계 |
| --- | --- | --- | --- |
| UNIT | `createApiGuard` — null→throw / id→반환 | Vitest (DB 불필요) | Do (module-1) |
| 기존 스위트 | INV·UC 테스트 회귀 | `npm test` | Do |
| L1 | API 8 + 페이지 1 = **9케이스**, 왕복시간 | `npm run l1` (Preview) | Do (module-2) → Check |
| 수동 | dev 경고 소멸, 브라우저 리다이렉트·복귀, 3탭 카운트 | 눈·손 | Do → Check |
| L2/L3 | — | Playwright 미도입(Plan 2.2) | 제외 |

### 8.2 L1: API·페이지 테스트 시나리오 (`scripts/run-l1.mjs`)

| # | 요청 | 기대 상태 | 기대 응답 | 비고 |
| :-: | --- | :-: | --- | --- |
| 1 | `GET /api/sessions/current` 미인증 | **401** | `.error.code === "UNAUTHORIZED"` | 기존 케이스. 404→401 복구. **판정식에 code 검사 추가** |
| 2 | `POST /api/sessions` brand=XX | 400 | `.error.details.fieldErrors` | 기존 |
| 3 | `POST /api/sessions` 정상 | 201 | `.data.id` | 기존 |
| 4 | `POST /api/sessions/:id/entries` number='' | 400 | — | 기존 |
| 5 | `POST /api/sessions/:id/entries` 정상 | 201 | `.data.position` number | 기존. **NFR "곡 추가" 대상 케이스** |
| 6 | `PATCH /api/entries/:id` score=101 | 400 | — | 기존 |
| 7 | `PUT …/entries/order` 불일치 집합 | 400 | `INVALID_POSITION_SET` | 기존 |
| 8 | `DELETE /api/entries/:id` | 200 | — | 기존 |
| **9** | `GET /` 미인증, `redirect: "manual"` | **3xx** (302/303/307/308) | `Location` 헤더가 `/sign-in` 포함 | **신규.** Node fetch는 `Accept: */*`라 handshake 비대상 → RSC 가드가 응답 |

**#9 판정 상세**: `const loc = res.headers.get("location") ?? ""; pass = [302,303,307,308].includes(res.status) && loc.includes("/sign-in")`. `redirect_url` 파라미터 존재는 로그로 찍되 판정엔 넣지 않는다(Clerk 버전에 따라 인코딩이 달라질 수 있음). 만약 Location이 Clerk FAPI handshake(`/v1/client/handshake`)로 가면 요청 헤더가 문서 요청으로 오인된 것이니 `Sec-Fetch-Dest` 미설정·`Accept: */*`인지 확인한다.

**계측 스펙 (D-H)**:

- `req()`: `performance.now()`로 `fetch` await 전후를 재어 **응답 헤더 수신까지 ms**를 `res.elapsedMs`로 스탬프한다(Response 객체는 확장 가능). 8개 기존 호출부는 손대지 않는다.
- `record()`: `res.elapsedMs`를 결과에 저장하고 출력 라인 끝에 `(123ms)`를 붙인다.
- 헤더: `L1_RUN_LABEL`(선택, 예: `cold`/`warm`)을 대상 URL 옆에 출력해 회차를 로그에서 구분한다.
- 요약: 통과/실패 요약 뒤에 `#  desc  status  ms` 표를 출력한다. **ms는 판정에 쓰지 않는다** — NFR 기준은 Analysis에서 실측 근거로 확정한다(Plan §3.2).
- **`finally`(정리) 블록은 한 글자도 바꾸지 않는다** (Plan R6).

### 8.3 UNIT: API 가드 (`tests/auth-guard.test.ts`)

| # | 입력 | 기대 |
| :-: | --- | --- |
| AG-1 | `createApiGuard({ currentUserId: async () => null }).requireOwnerId()` | `UnauthorizedError` throw, `name === "UnauthorizedError"` |
| AG-2 | `createApiGuard({ currentUserId: async () => "user_x" }).requireOwnerId()` | `"user_x"` 반환 |

DB·Clerk 불필요. `activateTestDatabase()`를 호출하지 않는다.

### 8.4 수동 확인 (Analysis에 결과 기록)

| # | 확인 | 방법 | 통과 기준 |
| :-: | --- | --- | --- |
| M-1 | Clerk DEPRECATION WARNING 소멸 | `npm run dev` 기동 로그 (로컬 — Lightsail에서 dev 불가 시 Vercel 빌드 로그로 대체) | `createRouteMatcher` 경고 0건 |
| M-2 | 브라우저 미인증 `/sessions/new` → sign-in → 로그인 → `/sessions/new` 복귀 | 시크릿 창, Preview | 복귀 경로 일치 (FR-05) |
| M-3 | 브라우저 미인증 `/` → sign-in | 〃 | 500 없음 |
| M-4 | 인증 상태 전 구간 (세션 생성→곡 추가→점수→순서변경) | 〃 | 변경 전과 동일 |
| M-5 | **곡 추가 탭 카운트** | §8.6 규칙으로 실기기 | 수치 기록 |

### 8.5 NFR 실측 절차 — 응답성 (Plan ★ⓑ)

```
1. module-2 커밋을 develop에 푸시 → Vercel Preview 빌드 Ready 대기
2. [콜드] 즉시: L1_RUN_LABEL=cold L1_TARGET_URL=<preview> L1_VERCEL_BYPASS=… npm run l1
3. [워밍] 2분 이내 재실행: L1_RUN_LABEL=warm … npm run l1
4. 두 회차의 #1·#3·#5·#9 ms와 전 케이스 최대값을 Analysis 표로 기록
5. 보조: Vercel 대시보드 함수 로그의 Duration을 같은 시각대로 대조 (콜드 비중 분리)
```

- **NFR 대상 수치는 #5(`POST …/entries` 정상 = 곡 추가)**. 기준 "콜드스타트 포함 2초" 판정은 콜드 회차 #5.
- 2초 초과 시: Plan §3.2 규칙대로 **근거 없는 완화 금지** — 콜드/워밍 수치를 나란히 놓고 문구를 재조정한다("워밍 X초 / 콜드 Y초" 형태).
- 각 회차는 Clerk 테스트 유저 생성·삭제 1회씩을 동반한다 — 2회차로 제한(Plan 콜드 측정 결정).

### 8.6 NFR 실측 절차 — 곡 추가 3탭

**탭 집계 규칙** (첫 실측이므로 규칙을 문서에 고정한다):

| 조작 | 집계 |
| --- | :-: |
| 입력창 포커스 탭 | 1 |
| 숫자 입력 (자릿수 무관, 키보드 타이핑 전체) | 1 |
| "추가" 버튼 탭 또는 키보드 엔터 | 1 |
| 화면 스크롤·대기 | 0 |

현행 구현(`AddByNumber.tsx`)은 하단 고정 바 + 제출 후 포커스 유지라, **첫 곡 = 3탭(포커스+입력+추가)**, **연속 곡 = 2탭(입력+추가)** 이 예상치다. 실기기(모바일)에서 세어 Analysis에 기록한다. UI 변경이 없으므로 **현행 프로덕션(v1.0.0)에서 재도 동일** — Preview를 기다릴 필요 없다.

### 8.7 시드 데이터

불필요. L1은 자체 테스트 유저를 만들고 정확히 scope해 지운다(현행 유지).

---

## 9. Clean Architecture

### 9.1 계층 구조

first-take §9.1 그대로. 본 사이클이 추가하는 배치:

| 컴포넌트 | 계층 | 위치 |
| --- | --- | --- |
| `CurrentUserProvider` (포트) | Application | `src/application/ports/current-user.ts` |
| `createClerkCurrentUser()` (어댑터) | Infrastructure | `src/infrastructure/auth/clerk-current-user.ts` |
| `createApiGuard()` · `UnauthorizedError` | Presentation | `src/presentation/auth/api-guard.ts` |
| `requireOwnerIdOrRedirect()` | Presentation | `src/presentation/auth/page-guard.ts` |
| 조립: `currentUser`, `requireOwnerId` export | Presentation (composition root) | `src/presentation/container.ts` |
| ~~`requireOwnerId`, `UnauthorizedError`~~ | — | ~~`src/presentation/api/auth.ts`~~ **삭제** |

### 9.2 의존 규칙 점검 (ESLint `no-restricted-imports` 기준)

| From | import | 허용 여부 |
| --- | --- | :-: |
| `application/ports/current-user.ts` | (없음) | ✅ |
| `infrastructure/auth/clerk-current-user.ts` | `@clerk/nextjs/server`, `@/application/ports/current-user` | ✅ (infra 금지 목록은 `@/presentation/*`·`next/*`) |
| `presentation/auth/api-guard.ts` | `@/application/ports/current-user` (type) | ✅ |
| `presentation/auth/page-guard.ts` | `@clerk/nextjs/server` | ✅ (presentation 금지 목록은 `@/infrastructure/*`뿐) |
| `presentation/container.ts` | `@/infrastructure/auth/clerk-current-user` | ✅ (container 예외) |
| `src/app/api/**/route.ts` | `@/presentation/container` | ✅ (현행과 동일 패턴) |
| `src/app/(app)/**` | `@/presentation/auth/page-guard` | ✅ |

ESLint 설정 변경 **없음**.

### 9.3 코드 스케치

**`src/presentation/auth/api-guard.ts`**
```ts
// Design Ref: refine-auth-boundary §2.3 D-C/D-D — API 전송용 가드. 실패는 throw → error-mapper가 401.
import type { CurrentUserProvider } from "@/application/ports/current-user";

export class UnauthorizedError extends Error {
  constructor() {
    super("authentication required");
    this.name = "UnauthorizedError";
  }
}

export function createApiGuard(provider: CurrentUserProvider) {
  return {
    async requireOwnerId(): Promise<string> {
      const userId = await provider.currentUserId();
      if (!userId) throw new UnauthorizedError();
      return userId;
    },
  };
}
```

**`src/presentation/auth/page-guard.ts`**
```ts
// Design Ref: refine-auth-boundary §2.3 D-B/D-E — 브라우저 문서 요청용 가드. 실패는 sign-in 리다이렉트(원래 URL 복귀).
// Clerk redirectToSignIn()은 next/navigation redirect()를 throw하므로 try/catch 경로(API)와 절대 섞지 않는다.
import { auth } from "@clerk/nextjs/server";

export async function requireOwnerIdOrRedirect(): Promise<string> {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn(); // never — 구조분해 바인딩은 TS 단언 내로잉이 안 되므로 return으로 타입을 맞춘다
  return userId;
}
```

**`src/presentation/container.ts`** (추가분)
```ts
import { createClerkCurrentUser } from "@/infrastructure/auth/clerk-current-user";
import { createApiGuard } from "@/presentation/auth/api-guard";

export const currentUser = createClerkCurrentUser();
export const { requireOwnerId } = createApiGuard(currentUser);
```

**`src/middleware.ts`** (전문)
```ts
import { clerkMiddleware } from "@clerk/nextjs/server";

// Design Ref: refine-auth-boundary §2.3 D-A — 보호는 리소스(라우트·페이지)가 한다.
// 미들웨어는 auth() 컨텍스트 공급용 껍데기. createRouteMatcher/auth.protect()는 쓰지 않는다.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

**라우트 import 변경 예** (`src/app/api/sessions/current/route.ts`)
```ts
import { requireOwnerId, useCases } from "@/presentation/container";
```

---

## 10. Coding Convention Reference

### 10.1 네이밍

| 대상 | 이름 | 규칙 |
| --- | --- | --- |
| 포트 | `CurrentUserProvider` | 역할 명사 + Provider (first-take `TransactionRunner`와 동일 결) |
| 어댑터 factory | `createClerkCurrentUser()` | `create` + 구현체 + 역할 (first-take `createDrizzleTxRunner()`와 동일) |
| API 가드 | `requireOwnerId()` | **현행 유지** — 라우트 5개 본문 무수정 |
| 페이지 가드 | `requireOwnerIdOrRedirect()` | 실패 동작(redirect)이 이름에 드러난다 (사용자 결정) |

### 10.2 Import 순서

first-take §10.2 그대로.

### 10.3 환경변수

신규 없음. `L1_RUN_LABEL`(선택, 스크립트 전용 — Vercel에 올리지 않음)만 추가.

### 10.4 본 기능 컨벤션

| 항목 | 적용 |
| --- | --- |
| **라우트 첫 줄 규칙** | 모든 `/api/*` 핸들러는 `try` 첫 줄에 `await requireOwnerId()` — 미들웨어 이중 방어가 사라졌으므로 **M2 이후 신규 라우트도 동일**. 코드리뷰 체크 항목 |
| **페이지 첫 줄 규칙** | `(app)` 하위 RSC 페이지는 첫 줄에 `await requireOwnerIdOrRedirect()`. layout이 이중 방어하지만 페이지도 자기 몫을 한다 |
| 주석 | 핵심 결정에 `// Design Ref: refine-auth-boundary §n` |
| 에러 처리 | 서버 API: error-mapper 단일 지점(무변경) / 페이지: Clerk redirect |
| L1 스크립트 | 정리 블록 불가침. 계측은 `req()`·`record()`·요약 출력에만 |

---

## 11. Implementation Guide

### 11.1 파일 구조 (변경분만)

```
src/
├── application/ports/current-user.ts           [신규]
├── infrastructure/auth/clerk-current-user.ts   [신규]
├── presentation/
│   ├── auth/api-guard.ts                       [신규]
│   ├── auth/page-guard.ts                      [신규]
│   ├── container.ts                            [수정] currentUser·requireOwnerId export
│   ├── api/auth.ts                             [삭제]
│   └── api/error-mapper.ts                     [수정] UnauthorizedError import 경로
├── app/(app)/layout.tsx                        [수정] page-guard
├── app/(app)/page.tsx                          [수정] page-guard
├── app/(app)/sessions/new/page.tsx             [수정] page-guard
├── app/api/**/route.ts (5개)                   [수정] import 경로만
└── middleware.ts                               [수정] 껍데기화
scripts/run-l1.mjs                              [수정] 계측 + #9 + 요약 + L1_RUN_LABEL
tests/auth-guard.test.ts                        [신규] AG-1·AG-2
```

### 11.2 구현 순서

1. [ ] module-1 — 포트·어댑터·가드 2개·container → 페이지 3곳·라우트 5개·error-mapper 교체 → `presentation/api/auth.ts` 삭제 → `middleware.ts` 껍데기화 → AG 테스트 → `typecheck`·`lint`·`build`·`test` → M-1 확인 → 커밋
2. [ ] **★ⓐ 조기 실측** — module-1을 develop 푸시 → Preview Ready → **기존** L1 그대로 실행 → #1이 401인지 확인 (8/8 기대). 401이 아니면 여기서 멈추고 원인 분석(Plan R3)
3. [ ] module-2 — `run-l1.mjs` 계측·#9·요약·`L1_RUN_LABEL` → 로컬 문법 확인 → 커밋 → 푸시
4. [ ] 실측 — §8.5 콜드/워밍 2회차, §8.4 M-2~M-4, §8.6 탭 카운트(프로덕션에서 가능)
5. [ ] Check — `/pdca analyze refine-auth-boundary`

### 11.3 Session Guide

#### Module Map

| Module | Scope Key | 내용 | 산출물 | 예상 턴 |
| --- | --- | --- | --- | :-: |
| 경계 이관 | `module-1` | 포트·어댑터·가드·container·페이지 3·라우트 5·error-mapper·미들웨어·구파일 삭제·AG 테스트·빌드 | 커밋 1개, Preview에서 기존 L1 #1=401 | 15-20 |
| L1 계측 | `module-2` | `req()` 스탬프·`record()` ms·#9·요약 표·`L1_RUN_LABEL` | 커밋 1개, 9/9 + ms 출력 | 8-12 |
| 실측 | (코드 없음) | 콜드/워밍 2회차, 수동 M-1~M-5, 탭 카운트 | Analysis 입력 수치 | 5-8 |

#### Recommended Session Plan

| Session | Phase | Scope | 비고 |
| --- | --- | --- | --- |
| 1 | Plan + Design | 전체 | 완료 (본 문서) |
| 2 | Do | `--scope module-1` + ★ⓐ 조기 실측 | 커밋 1 + 푸시 |
| 3 | Do | `--scope module-2` + 실측 | 커밋 1 + 푸시 + 수치 확보 |
| 4 | Check + Report | 전체 | NFR 기준 확정, 종료 절차(RULE.md), 태그 v1.0.1 |

develop 브랜치에서 작업, 모듈 종료 시 커밋(CONTRIBUTING). 푸시는 사용자 지시 시에만.

---

## Version History

| 버전 | 날짜 | 변경 | 작성자 |
| --- | --- | --- | --- |
| 0.1 | 2026-08-23 | 최초 작성. Checkpoint 3에서 B안(포트/어댑터) 선택, 페이지 가드명 `requireOwnerIdOrRedirect()` 확정. 설치본 코드 확인으로 Plan ★ⓐ(404의 실제 원인은 `auth.protect()`의 비문서 요청 규칙)·★ⓒ(`auth().redirectToSignIn()` 존재)·R8(Preview=Production env) 해소 | Claude |
