// Design Ref: §11.2 — 마이그레이션 러너 (로컬/CI/배포 공용)
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { db } from "./client";

async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("migrations applied");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
