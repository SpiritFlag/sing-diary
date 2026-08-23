// Design Ref: §4.1 GET /api/songs — 곡 관리 표용 전체 목록
import { NextResponse } from "next/server";
import { withAuth } from "@/presentation/auth/with-auth";
import { useCases } from "@/presentation/container";

export const GET = withAuth(async ({ ownerId }) => {
  const data = await useCases.listSongs(ownerId);
  return NextResponse.json({ data });
});
