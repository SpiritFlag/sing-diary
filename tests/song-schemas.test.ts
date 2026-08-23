// Design Ref: §8.4 — SN-1/SN-2/SQ-1. DB 불필요, activateTestDatabase() 호출하지 않는다.
import { describe, expect, it } from "vitest";
import { toLikePattern } from "@/infrastructure/repositories/drizzle-song-query";
import { setSongNumberSchema, updateSongMetaSchema } from "@/presentation/api/schemas";

describe("updateSongMetaSchema (SN-1)", () => {
  it("공백만 있는 문자열은 null로 정규화된다", () => {
    const parsed = updateSongMetaSchema.parse({ title: "  " });
    expect(parsed.title).toBeNull();
  });

  it("값이 있는 문자열은 trim만 되고 유지된다", () => {
    const parsed = updateSongMetaSchema.parse({ title: "  곡  " });
    expect(parsed.title).toBe("곡");
  });

  it("빈 객체는 실패한다 — 변경할 필드가 없음", () => {
    expect(() => updateSongMetaSchema.parse({})).toThrow();
  });
});

describe("setSongNumberSchema (SN-2)", () => {
  it("AVAILABLE + 빈 번호는 실패한다", () => {
    expect(() => setSongNumberSchema.parse({ status: "AVAILABLE", number: "" })).toThrow();
  });

  it("UNSUPPORTED에 number를 동봉하면 실패한다", () => {
    expect(() =>
      setSongNumberSchema.parse({ status: "UNSUPPORTED", number: "12345" }),
    ).toThrow();
  });

  it("AVAILABLE + 유효 번호는 통과한다", () => {
    const parsed = setSongNumberSchema.parse({ status: "AVAILABLE", number: "12345" });
    expect(parsed).toEqual({ status: "AVAILABLE", number: "12345" });
  });

  it("UNSUPPORTED 단독은 통과한다", () => {
    const parsed = setSongNumberSchema.parse({ status: "UNSUPPORTED" });
    expect(parsed).toEqual({ status: "UNSUPPORTED" });
  });
});

describe("toLikePattern (SQ-1)", () => {
  it("%, _, \\ 를 리터럴로 이스케이프하고 앞뒤에 %를 붙인다", () => {
    expect(toLikePattern("100%_경계\\선")).toBe("%100\\%\\_경계\\\\선%");
  });

  it("일반 키워드는 앞뒤에만 %가 붙는다", () => {
    expect(toLikePattern("사랑해")).toBe("%사랑해%");
  });
});
