import { readFileSync, existsSync } from "node:fs";
import { config } from "dotenv";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
const root = process.cwd();
config({ path: resolve(root, ".env"), quiet: true });
process.env.RECUR_ROOT = root;
if (process.env.RECUR_PRODUCTION === "true")
  Object.assign(process.env, { NODE_ENV: "production" });
const webHost = process.env.WEB_HOST ?? "127.0.0.1";
if (
  !["127.0.0.1", "localhost", "::1"].includes(webHost) &&
  (process.env.RECUR_ACCESS_TOKEN?.length ?? 0) < 24
)
  throw new Error(
    "Non-loopback binding requires RECUR_ACCESS_TOKEN with at least 24 characters",
  );
const twinFile = resolve(root, ".recur/twin.json");
if (process.env.ARGA_ENABLED === "true" && existsSync(twinFile)) {
  const twin = JSON.parse(readFileSync(twinFile, "utf8"));
  process.env.ARGA_STRIPE_BASE_URL ||= twin.twins?.stripe?.base_url;
  process.env.ARGA_RUN_ID ||= twin.run_id;
  process.env.ARGA_EXPIRES_AT ||= twin.expires_at;
}
process.env.DATABASE_URL = `file:${resolve(root, (process.env.DATABASE_URL ?? "file:./recur.db").replace(/^file:/, ""))}`;
const children = [
  spawn(
    process.execPath,
    ["--import", "tsx", resolve(root, "scripts/worker.ts")],
    { cwd: root, env: process.env, stdio: "inherit" },
  ),
  spawn(
    process.execPath,
    ["--import", "tsx", "apps/demo-service/src/server.ts"],
    { cwd: root, env: process.env, stdio: "inherit" },
  ),
  spawn(
    process.execPath,
    [
      resolve(root, "apps/web/node_modules/next/dist/bin/next"),
      process.env.RECUR_PRODUCTION === "true" ? "start" : "dev",
      ...(process.env.RECUR_PRODUCTION === "true" ? [] : ["--webpack"]),
      "--port",
      process.env.WEB_PORT ?? "3000",
      "--hostname",
      webHost,
    ],
    { cwd: resolve(root, "apps/web"), env: process.env, stdio: "inherit" },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((c) => c.kill("SIGTERM"));
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
children.forEach((c) => c.on("exit", (code) => stop(code ?? 0)));
