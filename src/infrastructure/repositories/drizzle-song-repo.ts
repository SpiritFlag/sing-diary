// Design Ref: §9.4, §5.3 — SongRepo의 Drizzle 구현. stub 생성은 title=NULL 고정 (Plan §6.2)
import { and, eq } from "drizzle-orm";
import type { Song } from "@/domain";
import type { SongRepo } from "@/application/ports/song-repo";
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
  return {
    async findByOwnerBrandNumber(ownerId, brand, number) {
      const row = await db.query.songNumbers.findFirst({
        where: and(eq(songNumbers.brand, brand), eq(songNumbers.number, number)),
        with: { song: true },
      });
      if (!row || row.song.ownerId !== ownerId) return null;
      return toDomain(row.song);
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
  };
}
