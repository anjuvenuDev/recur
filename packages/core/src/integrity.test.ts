import { it, expect } from "vitest";
import { digest, canonicalJson, sealCapsule, verifyCapsule } from "./integrity";
import { heroPlan } from "./fixtures";
import { StripeStateSchema } from "./domain";
const capsule = () => {
  const plan = heroPlan();
  return sealCapsule({
    version: "1",
    id: "cap_test",
    incidentId: "inc_test",
    createdAt: new Date().toISOString(),
    code: {
      repository: "local/recur",
      commitSha: "test",
      relevantFiles: ["refund-service.ts"],
      sourceDigest: "a".repeat(64),
    },
    request: plan.replayRequest,
    database: { fixtures: plan.dbFixtures },
    externalState: { stripe: plan.stripeState },
    featureFlags: plan.flagState,
    environment: plan.environmentState,
    productionFingerprint: plan.expectedFailure,
    reproduction: {
      attemptId: "attempt_test",
      fidelityScore: 1,
      matched: true,
    },
    provenance: {
      evidenceIds: ["e1"],
      argaTwinUsed: false,
      launchDarklyUsed: false,
    },
  });
};
it("canonicalizes objects without conflating array ordering", () => {
  expect(digest({ a: 1, b: 2 })).toBe(digest({ b: 2, a: 1 }));
  expect(digest([1, 2])).not.toBe(digest([2, 1]));
  expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
});
it("detects changed capsule flags, money and target fingerprints", () => {
  const original = capsule();
  expect(verifyCapsule(original)).toEqual(original);
  for (const field of ["flag", "target", "code"]) {
    const changed = structuredClone(original);
    if (field === "flag") changed.featureFlags.refunds_v2 = false;
    if (field === "target")
      changed.productionFingerprint.normalizedMessage = "Anything";
    if (field === "code") changed.code.sourceDigest = "b".repeat(64);
    expect(() => verifyCapsule(changed)).toThrow("integrity");
  }
});
it("rejects duplicate provider refund identities and impossible amounts", () => {
  const state = heroPlan().stripeState;
  state.refunds.push({ ...state.refunds[0]! });
  state.charge.amount_refunded = 8000;
  expect(StripeStateSchema.safeParse(state).success).toBe(false);
});
