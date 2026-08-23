// Design Ref: §9.2 — composition root. presentation에서 infrastructure를 참조하는 유일한 지점.
import { createAddEntryByNumber } from "@/application/use-cases/add-entry-by-number";
import { createDeleteEntry } from "@/application/use-cases/delete-entry";
import { createGetCurrentSession } from "@/application/use-cases/get-current-session";
import { createListSongs } from "@/application/use-cases/list-songs";
import { createReorderEntries } from "@/application/use-cases/reorder-entries";
import { createSearchSongs } from "@/application/use-cases/search-songs";
import {
  createClearSongNumber,
  createSetSongNumber,
} from "@/application/use-cases/set-song-number";
import { createStartSession } from "@/application/use-cases/start-session";
import { createUpdateEntryScore } from "@/application/use-cases/update-entry-score";
import { createUpdateSongMeta } from "@/application/use-cases/update-song-meta";
import { createClerkCurrentUser } from "@/infrastructure/auth/clerk-current-user";
import { db } from "@/infrastructure/db/client";
import { createDrizzleSongQuery } from "@/infrastructure/repositories/drizzle-song-query";
import { createDrizzleTxRunner, reposFor } from "@/infrastructure/repositories/drizzle-tx-runner";
import { createApiGuard } from "@/presentation/auth/api-guard";

const txRunner = createDrizzleTxRunner();
const readRepos = reposFor(db);
// Design Ref: §3.4 D-C — 읽기는 Neon HTTP(db), 쓰기는 txRunner(pg Pool). 기존 구조를 그대로 승계.
const songQuery = createDrizzleSongQuery(db);

// Design Ref: refine-auth-boundary §2.3 D-D — API 가드는 composition root에서 CurrentUserProvider를 주입받는다.
export const currentUser = createClerkCurrentUser();
export const { requireOwnerId } = createApiGuard(currentUser);

export const useCases = {
  startSession: createStartSession(txRunner),
  getCurrentSession: createGetCurrentSession(readRepos),
  addEntryByNumber: createAddEntryByNumber(txRunner),
  updateEntryScore: createUpdateEntryScore(txRunner),
  reorderEntries: createReorderEntries(txRunner),
  deleteEntry: createDeleteEntry(txRunner),
  searchSongs: createSearchSongs(songQuery),
  listSongs: createListSongs(songQuery),
  updateSongMeta: createUpdateSongMeta(txRunner, songQuery),
  setSongNumber: createSetSongNumber(txRunner, songQuery),
  clearSongNumber: createClearSongNumber(txRunner, songQuery),
};
