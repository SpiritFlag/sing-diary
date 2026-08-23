// Design Ref: refine-auth-boundary §2.1 — CurrentUserProvider의 Clerk 구현. 미들웨어 껍데기(D-A)가 공급하는 auth() 컨텍스트를 읽는다.
import { auth } from "@clerk/nextjs/server";
import type { CurrentUserProvider } from "@/application/ports/current-user";

export function createClerkCurrentUser(): CurrentUserProvider {
  return {
    async currentUserId() {
      const { userId } = await auth();
      return userId ?? null;
    },
  };
}
