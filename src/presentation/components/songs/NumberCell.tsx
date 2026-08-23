"use client";

// Design Ref: §5.4, §9.1 — 번호 3-state 편집. "비움"과 "미지원"은 서로 다른 조작이다(M3 큐 계약).
// dirty-check(모듈-5 결정): UNSUPPORTED·행없음 상태는 입력칸이 똑같이 비어 보인다. 값이 실제로
// 바뀌지 않았으면 blur만으로 DELETE를 쏘지 않는다 — 실수로 셀에 들어갔다 나가는 것만으로
// "미지원"이 "행 없음"으로 조용히 다운그레이드되는 것을 막는다.
import { useState } from "react";
import type { NumberView } from "@/application/ports/song-query";

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

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setDraft(initial);
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
    const trimmed = draft.trim();
    if (trimmed === initial) return; // 변경 없음 — 조용히 편집만 닫는다 (dirty-check)
    if (trimmed === "") {
      onClear();
      return;
    }
    onCommitAvailable(trimmed);
  }

  return (
    <div className="flex w-20 flex-col gap-1">
      <input
        autoFocus
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
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
