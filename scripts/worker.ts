import "dotenv/config";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createStore } from "../packages/db/src/client";
import {
  workerPulse,
  claimNext,
  heartbeat,
  recoverExpired,
  getJob,
  finishJob,
} from "../packages/db/src/jobs";
import { IncidentSchema } from "../packages/core/src/domain";
const root = process.env.RECUR_ROOT ?? process.cwd();
const owner = `worker-${randomUUID()}`;
const store = createStore();
let stopping = false;
let child: ChildProcess | undefined;
function kill() {
  if (child?.pid) {
    try {
      if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
      else child.kill("SIGTERM");
    } catch {}
  }
}
process.on("SIGINT", () => {
  stopping = true;
  kill();
});
process.on("SIGTERM", () => {
  stopping = true;
  kill();
});
const workerTimer = setInterval(() => {
  void workerPulse(store, owner).catch(() => {});
}, 3000);
await workerPulse(store, owner);
console.log("Recur worker ready — durable SQLite jobs");
try {
  while (!stopping) {
    const recovered = await recoverExpired(store);
    for (const job of recovered) {
      const raw = await store.get("incidents", job.incidentId);
      if (raw) {
        const i = IncidentSchema.parse(raw);
        if (i.status === "reproducing") {
          i.status = "failed";
          await store.put("incidents", i.id, i.id, i);
        }
      }
    }
    const job = await claimNext(store, owner);
    if (!job) {
      await delay(300);
      continue;
    }
    child = spawn(
      process.execPath,
      ["--import", "tsx", resolve(root, "scripts/job.ts"), job.id, owner],
      {
        cwd: root,
        env: process.env,
        stdio: ["ignore", "inherit", "inherit"],
        detached: process.platform !== "win32",
      },
    );
    let lost = false;
    const pulse = setInterval(() => {
      void heartbeat(store, job.id, owner)
        .then((ok) => {
          if (!ok) {
            lost = true;
            kill();
          }
        })
        .catch(() => {
          lost = true;
          kill();
        });
    }, 4000);
    const timeout = setTimeout(() => {
      lost = true;
      kill();
    }, 180000);
    await new Promise<void>((resolveDone) => {
      child!.once("exit", () => resolveDone());
      child!.once("error", () => resolveDone());
    });
    clearInterval(pulse);
    clearTimeout(timeout);
    child = undefined;
    const final = await getJob(store, job.id);
    if (final?.status === "running") {
      await finishJob(
        store,
        job.id,
        owner,
        null,
        lost
          ? "Job timeout or lease loss; inspect outcomes before retrying."
          : "Worker execution interrupted; inspect outcomes before retrying.",
      ).catch(() => {});
    }
    console.log(`Job ${job.id}: ${(await getJob(store, job.id))?.status}`);
  }
} finally {
  clearInterval(workerTimer);
  await store.client.execute({
    sql: "DELETE FROM worker_heartbeats WHERE id=?",
    args: [owner],
  });
  kill();
  store.close();
}
