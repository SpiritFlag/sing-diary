// Design Ref: §5.1, §5.3 — AppHeader. 세션 정보(지점·브랜드 칩)·곡 검색/관리 진입점·UserButton
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import type { Session } from "@/domain";

export function AppHeader({ session }: { session: Session | null }) {
  return (
    <header className="flex items-center justify-between border-b border-surface-raised px-4 py-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold text-text">sing-diary</span>
        {session && (
          <>
            <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs text-primary">
              {session.brand}
            </span>
            <span className="text-text-dim">
              {session.venue} · {session.visitDate}
            </span>
          </>
        )}
      </div>
      <nav className="flex items-center gap-3 text-sm text-text-dim">
        <Link href="/songs/search" className="hover:text-text">
          검색
        </Link>
        <Link href="/songs" className="hover:text-text">
          곡 관리
        </Link>
        {/* Design Ref: §7 — Clerk 7.x는 afterSignOutUrl prop을 제거했다. 로그아웃 이동 경로는 ClerkProvider 전역 설정을 따른다 */}
        <UserButton />
      </nav>
    </header>
  );
}
