// Design Ref: §4.2 PATCH/DELETE /api/entries/:id
import { NextResponse } from "next/server";
import { withAuth } from "@/presentation/auth/with-auth";
import { updateEntryScoreSchema } from "@/presentation/api/schemas";
import { useCases } from "@/presentation/container";

export const PATCH = withAuth<{ params: Promise<{ id: string }> }>(
  async ({ ownerId }, req, { params }) => {
    const { id: entryId } = await params;
    const { score } = updateEntryScoreSchema.parse(await req.json());
    const entry = await useCases.updateEntryScore({ ownerId, entryId, score });
    return NextResponse.json({ data: entry });
  },
);

export const DELETE = withAuth<{ params: Promise<{ id: string }> }>(
  async ({ ownerId }, _req, { params }) => {
    const { id: entryId } = await params;
    const result = await useCases.deleteEntry({ ownerId, entryId });
    return NextResponse.json({ data: result });
  },
);
