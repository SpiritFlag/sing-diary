// Design Ref: §4.1 PUT/DELETE /api/songs/:id/numbers/:brand, §5.4, §9.3 — 번호 3-state 조작.
// set/clear를 한 파일에 겸용한다(Design §11.2 module-2) — 둘 다 같은 owner 확인·확정값 반환 패턴을 공유한다.
import { DomainError } from "@/domain";
import type { Brand } from "@/domain";
import type { NumberInput } from "@/application/ports/song-repo";
import type { SongListItem, SongQuery } from "@/application/ports/song-query";
import type { TransactionRunner } from "../ports/transaction";

async function resolveOrThrow(
  query: SongQuery,
  ownerId: string,
  songId: string,
): Promise<SongListItem> {
  const fresh = await query.findById(ownerId, songId);
  if (!fresh) {
    throw new DomainError("SONG_NOT_FOUND", `song not found: ${songId}`);
  }
  return fresh;
}

export function createSetSongNumber(tx: TransactionRunner, query: SongQuery) {
  return async function setSongNumber(
    ownerId: string,
    songId: string,
    brand: Brand,
    input: NumberInput,
  ): Promise<SongListItem> {
    const touched = await tx.run((repos) => repos.songs.setNumber(ownerId, songId, brand, input));
    if (!touched) {
      throw new DomainError("SONG_NOT_FOUND", `song not found: ${songId}`);
    }
    return resolveOrThrow(query, ownerId, songId);
  };
}

export function createClearSongNumber(tx: TransactionRunner, query: SongQuery) {
  return async function clearSongNumber(
    ownerId: string,
    songId: string,
    brand: Brand,
  ): Promise<SongListItem> {
    const touched = await tx.run((repos) => repos.songs.clearNumber(ownerId, songId, brand));
    if (!touched) {
      throw new DomainError("SONG_NOT_FOUND", `song not found: ${songId}`);
    }
    return resolveOrThrow(query, ownerId, songId);
  };
}
