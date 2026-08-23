// Design Ref: §4.2 POST /api/sessions/:id/entries
import { NextRequest, NextResponse } from "next/server";
import { mapError } from "@/presentation/api/error-mapper";
import { addEntryByNumberSchema } from "@/presentation/api/schemas";
import { requireOwnerId, useCases } from "@/presentation/container";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ownerId = await requireOwnerId();
    const { id: sessionId } = await params;
    const { number } = addEntryByNumberSchema.parse(await req.json());
    const result = await useCases.addEntryByNumber({ ownerId, sessionId, number });
    return NextResponse.json(
      { data: { ...result.entry, song: result.song, isNewStub: result.isNewStub } },
      { status: 201 },
    );
  } catch (error) {
    return mapError(error);
  }
}
