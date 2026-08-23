// Design Ref: expand-playlist-import §8.4 SC-1 — addEntrySchema 유니언. DB 불필요.
import { describe, expect, it } from "vitest";
import { addEntrySchema } from "@/presentation/api/schemas";

const SONG_ID = "11111111-2222-4333-8444-555555555555";

describe("addEntrySchema (SC-1)", () => {
  it("기존 { number } 형태가 그대로 통과한다 — 현장 번호 입력 경로 보존 (Plan R1)", () => {
    expect(addEntrySchema.parse({ number: "12345" })).toEqual({ number: "12345" });
  });

  it("{ songId } 단독이 통과한다 — 그냥 추가 (D-S)", () => {
    expect(addEntrySchema.parse({ songId: SONG_ID })).toEqual({ songId: SONG_ID });
  });

  it("{ songId, registerNumber }가 통과하고 번호는 trim된다 (D-K)", () => {
    expect(addEntrySchema.parse({ songId: SONG_ID, registerNumber: " 777 " })).toEqual({
      songId: SONG_ID,
      registerNumber: "777",
    });
  });

  it("{ songId, number } 혼합 본문은 실패한다 — .strict()가 없으면 조용히 한쪽으로 흡수된다 (C-8)", () => {
    expect(() => addEntrySchema.parse({ songId: SONG_ID, number: "12345" })).toThrow();
  });

  it("빈 본문·미지의 키는 실패한다", () => {
    expect(() => addEntrySchema.parse({})).toThrow();
    expect(() => addEntrySchema.parse({ number: "12345", foo: 1 })).toThrow();
  });

  it("songId가 UUID가 아니면 실패한다", () => {
    expect(() => addEntrySchema.parse({ songId: "not-a-uuid" })).toThrow();
  });

  it("registerNumber가 빈 문자열이면 실패한다 — 3-state의 AVAILABLE엔 번호가 필수다", () => {
    expect(() => addEntrySchema.parse({ songId: SONG_ID, registerNumber: "  " })).toThrow();
  });
});
