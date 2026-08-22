-- Design Ref: §3.3 — idx_songs_trgm(GIN)이 gin_trgm_ops를 쓰므로 스키마 마이그레이션보다 먼저 필요
CREATE EXTENSION IF NOT EXISTS pg_trgm;
