// Design Ref: §5.1, §9.1 D-I — PC 곡 관리 표. (app) 레이아웃 재사용(별도 라우트 그룹 없음)
// Design Ref: expand-fill-queue §5.5 — 표를 보다가 큐로 넘어가는 역방향 동선. 결손 건수는
// 서버가 세어 준다(§3.3의 그 판정) — 목록에서 클라이언트가 다시 세면 판정이 이원화된다.
// 두 읽기는 Promise.all로 나란히 나가므로 페이지 비용은 느린 쪽 한 번이다.
import Link from "next/link";
import { requireOwnerIdOrRedirect } from "@/presentation/auth/page-guard";
import { useCases } from "@/presentation/container";
import { SongTable } from "@/presentation/components/songs/SongTable";

export default async function SongsPage() {
  const ownerId = await requireOwnerIdOrRedirect();
  const [songs, fill] = await Promise.all([
    useCases.listSongs(ownerId),
    useCases.getFillQueue(ownerId),
  ]);
  const missing = fill.tj.length + fill.ky.length + fill.meta.length;

  return (
    <>
      {missing > 0 && (
        <Link
          href="/songs/fill"
          className="mx-4 mt-4 flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm text-text-dim hover:text-text"
        >
          <span>
            채울 빈칸 {missing}건 — TJ {fill.tj.length} · KY {fill.ky.length} · 메타{" "}
            {fill.meta.length}
          </span>
          <span className="text-primary">채우러 가기 →</span>
        </Link>
      )}
      <SongTable initial={songs} />
    </>
  );
}
