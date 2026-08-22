"use client";

// Design Ref: §5.4 — 하단 고정 번호 입력 바. 제출 후 입력 초기화·포커스 유지
import { useRef, useState } from "react";

export function AddByNumber({ onAdd }: { onAdd: (number: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onAdd(trimmed);
      setValue("");
    } finally {
      setSubmitting(false);
      inputRef.current?.focus();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="sticky bottom-0 flex gap-2 border-t border-surface-raised bg-bg px-4 py-3"
    >
      <input
        ref={inputRef}
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="번호 입력"
        maxLength={10}
        className="flex-1 rounded-lg bg-surface px-3 py-2 text-text outline-none placeholder:text-text-dim"
      />
      <button
        type="submit"
        disabled={!value.trim() || submitting}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
      >
        추가
      </button>
    </form>
  );
}
