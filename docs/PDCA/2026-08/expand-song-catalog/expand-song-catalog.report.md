# expand-song-catalog 완료 보고서

> **상태**: Complete
>
> **프로젝트**: sing-diary
> **버전**: v1.1.0 (예정)
> **작성자**: Claude
> **완료일**: 2026-08-23
> **PDCA 사이클**: #3 (refine-auth-boundary 다음)

---

## Executive Summary

### 1.1 프로젝트 개요

| 항목 | 내용 |
| --- | --- |
| 기능 | expand-song-catalog |
| 시작일 | 2026-08-23 |
| 종료일 | 2026-08-23 |
| 기간 | 1세션 (Plan→Design→Do(module-1~6)→Check 단일 사이클) |

### 1.2 결과 요약

```
┌─────────────────────────────────────────────┐
│  Match Rate: 98%                             │
├─────────────────────────────────────────────┤
│  ✅ 완료:    FR-01~17 (17/17)                 │
│  ⚠️ Partial:  1 / 9 DoD 항목 (사유 있음)       │
│  ❌ 취소:     0                               │
└─────────────────────────────────────────────┘
```

### 1.3 전달된 가치

| 관점 | 내용 |
| --- | --- |
| **문제** | `songs`에 곡이 쌓이는데 꺼내 볼 수단이 없었다. M1은 세션 안에서 번호로 stub을 만들기만 했다. 동시에 직전 사이클이 미들웨어 방어선을 걷어낸 탓에 신규 API 라우트는 첫 줄 `requireOwnerId()`가 유일한 방어선인데 강제 수단이 없었다 |
| **해결** | 통합검색과 PC 곡 관리 표를 올렸다. 라우트를 처음 늘리는 이 사이클에서 `withAuth()` wrapper + ESLint `no-restricted-syntax` 2규칙으로 가드 누락을 도구가 걸러내게 만들었다. 검색 결과 추가는 기존 엔드포인트를 재사용해 신규 API 없이 처리했다 |
| **기능/UX 효과** | 모바일에서 제목·아티스트·메모 아무거나로 곡을 찾아 오늘의 플리에 바로 넣는다. PC 표에서 stub의 빈 제목·번호를 셀 단위로 즉시 고친다(저장 중에도 다른 셀은 자유롭게 편집). 인증 라우트가 9개(신규 4 + 기존 5 이관)로 늘었지만 전부 같은 형태로 강제된다 |
| **핵심 가치** | M2 완료 기준(과거 데이터 기반 선곡)의 절반을 딛었다. 그리고 Check 단계에서 이 사이클 자신이 만든 Critical 결함(UNSUPPORTED→행없음 전이가 UI에서 도달 불가)을 배포 전에 잡아 M3 빈칸채우기 큐 계약을 지켰다 |

---

## 1.4 Success Criteria 최종 상태

Plan §4.1 Definition of Done 9개 항목:

| # | 기준 | 상태 | 근거 |
| --- | --- | :-: | --- |
| 1 | FR-01~17 전부 구현 | ✅ Met | Analysis §2.4 |
| 2 | `npm run l1` 전 케이스 통과(기존 9 회귀 0 + 신규) | ✅ Met | Analysis §2.5 — Preview 3회 실행 전부 19/19 |
| 3 | `EXPLAIN` 결과가 Analysis에 원문 기록 | ✅ Met | Analysis §2.7 |
| 4 | 가드를 일부러 뺀 라우트가 도구에 걸리는 것을 실증 | ✅ Met | Analysis §2.8 — module-1 프로브 5단계 |
| 5 | 3-state 규칙 준수 확인 | ✅ Met | L1 `#18`·`#19` + 유닛 테스트 |
| 6 | 낙관적 UI 실패 롤백 의도적 실패 주입 확인 | ⚠️ Partial | 사용자가 Design §8.5 수동 확인을 약식으로 대체("써보며 디버깅")하기로 결정(2026-08-23). 롤백 로직 자체는 G-3 수정 과정에서 코드 레벨로 재검증됨 |
| 7 | `npm run build` 성공, lint 0, typecheck 0 | ✅ Met | Vercel 빌드 로그 3회 전부 통과 |
| 8 | ARCHITECT §4.1 정정 반영 | ✅ Met | ARCHITECT.md D7 |
| 9 | Preview 검증 통과 후 develop→main PR 병합 | ⏳ 다음 단계 | 사이클 종료 절차(RULE.md) 몫 — 본 Report 확정 직후 진행 |

