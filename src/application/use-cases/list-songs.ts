// Design Ref: §4.1 GET /api/songs — 곡 관리 표. 읽기 전용, 트랜잭션 불필요
import type { SongListItem, SongQuery } from "@/application/ports/song-query";

export function createListSongs(query: SongQuery) {
  return async function listSongs(ownerId: string): Promise<SongListItem[]> {
    return query.list(ownerId);
  };
}
