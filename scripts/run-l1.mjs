// Design Ref: §8.4 L1 API 테스트. Clerk 미들웨어의 handshake가 curl의 JS 리다이렉트를
// 요구해 익명 curl로는 인증 라우트를 못 찍는다(module-1부터의 구조적 한계) — 이 스크립트는
// Clerk Backend API로 전용 테스트 유저의 실제 세션 JWT를 발급해 Authorization: Bearer로
// 우회한다. 끝나면 그 테스트 유저의 DB 행 + Clerk 유저 자체를 정확히 scope된 대상만 지운다
// (resetAndSeed류의 전체 delete는 절대 쓰지 않는다 — 그게 이 사이클에서 낸 사고였다).
import { randomBytes } from "crypto";
import { createClerkClient } from "@clerk/backend";
import { Client } from "pg";

const TARGET_URL = process.env.L1_TARGET_URL ?? "https://sing-diary.spiritflag.work";
const TEST_EMAIL = "sing-diary-l1-test@example.com";

// Design Ref: refine-auth-boundary §8.2 D-H — 콜드/워밍 회차를 로그에서 구분하기 위한 라벨(선택).
const RUN_LABEL = process.env.L1_RUN_LABEL;

// Vercel Deployment Protection이 걸린 Preview(develop)를 찌를 때만 필요.
// Project Settings → Deployment Protection → Protection Bypass for Automation.
const VERCEL_BYPASS = process.env.L1_VERCEL_BYPASS;
const bypassHeader = VERCEL_BYPASS ? { "x-vercel-protection-bypass": VERCEL_BYPASS } : {};

function log(...args) {
  console.log(...args);
}

// Design Ref: refine-auth-boundary §8.2 D-H — 응답 헤더 수신까지의 클라이언트 측 왕복시간(ms)을
// 재서 Response에 스탬프한다. 콜드스타트·네트워크를 포함한 사용자 체감에 가장 가깝다.
async function req(path, opts = {}) {
  const start = performance.now();
  const res = await fetch(`${TARGET_URL}${path}`, {
    ...opts,
    headers: { ...opts.headers, ...bypassHeader },
  });
  res.elapsedMs = Math.round(performance.now() - start);
  return res;
}

const results = [];

function record(id, description, expected, res, body, pass) {
  results.push({ id, description, expected, status: res.status, body, pass, elapsedMs: res.elapsedMs });
  log(
    `${pass ? "✅" : "❌"} #${id} ${description} — expected ${expected}, got ${res.status} (${res.elapsedMs}ms)`,
  );
}

