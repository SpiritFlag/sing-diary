// Design Ref: §9.4 — 리포지토리는 읽기용 HTTP db와 트랜잭션 tx 핸들을 동일한 쿼리빌더 타입으로 받는다
import type { Database } from "../db/client";
import type { TxHandle } from "../db/transaction-client";

export type DbOrTx = Database | TxHandle;
