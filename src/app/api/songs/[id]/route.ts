// Design Ref: §4.1 PATCH /api/songs/:id — 메타(title·artist·memo) 인라인 수정
import { NextResponse } from "next/server";
import { withAuth } from "@/presentation/auth/with-auth";
import { updateSongMetaSchema } from "@/presentation/api/schemas";
import { useCases } from "@/presentation/container";

export const PATCH = withAuth<{ params: Promise<{ id: string }> }>(
  async ({ ownerId }, req, { params }) => {
    const { id: songId } = await params;
    const patch = updateSongMetaSchema.parse(await req.json());
    const data = await useCases.updateSongMeta(ownerId, songId, patch);
    return NextResponse.json({ data });
  },
);
