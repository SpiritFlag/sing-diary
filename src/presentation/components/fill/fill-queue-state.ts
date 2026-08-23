// Design Ref: expand-fill-queue §2.3 D-D·D-E·D-F·D-J, §3.4, §10.4 C-6 — 빈칸채우기 큐의 진행 상태 머신.
// React·fetch·DOM을 모른다. 여기의 관심사는 "판정"이 아니라 "목록 진행"이다 — 무엇이 결손인가는
// 서버 SQL이 정하고(§3.3), 이 모듈은 그 스냅샷 위에서 카드가 나가고 돌아오는 순서만 굴린다.
//
// song-state.ts의 commitDecision을 재사용하지 않는 이유는 D-E에 있다 — 큐 A 카드에는 "지울 행"이
// 없어(행이 없어서 큐에 온 것) clear 분기가 도달 불가다. 빈 입력은 저장 버튼이 막는다.
import type { Brand } from "@/domain";
import type { NumberInput } from "@/application/ports/song-repo";
import type { FillQueueSnapshot, SongListItem } from "@/application/ports/song-query";

/** 동시 전송 상한 (D-F). 초과분은 대기열에서 슬롯을 기다린다 */
export const MAX_IN_FLIGHT = 4;

export type TabKey = "tj" | "ky" | "meta";
export const TAB_KEYS = ["tj", "ky", "meta"] as const;

export const TAB_LABEL: Record<TabKey, string> = {
  tj: "TJ 번호",
  ky: "KY 번호",
  meta: "제목·아티스트",
};

const TAB_BRAND: Record<"tj" | "ky", Brand> = { tj: "TJ", ky: "KY" };

/** 실패 시 되살릴 입력값 (D-J). 카드가 그대로 다시 그릴 수 있는 형태로 들고 있는다 */
export type FillDraft =
  | { kind: "number"; brand: Brand; input: NumberInput }
  | { kind: "meta"; title: string; artist: string };

export interface PendingSave {
  /** `${tab}:${songId}` — 한 탭의 한 곡은 동시에 한 건만 전송 중일 수 있다 */
  id: string;
  tab: TabKey;
  songId: string;
  draft: FillDraft;
}

export interface FillState {
  /** songId → 최신 확정값. 세 탭이 이 하나를 공유한다 (D-D) */
  songs: ReadonlyMap<string, SongListItem>;
  tabs: Record<TabKey, readonly string[]>;
  /**
   * 입장 시점에 그 탭의 할 일이었던 곡들. 실패·부분저장으로 카드를 되돌릴 때 "원래 이 탭 소속이었나"를
   * 여기서 묻는다 — 저장 응답에 딸려 온 다른 브랜드의 결손을 보고 없던 일감을 새로 만들지 않기 위해서다.
   * 큐는 실시간 동기화 대상이 아니라 이번 방문의 소모품 목록이다 (D-B). 새 결손은 새로고침이 줍는다.
   */
  members: Record<TabKey, ReadonlySet<string>>;
  inFlight: readonly PendingSave[];
  waiting: readonly PendingSave[];
  /** 실패해 돌아온 카드의 입력값 — 카드가 이걸 보고 친 값을 되살린다 (D-J) */
  drafts: ReadonlyMap<string, FillDraft>;
  /** 이번 방문 시작 시점의 분모. 진행 표시 n/N의 N (FR-06) */
  totals: Record<TabKey, number>;
  /**
   * owner의 전체 곡 수(스냅샷이 실어 온 값). 빈 상태 3종을 가르는 데만 쓴다 —
   * 0이면 "아직 곡이 없어요", 0보다 큰데 할 일이 없으면 "다 채웠어요"다 (Check Gap-1).
   */
  totalSongs: number;
  failedCount: number;
}

/** 발사 지시 — 상태 전이 함수는 "무엇을 보내라"만 알려주고, 실제 fetch는 컴포넌트가 한다 */
export interface Transition {
  state: FillState;
  launch: readonly PendingSave[];
}

export function saveIdOf(tab: TabKey, songId: string): string {
  return `${tab}:${songId}`;
}

/**
 * 서버 판정(§3.3)의 클라이언트 거울. 초기 선별에는 절대 쓰지 않는다 — 저장 성공 뒤 그 곡이
 * 아직 다른 탭에 남아야 하는지를 다시 세는 데만 쓴다(예: 큐 B에서 title만 채우면 잔류).
 * 기준식이 서버와 어긋나면 화면이 거짓말을 하므로, §3.3을 고칠 때 여기도 같이 고칠 것.
 */
export function qualifies(song: SongListItem, tab: TabKey): boolean {
  if (tab === "meta") return song.title === null || song.artist === null;
  return song.numbers[TAB_BRAND[tab]] === null;
}

export function initialState(snapshot: FillQueueSnapshot): FillState {
  const songs = new Map<string, SongListItem>();
  const tabs = {} as Record<TabKey, string[]>;
  for (const tab of TAB_KEYS) {
    tabs[tab] = snapshot[tab].map((song) => {
      // 같은 곡이 세 배열에 다 실려 올 수 있다(Plan R3). 저장소에는 한 번만 앉힌다 (D-D)
      songs.set(song.id, song);
      return song.id;
    });
  }
  return {
    songs,
    tabs,
    members: {
      tj: new Set(tabs.tj),
      ky: new Set(tabs.ky),
      meta: new Set(tabs.meta),
    },
    inFlight: [],
    waiting: [],
    drafts: new Map(),
    totals: { tj: tabs.tj.length, ky: tabs.ky.length, meta: tabs.meta.length },
    totalSongs: snapshot.totalSongs,
    failedCount: 0,
  };
}

