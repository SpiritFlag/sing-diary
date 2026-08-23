// Design Ref: expand-playlist-import §5.4, §2.3 D-M — 지난 플리 목록.
// 진행 중 세션도 빼지 않는다. 빠지면 "아까 그 세션 어디 갔지"가 된다 — 대신 배지를 달고
// 탭하면 오늘 화면(/)으로 보낸다. 상세 화면은 지난(닫힌) 세션 전용이다.
// 상호작용이 Link뿐이라 클라이언트 컴포넌트가 아니다.
import Link from "next/link";
import type { SessionListItem } from "@/application/ports/session-query";

export function SessionList({ sessions }: { sessions: SessionListItem[] }) {
  if (sessions.length === 0) {
    return (
      <p className="flex flex-1 items-center justify-center px-6 text-center text-text-dim">
        아직 기록이 없어요
      </p>
    );
  }

  return (
    <ul className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
      {sessions.map((s) => (
        <li key={s.id}>
          <Link
            href={s.isOpen ? "/" : `/sessions/${s.id}`}
            className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2"
          >
            <div className="flex flex-1 flex-col">
              <div className="flex items-center gap-2">
                <span className="text-sm text-text">{s.visitDate}</span>
                {s.isOpen && (
                  <span className="rounded-full bg-mint px-1.5 py-0.5 text-[10px] text-bg">
                    진행 중
                  </span>
                )}
              </div>
              <span className="text-xs text-text-dim">{s.venue}</span>
            </div>
            <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs text-primary">
              {s.brand}
            </span>
            <span className="w-12 text-right text-xs text-text-dim">{s.entryCount}곡</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