**Success Rate**: 7/9 완전 충족 + 1/9 의도된 Partial(승인된 대체) + 1/9 절차상 다음 단계(실패 아님) — **실패 0건**.

## 1.5 Decision Record Summary

| 출처 | 결정 | 준수 | 결과 |
| --- | --- | :-: | --- |
| [Design D-G] | 셀 단위 낙관적 갱신 + 저장 중 잠금, 리스트 전체 스냅샷 복원 금지 | ✅→강화 | 최초 구현은 "행 전체 반영" 잔여 레이스(G-3)가 있었으나 Check 단계에서 "그 필드만 반영"으로 재설계해 레이스 클래스 자체를 제거 |
| [Design D-D] | 번호 3-state를 REST 하위 리소스(PUT/DELETE)로 분리 | ✅ | 서버는 처음부터 정확했으나, 그 위 UI(`NumberCell`)의 dirty-check이 UNSUPPORTED→행없음 전이를 막고 있었다(G-1, Critical) — Check에서 발견·수정 |
| [Design D-E] | 타 owner 접근은 404(403 아님) | ✅ | 그대로 준수, 편차 없음 |
| [Design D-A] | 검색→추가는 기존 add-entry 엔드포인트 재사용 | ⚠️→✅ | 재사용 결정 자체는 Design §6.2가 "결정 필요"로 미뤄뒀던 것을 module-4에서 확정했다. 그런데 그 전제였던 `findByOwnerBrandNumber`에 owner 필터가 없어(first-take부터의 결함) 타 owner 충돌 시 중복 stub이 생길 수 있었다(G-2) — Check에서 발견·수정 |
| [Design D-H] | trgm 인덱스 재사용, 마이그레이션 없음 | ✅ | `EXPLAIN` 실측 그대로 준수 |
| [Plan] | 검색·표·가드강제를 한 사이클로 묶는다(같은 접점) | ✅ | 3건 다 `songs` 쓰기 경로 하나에 걸려 있었고, 실제로 한 사이클에서 상호 의존이 드러났다(D-A가 owner 필터 결함을 노출시킨 것처럼) |

편차 2건(D-G의 잔여 레이스, D-A 전제의 기존 결함) 모두 **Check 단계 자체 발견 → 원 설계보다 안전한 방향으로 즉시 수정**됐다. Report까지 오염되지 않았다.

---

## 2. 관련 문서

| 단계 | 문서 | 상태 |
| --- | --- | --- |
| Plan | [expand-song-catalog.plan.md](./expand-song-catalog.plan.md) | ✅ Finalized |
| Design | [expand-song-catalog.design.md](./expand-song-catalog.design.md) | ✅ Finalized |
| Check | [expand-song-catalog.analysis.md](./expand-song-catalog.analysis.md) | ✅ Complete |
| Act | 본 문서 | ✅ Complete |

---

## 3. 완료 항목

### 3.1 기능 요구사항

| ID | 요구사항 | 상태 |
| --- | --- | :-: |
| FR-01~03 | 통합검색 매칭·owner 스코프·인덱스 대응 | ✅ Complete |
| FR-04~08 | AVAILABLE 한정 추가·PC 표 헤더·정렬·인라인 수정·낙관적 UI | ✅ Complete |
| FR-09~10 | 3-state 규칙·NULL 정규화 | ✅ Complete (G-1 수정 포함) |
| FR-12~13 | `updated_at` 명시 갱신·타 owner 수정 차단 | ✅ Complete |
| FR-14~15 | 가드 누락 도구 검출·자체 실증 | ✅ Complete |
| FR-16~17 | L1 신규 케이스·ARCHITECT 정정 | ✅ Complete |

### 3.2 비기능 요구사항

