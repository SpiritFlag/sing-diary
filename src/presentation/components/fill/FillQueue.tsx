"use client";

// Design Ref: expand-fill-queue §2.1, §2.3 D-B·D-D·D-F, §5.1 — 빈칸채우기 큐의 클라이언트 루트.
// "무엇이 결손인가"는 서버가 판정해 스냅샷으로 내려주고(§3.3), 여기서는 그 위에서 카드가 나가고
// 돌아오는 진행만 굴린다. 전이는 전부 fill-queue-state.ts의 순수 함수다(C-6) — 이 파일에는
// 판정이 없다. 낙관적 갱신 패턴은 표(SongTable)의 셀 단위 원복이 아니라 **소모 목록의 draft 보존
// 재삽입**이다(C-9). 두 화면이 다른 것은 의도다(§5.6).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { NumberInput } from "@/application/ports/song-repo";
import type { FillQueueSnapshot, SongListItem } from "@/application/ports/song-query";
import { useToast } from "@/presentation/components/ui/toast";
import { FillCardMeta } from "./FillCardMeta";
import { FillCardNumber, identify } from "./FillCardNumber";
import {
  TAB_KEYS,
  TAB_LABEL,
  currentCard,
  draftFor,
  enqueueSave,
  initialState,
  isComplete,
  pendingCount,
  progressOf,
  settleFailure,
  settleSuccess,
  skip,
  type FillState,
  type PendingSave,
  type TabKey,
  type Transition,
} from "./fill-queue-state";

async function errorMessageOf(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? "저장에 실패했어요";
}

function sendOf(pending: PendingSave): Promise<Response> {
  const { songId, draft } = pending;
  if (draft.kind === "number") {
    return fetch(`/api/songs/${songId}/numbers/${draft.brand}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft.input),
    });
  }
  return fetch(`/api/songs/${songId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: draft.title, artist: draft.artist }),
  });
}

function firstNonEmpty(snapshotOrState: FillQueueSnapshot | FillState): TabKey {
  const lengthOf = (tab: TabKey) =>
    "tabs" in snapshotOrState ? snapshotOrState.tabs[tab].length : snapshotOrState[tab].length;
  return TAB_KEYS.find((tab) => lengthOf(tab) > 0) ?? "tj";
}

