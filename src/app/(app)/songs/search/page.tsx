// Design Ref: §5.1, §5.2 — 모바일 곡 검색. 열린 세션이 있으면 그 브랜드로 번호 상태를 판정한다
import { requireOwnerIdOrRedirect } from "@/presentation/auth/page-guard";
import { getCurrentSessionCached } from "@/presentation/api/current-session";
import { SearchResults } from "@/presentation/components/songs/SearchResults";

export default async function SongSearchPage() {
  const ownerId = await requireOwnerIdOrRedirect();
  const current = await getCurrentSessionCached(ownerId);

  return (
    <SearchResults
      sessionId={current?.session.id ?? null}
      brand={current?.session.brand ?? null}
    />
  );
}
