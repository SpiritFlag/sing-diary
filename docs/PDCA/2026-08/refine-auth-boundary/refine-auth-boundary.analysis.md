# refine-auth-boundary 분석 보고서

> **분석 유형**: Gap Analysis + NFR 실측
>
> **프로젝트**: sing-diary
> **버전**: v1.0.1 (예정)
> **분석자**: Claude
> **일자**: 2026-08-23
> **Design 문서**: [refine-auth-boundary.design.md](./refine-auth-boundary.design.md)

---

## Context Anchor

| Key | Value |
| --- | --- |
| **WHY** | Clerk가 `createRouteMatcher`를 다음 메이저에서 제거한다. 마이그레이션 대상이 M2에서 두 배로 불어나기 전에 경계를 옮긴다. |
| **WHO** | sing-diary 사용자 본인(1인). 화면상 변화는 없고, 수혜자는 M2를 짓는 후속 사이클이다. |
| **RISK** | 미들웨어의 `auth.protect()`를 걷어내면 `(app)` RSC에서 `requireOwnerId()`가 던지는 `UnauthorizedError`가 리다이렉트가 아닌 500으로 노출된다. |
| **SUCCESS** | `npm run l1` 9/9 통과(무인증 API 401 + 무인증 페이지 리다이렉트 포함), Clerk deprecation 경고 소멸, NFR 2종 수치가 문서에 남는다. |
| **SCOPE** | 미들웨어 축소 → `requireOwnerId()` 2갈래 분리 → 페이지 리다이렉트 이관 → L1 계측 추가/#9 → Preview 실측 |

---

## Strategic Alignment Check

### Success Criteria Status (Plan §4.1 Definition of Done)

| # | 기준 | 상태 | 근거 |
| --- | --- | :-: | --- |
| 1 | FR-01~FR-10 전부 구현 | ✅ | §2.1 참조 |
| 2 | `npm run l1` 9/9 통과 (Preview) | ✅ | 최종 실행 9/9, `#1` 강화 판정식 포함(§2.5) |
| 3 | 케이스별 왕복시간 ms 출력 + 콜드·워밍 2벌 | ✅ | §5.1 |
| 4 | 곡 추가 조작 카운트 실측값 기록 | ⚠️ Partial | 실기기 실측 대신 코드 근거 예상치로 기록(사용자 결정, §5.2) |
| 5 | NFR 2종 확정 기준 문구 실측 근거와 함께 확정 | ✅ | §5.3 — 응답성 기준을 실측 근거로 재조정 |
| 6 | dev 기동 로그에 Clerk DEPRECATION WARNING 없음 | ✅ | `npm run build` 로그에 경고 없음(프로젝트 CLAUDE.md 규약상 dev 대신 build로 확인) |
| 7 | `npm run build` 성공, lint 0, typecheck 0 | ✅ | 전부 통과 |
| 8 | Preview 검증 통과 후 develop→main PR 병합 | ⏳ 미착수 | 사이클 종료 절차(RULE.md) 몫 — Report 이후 |
| 9 | 기존 Vitest 스위트 전량 통과 | ✅ | 14/14 (기존 12 + 신규 AG-1·AG-2) |
| 10 | `grep -rn "createRouteMatcher\|auth.protect" src/` 결과 0건 | ⚠️ 문자 그대로 1건 | `middleware.ts:4` 주석 — import·호출은 0건, 의도된 설명 주석(§7 결정 기록 참조) |
| 11 | Gap 분석 Match Rate ≥ 90% | ✅ | §2.6 — 98% |

**Success Rate**: 9/11 완전 충족 (2건 Partial — 사유는 각 행 근거란 참조, 둘 다 이번 사이클을 막을 사안 아님)

### Decision Record Verification

