import { PlanSchema, type Fingerprint } from "./domain";
export const target: Fingerprint = {
  errorClass: "InvalidRefundStateError",
  normalizedMessage:
    "V2 refund flow cannot process an already partially refunded charge",
  topApplicationFrame: {
    file: "refund-service.ts",
    function: "refundRemaining",
  },
  route: "POST /api/refunds/remaining",
  statusCode: 500,
  relevantSpanNames: [
    "feature_flag.read.refunds_v2",
    "stripe.charge.retrieve",
    "refund.calculate_remaining",
  ],
  relevantSideEffects: [],
};
export function heroPlan() {
  return PlanSchema.parse({
    dbFixtures: [
      {
        table: "demo_customers",
        id: "cust_demo_001",
        values: { chargeId: "ch_demo_001" },
      },
      {
        table: "demo_refund_requests",
        id: "rr_demo_001",
        values: {
          customerId: "cust_demo_001",
          chargeId: "ch_demo_001",
          mode: "remaining",
        },
      },
    ],
    stripeState: {
      charge: {
        id: "ch_demo_001",
        amount: 10000,
        amount_refunded: 4000,
        currency: "usd",
      },
      refunds: [{ id: "re_demo_001", chargeId: "ch_demo_001", amount: 4000 }],
    },
    flagState: { refunds_v2: true },
    environmentState: { currency: "usd" },
    replayRequest: {
      method: "POST",
      path: "/api/refunds/remaining",
      body: { customerId: "cust_demo_001", chargeId: "ch_demo_001" },
    },
    expectedFailure: target,
    confidence: 1,
    missingEvidenceRequests: [],
    codeMode: "buggy",
  });
}
