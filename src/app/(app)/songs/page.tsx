// Design Ref: §5.1, §9.1 D-I — PC 곡 관리 표. (app) 레이아웃 재사용(별도 라우트 그룹 없음)
import { requireOwnerIdOrRedirect } from "@/presentation/auth/page-guard";
import { useCases } from "@/presentation/container";
import { SongTable } from "@/presentation/components/songs/SongTable";

export default async function SongsPage() {
  const ownerId = await requireOwnerIdOrRedirect();
  const songs = await useCases.listSongs(ownerId);

  return <SongTable initial={songs} />;
}
