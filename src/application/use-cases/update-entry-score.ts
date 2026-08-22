// Design Ref: §4.2 PATCH /api/entries/:id — 닫힌 세션의 entry도 점수 수정은 허용(사후 정리)
import { assertValidScore, DomainError, type Entry } from "@/domain";
import type { TransactionRunner } from "../ports/transaction";

export interface UpdateEntryScoreInput {
  ownerId: string;
  entryId: string;
  score: number | null;
}

export function createUpdateEntryScore(tx: TransactionRunner) {
  return async function updateEntryScore(input: UpdateEntryScoreInput): Promise<Entry> {
    assertValidScore(input.score);
    return tx.run(async (repos) => {
      const entry = await repos.entries.findByIdForOwner(input.entryId, input.ownerId);
      if (!entry) {
        throw new DomainError("ENTRY_NOT_FOUND", `entry not found: ${input.entryId}`);
      }
      const score = input.score === null ? null : input.score.toFixed(2);
      return repos.entries.updateScore(input.entryId, score);
    });
  };
}
