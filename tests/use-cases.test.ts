// Design Ref: §8.3 — UC-1~8. module-3 범위: 유스케이스가 실 Neon 트랜잭션 위에서 도는지 검증.
import { DomainError } from "@/domain";
import { beforeAll, describe, expect, it } from "vitest";
import { resetAndSeed, SEED_USERS } from "../src/infrastructure/db/seed";
import { activateTestDatabase } from "./support/db";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);

// activateTestDatabase()가 동적 import 직전에 DATABASE_URL을 TEST_DATABASE_URL로
// 바꿔치기하므로 이 스위트는 상용 DB를 절대 건드리지 않는다.
describe.skipIf(!hasDb)("유스케이스 (Design §8.3)", () => {
  let db: (typeof import("../src/infrastructure/db/client"))["db"];
  let useCases: typeof import("../src/presentation/container").useCases;
  let seed: Awaited<ReturnType<typeof resetAndSeed>>;

  beforeAll(async () => {
    activateTestDatabase();
    ({ db } = await import("../src/infrastructure/db/client"));
    ({ useCases } = await import("../src/presentation/container"));
    seed = await resetAndSeed(db);
  });

  it("UC-1: 미등록 번호로 추가하면 stub 곡 + entry가 생성된다", async () => {
    const result = await useCases.addEntryByNumber({
      ownerId: SEED_USERS.a,
      sessionId: seed.sessions.open,
      number: "99999",
    });
    expect(result.isNewStub).toBe(true);
    expect(result.entry.position).toBe(4); // seed에 이미 3건
    // API 응답이 song 정보를 함께 반환해야 클라이언트가 즉시 렌더링 가능 (Design §4.2 계약)
    expect(result.song).toEqual({ id: result.entry.songId, title: null, number: "99999" });

    const current = await useCases.getCurrentSession(SEED_USERS.a);
    const added = current?.entries.find((e) => e.id === result.entry.id);
    expect(added?.song.title).toBeNull();
    expect(added?.song.number).toBe("99999");
  });

  it("UC-2: 기존 곡 번호로 추가하면 새 songs 행 없이 entry만 늘어난다", async () => {
    const before = await useCases.getCurrentSession(SEED_USERS.a);
    const beforeCount = before!.entries.length;

    const result = await useCases.addEntryByNumber({
      ownerId: SEED_USERS.a,
      sessionId: seed.sessions.open,
      number: "11111", // seed의 normalSong TJ 번호
    });
    expect(result.isNewStub).toBe(false);
    expect(result.entry.songId).toBe(seed.songs.normal);
    expect(result.song).toEqual({ id: seed.songs.normal, title: "기존 곡", number: "11111" });

    const after = await useCases.getCurrentSession(SEED_USERS.a);
    expect(after!.entries.length).toBe(beforeCount + 1);
  });

  it("UC-3: 같은 번호로 2회 추가하면 entry가 2건 생긴다 (중복 허용)", async () => {
    const before = await useCases.getCurrentSession(SEED_USERS.a);
    const beforeCount = before!.entries.length;

    await useCases.addEntryByNumber({
      ownerId: SEED_USERS.a,
      sessionId: seed.sessions.open,
      number: "11111",
    });
    await useCases.addEntryByNumber({
      ownerId: SEED_USERS.a,
      sessionId: seed.sessions.open,
      number: "11111",
    });

    const after = await useCases.getCurrentSession(SEED_USERS.a);
    expect(after!.entries.length).toBe(beforeCount + 2);
  });

  it("UC-4: 닫힌 세션에 추가하면 SESSION_CLOSED", async () => {
    await expect(
      useCases.addEntryByNumber({
        ownerId: SEED_USERS.a,
        sessionId: seed.sessions.closed,
        number: "11111",
      }),
    ).rejects.toMatchObject({ code: "SESSION_CLOSED" satisfies DomainError["code"] });
  });

  it("UC-5: 타인 세션에 추가하면 SESSION_NOT_FOUND", async () => {
    await expect(
      useCases.addEntryByNumber({
        ownerId: SEED_USERS.b,
        sessionId: seed.sessions.open,
        number: "11111",
      }),
    ).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" satisfies DomainError["code"] });
  });

  it("UC-6: 점수는 97.52/null로 저장되고 150은 INVALID_SCORE", async () => {
    const entryId = seed.entries[0];

    const updated = await useCases.updateEntryScore({
      ownerId: SEED_USERS.a,
      entryId,
      score: 97.52,
    });
    expect(updated.score).toBe("97.52");

    const cleared = await useCases.updateEntryScore({
      ownerId: SEED_USERS.a,
      entryId,
      score: null,
    });
    expect(cleared.score).toBeNull();

    await expect(
      useCases.updateEntryScore({ ownerId: SEED_USERS.a, entryId, score: 150 }),
    ).rejects.toMatchObject({ code: "INVALID_SCORE" satisfies DomainError["code"] });
  });

  it("UC-7: 목록과 불일치하는 id 배열로 재정렬하면 INVALID_POSITION_SET", async () => {
    await expect(
      useCases.reorderEntries({
        ownerId: SEED_USERS.a,
        sessionId: seed.sessions.open,
        entryIds: ["00000000-0000-0000-0000-000000000000"],
      }),
    ).rejects.toMatchObject({ code: "INVALID_POSITION_SET" satisfies DomainError["code"] });
  });

  it("UC-8: 열린 세션이 없으면 getCurrentSession은 null을 반환한다 (에러 아님)", async () => {
    const result = await useCases.getCurrentSession(SEED_USERS.b);
    expect(result).toBeNull();
  });
});