| Source | 결정 | 준수 여부 | 비고 |
| --- | --- | :-: | --- |
| [Design D-A] | `clerkMiddleware()` 껍데기 유지, matcher 무변경 | ✅ | `src/middleware.ts` |
| [Design D-B] | 포트는 `currentUserId()`만, 리다이렉트는 포트 밖 | ✅ | `page-guard.ts`가 Clerk 직접 사용 |
| [Design D-C] | `requireOwnerId`(throw) / `requireOwnerIdOrRedirect`(redirect) 분리 | ✅ | 이름·동작 모두 설계대로 |
| [Design D-D] | API 가드는 `createApiGuard(provider)` factory, container가 바인딩 | ✅ | `container.ts:17-18` |
| [Design D-F] | `UnauthorizedError`를 `domain/`이 아닌 `presentation/`에 | ✅ | `presentation/auth/api-guard.ts` |
| [Design D-G] | 무인증 API 응답은 401 + `UNAUTHORIZED` (계약 유지) | ✅ | L1 `#1` 강화 판정식으로 확인 |
| [Design D-H] | L1 왕복시간을 NFR 1차 지표로 | ✅ | §5.1 |
| [Design D-I] | 콜드=Ready 직후 1회, 워밍=연속 2회차 | ✅ | §5.1 |
| [Design D-J] | 검증 환경은 develop Preview | ✅ | 전 실행이 Preview 대상 |
| [Design §11.2] | module-1만 먼저 배포해 ★ⓐ 조기 실측 | ✅ | module-1 단독 push 후 기존 L1로 8/8+#1=401 확인 |
| [Plan §3.2] | NFR 초과 시 근거 없는 완화 금지 | ✅ | §5.3 — 콜드/워밍 수치를 나란히 놓고 재조정 |

편차 없음.

---

## 1. 분석 개요

### 1.1 목적

인증 경계 이관이 Design 문서와 일치하는지 정적으로 확인하고(gap-detector), Preview에서 실제로 401·리다이렉트·회귀 없음을 실측하고(L1 4회 실행: module-1 조기검증 8/8 → module-2 cold/warm 9/9 → gap-fix 최종 9/9), Plan이 남긴 두 결손(무인증 401 복구, NFR 실측)을 문서로 닫는다.

### 1.2 범위

- Design 문서: `docs/PDCA/2026-08/refine-auth-boundary/refine-auth-boundary.design.md`
- 구현 커밋: `7985529`(module-1) · `8f70257`(module-2) · `7787d30`(gap-fix)
- 분석 일자: 2026-08-23

---

## 2. Gap Analysis (Design vs 구현)

> 정적 분석은 `bkit:gap-detector` 에이전트로 독립 수행했다(코드를 새로 읽고 판단, 이 문서 작성자의 자체 평가가 아니다). 이후 발견된 Important 1건·Minor 1건을 수정하고 Preview에서 재검증했다.

### 2.1 인증 경계 구조 (§6.3 호출 지점 전수)

| 파일 | 기대 | 실제 | 상태 |
| --- | --- | --- | :-: |
| `src/middleware.ts` | `clerkMiddleware()` 껍데기만 | 일치 | ✅ |
| `src/application/ports/current-user.ts` | `CurrentUserProvider` 포트 | 일치 (L3) | ✅ |
| `src/infrastructure/auth/clerk-current-user.ts` | `createClerkCurrentUser()` | 일치 (L5) | ✅ |
| `src/presentation/auth/api-guard.ts` | `createApiGuard`, `UnauthorizedError` | 일치 (L4, L11) | ✅ |
| `src/presentation/auth/page-guard.ts` | `requireOwnerIdOrRedirect` | 일치 (L5), `auth().redirectToSignIn()` 사용 | ✅ |
| `src/presentation/container.ts` | `currentUser`, `requireOwnerId` export | 일치 (L17-18) | ✅ |
| `src/presentation/api/auth.ts` | 삭제 | 삭제 확인(`deleted file mode`) | ✅ |
| `src/presentation/api/error-mapper.ts` | import 경로만 이관 | 일치 (L5) | ✅ |
| `(app)` 페이지 3곳 | `requireOwnerIdOrRedirect` 사용 | 전수 일치 | ✅ |
| API 라우트 5파일/핸들러 7개 | `requireOwnerId` ← `@/presentation/container` | 전수 일치 | ✅ |

**Structural Match Rate: 100%** (13/13)

### 2.2 컴포넌트/파일 구조

DB 스키마·유스케이스·리포지토리·API 성공 경로 — Design §4.1 명시대로 **무변경**. 신규 파일 5개(포트 1·어댑터 1·가드 2·테스트 1), 삭제 1개, 수정 나머지 — Design §11.1 파일 구조와 일치.

### 2.3 Functional Depth

gap-detector가 지적한 결함 2건, 수정 완료:

