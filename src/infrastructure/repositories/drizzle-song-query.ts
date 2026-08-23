// Design Ref: §3.4, §9.4, §1.3 ★ⓐ — SongQuery의 Drizzle 구현. 읽기 전용, Neon HTTP 드라이버(db) 사용.
import { and, eq, sql } from "drizzle-orm";
import type { Brand } from "@/domain";
import type { NumberView, SongListItem, SongQuery } from "@/application/ports/song-query";
import { songNumbers, songs } from "../db/schema";
import type { DbOrTx } from "./types";

// drizzle/0001_cool_next_avengers.sql:49 의 idx_songs_trgm 표현식과 문자열이 일치해야 한다
// (§1.3 ★ⓐ — owner 스코프에서는 실제로 이 인덱스를 타지 않지만, 표현식은 규모가 커질 날을 위해 유지한다).
// 여기를 고치면 schema.ts의 인덱스 정의와 마이그레이션도 함께 고칠 것.
const SEARCH_EXPR = sql`(coalesce(${songs.title}, '') || ' ' || coalesce(${songs.artist}, '') || ' ' || coalesce(${songs.memo}, ''))`;

// ILIKE 와일드카드(%, _, \)를 리터럴로 이스케이프한다 — 파라미터 바인딩은 SQL 인젝션만 막을 뿐
// 패턴 문자는 그대로 살아남는다 (Plan R9).
export function toLikePattern(keyword: string): string {
  return "%" + keyword.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
}

type SongWithNumbers = typeof songs.$inferSelect & {
  numbers: (typeof songNumbers.$inferSelect)[];
};

function toListItem(row: SongWithNumbers): SongListItem {
  const numbers: Record<Brand, NumberView> = { TJ: null, KY: null };
  for (const n of row.numbers) {
    numbers[n.brand] = { status: n.status, number: n.number };
  }
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    memo: row.memo,
    numbers,
    updatedAt: row.updatedAt,
  };
}

const SORT_ORDER = [
  sql`${songs.title} ASC NULLS FIRST`,
  sql`${songs.artist} ASC NULLS FIRST`,
];

export function createDrizzleSongQuery(db: DbOrTx): SongQuery {
  return {
    async search(ownerId, keyword) {
      const rows = await db.query.songs.findMany({
        where: and(
          eq(songs.ownerId, ownerId),
          sql`${SEARCH_EXPR} ILIKE ${toLikePattern(keyword)} ESCAPE '\\'`,
        ),
        with: { numbers: true },
        orderBy: SORT_ORDER,
      });
      return rows.map(toListItem);
    },

    async list(ownerId) {
      const rows = await db.query.songs.findMany({
        where: eq(songs.ownerId, ownerId),
        with: { numbers: true },
        orderBy: SORT_ORDER,
      });
      return rows.map(toListItem);
    },

    async findById(ownerId, songId) {
      const row = await db.query.songs.findFirst({
        where: and(eq(songs.id, songId), eq(songs.ownerId, ownerId)),
        with: { numbers: true },
      });
      return row ? toListItem(row) : null;
    },
  };
}
