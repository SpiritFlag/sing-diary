// Design Ref: expand-fill-queue §2.1, §2.3 D-B — 빈칸채우기 큐. 스냅샷은 입장 시 RSC가 한 번 공급하고,
// 이후 큐 상태는 클라이언트 소유다. 서버 재조회는 화면 안의 새로고침 버튼 하나뿐이다.
import { requireOwnerIdOrRedirect } from "@/presentation/auth/page-guard";
import { useCases } from "@/presentation/container";
import { FillQueue } from "@/presentation/components/fill/FillQueue";

export default async function FillPage() {
  const ownerId = await requireOwnerIdOrRedirect();
  const snapshot = await useCases.getFillQueue(ownerId);

  return <FillQueue initial={snapshot} />;
}
