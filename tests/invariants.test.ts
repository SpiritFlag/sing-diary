// Design Ref: §8.2 — INV-1~4. module-2 범위이므로 유스케이스(module-3) 대신
// 스키마 제약과 트랜잭션 패턴(§3.4)을 직접 검증한다.
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { entries, sessions, songNumbers } from "../src/infrastructure/db/schema";
import { resetAndSeed, SEED_USERS, type SeedResult } from "../src/infrastructure/db/seed";
import type { Database } from "../src/infrastructure/db/client";
import type { runInTransaction as RunInTransaction } from "../src/infrastructure/db/transaction-client";

const hasDb = Boolean(process.env.DATABASE_URL);

// client.ts는 import 시점에 DATABASE_URL을 요구하므로, 없는 환경(단위테스트만 도는 CI 등)에서
// 이 스위트 자체가 로드 실패하지 않도록 실제 client 모듈만 동적 import로 지연시킨다.
describe.skipIf(!hasDb)("DB 불변식 (Design §8.2)", () => {
  let db: Database;
  let runInTransaction: typeof RunInTransaction;
  let seed: SeedResult;

  beforeAll(async () => {
    const { db: realDb } = await import("../src/infrastructure/db/client");
    ({ runInTransaction } = await import("../src/infrastructure/db/transaction-client"));
    db = realDb;
    seed = await resetAndSeed(db);
  });

  it("INV-1: 열린 세션 보유 중 두 번째 열린 세션 INSERT는 유니크 위반", async () => {
    await expect(
      db.insert(sessions).values({
        ownerId: SEED_USERS.a,
        visitDate: "2026-08-23",
        venue: "또다른노래방",
        brand: "TJ",
        closedAt: null,
      }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("INV-2: AVAILABLE인데 number NULL이면 CHECK 위반", async () => {
    // stub 곡(§8.5)은 song_numbers 행이 없으므로 PK 충돌 없이 CHECK만 단독 검증된다
    await expect(
      db.insert(songNumbers).values({
        songId: seed.songs.stub,
        brand: "KY",
        number: null,
        status: "AVAILABLE",
      }),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  it("INV-3: 세션 전환(종료+생성)이 하나의 트랜잭션으로 원자 처리된다", async () => {
    const before = await db.query.sessions.findFirst({
      where: and(eq(sessions.ownerId, SEED_USERS.a), isNull(sessions.closedAt)),
    });
    expect(before).toBeDefined();

    const created = await runInTransaction(async (tx) => {
      await tx
        .update(sessions)
        .set({ closedAt: new Date() })
        .where(and(eq(sessions.ownerId, SEED_USERS.a), isNull(sessions.closedAt)));
      const [inserted] = await tx
        .insert(sessions)
        .values({
          ownerId: SEED_USERS.a,
          visitDate: "2026-08-23",
          venue: "새노래방",
          brand: "KY",
          closedAt: null,
        })
        .returning();
      return inserted;
    });

    const openSessions = await db.query.sessions.findMany({
      where: and(eq(sessions.ownerId, SEED_USERS.a), isNull(sessions.closedAt)),
    });
    expect(openSessions).toHaveLength(1);
    expect(openSessions[0].id).toBe(created.id);

    const closedBefore = await db.query.sessions.findFirst({
      where: eq(sessions.id, before!.id),
    });
    expect(closedBefore?.closedAt).not.toBeNull();
  });

  it("INV-4: 재정렬 후 position 집합이 정확히 {1..N}", async () => {
    const seeded = await resetAndSeed(db);
    const sessionId = seeded.sessions.open;
    const newOrder = [...seeded.entries].reverse();

    await runInTransaction(async (tx) => {
      // 1단계: 충돌 회피 시프트
      await tx
        .update(entries)
        .set({ position: sql`${entries.position} + 1000` })
        .where(eq(entries.sessionId, sessionId));
      // 2단계: 새 순서대로 1..N 재부여
      for (let i = 0; i < newOrder.length; i++) {
        await tx
          .update(entries)
          .set({ position: i + 1 })
          .where(eq(entries.id, newOrder[i]));
      }
    });

    const result = await db.query.entries.findMany({
      where: eq(entries.sessionId, sessionId),
      orderBy: asc(entries.position),
    });
    expect(result.map((e) => e.position)).toEqual([1, 2, 3]);
    expect(result.map((e) => e.id)).toEqual(newOrder);
  });
});
