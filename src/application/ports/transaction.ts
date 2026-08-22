// Design Ref: §3.4 — R1 해소. 트랜잭션 경계는 Application이 소유한다.
import type { EntryRepo } from "./entry-repo";
import type { SessionRepo } from "./session-repo";
import type { SongRepo } from "./song-repo";

export interface TxRepos {
  sessions: SessionRepo;
  songs: SongRepo;
  entries: EntryRepo;
}

export interface TransactionRunner {
  run<T>(fn: (repos: TxRepos) => Promise<T>): Promise<T>;
}
