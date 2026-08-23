# docs/RULE.md

## PDCA 문서

- 문서에서 사용자는 "사용자"로 호칭한다.
- **경로: `docs/PDCA/YYYY-MM/{feature}/` — Plan 단계부터 이 최종 위치에 바로 쓰고,
  사이클이 끝나도 이동하지 않는다.** bkit 기본 룰(`docs/01-plan/` → archive 이동)은
  따르지 않는다 — 이동이 없으면 상대링크가 깨질 일이 없고 경로 깊이도 사이클 내내
  고정된다.
- 파일명은 전체명: `{feature}.plan.md`, `{feature}.design.md`, … — 디렉터리가
  feature명을 담고 있어도 파일 단독으로 자기식별되고 파일명 grep 추적이 가능해야 한다.
- **표준 문서는 `plan` → `design` → `analysis` → `report` 4종만 작성한다** (작성 순서도
  이 순서). 이 밖의 PDCA 문서는 만들지 않는다. 인덱스는 `docs/PDCA/_INDEX.md` 단일
  파일(월별 분리 없음, 행에 날짜).
- **질문이 생기면 표준 문서가 아니라 `.tmp` 확장자 파일로 만들어 사용자에게 답을 받고,
  답을 반영한 뒤 그 파일은 삭제한다.**
- 코드리뷰 등 PDCA 밖 문서는 `docs/code-review/` 같은 최상위 주제 디렉터리에 둔다.
- **모든 문서는 한국어로만, `.md` 확장자로 작성한다.** 영문 번역본(`.en.md`)은 만들지
  않는다.
- 문서 개정 시 **Version History 표에 행을 추가**한다(무엇이 왜 바뀌었는지 한 줄).
- **PDCA 문서는 사이클 종료 전에 커밋하지 않는다.** 사이클 안에서 여러 번 개정되므로
  종료 시점의 확정본을 docs 커밋 1개로 정리한다. 코드(구현)는 이 규칙과 무관하게
  평소처럼 커밋한다 — 대상은 PDCA 문서 자체다.

### **사이클 종료 절차** (archive 단계의 대체 — 이동 없이 검증·확정만)

> 전제: main은 직푸시 금지, `develop → PR → main`으로만 병합한다.
> PR 병합 방식은 **Merge commit**이다. Squash는 커밋 SHA를 바꿔 태그가 main 히스토리
> 밖에 남고 백머지 시 중복 커밋을 만들므로 사용하지 않는다.
> (GitHub Settings → General → Pull Requests에서 Squash / Rebase 비활성)

0. PDCA 문서에 사이클 종료 절차를 TODO로 기록하지 않음

1. `docs/PDCA/_INDEX.md`에 행 추가

2. 최신 태그를 확인하고 다음 버전 번호를 추천하여 사용자의 확인을 받고 확정
   - `git describe --tags --abbrev=0`로 직전 태그가 기대값인지 확인한다.
   - annotated tag이므로 태그가 가리키는 **실제 커밋**은
     `git rev-parse <태그>^{}`로 확인한다. `git tag -l --format='%(objectname)'`는
     커밋이 아니라 태그 객체의 SHA를 출력하므로 그대로 믿지 않는다.

3. **`npx pdcaw@latest upload --cycle <사이클명> --version <버전>`** 으로 릴리즈 생성 +
   변경 문서 업로드를 한 번에 처리한다 (릴리즈 노트는 공란 — 웹 UI에서 사용자가 직접 작성).
   - **develop 또는 develop에서 분기한 브랜치에서 실행한다.** 실행 전
     `git describe --tags --abbrev=0`로 직전 태그가 기대값인지 확인한다.
   - pdcaw는 태그 존재를 전제하지 않으므로 태그를 달기 전에 실행해도 된다.
   - **MCP `document_write`를 직접 호출하지 않는다** — 본문 재타이핑은 토큰 낭비이자
     오타 위험. `pdcaw`는 파일을 그대로 읽어 보내므로 본문이 LLM을 경유하지 않는다.
   - 대상은 최신 태그 이후 변경된 **`docs/` 전체**(PDCA 형식 경로 + 그 밖의 `.md` 문서
     모두) — 이전 사이클 사후개정분도 자동 포함되므로 따로 기억할 필요 없다.
     `docs/` 하위에는 서버에 올라가도 되는 문서만 둔다.
   - 사이클 중간에 문서만 동기화하려면 `--version` 없이 실행한다.
   - `baseUrl`/`projectId`는 저장소에 커밋된 `.pdcarc.json`에서 읽는다. PAT만
     `.env.local`의 `PDCAW_PAT`로 별도 관리한다.
   - `pdcaw`가 breaking release로 갱신돼 위 명령이 실패하면, 마지막으로 정상 동작을
     확인한 버전으로 고정해 재시도한다: `npx pdcaw@0.2.0 upload --cycle <사이클명>
     --version <버전>`.

4. README.md 최신화

5. docs 문서 + README.md 커밋 1개 (develop)

6. **develop 푸시 → PR(develop → main) 생성 → Merge commit으로 병합** (병합 전 확인받기)
   - `git push origin develop`
   - `gh pr create --base main --head develop --title "release: <사이클명> <버전>"`
   - status check(Vercel 빌드, PR Source Guard) 통과를 확인한 뒤 병합한다.
   - Merge commit 방식이므로 develop의 커밋 SHA가 그대로 main에 보존된다.

7. **마지막 커밋에 버전 번호로 태그 달아 푸시하기** (푸시할때 확인받기)
   - 태그 대상은 사이클의 최종 산출 커밋(보통 5번의 문서 커밋)이다.
     Merge commit 방식이라 이 커밋은 develop과 main 양쪽에서 동일한 SHA로 존재하므로
     병합 전후 어느 시점에 달아도 무방하다.
   - `git tag -a <버전> -m "<사이클명> 사이클 완료 — <요약>"`
   - `git push origin <버전>`
   - 검증: `git rev-parse <버전>^{}`가 기대한 커밋인지, 그리고 그 커밋이
     `git branch -a --contains <버전>` 결과에 main과 develop 모두 포함되는지 확인한다.

8. **develop에 main 병합** — PR 병합 커밋을 develop으로 되돌려 두 브랜치를 정렬한다.
   - `git checkout develop && git fetch origin && git merge origin/main`
   - Merge commit 방식에서는 중복 커밋이 생기지 않고 머지 커밋 하나만 추가된다.
   - `git push origin develop`
   - 검증: `git log --oneline --graph --all -15`에서 갈라진 가지가 남아 있지 않은지 본다.
   - ⚠️ 만약 향후 Squash 병합으로 되돌린다면 이 단계는 **금지**된다.
     Squash는 SHA를 바꾸므로 백머지 시 같은 내용의 커밋이 두 벌 생긴다.
     그 경우 `git reset --hard origin/main` + `git push --force-with-lease`로 대체한다.

9. git tag 기준으로 기존의 최신 태그와 이번 사이클 태그 사이의 git diff를 프로젝트 폴더에
   txt 파일로 저장 (txt는 커밋하지 않음)
    - 파일명: 태그_커밋해시 (사이클명, 완료일).txt
    - 파일명 예시: v0.1.0_1de8wkf (test-cycle, 2026-08-09).txt
