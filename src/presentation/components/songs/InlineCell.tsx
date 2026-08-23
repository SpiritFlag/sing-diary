"use client";

// Design Ref: §5.3, §9.1 — 제목·아티스트·메모 인라인 편집. 값이 안 바뀌었으면 커밋하지 않는다.
// "" → null 정규화는 서버 Zod 스키마가 재검증하는 진짜 지점이다(D-F) — 여기서 하는 trim은
// 화면 표시·변경 여부 판정을 위한 것일 뿐, 서버는 클라이언트가 뭘 보내든 스스로 다시 정규화한다.
import { useState } from "react";

export function InlineCell({
  value,
  placeholder,
  disabled,
  onCommit,
}: {
  value: string | null;
  placeholder: string;
  disabled: boolean;
  onCommit: (next: string | null) => void;
}) {
  const initial = value ?? "";
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
        className="w-full truncate rounded-md px-2 py-1 text-left text-sm text-text hover:bg-surface-raised disabled:opacity-50"
      >
        {value ?? <span className="text-text-dim">{placeholder}</span>}
      </button>
    );
  }

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === initial.trim()) return; // 변경 없음 — 조용히 편집만 닫는다
    onCommit(trimmed === "" ? null : trimmed);
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setEditing(false);
      }}
      className="w-full rounded-md bg-surface-raised px-2 py-1 text-sm text-text outline-none"
    />
  );
}
