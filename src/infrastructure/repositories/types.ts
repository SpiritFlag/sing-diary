// Design Ref: §9.4 — 리포지토리는 base db와 tx 핸들을 동일한 쿼리빌더 타입으로 받는다
import type { Database } from "../db/client";

type TxHandle<F> = F extends (tx: infer T) => Promise<unknown> ? T : never;

export type DbOrTx = Database | TxHandle<Parameters<Database["transaction"]>[0]>;
