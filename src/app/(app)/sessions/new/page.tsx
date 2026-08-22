// Design Ref: §5.4 세션 생성 화면
import { requireOwnerId } from "@/presentation/api/auth";
import { getCurrentSessionCached } from "@/presentation/api/current-session";
import { NewSessionForm } from "@/presentation/components/session/NewSessionForm";

export default async function NewSessionPage() {
  const ownerId = await requireOwnerId();
  const current = await getCurrentSessionCached(ownerId);

  return <NewSessionForm hasOpenSession={current !== null} />;
}
