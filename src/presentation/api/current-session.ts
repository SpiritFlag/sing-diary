// Design Ref: §9.4 — layout.tsx와 page.tsx가 같은 요청 안에서 getCurrentSession을 중복 호출하지 않도록 request-scope 캐시
import { cache } from "react";
import { useCases } from "@/presentation/container";

export const getCurrentSessionCached = cache(useCases.getCurrentSession);
