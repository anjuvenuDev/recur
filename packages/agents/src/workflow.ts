import { sealCapsule } from "../../core/src/integrity";
import { assertSourceVersion } from "../../integrations/src/source-version";
import { randomUUID } from "node:crypto";
import {
  AnalysisSchema,
  AttemptSchema,
  CapsuleSchema,
  EvidenceSchema,
  EventSchema,
  IncidentSchema,
  type Attempt,
  type RunEvent,
} from "../../core/src/domain";
import {
  transition,
  MAX_REPRO_ATTEMPTS,
  type Phase,
} from "../../core/src/state-machine";
import { compareFingerprint } from "../../core/src/fingerprint";
import { reconstruct } from "../../core/src/reconstruct";
import { executePlan } from "../../../apps/demo-service/src/replay";
import { provisionStripe } from "../../integrations/src/stripe";
import { analyze, refinePlan } from "./coordinator";
import type { Store } from "../../db/src/client";
export async function reproduce(
  store: Store,
  incidentId: string,
  options: { teaching?: boolean; local?: boolean } = {},
) {
  const incident = IncidentSchema.parse(
    await store.get("incidents", incidentId),
  );
  let phase: Phase = "INGESTED";
  const runId = randomUUID();
  let current: Attempt | undefined;
  const event = async (
    type: RunEvent["type"],
    message: string,
    data?: unknown,
  ) => {
    const e = EventSchema.parse({
      id: randomUUID(),
      incidentId,
      timestamp: new Date().toISOString(),
      attemptId: current?.id,
      type,
      phase,
      message,
      data,
    });
    await store.put("run_events", e.id, incidentId, e);
  };
  const move = (next: Phase) => {
    phase = transition(phase, next);
  };
  try {
    await assertSourceVersion(incident.git.sourceDigest);
    incident.status = "reproducing";
    await store.put("incidents", incident.id, incident.id, incident);
    move("ANALYZING");
    await event(
      "analysis_started",
      "Inspecting the original failure and observed reads",
    );
    const evidence = (await store.list("evidence", incidentId)).map((e) =>
      EvidenceSchema.parse(e),
    );
    const { analysis, mode } = await analyze(incident, evidence);
    AnalysisSchema.parse(analysis);
    await event(
      "evidence_selected",
      `Selected ${analysis.requiredEvidenceIds.length} causal observations · AI ${mode}`,
      analysis,
    );
    const selected = evidence.filter((e) =>
      analysis.requiredEvidenceIds.includes(e.id),
    );
    const observed = reconstruct(incident, selected);
    let mismatches: string[] = [];
    for (let n = 1; n <= MAX_REPRO_ATTEMPTS; n++) {
      const plan = await refinePlan(observed, mismatches);
      if (n === 1 && options.teaching) plan.flagState.refunds_v2 = false;
      move("PLANNED");
      current = AttemptSchema.parse({
        id: `${runId}-${n}`,
        incidentId,
        attemptNumber: n,
        status: "planned",
        plan,
        startedAt: new Date().toISOString(),
      });
      await store.put("attempts", current.id, incidentId, current);
      await event(
        "plan_created",
        `Candidate ${n}: ${plan.flagState.refunds_v2 ? "observed flag restored" : "flag disabled" + (options.teaching ? " (teaching mode)" : "")}`,
        plan,
      );
      move("PROVISIONING");
      await event(
        "provision_started",
        "Creating isolated DB fixtures and safe Stripe state",
      );
      const stripe = await provisionStripe(
        plan.stripeState,
        current.id,
        options.local,
      );
      await event(
        "provision_completed",
        `Stripe ${stripe.mode}: $100 charge / $40 refunded`,
        { mode: stripe.mode },
      );
      move("REPLAYING");
      current.status = "running";
      await store.put("attempts", current.id, incidentId, current);
      await event(
        "replay_started",
        `Executing POST /api/refunds/remaining · attempt ${n}`,
      );
      const replay = await executePlan(plan, {
        incidentId,
        attemptId: current.id,
        stripe,
        local: options.local,
      });
      current.replayResult = replay.result;
      await event(
        "replay_completed",
        `Replay returned HTTP ${replay.result.status}`,
        replay.result,
      );
      move("COMPARING");
      const comparison = compareFingerprint(
        incident.productionFingerprint,
        replay.result.fingerprint,
      );
      current.comparison = comparison;
      current.status = comparison.matched ? "match" : "mismatch";
      current.finishedAt = new Date().toISOString();
      await store.put("attempts", current.id, incidentId, current);
      await event(
        "fingerprint_compared",
        comparison.matched
          ? "All critical fingerprint fields and causal spans matched"
          : `Mismatch: ${comparison.mismatches.join(", ")}`,
        comparison,
      );
      if (comparison.matched) {
        const capsule = sealCapsule({
          version: "1",
          id: `cap_${runId}`,
          incidentId,
          createdAt: new Date().toISOString(),
          code: incident.git,
          request: plan.replayRequest,
          database: { fixtures: plan.dbFixtures },
          externalState: { stripe: plan.stripeState },
          featureFlags: plan.flagState,
          environment: plan.environmentState,
          productionFingerprint: incident.productionFingerprint,
          reproduction: {
            attemptId: current.id,
            fidelityScore: comparison.fidelityScore,
            matched: true,
          },
          provenance: {
            evidenceIds: analysis.requiredEvidenceIds,
            ...(mode === "CONNECTED"
              ? { generatedByModel: process.env.OPENAI_MODEL }
              : {}),
            argaTwinUsed: stripe.mode === "ARGA TWIN",
            launchDarklyUsed: evidence.some(
              (e) =>
                e.kind === "feature_flag_read" &&
                JSON.stringify(e.payload).includes("LaunchDarkly Live"),
            ),
          },
        });
        await store.put("capsules", capsule.id, incidentId, capsule);
        move("REPRODUCED");
        incident.status = "reproduced";
        await event("reproduced", "BUG REPRODUCED — capsule saved", capsule);
        await store.put("incidents", incident.id, incident.id, incident);
        return capsule;
      }
      mismatches = comparison.mismatches;
      if (n < MAX_REPRO_ATTEMPTS) {
        move("REFINING");
        await event(
          "refinement_requested",
          "Inspecting missing state against the captured flag evidence",
          mismatches,
        );
      }
    }
    move("NOT_REPRODUCED");
    await event(
      "failed",
      "Attempt limit reached. Unresolved fingerprint fields remain.",
      mismatches,
    );
  } catch (error) {
    if (current) {
      current.status = "error";
      current.finishedAt = new Date().toISOString();
      await store.put("attempts", current.id, incidentId, current);
    }
    if (!["REPRODUCED", "NOT_REPRODUCED"].includes(phase))
      move("NOT_REPRODUCED");
    await event(
      "failed",
      error instanceof Error ? error.message : "Reconstruction failed",
    );
  }
  incident.status = "failed";
  await store.put("incidents", incident.id, incident.id, incident);
  return null;
}
