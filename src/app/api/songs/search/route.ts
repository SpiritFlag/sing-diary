// Design Ref: §4.1 GET /api/songs/search
import { NextResponse } from "next/server";
import { withAuth } from "@/presentation/auth/with-auth";
import { searchSongsQuerySchema } from "@/presentation/api/schemas";
import { useCases } from "@/presentation/container";

export const GET = withAuth(async ({ ownerId }, req) => {
  const url = new URL(req.url);
  const { q } = searchSongsQuerySchema.parse({
    q: url.searchParams.get("q") ?? "",
    brand: url.searchParams.get("brand") ?? undefined,
  });
  const data = await useCases.searchSongs(ownerId, q);
  return NextResponse.json({ data });
});
