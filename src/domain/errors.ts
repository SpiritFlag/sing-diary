// Design Ref: §3.1 — 도메인 에러 (HTTP 무관, error-mapper가 §4.3 표로 변환)

export type DomainErrorCode =
  | "SESSION_NOT_FOUND"
  | "SESSION_CLOSED"
  | "ENTRY_NOT_FOUND"
  | "INVALID_SCORE"
  | "INVALID_POSITION_SET";

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
