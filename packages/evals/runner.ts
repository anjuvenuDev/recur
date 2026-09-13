import { heroPlan, target } from "../core/src/fixtures";
import { executePlan } from "../../apps/demo-service/src/replay";
import { compareFingerprint } from "../core/src/fingerprint";
import { reconstruct } from "../core/src/reconstruct";
import { deduplicate } from "../core/src/evidence";
import { createStore } from "../db/src/client";
import { seedIncident } from "../db/src/seed";
import { EvidenceSchema } from "../core/src/domain";
export async function runEvals() {
  const db = createStore(":memory:");
  try {
    const incident = await seedIncident(db, true);
    const evidence = (await db.list("evidence", incident.id)).map((e) =>
      EvidenceSchema.parse(e),
    );
    const scenarios = [
      { name: "Hero partial refund", expected: true },
      { name: "Flag false", expected: false },
      { name: "No prior refund", expected: false },
      { name: "Prior full refund", expected: false },
      { name: "Different amount, same causal bug", expected: true },
      { name: "Missing Stripe evidence", expected: false },
      { name: "Missing flag evidence", expected: false },
      { name: "Duplicate evidence", expected: true },
      { name: "Remapped identities", expected: true },
      { name: "Fixed implementation", expected: false },
    ];
    const results = [];
    for (const [i, s] of scenarios.entries()) {
      let matched = false;
      let unresolved: string | null = null;
      let status = 0;
      try {
        const selected =
          i === 5
            ? evidence.filter((e) => e.kind !== "stripe_read")
            : i === 6
              ? evidence.filter((e) => e.kind !== "feature_flag_read")
              : i === 7
                ? deduplicate([...evidence, ...evidence])
                : evidence;
        const plan = reconstruct(incident, selected);
        if (i === 1) plan.flagState.refunds_v2 = false;
        if (i === 2) {
          plan.stripeState.charge.amount_refunded = 0;
          plan.stripeState.refunds = [];
        }
        if (i === 3) {
          plan.stripeState.charge.amount_refunded = 10000;
          plan.stripeState.refunds[0]!.amount = 10000;
        }
        if (i === 4) plan.stripeState.charge.amount = 12000;
        if (i === 8) {
          plan.replayRequest.body.customerId = "synthetic_customer";
          plan.dbFixtures[0]!.id = "synthetic_customer";
          plan.dbFixtures[1]!.values.customerId = "synthetic_customer";
        }
        if (i === 9) plan.codeMode = "fixed";
        const replay = await executePlan(plan, { local: true });
        status = replay.result.status;
        matched = compareFingerprint(target, replay.result.fingerprint).matched;
      } catch (error) {
        unresolved = error instanceof Error ? error.message : "Unresolved";
      }
      results.push({
        ...s,
        matched,
        status,
        unresolved,
        correct: matched === s.expected && (!unresolved || i === 5 || i === 6),
      });
    }
    const negative = results.filter((r) => !r.expected);
    return {
      results,
      metrics: {
        scenarios: results.length,
        correct: results.filter((r) => r.correct).length,
        falseReproductionRate:
          negative.filter((r) => r.matched).length / negative.length,
        reproductionRate:
          results.filter((r) => r.expected && r.matched).length /
          results.filter((r) => r.expected).length,
        criticalFingerprintAccuracy:
          results.filter((r) => r.correct).length / results.length,
        safeUnresolved: results.filter((r) => r.unresolved).length,
      },
      note: "Changing amount to $120 preserves the same bug fingerprint; exact numeric state is reported separately from behavioral reproduction. Missing evidence fails closed.",
    };
  } finally {
    db.close();
  }
}
