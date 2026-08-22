// Design Ref: §3.4 (v0.3 개정) — R1 해소. 트랜잭션은 요청마다 새 WebSocket Pool을
// 만들고 끝나면 닫는다. 모듈 싱글턴 Pool을 쓰지 않음으로써 서버리스 함수 재사용
// 구간의 죽은 연결 재사용 문제를 회피한다.
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

type TxDb = ReturnType<typeof drizzle<typeof schema>>;
export type TxHandle = Parameters<Parameters<TxDb["transaction"]>[0]>[0];

export async function runInTransaction<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({ connectionString });
  try {
    const txDb = drizzle(pool, { schema });
    return await txDb.transaction(fn);
  } finally {
    await pool.end();
  }
}
