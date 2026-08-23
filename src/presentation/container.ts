// Design Ref: §9.2 — composition root. presentation에서 infrastructure를 참조하는 유일한 지점.
import { createAddEntryByNumber } from "@/application/use-cases/add-entry-by-number";
import { createDeleteEntry } from "@/application/use-cases/delete-entry";
import { createGetCurrentSession } from "@/application/use-cases/get-current-session";
import { createReorderEntries } from "@/application/use-cases/reorder-entries";
import { createStartSession } from "@/application/use-cases/start-session";
import { createUpdateEntryScore } from "@/application/use-cases/update-entry-score";
import { createClerkCurrentUser } from "@/infrastructure/auth/clerk-current-user";
import { db } from "@/infrastructure/db/client";
import { createDrizzleTxRunner, reposFor } from "@/infrastructure/repositories/drizzle-tx-runner";
import { createApiGuard } from "@/presentation/auth/api-guard";

const txRunner = createDrizzleTxRunner();
const readRepos = reposFor(db);

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
};
