# sing-diary

노래방 점수 기록 서비스. 노래방 방문을 세션 단위로 기록하고, 부른 곡의 순서·번호·점수를 관리한다.

- 배포: [sing-diary.spiritflag.work](https://sing-diary.spiritflag.work)
- 아키텍처: [docs/architect/ARCHITECT.md](docs/architect/ARCHITECT.md)
- 첫 릴리스(v1.0.0) 산출물: [docs/PDCA/2026-08/first-take/](docs/PDCA/2026-08/first-take/)

## 기술 스택

| 영역 | 선택 |
| --- | --- |
| 프레임워크 | Next.js 15 (App Router) |
| 배포 | Vercel |
| 데이터베이스 | Neon PostgreSQL |
| ORM | Drizzle |
| 인증 | Clerk |
| 스타일 | Tailwind CSS (다크 파스텔) |
| 아키텍처 | 클린 아키텍처 4계층 (domain / application / infrastructure / presentation) |

## 시작하기

```bash
npm install
cp env.example .env.local   # 값을 채운다 (아래 표 참고)
npm run db:migrate
npm run dev
```

### 환경변수

`env.example` 참고. 요약:

| 변수 | 용도 |
| --- | --- |
| `DATABASE_URL` | Neon pooled connection string |
| `TEST_DATABASE_URL` | 테스트 전용 Neon **브랜치** — `DATABASE_URL`과 반드시 다른 DB (`npm test`가 매번 초기화함) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Clerk 인증 |
| `NEXT_PUBLIC_CLERK_DOMAIN` | 프로덕션 커스텀 도메인 배포 시 필요 (Clerk 7.x same-origin 자동 프록시 방지) |
| `PDCAW_PAT` | PDCA 사이클 종료 절차(`pdcaw upload`) 전용, 로컬 전용 |

## 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` / `npm run build` | 개발 서버 / 프로덕션 빌드 |
| `npm run typecheck` / `npm run lint` | 타입체크 / lint |
| `npm test` | Vitest — DB 불변식 + 유스케이스 테스트 (`TEST_DATABASE_URL` 대상) |
| `npm run db:generate` / `npm run db:migrate` | Drizzle 마이그레이션 생성 / 적용 |
| `npm run l1` | 실제 Clerk 세션을 발급해 인증 API까지 검증하는 스크립트 (`scripts/run-l1.mjs`) |

## 브랜치·문서 규약

[CONTRIBUTING.md](CONTRIBUTING.md), [docs/RULE.md](docs/RULE.md) 참고.
