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
    // Lightsail RAM 1.9GB — 워커를 늘리면 스왑으로 밀려난다
    maxWorkers: 1,
    minWorkers: 1,
  },
});
