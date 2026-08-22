// Design Ref: §4.2 DELETE /api/entries/:id — 삭제 후 세션 position 1..N 재부여
import { DomainError } from "@/domain";
import type { TransactionRunner } from "../ports/transaction";

export interface DeleteEntryInput {
  ownerId: string;
  entryId: string;
}

export function createDeleteEntry(tx: TransactionRunner) {
  return async function deleteEntry(input: DeleteEntryInput): Promise<{ deletedId: string }> {
    return tx.run(async (repos) => {
      const entry = await repos.entries.findByIdForOwner(input.entryId, input.ownerId);
      if (!entry) {
        throw new DomainError("ENTRY_NOT_FOUND", `entry not found: ${input.entryId}`);
      }
      await repos.entries.delete(input.entryId);
      await repos.entries.reindexSession(entry.sessionId);
      return { deletedId: input.entryId };
    });
  };
}
