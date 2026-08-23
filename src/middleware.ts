import { clerkMiddleware } from "@clerk/nextjs/server";

// Design Ref: refine-auth-boundary §2.3 D-A — 보호는 리소스(라우트·페이지)가 한다.
// 미들웨어는 auth() 컨텍스트 공급용 껍데기. createRouteMatcher/auth.protect()는 쓰지 않는다.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
