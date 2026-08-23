// Design Ref: §4.1 GET /api/songs/search — 통합검색. 읽기 전용, 트랜잭션 불필요
import type { SongListItem, SongQuery } from "@/application/ports/song-query";

export function createSearchSongs(query: SongQuery) {
  return async function searchSongs(ownerId: string, keyword: string): Promise<SongListItem[]> {
    return query.search(ownerId, keyword);
  };
}
