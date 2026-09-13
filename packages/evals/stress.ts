import { heroPlan, target } from "../core/src/fixtures";
import { compareFingerprint } from "../core/src/fingerprint";
import { executePlan } from "../../apps/demo-service/src/replay";
export async function stressEvals(count = 200) {
  if (!Number.isInteger(count) || count < 20 || count > 2000)
    throw new Error("Stress count must be 20–2000");
  let seed = 20260913;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  const results = [];
  const began = performance.now();
  for (let i = 0; i < count; i++) {
    const plan = heroPlan();
    const amount = 100 + (random() % 100000);
    const prior = 1 + (random() % (amount - 1));
    const flag = i % 3 !== 0;
    const fixed = i % 4 === 0;
    plan.stripeState.charge.amount = amount;
    plan.stripeState.charge.amount_refunded = prior;
    plan.stripeState.refunds[0]!.amount = prior;
    plan.flagState.refunds_v2 = flag;
    plan.codeMode = fixed ? "fixed" : "buggy";
    const start = performance.now();
    const { result } = await executePlan(plan, { local: true });
    const matched = compareFingerprint(target, result.fingerprint).matched;
    const expected = flag && !fixed;
    const safe = expected
      ? result.sideEffects.length === 0 && result.refunds.length === 1
      : result.status === 200 &&
        result.sideEffects.length === 1 &&
        result.sideEffects[0]?.amount === amount - prior &&
        result.refunds.reduce((n, r) => n + r.amount, 0) === amount;
    results.push({
      index: i,
      amount,
      prior,
      flag,
      fixed,
      matched,
      expected,
      safe,
      correct: matched === expected && safe,
      latencyMs: Math.round((performance.now() - start) * 100) / 100,
    });
  }
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const negatives = results.filter((r) => !r.expected);
  const falsePositives = negatives.filter((r) => r.matched).length;
  return {
    seed: 20260913,
    mode: "LOCAL SIMULATION",
    count,
    passed: results.filter((r) => r.correct).length,
    falsePositives,
    negativeCases: negatives.length,
    zeroFailureUpperBound95:
      falsePositives === 0 ? 1 - Math.pow(0.05, 1 / negatives.length) : null,
    p50Ms: latencies[Math.floor(count * 0.5)],
    p95Ms: latencies[Math.floor(count * 0.95)],
    elapsedMs: Math.round(performance.now() - began),
    note: "Seeded synthetic coverage; this does not estimate production incidence or live provider reliability. One-sided exact binomial bound is conditional on these sampled scenarios.",
    results,
  };
}
