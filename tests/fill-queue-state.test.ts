// Design Ref: expand-fill-queue §8.3 — 큐 진행 상태 머신의 전이 8건. 순수 함수라 DB도 브라우저도
// 필요 없다. R1(실패 유실 0)의 불변식이 여기서 고정된다(§6.2-4).
import { describe, expect, it } from "vitest";
import type { FillQueueSnapshot, SongListItem } from "../src/application/ports/song-query";
import {
  MAX_IN_FLIGHT,
  currentCard,
  draftFor,
  enqueueSave,
  initialState,
  isComplete,
  isSettled,
  pendingCount,
  progressOf,
  saveIdOf,
  settleFailure,
  settleSuccess,
  skip,
} from "../src/presentation/components/fill/fill-queue-state";

function song(id: string, over: Partial<SongListItem> = {}): SongListItem {
  return {
    id,
    title: `제목 ${id}`,
    artist: `가수 ${id}`,
    memo: null,
    numbers: { TJ: null, KY: null },
    updatedAt: new Date("2026-08-23T00:00:00Z"),
    ...over,
  };
}

const stub = song("stub", { title: null, artist: null });
const tjOnly = song("tjOnly", {
  numbers: { TJ: null, KY: { status: "AVAILABLE", number: "48727" } },
});
const titleNull = song("titleNull", {
  title: null,
  numbers: {
    TJ: { status: "AVAILABLE", number: "1" },
    KY: { status: "AVAILABLE", number: "2" },
  },
});

const snapshot: FillQueueSnapshot = {
  tj: [stub, tjOnly],
  ky: [stub],
  meta: [stub, titleNull],
};

