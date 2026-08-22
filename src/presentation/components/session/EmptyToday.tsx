// Design Ref: §5.4 — 오늘의 플리(세션 없음) 빈 상태
import Link from "next/link";

export function EmptyToday() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-text-dim">진행 중인 플리가 없어요.</p>
      <Link
        href="/sessions/new"
        className="rounded-full bg-primary px-6 py-2 text-sm font-medium text-bg"
      >
        세션 시작
      </Link>
    </div>
  );
}
