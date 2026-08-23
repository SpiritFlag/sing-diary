// Design Ref: expand-playlist-import §4.1 GET /api/sessions/{id}, §2.3 D-Q — 세션 상세.
// 타 owner와 부재를 구분하지 않고 둘 다 SESSION_NOT_FOUND(404)다 — 403은 존재를 누설한다.
import { DomainError } from "@/domain";
import type { SessionDetail, SessionQuery } from "@/application/ports/session-query";

export function createGetSessionDetail(query: SessionQuery) {
  return async function getSessionDetail(
    ownerId: string,
    sessionId: string,
  ): Promise<SessionDetail> {
    const detail = await query.findDetail(ownerId, sessionId);
    if (!detail) {
      throw new DomainError("SESSION_NOT_FOUND", `session not found: ${sessionId}`);
    }
    return detail;
  };
}
