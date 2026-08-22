"use client";

// Design Ref: §5.4 — 순번·제목(NULL→#번호)·번호·점수·드래그 핸들·삭제
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { EntryWithSong } from "@/application/ports/entry-repo";
import { ScoreInput } from "./ScoreInput";

export function EntryRow({
  entry,
  position,
  isNewStub,
  onScoreChange,
  onDelete,
}: {
  entry: EntryWithSong;
  position: number;
  isNewStub: boolean;
  onScoreChange: (score: number | null) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const title = entry.song.title ?? (entry.song.number ? `#${entry.song.number}` : "#—");

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg bg-surface px-3 py-2 ${
        isDragging ? "opacity-60" : ""
      }`}
    >
      <button
        type="button"
        aria-label="순서 변경"
        className="cursor-grab touch-none px-1 text-text-dim active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <span className="w-5 text-sm text-text-dim">{position}</span>
      <div className="flex flex-1 flex-col">
        <span className="text-sm text-text">{title}</span>
        <div className="flex items-center gap-1 text-xs text-text-dim">
          {entry.song.number && <span>{entry.song.number}</span>}
          {isNewStub && (
            <span className="rounded-full bg-mint px-1.5 py-0.5 text-[10px] text-bg">
              새 곡
            </span>
          )}
        </div>
      </div>
      <ScoreInput value={entry.score} onCommit={onScoreChange} />
      <button
        type="button"
        onClick={onDelete}
        aria-label="삭제"
        className="px-1 text-danger"
      >
        ✕
      </button>
    </li>
  );
}
