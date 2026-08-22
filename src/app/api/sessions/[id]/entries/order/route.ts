// Design Ref: §4.2 PUT /api/sessions/:id/entries/order
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerId } from "@/presentation/api/auth";
import { mapError } from "@/presentation/api/error-mapper";
import { reorderEntriesSchema } from "@/presentation/api/schemas";
import { useCases } from "@/presentation/container";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ownerId = await requireOwnerId();
    const { id: sessionId } = await params;
    const { entryIds } = reorderEntriesSchema.parse(await req.json());
    const entries = await useCases.reorderEntries({ ownerId, sessionId, entryIds });
    return NextResponse.json({ data: { entries } });
  } catch (error) {
    return mapError(error);
  }
}