describe("빈칸채우기 큐 상태 머신 (expand-fill-queue §8.3)", () => {
  it("#1 정규화 적재 — 중복 곡은 저장소에 1건, 탭 목록엔 각각 등장 (D-D)", () => {
    const s = initialState(snapshot);
    expect(s.songs.size).toBe(3); // stub이 세 배열에 다 있어도 한 번만
    expect(s.tabs.tj).toEqual(["stub", "tjOnly"]);
    expect(s.tabs.ky).toEqual(["stub"]);
    expect(s.tabs.meta).toEqual(["stub", "titleNull"]);
    expect(s.totals).toEqual({ tj: 2, ky: 1, meta: 2 });
  });

  it("#2 저장 성공 — 탭에서 제거 + 저장소 갱신이 다른 탭 카드 표시값에도 반영된다 (D-D)", () => {
    const s0 = initialState(snapshot);
    const { state: s1 } = enqueueSave(s0, "meta", "stub", {
      kind: "meta",
      title: "밤편지",
      artist: "아이유",
    });
    expect(s1.tabs.meta).toEqual(["titleNull"]); // 낙관적 이동 — 응답 전에 이미 빠졌다
    expect(currentCard(s1, "tj")?.title).toBeNull(); // 아직은 옛 값

    const confirmed = song("stub", { title: "밤편지", artist: "아이유" });
    const { state: s2 } = settleSuccess(s1, saveIdOf("meta", "stub"), confirmed);
    expect(s2.tabs.meta).toEqual(["titleNull"]); // 조건을 벗어나 잔류하지 않는다
    expect(s2.tabs.tj).toEqual(["stub", "tjOnly"]); // TJ 결손은 그대로
    expect(currentCard(s2, "tj")?.title).toBe("밤편지"); // 다른 탭 카드가 즉시 새 제목을 쓴다
  });

  it("#3 큐 B 부분 저장 — title만 채우면 meta에 남고, 둘 다 채우면 빠진다", () => {
    const s0 = initialState(snapshot);
    const { state: s1 } = enqueueSave(s0, "meta", "stub", {
      kind: "meta",
      title: "밤편지",
      artist: "",
    });
    const half = song("stub", { title: "밤편지", artist: null });
    const { state: s2 } = settleSuccess(s1, saveIdOf("meta", "stub"), half);
    expect(s2.tabs.meta).toEqual(["titleNull", "stub"]); // 잔류 — 끝으로 되돌아온다

    const { state: s3 } = enqueueSave(s2, "meta", "stub", {
      kind: "meta",
      title: "밤편지",
      artist: "아이유",
    });
    const full = song("stub", { title: "밤편지", artist: "아이유" });
    const { state: s4 } = settleSuccess(s3, saveIdOf("meta", "stub"), full);
    expect(s4.tabs.meta).toEqual(["titleNull"]);
  });

  it("#4 저장 실패 — draft를 실은 채 그 탭 끝으로 복귀한다. 유실 0 (D-J, R1)", () => {
    const s0 = initialState(snapshot);
    const draft = { kind: "number", brand: "TJ", input: { status: "AVAILABLE", number: "12345" } } as const;
    const { state: s1 } = enqueueSave(s0, "tj", "stub", draft);
    expect(s1.tabs.tj).toEqual(["tjOnly"]);

    const { state: s2 } = settleFailure(s1, saveIdOf("tj", "stub"));
    expect(s2.tabs.tj).toEqual(["tjOnly", "stub"]); // 맨 끝 — 앞의 흐름을 끊지 않는다
    expect(draftFor(s2, "tj", "stub")).toEqual(draft); // 친 번호가 살아 돌아왔다
    expect(s2.failedCount).toBe(1);
  });

  it("#5 건너뛰기 — 탭 뒤로만 민다. 저장소·전송 무접촉 (FR-12)", () => {
    const s0 = initialState(snapshot);
    const s1 = skip(s0, "tj");
    expect(s1.tabs.tj).toEqual(["tjOnly", "stub"]);
    expect(pendingCount(s1)).toBe(0);
    expect(s1.songs).toBe(s0.songs);
    expect(skip(s1, "ky").tabs.ky).toEqual(["stub"]); // 1건뿐이면 그대로
  });

  it("#6 in-flight 상한 — 5번째는 대기열에 서고, 슬롯이 나면 발사된다 (D-F)", () => {
    const many: FillQueueSnapshot = {
      tj: ["a", "b", "c", "d", "e"].map((id) => song(id)),
      ky: [],
      meta: [],
    };
    let s = initialState(many);
    const launched: string[] = [];
    for (const id of ["a", "b", "c", "d", "e"]) {
      const t = enqueueSave(s, "tj", id, {
        kind: "number",
        brand: "TJ",
        input: { status: "AVAILABLE", number: id },
      });
      s = t.state;
      launched.push(...t.launch.map((p) => p.songId));
    }
    expect(s.inFlight).toHaveLength(MAX_IN_FLIGHT);
    expect(s.waiting.map((p) => p.songId)).toEqual(["e"]);
    expect(launched).toEqual(["a", "b", "c", "d"]); // e는 아직 안 나갔다

    const t = settleSuccess(s, saveIdOf("tj", "a"), song("a", {
      numbers: { TJ: { status: "AVAILABLE", number: "a" }, KY: null },
    }));
    expect(t.launch.map((p) => p.songId)).toEqual(["e"]); // 슬롯이 나자마자 발사
    expect(t.state.waiting).toHaveLength(0);
  });

  it("#7 정산 — 카드가 다 떨어져도 전송이 남았으면 완료가 아니다 (FR-13)", () => {
    const one: FillQueueSnapshot = { tj: [song("a")], ky: [], meta: [] };
    const s0 = initialState(one);
    const { state: s1 } = enqueueSave(s0, "tj", "a", {
      kind: "number",
      brand: "TJ",
      input: { status: "AVAILABLE", number: "1" },
    });
    expect(s1.tabs.tj).toHaveLength(0); // 화면상 카드는 없다
    expect(isSettled(s1)).toBe(false);
    expect(isComplete(s1)).toBe(false); // 그래도 완료 화면은 아직

    const { state: s2 } = settleSuccess(s1, saveIdOf("tj", "a"), song("a", {
      numbers: { TJ: { status: "AVAILABLE", number: "1" }, KY: null },
    }));
    expect(isComplete(s2)).toBe(true);
    expect(progressOf(s2, "tj")).toEqual({ done: 1, total: 1 });
  });

  it("#8-a 없던 일감을 새로 만들지 않는다 — 응답에 딸려 온 다른 브랜드 결손은 이번 방문에 안 끼워넣는다 (D-B)", () => {
    // tj 탭에만 실려 온 곡. 저장 응답을 보면 KY도 비어 있지만, 이번 방문의 KY 목록엔 없던 곡이다.
    const one: FillQueueSnapshot = { tj: [song("a")], ky: [], meta: [] };
    const s0 = initialState(one);
    const { state: s1 } = enqueueSave(s0, "tj", "a", {
      kind: "number",
      brand: "TJ",
      input: { status: "AVAILABLE", number: "1" },
    });
    const { state: s2 } = settleSuccess(s1, saveIdOf("tj", "a"), song("a", {
      numbers: { TJ: { status: "AVAILABLE", number: "1" }, KY: null },
    }));
    expect(s2.tabs.ky).toEqual([]); // 새 결손은 새로고침이 줍는다
    expect(isComplete(s2)).toBe(true);
  });

  it("#8 미지원 저장 성공 — 큐 A에서 빠지고 저장소가 UNSUPPORTED가 된다", () => {
    const s0 = initialState(snapshot);
    const { state: s1 } = enqueueSave(s0, "tj", "tjOnly", {
      kind: "number",
      brand: "TJ",
      input: { status: "UNSUPPORTED" },
    });
    const confirmed = song("tjOnly", {
      numbers: {
        TJ: { status: "UNSUPPORTED", number: null },
        KY: { status: "AVAILABLE", number: "48727" },
      },
    });
    const { state: s2 } = settleSuccess(s1, saveIdOf("tj", "tjOnly"), confirmed);
    // 기준은 "행 없음"이다 — UNSUPPORTED 행이 생겼으므로 결손이 아니다
    expect(s2.tabs.tj).toEqual(["stub"]);
    expect(s2.songs.get("tjOnly")?.numbers.TJ).toEqual({ status: "UNSUPPORTED", number: null });
  });
});