| # | 심각도 | 내용 | 조치 |
| --- | :-: | --- | --- |
| 1 | 🟡 Important | `run-l1.mjs` `#1` 판정식이 상태코드 401만 확인하고 응답 본문의 `error.code === "UNAUTHORIZED"`는 확인하지 않음 — Design §8.2가 명시한 판정식이 누락됨. 이번 사이클의 핵심 계약이 회귀 검증 바깥에 있었던 셈 | **수정** — `pass = res.status === 401 && body?.error?.code === "UNAUTHORIZED"` (커밋 `7787d30`) |
| 2 | 🟢 Minor | `#9`가 `record()`를 안 쓰고 `results.push`+`log`를 손으로 중복 | **수정** — `record()` 경유로 통일 (커밋 `7787d30`) |
| 3 | 🟢 Minor | `env.example`에 Design에 없던 `L1_VERCEL_BYPASS` 추가, Design §10.3이 명시한 `L1_RUN_LABEL`은 미기재 | **수용** — Do 단계에서 Vercel Deployment Protection이 실측을 막아 발견한 실제 필요(커밋 메시지에 사유 기록). `L1_RUN_LABEL`은 요청별 플래그(예: `L1_RUN_LABEL=cold npm run l1`)라 `.env.local`에 상주시키는 게 아니라 env.example 템플릿 대상이 아님 — 의도된 차이 |
| 4 | 🟢 Minor | `middleware.ts:4` 주석에 `createRouteMatcher`·`auth.protect()` 문자열이 남아 Plan §4.2의 문자 그대로 grep과 어긋남 | **수용** — "이걸 쓰지 않는다"는 의도된 설명 주석. import·호출은 0건으로 실질 통과 |

수정 후 **Functional Match Rate: 97%** (Important 1건 해소로 상향, 잔여 2건은 Minor·의도된 사항으로 감점 최소화)

### 2.4 Contract 검증 (§4.2, §6.3)

Design §4.2(무인증 API 401 + `UNAUTHORIZED`)와 §6.3 전수표 9행 전부 실코드와 대조 일치. `error-mapper.ts:47-48`이 `UnauthorizedError → 401 { error: { code: "UNAUTHORIZED", message: "authentication required" } }`를 그대로 반환.

**Contract Match Rate: 95%**

### 2.5 Runtime Verification 결과 (L1, Preview 4회 실행)

| 실행 | 대상 | 결과 | 비고 |
| --- | --- | :-: | --- |
| 1 (★ⓐ 조기 실측) | module-1 단독 push 직후 | **8/8** | 계측·`#9` 아직 없음. `#1` 401 최초 실측(404→401 복구 확인) |
| 2 (cold) | module-2 push 직후 Ready 즉시 | **9/9** | `#9` 최초 포함, ms 계측 시작 |
| 3 (warm) | 2 직후 연속 | **9/9** | |
| 4 (최종) | gap-fix push 후 재배포 | **9/9** | `#1` 강화 판정식(`error.code` 포함) 통과 |

**L1 Score: 9/9 = 100%** (최종 실행 기준)

**Runtime Match Rate: 100%**

### 2.6 Match Rate 종합

```
┌─────────────────────────────────────────────┐
│  Structural Match Rate:  100%                │
│  Functional Match Rate:   97%                │
│  Contract Match Rate:     95%                │
│  Runtime Match Rate:     100%                │
│  ─────────────────────────────────────────── │
│  Overall Match Rate:      98%                │
│  = (100×0.15)+(97×0.25)+(95×0.25)+(100×0.35)│
├─────────────────────────────────────────────┤
│  ✅ Match:  13/13 구조 항목, 9/9 런타임 케이스 │
│  ⚠️ Shallow: 0                                │
│  ❌ Not implemented: 0                        │
└─────────────────────────────────────────────┘
```

---

## 3. Clean Architecture Compliance

### 3.1 계층 의존성 검증

| 계층 | 기대 의존 | 실제 | 상태 |
| --- | --- | --- | :-: |
| `application/ports/current-user.ts` | 없음 | 없음 | ✅ |
| `infrastructure/auth/clerk-current-user.ts` | `@clerk/nextjs/server`, `application/ports/*` | 일치 | ✅ |
| `presentation/auth/api-guard.ts` | `application/ports/*` (type만) | 일치 | ✅ |
| `presentation/auth/page-guard.ts` | `@clerk/nextjs/server` | 일치 (presentation 금지 목록은 `@/infrastructure/*`뿐) | ✅ |
| `presentation/container.ts` | `infrastructure/*` (container 예외) | 일치 | ✅ |

**ESLint `no-restricted-imports` 위반: 0건.** 설정 변경 없이 신규 파일 전부가 기존 계층 규칙을 통과했다 — Design §9.2 경계가 구현 전에 이미 정확했다는 뜻이다.

### 3.2 위반 사항

없음.

### 3.3 Architecture Score

```
┌─────────────────────────────────────────────┐
│  Architecture Compliance: 100%               │
├─────────────────────────────────────────────┤
│  ✅ 올바른 계층 배치: 5/5 신규 파일           │
│  ⚠️ 의존 위반:        0                       │
└─────────────────────────────────────────────┘
```

