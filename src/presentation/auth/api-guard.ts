// Design Ref: refine-auth-boundary §2.3 D-C/D-D — API 전송용 가드. 실패는 throw → error-mapper가 401.
import type { CurrentUserProvider } from "@/application/ports/current-user";

export class UnauthorizedError extends Error {
  constructor() {
    super("authentication required");
    this.name = "UnauthorizedError";
  }
}

export function createApiGuard(provider: CurrentUserProvider) {
  return {
    async requireOwnerId(): Promise<string> {
      const userId = await provider.currentUserId();
      if (!userId) throw new UnauthorizedError();
      return userId;
    },
  };
}
