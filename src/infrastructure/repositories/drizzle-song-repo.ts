// Design Ref: §9.4, §5.3, §9.3 — SongRepo의 Drizzle 구현. stub 생성은 title=NULL 고정 (Plan §6.2)
import { and, eq } from "drizzle-orm";
import type { Song } from "@/domain";
import type { NumberInput, SongMetaPatch, SongRepo } from "@/application/ports/song-repo";
import { songNumbers, songs } from "../db/schema";
import type { DbOrTx } from "./types";

function toDomain(row: typeof songs.$inferSelect): Song {
  return {
    id: row.id,
    ownerId: row.ownerId,
    title: row.title,
    artist: row.artist,
    memo: row.memo,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createDrizzleSongRepo(db: DbOrTx): SongRepo {
  // Design Ref: §9.3 — 소유권 확인과 updated_at 갱신을 한 쿼리로 겸한다(§1.3-4: $onUpdate 없음).
  // 0행이면 타 owner이거나 존재하지 않는 곡 — 호출자가 false로 SONG_NOT_FOUND를 던진다(§2.3 D-E).
  // .returning()에 필드를 넘기지 않는 이유: db가 DbOrTx(Database | TxHandle) 유니언이라
  // 필드 선택 오버로드가 유니언 전체로 좁혀지지 않는다 — 기존 리포지토리 전부가 이 관례를 따른다.
  async function touch(ownerId: string, songId: string): Promise<boolean> {
    const res = await db
      .update(songs)
      .set({ updatedAt: new Date() })
      .where(and(eq(songs.id, songId), eq(songs.ownerId, ownerId)))
      .returning();
    return res.length > 0;
  }

  return {
    // Check 단계 G-2 수정: owner를 WHERE에 직접 건다 — 예전엔 brand+number로만 findFirst한
    // 뒤(정렬 없음) 사후에 owner를 대조했다. 같은 (brand, number)를 가진 타 owner의 곡이
    // 먼저 걸리면 실제로 존재하는 내 곡을 "없음"으로 오판해 addEntryByNumber가 중복 stub을
    // 만들 수 있었다(브랜드 번호는 실제 곡 코드라 사용자 간 충돌이 드물지 않다). owner를
    // 쿼리 자체의 필터로 걸면 이 곡이 어디 있든 정확히 그 행만 잡히므로 충돌 여지가 없다.
    async findByOwnerBrandNumber(ownerId, brand, number) {
      const [row] = await db
        .select({ song: songs })
        .from(songNumbers)
        .innerJoin(songs, eq(songNumbers.songId, songs.id))
        .where(
          and(
            eq(songNumbers.brand, brand),
            eq(songNumbers.number, number),
            eq(songs.ownerId, ownerId),
          ),
        )
        .limit(1);
      return row ? toDomain(row.song) : null;
    },

    async createStubWithNumber(ownerId, brand, number) {
      const [song] = await db
        .insert(songs)
        .values({ ownerId, title: null, artist: null, memo: null })
        .returning();
      await db.insert(songNumbers).values({
        songId: song.id,
        brand,
        number,
        status: "AVAILABLE",
      });
      return toDomain(song);
    },

    async updateMeta(ownerId: string, songId: string, patch: SongMetaPatch): Promise<boolean> {
      const res = await db
        .update(songs)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(songs.id, songId), eq(songs.ownerId, ownerId)))
        .returning();
      return res.length > 0;
    },

    async setNumber(
      ownerId: string,
      songId: string,
      brand,
      input: NumberInput,
    ): Promise<boolean> {
      if (!(await touch(ownerId, songId))) return false;
      const values =
        input.status === "AVAILABLE"
          ? { number: input.number, status: "AVAILABLE" as const }
          : { number: null, status: "UNSUPPORTED" as const };
      await db
        .insert(songNumbers)
        .values({ songId, brand, ...values })
        .onConflictDoUpdate({
          target: [songNumbers.songId, songNumbers.brand],
          set: values,
        });
      return true;
    },

    async clearNumber(ownerId: string, songId: string, brand): Promise<boolean> {
      if (!(await touch(ownerId, songId))) return false;
      await db
        .delete(songNumbers)
        .where(and(eq(songNumbers.songId, songId), eq(songNumbers.brand, brand)));
      return true;
    },
  };
}
