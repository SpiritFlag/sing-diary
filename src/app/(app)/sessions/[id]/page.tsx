// Design Ref: expand-playlist-import §5.1, §6 — 세션 상세(RSC).
// getSessionDetail은 타 owner·부재를 똑같이 SESSION_NOT_FOUND로 던진다(D-Q). 여기서 그것을
// Next의 notFound()로 받아 API의 404와 페이지의 404 화면이 같은 의미를 가리키게 한다.
import { notFound } from "next/navigation";
import { DomainError } from "@/domain";
import { requireOwnerIdOrRedirect } from "@/presentation/auth/page-guard";
import { getCurrentSessionCached } from "@/presentation/api/current-session";
import { useCases } from "@/presentation/container";
import { SessionDetailView } from "@/presentation/components/sessions/SessionDetailView";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ownerId = await requireOwnerIdOrRedirect();

  const [detail, current] = await Promise.all([
    useCases.getSessionDetail(ownerId, id).catch((error: unknown) => {
      if (error instanceof DomainError && error.code === "SESSION_NOT_FOUND") return null;
      throw error;
    }),
    getCurrentSessionCached(ownerId),
  ]);
  if (!detail) notFound();

  return (
    <SessionDetailView
      detail={detail}
      todaySessionId={current?.session.id ?? null}
      todayBrand={current?.session.brand ?? null}
    />
  );
}
