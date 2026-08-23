// Design Ref: expand-playlist-import §5.1 — 지난 플리 목록(RSC). ARCHITECT §5.4가 M2에 남겨둔 화면.
// 기존 sessions/new는 정적 세그먼트라 이 페이지·[id]와 충돌하지 않는다.
import { requireOwnerIdOrRedirect } from "@/presentation/auth/page-guard";
import { useCases } from "@/presentation/container";
import { SessionList } from "@/presentation/components/sessions/SessionList";

export default async function SessionsPage() {
  const ownerId = await requireOwnerIdOrRedirect();
  const sessions = await useCases.listSessions(ownerId);

  return <SessionList sessions={sessions} />;
}
