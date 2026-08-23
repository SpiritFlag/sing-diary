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

// Design Ref: expand-playlist-import §4.2, §2.3 D-J·D-K, §10.1 C-8 — POST /api/sessions/:id/entries의
// 본문 유니언. "무엇으로 곡을 지목하는가"만 다르므로 라우트를 새로 만들지 않고 형태로 가른다.
// 기존 { number } 갈래는 addEntryByNumberSchema를 그대로 재사용해 바이트 단위로 보존된다 —
// 현장 번호 입력(AddByNumber)과 기존 L1 케이스는 요청이 한 글자도 바뀌지 않는다(Plan R1).
// .strict()가 없으면 { songId, number } 혼합 본문이 조용히 한쪽 갈래로 흡수된다(setSongNumberSchema 선례).
export const addEntrySchema = z.union([
  addEntryByNumberSchema.strict(),
  z
    .object({
      songId: z.string().uuid(),
      registerNumber: z.string().trim().min(1).max(10).optional(),
    })
    .strict(),
]);

export const reorderEntriesSchema = z.object({
  entryIds: z.array(z.string().uuid()).min(1),
});

export const updateEntryScoreSchema = z.object({
  score: z.number().min(0).max(100).multipleOf(0.01).nullable(),
});

// Design Ref: §4.2 D-F — "" → null 정규화의 단일 지점. 이 함수 밖에서 정규화하지 않는다.
const nullableText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => (v.trim() === "" ? null : v.trim()))
    .nullable();

export const searchSongsQuerySchema = z.object({
  q: z.string().trim().min(1, "검색어를 입력하세요").max(100),
});

export const updateSongMetaSchema = z
  .object({
    title: nullableText(200).optional(),
    artist: nullableText(200).optional(),
    memo: nullableText(500).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "변경할 필드가 없습니다");

// Design Ref: §4.2, §5.4 — 3-state를 타입으로 강제. AVAILABLE엔 번호 필수, UNSUPPORTED엔 번호 금지.
// .strict()가 없으면 zod object가 알 수 없는 키를 조용히 버려 UNSUPPORTED+number 동봉을 통과시킨다.
export const setSongNumberSchema = z.discriminatedUnion("status", [
  z
    .object({ status: z.literal("AVAILABLE"), number: z.string().trim().min(1).max(10) })
    .strict(),
  z.object({ status: z.literal("UNSUPPORTED") }).strict(),
]);

export const brandParamSchema = z.enum(["TJ", "KY"]);
