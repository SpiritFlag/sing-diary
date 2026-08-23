// Design Ref: refine-auth-boundary §8.3 — AG-1/AG-2. DB·Clerk 불필요, activateTestDatabase() 호출하지 않는다.
import { describe, expect, it } from "vitest";
import { createApiGuard, UnauthorizedError } from "@/presentation/auth/api-guard";

describe("createApiGuard", () => {
  it("AG-1: 미인증 provider는 UnauthorizedError를 던진다", async () => {
    const guard = createApiGuard({ currentUserId: async () => null });
    await expect(guard.requireOwnerId()).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(guard.requireOwnerId()).rejects.toMatchObject({ name: "UnauthorizedError" });
  });

  it("AG-2: 인증된 provider는 userId를 반환한다", async () => {
    const guard = createApiGuard({ currentUserId: async () => "user_x" });
    await expect(guard.requireOwnerId()).resolves.toBe("user_x");
  });
});
