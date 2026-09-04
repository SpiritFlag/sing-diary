# CONTRIBUTING.md

## 브랜치 운영 규약

| 브랜치 | 역할 | 직푸시 | 진입 경로 |
| --- | --- | :-: | --- |
| main | 공식 릴리즈 | **금지** | develop→main PR(Merge commit)만 |
| develop | 통합 · 개발 릴리즈(Vercel Preview) | 허용 | 사이클 · 패치 브랜치의 머지 |
| `{버전}-{사이클명}` | 사이클 · 패치 작업 | 허용 | develop에서 분기. `pdca-plan`이 만든다 |

신규 클론은 main이 체크아웃되므로 develop으로 전환한 뒤 사이클 브랜치를 판다. 자세한 절차는 `docs/RULE.md`와 pdca-skill 스킬이 안다.

## 커밋 규약

- 배치(B-n) 단위로 작업하고 배치가 끝날 때 커밋한다.
- 사이클 브랜치에서는 문서(`docs/PDCA/`)도 자유롭게 커밋한다. develop에는 `pdca-close`가 머지 커밋 하나로 넣는다.
- 원격 저장소로의 푸시는 사용자의 명시적인 지시가 있을 때만 수행한다. 사이클 브랜치 푸시도 마찬가지다.