/** 슬롯이 비는 만큼 대기열을 승격시킨다. 발사 대상만 따로 돌려준다 (D-F) */
function promote(state: FillState): Transition {
  const slots = MAX_IN_FLIGHT - state.inFlight.length;
  if (slots <= 0 || state.waiting.length === 0) return { state, launch: [] };
  const launch = state.waiting.slice(0, slots);
  return {
    state: {
      ...state,
      inFlight: [...state.inFlight, ...launch],
      waiting: state.waiting.slice(launch.length),
    },
    launch,
  };
}

/**
 * 카드 확정 — 탭에서 즉시 빼고(낙관적 이동, FR-10) 전송 대기열에 넣는다.
 * 응답을 기다리지 않으므로 화면은 이 함수가 돌아온 순간 다음 카드로 넘어간다.
 */
export function enqueueSave(
  state: FillState,
  tab: TabKey,
  songId: string,
  draft: FillDraft,
): Transition {
  const id = saveIdOf(tab, songId);
  const drafts = new Map(state.drafts);
  drafts.delete(id); // 재시도 성공 시 옛 draft가 남지 않게
  const next: FillState = {
    ...state,
    tabs: { ...state.tabs, [tab]: state.tabs[tab].filter((sid) => sid !== songId) },
    waiting: [...state.waiting, { id, tab, songId, draft }],
    drafts,
  };
  return promote(next);
}

/** 건너뛰기 — 이번 방문에서만 뒤로 민다. 서버도 저장소도 건드리지 않는다 (FR-12) */
export function skip(state: FillState, tab: TabKey): FillState {
  const list = state.tabs[tab];
  if (list.length < 2) return state;
  return { ...state, tabs: { ...state.tabs, [tab]: [...list.slice(1), list[0]] } };
}

/**
 * 저장 성공 — 저장소를 서버 확정값으로 갱신하고, 그 곡이 아직 결손인 탭에만 남긴다.
 * 큐 B에서 title만 채운 곡은 여기서 meta 탭 끝으로 되돌아온다(§5.1, UNIT #3).
 */
export function settleSuccess(
  state: FillState,
  id: string,
  confirmed: SongListItem,
): Transition {
  const songs = new Map(state.songs);
  songs.set(confirmed.id, confirmed);

  const busy = new Set(
    [...state.inFlight, ...state.waiting].filter((p) => p.id !== id).map((p) => p.id),
  );
  const tabs = { ...state.tabs };
  for (const tab of TAB_KEYS) {
    const list = tabs[tab];
    const present = list.includes(confirmed.id);
    if (qualifies(confirmed, tab) && state.members[tab].has(confirmed.id)) {
      // 전송 중인 카드는 되돌리지 않는다 — 그 응답이 제 몫을 판정한다
      if (!present && !busy.has(saveIdOf(tab, confirmed.id))) {
        tabs[tab] = [...list, confirmed.id];
      }
    } else if (present) {
      tabs[tab] = list.filter((sid) => sid !== confirmed.id);
    }
  }

  return promote({
    ...state,
    songs,
    tabs,
    inFlight: state.inFlight.filter((p) => p.id !== id),
  });
}

/**
 * 저장 실패 — 카드를 **입력값을 실은 채** 그 탭 끝으로 되돌린다 (D-J, R1의 심장).
 * 빈 카드로 돌려보내면 사용자에게 "뭘 쳤었는지" 기억을 요구하는 셈이라 조용한 유실과 다르지 않다.
 */
export function settleFailure(state: FillState, id: string): Transition {
  const pending = state.inFlight.find((p) => p.id === id);
  const inFlight = state.inFlight.filter((p) => p.id !== id);
  if (!pending) return promote({ ...state, inFlight });

  const drafts = new Map(state.drafts);
  drafts.set(pending.id, pending.draft);
  const list = state.tabs[pending.tab];
  return promote({
    ...state,
    inFlight,
    drafts,
    failedCount: state.failedCount + 1,
    tabs: {
      ...state.tabs,
      [pending.tab]: list.includes(pending.songId) ? list : [...list, pending.songId],
    },
  });
}

/** 전송이 다 정산됐는가 — 완료 화면의 전제 (FR-13) */
export function isSettled(state: FillState): boolean {
  return state.inFlight.length === 0 && state.waiting.length === 0;
}

/** 세 탭이 다 비었고 전송도 다 끝났는가. 둘 중 하나라도 아니면 완료가 아니다 */
export function isComplete(state: FillState): boolean {
  return TAB_KEYS.every((tab) => state.tabs[tab].length === 0) && isSettled(state);
}

export function pendingCount(state: FillState): number {
  return state.inFlight.length + state.waiting.length;
}

/** 진행 표시 n/N — 분모는 입장 시점 고정, 분자는 실패 복귀로 되돌아갈 수 있다(정직하게) */
export function progressOf(state: FillState, tab: TabKey): { done: number; total: number } {
  return {
    done: Math.max(0, state.totals[tab] - state.tabs[tab].length),
    total: state.totals[tab],
  };
}

export function currentCard(state: FillState, tab: TabKey): SongListItem | null {
  const songId = state.tabs[tab][0];
  return songId ? (state.songs.get(songId) ?? null) : null;
}

export function draftFor(state: FillState, tab: TabKey, songId: string): FillDraft | null {
  return state.drafts.get(saveIdOf(tab, songId)) ?? null;
}