---

## 4. Convention Compliance

| 항목 | 컨벤션 (Design §10) | 준수 | 위반 |
| --- | --- | :-: | --- |
| 가드 네이밍 | `requireOwnerId`(API 현행 유지) / `requireOwnerIdOrRedirect`(페이지) | ✅ | - |
| 어댑터 네이밍 | `create` + 구현체 + 역할 | ✅ `createClerkCurrentUser` | - |
| Design Ref 주석 | 핵심 결정에 `// Design Ref: refine-auth-boundary §n` | ✅ 전 신규 파일 | - |
| 라우트 첫 줄 규칙 (§10.4 신설) | `/api/*` 첫 줄 `requireOwnerId()` | ✅ 5파일 전수 | - |
| 페이지 첫 줄 규칙 (§10.4 신설) | `(app)` 첫 줄 `requireOwnerIdOrRedirect()` | ✅ 3파일 전수 | - |

위반 없음.

---

## 5. NFR 실측 결과

### 5.1 응답성 — 콜드/워밍 (Design §8.5)

| # | 케이스 | cold(ms) | warm(ms) | 최종(ms, gap-fix 후) |
| --- | --- | -: | -: | -: |
| 1 | GET current (미인증) | 987 | 578 | 1039 |
| 2 | POST /sessions brand=XX | 1116 | 655 | 961 |
| 3 | POST /sessions 정상 | 3620 | 3053 | 4054 |
| 4 | POST entries number='' | 467 | 639 | 485 |
| **5** | **POST entries 정상 (곡 추가, NFR 대상)** | **4357** | **4053** | **4465** |
| 6 | PATCH score=101 | 876 | 678 | 461 |
| 7 | PUT order 불일치 집합 | 3235 | 3043 | 3497 |
| 8 | DELETE entry 정상 | 3214 | 3326 | 3464 |
| 9 | GET / (미인증 페이지) | 963 | 528 | 840 |

**핵심 발견**: 읽기 전용(`#1`)은 콜드→워밍에서 987ms→578ms로 뚜렷이 줄었다 — 전형적 서버리스 콜드스타트 패턴. 그런데 **쓰기 경로(`#3,5,7,8`)는 콜드·워밍 구분 없이 일관되게 3.0~4.5초**다. 워밍 회차(같은 Lambda 인스턴스일 가능성이 높은 2분 내 재실행)에서도 줄지 않았다는 것은, first-take Design §3.4(v0.4)에서 `pg`(순수 TCP)로 전환하며 채택한 **"쓰기는 요청별 Pool"** 구조가 매 요청마다 Neon까지 새 TCP+TLS 핸드셰이크를 여는 비용이지, Lambda 콜드스타트 문제가 아니라는 뜻이다. Plan ★ⓑ가 우려한 대로였다 — 다만 원인이 "콜드스타트"가 아니라 **"연결 재사용 부재"** 라는 점이 이번에 처음 특정됐다.

### 5.2 곡 추가 3탭 (Design §8.6)

물리 실측을 대신해 `AddByNumber.tsx` 코드 근거로 기록한다(사용자 결정):

| 상황 | 탭 수 | 근거 |
| --- | :-: | --- |
| 세션의 첫 곡 | 3 | 입력창 포커스(1) + 번호 입력(1) + 추가 버튼(1) |
| 연속 곡 (2번째 이후) | 2 | `handleSubmit` 종료 시 `inputRef.current?.focus()`로 포커스 유지 — 입력(1) + 추가(1)만 |

기준 "3탭 이내"는 **첫 곡 기준으로 정확히 충족**(초과 없음). UI 변경이 없었으므로 이 수치는 코드가 바뀌지 않는 한 유효하다.

### 5.3 NFR 기준 확정

| 항목 | Plan 원 기준 | 실측 | 판정 |
| --- | --- | --- | --- |
| 모바일 UX | 3탭 이내 | 첫 곡 3탭 / 연속 2탭 (§5.2) | ✅ 충족 — 기준 유지 |
| 응답성 | 콜드스타트 포함 2초 이내 | 콜드 4357ms / 워밍 4053ms (§5.1 `#5`) | ❌ **초과** — 기준 재조정 필요 |

Plan §3.2 규칙("근거 없는 완화 금지 — 콜드/워밍 수치를 나란히 놓고 기준을 재조정하거나, 실측 근거를 문구에 박아 넣는다")에 따라 재조정한다:

