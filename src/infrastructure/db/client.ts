// Design Ref: §3.4 — R1 해소: WebSocket Pool + db.transaction() 지원 드라이버
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });
export type Database = typeof db;
