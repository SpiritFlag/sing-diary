// Design Ref: expand-playlist-import §9.3, §2.3 D-L — SessionQuery의 Drizzle 구현.
// 읽기 전용이며 Neon HTTP 드라이버(db)로 돈다(D-C 승계). 쓰기는 여기 없다.
import { and, asc, count, desc, eq } from "drizzle-orm";
import type { Brand } from "@/domain";
import type { NumberView } from "@/application/ports/song-query";
import type {
  SessionDetail,
  SessionDetailEntry,
  SessionListItem,
  SessionQuery,
} from "@/application/ports/session-query";
import { entries, sessions, songNumbers, songs } from "../db/schema";
import type { DbOrTx } from "./types";

type SongWithNumbers = typeof songs.$inferSelect & {
  numbers: (typeof songNumbers.$inferSelect)[];
};

// song_numbers 행 배열 → 브랜드별 Record. 행이 없는 브랜드는 null("아직 안 넣음")로 남는다 —
// drizzle-song-query.toListItem과 같은 규칙이다. 3-state의 읽기 표현을 두 벌 만들지 않는다.
function toNumbers(rows: SongWithNumbers["numbers"]): Record<Brand, NumberView> {
  const numbers: Record<Brand, NumberView> = { TJ: null, KY: null };
  for (const n of rows) {
    numbers[n.brand] = { status: n.status, number: n.number };
  }
  return numbers;
}

function toDetailEntry(
  row: typeof entries.$inferSelect & { song: SongWithNumbers },
): SessionDetailEntry {
  return {
    id: row.id,
    position: row.position,
    score: row.score,
    song: {
      id: row.song.id,
      title: row.song.title,
      artist: row.song.artist,
      numbers: toNumbers(row.song.numbers),
    },
  };
}

export function createDrizzleSessionQuery(db: DbOrTx): SessionQuery {
  return {
    // Design Ref: §1.3 ★R6, D-O — LEFT JOIN + GROUP BY 단일 쿼리. 곡 수를 세자고 세션 수만큼
    // 쿼리를 더 쏘지 않는다. idx_sessions_owner_date가 owner 필터와 정렬을 함께 받친다.
    async listByOwner(ownerId): Promise<SessionListItem[]> {
      const rows = await db
        .select({
          id: sessions.id,
          visitDate: sessions.visitDate,
          venue: sessions.venue,
          brand: sessions.brand,
          closedAt: sessions.closedAt,
          entryCount: count(entries.id),
        })
        .from(sessions)
        .leftJoin(entries, eq(entries.sessionId, sessions.id))
        .where(eq(sessions.ownerId, ownerId))
        .groupBy(sessions.id)
        .orderBy(desc(sessions.visitDate), desc(sessions.createdAt));

      return rows.map((row) => ({
        id: row.id,
        visitDate: row.visitDate,
        venue: row.venue,
        brand: row.brand,
        isOpen: row.closedAt === null,
        entryCount: row.entryCount,
      }));
    },

    // owner를 쿼리의 WHERE에 직접 건다 — 조회 후 사후 대조하지 않는다. 없으면 null이고,
    // 유스케이스가 그것을 SESSION_NOT_FOUND(404)로 바꾼다. 타 owner와 부재를 구분하지
    // 않는 것이 의도다(D-Q — 403은 그 세션의 존재를 누설한다).
    async findDetail(ownerId, sessionId): Promise<SessionDetail | null> {
      const row = await db.query.sessions.findFirst({
        where: and(eq(sessions.id, sessionId), eq(sessions.ownerId, ownerId)),
        with: {
          entries: {
            orderBy: asc(entries.position),
            with: { song: { with: { numbers: true } } },
          },
        },
      });
      if (!row) return null;
      return {
        id: row.id,
        visitDate: row.visitDate,
        venue: row.venue,
        brand: row.brand,
        isOpen: row.closedAt === null,
        entries: row.entries.map(toDetailEntry),
      };
    },
  };
}