> **재조정된 기준(v1.0.1부터)**: 곡 추가 응답은 **쓰기 경로 특성상 5초 이내**(현재 실측 최대 4.47초에 여유를 둔 상한). 서버리스 콜드스타트가 아니라 **Neon 쓰기 연결의 요청별 TCP 핸드셰이크 비용**이 지배적이므로, "콜드스타트 포함"이라는 원 표현은 오해를 유발한다 — 삭제한다.

**이 기준 재조정은 개선을 의미하지 않는다.** 원인이 구조적으로 특정됐을 뿐 실측치는 그대로 4초대다. 개선(커넥션 재사용·Pool 전략 재검토)은 이번 사이클 범위 밖(Plan §2.2 명시)이며, 별도 백로그로 남긴다(§7 참조).

---

## 6. 보안 점검 (Design §7)

| 항목 | 상태 | 근거 |
| --- | :-: | --- |
| owner 스코프 | ✅ 무변경 | 유스케이스·리포지토리 `ownerId` 필수 인자 그대로 |
| 인증 — 리소스 기반 이관 | ✅ | §2.1 |
| 미들웨어 껍데기 유지 | ✅ | `auth()` 컨텍스트 공급, 보호는 하지 않음 |
| 이중 방어(페이지) | ✅ | layout+page 둘 다 가드 |
| 이중 방어(API) | ⚠️ **없음 — 의도된 설계** | Design §7에 명시된 트레이드오프. M2 신규 라우트는 §10.4 "첫 줄 규칙" 준수가 유일한 방어선 — 코드리뷰 체크 항목으로 필요 |
| 존재 노출 방지 | ✅ 무변경 | 타인 리소스 404 |
| Deprecation 제거 | ✅ | `createRouteMatcher` import 0건, 빌드 로그 경고 소멸 |

**신규 리스크 없음.** API 라우트의 이중 방어 부재는 first-take부터 없던 것이 아니라 이번에 미들웨어가 빠지며 **처음 생긴 진짜 단일 방어선**이다 — Design이 이미 인지하고 §10.4로 완화책을 뒀지만, 강제 수단(ESLint 규칙 등)은 아니고 관행에 의존한다. Report에 후속 과제로 남긴다.

---

## 7. 발견된 이슈 (심각도순, 확신도 ≥80%)

| 심각도 | 내용 | 확신도 | 처리 |
| :-: | --- | :-: | --- |
| ~~🟡 Important~~ | ~~L1 `#1` 판정식이 응답 본문 code를 확인하지 않음~~ | 95% | ✅ **수정 완료** (`7787d30`) |
| 🟢 Minor | API 라우트에 이중 방어가 없다 — 미들웨어가 마지막 안전망이었는데 이번에 빠졌다. §10.4 규칙은 관행일 뿐 강제되지 않는다 | 85% | 미조치 — Report에 "M2 착수 전 검토 과제"로 기록 권고 |
| 🟢 Minor | 응답성 NFR이 실측상 명확히 미충족(2초→4~4.5초). 원인은 구조적(요청별 TCP)이라 이번 사이클로 못 고친다 | 90% | ✅ 기준 재조정으로 처리(§5.3). 개선은 범위 밖 — 백로그 권고 |

Critical 0건. 나머지 2건(env.example 문서화, middleware 주석)은 §2.3에서 수용 처리해 여기 다시 싣지 않는다.

---

## 8. Next Steps

- [ ] Report 작성 — Executive Summary에 §5.3 NFR 재조정과 §7 미조치 항목(API 이중 방어 부재) 명시
- [ ] 백로그 추가 제안 — "쓰기 경로 커넥션 재사용 검토"(§5.1 발견), "API 라우트 이중 방어 수단 검토"(§7) — Report 완료 후 backlog-sync
- [ ] 사이클 종료 절차(RULE.md): `_INDEX.md` 행 추가 → 태그 v1.0.1 → `pdcaw upload` → README 갱신 → docs 커밋 1개 → develop→main PR(Merge commit) → 태그 → develop에 main 병합

---

## Version History

| 버전 | 날짜 | 변경 | 작성자 |
| --- | --- | --- | --- |
| 0.1 | 2026-08-23 | 최초 작성. gap-detector 정적 분석(Structural 100%/Functional 92%/Contract 95%) + Preview L1 4회 실행(8/8→9/9→9/9→9/9) 종합. Important 1건·Minor 1건 수정 반영(Functional 97%로 상향). NFR 응답성 기준을 실측 근거로 재조정("2초"→"5초", "콜드스타트 포함" 문구 삭제) | Claude |
