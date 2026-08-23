"use client";

// Design Ref: expand-fill-queue §5.1 — 큐 B 카드(메타 결손). 한쪽만 채워도 저장된다.
// 남은 쪽이 여전히 비어 있으면 그 곡은 큐 B에 남는다 — 그 판정은 서버 확정값을 받은
// fill-queue-state의 settleSuccess가 한다(§8.3 #3). 카드는 입력만 담당한다.
import { useState } from "react";
import type { SongListItem } from "@/application/ports/song-query";
import type { FillDraft } from "./fill-queue-state";

export function FillCardMeta({
  song,
  draft,
  onSave,
  onSkip,
}: {
  song: SongListItem;
  draft: FillDraft | null;
  onSave: (patch: { title: string; artist: string }) => void;
  onSkip: () => void;
}) {
  const restored = draft?.kind === "meta" ? draft : null;
  const [title, setTitle] = useState(restored?.title ?? song.title ?? "");
  const [artist, setArtist] = useState(restored?.artist ?? song.artist ?? "");
  const empty = !title.trim() && !artist.trim();

  return (
    <form
      className="flex flex-col gap-3 rounded-xl bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (empty) return;
        onSave({ title, artist });
      }}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-dim">
        {(["TJ", "KY"] as const).map((brand) => {
          const view = song.numbers[brand];
          return (
            <span key={brand} className="rounded-full bg-surface-raised px-2 py-0.5">
              {brand} {view?.status === "AVAILABLE" ? view.number : view ? "미지원" : "—"}
            </span>
          );
        })}
      </div>
      {draft && (
        <p className="text-xs text-danger">저장에 실패해 돌아온 곡이에요. 값은 그대로 뒀어요.</p>
      )}

      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목"
        className="rounded-lg bg-surface-raised px-3 py-2 text-sm text-text outline-none placeholder:text-text-dim"
      />
      <input
        value={artist}
        onChange={(e) => setArtist(e.target.value)}
        placeholder="아티스트"
        className="rounded-lg bg-surface-raised px-3 py-2 text-sm text-text outline-none placeholder:text-text-dim"
      />

      <div className="flex gap-2 text-sm">
        <button
          type="submit"
          disabled={empty}
          className="flex-1 rounded-lg bg-primary px-3 py-2 text-bg disabled:opacity-40"
        >
          저장
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="rounded-lg bg-surface-raised px-3 py-2 text-text-dim hover:text-text"
        >
          건너뛰기
        </button>
      </div>
    </form>
  );
}
