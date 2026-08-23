// Design Ref: expand-playlist-import §5.4, §2.3 D-N — 지난 세션 상세(읽기 전용) + [오늘로].
//
// 표시와 판정의 기준이 다르다. 곡 행에 보이는 번호는 **그 세션 브랜드의 번호** — 그날 부른
// 기록 그대로다. 오늘 기준으로 덮어 보여주면 "그날 부른 번호"라는 일지 본연의 의미가 죽는다.
// 반면 [오늘로] 버튼의 분기는 **오늘 열린 세션 브랜드**로 판정한다. 둘이 다르면 버튼 옆에
// 오늘 브랜드 칩을 병기해 "판정 기준이 다르다"를 드러낸다.
//
// AddSongFlow가 클라이언트 컴포넌트라 이 파일은 서버에서 렌더돼도 무방하다 — 상태가 없다.
import type { Brand } from "@/domain";
import type { SessionDetail } from "@/application/ports/session-query";
import { AddSongFlow } from "@/presentation/components/songs/AddSongFlow";

export function SessionDetailView({
  detail,
  todaySessionId,
  todayBrand,
}: {
  detail: SessionDetail;
  /** 열린 세션이 없으면 null — [오늘로] 열 자체를 렌더하지 않는다(SearchResults 선례) */
  todaySessionId: string | null;
  todayBrand: Brand | null;
}) {
  // 자기 자신에게 가져오기는 무의미하다. 목록이 열린 세션을 상세로 보내지 않지만,
  // URL 직접 진입을 대비해 여기서도 막는다. 좁히기가 JSX까지 살아남도록 값으로 뽑아 둔다.
  const importTarget =
    todaySessionId !== null && todayBrand !== null && todaySessionId !== detail.id
      ? { sessionId: todaySessionId, brand: todayBrand }
      : null;
  const brandDiffers = importTarget !== null && importTarget.brand !== detail.brand;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="text-sm text-text">{detail.visitDate}</span>
        <span className="text-xs text-text-dim">{detail.venue}</span>
        <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs text-primary">
          {detail.brand}
        </span>
      </div>

      {detail.entries.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-6 text-center text-text-dim">
          이 날은 부른 곡이 없어요
        </p>
      ) : (
        <ul className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
          {detail.entries.map((entry) => {
            // 그날의 번호 — 세션 브랜드 기준. EntryRow와 같은 규칙으로 stub 곡은 이 번호가
            // 제목 자리를 대신한다(제목도 번호도 없으면 "#—"가 유일한 표식이다).
            const recorded = entry.song.numbers[detail.brand];
            const recordedNumber =
              recorded && recorded.status === "AVAILABLE" ? recorded.number : null;
            const title = entry.song.title ?? (recordedNumber ? `#${recordedNumber}` : "#—");

            return (
              <li
                key={entry.id}
                className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2"
              >
                <span className="w-5 text-sm text-text-dim">{entry.position}</span>
                <div className="flex flex-1 flex-col">
                  <span className="text-sm text-text">{title}</span>
                  <div className="flex items-center gap-2 text-xs text-text-dim">
                    {entry.song.artist && <span>{entry.song.artist}</span>}
                    {recordedNumber && <span>{recordedNumber}</span>}
                    {recorded?.status === "UNSUPPORTED" && <span>미지원</span>}
                  </div>
                </div>
                {entry.score !== null && (
                  <span className="text-sm text-primary">{entry.score}</span>
                )}
                {importTarget && (
                  <div className="flex items-center gap-1">
                    {brandDiffers && (
                      <span className="rounded-full bg-surface-raised px-1.5 py-0.5 text-[10px] text-text-dim">
                        {importTarget.brand}
                      </span>
                    )}
                    <AddSongFlow
                      song={entry.song}
                      sessionId={importTarget.sessionId}
                      todayBrand={importTarget.brand}
                      label="오늘로"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
