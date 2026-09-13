import { publishOutcome } from "../../integrations/src/userlens";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Store } from "../../db/src/client";
import type { Job } from "../../db/src/jobs";
import { reproduce } from "./workflow";
import { generateRegression, verifyFix, ablate } from "./regression";
import { seedIncident } from "../../db/src/seed";
import { IncidentSchema } from "../../core/src/domain";
import { verifyCapsule } from "../../core/src/integrity";
import { runEvals } from "../../evals/runner";
export async function executeJob(store: Store, job: Job) {
  if (job.kind === "reproduce") {
    const input = z.object({ teaching: z.boolean() }).strict().parse(job.input);
    const capsule = await reproduce(store, job.incidentId, input);
    if (!capsule)
      throw new Error(
        "Not reproduced. Inspect the persisted mismatch or failure event.",
      );
    await publishOutcome(store, {
      incidentId: job.incidentId,
      capsuleId: capsule.id,
      event: "recur.failure_reproduced",
      fidelity: capsule.reproduction.fidelityScore,
      remainingAmount: 6000,
    });
    return capsule;
  }
  if (job.kind === "reset" || job.kind === "seed") {
    if (job.kind === "reset") await store.clear({ keepJobs: true });
    return { ok: true, incident: await seedIncident(store) };
  }
  if (job.kind === "evals") return runEvals();
  const input = z.object({ capsuleId: z.string() }).strict().parse(job.input);
  const capsule = verifyCapsule(await store.get("capsules", input.capsuleId));
  if (capsule.incidentId !== job.incidentId)
    throw new Error("Capsule incident mismatch");
  if (job.kind === "ablate") return ablate(capsule);
  if (job.kind === "generate-test") return generateRegression(capsule);
  const verification = await verifyFix(capsule);
  const regression = await generateRegression(capsule);
  const record = {
    id: randomUUID(),
    capsuleId: capsule.id,
    jobId: job.id,
    createdAt: new Date().toISOString(),
    ...verification,
    regression,
  };
  await store.put("verifications", record.id, job.incidentId, record);
  if (
    verification.passed &&
    verification.originalFailureGone &&
    regression.valid
  ) {
    const incident = IncidentSchema.parse(
      await store.get("incidents", job.incidentId),
    );
    await publishOutcome(store, {
      incidentId: job.incidentId,
      capsuleId: capsule.id,
      event: "recur.fix_verified",
      fidelity: capsule.reproduction.fidelityScore,
      remainingAmount: 6000,
    });
    incident.status = "fixed";
    await store.put("incidents", incident.id, incident.id, incident);
  }
  return record;
}
