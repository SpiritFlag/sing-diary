"use client";

// Design Ref: §4.1, §5.2, §5.5 + expand-playlist-import §5.4, §2.3 D-R — 통합검색 결과.
//
// 직전 사이클까지 이 파일은 "AVAILABLE 곡의 번호를 도로 POST해 findByOwnerBrandNumber가 같은
// 곡을 찾게 하는" 우회로 추가를 구현했고, 그래서 UNSUPPORTED·행없음 곡의 버튼은 잠겨 있었다
// (넘길 번호가 없으니 구조적으로 불가능했다). songId 기반 경로가 생긴 지금 그 우회는 사라졌고,
// 추가 UI는 지난 플리 상세와 공유하는 AddSongFlow가 통째로 진다 — 판정도 요청도 여기 없다.
import { useState } from "react";
import type { Brand } from "@/domain";
import type { SongListItem } from "@/application/ports/song-query";
import { useToast } from "@/presentation/components/ui/toast";
import { AddSongFlow, parseErrorMessage } from "./AddSongFlow";
import { SearchBox } from "./SearchBox";

export function SearchResults({
  sessionId,
  brand,
}: {
  sessionId: string | null;
  brand: Brand | null;
}) {
  const toast = useToast();
  const [results, setResults] = useState<SongListItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch(keyword: string) {
    setLoading(true);
    try {
      // FR-17 — brand는 보내지 않는다. 통합검색은 브랜드와 무관하고 서버도 더 이상 읽지 않는다.
      const url = new URL("/api/songs/search", window.location.origin);
      url.searchParams.set("q", keyword);
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
          {results.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2"
            >
              <div className="flex flex-1 flex-col">
                <span className="text-sm text-text">{item.title ?? "제목 없음"}</span>
                <span className="text-xs text-text-dim">{item.artist ?? "—"}</span>
              </div>
              {/* 열린 세션이 없으면 추가 열 자체를 렌더하지 않는다 (기존 동작 유지) */}
              {sessionId && brand && (
                <AddSongFlow song={item} sessionId={sessionId} todayBrand={brand} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
