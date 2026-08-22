"use client";

// Design Ref: §5.4 — 점수 인라인 입력. 미채점은 "—", 빈값 저장은 null
import { useState } from "react";

export function ScoreInput({
  value,
  onCommit,
}: {
  value: string | null;
  onCommit: (score: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value ?? "");
          setEditing(true);
        }}
        className="w-16 rounded-md bg-surface-raised px-2 py-1 text-right text-sm text-accent"
      >
        {value ?? "—"}
      </button>
    );
  }

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === "") {
      onCommit(null);
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) return;
    onCommit(parsed);
  }

  return (
    <input
      autoFocus
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className="w-16 rounded-md bg-surface-raised px-2 py-1 text-right text-sm text-text outline-none"
    />
  );
}
