import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/demo-service/tests/**/*.test.ts"],
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      include: [
        "packages/core/src/**/*.ts",
        "packages/db/src/**/*.ts",
        "packages/agents/src/**/*.ts",
        "packages/integrations/src/**/*.ts",
        "apps/demo-service/src/**/*.ts",
      ],
      exclude: ["**/*.test.ts", "**/server.ts"],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
    env: {
      OPENAI_API_KEY: "",
      ARGA_ENABLED: "false",
      USERLENS_WRITE_CODE: "",
      LEMMA_API_KEY: "",
      GITHUB_TOKEN: "",
      LAUNCHDARKLY_SDK_KEY: "",
    },
  },
});
