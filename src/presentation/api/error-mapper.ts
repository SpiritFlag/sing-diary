// Design Ref: §6.1 — 에러 매핑 단일 지점. DomainError·ZodError·PG 에러 → §4.3 응답 형태
import { DomainError } from "@/domain";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "@/presentation/auth/api-guard";

type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "SESSION_NOT_FOUND"
  | "ENTRY_NOT_FOUND"
  | "SESSION_CLOSED"
  | "SESSION_CONFLICT"
  | "INVALID_SCORE"
  | "INVALID_POSITION_SET"
  | "SONG_NOT_FOUND"
  | "INTERNAL_ERROR";

const DOMAIN_HTTP_STATUS: Record<DomainError["code"], number> = {
  SESSION_NOT_FOUND: 404,
  ENTRY_NOT_FOUND: 404,
  SESSION_CLOSED: 409,
  INVALID_SCORE: 400,
  INVALID_POSITION_SET: 400,
  SONG_NOT_FOUND: 404,
};

function isPgErrorWithCode(e: unknown, code: string): boolean {
  const cause = (e as { cause?: unknown })?.cause;
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { code?: unknown }).code === code
  );
}

function json(status: number, code: ApiErrorCode, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export function mapError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return json(400, "VALIDATION_ERROR", "invalid request body", {
      fieldErrors: error.flatten().fieldErrors,
    });
  }

  if (error instanceof UnauthorizedError) {
    return json(401, "UNAUTHORIZED", error.message);
  }

  if (error instanceof DomainError) {
    return json(DOMAIN_HTTP_STATUS[error.code], error.code as ApiErrorCode, error.message);
  }

  // idx_sessions_open 유니크 위반 — 정상 경로에서는 startSession의 tx 안에서 사실상 도달 불가
  if (isPgErrorWithCode(error, "23505")) {
    return json(409, "SESSION_CONFLICT", "session creation conflicted, retry");
  }

  console.error(error);
  return json(500, "INTERNAL_ERROR", "internal error");
}
