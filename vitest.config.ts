import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
    // Lightsail RAM 1.9GB — 워커를 늘리면 스왑으로 밀려난다.
    // minWorkers는 이 vitest 버전의 InlineConfig에 없는 속성이라 타입 에러(PR #6에서 확인) — maxWorkers만으로 충분하다.
    maxWorkers: 1,
  },
});
