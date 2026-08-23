// Design Ref: §8.5 — 테스트 시드 데이터. INV/UC 테스트가 이 함수로 고정 fixture를 만든다.
import type { Database } from "./client";
import { entries, songNumbers, songs, sessions } from "./schema";

export const SEED_USERS = {
  a: "user_a",
  b: "user_b",
} as const;

export interface SeedResult {
  songs: {
    normal: string;
    stub: string;
    othersOwned: string;
    /** expand-fill-queue §8.5 — TJ만 결손(KY는 AVAILABLE). created_at 오름차순으로 tjOnly1 → tjOnly2 */
    tjOnly1: string;
    tjOnly2: string;
    /** expand-fill-queue §8.5 — title만 NULL(artist는 있음). 큐 B의 OR 조건 검증용 */
    titleOnlyNull: string;
  };
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

  // expand-fill-queue §8.5 — 빈칸채우기 큐 fixture.
  // 기존 세 곡(normal=결손 없음 대조군, stub=양 브랜드+메타 결손, othersOwned=타 owner 결손)은
  // 그대로 두고 세 건만 덧댄다. 제목에 "기존"·"타인"을 쓰지 않는다 — 기존 검색 테스트의 매칭 집합을 흔들지 않기 위함.
  const [tjOnly1] = await db
    .insert(songs)
    .values({ ownerId: SEED_USERS.a, title: "큐 곡 하나", artist: "가수 C" })
    .returning({ id: songs.id });
  const [tjOnly2] = await db
    .insert(songs)
    .values({ ownerId: SEED_USERS.a, title: "큐 곡 둘", artist: "가수 D" })
    .returning({ id: songs.id });
  // title만 NULL — artist가 있으므로 list의 NULLS FIRST 정렬에서 stub보다 뒤에 선다(기존 단언 보존).
  const [titleOnlyNull] = await db
    .insert(songs)
    .values({ ownerId: SEED_USERS.a, title: null, artist: "가수 E" })
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
    // 큐 A(TJ) 대상 두 건 — KY는 있고 TJ 행이 없다. TJ 큐에는 뜨고 KY 큐에는 안 뜬다(§8.2 #31).
    { songId: tjOnly1.id, brand: "KY", number: "48727", status: "AVAILABLE" },
    { songId: tjOnly2.id, brand: "KY", number: "48728", status: "AVAILABLE" },
    // titleOnlyNull은 번호 결손이 아니다 — 큐 B에만 떠야 한다(양 브랜드 채움).
    { songId: titleOnlyNull.id, brand: "TJ", number: "55551", status: "AVAILABLE" },
    { songId: titleOnlyNull.id, brand: "KY", number: "55552", status: "AVAILABLE" },
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
    songs: {
      normal: normalSong.id,
      stub: stubSong.id,
      othersOwned: othersSong.id,
      tjOnly1: tjOnly1.id,
      tjOnly2: tjOnly2.id,
      titleOnlyNull: titleOnlyNull.id,
    },
    sessions: {
      open: openSession.id,
      closed: closedSession.id,
      othersOwned: othersSession.id,
    },
    entries: insertedEntries.map((e) => e.id),
    closedEntries: closedEntries.map((e) => e.id),
  };
}
