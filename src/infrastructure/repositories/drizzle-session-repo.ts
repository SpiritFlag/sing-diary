// Design Ref: §9.4 — SessionRepo의 Drizzle 구현
import { and, eq, isNull } from "drizzle-orm";
import type { Session } from "@/domain";
import type {
  CreateSessionInput,
  SessionRepo,
} from "@/application/ports/session-repo";
import { sessions } from "../db/schema";
import type { DbOrTx } from "./types";

function toDomain(row: typeof sessions.$inferSelect): Session {
  return {
    id: row.id,
    ownerId: row.ownerId,
    visitDate: row.visitDate,
    venue: row.venue,
    brand: row.brand,
    isPublic: row.isPublic,
    closedAt: row.closedAt,
    createdAt: row.createdAt,
  };
}

export function createDrizzleSessionRepo(db: DbOrTx): SessionRepo {
  return {
    async findOpenByOwner(ownerId) {
      const row = await db.query.sessions.findFirst({
        where: and(eq(sessions.ownerId, ownerId), isNull(sessions.closedAt)),
      });
      return row ? toDomain(row) : null;
    },

    async findByIdForOwner(id, ownerId) {
      const row = await db.query.sessions.findFirst({
        where: and(eq(sessions.id, id), eq(sessions.ownerId, ownerId)),
      });
      return row ? toDomain(row) : null;
    },

    async closeAllOpen(ownerId) {
      await db
        .update(sessions)
        .set({ closedAt: new Date() })
        .where(and(eq(sessions.ownerId, ownerId), isNull(sessions.closedAt)));
    },

    async create(input: CreateSessionInput) {
      const [row] = await db
        .insert(sessions)
        .values({
          ownerId: input.ownerId,
          visitDate: input.visitDate,
          venue: input.venue,
          brand: input.brand,
          closedAt: null,
        })
        .returning();
      return toDomain(row);
    },
  };
}
