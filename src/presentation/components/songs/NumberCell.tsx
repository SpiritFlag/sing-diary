"use client";

// Design Ref: §5.4, §9.1 — 번호 3-state 편집. "비움"과 "미지원"은 서로 다른 조작이다(M3 큐 계약).
// Design Ref: expand-playlist-import §3.5, §10.1 C-6 — 확정 판정(dirty-check 포함)은 이 컴포넌트가
// 아니라 song-state.ts의 commitDecision()이 한다. G-1 수정의 근거는 그 함수 주석에 있다.
// 여기 남은 것은 편집 상태(editing/draft/touched)와 그 판정 결과를 콜백으로 흘리는 일뿐이다.
import { useState } from "react";
import type { NumberView } from "@/application/ports/song-query";
import { commitDecision } from "./song-state";

export function NumberCell({
  value,
  disabled,
  onCommitAvailable,
  onToggleUnsupported,
  onClear,
}: {
  value: NumberView;
  disabled: boolean;
  onCommitAvailable: (number: string) => void;
  onToggleUnsupported: () => void;
  onClear: () => void;
}) {
  const initial = value?.status === "AVAILABLE" ? (value.number ?? "") : "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);
  const [touched, setTouched] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setDraft(initial);
          setTouched(false);
          setEditing(true);
        }}
        className="w-20 rounded-md bg-surface-raised px-2 py-1 text-left text-sm disabled:opacity-50"
      >
        {value?.status === "UNSUPPORTED" ? (
          <span className="rounded-full bg-danger/20 px-1.5 py-0.5 text-[10px] text-danger">
            미지원
          </span>
        ) : (
          <span className={value ? "text-text" : "text-text-dim"}>{value?.number ?? "—"}</span>
        )}
      </button>
    );
  }

  function commit() {
    setEditing(false);
    const decision = commitDecision(draft, touched);
    if (decision.kind === "noop") return;
    if (decision.kind === "clear") {
      onClear();
      return;
    }
    onCommitAvailable(decision.number);
  }

  return (
    <div className="flex w-20 flex-col gap-1">
      <input
        autoFocus
        inputMode="numeric"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setTouched(true);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full rounded-md bg-surface-raised px-2 py-1 text-sm text-text outline-none"
      />
      <button
        type="button"
        // blur보다 먼저 처리되도록 — 그렇지 않으면 commit()이 먼저 불려 dirty-check에 걸린다
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setEditing(false);
          onToggleUnsupported();
        }}
        className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] text-text-dim hover:text-danger"
      >
        미지원으로
      </button>
    </div>
  );
}
