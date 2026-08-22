// Design Ref: §9.4, §4.2 — entry CRUD + 순서 재부여
import type { Entry } from "@/domain";

export interface EntryWithSong extends Entry {
  song: {
    id: string;
    title: string | null;
    number: string | null;
  };
}

export interface EntryWithOwner extends Entry {
  sessionOwnerId: string;
}

export interface EntryRepo {
  listWithSongBySession(sessionId: string, brand: string): Promise<EntryWithSong[]>;
  /** position = 세션 내 현재 최대값 + 1 */
  appendToSession(sessionId: string, songId: string): Promise<Entry>;
  findByIdForOwner(entryId: string, ownerId: string): Promise<EntryWithOwner | null>;
  updateScore(entryId: string, score: string | null): Promise<Entry>;
  listIdsBySession(sessionId: string): Promise<string[]>;
  /** entryIds 순서대로 position 1..N 재부여. 세션 내 id 집합과 정확히 일치해야 호출 전 검증됨 */
  reorder(sessionId: string, entryIds: string[]): Promise<Entry[]>;
  delete(entryId: string): Promise<void>;
  /** 삭제 후 position 1..N 재부여 (기존 순서 유지) */
  reindexSession(sessionId: string): Promise<void>;
}
