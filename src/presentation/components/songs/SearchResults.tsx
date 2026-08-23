"use client";

// Design Ref: §4.1, §5.2, §5.5 — 통합검색 결과 + AVAILABLE 분기 한정 추가(D-A).
// 추가는 신규 API를 만들지 않고 기존 POST /api/sessions/:id/entries를 재사용한다(module-4 결정,
// Design §6.2가 열어두고 확정하지 않았던 지점) — AVAILABLE 곡의 번호를 그대로 넘기면
// findByOwnerBrandNumber가 같은 곡을 찾아 stub 생성 없이 정확히 그 곡을 추가한다.
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Brand } from "@/domain";
import type { SongListItem } from "@/application/ports/song-query";
import { useToast } from "@/presentation/components/ui/toast";
import { SearchBox } from "./SearchBox";

interface ApiError {
  error?: { message?: string };
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  const body: ApiError | null = await res.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

type NumberState =
  | { addable: true; number: string; label: string }
  | { addable: false; number: null; label: string };

function numberState(item: SongListItem, brand: Brand): NumberState {
  const n = item.numbers[brand];
  if (!n) return { addable: false, number: null, label: "번호가 아직 없어요" };
  if (n.status === "UNSUPPORTED") {
    return { addable: false, number: null, label: "이 기기에선 미지원" };
  }
  // status === "AVAILABLE" — 3-state 계약상 number가 항상 존재한다 (§4.2 CHECK 제약)
  return { addable: true, number: n.number as string, label: n.number as string };
}

export function SearchResults({
  sessionId,
  brand,
}: {
  sessionId: string | null;
  brand: Brand | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [results, setResults] = useState<SongListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  async function handleSearch(keyword: string) {
    setLoading(true);
    try {
      const url = new URL("/api/songs/search", window.location.origin);
      url.searchParams.set("q", keyword);
      if (brand) url.searchParams.set("brand", brand);
      const res = await fetch(url.toString());
      if (!res.ok) {
        toast.show(await parseErrorMessage(res, "검색에 실패했어요"));
        setResults([]);
        return;
      }
      const { data } = (await res.json()) as { data: SongListItem[] };
      setResults(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(item: SongListItem) {
    if (!sessionId || !brand) return;
    const state = numberState(item, brand);
    if (!state.addable) return;

    setAddingId(item.id);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: state.number }),
      });
      if (!res.ok) {
        toast.show(await parseErrorMessage(res, "곡 추가에 실패했어요"));
        return;
      }
      toast.show("오늘의 플리에 추가했어요", "mint");
      router.refresh();
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <SearchBox onSearch={handleSearch} />

      {!sessionId && (
        <p className="px-4 pb-2 text-xs text-text-dim">
          진행 중인 세션이 없어 검색만 가능해요. 세션을 시작하면 바로 추가할 수 있어요.
        </p>
      )}

      {loading && <p className="px-4 text-text-dim">검색 중...</p>}

      {results !== null && !loading && results.length === 0 && (
        <p className="flex flex-1 items-center justify-center px-6 text-center text-text-dim">
          검색 결과가 없어요
        </p>
      )}

      {results !== null && results.length > 0 && (
        <ul className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
          {results.map((item) => {
            const state = sessionId && brand ? numberState(item, brand) : null;
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2"
              >
                <div className="flex flex-1 flex-col">
                  <span className="text-sm text-text">{item.title ?? "제목 없음"}</span>
                  <span className="text-xs text-text-dim">{item.artist ?? "—"}</span>
                </div>
                {state && (
                  <>
                    <span className="text-xs text-text-dim">{state.label}</span>
                    <button
                      type="button"
                      disabled={!state.addable || addingId === item.id}
                      onClick={() => handleAdd(item)}
                      aria-label={state.addable ? "오늘의 플리에 추가" : state.label}
                      className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-40"
                    >
                      추가
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
