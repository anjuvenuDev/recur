import { CapsuleSchema, PlanSchema, type Capsule } from "./domain";
export function capsulePlan(
  raw: Capsule,
  codeMode: "buggy" | "fixed" = "buggy",
) {
  const c = CapsuleSchema.parse(raw);
  return PlanSchema.parse({
    dbFixtures: c.database.fixtures,
    stripeState: c.externalState.stripe,
    flagState: c.featureFlags,
    environmentState: c.environment,
    replayRequest: c.request,
    expectedFailure: c.productionFingerprint,
    confidence: 1,
    missingEvidenceRequests: [],
    codeMode,
  });
}
