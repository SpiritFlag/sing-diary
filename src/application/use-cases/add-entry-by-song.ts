// Design Ref: expand-playlist-import §3.4, §2.3 D-J·D-K·D-P·D-S — 이 사이클의 몸통.
// 곡을 songId로 지목해 오늘 세션에 넣는다. registerNumber가 함께 오면 "번호 등록 + 엔트리 추가"를
// 한 트랜잭션에 담는다(D-K) — 두 요청으로 나누면 왕복 8초대인 데다, 등록만 되고 추가가 안 된
// 어중간한 상태가 남는다. TxRepos가 sessions·songs·entries를 이미 묶어주므로 새 배선은 없다.
//
// add-entry-by-number.ts는 이 사이클에서 한 줄도 바뀌지 않는다(Plan R1 · §10.1 C-7).
import { DomainError, type Entry } from "@/domain";
import type { TransactionRunner } from "../ports/transaction";

export interface AddEntryBySongInput {
  ownerId: string;
  sessionId: string;
  songId: string;
  /** 있으면 오늘 세션 브랜드로 AVAILABLE 등록 후 추가. 없으면 번호 상태를 일절 건드리지 않는다(D-S) */
  registerNumber?: string;
}

export interface AddEntryBySongResult {
  entry: Entry;
  song: { id: string; title: string | null; number: string | null };
  isNewStub: boolean;
}

export function createAddEntryBySong(tx: TransactionRunner) {
  return async function addEntryBySong(
    input: AddEntryBySongInput,
  ): Promise<AddEntryBySongResult> {
    return tx.run(async (repos) => {
      const session = await repos.sessions.findByIdForOwner(input.sessionId, input.ownerId);
      if (!session) {
        throw new DomainError("SESSION_NOT_FOUND", `session not found: ${input.sessionId}`);
      }
      if (session.closedAt) {
        throw new DomainError("SESSION_CLOSED", `session already closed: ${session.id}`);
      }

      // D-P: 두 분기 공통. entries.song_id는 FK일 뿐 owner를 모르므로, 여기를 건너뛰면
      // 타 owner의 songId를 내 세션에 붙일 수 있다. 확인 로직을 분기별로 다르게 두면
      // 리뷰가 어려우니 registerNumber 유무와 무관하게 항상 먼저 통과시킨다.
      const song = await repos.songs.findByIdForOwner(input.ownerId, input.songId);
      if (!song) {
        throw new DomainError("SONG_NOT_FOUND", `song not found: ${input.songId}`);
      }

      if (input.registerNumber !== undefined) {
        // 기존 setNumber를 그대로 재사용한다(Plan D-F) — upsert + CHECK 제약이 3-state를
        // 자동으로 지킨다. UNSUPPORTED 행이면 status만 AVAILABLE로 바뀌고, 행이 없으면
        // 하나만 생긴다. 여기서 3-state 조작을 새로 짜면 M3 큐 계약이 갈린다.
        await repos.songs.setNumber(input.ownerId, input.songId, session.brand, {
          status: "AVAILABLE",
          number: input.registerNumber,
        });
      }
      // registerNumber가 없으면("그냥 추가") 번호 상태는 불변이다 — UNSUPPORTED 행을 지우지도,
      // 없는 행을 만들지도 않는다(D-S). 결손은 M3 빈칸채우기 큐가 회수한다(ARCHITECT §5.2).

      const entry = await repos.entries.appendToSession(session.id, song.id);
      return {
        entry,
        song: { id: song.id, title: song.title, number: input.registerNumber ?? null },
        // 곡이 이미 존재하는 경로이므로 stub 생성은 원리적으로 일어나지 않는다.
        // 번호 기반 경로와 응답 형태를 맞추기 위해 키만 유지한다.
        isNewStub: false,
      };
    });
  };
}
