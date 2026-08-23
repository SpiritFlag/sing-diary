// Design Ref: §4.2 GET /api/sessions/current
import { NextResponse } from "next/server";
import { withAuth } from "@/presentation/auth/with-auth";
import { useCases } from "@/presentation/container";

export const GET = withAuth(async ({ ownerId }) => {
  const result = await useCases.getCurrentSession(ownerId);
  return NextResponse.json({ data: result });
});
