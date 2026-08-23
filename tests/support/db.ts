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

/**
 * Check Gap-6 — TEST_DATABASE_URL이 없으면 DB 스위트가 통째로 skip되고 결과는 초록으로 남는다.
 * 초록이 "SELECT를 확인했다"는 뜻이 아니라는 사실이 어디에도 안 보이던 것을 여기서 한 번 외친다.
 * 실패로 바꾸지는 않는다 — DB 없이 순수 함수만 돌리는 것은 정당한 사용법이기 때문이다.
 */
let warned = false;
export const hasTestDatabase: boolean = Boolean(process.env.TEST_DATABASE_URL);

export function warnIfNoTestDatabase(suite: string): boolean {
  if (!hasTestDatabase && !warned) {
    warned = true;
    console.warn(
      `\n⚠️  TEST_DATABASE_URL이 없어 DB 스위트를 건너뜁니다 (${suite} 외). ` +
        `이 실행의 초록색은 DB 쿼리를 아무것도 보증하지 않습니다.\n`,
    );
  }
  return hasTestDatabase;
}
