// Design Ref: §3.3 — ARCHITECT.md §4 스키마 전사
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const brandEnum = pgEnum("brand_enum", ["TJ", "KY"]);
export const numberStatusEnum = pgEnum("number_status", [
  "AVAILABLE",
  "UNSUPPORTED",
]);

export const songs = pgTable(
  "songs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    title: text("title"),
    artist: text("artist"),
    memo: text("memo"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_songs_owner").on(table.ownerId),
    // Design Ref: §3.3 — 다컬럼 trgm 대신 결합 표현식 단일 GIN. M2에서 재평가
    index("idx_songs_trgm").using(
      "gin",
      sql`(coalesce(${table.title}, '') || ' ' || coalesce(${table.artist}, '') || ' ' || coalesce(${table.memo}, '')) gin_trgm_ops`,
    ),
  ],
);

export const songNumbers = pgTable(
  "song_numbers",
  {
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    brand: brandEnum("brand").notNull(),
    number: text("number"),
    status: numberStatusEnum("status").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.songId, table.brand] }),
    check(
      "song_numbers_available_requires_number",
      sql`${table.status} <> 'AVAILABLE' OR ${table.number} IS NOT NULL`,
    ),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    visitDate: date("visit_date").notNull(),
    venue: text("venue").notNull(),
    brand: brandEnum("brand").notNull(),
    isPublic: boolean("is_public").notNull().default(false),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_sessions_owner_date").on(
      table.ownerId,
      table.visitDate.desc(),
    ),
    // 부분 유니크 인덱스 — "열린 세션은 사용자당 1개"를 DB가 강제 (ARCHITECT §4.3)
    uniqueIndex("idx_sessions_open")
      .on(table.ownerId)
      .where(sql`${table.closedAt} IS NULL`),
  ],
);

export const entries = pgTable(
  "entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    score: numeric("score", { precision: 5, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_entries_session").on(table.sessionId, table.position)],
);

// Design Ref: §9.4 — 리포지토리의 db.query.*.findFirst({ with }) 조인에 필요
export const songsRelations = relations(songs, ({ many }) => ({
  numbers: many(songNumbers),
  entries: many(entries),
}));

export const songNumbersRelations = relations(songNumbers, ({ one }) => ({
  song: one(songs, { fields: [songNumbers.songId], references: [songs.id] }),
}));

export const sessionsRelations = relations(sessions, ({ many }) => ({
  entries: many(entries),
}));

export const entriesRelations = relations(entries, ({ one }) => ({
  session: one(sessions, { fields: [entries.sessionId], references: [sessions.id] }),
  song: one(songs, { fields: [entries.songId], references: [songs.id] }),
}));
