// Design Ref: §5.4 세션 생성 화면
import { requireOwnerIdOrRedirect } from "@/presentation/auth/page-guard";
import { getCurrentSessionCached } from "@/presentation/api/current-session";
import { NewSessionForm } from "@/presentation/components/session/NewSessionForm";

export default async function NewSessionPage() {
  const ownerId = await requireOwnerIdOrRedirect();
  const current = await getCurrentSessionCached(ownerId);

  return <NewSessionForm hasOpenSession={current !== null} />;
}
