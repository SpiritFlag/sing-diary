// Design Ref: expand-playlist-import §4.1 #2, §2.3 D-Q — 세션 상세.
// 정적 세그먼트 sessions/current가 [id]보다 우선 매칭되므로 기존 라우트와 충돌하지 않는다.
// 타 owner·부재를 구분하지 않고 둘 다 404 SESSION_NOT_FOUND다 — 유스케이스가 던지고 mapError가 받는다.
import { NextResponse } from "next/server";
import { withAuth } from "@/presentation/auth/with-auth";
import { useCases } from "@/presentation/container";

export const GET = withAuth<{ params: Promise<{ id: string }> }>(
  async ({ ownerId }, _req, { params }) => {
    const { id } = await params;
    const data = await useCases.getSessionDetail(ownerId, id);
    return NextResponse.json({ data });
  },
);
