// Design Ref: §4.2 POST /api/sessions
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerId } from "@/presentation/api/auth";
import { mapError } from "@/presentation/api/error-mapper";
import { createSessionSchema } from "@/presentation/api/schemas";
import { useCases } from "@/presentation/container";

export async function POST(req: NextRequest) {
  try {
    const ownerId = await requireOwnerId();
    const body = createSessionSchema.parse(await req.json());
    const session = await useCases.startSession({ ownerId, ...body });
    return NextResponse.json({ data: session }, { status: 201 });
  } catch (error) {
    return mapError(error);
  }
}
