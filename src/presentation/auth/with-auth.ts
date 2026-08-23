// Design Ref: expand-song-catalog §6.2, §7.2 — API 라우트의 유일한 인증·에러 경계.
// 핸들러 본문에는 try/catch를 두지 않는다. mapError가 Zod·Domain·PG·UnauthorizedError를 전부 여기서 받는다.
import type { NextRequest } from "next/server";
import { mapError } from "@/presentation/api/error-mapper";
import { requireOwnerId } from "@/presentation/container";

type AuthedHandler<C> = (
  ctx: { ownerId: string },
  req: NextRequest,
  routeCtx: C,
) => Promise<Response>;

export function withAuth<C = unknown>(handler: AuthedHandler<C>) {
  return async (req: NextRequest, routeCtx: C): Promise<Response> => {
    try {
      const ownerId = await requireOwnerId();
      return await handler({ ownerId }, req, routeCtx);
    } catch (error) {
      return mapError(error);
    }
  };
}
