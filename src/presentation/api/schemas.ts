// Design Ref: §4.2 — 요청 검증 스키마
import { z } from "zod";

export const createSessionSchema = z.object({
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다"),
  venue: z.string().min(1).max(100),
  brand: z.enum(["TJ", "KY"]),
});

export const addEntryByNumberSchema = z.object({
  number: z.string().min(1).max(10),
});

export const reorderEntriesSchema = z.object({
  entryIds: z.array(z.string().uuid()).min(1),
});

export const updateEntryScoreSchema = z.object({
  score: z.number().min(0).max(100).multipleOf(0.01).nullable(),
});
