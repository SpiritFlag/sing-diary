// Design Ref: §4.2 POST /api/sessions/:id/entries, expand-playlist-import §4.2 D-J
// 같은 리소스(엔트리 컬렉션)에 대한 같은 동사다 — "무엇으로 곡을 지목하는가"만 다르므로
// 라우트를 새로 만들지 않고 본문 형태로 가른다. 형태 판별은 스키마(유니언)가 하고 여기는
// 갈래 하나를 고르는 한 줄만 진다. 기존 { number } 갈래는 바이트 단위로 보존된다(Plan R1).
import { NextResponse } from "next/server";
import { withAuth } from "@/presentation/auth/with-auth";
import { addEntrySchema } from "@/presentation/api/schemas";
import { useCases } from "@/presentation/container";

export const POST = withAuth<{ params: Promise<{ id: string }> }>(
  async ({ ownerId }, req, { params }) => {
    const { id: sessionId } = await params;
    const body = addEntrySchema.parse(await req.json());
    const result =
      "number" in body
        ? await useCases.addEntryByNumber({ ownerId, sessionId, number: body.number })
        : await useCases.addEntryBySong({ ownerId, sessionId, ...body });
    return NextResponse.json(
      { data: { ...result.entry, song: result.song, isNewStub: result.isNewStub } },
      { status: 201 },
    );
  },
);
