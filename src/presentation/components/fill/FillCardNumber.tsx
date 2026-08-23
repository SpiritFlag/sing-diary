"use client";

// Design Ref: expand-fill-queue §5.1, §2.3 D-G — 큐 A 카드(번호 결손). 한 건씩 제시하고,
// 저장을 누르면 응답을 기다리지 않고 다음 카드로 넘어간다(FR-10 — 이동 자체는 FillQueue의 몫).
// 곡 식별자는 제목·아티스트, 그마저 없으면(stub) 반대 브랜드 번호가 유일한 단서다.
import { useState } from "react";
import type { Brand } from "@/domain";
import type { NumberInput } from "@/application/ports/song-repo";
import type { SongListItem } from "@/application/ports/song-query";
import type { FillDraft } from "./fill-queue-state";

const OTHER: Record<Brand, Brand> = { TJ: "KY", KY: "TJ" };

/** Design Ref: §2.3 D-G — 제목·아티스트 → 없으면 반대 브랜드 번호. 추가 조회 없이 스냅샷 안에서 해결된다 */
export function identify(song: SongListItem, brand: Brand): string {
  const named = [song.title, song.artist].filter(Boolean).join(" — ");
  if (named) return named;
  const other = song.numbers[OTHER[brand]];
  if (other?.status === "AVAILABLE" && other.number) {
    return `#${other.number} (${OTHER[brand]})`;
  }
  return "제목 없는 곡";
}

export function FillCardNumber({
  song,
  brand,
  draft,
  onSave,
  onSkip,
}: {
  song: SongListItem;
  brand: Brand;
  draft: FillDraft | null;
  onSave: (input: NumberInput) => void;
  onSkip: () => void;
}) {
  // 실패해 돌아온 카드는 친 값을 그대로 되살린다 (D-J, R1)
  const restored =
    draft?.kind === "number" && draft.input.status === "AVAILABLE" ? draft.input.number : "";
  const [value, setValue] = useState(restored);
  const trimmed = value.trim();
  const other = song.numbers[OTHER[brand]];

  return (
    <form
      className="flex flex-col gap-3 rounded-xl bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!trimmed) return;
        onSave({ status: "AVAILABLE", number: trimmed });
      }}
    >
      <div className="flex flex-col gap-1">
        <p className="text-base text-text">{identify(song, brand)}</p>
        {other?.status === "AVAILABLE" && other.number && (
          <p className="text-xs text-text-dim">
            {OTHER[brand]} {other.number}
          </p>
        )}
        {draft && (
          <p className="text-xs text-danger">저장에 실패해 돌아온 곡이에요. 값은 그대로 뒀어요.</p>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-text-dim">
        <span className="w-10 shrink-0">{brand}</span>
        <input
          autoFocus
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="번호"
          className="w-full rounded-lg bg-surface-raised px-3 py-2 text-text outline-none placeholder:text-text-dim"
        />
      </label>

      <div className="flex gap-2 text-sm">
        <button
          type="submit"
          disabled={!trimmed}
          className="flex-1 rounded-lg bg-primary px-3 py-2 text-bg disabled:opacity-40"
        >
          저장
        </button>
        <button
          type="button"
          onClick={() => onSave({ status: "UNSUPPORTED" })}
          className="rounded-lg bg-surface-raised px-3 py-2 text-text-dim hover:text-danger"
        >
          미지원
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
