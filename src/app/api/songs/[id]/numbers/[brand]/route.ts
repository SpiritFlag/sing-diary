// Design Ref: §4.1 PUT/DELETE /api/songs/:id/numbers/:brand — 번호 3-state 조작 (Plan R3)
import { NextResponse } from "next/server";
import { withAuth } from "@/presentation/auth/with-auth";
import { brandParamSchema, setSongNumberSchema } from "@/presentation/api/schemas";
import { useCases } from "@/presentation/container";

type RouteCtx = { params: Promise<{ id: string; brand: string }> };

export const PUT = withAuth<RouteCtx>(async ({ ownerId }, req, { params }) => {
  const { id: songId, brand: rawBrand } = await params;
  const brand = brandParamSchema.parse(rawBrand);
  const input = setSongNumberSchema.parse(await req.json());
  const data = await useCases.setSongNumber(ownerId, songId, brand, input);
  return NextResponse.json({ data });
});

export const DELETE = withAuth<RouteCtx>(async ({ ownerId }, _req, { params }) => {
  const { id: songId, brand: rawBrand } = await params;
  const brand = brandParamSchema.parse(rawBrand);
  const data = await useCases.clearSongNumber(ownerId, songId, brand);
  return NextResponse.json({ data });
});
