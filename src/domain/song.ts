// Design Ref: §3.1 — Song/SongNumber 엔티티. Domain은 어떤 외부 패키지도 import하지 않는다 (§9.3)

export type Brand = "TJ" | "KY";
export type NumberStatus = "AVAILABLE" | "UNSUPPORTED";

export interface Song {
  id: string;
  ownerId: string;
  title: string | null; // NULL = stub. 빈 문자열 금지 (M3 빈칸채우기 큐 계약, Plan §6.2)
  artist: string | null;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SongNumber {
  songId: string;
  brand: Brand;
  number: string | null; // AVAILABLE이면 필수 — DB CHECK로 강제
  status: NumberStatus;
}
