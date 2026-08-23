"use client";

// Design Ref: expand-playlist-import §5.3, §2.3 D-R — ARCHITECT §5.2 브랜드 변환 3분기 UI.
// 검색 결과와 지난 플리 상세가 이 컴포넌트를 그대로 공유한다. 각자 만들면 두 화면의 규칙이
// 갈린다 — 판정은 song-state.ts가, 표현은 여기가, 두 화면은 조립만 한다.
//
// 세 분기 모두 "번호 입력 제안"과 "건너뛰고 추가"를 갖춘다(ARCHITECT §5.2). 건너뛰기는 번호
// 상태를 일절 건드리지 않는다(D-S) — 결손은 M3 빈칸채우기 큐가 회수한다.
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Brand } from "@/domain";
import type { NumberView } from "@/application/ports/song-query";
import { useToast } from "@/presentation/components/ui/toast";
import { addDecision } from "./song-state";

interface ApiError {
  error?: { message?: string };
}

export async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  const body: ApiError | null = await res.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

export interface AddSongTarget {
  id: string;
  title: string | null;
  numbers: Record<Brand, NumberView>;
}

export function AddSongFlow({
  song,
  sessionId,
  todayBrand,
  label = "추가",
  onDone,
}: {
  song: AddSongTarget;
  /** 오늘 열린 세션. 없으면 호출부가 이 컴포넌트를 렌더하지 않는다 */
  sessionId: string;
  todayBrand: Brand;
  label?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  const decision = addDecision(song.numbers, todayBrand);
  const songLabel = song.title ?? "이 곡";

  // Design Ref: §2.2 — POST 본문은 { songId } 또는 { songId, registerNumber } 두 가지뿐이다.
  // registerNumber가 실리면 서버가 단일 트랜잭션으로 번호 등록과 추가를 함께 끝낸다(D-K).
  async function post(registerNumber?: string) {
    setPending(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          registerNumber ? { songId: song.id, registerNumber } : { songId: song.id },
        ),
      });
      if (!res.ok) {
        // 시트는 닫지 않는다 — 사용자가 입력한 번호를 잃지 않고 다시 시도할 수 있어야 한다
        toast.show(await parseErrorMessage(res, "곡 추가에 실패했어요"));
        return;
      }
      toast.show("오늘의 플리에 추가했어요", "mint");
      setSheetOpen(false);
      setDraft("");
      router.refresh();
      onDone?.();
    } finally {
      setPending(false);
    }
  }

  // AVAILABLE 분기 — 시트 없이 탭 1회로 끝난다. 목록에서 세면 탭 2회(NFR).
  if (decision.kind === "available") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => post()}
        aria-label={`${songLabel} 오늘의 플리에 추가`}
        className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-40"
      >
        {label}
      </button>
    );
  }

  const message =
    decision.kind === "unsupported"
      ? `이 기기(${todayBrand})에선 미지원이에요`
      : `${todayBrand} 번호가 아직 없어요`;

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => setSheetOpen(true)}
        aria-label={`${songLabel} — ${message}`}
        className="shrink-0 rounded-lg bg-surface-raised px-3 py-1.5 text-sm text-text-dim disabled:opacity-40"
      >
        {label}
      </button>

      {sheetOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-black/50"
          onClick={() => !pending && setSheetOpen(false)}
        >
          <div
            className="flex w-full flex-col gap-3 rounded-t-2xl bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm text-text">{songLabel}</span>
              <span className="text-xs text-text-dim">{message}</span>
            </div>

            <input
              autoFocus
              inputMode="numeric"
              value={draft}
              placeholder={`${todayBrand} 번호`}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim() !== "") void post(draft.trim());
              }}
              className="rounded-lg bg-surface-raised px-3 py-2 text-text outline-none"
            />

            <button
              type="button"
              disabled={pending || draft.trim() === ""}
              onClick={() => post(draft.trim())}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-bg disabled:opacity-40"
            >
              저장하고 추가
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => post()}
              className="rounded-lg bg-surface-raised px-3 py-2 text-sm text-text disabled:opacity-40"
            >
              그냥 추가
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setSheetOpen(false)}
              className="px-3 py-2 text-sm text-text-dim disabled:opacity-40"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </>
  );
}
