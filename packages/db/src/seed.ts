import { assertSourceVersion } from "../../integrations/src/source-version";
import { randomUUID } from "node:crypto";
import { executePlan } from "../../../apps/demo-service/src/replay";
import { heroPlan } from "../../core/src/fixtures";
import { IncidentSchema, EvidenceSchema } from "../../core/src/domain";
import { gitEvidence } from "../../integrations/src/github";
import { flagProvider } from "../../integrations/src/flags";
import type { Store } from "./client";
export const INCIDENT_ID = "inc_refund_001";
export async function seedIncident(store: Store, local = false) {
  const existing = await store.get("incidents", INCIDENT_ID);
  if (existing) return IncidentSchema.parse(existing);
  const git = await gitEvidence(local);
  await assertSourceVersion(git.sourceDigest);
  const execution = await executePlan(heroPlan(), {
    incidentId: INCIDENT_ID,
    local,
    flags: local ? undefined : flagProvider(),
  });
  if (execution.result.fingerprint?.errorClass !== "InvalidRefundStateError")
    throw new Error(
      "Seed did not trigger target bug. Ensure refunds_v2 evaluates true.",
    );
  const evidence = [
    ...execution.evidence,
    EvidenceSchema.parse({
      id: randomUUID(),
      incidentId: INCIDENT_ID,
      kind: "git_commit",
      source: "github",
      timestamp: new Date().toISOString(),
      operation: "git.commit",
      payload: git,
      sanitized: true,
    }),
  ];
  const incident = IncidentSchema.parse({
    id: INCIDENT_ID,
    title: "Remaining refund fails after a partial refund",
    description:
      "A $100 charge, a $40 prior refund, and refunds_v2 enabled. The remaining $60 should be refunded.",
    status: "open",
    occurredAt: new Date().toISOString(),
    route: "POST /api/refunds/remaining",
    requestMethod: "POST",
    requestBody: heroPlan().replayRequest.body,
    responseStatus: 500,
    productionFingerprint: execution.result.fingerprint,
    git,
    evidenceIds: evidence.map((e) => e.id),
  });
  for (const e of evidence) await store.put("evidence", e.id, incident.id, e);
  for (const f of heroPlan().dbFixtures)
    await store.put(f.table, f.id, incident.id, f);
  await store.put("incidents", incident.id, incident.id, incident);
  return incident;
}
