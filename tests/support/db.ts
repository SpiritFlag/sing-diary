// 테스트는 절대 상용 DATABASE_URL을 건드리지 않는다 — 반드시 별도 Neon 브랜치(TEST_DATABASE_URL)로 돈다.
// client.ts/transaction-client.ts는 그대로 두고, 그 모듈들이 처음 동적 import되기 직전에
// 이 함수로 process.env.DATABASE_URL을 테스트 브랜치 값으로 바꿔치기한다.
export function activateTestDatabase(): void {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error(
      "TEST_DATABASE_URL is not set — 테스트는 상용 DB가 아닌 별도 Neon 브랜치를 써야 한다",
    );
  }
  process.env.DATABASE_URL = testUrl;
}
