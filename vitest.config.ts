import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/demo-service/tests/**/*.test.ts"],
    testTimeout: 30000,
    env: { OPENAI_API_KEY: "", ARGA_ENABLED: "false" },
  },
});
