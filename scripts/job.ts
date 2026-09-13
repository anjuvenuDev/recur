import { initializeLemma } from "../packages/integrations/src/lemma";
import "dotenv/config";
import { createStore } from "../packages/db/src/client";
import { getJob, finishJob } from "../packages/db/src/jobs";
import { executeJob } from "../packages/agents/src/job-dispatch";
import { sanitize } from "../packages/core/src/evidence";
import { closeFlags } from "../packages/integrations/src/flags";
const [id, owner] = process.argv.slice(2);
if (!id || !owner) throw new Error("Internal job arguments missing");
const store = createStore();
try {
  const job = await getJob(store, id);
  if (!job || job.owner !== owner || job.status !== "running")
    throw new Error("Job is not owned by this worker");
  store.guardJob(job.id, owner);
  const lemma = initializeLemma(job.id, job.incidentId);
  try {
    const result = await executeJob(store, job);
    await lemma.flush(store);
    await finishJob(store, id, owner, result);
  } catch (e) {
    await lemma.flush(store).catch(() => {});
    await finishJob(
      store,
      id,
      owner,
      null,
      String(sanitize(e instanceof Error ? e.message : "Job failed")),
    );
    process.exitCode = 1;
  }
} finally {
  closeFlags();
  store.close();
}
