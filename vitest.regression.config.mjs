import { defineConfig } from "vitest/config";
export default defineConfig({
  cacheDir: "artifacts/.vite",
  test: { include: ["artifacts/regression/*.test.ts"], testTimeout: 15000 },
});
