// Design Ref: §7 아키텍처 결정 — Clerk userId 취득 + owner 스코프 헬퍼. 인증은 domain 관심사가 아니므로 presentation에 둔다.
import { auth } from "@clerk/nextjs/server";

export class UnauthorizedError extends Error {
  constructor() {
    super("authentication required");
    this.name = "UnauthorizedError";
  }
}

export async function requireOwnerId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new UnauthorizedError();
  return userId;
}
