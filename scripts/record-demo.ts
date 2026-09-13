import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const exec = promisify(execFile);
const browser = process.env.AGENT_BROWSER_BIN ?? "agent-browser";
const base = process.env.RECUR_DEMO_URL ?? "http://127.0.0.1:3000";
const root = process.cwd();
await mkdir("artifacts/demo", { recursive: true });
const run = async (...args: string[]) => {
  const r = await exec(browser, args, { timeout: 45000, maxBuffer: 1000000 });
  return r.stdout;
};
await run("set", "viewport", "1440", "1000");
await run("open", base);
await run("find", "role", "button", "click", "--name", "↺ Reset demo");
await delay(5000);
await run("open", base);
await delay(1500);
await run(
  "record",
  "start",
  resolve(root, "artifacts/demo/recur-raw.mp4"),
  "--fps",
  "15",
);
const started = performance.now();
const milestones: { at: number; label: string }[] = [];
const at = async (seconds: number) => {
  await delay(Math.max(0, seconds * 1000 - (performance.now() - started)));
};
const mark = (label: string) => {
  milestones.push({
    at: Math.round((performance.now() - started) / 100) / 10,
    label,
  });
  console.log(label);
};
try {
  mark("Captured incident and five causal observations");
  await at(14);
  await run("find", "role", "button", "click", "--name", "↻ Reproduce failure");
  await run("wait", "--text", "BUG REPRODUCED");
  mark("Actual reproduction complete");
  await at(25);
  await run("find", "role", "button", "click", "--name", "Replay attempts");
  await run("scroll", "down", "430");
  mark("Mismatch versus exact target failure");
  await at(40);
  await run("find", "role", "link", "click", "--name", "View capsule ↗");
  await delay(800);
  mark("Portable capsule with source and state");
  await at(49);
  await run("find", "role", "button", "click", "--name", "↓ Export JSON");
  await at(55);
  await run("open", base);
  await delay(800);
  await run("find", "role", "button", "click", "--name", "Verify fix");
  await run("wait", "--text", "REGRESSION PASSES");
  await run("scroll", "down", "970");
  mark("Actual generated test: buggy failure, fixed pass");
  await at(84);
  await run("find", "role", "button", "click", "--name", "Run ablation");
  await run("wait", "--text", "NO TARGET FAILURE");
  mark("Four causal ablations");
  await at(99);
  await run("open", `${base}/evals`);
  await run("wait", "--text", "10/10");
  mark("Ten negative and positive evaluation scenarios");
  await at(112);
  await run("open", base);
  await delay(1000);
  await run("screenshot", resolve(root, "docs/assets/workspace.png"), "--full");
  mark("Final verified result");
  await at(120);
} finally {
  await run("record", "stop");
  await writeFile(
    "artifacts/demo/milestones.json",
    JSON.stringify(milestones, null, 2),
  );
}
console.log(
  "Recorded local fixture demonstration. Credentials are required for the live submission take.",
);
