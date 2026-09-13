import type { NextConfig } from "next";
import { resolve } from "node:path";
const config: NextConfig = {
  devIndicators: false,
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
