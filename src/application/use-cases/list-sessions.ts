// Design Ref: expand-playlist-import §4.1 GET /api/sessions — 지난 플리 목록. 읽기 전용, 트랜잭션 불필요.
import type { SessionListItem, SessionQuery } from "@/application/ports/session-query";

export function createListSessions(query: SessionQuery) {
  return async function listSessions(ownerId: string): Promise<SessionListItem[]> {
    return query.listByOwner(ownerId);
  };
}
