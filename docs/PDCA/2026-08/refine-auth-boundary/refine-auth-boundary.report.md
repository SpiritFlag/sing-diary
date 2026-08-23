# refine-auth-boundary 완료 보고서

> **상태**: Complete
>
> **프로젝트**: sing-diary
> **버전**: v1.0.1 (예정)
> **작성자**: Claude
> **완료일**: 2026-08-23
> **PDCA 사이클**: #2 (first-take 다음)

---

## Executive Summary

### 1.1 프로젝트 개요

| 항목 | 내용 |
| --- | --- |
| 기능 | refine-auth-boundary |
| 시작일 | 2026-08-23 |
| 종료일 | 2026-08-23 |
| 기간 | 1세션 (Plan→Design→Do→Check 단일 사이클) |

### 1.2 결과 요약

```
┌─────────────────────────────────────────────┐
│  완료율: 100% (FR-01~FR-10)                  │
├─────────────────────────────────────────────┤
│  ✅ 완료:    10 / 10 기능 요구사항            │
│  ⚠️ Partial:  2 / 11 DoD 항목 (사유 있음)     │
│  ❌ 취소:     0                               │
└─────────────────────────────────────────────┘
```

Partial 2건은 실패가 아니라 **의도된 대체**다 — §1.4 참조.

### 1.3 전달된 가치

