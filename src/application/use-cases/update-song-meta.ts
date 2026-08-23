// Design Ref: §4.1 PATCH /api/songs/:id, §3.3, §9.3 — repo가 0행이면 타 owner이거나 없는 곡.
// 둘을 구분하지 않는다(§2.3 D-E — 존재 여부를 누설하지 않기 위해 404로 통일).
import { DomainError } from "@/domain";
import type { SongMetaPatch } from "@/application/ports/song-repo";
import type { SongListItem, SongQuery } from "@/application/ports/song-query";
import type { TransactionRunner } from "../ports/transaction";

export function createUpdateSongMeta(tx: TransactionRunner, query: SongQuery) {
  return async function updateSongMeta(
    ownerId: string,
    songId: string,
    patch: SongMetaPatch,
  ): Promise<SongListItem> {
    const touched = await tx.run((repos) => repos.songs.updateMeta(ownerId, songId, patch));
    if (!touched) {
      throw new DomainError("SONG_NOT_FOUND", `song not found: ${songId}`);
    }
    const fresh = await query.findById(ownerId, songId);
    if (!fresh) {
      throw new DomainError("SONG_NOT_FOUND", `song not found: ${songId}`);
    }
    return fresh; // §2.3 D-K — 클라이언트가 이 확정값으로 셀을 갱신한다
  };
}
