// Design Ref: §4.2 POST /api/sessions, expand-playlist-import §4.1 #1 GET /api/sessions
import { NextResponse } from "next/server";
import { withAuth } from "@/presentation/auth/with-auth";
import { createSessionSchema } from "@/presentation/api/schemas";
import { useCases } from "@/presentation/container";

export const POST = withAuth(async ({ ownerId }, req) => {
  const body = createSessionSchema.parse(await req.json());
  const session = await useCases.startSession({ ownerId, ...body });
  return NextResponse.json({ data: session }, { status: 201 });
});

// Design Ref: expand-playlist-import §4.1 #1, §2.3 D-O — 지난 플리 목록(곡 수 포함).
// 진행 중 세션도 포함해서 내려준다(D-M) — 화면이 배지와 라우팅으로 가른다.
export const GET = withAuth(async ({ ownerId }) => {
  const data = await useCases.listSessions(ownerId);
  return NextResponse.json({ data });
});
