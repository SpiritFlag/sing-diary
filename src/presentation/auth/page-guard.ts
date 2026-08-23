// Design Ref: refine-auth-boundary §2.3 D-B/D-E — 브라우저 문서 요청용 가드. 실패는 sign-in 리다이렉트(원래 URL 복귀).
// Clerk redirectToSignIn()은 next/navigation redirect()를 throw하므로 try/catch 경로(API)와 절대 섞지 않는다.
import { auth } from "@clerk/nextjs/server";

export async function requireOwnerIdOrRedirect(): Promise<string> {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn(); // never — 구조분해 바인딩은 TS 단언 내로잉이 안 되므로 return으로 타입을 맞춘다
  return userId;
}
