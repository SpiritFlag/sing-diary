// Design Ref: §3.4 (v0.3 개정) — 읽기 전용 클라이언트. Neon HTTP 드라이버(무상태).
// 서버리스 함수 재사용 구간에서 WebSocket Pool을 모듈 싱글턴으로 물고 있으면
// 연결이 끊긴 채 재사용되어 "Connection terminated unexpectedly"가 발생한다
// (프로덕션에서 실제로 재현됨). 트랜잭션이 필요한 쓰기는 transaction-client.ts가
// 요청마다 별도 Pool을 만들었다 닫는 방식으로 처리한다.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export const db = drizzle(neon(connectionString), { schema });
export type Database = typeof db;
