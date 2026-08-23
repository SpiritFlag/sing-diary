// Design Ref: expand-playlist-import §5.4, §2.3 D-M — 지난 플리 목록.
// 진행 중 세션도 빼지 않는다. 빠지면 "아까 그 세션 어디 갔지"가 된다 — 대신 배지를 달고
// 탭하면 오늘 화면(/)으로 보낸다. 상세 화면은 지난(닫힌) 세션 전용이다.
// 상호작용이 Link뿐이라 클라이언트 컴포넌트가 아니다.
import Link from "next/link";
import type { SessionListItem } from "@/application/ports/session-query";

// 새 세션 진입점. 지금까지 이 문은 "오늘 화면에 열린 세션이 없을 때"(EmptyToday) 하나뿐이라,
// 세션이 열려 있으면 새 플리를 열 길이 UI에 없었다 — M1부터의 공백이 이 목록 화면이 생기며 드러났다.
// 즉시 생성이 아니라 폼 페이지로 보낸다: 새 세션은 열려 있던 세션을 닫으므로(startSession의
// closeAllOpen) 버튼 한 번으로 오늘 기록이 마감돼선 안 된다.
function NewSessionLink() {
  return (
    <div className="flex justify-end px-4 pt-4">
      <Link
        href="/sessions/new"
        className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-bg"
      >
        새 플리
      </Link>
    </div>
  );
}

export function SessionList({ sessions }: { sessions: SessionListItem[] }) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <NewSessionLink />
        <p className="flex flex-1 items-center justify-center px-6 text-center text-text-dim">
          아직 기록이 없어요
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <NewSessionLink />
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
    </div>
  );
}
