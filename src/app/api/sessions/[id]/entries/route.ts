// Design Ref: §4.2 POST /api/sessions/:id/entries
import { NextResponse } from "next/server";
import { withAuth } from "@/presentation/auth/with-auth";
import { addEntryByNumberSchema } from "@/presentation/api/schemas";
import { useCases } from "@/presentation/container";

export const POST = withAuth<{ params: Promise<{ id: string }> }>(
  async ({ ownerId }, req, { params }) => {
    const { id: sessionId } = await params;
    const { number } = addEntryByNumberSchema.parse(await req.json());
    const result = await useCases.addEntryByNumber({ ownerId, sessionId, number });
    return NextResponse.json(
      { data: { ...result.entry, song: result.song, isNewStub: result.isNewStub } },
      { status: 201 },
    );
  },
);
