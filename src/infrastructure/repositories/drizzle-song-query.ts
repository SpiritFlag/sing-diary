// Design Ref: §3.4, §9.4, §1.3 ★ⓐ — SongQuery의 Drizzle 구현. 읽기 전용, Neon HTTP 드라이버(db) 사용.
import { and, count, eq, isNull, or, sql } from "drizzle-orm";
import type { Brand } from "@/domain";
import type {
  FillQueueSnapshot,
  NumberView,
  SongListItem,
  SongQuery,
} from "@/application/ports/song-query";
import { songNumbers, songs } from "../db/schema";
import type { DbOrTx } from "./types";

// drizzle/0001_cool_next_avengers.sql:49 의 idx_songs_trgm 표현식과 문자열이 일치해야 한다
// (§1.3 ★ⓐ — owner 스코프에서는 실제로 이 인덱스를 타지 않지만, 표현식은 규모가 커질 날을 위해 유지한다).
// 여기를 고치면 schema.ts의 인덱스 정의와 마이그레이션도 함께 고칠 것.
const SEARCH_EXPR = sql`(coalesce(${songs.title}, '') || ' ' || coalesce(${songs.artist}, '') || ' ' || coalesce(${songs.memo}, ''))`;

// ILIKE 와일드카드(%, _, \)를 리터럴로 이스케이프한다 — 파라미터 바인딩은 SQL 인젝션만 막을 뿐
// 패턴 문자는 그대로 살아남는다 (Plan R9).
export function toLikePattern(keyword: string): string {
  return "%" + keyword.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
}

type SongWithNumbers = typeof songs.$inferSelect & {
  numbers: (typeof songNumbers.$inferSelect)[];
};

function toListItem(row: SongWithNumbers): SongListItem {
  const numbers: Record<Brand, NumberView> = { TJ: null, KY: null };
  for (const n of row.numbers) {
    numbers[n.brand] = { status: n.status, number: n.number };
  }
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    memo: row.memo,
    numbers,
    updatedAt: row.updatedAt,
  };
}

// Design Ref: expand-fill-queue §2.3 D-C — 큐 정렬은 불변 컬럼(created_at)으로 한다.
// updated_at은 setNumber/updateMeta가 touch하므로 정렬 키로 쓰면 한 건 저장할 때마다 카드가 튄다.
const FILL_SORT_ORDER = [sql`${songs.createdAt} ASC`, sql`${songs.id} ASC`];

// Design Ref: expand-fill-queue §3.3 — ARCHITECT §5.6의 "LEFT JOIN … WHERE n.song_id IS NULL"을
// NOT EXISTS로 표현한 것. 의미는 동일하고, 카드 표시용 numbers는 relation 로드가 따로 가져온다.
// 판정 기준은 "행 없음"이다 — UNSUPPORTED 행이 있으면 결손이 아니다(3-state 계약, §8.2 #32).
// 서브쿼리의 테이블·컬럼은 리터럴로 적고 별칭(fq)을 준다 — 관계형 쿼리 빌더의 where 안에서는
// 컬럼 참조(${songNumbers.songId})가 바깥 별칭("songs")으로 렌더링되어 상관 서브쿼리가 깨진다(실측).
// 바깥 참조인 ${songs.id}만 빌더에 맡긴다.
function missingNumberRow(brand: Brand) {
  return sql`NOT EXISTS (
    SELECT 1 FROM "song_numbers" fq
    WHERE fq."song_id" = ${songs.id} AND fq."brand" = ${brand}::brand_enum
  )`;
}

const SORT_ORDER = [
  sql`${songs.title} ASC NULLS FIRST`,
  sql`${songs.artist} ASC NULLS FIRST`,
];

export function createDrizzleSongQuery(db: DbOrTx): SongQuery {
  return {
    async search(ownerId, keyword) {
      const rows = await db.query.songs.findMany({
        where: and(
          eq(songs.ownerId, ownerId),
          sql`${SEARCH_EXPR} ILIKE ${toLikePattern(keyword)} ESCAPE '\\'`,
        ),
        with: { numbers: true },
        orderBy: SORT_ORDER,
      });
      return rows.map(toListItem);
    },

    async list(ownerId) {
      const rows = await db.query.songs.findMany({
        where: eq(songs.ownerId, ownerId),
        with: { numbers: true },
        orderBy: SORT_ORDER,
      });
      return rows.map(toListItem);
    },

    async findById(ownerId, songId) {
      const row = await db.query.songs.findFirst({
        where: and(eq(songs.id, songId), eq(songs.ownerId, ownerId)),
        with: { numbers: true },
      });
      return row ? toListItem(row) : null;
    },

    // Design Ref: expand-fill-queue §3.2 D-A — 세 쿼리를 Promise.all로 병렬 발사한다.
    // 읽기 1발이 ~700ms대이므로 직렬이면 그대로 3배가 된다.
    async fillQueue(ownerId): Promise<FillQueueSnapshot> {
      const byBrand = (brand: Brand) =>
        db.query.songs.findMany({
          where: and(eq(songs.ownerId, ownerId), missingNumberRow(brand)),
          with: { numbers: true },
          orderBy: FILL_SORT_ORDER,
        });

      const [tj, ky, meta, counted] = await Promise.all([
        byBrand("TJ"),
        byBrand("KY"),
        // 큐 B — §5.6 원문 그대로 title/artist만 본다. memo는 큐 대상이 아니다.
        db.query.songs.findMany({
          where: and(
            eq(songs.ownerId, ownerId),
            or(isNull(songs.title), isNull(songs.artist)),
          ),
          with: { numbers: true },
          orderBy: FILL_SORT_ORDER,
        }),
        // Check Gap-1 — 결손 0과 곡 0을 가르는 값. 네 번째 발이지만 같은 Promise.all이라
        // 벽시계는 여전히 가장 느린 하나다. 행을 세기만 하므로 relation 로드도 없다.
        db.select({ n: count() }).from(songs).where(eq(songs.ownerId, ownerId)),
      ]);

      return {
        tj: tj.map(toListItem),
        ky: ky.map(toListItem),
        meta: meta.map(toListItem),
        totalSongs: counted[0]?.n ?? 0,
      };
    },
  };
}
