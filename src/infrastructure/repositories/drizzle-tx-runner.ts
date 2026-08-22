// Design Ref: §3.4 — R1 해소. TransactionRunner의 Drizzle 구현 (neon-serverless Pool)
import type { TransactionRunner, TxRepos } from "@/application/ports/transaction";
import type { Database } from "../db/client";
import { createDrizzleEntryRepo } from "./drizzle-entry-repo";
import { createDrizzleSessionRepo } from "./drizzle-session-repo";
import { createDrizzleSongRepo } from "./drizzle-song-repo";
import type { DbOrTx } from "./types";

function reposFor(db: DbOrTx): TxRepos {
  return {
    sessions: createDrizzleSessionRepo(db),
    songs: createDrizzleSongRepo(db),
    entries: createDrizzleEntryRepo(db),
  };
}

export function createDrizzleTxRunner(db: Database): TransactionRunner {
  return {
    run(fn) {
      return db.transaction((tx) => fn(reposFor(tx)));
    },
  };
}

export { reposFor };
