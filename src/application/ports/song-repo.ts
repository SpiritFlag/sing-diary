// Design Ref: §9.4, §5.3, §3.3 — 번호 기반 곡 해석(stub 생성 포함) + 곡 관리 표 쓰기(§2.3 D-B)
import type { Brand, Song } from "@/domain";

export interface SongMetaPatch {
  title?: string | null; // 키 부재 = 미변경, null = 비움
  artist?: string | null;
  memo?: string | null;
}

/** 번호 조작의 3-state 표현 — "행 없음"은 clearNumber()가 담당한다 (Plan R3) */
export type NumberInput =
  | { status: "AVAILABLE"; number: string } // number 필수(빈 문자열 불가)
  | { status: "UNSUPPORTED" };

export interface SongRepo {
  findByOwnerBrandNumber(
    ownerId: string,
    brand: Brand,
    number: string,
  ): Promise<Song | null>;
  /** title=NULL(stub) 곡 생성 + song_numbers(AVAILABLE) 동시 생성 (Plan §6.2: title은 빈 문자열 금지) */
  createStubWithNumber(ownerId: string, brand: Brand, number: string): Promise<Song>;

  /** 반환값은 "해당 owner의 곡을 실제로 건드렸는가" — false면 유스케이스가 SONG_NOT_FOUND를 던진다 (§2.3 D-E) */
  updateMeta(ownerId: string, songId: string, patch: SongMetaPatch): Promise<boolean>;
  setNumber(ownerId: string, songId: string, brand: Brand, input: NumberInput): Promise<boolean>;
  clearNumber(ownerId: string, songId: string, brand: Brand): Promise<boolean>;
}
