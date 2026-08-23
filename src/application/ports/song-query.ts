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

/**
 * 빈칸채우기 큐 스냅샷 (ARCHITECT §5.6).
 * Design Ref: expand-fill-queue §3.2 D-A — 세 큐를 한 번에 낸다. 탭 전환은 재조회를 부르지 않는다.
 * 한 곡이 여러 배열에 중복 등장할 수 있다(양 브랜드 결손 + title NULL인 stub — Plan R3).
 * 정규화는 클라이언트의 몫이다(D-D).
 */
export interface FillQueueSnapshot {
  /** 큐 A — TJ song_numbers 행이 없는 곡. created_at ASC (D-C) */
  tj: SongListItem[];
  /** 큐 A — KY song_numbers 행이 없는 곡. created_at ASC */
  ky: SongListItem[];
  /** 큐 B — title IS NULL OR artist IS NULL. created_at ASC */
  meta: SongListItem[];
  /**
   * owner의 전체 곡 수. 세 배열이 전부 비었을 때 "아직 곡이 없어요"와 "다 채웠어요"를
   * 가르는 유일한 단서다 — 결손 0과 곡 0은 스냅샷만으로는 구분되지 않는다(Check Gap-1).
   * 건수 자체는 여전히 배열 길이에서 파생한다(§4.2). 이 필드는 배지가 아니라 빈 상태 판정용이다.
   */
  totalSongs: number;
}

export interface SongQuery {
  /** owner 스코프 통합검색. keyword는 이미 trim된 비어있지 않은 문자열 */
  search(ownerId: string, keyword: string): Promise<SongListItem[]>;
  /** owner 스코프 전체 목록. 정렬: title NULLS FIRST → artist NULLS FIRST (§2.3 D-J) */
  list(ownerId: string): Promise<SongListItem[]>;
  /** 수정 후 확정값 반환용 단건 조회. 타 owner면 null */
  findById(ownerId: string, songId: string): Promise<SongListItem | null>;
  /**
   * 빈칸채우기 큐 스냅샷. 세 쿼리를 병렬 실행한다 (§5.6 이행, expand-fill-queue §3.3).
   * 정렬은 created_at ASC — 묵은 결손부터이며, 저장이 updated_at을 touch해도 순서가 흔들리지 않는다(D-C).
   */
  fillQueue(ownerId: string): Promise<FillQueueSnapshot>;
}
