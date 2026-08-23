// Design Ref: expand-fill-queue §4.2 GET /api/songs/fill — 이번 사이클의 유일한 신규 라우트이자
// 유일한 신규 표면이다. 파라미터·본문·신규 에러 코드 모두 0건이며, 쓰기 라우트는 신설하지 않는다(§1.1 목표 2).
// 정적 세그먼트 fill은 Next.js 라우팅에서 동적 [id]보다 먼저 매칭된다(§9.2).
import { NextResponse } from "next/server";
import { withAuth } from "@/presentation/auth/with-auth";
import { useCases } from "@/presentation/container";

export const GET = withAuth(async ({ ownerId }) => {
  const data = await useCases.getFillQueue(ownerId);
  return NextResponse.json({ data });
});
