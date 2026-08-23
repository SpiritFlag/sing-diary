// Design Ref: expand-playlist-import §3.2, §2.3 D-L — 세션 읽기 포트(CQRS-lite).
// SessionRepo는 도메인 Session을 다루는 쓰기 경로다. 목록이 요구하는 곡 수 집계도, 상세가
// 요구하는 곡별 양쪽 브랜드 번호도 도메인 모델이 아니라 뷰 모델이다 — 섞으면 도메인에
// 집계 필드가 슬금슬금 붙는다. 직전 사이클이 같은 이유로 SongQuery를 갈랐다(D-B).
import type { Brand } from "@/domain";
import type { NumberView } from "./song-query";

export interface SessionListItem {
  id: string;
  visitDate: string; // YYYY-MM-DD
  venue: string;
  brand: Brand;
  isOpen: boolean; // closed_at IS NULL — D-M 배지·라우팅 분기용
  entryCount: number; // D-O 단일 쿼리 집계
}

export interface SessionDetailEntry {
  id: string;
  position: number;
  score: string | null; // numeric은 문자열로 온다 (도메인 Entry와 동일)
  song: {
    id: string;
    title: string | null;
    artist: string | null;
    // 양쪽 브랜드를 통째로 — 표시는 그 세션 브랜드, [오늘로] 판정은 오늘 브랜드 (D-N)
    numbers: Record<Brand, NumberView>;
  };
}

export interface SessionDetail {
  id: string;
  visitDate: string;
  venue: string;
  brand: Brand; // 그 세션의 브랜드 — 번호 표시 기준
  isOpen: boolean;
  entries: SessionDetailEntry[];
}

export interface SessionQuery {
  /** owner 스코프 전체 목록. visit_date DESC, created_at DESC */
  listByOwner(ownerId: string): Promise<SessionListItem[]>;
  /** 타 owner·부재 시 null → 유스케이스가 SESSION_NOT_FOUND (D-Q: 403은 존재를 누설한다) */
  findDetail(ownerId: string, sessionId: string): Promise<SessionDetail | null>;
}
