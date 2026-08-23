// Design Ref: §4.2 PUT /api/sessions/:id/entries/order
import { NextResponse } from "next/server";
import { withAuth } from "@/presentation/auth/with-auth";
import { reorderEntriesSchema } from "@/presentation/api/schemas";
import { useCases } from "@/presentation/container";

export const PUT = withAuth<{ params: Promise<{ id: string }> }>(
  async ({ ownerId }, req, { params }) => {
    const { id: sessionId } = await params;
    const { entryIds } = reorderEntriesSchema.parse(await req.json());
    const entries = await useCases.reorderEntries({ ownerId, sessionId, entryIds });
    return NextResponse.json({ data: { entries } });
  },
);
