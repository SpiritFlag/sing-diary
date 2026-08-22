// Design Ref: §9.4 — application/ports. infrastructure가 구현, presentation은 인터페이스만 안다.
import type { Brand, Session } from "@/domain";

export interface CreateSessionInput {
  ownerId: string;
  visitDate: string;
  venue: string;
  brand: Brand;
}

export interface SessionRepo {
  findOpenByOwner(ownerId: string): Promise<Session | null>;
  findByIdForOwner(id: string, ownerId: string): Promise<Session | null>;
  closeAllOpen(ownerId: string): Promise<void>;
  create(input: CreateSessionInput): Promise<Session>;
}
