// Design Ref: §3.1 — Session 엔티티
import type { Brand } from "./song";

export interface Session {
  id: string;
  ownerId: string;
  visitDate: string; // date (YYYY-MM-DD)
  venue: string;
  brand: Brand;
  isPublic: boolean; // M1에서는 항상 false
  closedAt: Date | null; // NULL = 진행 중
  createdAt: Date;
}
