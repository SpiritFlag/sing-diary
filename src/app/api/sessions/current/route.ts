// Design Ref: §4.2 GET /api/sessions/current
import { NextResponse } from "next/server";
import { requireOwnerId } from "@/presentation/api/auth";
import { mapError } from "@/presentation/api/error-mapper";
import { useCases } from "@/presentation/container";

export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    const result = await useCases.getCurrentSession(ownerId);
    return NextResponse.json({ data: result });
  } catch (error) {
    return mapError(error);
  }
}