export function FillQueue({ initial }: { initial: FillQueueSnapshot }) {
  const toast = useToast();
  const [state, setState] = useState(() => initialState(initial));
  const [tab, setTab] = useState<TabKey>(() => firstNonEmpty(initial));
  const [refreshing, setRefreshing] = useState(false);
  // 전이 함수는 직전 상태를 동기적으로 알아야 한다 — 응답이 setState의 비동기 반영을 기다려주지 않는다.
  const stateRef = useRef(state);

  // apply ↔ fire의 상호 재귀 — 응답 하나가 정산되면서 대기열의 다음 건을 발사시킨다(D-F 슬롯 승계).
  // 상태는 전부 stateRef를 통해 읽으므로 렌더 사이에 갇힌 옛 값을 쓸 일이 없다.
  function commit(next: FillState) {
    stateRef.current = next;
    setState(next);
  }

  function apply(next: Transition) {
    commit(next.state);
    for (const pending of next.launch) void fire(pending);
  }

  async function fire(pending: PendingSave) {
    try {
      const res = await sendOf(pending);
      if (!res.ok) throw new Error(await errorMessageOf(res));
      const { data } = (await res.json()) as { data: SongListItem };
      apply(settleSuccess(stateRef.current, pending.id, data));
    } catch (e) {
      const song = stateRef.current.songs.get(pending.songId);
      const name = song ? identify(song, pending.draft.kind === "number" ? pending.draft.brand : "TJ") : "곡";
      apply(settleFailure(stateRef.current, pending.id));
      toast.show(`${name} — ${e instanceof Error ? e.message : "저장에 실패했어요"}`);
    }
  }

  const pending = pendingCount(state);

  // Design Ref: §2.3 D-F — 낙관적 이동의 대가. 전송이 남은 채 창을 닫으면 그만큼이 유실된다.
  useEffect(() => {
    if (pending === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [pending]);

  function saveNumber(songId: string, brand: "TJ" | "KY", input: NumberInput) {
    apply(enqueueSave(stateRef.current, tab, songId, { kind: "number", brand, input }));
  }

  function saveMeta(songId: string, patch: { title: string; artist: string }) {
    apply(enqueueSave(stateRef.current, tab, songId, { kind: "meta", ...patch }));
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/songs/fill");
      if (!res.ok) throw new Error(await errorMessageOf(res));
      const { data } = (await res.json()) as { data: FillQueueSnapshot };
      const fresh = initialState(data);
      commit(fresh);
      setTab(firstNonEmpty(fresh));
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "큐를 다시 불러오지 못했어요");
    } finally {
      setRefreshing(false);
    }
  }

  const card = currentCard(state, tab);
  const progress = progressOf(state, tab);
  const done = isComplete(state);
  // skip()은 1원소 배열을 회전시켜도 항등이라 no-op이다 — 그 사실을 버튼에 드러낸다 (Check Gap-3)
  const canSkip = state.tabs[tab].length > 1;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 p-4">
      <div className="flex gap-2 text-sm">
        {TAB_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${
              key === tab ? "bg-primary text-bg" : "bg-surface-raised text-text-dim"
            }`}
          >
            {TAB_LABEL[key]}
            <span className={key === tab ? "text-bg/70" : "text-text-dim"}>
              {state.tabs[key].length}
            </span>
          </button>
        ))}
      </div>

      {/* Design Ref: §5.1 빈 상태 3종 — 판정 기준은 스냅샷 크기가 아니라 전체 곡 수다(Check Gap-1).
          songs.size로 재면 다 채운 사용자에게 "아직 곡이 없어요"라고 거짓말한다. */}
      {state.totalSongs === 0 ? (
        <EmptyState
          title="아직 곡이 없어요"
          hint="현장에서 곡을 추가하면 채울 빈칸이 여기 모여요."
        />
      ) : done ? (
        <EmptyState title="빈칸이 없어요. 다 채웠어요." hint="有始有終 — 벌여둔 것을 다 갚았네." />
      ) : card ? (
        <>
          <p className="text-center text-xs text-text-dim">
            {progress.done} / {progress.total}
          </p>
          {tab === "meta" ? (
            <FillCardMeta
              key={card.id}
              song={card}
              draft={draftFor(state, tab, card.id)}
              canSkip={canSkip}
              onSave={(patch) => saveMeta(card.id, patch)}
              onSkip={() => commit(skip(stateRef.current, tab))}
            />
          ) : (
            <FillCardNumber
              key={card.id}
              song={card}
              brand={tab === "tj" ? "TJ" : "KY"}
              draft={draftFor(state, tab, card.id)}
              canSkip={canSkip}
              onSave={(input) => saveNumber(card.id, tab === "tj" ? "TJ" : "KY", input)}
              onSkip={() => commit(skip(stateRef.current, tab))}
            />
          )}
        </>
      ) : (
        <EmptyState title="이 탭은 다 채웠어요 🎉" hint="다른 탭에 남은 게 있는지 보게." />
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-surface-raised pt-3 text-xs text-text-dim">
        <span>
          전송 중 {pending}건 · 실패 {state.failedCount}건
        </span>
        <div className="flex items-center gap-3">
          {/* Design Ref: §5.5 동선 — 카드에서 못 고치는 것(메모 등)은 표에서 고친다 */}
          <Link href="/songs" className="hover:text-text">
            곡 관리에서 보기
          </Link>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing || pending > 0}
            className="rounded-full bg-surface-raised px-3 py-1 hover:text-text disabled:opacity-40"
          >
            {refreshing ? "불러오는 중" : "새로고침"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <p className="text-text">{title}</p>
      <p className="text-xs text-text-dim">{hint}</p>
      <Link href="/songs" className="mt-2 text-xs text-primary hover:underline">
        곡 관리로 가기
      </Link>
    </div>
  );
}
