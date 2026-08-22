// Design Ref: §4.2 PUT /api/sessions/:id/entries/order, §5.5 — 전체 id 집합 일치 검증 후 재부여
import { DomainError, type Entry } from "@/domain";
import type { TransactionRunner } from "../ports/transaction";

export interface ReorderEntriesInput {
  ownerId: string;
  sessionId: string;
  entryIds: string[];
}

export function createReorderEntries(tx: TransactionRunner) {
  return async function reorderEntries(input: ReorderEntriesInput): Promise<Entry[]> {
    return tx.run(async (repos) => {
      const session = await repos.sessions.findByIdForOwner(
        input.sessionId,
        input.ownerId,
      );
      if (!session) {
        throw new DomainError("SESSION_NOT_FOUND", `session not found: ${input.sessionId}`);
      }

      const currentIds = await repos.entries.listIdsBySession(input.sessionId);
      const currentSet = new Set(currentIds);
      const inputSet = new Set(input.entryIds);
      const sameSet =
        currentSet.size === inputSet.size &&
        [...currentSet].every((id) => inputSet.has(id));
      if (!sameSet) {
        throw new DomainError(
          "INVALID_POSITION_SET",
          "entryIds does not match the session's current entry set",
        );
      }

      return repos.entries.reorder(input.sessionId, input.entryIds);
    });
  };
}
