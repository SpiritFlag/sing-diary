// Design Ref: §4.2 POST /api/sessions/:id/entries, ARCHITECT §5.3 — 번호 즉석 등록
import { DomainError, type Entry } from "@/domain";
import type { TransactionRunner } from "../ports/transaction";

export interface AddEntryByNumberInput {
  ownerId: string;
  sessionId: string;
  number: string;
}

export interface AddEntryByNumberResult {
  entry: Entry;
  isNewStub: boolean;
}

export function createAddEntryByNumber(tx: TransactionRunner) {
  return async function addEntryByNumber(
    input: AddEntryByNumberInput,
  ): Promise<AddEntryByNumberResult> {
    return tx.run(async (repos) => {
      const session = await repos.sessions.findByIdForOwner(
        input.sessionId,
        input.ownerId,
      );
      if (!session) {
        throw new DomainError("SESSION_NOT_FOUND", `session not found: ${input.sessionId}`);
      }
      if (session.closedAt) {
        throw new DomainError("SESSION_CLOSED", `session already closed: ${session.id}`);
      }

      let song = await repos.songs.findByOwnerBrandNumber(
        input.ownerId,
        session.brand,
        input.number,
      );
      let isNewStub = false;
      if (!song) {
        song = await repos.songs.createStubWithNumber(
          input.ownerId,
          session.brand,
          input.number,
        );
        isNewStub = true;
      }

      const entry = await repos.entries.appendToSession(session.id, song.id);
      return { entry, isNewStub };
    });
  };
}
