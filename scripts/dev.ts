import { config } from "dotenv";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
const root = process.cwd();
config({ path: resolve(root, ".env"), quiet: true });
process.env.RECUR_ROOT = root;
process.env.DATABASE_URL = `file:${resolve(root, (process.env.DATABASE_URL ?? "file:./recur.db").replace(/^file:/, ""))}`;
const children = [
  spawn(
    process.execPath,
    [
      resolve(root, "node_modules/tsx/dist/cli.mjs"),
      "apps/demo-service/src/server.ts",
    ],
    { cwd: root, env: process.env, stdio: "inherit" },
  ),
  spawn(
    process.execPath,
    [
      resolve(root, "apps/web/node_modules/next/dist/bin/next"),
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
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
