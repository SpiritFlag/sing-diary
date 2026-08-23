// Design Ref: §8.4 SS-1/SS-2 — song-state.ts 순수 함수. DB 불필요, activateTestDatabase() 호출하지 않는다.
import { describe, expect, it } from "vitest";
import type { Brand } from "@/domain";
import type { NumberView } from "@/application/ports/song-query";
import { addDecision, commitDecision } from "@/presentation/components/songs/song-state";

describe("commitDecision (SS-1)", () => {
  it("안 건드리고 나가면 값이 무엇이든 noop이다", () => {
    expect(commitDecision("", false)).toEqual({ kind: "noop" });
    expect(commitDecision("12345", false)).toEqual({ kind: "noop" });
    expect(commitDecision("   ", false)).toEqual({ kind: "noop" });
  });

  it("G-1: UNSUPPORTED(입력칸이 이미 \"\")에서 건드린 뒤 비우고 나가면 clear가 발동한다", () => {
    // 문자열 비교(draft === initial)로 판정하던 최초 구현은 여기서 "변경 없음"으로 오판해
    // UNSUPPORTED → 행 없음 전이가 영원히 도달 불가였다. touched 기반이라 도달한다.
    expect(commitDecision("", true)).toEqual({ kind: "clear" });
  });

  it("건드린 뒤 공백만 남기고 나가도 clear다", () => {
    expect(commitDecision("   ", true)).toEqual({ kind: "clear" });
  });

  it("번호를 입력하면 trim된 값으로 available이다", () => {
    expect(commitDecision(" 12 ", true)).toEqual({ kind: "available", number: "12" });
    expect(commitDecision("12345", true)).toEqual({ kind: "available", number: "12345" });
  });
});

const N = (status: "AVAILABLE" | "UNSUPPORTED", number: string | null): NumberView => ({
  status,
  number,
});
const numbers = (tj: NumberView, ky: NumberView): Record<Brand, NumberView> => ({
  TJ: tj,
  KY: ky,
});

describe("addDecision (SS-2)", () => {
  it("행 없음(null)이면 missing이다", () => {
    expect(addDecision(numbers(null, null), "TJ")).toEqual({ kind: "missing" });
  });

  it("UNSUPPORTED면 unsupported다", () => {
    expect(addDecision(numbers(N("UNSUPPORTED", null), null), "TJ")).toEqual({
      kind: "unsupported",
    });
  });

  it("AVAILABLE이면 번호와 함께 available이다", () => {
    expect(addDecision(numbers(N("AVAILABLE", "11111"), null), "TJ")).toEqual({
      kind: "available",
      number: "11111",
    });
  });

  it("브랜드 교차: TJ 번호만 있는 곡을 KY 세션에서 판정하면 missing이다", () => {
    const song = numbers(N("AVAILABLE", "11111"), null);
    expect(addDecision(song, "TJ")).toEqual({ kind: "available", number: "11111" });
    expect(addDecision(song, "KY")).toEqual({ kind: "missing" });
  });

  it("판정은 오직 오늘 브랜드만 본다 — 다른 브랜드가 UNSUPPORTED여도 영향 없다", () => {
    const song = numbers(N("UNSUPPORTED", null), N("AVAILABLE", "22222"));
    expect(addDecision(song, "KY")).toEqual({ kind: "available", number: "22222" });
  });

  it("AVAILABLE인데 번호가 비어 오면(계약 위반) missing으로 떨어뜨린다", () => {
    expect(addDecision(numbers(N("AVAILABLE", null), null), "TJ")).toEqual({ kind: "missing" });
  });
});
