import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, globalIgnores } from "eslint/config";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Design Ref: docs/PDCA/2026-08/first-take/first-take.design.md §9.3 — 계층 간 import 규칙
const layerBoundaries = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@/application/*", "@/infrastructure/*", "@/presentation/*"],
            message: "domain은 다른 계층을 import할 수 없다 (§9.3).",
          },
        ],
      },
    ],
  },
  files: ["src/domain/**/*.{ts,tsx}"],
};

const applicationBoundaries = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@/infrastructure/*", "@/presentation/*", "next/*", "@clerk/*", "zod"],
            message: "application은 domain과 자신의 ports만 참조한다 (§9.3).",
          },
        ],
      },
    ],
  },
  files: ["src/application/**/*.{ts,tsx}"],
};

const infrastructureBoundaries = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@/presentation/*", "next/*"],
            message: "infrastructure는 domain과 application/ports만 참조한다 (§9.3).",
          },
        ],
      },
    ],
  },
  files: ["src/infrastructure/**/*.{ts,tsx}"],
};

const presentationBoundaries = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@/infrastructure/*"],
            message:
              "presentation은 infrastructure를 직접 참조할 수 없다 — container.ts에서만 조립한다 (§9.3).",
          },
        ],
      },
    ],
  },
  files: ["src/presentation/**/*.{ts,tsx}"],
  ignores: ["src/presentation/container.ts"],
};

// Design Ref: expand-song-catalog §7.2 — API 라우트 핸들러는 withAuth()로 감싸야 한다.
// 형태만 강제한다(§7.2 한계 참조) — 실수로 가드를 빠뜨리는 것을 막는 것이 목적이다.
const apiRouteGuard = {
  files: ["src/app/api/**/route.ts"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector:
          "ExportNamedDeclaration > FunctionDeclaration[id.name=/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/]",
        message:
          "라우트 핸들러는 `export const GET = withAuth(...)` 형태여야 한다 (expand-song-catalog §7.2).",
      },
      {
        selector:
          "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.name=/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/]:not([init.callee.name='withAuth'])",
        message:
          "라우트 핸들러는 withAuth()로 감싸야 한다 — 인증 가드 누락 방지 (expand-song-catalog §7.2).",
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  layerBoundaries,
  applicationBoundaries,
  infrastructureBoundaries,
  presentationBoundaries,
  apiRouteGuard,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "drizzle/**"]),
]);

export default eslintConfig;
