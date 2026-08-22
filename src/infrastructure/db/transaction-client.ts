// Design Ref: §3.4 (v0.4 개정) — R1 해소. neon-serverless(ws) Pool은 Vercel 전통
// 서버리스 함수의 freeze/thaw 사이에 ws의 백그라운드 heartbeat 타이머가 죽은
// 소켓에 프레임을 쓰려다 "TypeError: b.mask is not a function"으로 프로세스가
// 죽는 문제가 실제로 재현됨 — 요청마다 새 Pool을 만들어도 재발했다(freeze 자체가
// 원인이라 pool 재사용 여부와 무관). ws 대신 순수 TCP(pg)로 전환 — 서버리스+
// Postgres에서 검증된 표준 패턴. 연결은 트랜잭션 하나당 열었다 바로 닫는다.
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

type TxDb = ReturnType<typeof drizzle<typeof schema, Client>>;
export type TxHandle = Parameters<Parameters<TxDb["transaction"]>[0]>[0];

export async function runInTransaction<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const txDb = drizzle(client, { schema });
    return await txDb.transaction(fn);
  } finally {
    await client.end();
  }
}
