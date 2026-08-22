// Design Ref: §9.4 — (app) 라우트 그룹. AppHeader + ToastProvider 공통 레이아웃
import { AppHeader } from "@/presentation/components/AppHeader";
import { ToastProvider } from "@/presentation/components/ui/toast";
import { requireOwnerId } from "@/presentation/api/auth";
import { getCurrentSessionCached } from "@/presentation/api/current-session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ownerId = await requireOwnerId();
  const current = await getCurrentSessionCached(ownerId);

  return (
    <ToastProvider>
      <AppHeader session={current?.session ?? null} />
      <div className="flex flex-1 flex-col">{children}</div>
    </ToastProvider>
  );
}
