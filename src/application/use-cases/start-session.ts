// Design Ref: §4.2 POST /api/sessions, ARCHITECT §5.1 — 세션 전환은 하나의 트랜잭션
import type { Brand, Session } from "@/domain";
import type { TransactionRunner } from "../ports/transaction";

export interface StartSessionInput {
  ownerId: string;
  visitDate: string;
  venue: string;
  brand: Brand;
}

export function createStartSession(tx: TransactionRunner) {
  return async function startSession(input: StartSessionInput): Promise<Session> {
    return tx.run(async (repos) => {
      await repos.sessions.closeAllOpen(input.ownerId);
      return repos.sessions.create(input);
    });
  };
}
