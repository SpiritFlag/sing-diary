"use client";

// Design Ref: §5.3, §5.5, §9.1 — PC 곡 관리 표. 셀 단위 낙관적 갱신(D-G, Plan R1의 해소).
// Playlist.tsx식 "리스트 전체 스냅샷 복원"은 여기서 금지다 — 표는 여러 셀이 동시에 저장 중일 수
// 있고, 뒤늦게 도착한 실패가 그 사이의 다른 성공을 덮어써서는 안 된다.
import { useReducer, useRef, useState } from "react";
import type { Brand } from "@/domain";
import type { NumberInput } from "@/application/ports/song-repo";
import type { NumberView, SongListItem } from "@/application/ports/song-query";
import { useToast } from "@/presentation/components/ui/toast";
import { InlineCell } from "./InlineCell";
import { NumberCell } from "./NumberCell";

type TextField = "title" | "artist" | "memo";
type CellKey = `${string}:${TextField | Brand}`;

interface ApiError {
  error?: { message?: string };
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  const body: ApiError | null = await res.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

function keyOf(songId: string, field: TextField | Brand): CellKey {
  return `${songId}:${field}`;
}

function parseKey(key: CellKey): [string, TextField | Brand] {
  const idx = key.lastIndexOf(":");
  return [key.slice(0, idx), key.slice(idx + 1) as TextField | Brand];
}

function isBrandField(field: TextField | Brand): field is Brand {
  return field === "TJ" || field === "KY";
}

function readCell(rows: SongListItem[], key: CellKey): string | NumberView | undefined {
  const [songId, field] = parseKey(key);
  const row = rows.find((r) => r.id === songId);
  if (!row) return undefined;
  return isBrandField(field) ? row.numbers[field] : row[field];
}

function writeCell(
  rows: SongListItem[],
  key: CellKey,
  next: string | null | NumberView,
): SongListItem[] {
  const [songId, field] = parseKey(key);
  return rows.map((r) => {
    if (r.id !== songId) return r;
    if (isBrandField(field)) {
      return { ...r, numbers: { ...r.numbers, [field]: next as NumberView } };
    }
    return { ...r, [field]: next as string | null };
  });
}

/** 같은 행의 다른 셀이 저장 중이면(pending) 그 필드는 로컬 값을 유지하고 나머지만 서버 확정값으로 갈아끼운다 */
function replaceRow(rows: SongListItem[], fresh: SongListItem, keepFields: Set<TextField | Brand>): SongListItem[] {
  return rows.map((r) => {
    if (r.id !== fresh.id) return r;
    const merged: SongListItem = { ...fresh, numbers: { ...fresh.numbers } };
    for (const field of keepFields) {
      if (isBrandField(field)) merged.numbers[field] = r.numbers[field];
      else merged[field] = r[field];
    }
    return merged;
  });
}

function matchesFilter(song: SongListItem, keyword: string): boolean {
  const haystack = `${song.title ?? ""} ${song.artist ?? ""} ${song.memo ?? ""}`.toLowerCase();
  return haystack.includes(keyword.toLowerCase());
}

export function SongTable({ initial }: { initial: SongListItem[] }) {
  const toast = useToast();
  const [rows, setRows] = useState<SongListItem[]>(initial);
  const [filter, setFilter] = useState("");
  // pending은 로직의 원천(ref, 동기 읽기 필요) — 렌더 트리거는 별도 카운터로 분리한다
  const pendingRef = useRef<Map<CellKey, string | NumberView | undefined>>(new Map());
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

  function isPending(key: CellKey): boolean {
    return pendingRef.current.has(key);
  }

  async function commitCell(
    key: CellKey,
    next: string | null | NumberView,
    send: () => Promise<Response>,
  ) {
    if (isPending(key)) return; // 저장 중인 셀은 재편집 불가 — 잠금
    const prev = readCell(rows, key);
    pendingRef.current.set(key, prev);
    forceRender();
    setRows((rs) => writeCell(rs, key, next));
    try {
      const res = await send();
      if (!res.ok) throw new Error(await parseErrorMessage(res, "저장에 실패했어요"));
      const { data } = (await res.json()) as { data: SongListItem };
      const [songId] = parseKey(key);
      const stillPending = new Set<TextField | Brand>();
      for (const k of pendingRef.current.keys()) {
        if (k === key) continue;
        const [id, field] = parseKey(k);
        if (id === songId) stillPending.add(field);
      }
      setRows((rs) => replaceRow(rs, data, stillPending));
    } catch (e) {
      setRows((rs) => writeCell(rs, key, prev ?? null)); // 그 셀만 원복
      toast.show(e instanceof Error ? e.message : "저장에 실패했어요");
    } finally {
      pendingRef.current.delete(key);
      forceRender();
    }
  }

  function commitMeta(songId: string, field: TextField, next: string | null) {
    void commitCell(keyOf(songId, field), next, () =>
      fetch(`/api/songs/${songId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: next }),
      }),
    );
  }

  function commitNumber(songId: string, brand: Brand, input: NumberInput) {
    const next: NumberView =
      input.status === "AVAILABLE"
        ? { status: "AVAILABLE", number: input.number }
        : { status: "UNSUPPORTED", number: null };
    void commitCell(keyOf(songId, brand), next, () =>
      fetch(`/api/songs/${songId}/numbers/${brand}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    );
  }

  function clearNumber(songId: string, brand: Brand) {
    void commitCell(keyOf(songId, brand), null, () =>
      fetch(`/api/songs/${songId}/numbers/${brand}`, { method: "DELETE" }),
    );
  }

  const filtered = filter.trim() ? rows.filter((r) => matchesFilter(r, filter)) : rows;

  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="제목·아티스트·메모로 표 안에서 찾기"
        className="rounded-lg bg-surface px-3 py-2 text-sm text-text outline-none placeholder:text-text-dim"
      />

      {rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-text-dim">
          등록된 곡이 없어요
        </p>
      ) : filtered.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-text-dim">
          일치하는 곡이 없어요
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-text-dim">
                <th className="px-2 py-1 font-normal">TJ</th>
                <th className="px-2 py-1 font-normal">KY</th>
                <th className="px-2 py-1 font-normal">제목</th>
                <th className="px-2 py-1 font-normal">아티스트</th>
                <th className="px-2 py-1 font-normal">메모</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((song) => (
                <tr key={song.id} className="border-t border-surface-raised">
                  {(["TJ", "KY"] as const).map((brand) => (
                    <td key={brand} className="px-2 py-1 align-top">
                      <NumberCell
                        value={song.numbers[brand]}
                        disabled={isPending(keyOf(song.id, brand))}
                        onCommitAvailable={(number) =>
                          commitNumber(song.id, brand, { status: "AVAILABLE", number })
                        }
                        onToggleUnsupported={() =>
                          commitNumber(song.id, brand, { status: "UNSUPPORTED" })
                        }
                        onClear={() => clearNumber(song.id, brand)}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1 align-top">
                    <InlineCell
                      value={song.title}
                      placeholder="제목 없음"
                      disabled={isPending(keyOf(song.id, "title"))}
                      onCommit={(next) => commitMeta(song.id, "title", next)}
                    />
                  </td>
                  <td className="px-2 py-1 align-top">
                    <InlineCell
                      value={song.artist}
                      placeholder="아티스트 없음"
                      disabled={isPending(keyOf(song.id, "artist"))}
                      onCommit={(next) => commitMeta(song.id, "artist", next)}
                    />
                  </td>
                  <td className="px-2 py-1 align-top">
                    <InlineCell
                      value={song.memo}
                      placeholder="메모 없음"
                      disabled={isPending(keyOf(song.id, "memo"))}
                      onCommit={(next) => commitMeta(song.id, "memo", next)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