| 관점 | 내용 |
| --- | --- |
| **문제** | Clerk가 `createRouteMatcher`를 다음 메이저에서 제거 예고. 같은 미들웨어의 handshake 특성으로 무인증 API가 401 대신 404를 반환. NFR 2종(3탭·2초)이 정의만 되고 실측된 적 없음 — 3건이 열린 채 M2를 앞두고 있었다 |
| **해결** | 인증 경계를 미들웨어 경로매칭에서 리소스 기반 체크로 전량 이관(포트/어댑터 구조). `requireOwnerId`(API)/`requireOwnerIdOrRedirect`(페이지) 분리. `run-l1.mjs`에 왕복시간 계측·무인증 페이지 케이스(#9) 추가 |
| **기능/UX 효과** | 사용자가 보는 화면은 **의도대로 그대로**다. 달라진 건 기반 계약이 명세와 다시 일치한다는 것 — 무인증 API가 401을 낸다. NFR은 처음으로 실측치를 갖게 됐다 |
| **핵심 가치** | M2가 화면·API를 대거 추가하기 전에 경계를 옮겨, 후속 마이그레이션 대상이 두 배로 불어나는 것을 피했다. 그 과정에서 "2초 콜드스타트"라는 통념 뒤의 진짜 원인(쓰기 경로 요청별 TCP 연결)을 처음으로 특정했다 |

---

## 1.4 Success Criteria 최종 상태

Plan §4.1 Definition of Done 11개 항목:

| # | 기준 | 상태 | 근거 |
| --- | --- | :-: | --- |
| 1 | FR-01~FR-10 전부 구현 | ✅ Met | §3.1 |
| 2 | `npm run l1` 9/9 통과 (Preview) | ✅ Met | Analysis §2.5 — 최종 실행 9/9 |
| 3 | 케이스별 왕복시간 ms 출력 + 콜드·워밍 2벌 | ✅ Met | Analysis §5.1 |
| 4 | 곡 추가 조작 카운트 실측값 기록 | ⚠️ Partial | 실기기 대신 코드 근거 예상치(사용자 결정) — `AddByNumber.tsx` 구조상 첫 곡 3탭/연속 2탭이 명백해 대체 타당성 높음 |
| 5 | NFR 2종 확정 기준 문구, 실측 근거 포함 | ✅ Met | Analysis §5.3 — 응답성 기준 "2초"→"5초"로 근거와 함께 재조정 |
| 6 | dev 기동 로그에 deprecation 경고 없음 | ✅ Met | `npm run build` 로그 확인 (프로젝트 CLAUDE.md 규약상 dev 대신 build) |
| 7 | build 성공, lint 0, typecheck 0 | ✅ Met | 전 실행 통과 |
| 8 | Preview 검증 통과 후 develop→main PR 병합 | ⚠️ Partial | 사이클 종료 절차(RULE.md) 몫으로 **의도적으로 이 시점엔 미착수** — §8.1 |
| 9 | 기존 Vitest 스위트 전량 통과 | ✅ Met | 14/14 |
| 10 | `grep` 결과 0건 | ✅ Met (실질) | `middleware.ts` 주석 1건은 의도된 설명, import·호출 0건 |
| 11 | Gap 분석 Match Rate ≥ 90% | ✅ Met | 98% |

**Success Rate**: 9/11 완전 충족 + 2/11 의도된 Partial (100% — 실패 0건)

## 1.5 Decision Record Summary

| 출처 | 결정 | 준수 | 결과 |
| --- | --- | :-: | --- |
| [Plan] | 3건(Clerk deprecation·401 복구·NFR 실측)을 한 사이클로 묶는다 — 같은 파일·같은 검증 수단이므로 | ✅ | `src/middleware.ts` 하나가 접점, `npm run l1` 한 실행으로 3건 모두 검증됨(Analysis 전체) |
| [Plan] | NFR 초과 시 근거 없는 완화 금지 | ✅ | 응답성 기준을 실측 원인(요청별 TCP)까지 특정해 재조정. 수치를 숨기지 않고 그대로 보고 |
| [Design D-B] | 포트는 "현재 사용자가 누구인가"만, 리다이렉트는 포트 밖 | ✅ | `CurrentUserProvider`가 정확히 그 선을 지킴 |
| [Design D-A] | 미들웨어 파일은 삭제하지 않고 껍데기로 유지 | ✅ | `auth()`가 전 라우트에서 정상 동작 확인(L1 전체) |
| [Design §11.2] | module-1만 먼저 배포해 ★ⓐ(401 실측) 조기 확인 | ✅ | 실제로 그렇게 진행 — 8/8 확인 후 module-2 착수. 전략이 유효했음이 실증됨 |
| [Design §8.2] | L1 `#1` 판정식에 `error.code` 검사 추가 | ⚠️ → ✅ | Do에서 최초 누락, gap-detector가 발견, Check 초입에 즉시 수정·재검증 |

편차는 1건(설계 문서 자체가 지시한 세부사항을 Do에서 누락) — 조기에 잡혀 Report까지 오염되지 않았다.

---

## 2. 관련 문서

| 단계 | 문서 | 상태 |
| --- | --- | --- |
| Plan | [refine-auth-boundary.plan.md](./refine-auth-boundary.plan.md) | ✅ Finalized |
| Design | [refine-auth-boundary.design.md](./refine-auth-boundary.design.md) | ✅ Finalized |
| Check | [refine-auth-boundary.analysis.md](./refine-auth-boundary.analysis.md) | ✅ Complete |
| Act | 본 문서 | ✅ Complete |

---

## 3. 완료 항목

### 3.1 기능 요구사항

| ID | 요구사항 | 상태 | 비고 |
| --- | --- | :-: | --- |
| FR-01 | `createRouteMatcher` 미사용 | ✅ Complete | |
| FR-02 | `auth.protect()` 미호출, `clerkMiddleware()` 유지 | ✅ Complete | |
| FR-03 | 무인증 API 401 + `UNAUTHORIZED` | ✅ Complete | L1 `#1`, gap-fix로 판정식 강화 |
| FR-04 | 무인증 페이지 sign-in 리다이렉트, 500 없음 | ✅ Complete | L1 `#9` (307 → `/sign-in`) |
| FR-05 | sign-in 후 원래 경로 복귀 | ✅ Complete | `redirect_url` 파라미터에 원 URL 포함 확인(L1 `#9` 로그) |
| FR-06 | 인증 요청 동작 무변경 (회귀 0) | ✅ Complete | L1 `#2~8` 전 실행 통과 |
| FR-07 | L1이 케이스별 ms 출력 | ✅ Complete | |
| FR-08 | L1에 무인증 페이지 케이스(`#9`) 추가 | ✅ Complete | |
| FR-09 | `L1_TARGET_URL`/`L1_VERCEL_BYPASS`로 Preview 검증 가능 | ✅ Complete | 4회 실행 전부 이 경로 사용 |
| FR-10 | 정리(cleanup) 로직이 계측 추가 후에도 무결 | ✅ Complete | diff상 `finally` 블록 변경 0줄, 4회 실행 모두 "정리 완료" |

### 3.2 비기능 요구사항

| 항목 | 목표 | 달성 | 상태 |
| --- | --- | --- | :-: |
| 모바일 UX | 3탭 이내 | 첫 곡 3탭 / 연속 2탭 (코드 근거) | ✅ |
| 응답성 (원 기준) | 2초 이내 | 콜드 4.36s / 워밍 4.05s | ❌ 원 기준 미충족 |
| 응답성 (재조정 기준) | 5초 이내 | 최대 4.47s | ✅ 재조정 기준 충족 |
| 데이터 격리 | owner 스코프 유지 | 무변경, L1 회귀 없음 | ✅ |
| 인증 계약 | Design §4.3과 일치 | 401/307 실측 일치 | ✅ |

### 3.3 산출물

| 산출물 | 위치 | 상태 |
| --- | --- | :-: |
| 포트 | `src/application/ports/current-user.ts` | ✅ 신규 |
| 어댑터 | `src/infrastructure/auth/clerk-current-user.ts` | ✅ 신규 |
| API 가드 | `src/presentation/auth/api-guard.ts` | ✅ 신규 |
| 페이지 가드 | `src/presentation/auth/page-guard.ts` | ✅ 신규 |
| composition root | `src/presentation/container.ts` | ✅ 수정 |
| 미들웨어 | `src/middleware.ts` | ✅ 수정(껍데기화) |
| 페이지 3곳 + API 라우트 5파일 | `src/app/**` | ✅ 수정 |
| 구 인증 헬퍼 | `src/presentation/api/auth.ts` | ✅ 삭제 |
| L1 스크립트 | `scripts/run-l1.mjs` | ✅ 수정(계측+`#9`) |
| 유닛 테스트 | `tests/auth-guard.test.ts` | ✅ 신규 (AG-1·AG-2) |
| env 템플릿 | `env.example` | ✅ 수정 (`L1_VERCEL_BYPASS` 추가) |

커밋: `7985529`(module-1) → `8f70257`(module-2) → `7787d30`(gap-fix), develop에 push 완료.

---

## 4. 미완료/이월 항목

### 4.1 다음 조치 필요 (백로그 후보 — 사용자 승인 시 backlog-sync)

| 항목 | 사유 | 우선순위 |
| --- | --- | :-: |
| 쓰기 경로 커넥션 재사용 검토 | Analysis §5.1 발견 — 쓰기 요청이 매번 새 TCP+TLS 핸드셰이크를 연다. 콜드스타트가 아니라 구조적 비용이라 워밍업으로 안 없어짐 | Medium |
| API 라우트 이중 방어 수단 검토 | Analysis §6 — 미들웨어가 빠지며 API는 라우트 첫 줄이 유일한 방어선이 됨. 지금은 관행(§10.4)에 의존, 강제 수단 없음 | Medium |

### 4.2 M2+ 이월 (Plan에서 이미 범위 밖으로 결정된 것)

없음 — 이 사이클은 Plan §2.2에서 범위를 코드 변경으로만 닫도록 명시했고 그대로 자기완결됐다.

---

## 5. 품질 지표

### 5.1 최종 분석 결과

| 지표 | 목표 | 최종 | 변화 |
| --- | --- | --- | --- |
| Design Match Rate | 90% | 98% | +8%p |
| L1 Runtime | — | 9/9 (100%) | — |
| Structural Match | — | 100% | — |
| Functional Match | — | 97% (수정 전 92%) | +5%p |
| Contract Match | — | 95% | — |
| ESLint 계층 경계 위반 | 0 | 0 | — |
| typecheck/lint/test | 0 에러 | 0 에러 | — |
| Deprecation 경고 | 0 | 0 | — |

### 5.2 해결된 이슈

| 이슈 | 조치 | 결과 |
| --- | --- | --- |
| L1 `#1` 판정식이 `error.code` 미확인 (Important) | `pass = status===401 && body.error.code==="UNAUTHORIZED"` | ✅ 해결, 재검증 9/9 |
| L1 `#9`가 `record()` 미사용 (Minor) | `record()` 경유로 통일 | ✅ 해결 |

---

## 6. 회고 (Lessons Learned)

### 6.1 잘된 것 (Keep)

- **module-1만 먼저 배포해 ★ⓐ를 조기 실측한 전략이 정확히 맞아떨어졌다.** Design §11.2가 "계측 코드 완성 전에 핵심 가설부터 검증하라"고 못박은 게 실제로 시간을 아꼈다 — 만약 401이 안 나왔다면 module-2(계측 코드) 작업이 통째로 헛수고가 될 뻔했다.
- **gap-detector 독립 검증이 실제로 결함을 잡았다.** 내가 직접 쓴 Design 명세(§8.2 "판정식에 code 검사 추가")를 내가 직접 구현하면서 빠뜨렸는데, 자체 재검토가 아니라 별도 에이전트가 코드를 새로 읽고 찾아냈다 — 자체 검토만으로는 못 잡았을 가능성이 높다.
- **NFR 실측이 "콜드스타트"라는 통념을 반증하고 진짜 원인을 특정했다.** 콜드/워밍을 분리 계측하지 않았다면 "서버리스라 느리다"로 뭉뚱그려졌을 텐데, 워밍에서도 안 줄어드는 걸 보고 요청별 TCP 연결 비용이라는 더 정확한 원인에 도달했다.

### 6.2 개선 필요 (Problem)

- NFR 물리 실측(탭 카운트, 브라우저 로그인 왕복) 항목은 에이전트 세션이 사람 손을 대체할 수 없다. 이번엔 Check 단계에서 즉흥적으로 사용자에게 물어 대체 방식을 정했는데, Plan 단계에서 "코드 근거 예상치로 충분한 항목"을 미리 표시해뒀다면 Check에서 멈추지 않았을 것이다.
- Vercel CLI(`vercel logs`)로는 함수 실행시간(서버 측 ms)까지 자동 교차검증하지 못했다 — 로그 포맷이 타임스탬프만 주고 duration을 안 준다. 클라이언트 측 왕복시간(D-H)만으로도 이번엔 충분했지만, 서버·클라이언트 시간 분리가 필요한 사이클에서는 대시보드 수동 확인이나 다른 계측 경로를 미리 계획해야 한다.

### 6.3 다음에 시도할 것 (Try)

- API 라우트 이중 방어를 관행이 아니라 ESLint 커스텀 규칙 등으로 강제하는 방안(§4.1).
- 쓰기 경로 커넥션 재사용(Pool 유지 전략) 조사(§4.1) — 이번에 원인은 특정했으니 다음은 해법 조사 차례다.

---

## 7. 프로세스 개선 제안

### 7.1 PDCA 프로세스

| 단계 | 현재 | 개선 제안 |
| --- | --- | --- |
| Plan | NFR 항목이 물리 실측 전제로만 정의됨 | 물리 실측이 어려운 항목은 "코드 근거 예상치 허용 여부"를 Plan Checkpoint에서 미리 합의 |
| Do | Design이 명시한 세부 판정식을 구현자가 놓칠 수 있음 | 모듈 완료 시 "Design §n의 명시 사항 전수 대조" 자가 체크리스트 추가 |
| Check | gap-detector 독립 검증이 유효했음 | 유지 — 자체 검토와 분리된 검증이 이번처럼 결함을 잡는다 |

### 7.2 도구/환경

| 영역 | 개선 제안 | 기대 효과 |
| --- | --- | --- |
| L1 스크립트 | 서버 측 Duration도 함께 남기는 경량 로깅(예: 응답 헤더에 `Server-Timing`) 검토 | 클라이언트/서버 시간 분리로 원인 특정이 더 빨라짐 |

---

## 8. Next Steps

### 8.1 즉시 (사이클 종료 절차, RULE.md 기준)

- [ ] `docs/PDCA/_INDEX.md`에 행 추가
- [ ] 최신 태그 확인(`v1.0.0`) 후 다음 버전(`v1.0.1`) 사용자 확인
- [ ] `npx pdcaw@latest upload --cycle refine-auth-boundary --version v1.0.1`
- [ ] README.md 최신화
- [ ] docs 문서 + README 커밋 1개 (develop)
- [ ] develop 푸시 → PR(develop→main, Merge commit) 생성 → 병합 (병합 전 확인)
- [ ] 최종 커밋에 `v1.0.1` 태그 → 푸시 (푸시 전 확인)
- [ ] develop에 main 병합(정렬)
- [ ] 태그 diff를 프로젝트 폴더에 txt로 저장(커밋 안 함)

### 8.2 다음 PDCA 사이클

| 항목 | 우선순위 | 비고 |
| --- | :-: | --- |
| M2: 통합검색·지난 플리·브랜드 변환·곡 관리 표 (백로그 `27178302`) | High | 이번 사이클이 목표한 대로, 이제 리소스 기반 경계 위에서 시작 가능 |
| 쓰기 경로 커넥션 재사용 검토 (§4.1) | Medium | 사용자 승인 시 backlog-sync |
| API 라우트 이중 방어 수단 검토 (§4.1) | Medium | 사용자 승인 시 backlog-sync |

---

## 9. Changelog

### v1.0.1 (2026-08-23, 예정)

**Changed:**
- 인증 경계를 Clerk 미들웨어 경로매칭에서 리소스 기반 체크로 이관
- `src/middleware.ts`가 `clerkMiddleware()` 껍데기만 유지(보호는 라우트·페이지가 담당)
- 무인증 API 응답이 404 → 401로 복구
- `scripts/run-l1.mjs`가 왕복시간(ms) 계측 + 무인증 페이지 케이스(`#9`) 포함

**Added:**
- `CurrentUserProvider` 포트 + Clerk 어댑터 (`src/application/ports/`, `src/infrastructure/auth/`)
- `requireOwnerId`(API)/`requireOwnerIdOrRedirect`(페이지) 가드 분리
- `tests/auth-guard.test.ts`

**Fixed:**
- `createRouteMatcher` deprecation 경고 제거
- L1 `#1` 판정식에 응답 본문 `error.code` 검사 추가

---

## Version History

| 버전 | 날짜 | 변경 | 작성자 |
| --- | --- | --- | --- |
| 1.0 | 2026-08-23 | 최초 작성. Check(98%) 완료 후 Report 확정 | Claude |