async function main() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const databaseUrl = process.env.DATABASE_URL;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is not set");
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const clerk = createClerkClient({ secretKey });

  log(`대상: ${TARGET_URL}${RUN_LABEL ? ` [${RUN_LABEL}]` : ""}`);
  log("테스트 유저 준비 중...");

  const existing = await clerk.users.getUserList({ emailAddress: [TEST_EMAIL] });
  let user = existing.data[0];
  if (!user) {
    user = await clerk.users.createUser({
      emailAddress: [TEST_EMAIL],
      password: randomBytes(24).toString("base64"),
      skipPasswordChecks: true,
    });
  }
  // sessions.createSession()은 development 인스턴스 전용이라 프로덕션 키에서는 거부된다.
  // 대신 Clerk가 공식 지원하는 sign-in token(ticket 전략)으로 실제 로그인을 리딤해 세션을 만든다.
  const signInToken = await clerk.signInTokens.createSignInToken({
    userId: user.id,
    expiresInSeconds: 60,
  });
  const clerkFrontendApi = process.env.NEXT_PUBLIC_CLERK_DOMAIN
    ? `https://${process.env.NEXT_PUBLIC_CLERK_DOMAIN}`
    : null;
  if (!clerkFrontendApi) throw new Error("NEXT_PUBLIC_CLERK_DOMAIN is not set");

  const redeemRes = await fetch(`${clerkFrontendApi}/v1/client/sign_ins`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ strategy: "ticket", ticket: signInToken.token }),
  });
  const redeemBody = await redeemRes.json();
  if (!redeemRes.ok) {
    throw new Error(`sign-in token 리딤 실패: ${JSON.stringify(redeemBody)}`);
  }
  const sessionId = redeemBody.response?.created_session_id;
  if (!sessionId) {
    throw new Error(`created_session_id를 못 찾음: ${JSON.stringify(redeemBody)}`);
  }
  const token = await clerk.sessions.getToken(sessionId);
  const authHeader = { Authorization: `Bearer ${token.jwt}` };
  log(`테스트 유저 ${user.id} 세션 발급 완료`);

  // module-6 추가 — #14/#15(owner 격리)용 타 owner 시드 1건. id를 변수로 보관해
  // finally에서 그 id만 삭제한다(§8.3 — 조건절 범위 삭제 아님, 기존 delete문은 무수정).
  const OTHER_OWNER_ID = "l1-test-other-owner";
  const OTHER_SONG_TITLE = "L1엘원다른소유자곡";
  let otherSongId;
  {
    const setupPg = new Client({ connectionString: databaseUrl });
    await setupPg.connect();
    try {
      const { rows } = await setupPg.query(
        `INSERT INTO songs (owner_id, title, artist, memo) VALUES ($1, $2, NULL, NULL) RETURNING id`,
        [OTHER_OWNER_ID, OTHER_SONG_TITLE],
      );
      otherSongId = rows[0].id;
      log(`타 owner 시드 곡 생성: ${otherSongId}`);
    } finally {
      await setupPg.end();
    }
  }

  let songId; // 5번에서 캡처 — 10~19번 곡 카탈로그 테스트가 이 곡을 재사용한다

  try {
    // 1. GET /api/sessions/current — 미인증 — 401 UNAUTHORIZED
    {
      const res = await req("/api/sessions/current");
      const body = await res.json().catch(() => null);
      const pass = res.status === 401 && body?.error?.code === "UNAUTHORIZED";
      record(1, "GET current (미인증)", 401, res, body, pass);
    }

    // 2. POST /api/sessions — brand='XX' — 400 + fieldErrors
    {
      const res = await req("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ visitDate: "2026-08-23", venue: "L1테스트", brand: "XX" }),
      });
      const body = await res.json().catch(() => null);
      const pass = res.status === 400 && Boolean(body?.error?.details?.fieldErrors);
      record(2, "POST /sessions brand=XX", 400, res, body, pass);
    }

    // 3. POST /api/sessions — 정상 — 201
    let sessionId;
    {
      const res = await req("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ visitDate: "2026-08-23", venue: "L1테스트", brand: "TJ" }),
      });
      const body = await res.json().catch(() => null);
      sessionId = body?.data?.id;
      record(3, "POST /sessions 정상", 201, res, body, res.status === 201 && Boolean(sessionId));
    }

    // 4. POST /api/sessions/:id/entries — number='' — 400
    {
      const res = await req(`/api/sessions/${sessionId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ number: "" }),
      });
      const body = await res.json().catch(() => null);
      record(4, "POST entries number=''", 400, res, body, res.status === 400);
    }

    // 5. POST /api/sessions/:id/entries — 정상 — 201
    let entryId;
    {
      const res = await req(`/api/sessions/${sessionId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ number: "99999" }),
      });
      const body = await res.json().catch(() => null);
      entryId = body?.data?.id;
      songId = body?.data?.song?.id;
      record(
        5,
        "POST entries 정상",
        201,
        res,
        body,
        res.status === 201 && typeof body?.data?.position === "number",
      );
    }

    // 6. PATCH /api/entries/:id — score=101 — 400
    {
      const res = await req(`/api/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ score: 101 }),
      });
      const body = await res.json().catch(() => null);
      record(6, "PATCH score=101", 400, res, body, res.status === 400);
    }

    // 7. PUT .../entries/order — id 누락 배열 — 400 INVALID_POSITION_SET
    {
      const res = await req(`/api/sessions/${sessionId}/entries/order`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ entryIds: ["00000000-0000-0000-0000-000000000000"] }),
      });
      const body = await res.json().catch(() => null);
      const pass = res.status === 400 && body?.error?.code === "INVALID_POSITION_SET";
      record(7, "PUT order 불일치 집합", 400, res, body, pass);
    }

    // 8. DELETE /api/entries/:id — 정상 — 200 후 position 연속
    {
      const res = await req(`/api/entries/${entryId}`, {
        method: "DELETE",
        headers: authHeader,
      });
      const body = await res.json().catch(() => null);
      record(8, "DELETE entry 정상", 200, res, body, res.status === 200);
    }

    // 9. GET / — 미인증 페이지 접근 — sign-in으로 리다이렉트
    // Design Ref: refine-auth-boundary §8.2 — Node fetch는 Accept:*/* 라 Clerk handshake
    // 대상이 아니다. redirect:"manual"로 3xx + Location을 직접 판정한다(opaqueredirect 아님).
    {
      const res = await req("/", { redirect: "manual" });
      const location = res.headers.get("location") ?? "";
      const pass = [302, 303, 307, 308].includes(res.status) && location.includes("/sign-in");
      record(9, "GET / (미인증 페이지)", "3xx → /sign-in", res, { location }, pass);
    }

    // Design Ref: expand-song-catalog §8.2 — module-6 추가분. #1~#9는 위 그대로, 여기부터 신설.

    // 10. GET /api/songs/search?q=x — 미인증 — 401 UNAUTHORIZED
    {
      const res = await req("/api/songs/search?q=x");
      const body = await res.json().catch(() => null);
      const pass = res.status === 401 && body?.error?.code === "UNAUTHORIZED";
      record(10, "GET songs/search (미인증)", 401, res, body, pass);
    }

    // 11. GET /api/songs/search?q= — 인증, 빈 키워드 — 400 VALIDATION_ERROR
    {
      const res = await req("/api/songs/search?q=", { headers: authHeader });
      const body = await res.json().catch(() => null);
      const pass = res.status === 400 && body?.error?.code === "VALIDATION_ERROR";
      record(11, "GET songs/search q=''", 400, res, body, pass);
    }

    // 12. GET /api/songs — 인증 — 200, data 배열
    {
      const res = await req("/api/songs", { headers: authHeader });
      const body = await res.json().catch(() => null);
      const pass = res.status === 200 && Array.isArray(body?.data);
      record(12, "GET songs 목록", 200, res, body, pass);
    }

    // 13. 검색 — memo 매칭 확인 (FR-01 핵심). 먼저 5번의 stub 곡 memo를 채운 뒤 그 문자열로 검색
    const MEMO_MARKER = "L1검색마커";
    {
      await req(`/api/songs/${songId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ memo: MEMO_MARKER }),
      });
      const res = await req(`/api/songs/search?q=${encodeURIComponent(MEMO_MARKER)}`, {
        headers: authHeader,
      });
      const body = await res.json().catch(() => null);
      const found = Array.isArray(body?.data) && body.data.some((s) => s.id === songId);
      record(13, "GET songs/search memo 매칭", 200, res, body, res.status === 200 && found);
    }

    // 14. 검색 — 타 owner 제목으로는 안 나온다 (owner 스코프, Plan R5 핵심)
    {
      const res = await req(
        `/api/songs/search?q=${encodeURIComponent(OTHER_SONG_TITLE)}`,
        { headers: authHeader },
      );
      const body = await res.json().catch(() => null);
      const pass = res.status === 200 && Array.isArray(body?.data) && body.data.length === 0;
      record(14, "GET songs/search 타owner 미노출", 200, res, body, pass);
    }

    // 15. PATCH /api/songs/:id — 타 owner 곡 — 404 SONG_NOT_FOUND (§2.3 D-E 핵심)
    {
      const res = await req(`/api/songs/${otherSongId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ title: "탈취 시도" }),
      });
      const body = await res.json().catch(() => null);
      const pass = res.status === 404 && body?.error?.code === "SONG_NOT_FOUND";
      record(15, "PATCH songs 타owner", 404, res, body, pass);
    }

    // 16. PUT songs/:id/numbers/TJ — AVAILABLE + 빈 번호 — 400
    {
      const res = await req(`/api/songs/${songId}/numbers/TJ`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ status: "AVAILABLE", number: "" }),
      });
      const body = await res.json().catch(() => null);
      record(16, "PUT numbers AVAILABLE 빈번호", 400, res, body, res.status === 400);
    }

    // 17. PUT songs/:id/numbers/TJ — UNSUPPORTED — 재조회로 상태 확인
    {
      const res = await req(`/api/songs/${songId}/numbers/TJ`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ status: "UNSUPPORTED" }),
      });
      const body = await res.json().catch(() => null);
      const listRes = await req("/api/songs", { headers: authHeader });
      const listBody = await listRes.json().catch(() => null);
      const row = listBody?.data?.find((s) => s.id === songId);
      const pass = res.status === 200 && row?.numbers?.TJ?.status === "UNSUPPORTED";
      record(17, "PUT numbers UNSUPPORTED → 재조회", 200, res, body, pass);
    }

    // 18. DELETE songs/:id/numbers/TJ — 재조회로 행 없음(null) 확인 (M3 큐 A 계약 핵심)
    {
      const res = await req(`/api/songs/${songId}/numbers/TJ`, {
        method: "DELETE",
        headers: authHeader,
      });
      const body = await res.json().catch(() => null);
      const listRes = await req("/api/songs", { headers: authHeader });
      const listBody = await listRes.json().catch(() => null);
      const row = listBody?.data?.find((s) => s.id === songId);
      const pass = res.status === 200 && row?.numbers?.TJ === null;
      record(18, "DELETE numbers → 재조회 null", 200, res, body, pass);
    }

    // 19. PATCH songs/:id — title 빈 문자열 — 재조회로 NULL 확인 (M3 큐 B 계약, Plan R4 핵심)
    {
      const res = await req(`/api/songs/${songId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ title: "  " }),
      });
      const body = await res.json().catch(() => null);
      const listRes = await req("/api/songs", { headers: authHeader });
      const listBody = await listRes.json().catch(() => null);
      const row = listBody?.data?.find((s) => s.id === songId);
      const pass = res.status === 200 && row?.title === null;
      record(19, "PATCH title 빈문자열 → NULL", 200, res, body, pass);
    }
  } finally {
    log("정리 중 — 테스트 유저 소유 데이터만 정확히 scope해서 삭제...");
    const pg = new Client({ connectionString: databaseUrl });
    await pg.connect();
    try {
      await pg.query(
        `DELETE FROM entries WHERE session_id IN (SELECT id FROM sessions WHERE owner_id = $1)`,
        [user.id],
      );
      await pg.query(`DELETE FROM sessions WHERE owner_id = $1`, [user.id]);
      await pg.query(
        `DELETE FROM song_numbers WHERE song_id IN (SELECT id FROM songs WHERE owner_id = $1)`,
        [user.id],
      );
      await pg.query(`DELETE FROM songs WHERE owner_id = $1`, [user.id]);
      // module-6 추가 — 타 owner 시드 1건만 id로 정확히 지운다(owner_id 범위 삭제 아님, §8.3)
      if (otherSongId) {
        await pg.query(`DELETE FROM songs WHERE id = $1`, [otherSongId]);
      }
    } finally {
      await pg.end();
    }
    await clerk.users.deleteUser(user.id);
    log("정리 완료");
  }

  const pass = results.filter((r) => r.pass).length;
  log(`\nL1 결과: ${pass}/${results.length} 통과`);
  if (pass !== results.length) {
    log("실패 항목:");
    for (const r of results.filter((r) => !r.pass)) {
      log(`  #${r.id} ${r.description}:`, JSON.stringify(r.body));
    }
    process.exitCode = 1;
  }

  // Design Ref: refine-auth-boundary §8.2 D-H — ms는 판정에 쓰지 않는다. NFR 기준은
  // Analysis에서 콜드/워밍 실측 근거로 확정한다(Plan §3.2). 이 표는 그 원자재일 뿐이다.
  log(`\n# desc status ms`);
  for (const r of results) {
    log(`${r.id}  ${r.description}  ${r.status}  ${r.elapsedMs}ms`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
