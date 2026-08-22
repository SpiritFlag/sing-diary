// Design Ref: §9.4, §5.5 — EntryRepo의 Drizzle 구현. 재정렬/재인덱싱은 시프트 2단계.
import { asc, eq, sql } from "drizzle-orm";
import type { Entry } from "@/domain";
import type {
  EntryRepo,
  EntryWithOwner,
  EntryWithSong,
} from "@/application/ports/entry-repo";
import { entries } from "../db/schema";
import type { DbOrTx } from "./types";

// 재정렬/재인덱싱 시 UNIQUE 없는 position이라도 중간 값 충돌을 피하기 위한 시프트 폭
const REORDER_SHIFT = 1000;

function toDomain(row: typeof entries.$inferSelect): Entry {
  return {
    id: row.id,
    sessionId: row.sessionId,
    songId: row.songId,
    position: row.position,
    score: row.score,
    createdAt: row.createdAt,
  };
}

export function createDrizzleEntryRepo(db: DbOrTx): EntryRepo {
  return {
    async listWithSongBySession(sessionId, brand): Promise<EntryWithSong[]> {
      const rows = await db.query.entries.findMany({
        where: eq(entries.sessionId, sessionId),
        orderBy: asc(entries.position),
        with: { song: { with: { numbers: true } } },
      });
      return rows.map((row) => {
        const number = row.song.numbers.find((n) => n.brand === brand)?.number ?? null;
        return {
          ...toDomain(row),
          song: { id: row.song.id, title: row.song.title, number },
        };
      });
    },

    async appendToSession(sessionId, songId) {
      const [{ nextPosition }] = await db
        .select({
          nextPosition: sql<number>`coalesce(max(${entries.position}), 0) + 1`,
        })
        .from(entries)
        .where(eq(entries.sessionId, sessionId));
      const [row] = await db
        .insert(entries)
        .values({ sessionId, songId, position: nextPosition, score: null })
        .returning();
      return toDomain(row);
    },

    async findByIdForOwner(entryId, ownerId): Promise<EntryWithOwner | null> {
      const row = await db.query.entries.findFirst({
        where: eq(entries.id, entryId),
        with: { session: true },
      });
      if (!row || row.session.ownerId !== ownerId) return null;
      return { ...toDomain(row), sessionOwnerId: row.session.ownerId };
    },

    async updateScore(entryId, score) {
      const [row] = await db
        .update(entries)
        .set({ score })
        .where(eq(entries.id, entryId))
        .returning();
      return toDomain(row);
    },

    async listIdsBySession(sessionId) {
      const rows = await db
        .select({ id: entries.id })
        .from(entries)
        .where(eq(entries.sessionId, sessionId));
      return rows.map((r) => r.id);
    },

    async reorder(sessionId, entryIds) {
      await db
        .update(entries)
        .set({ position: sql`${entries.position} + ${REORDER_SHIFT}` })
        .where(eq(entries.sessionId, sessionId));
      for (let i = 0; i < entryIds.length; i++) {
        await db
          .update(entries)
          .set({ position: i + 1 })
          .where(eq(entries.id, entryIds[i]));
      }
      const rows = await db.query.entries.findMany({
        where: eq(entries.sessionId, sessionId),
        orderBy: asc(entries.position),
      });
      return rows.map(toDomain);
    },

    async delete(entryId) {
      await db.delete(entries).where(eq(entries.id, entryId));
    },

    async reindexSession(sessionId) {
      const rows = await db.query.entries.findMany({
        where: eq(entries.sessionId, sessionId),
        orderBy: asc(entries.position),
      });
      if (rows.length === 0) return;
      await db
        .update(entries)
        .set({ position: sql`${entries.position} + ${REORDER_SHIFT}` })
        .where(eq(entries.sessionId, sessionId));
      for (let i = 0; i < rows.length; i++) {
        await db
          .update(entries)
          .set({ position: i + 1 })
          .where(eq(entries.id, rows[i].id));
      }
    },
  };
}
