// Design Ref: §9.4, §5.3 — 번호 기반 곡 해석 (stub 생성 포함)
import type { Brand, Song } from "@/domain";

export interface SongRepo {
  findByOwnerBrandNumber(
    ownerId: string,
    brand: Brand,
    number: string,
  ): Promise<Song | null>;
  /** title=NULL(stub) 곡 생성 + song_numbers(AVAILABLE) 동시 생성 (Plan §6.2: title은 빈 문자열 금지) */
  createStubWithNumber(ownerId: string, brand: Brand, number: string): Promise<Song>;
}