| 항목 | 목표(Plan §3.2) | 실측(L1, Preview) | 상태 |
| --- | --- | --- | :-: |
| 검색 응답성 | 1.5초 이내(워밍) | 459~1358ms | ✅ |
| 쓰기 응답성 | 5초 이내 | 최대 3.9초(`#17`) | ✅ |
| 데이터 격리 | 검색·수정 어떤 경로로도 타 owner 미노출 | L1 `#14`·`#15` + G-2 회귀 테스트 | ✅ |
| 인증 계약 | 신규 라우트 전부 401 + `UNAUTHORIZED` | L1 `#10` | ✅ |
| 모바일 UX | 검색→추가 2탭 이내 | 코드 근거 예상치(Plan에서 사전 승인) | ✅ |

### 3.3 산출물

| 산출물 | 위치 | 상태 |
| --- | --- | :-: |
| 가드 wrapper | `src/presentation/auth/with-auth.ts` | ✅ 신규 |
| 읽기 포트/어댑터 | `src/application/ports/song-query.ts`, `drizzle-song-query.ts` | ✅ 신규 |
| 쓰기 포트 확장 | `src/application/ports/song-repo.ts`, `drizzle-song-repo.ts` | ✅ 수정 |
| 유스케이스 4종 | `search/list/update-song-meta/set-song-number` | ✅ 신규 |
| API 라우트 4개 | `src/app/api/songs/**` | ✅ 신규 |
| 기존 라우트 5개 | `sessions/entries` 하위 | ✅ `withAuth()` 이관 |
| 모바일 검색 화면 | `(app)/songs/search`, `SearchBox`, `SearchResults` | ✅ 신규 |
| PC 곡 관리 표 | `(app)/songs`, `SongTable`, `InlineCell`, `NumberCell` | ✅ 신규 |
| ESLint 가드 규칙 | `eslint.config.mjs` `apiRouteGuard` | ✅ 신규(G-4로 glob 보강) |
| L1 스크립트 | `scripts/run-l1.mjs` `#10~#19` | ✅ 수정 |
| 유닛 테스트 | `tests/song-schemas.test.ts`, `song-use-cases.test.ts` | ✅ 신규(15건, G-2 회귀 1건 포함) |
| ARCHITECT 정정 | `docs/architect/ARCHITECT.md` §4.1, D7 | ✅ 수정 |

커밋: `b14b6e7`(module-1) → `018975d`(module-2~6) → `5de1977`(헤더 수정) → `7c63d57`(Gap 4건 수정), develop에 push 완료.

---

## 4. 미완료/이월 항목

### 4.1 다음 조치 필요 (백로그 후보 — 사용자 승인 시 backlog-sync)

| 항목 | 사유 | 우선순위 |
| --- | :-- | :-: |
| Design §2.2/§4.1 `brand` 파라미터 문서-코드 불일치 정정(G-5) | 서버가 `brand`를 파싱만 하고 미사용 — 결과는 동일하나 문서가 오해를 유발 | Low |
| Plan→Design 표류 기록(G-6, 표 내부 검색 방식) | Plan은 "서버 검색 재사용", Design은 "클라이언트 필터"로 무기록 변경 — 실해 없으나 결정 기록 누락 | Low |
| 잠긴 셀 편집 시도 피드백 부재(G-7) | 저장 중 셀을 눌러도 아무 반응이 없다 — 토스트나 커서 변경 등 최소 피드백 검토 | Low |

### 4.2 M2+ 이월 (Plan에서 이미 범위 밖으로 결정된 것)

| 항목 | 사유 |
| --- | --- |
| §5.4 지난 플리 가져오기 | 백로그 `27178302` 나머지 절반. 사본 복사 정책까지 걸려 별도 사이클 |
| §5.2 브랜드 변환 3분기 완성(번호 입력 제안→AVAILABLE 전환) | 이번엔 AVAILABLE 분기만(D-A). 나머지 분기는 다음 사이클 |
| 쓰기 경로 커넥션 재사용(백로그 `baea17b1`) | 4초대 지연은 이번에도 그대로 — 근본 개선은 별건 |

---

## 5. 품질 지표

### 5.1 최종 분석 결과

