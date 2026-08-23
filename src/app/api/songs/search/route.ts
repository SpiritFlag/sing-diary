// Design Ref: §4.1 GET /api/songs/search
import { NextResponse } from "next/server";
import { withAuth } from "@/presentation/auth/with-auth";
import { searchSongsQuerySchema } from "@/presentation/api/schemas";
import { useCases } from "@/presentation/container";

export const GET = withAuth(async ({ ownerId }, req) => {
  const url = new URL(req.url);
  // FR-17 — brand는 받지 않는다. 통합검색은 owner 스코프 전체를 브랜드와 무관하게 훑고,
  // 브랜드는 추가 시점의 판정(addDecision)에서만 쓰인다. 문서·구현 불일치를 여기서 끝낸다.
  const { q } = searchSongsQuerySchema.parse({ q: url.searchParams.get("q") ?? "" });
  const data = await useCases.searchSongs(ownerId, q);
  return NextResponse.json({ data });
});
