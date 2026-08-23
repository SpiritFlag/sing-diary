// Design Ref: §4.2 PATCH/DELETE /api/entries/:id
import { NextRequest, NextResponse } from "next/server";
import { mapError } from "@/presentation/api/error-mapper";
import { updateEntryScoreSchema } from "@/presentation/api/schemas";
import { requireOwnerId, useCases } from "@/presentation/container";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ownerId = await requireOwnerId();
    const { id: entryId } = await params;
    const { score } = updateEntryScoreSchema.parse(await req.json());
    const entry = await useCases.updateEntryScore({ ownerId, entryId, score });
    return NextResponse.json({ data: entry });
  } catch (error) {
    return mapError(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ownerId = await requireOwnerId();
    const { id: entryId } = await params;
    const result = await useCases.deleteEntry({ ownerId, entryId });
    return NextResponse.json({ data: result });
  } catch (error) {
    return mapError(error);
  }
}
