// Design Ref: §5.2, §5.4 — 오늘의 플리. RSC에서 직접 유스케이스 호출(§7 데이터 페칭 결정)
import { requireOwnerId } from "@/presentation/api/auth";
import { getCurrentSessionCached } from "@/presentation/api/current-session";
import { EmptyToday } from "@/presentation/components/session/EmptyToday";
import { Playlist } from "@/presentation/components/playlist/Playlist";

export default async function TodayPage() {
  const ownerId = await requireOwnerId();
  const current = await getCurrentSessionCached(ownerId);

  if (!current) {
    return <EmptyToday />;
  }

  return <Playlist session={current.session} initialEntries={current.entries} />;
}
