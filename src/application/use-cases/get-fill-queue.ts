// Design Ref: expand-fill-queue §4.2 GET /api/songs/fill — 빈칸채우기 큐 스냅샷.
// 읽기 전용이라 트랜잭션이 없다(listSongs와 같은 형태). 병렬 3발은 포트 구현의 책임이다(§3.2 D-A).
import type { FillQueueSnapshot, SongQuery } from "@/application/ports/song-query";

export function createGetFillQueue(query: SongQuery) {
  return async function getFillQueue(ownerId: string): Promise<FillQueueSnapshot> {
    return query.fillQueue(ownerId);
  };
}
