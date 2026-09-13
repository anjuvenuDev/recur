import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createStore } from "../packages/db/src/client";
import { enqueue, getJob, claimNext } from "../packages/db/src/jobs";
const directory = await mkdtemp(resolve(tmpdir(), "recur-restart-"));
const url = `file:${resolve(directory, "state.db")}`;
const store = createStore(url);
const root = process.cwd();
let worker: ChildProcess | undefined;
const start = () => {
  worker = spawn(process.execPath, ["--import", "tsx", "scripts/worker.ts"], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: url,
      RECUR_ROOT: root,
      OPENAI_API_KEY: "",
      ARGA_ENABLED: "false",
      GITHUB_OWNER: "",
      GITHUB_TOKEN: "",
      LAUNCHDARKLY_SDK_KEY: "",
      USERLENS_WRITE_CODE: "",
      LEMMA_API_KEY: "",
    },
    stdio: "ignore",
  });
};
async function stop() {
  if (!worker || worker.exitCode !== null) return;
  const exited = new Promise<void>((r) => worker!.once("exit", () => r()));
  worker.kill("SIGTERM");
  await exited;
  worker = undefined;
}
async function wait(id: string, status: string) {
  for (let i = 0; i < 300; i++) {
    const j = await getJob(store, id);
    if (j?.status === status) return j;
    if (j?.status === "failed") throw new Error(j.error ?? "Job failed");
    await delay(100);
  }
  throw new Error(`Job did not reach ${status}`);
}
try {
  const seed = await enqueue(store, "seed", "__global__", {}, "restart-seed");
  start();
  await wait(seed.id, "succeeded");
  await stop();
  const repro = await enqueue(
    store,
    "reproduce",
    "inc_refund_001",
    { teaching: true },
    "restart-repro",
  );
  start();
  await wait(repro.id, "succeeded");
  await stop();
  if (
    (await store.list("capsules")).length !== 1 ||
    (await store.list("attempts")).length !== 2
  )
    throw new Error("State did not survive process restart");
  const orphan = await enqueue(
    store,
    "ablate",
    "orphan",
    { capsuleId: "none" },
    "restart-orphan",
  );
  await claimNext(store, "crashed-worker", Date.now() - 30000, 1);
  start();
  await wait(orphan.id, "interrupted");
  await stop();
  if ((await store.list("capsules")).length !== 1)
    throw new Error("Unexpected replay on recovery");
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/restart-results.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "queued work survives worker restart",
          "two attempts and capsule survive worker exit",
          "expired running job becomes interrupted without replay",
        ],
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    "3 restart checks passed. No orphaned job was automatically replayed.",
  );
} finally {
  await stop();
  store.close();
  await rm(directory, { recursive: true, force: true });
}
