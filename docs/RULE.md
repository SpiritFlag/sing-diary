# docs/RULE.md

이 프로젝트는 pdca-skill v1 체계를 따른다. 절차 본문은 스킬(`pdca-plan` `pdca-design` `pdca-do` `pdca-close` `cycle-propose` `backlog-sync`)이 정본이고, 이 파일은 **이 프로젝트만의 예외와 훅**만 담는다.

## 검증 수단

Plan §5의 SC에 붙일 수 있는 수단. 여기 없는 수단을 SC에 쓰지 않는다.

> 개발 머신은 RAM 1.9GB Lightsail이다(`.claude/CLAUDE.md`). `npm run build` · `typecheck` · `lint`는 로컬에서 돌리지 않는다. 타입 · 린트는 Vercel 빌드가 한다.

| 수단 | 방법 | 비고 |
|---|---|---|
| 자동 테스트 | `npm test -- tests/<관련파일>.test.ts` (배치 검증) · `npm test` 전체(close 게이트, 한 번만) | 테스트 위치 `tests/**/*.test.ts`. `.env.local`의 `TEST_DATABASE_URL`(전용 Neon 브랜치)에 붙어 4개 테이블을 초기화하고 재시딩한다 — 프로덕션 DB를 넣지 않는다. 무거운 프로세스는 한 번에 하나 |
| 타입 · 린트 | 브랜치 푸시 → Vercel Preview 빌드 로그("Linting and checking validity of types") | 로컬 실행 금지. 로그를 볼 수 없으면 사용자 확인 |
| 자동 테스트(느림·외부 자원) | `npm run l1` | Clerk 세션을 실제로 발급해 인증 API를 찌른다. 대상은 `L1_TARGET_URL`(기본 프로덕션, Preview면 `L1_VERCEL_BYPASS` 필요). SC 검증 수단이면 do §3에 실행 결과를 남긴다 |
| 사용자 육안 | 브랜치 푸시 후 Vercel Preview 또는 프로덕션 브라우저 | 사용자가 확인한 날짜를 do §3에 남긴다 |
| 로그·수치 | Vercel 함수 로그, `npm run l1`의 응답 시간 출력 | |

## 브랜치 · CI

- 통합 브랜치: `develop`. 릴리즈 브랜치: `main`. 사이클 브랜치는 `{버전}-{사이클명}`, develop에서 분기.
- **main은 직푸시 금지.** 릴리즈 전진은 ff가 아니라 **PR(develop → main)을 Merge commit으로 병합**하고, 병합 뒤 **develop에 main을 백머지**해 두 브랜치를 정렬한다. Squash · Rebase 병합은 쓰지 않는다(태그 SHA가 main 밖에 남고 백머지가 중복 커밋을 만든다).
  ```
  git push origin develop
  gh pr create --base main --head develop --title "release: {사이클명} {버전}"
  # status check 통과 확인 후 Merge commit 병합
  git switch develop && git fetch origin && git merge origin/main && git push origin develop
  ```
- 태그는 develop의 머지 커밋에 찍는다. Merge commit 방식이라 그 SHA가 main에도 그대로 있다. 검증: `git branch -a --contains {버전}`에 main과 develop 둘 다 나와야 한다.
- CI 확인 명령: GitHub Actions는 없다. 사이클 브랜치의 게이트는 **Vercel Preview 빌드 성공(사용자 확인)** + 로컬 `npm test` 전체 1회 통과. PR 단계는 `gh pr checks <PR번호>`(Vercel 빌드, PR Source Guard). Vercel이 사이클 브랜치의 Preview를 만들지 않게 설정돼 있으면 develop에 머지하기 전 브랜치 빌드를 볼 수 없으므로, Vercel 프로젝트 설정에서 모든 브랜치 Preview 빌드를 켜 둔다.

## 종료 훅

close 6단계(docs 커밋 직전)에 이 프로젝트가 추가로 하는 일.

1. `README.md`의 산출물 목록에 이번 사이클 행을 추가한다(버전 · 사이클명 · 폴더).

## 릴리즈노트

- 제목 이모지: 🎤
- 톤: 서비스 이용자 공지. 친근하고 공손하게, "-습니다" 체.
- 제품명: sing-diary

## 예외

- 스킬의 "배치마다 검증" 중 타입 · 린트 확인은 로컬 명령이 아니라 푸시 후 Vercel 빌드다. do 세션은 배치 커밋을 푸시하고 빌드 결과를 사용자에게 확인받아 do §3에 적는다.
- v1.2.0까지의 사이클 5개는 옛 배치 `docs/PDCA/2026-08/{사이클명}/`에 그대로 둔다. 옮기지 않는다. 서버에는 옛 경로로 올라가 있고 파서가 그대로 읽는다.
- 옛 사이클명의 접두어 `expand`는 과거 명칭이다. 새 사이클은 `explore` `adopt` `enhance` `refine` `fix` 중에서 고른다.
- `.bkit/`(bkit 상태 파일)은 폐기했다. 상태는 문서 헤더가 말한다.
