// Design Ref: §3.1 — Entry 엔티티

export interface Entry {
  id: string;
  sessionId: string;
  songId: string;
  position: number; // 1..N
  score: string | null; // numeric(5,2) — 정밀도 보존 위해 string
  createdAt: Date;
}
