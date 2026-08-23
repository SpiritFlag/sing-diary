// Design Ref: §8.5 — 테스트 시드 데이터. INV/UC 테스트가 이 함수로 고정 fixture를 만든다.
import type { Database } from "./client";
import { entries, songNumbers, songs, sessions } from "./schema";

export const SEED_USERS = {
  a: "user_a",
  b: "user_b",
} as const;

export interface SeedResult {
  songs: { normal: string; stub: string; othersOwned: string };
  sessions: { open: string; closed: string; othersOwned: string };
  /** open 세션의 엔트리 3건. INV-4가 "이 세션의 전부"로 쓰므로 여기에 다른 세션 것을 섞지 않는다 */
  entries: string[];
  /** closed 세션의 엔트리 — expand-playlist-import UC-2(상세 조회)용 */
  closedEntries: string[];
}

/** 4개 테이블을 비우고 §8.5 최소 fixture를 채운다. FK 순서상 자식부터 삭제. */
export async function resetAndSeed(db: Database): Promise<SeedResult> {
  await db.delete(entries);
  await db.delete(songNumbers);
  await db.delete(sessions);
  await db.delete(songs);

  const [normalSong] = await db
    .insert(songs)
    .values({ ownerId: SEED_USERS.a, title: "기존 곡", artist: "가수 A" })
    .returning({ id: songs.id });
  const [stubSong] = await db
    .insert(songs)
    .values({ ownerId: SEED_USERS.a, title: null, artist: null })
    .returning({ id: songs.id });
  const [othersSong] = await db
    .insert(songs)
    .values({ ownerId: SEED_USERS.b, title: "타인 곡", artist: "가수 B" })
    .returning({ id: songs.id });

  await db.insert(songNumbers).values([
    {
      songId: normalSong.id,
      brand: "TJ",
      number: "11111",
      status: "AVAILABLE",
    },
    {
      songId: normalSong.id,
      brand: "KY",
      number: "22222",
      status: "AVAILABLE",
    },
  ]);

  const [openSession] = await db
    .insert(sessions)
    .values({
      ownerId: SEED_USERS.a,
      visitDate: "2026-08-23",
      venue: "수노래방",
      brand: "TJ",
      closedAt: null,
    })
    .returning({ id: sessions.id });
  const [closedSession] = await db
    .insert(sessions)
    .values({
      ownerId: SEED_USERS.a,
      visitDate: "2026-08-01",
      venue: "지난노래방",
      brand: "KY",
      closedAt: new Date("2026-08-01T20:00:00Z"),
    })
    .returning({ id: sessions.id });

  // expand-playlist-import: 타 owner 세션 — findDetail/listByOwner의 owner 스코프 실측용
  const [othersSession] = await db
    .insert(sessions)
    .values({
      ownerId: SEED_USERS.b,
      visitDate: "2026-08-10",
      venue: "타인노래방",
      brand: "TJ",
      closedAt: new Date("2026-08-10T20:00:00Z"),
    })
    .returning({ id: sessions.id });

  const insertedEntries = await db
    .insert(entries)
    .values([
      { sessionId: openSession.id, songId: normalSong.id, position: 1, score: "97.52" },
      { sessionId: openSession.id, songId: stubSong.id, position: 2, score: null },
      { sessionId: openSession.id, songId: normalSong.id, position: 3, score: "88.10" },
    ])
    .returning({ id: entries.id });

  // 닫힌 세션(KY)의 엔트리 — position 역순으로 넣어 정렬이 실제로 동작하는지 보이게 한다.
  // normal 곡은 TJ·KY 양쪽 번호가, stub 곡은 아무 번호도 없다 → 상세의 numbers 두 키 검증에 쓴다.
  const closedEntries = await db
    .insert(entries)
    .values([
      { sessionId: closedSession.id, songId: stubSong.id, position: 2, score: null },
      { sessionId: closedSession.id, songId: normalSong.id, position: 1, score: "91.00" },
    ])
    .returning({ id: entries.id });

  return {
    songs: { normal: normalSong.id, stub: stubSong.id, othersOwned: othersSong.id },
    sessions: {
      open: openSession.id,
      closed: closedSession.id,
      othersOwned: othersSession.id,
    },
    entries: insertedEntries.map((e) => e.id),
    closedEntries: closedEntries.map((e) => e.id),
  };
}
