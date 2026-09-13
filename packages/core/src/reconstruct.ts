import { z } from "zod";
import {
  ChargeSchema,
  RefundSchema,
  FixtureSchema,
  PlanSchema,
  type Evidence,
  type Incident,
} from "./domain";
import { deduplicate } from "./evidence";
export function reconstruct(incident: Incident, records: Evidence[]) {
  const evidence = deduplicate(records);
  const get = (operation: string) => {
    const e = evidence.find(
      (e) => e.operation === operation && e.kind !== "otel_span",
    );
    if (!e) throw new Error(`Insufficient evidence: ${operation}`);
    return e.payload;
  };
  const charge = ChargeSchema.parse(get("stripe.charge.retrieve"));
  const refunds = z.array(RefundSchema).parse(get("stripe.refund.list"));
  const flag = z.object({ value: z.boolean() }).parse(get("refunds_v2"));
  const dbFixtures = z.array(FixtureSchema).parse(get("refund.fixtures"));
  get("git.commit");
  return PlanSchema.parse({
    dbFixtures,
    stripeState: { charge, refunds },
    flagState: { refunds_v2: flag.value },
    environmentState: { currency: charge.currency },
    replayRequest: {
      method: "POST",
      path: "/api/refunds/remaining",
      body: incident.requestBody,
    },
    expectedFailure: incident.productionFingerprint,
    confidence: 1,
    missingEvidenceRequests: [],
    codeMode: "buggy",
  });
}
