// Design Ref: §4.2 GET /api/sessions/current
import type { Session } from "@/domain";
import type { EntryWithSong } from "../ports/entry-repo";
import type { TxRepos } from "../ports/transaction";

export interface CurrentSessionResult {
  session: Session;
  entries: EntryWithSong[];
}

export function createGetCurrentSession(repos: TxRepos) {
  return async function getCurrentSession(
    ownerId: string,
  ): Promise<CurrentSessionResult | null> {
    const session = await repos.sessions.findOpenByOwner(ownerId);
    if (!session) return null;
    const entries = await repos.entries.listWithSongBySession(session.id, session.brand);
    return { session, entries };
  };
}
