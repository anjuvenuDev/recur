import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["artifacts/regression/*.test.ts"], testTimeout: 15000 },
});
