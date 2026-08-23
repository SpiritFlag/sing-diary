// Design Ref: expand-playlist-import §8.4 UC-1/UC-2 — 세션 읽기 경로와 songId 기반 추가를
// 실 Neon 트랜잭션 위에서 검증한다. activateTestDatabase()가 동적 import 직전에 DATABASE_URL을
// TEST_DATABASE_URL로 바꿔치기하므로 이 스위트는 상용 DB를 절대 건드리지 않는다.
//
// 순서 주의: 읽기 테스트(listSessions/getSessionDetail)가 먼저다. 뒤의 추가 테스트가 open 세션에
// 엔트리를 붙이므로 entryCount 기대값이 흔들린다. 시드는 beforeAll 1회다.
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { resetAndSeed, SEED_USERS } from "../src/infrastructure/db/seed";
import { songNumbers } from "../src/infrastructure/db/schema";
import { activateTestDatabase } from "./support/db";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

describe.skipIf(!hasDb)("세션 읽기·songId 추가 유스케이스 (Design §8.4)", () => {
  let db: (typeof import("../src/infrastructure/db/client"))["db"];
  let useCases: typeof import("../src/presentation/container").useCases;
  let seed: Awaited<ReturnType<typeof resetAndSeed>>;

  beforeAll(async () => {
    activateTestDatabase();
    ({ db } = await import("../src/infrastructure/db/client"));
    ({ useCases } = await import("../src/presentation/container"));
    seed = await resetAndSeed(db);
  });

  async function numberRowsOf(songId: string) {
    return db.query.songNumbers.findMany({ where: eq(songNumbers.songId, songId) });
  }

  it("listSessions: owner 스코프만·최신순·곡 수가 정확하다 (D-O)", async () => {
    const list = await useCases.listSessions(SEED_USERS.a);

    expect(list.map((s) => s.id)).not.toContain(seed.sessions.othersOwned);
    expect(list.map((s) => s.id)).toEqual([seed.sessions.open, seed.sessions.closed]); // visit_date DESC

    const open = list[0];
    expect(open.isOpen).toBe(true);
    expect(open.entryCount).toBe(3);
    expect(open.brand).toBe("TJ");

    const closed = list[1];
    expect(closed.isOpen).toBe(false);
    expect(closed.entryCount).toBe(2);
    expect(closed.venue).toBe("지난노래방");
  });

  it("listSessions: 엔트리가 0건인 세션도 목록에서 빠지지 않는다 (LEFT JOIN)", async () => {
    const list = await useCases.listSessions(SEED_USERS.b);
    expect(list.map((s) => s.id)).toEqual([seed.sessions.othersOwned]);
    expect(list[0].entryCount).toBe(0);
  });

  it("getSessionDetail (UC-2): entries가 position 순이고 곡마다 두 브랜드 키가 있다 (D-N 전제)", async () => {
    const detail = await useCases.getSessionDetail(SEED_USERS.a, seed.sessions.closed);

    expect(detail.brand).toBe("KY");
    expect(detail.isOpen).toBe(false);
    expect(detail.entries.map((e) => e.position)).toEqual([1, 2]);

    const [first, second] = detail.entries;
    expect(first.song.id).toBe(seed.songs.normal); // position 1 — 삽입 순서가 아니라 position 순
    // numeric은 문자열로 온다. 관계형 조회 경로에서는 소수 0이 잘려("91.00" → "91") 오므로
    // 표기가 아니라 값으로 비교한다 — 기존 오늘 화면의 조회 경로도 같은 형태를 받는다.
    expect(first.score).not.toBeNull();
    expect(Number(first.score)).toBe(91);
    expect(Object.keys(first.song.numbers).sort()).toEqual(["KY", "TJ"]);
    expect(first.song.numbers.KY).toEqual({ status: "AVAILABLE", number: "22222" });
    expect(first.song.numbers.TJ).toEqual({ status: "AVAILABLE", number: "11111" });

    expect(second.song.id).toBe(seed.songs.stub);
    expect(second.song.title).toBeNull(); // stub — 화면은 그날 번호를 제목 자리에 쓴다
    expect(second.song.numbers).toEqual({ TJ: null, KY: null }); // 행 없음은 null
  });

  it("getSessionDetail: 타 owner 세션과 부재 id가 똑같이 SESSION_NOT_FOUND다 (D-Q)", async () => {
    await expect(
      useCases.getSessionDetail(SEED_USERS.a, seed.sessions.othersOwned),
    ).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });
    await expect(
      useCases.getSessionDetail(SEED_USERS.a, MISSING_ID),
    ).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });
  });

  it("addEntryBySong (UC-1): 타 owner의 songId는 SONG_NOT_FOUND다 (D-P — 새 IDOR 표면)", async () => {
    await expect(
      useCases.addEntryBySong({
        ownerId: SEED_USERS.a,
        sessionId: seed.sessions.open,
        songId: seed.songs.othersOwned,
      }),
    ).rejects.toMatchObject({ code: "SONG_NOT_FOUND" });
  });

  it("addEntryBySong: 타 owner·부재 세션은 SESSION_NOT_FOUND, 닫힌 세션은 SESSION_CLOSED다", async () => {
    await expect(
      useCases.addEntryBySong({
        ownerId: SEED_USERS.a,
        sessionId: seed.sessions.othersOwned,
        songId: seed.songs.normal,
      }),
    ).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });

    await expect(
      useCases.addEntryBySong({
        ownerId: SEED_USERS.a,
        sessionId: seed.sessions.closed,
        songId: seed.songs.normal,
      }),
    ).rejects.toMatchObject({ code: "SESSION_CLOSED" });
  });

  it("addEntryBySong: registerNumber가 오면 번호 행 1개 생성과 엔트리 추가가 한 번에 끝난다 (D-K)", async () => {
    expect(await numberRowsOf(seed.songs.stub)).toHaveLength(0); // 행 없음에서 출발

    const result = await useCases.addEntryBySong({
      ownerId: SEED_USERS.a,
      sessionId: seed.sessions.open, // brand TJ
      songId: seed.songs.stub,
      registerNumber: "54321",
    });

    expect(result.entry.songId).toBe(seed.songs.stub);
    expect(result.entry.sessionId).toBe(seed.sessions.open);
    expect(result.entry.position).toBe(4); // 기존 3건 뒤에 붙는다
    expect(result.song.number).toBe("54321");
    expect(result.isNewStub).toBe(false);

    const rows = await numberRowsOf(seed.songs.stub);
    expect(rows).toHaveLength(1); // 정확히 하나 — 3-state 계약
    expect(rows[0]).toMatchObject({ brand: "TJ", status: "AVAILABLE", number: "54321" });
  });

  it("addEntryBySong: 그냥 추가는 UNSUPPORTED 행을 그대로 둔다 (D-S — M3 큐 계약)", async () => {
    await useCases.setSongNumber(SEED_USERS.a, seed.songs.stub, "TJ", {
      status: "UNSUPPORTED",
    });

    const result = await useCases.addEntryBySong({
      ownerId: SEED_USERS.a,
      sessionId: seed.sessions.open,
      songId: seed.songs.stub,
    });
    expect(result.song.number).toBeNull();

    const rows = await numberRowsOf(seed.songs.stub);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ brand: "TJ", status: "UNSUPPORTED", number: null });
  });

  it("addEntryBySong: 그냥 추가는 없는 번호 행을 만들지도 않는다 (D-S)", async () => {
    await useCases.clearSongNumber(SEED_USERS.a, seed.songs.stub, "TJ");
    expect(await numberRowsOf(seed.songs.stub)).toHaveLength(0);

    await useCases.addEntryBySong({
      ownerId: SEED_USERS.a,
      sessionId: seed.sessions.open,
      songId: seed.songs.stub,
    });

    expect(await numberRowsOf(seed.songs.stub)).toHaveLength(0); // 결손은 M3 큐가 회수한다
  });

  it("addEntryBySong: registerNumber는 기존 AVAILABLE 번호를 덮어쓴다 (D-T)", async () => {
    await useCases.addEntryBySong({
      ownerId: SEED_USERS.a,
      sessionId: seed.sessions.open, // TJ
      songId: seed.songs.normal, // TJ=11111
      registerNumber: "99999",
    });

    const [row] = await db.query.songNumbers.findMany({
      where: and(eq(songNumbers.songId, seed.songs.normal), eq(songNumbers.brand, "TJ")),
    });
    expect(row).toMatchObject({ status: "AVAILABLE", number: "99999" });
  });
});
