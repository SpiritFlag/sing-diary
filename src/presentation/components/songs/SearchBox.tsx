"use client";

// Design Ref: §5.5 — 검색 입력. 빈 키워드로는 요청하지 않는다(400을 UI에서 미리 막는다)
import { useRef, useState } from "react";

export function SearchBox({ onSearch }: { onSearch: (keyword: string) => void }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSearch(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 px-4 py-3">
      <input
        ref={inputRef}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="제목·아티스트·메모로 검색"
        className="flex-1 rounded-lg bg-surface px-3 py-2 text-text outline-none placeholder:text-text-dim"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
      >
        검색
      </button>
    </form>
  );
}
