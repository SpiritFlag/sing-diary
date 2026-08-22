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

// Vercel Deployment Protection이 걸린 Preview(develop)를 찌를 때만 필요.
// Project Settings → Deployment Protection → Protection Bypass for Automation.
const VERCEL_BYPASS = process.env.L1_VERCEL_BYPASS;
const bypassHeader = VERCEL_BYPASS ? { "x-vercel-protection-bypass": VERCEL_BYPASS } : {};

function log(...args) {
  console.log(...args);
}

function req(path, opts = {}) {
  return fetch(`${TARGET_URL}${path}`, {
    ...opts,
    headers: { ...opts.headers, ...bypassHeader },
  });
}

const results = [];

function record(id, description, expected, res, body, pass) {
  results.push({ id, description, expected, status: res.status, body, pass });
  log(`${pass ? "✅" : "❌"} #${id} ${description} — expected ${expected}, got ${res.status}`);
}

async function main() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const databaseUrl = process.env.DATABASE_URL;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is not set");
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const clerk = createClerkClient({ secretKey });

  log(`대상: ${TARGET_URL}`);
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

  try {
    // 1. GET /api/sessions/current — 미인증 — 401
    {
      const res = await req("/api/sessions/current");
      const body = await res.json().catch(() => null);
      record(1, "GET current (미인증)", 401, res, body, res.status === 401);
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
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