| 지표 | 목표 | 최종 | 변화 |
| --- | --- | --- | --- |
| Match Rate | 90% | 98% | +8%p |
| Structural | — | 100% | — |
| Functional | — | 98%(수정 전 88%) | +10%p |
| Contract | — | 95% | — |
| Runtime(L1) | — | 19/19 × 3회 | — |
| 유닛 테스트 | — | 30/30 | — |
| ESLint 계층 경계 위반 | 0 | 0 | — |
| build/lint/typecheck | 0 에러 | 0 에러(Vercel 로그 기준) | — |

### 5.2 해결된 이슈

| 이슈 | 등급 | 조치 | 결과 |
| --- | :-: | --- | --- |
| G-1 — UNSUPPORTED→행없음 UI 도달 불가 | Critical | dirty-check을 문자열 비교→"실제 타이핑했는가"(touched) 플래그로 전환 | ✅ 해결 |
| G-2 — owner 필터 없는 곡 조회로 중복 stub 위험 | Important | `findByOwnerBrandNumber`를 owner 포함 join으로 재작성 | ✅ 해결 + 회귀 테스트 |
| G-3 — 같은 행 셀 간 응답 역전 레이스 | Important | 응답 반영을 "행 전체"→"확정된 그 필드 하나"로 단순화 | ✅ 해결 |
| G-4 — ESLint 가드 glob 사각지대 | Important | `src/app/api/**`→`src/app/**`로 확장 | ✅ 해결 |

---

## 6. 회고 (Lessons Learned)

### 6.1 잘된 것 (Keep)

- **gap-detector 독립 검증이 이번에도 실제 결함을 잡았다.** 특히 G-1은 유닛 테스트가 `useCases.clearSongNumber`를 직접 호출하는 방식이라 절대 못 잡는 종류의 버그(UI 상태 판정 로직 자체의 문제)였다 — 코드를 처음부터 다시 읽는 별도 에이전트가 아니었다면 배포 후에나 발견됐을 것이다.
- **module-1을 가장 먼저, 배포까지 마치고 다음으로 넘어간 전략이 다시 유효했다.** 가드 강제 수단을 세운 뒤 라우트를 늘렸기 때문에 module-3의 신규 라우트 4개가 처음부터 규칙의 보호를 받았다.
- **Design 단계에서 `EXPLAIN`을 실제로 돌려 확인한 것이 옳았다.** 인덱스가 "당연히 쓰일 것"이라는 추정 대신 owner 스코프에서는 안 쓰인다는 걸 먼저 알았기 때문에, 마이그레이션을 만들지 않기로 한 결정에 실측 근거가 붙었다.

### 6.2 개선 필요 (Problem)

- **Design의 Impact Analysis(§6.2)가 "재사용 여부는 Design에서 결정"이라고 적어놓고 실제로는 결정하지 않았다.** 그 미결 항목이 Do 단계(module-4)까지 조용히 넘어갔고, 그 안에서 우연히 잡히지 않았다면 검색→추가 경로 자체가 미정의 상태로 구현될 뻔했다.
- **Design §5.3의 코드 스케치 자체에 잔여 레이스(G-3)가 있었다.** 스케치가 상세할수록 "이미 설계에서 다 생각했다"는 착각이 생기기 쉽다 — 상세한 스케치일수록 Check 단계에서 한 번 더 의심해야 한다.

### 6.3 다음에 시도할 것 (Try)

- Design의 Impact Analysis에 "미결 항목"을 적을 때는, 그걸 Decision Record(§2.3)에 플레이스홀더로도 남겨서 Do 단계 진입 전에 강제로 닫히게 하는 습관을 들인다.
- 컴포넌트 단위 테스트 도구가 없는 이 프로젝트에서, UI 상태 판정 로직(3-state, dirty-check류)만큼은 순수 함수로 뽑아내 유닛 테스트가 가능하게 만드는 걸 다음 사이클에서 검토한다(이번엔 시간상 gap-detector의 코드 리뷰에 의존했다).

---

## 7. 프로세스 개선 제안

### 7.1 PDCA 프로세스

