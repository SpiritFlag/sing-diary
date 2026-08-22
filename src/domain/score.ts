// Design Ref: §3.1, §6.1 — 점수 순수 검증 (0..100, 소수 2자리까지)
import { DomainError } from "./errors";

export function assertValidScore(score: number | null): void {
  if (score === null) return;
  if (Number.isNaN(score) || score < 0 || score > 100) {
    throw new DomainError("INVALID_SCORE", `score out of range: ${score}`);
  }
}
