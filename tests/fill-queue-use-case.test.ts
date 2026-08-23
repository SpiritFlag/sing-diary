// Design Ref: expand-fill-queue §8 — module-1의 검증. 큐 선별이 §5.6 기준(행 없음 / title·artist NULL)
// 그대로 도는지를 실 Neon 테스트 브랜치 위에서 확인한다. UI가 없어도 계약은 여기서 선다.
import { beforeAll, describe, expect, it } from "vitest";
import { resetAndSeed, SEED_USERS } from "../src/infrastructure/db/seed";
import { activateTestDatabase } from "./support/db";

const hasDb = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!hasDb)("빈칸채우기 큐 선별 (expand-fill-queue §3.3)", () => {
  let db: (typeof import("../src/infrastructure/db/client"))["db"];
  let useCases: typeof import("../src/presentation/container").useCases;
  let seed: Awaited<ReturnType<typeof resetAndSeed>>;

  beforeAll(async () => {
    activateTestDatabase();
    ({ db } = await import("../src/infrastructure/db/client"));
    ({ useCases } = await import("../src/presentation/container"));
    seed = await resetAndSeed(db);
  });

  it("큐 A: 해당 브랜드 song_numbers 행이 없는 곡만 뽑는다 (브랜드별로 다른 집합)", async () => {
    const snap = await useCases.getFillQueue(SEED_USERS.a);
    const tj = snap.tj.map((s) => s.id);
    const ky = snap.ky.map((s) => s.id);

    // TJ 결손: stub(양쪽 없음) + tjOnly 두 건
    expect(tj).toEqual(expect.arrayContaining([seed.songs.stub, seed.songs.tjOnly1, seed.songs.tjOnly2]));
    // KY 결손: stub만 — tjOnly 두 건은 KY 번호를 갖고 있다
    expect(ky).toContain(seed.songs.stub);
    expect(ky).not.toContain(seed.songs.tjOnly1);
    expect(ky).not.toContain(seed.songs.tjOnly2);
    // 양 브랜드 다 있는 곡은 어느 큐에도 없다
    expect(tj).not.toContain(seed.songs.normal);
    expect(ky).not.toContain(seed.songs.normal);
  });

  it("큐 B: title IS NULL OR artist IS NULL — OR 조건이라 한쪽만 비어도 대상이다", async () => {
    const meta = (await useCases.getFillQueue(SEED_USERS.a)).meta.map((s) => s.id);
    expect(meta).toContain(seed.songs.stub); // 둘 다 NULL
    expect(meta).toContain(seed.songs.titleOnlyNull); // title만 NULL
    expect(meta).not.toContain(seed.songs.normal);
  });

  it("한 곡이 세 큐에 동시에 뜰 수 있다 — 정규화는 클라이언트 몫 (Plan R3, D-D)", async () => {
    const snap = await useCases.getFillQueue(SEED_USERS.a);
    for (const list of [snap.tj, snap.ky, snap.meta]) {
      expect(list.map((s) => s.id)).toContain(seed.songs.stub);
    }
  });

  it("owner 스코프 — 타 owner의 결손 곡은 세 배열 어디에도 없다", async () => {
    const snap = await useCases.getFillQueue(SEED_USERS.a);
    const all = [...snap.tj, ...snap.ky, ...snap.meta].map((s) => s.id);
    expect(all).not.toContain(seed.songs.othersOwned);
  });

  it("정렬은 created_at ASC — 묵은 결손부터 (D-C)", async () => {
    const tj = (await useCases.getFillQueue(SEED_USERS.a)).tj;
    const at = (id: string) => tj.findIndex((s) => s.id === id);
    expect(at(seed.songs.stub)).toBeLessThan(at(seed.songs.tjOnly1));
    expect(at(seed.songs.tjOnly1)).toBeLessThan(at(seed.songs.tjOnly2));
  });

  it("UNSUPPORTED도 결손이 아니다 — 기준은 '행 없음'이지 'AVAILABLE'이 아니다 (3-state 계약)", async () => {
    await useCases.setSongNumber(SEED_USERS.a, seed.songs.tjOnly1, "TJ", {
      status: "UNSUPPORTED",
    });
    const after = await useCases.getFillQueue(SEED_USERS.a);
    expect(after.tj.map((s) => s.id)).not.toContain(seed.songs.tjOnly1);

    // 되돌리기: 행을 지우면 다시 결손이다
    await useCases.clearSongNumber(SEED_USERS.a, seed.songs.tjOnly1, "TJ");
    const restored = await useCases.getFillQueue(SEED_USERS.a);
    expect(restored.tj.map((s) => s.id)).toContain(seed.songs.tjOnly1);
  });

  it("카드가 쓸 재료가 스냅샷에 실려 온다 — 반대 브랜드 번호(D-G 폴백)", async () => {
    const snap = await useCases.getFillQueue(SEED_USERS.a);
    const card = snap.tj.find((s) => s.id === seed.songs.tjOnly2);
    expect(card?.numbers.KY).toEqual({ status: "AVAILABLE", number: "48728" });
    expect(card?.numbers.TJ).toBeNull();
  });
});
