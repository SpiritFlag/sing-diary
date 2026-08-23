// Design Ref: §4.2 POST /api/sessions
import { NextResponse } from "next/server";
import { withAuth } from "@/presentation/auth/with-auth";
import { createSessionSchema } from "@/presentation/api/schemas";
import { useCases } from "@/presentation/container";

export const POST = withAuth(async ({ ownerId }, req) => {
  const body = createSessionSchema.parse(await req.json());
  const session = await useCases.startSession({ ownerId, ...body });
  return NextResponse.json({ data: session }, { status: 201 });
});