| 단계 | 현재 | 개선 제안 |
| --- | --- | --- |
| Design | Impact Analysis의 미결 항목이 Decision Record에 자동으로 안 옮겨짐 | Design 문서 작성 체크리스트에 "Impact Analysis의 모든 '결정 필요' 항목이 §2.3에 반영됐는가" 항목 추가 |
| Check | gap-detector 독립 검증이 이번에도 유효했음 | 유지 — 특히 UI 상태 로직처럼 유닛 테스트가 못 미치는 영역은 계속 이 경로로 검증 |

### 7.2 도구/환경

| 영역 | 개선 제안 | 기대 효과 |
| --- | --- | --- |
| 로컬 검증 규약 | 이번 사이클 중 `.claude/CLAUDE.md`가 "tsc/eslint도 Vercel 빌드 로그로 확인"으로 개정됨(vitest만 로컬 유지) | 로컬 리소스 부담 추가 감소, 다음 사이클부터 적용 |

---

## 8. Next Steps

### 8.1 즉시 (사이클 종료 절차, RULE.md 기준)

- [ ] `docs/PDCA/_INDEX.md`에 행 추가
- [ ] 최신 태그 확인(`v1.0.1`) 후 다음 버전(`v1.1.0`) 사용자 확인
- [ ] `npx pdcaw@latest upload --cycle expand-song-catalog --version v1.1.0`
- [ ] README.md 최신화
- [ ] docs 문서(본 4종 + ARCHITECT.md 정정) + README 커밋 1개 (develop)
- [ ] develop 푸시 → PR(develop→main, Merge commit) 생성 → 병합 (병합 전 확인)
- [ ] 최종 커밋에 `v1.1.0` 태그 → 푸시 (푸시 전 확인)
- [ ] develop에 main 병합(정렬)
- [ ] 태그 diff를 프로젝트 폴더에 txt로 저장(커밋 안 함)

### 8.2 다음 PDCA 사이클

| 항목 | 우선순위 | 비고 |
| --- | :-: | --- |
| M2 나머지: 지난 플리 가져오기·브랜드 변환 3분기 (백로그 `27178302`) | High | 이번 사이클이 owner 스코프·가드 인프라를 다졌으므로 그 위에서 시작 가능 |
| 쓰기 경로 커넥션 재사용 검토 (백로그 `baea17b1`) | Medium | 여전히 열려 있음 |
| G-5·G-6·G-7 문서 정정·최소 피드백 | Low | 사용자 승인 시 backlog-sync |

---

## 9. Changelog

### v1.1.0 (2026-08-23, 예정)

**Added:**
- 통합검색(`GET /api/songs/search`) — title·artist·memo 결합 매칭, owner 스코프
- PC 곡 관리 표(`GET/PATCH /api/songs`, `PUT/DELETE /api/songs/:id/numbers/:brand`) — 셀 단위 낙관적 갱신
- 모바일 검색 화면, 검색 결과에서 AVAILABLE 곡 오늘의 플리 추가(기존 엔드포인트 재사용)
- API 라우트 인증 가드 강제 — `withAuth()` wrapper + ESLint `no-restricted-syntax` 2규칙

**Changed:**
- 기존 API 라우트 5개가 `withAuth()` 형태로 이관(동작 무변경)
- `AppHeader`에 검색·곡 관리·홈 진입점 추가
- ARCHITECT.md §4.1 `idx_songs_trgm` 표기를 실제 구현(결합 표현식 GIN)에 맞게 정정

**Fixed:**
- 번호 셀에서 "미지원" 상태를 "행 없음"으로 되돌릴 수 없던 결함(UI dirty-check 로직)
- owner 필터 없는 곡 조회로 인한 중복 stub 생성 가능성(first-take부터의 결함)
- 표에서 같은 행 두 셀을 거의 동시에 고칠 때의 응답 역전 레이스
- API 가드 강제 ESLint 규칙의 glob 사각지대

---

## Version History

| 버전 | 날짜 | 변경 | 작성자 |
| --- | --- | --- | --- |
| 1.0 | 2026-08-23 | 최초 작성. Check(98%) 완료 후 Report 확정 | Claude |
