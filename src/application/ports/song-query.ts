// Design Ref: §3.2 — 곡 카탈로그 읽기 포트. 쓰기(SongRepo)와 분리된 이유는 §2.3 D-B.
import type { Brand, NumberStatus } from "@/domain";

/** 번호 3-state의 읽기 표현. null = 행 없음(아직 입력 안 함) */
export type NumberView = { status: NumberStatus; number: string | null } | null;

export interface SongListItem {
  id: string;
  title: string | null;
  artist: string | null;
  memo: string | null;
  numbers: Record<Brand, NumberView>;
  updatedAt: Date;
}

export interface SongQuery {
  /** owner 스코프 통합검색. keyword는 이미 trim된 비어있지 않은 문자열 */
  search(ownerId: string, keyword: string): Promise<SongListItem[]>;
  /** owner 스코프 전체 목록. 정렬: title NULLS FIRST → artist NULLS FIRST (§2.3 D-J) */
  list(ownerId: string): Promise<SongListItem[]>;
  /** 수정 후 확정값 반환용 단건 조회. 타 owner면 null */
  findById(ownerId: string, songId: string): Promise<SongListItem | null>;
}
