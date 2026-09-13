import type { NextConfig } from "next";
import { resolve } from "node:path";
const config: NextConfig = {
  devIndicators: false,
  distDir: process.env.RECUR_NEXT_DIST ?? ".next",
  serverExternalPackages: [
    "@libsql/client",
    "@openai/agents",
    "@launchdarkly/node-server-sdk",
    "@opentelemetry/sdk-trace-base",
    "typescript",
  ],
  turbopack: { root: resolve(process.cwd(), "../..") },
};
export default config;
