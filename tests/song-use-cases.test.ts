// Design Ref: §8.4 — UC-1/UC-2 + 3-state·NULL 계약 실측. module-2 범위: 유스케이스가
// 실 Neon 트랜잭션 위에서 도는지 검증. activateTestDatabase()가 동적 import 직전에
// DATABASE_URL을 TEST_DATABASE_URL로 바꿔치기하므로 이 스위트는 상용 DB를 절대 건드리지 않는다.
import { DomainError } from "@/domain";
import { beforeAll, describe, expect, it } from "vitest";
import { resetAndSeed, SEED_USERS } from "../src/infrastructure/db/seed";
import { activateTestDatabase } from "./support/db";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!hasDb)("곡 카탈로그 유스케이스 (Design §8.4)", () => {
  let db: (typeof import("../src/infrastructure/db/client"))["db"];
  let useCases: typeof import("../src/presentation/container").useCases;
  let seed: Awaited<ReturnType<typeof resetAndSeed>>;

  beforeAll(async () => {
    activateTestDatabase();
    ({ db } = await import("../src/infrastructure/db/client"));
    ({ useCases } = await import("../src/presentation/container"));
    seed = await resetAndSeed(db);
  });

  it("listSongs: owner 스코프만 반환하고 제목 NULL(stub)이 맨 앞이다", async () => {
    const list = await useCases.listSongs(SEED_USERS.a);
    expect(list.map((s) => s.id)).toContain(seed.songs.normal);
    expect(list.map((s) => s.id)).not.toContain(seed.songs.othersOwned);
    expect(list[0].id).toBe(seed.songs.stub); // title NULL → NULLS FIRST
  });

  it("searchSongs (UC-1): title 키워드로 owner 스코프 안에서만 매칭된다", async () => {
    const result = await useCases.searchSongs(SEED_USERS.a, "기존");
    expect(result.map((s) => s.id)).toEqual([seed.songs.normal]);

    const forOther = await useCases.searchSongs(SEED_USERS.a, "타인");
    expect(forOther).toEqual([]); // othersOwned는 owner_b 소유 — a로 검색해도 안 나옴
  });

  it("updateSongMeta (UC-2): 타 owner 곡은 SONG_NOT_FOUND를 던진다", async () => {
    await expect(
      useCases.updateSongMeta(SEED_USERS.a, seed.songs.othersOwned, { title: "탈취 시도" }),
    ).rejects.toMatchObject({ code: "SONG_NOT_FOUND" });
    await expect(
      useCases.updateSongMeta(SEED_USERS.a, seed.songs.othersOwned, { title: "탈취 시도" }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it("updateSongMeta: null 패치가 그대로 저장된다 (M3 큐 B 계약 — NULL 정규화 자체는 SN-1이 스키마 레벨에서 검증)", async () => {
    // "" → null 변환은 Zod 스키마(§4.2 D-F, tests/song-schemas.test.ts SN-1)의 책임이다.
    // 유스케이스는 이미 정규화된 값을 받아 그대로 저장·반환하는지만 검증한다.
    const result = await useCases.updateSongMeta(SEED_USERS.a, seed.songs.normal, {
      memo: null,
    });
    expect(result.memo).toBeNull();

    const refetched = await useCases.listSongs(SEED_USERS.a);
    const song = refetched.find((s) => s.id === seed.songs.normal);
    expect(song?.memo).toBeNull();
  });

  it("setSongNumber → clearSongNumber: 3-state 전이가 계약대로 동작한다", async () => {
    // AVAILABLE 확정
    const afterSet = await useCases.setSongNumber(SEED_USERS.a, seed.songs.stub, "TJ", {
      status: "AVAILABLE",
      number: "77777",
    });
    expect(afterSet.numbers.TJ).toEqual({ status: "AVAILABLE", number: "77777" });

    // UNSUPPORTED로 전환
    const afterUnsupported = await useCases.setSongNumber(SEED_USERS.a, seed.songs.stub, "TJ", {
      status: "UNSUPPORTED",
    });
    expect(afterUnsupported.numbers.TJ).toEqual({ status: "UNSUPPORTED", number: null });

    // 삭제 = "행 없음" (M3 큐 A 계약 — UNSUPPORTED로 남지 않는다)
    const afterClear = await useCases.clearSongNumber(SEED_USERS.a, seed.songs.stub, "TJ");
    expect(afterClear.numbers.TJ).toBeNull();
  });

  it("setSongNumber: 타 owner 곡에는 번호를 설정할 수 없다", async () => {
    await expect(
      useCases.setSongNumber(SEED_USERS.a, seed.songs.othersOwned, "TJ", {
        status: "AVAILABLE",
        number: "99999",
      }),
    ).rejects.toMatchObject({ code: "SONG_NOT_FOUND" });
  });
});
