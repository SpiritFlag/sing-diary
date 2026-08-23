"use client";

// Design Ref: §5.4, §9.1 — 번호 3-state 편집. "비움"과 "미지원"은 서로 다른 조작이다(M3 큐 계약).
// dirty-check(모듈-5 결정, Check 단계 G-1 수정): UNSUPPORTED·행없음 상태는 입력칸이 똑같이
// "" 비어 보이므로 문자열 비교(draft === initial)로는 두 상태를 구분할 수 없다 — 처음 구현은
// 이 때문에 UNSUPPORTED에서 "지우고 확정"이 영원히 발동 못 하는 사각지대가 있었다(값이 이미
// ""이라 "변경 없음"으로 오판). 그래서 "값이 무엇인가"가 아니라 "사용자가 실제로 타이핑했는가"
// (touched)로 판정을 바꿨다 — 아무것도 안 건드리고 나가면 상태 그대로, 건드린 뒤 비워서
// 나가면(중간에 다시 지워도 포함) 진짜 "지우고 확정"으로 취급한다.
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
    if (!touched) return; // 실제로 안 건드림 — 문자열이 뭐든 조용히 편집만 닫는다 (dirty-check)
    const trimmed = draft.trim();
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
