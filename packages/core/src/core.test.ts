import { it, expect } from "vitest";
import { target, heroPlan } from "./fixtures";
import { compareFingerprint } from "./fingerprint";
import { sanitize, deduplicate } from "./evidence";
import { transition, idempotencyKey } from "./state-machine";
import { CapsuleSchema, EvidenceSchema, StripeStateSchema } from "./domain";
import {
  FixtureStripeAdapter,
  validateTwinUrl,
} from "../../integrations/src/stripe";
import { FixtureFeatureFlagProvider } from "../../integrations/src/flags";
it("requires critical fields, causal spans and no unexpected side effects", () => {
  expect(
    compareFingerprint(target, {
      ...target,
      topApplicationFrame: {
        ...target.topApplicationFrame,
        file: "/workspace/refund-service.ts",
        line: 400,
      },
    }).matched,
  ).toBe(true);
  for (const patch of [
    { errorClass: "OtherError" },
    { normalizedMessage: "Other failure" },
    { route: "GET /wrong" },
    { statusCode: 503 },
    { topApplicationFrame: { file: "wrong.ts", function: "refundRemaining" } },
    { topApplicationFrame: { file: "refund-service.ts", function: "wrong" } },
    { relevantSpanNames: [] },
    {
      relevantSideEffects: [
        { operation: "stripe.refund.create", amount: 6000 },
      ],
    },
  ])
    expect(compareFingerprint(target, { ...target, ...patch }).matched).toBe(
      false,
    );
});
it("redacts secrets and identity recursively", () => {
  const clean = JSON.stringify(
    sanitize({
      authorization: "Bearer secret",
      nested: [{ email: "name@example.com", amount: 4000 }],
      message: "sk_live_abc123",
    }),
  );
  expect(clean).not.toContain("secret");
  expect(clean).not.toContain("example.com");
  expect(clean).not.toContain("sk_live");
  expect(clean).toContain("4000");
});
it("deduplicates by operation and payload, not random evidence ID", () => {
  const e = EvidenceSchema.parse({
    id: "a",
    incidentId: "i",
    kind: "stripe_read",
    source: "stripe",
    timestamp: new Date().toISOString(),
    operation: "charge",
    payload: { amount: 10000 },
    sanitized: true,
  });
  expect(deduplicate([e, { ...e, id: "b" }])).toHaveLength(1);
});
it("guards state transitions and capsule validity", () => {
  expect(transition("COMPARING", "REFINING")).toBe("REFINING");
  expect(() => transition("INGESTED", "REPRODUCED")).toThrow();
  expect(
    CapsuleSchema.safeParse({ reproduction: { matched: true } }).success,
  ).toBe(false);
  expect(idempotencyKey("i", "a")).toBe("recur:i:a:refund");
});
it("rejects real financial targets and malformed twin URLs", () => {
  for (const url of [
    "https://api.stripe.com",
    "https://evil.com",
    "https://arga.run.evil.com",
    "https://localhost@evil.com",
    "https://x.argalabs.com/path",
  ])
    expect(() => validateTwinUrl(url, "sk_test_demo")).toThrow();
  expect(() =>
    validateTwinUrl("http://127.0.0.1:8000", "sk_live_demo"),
  ).toThrow();
  expect(
    validateTwinUrl("http://127.0.0.1:8000", "sk_test_demo").hostname,
  ).toBe("127.0.0.1");
});
it("normalizes and isolates refunds and prevents duplicate writes", async () => {
  const plan = heroPlan();
  const stripe = new FixtureStripeAdapter(plan.stripeState);
  const input = {
    chargeId: "ch_demo_001",
    amount: 6000,
    idempotencyKey: "same",
  };
  const first = await stripe.createRefund(input);
  expect(await stripe.createRefund(input)).toEqual(first);
  expect(await stripe.listRefundsForCharge(input.chargeId)).toHaveLength(2);
  expect((await stripe.retrieveCharge(input.chargeId)).amount_refunded).toBe(
    10000,
  );
  expect(plan.stripeState.charge.amount_refunded).toBe(4000);
  await expect(stripe.createRefund({ ...input, amount: 1 })).rejects.toThrow(
    "Idempotency",
  );
  expect(
    StripeStateSchema.safeParse({ ...plan.stripeState, refunds: [] }).success,
  ).toBe(false);
});
it("freezes reconstructed feature flags", async () => {
  const provider = new FixtureFeatureFlagProvider(false);
  expect(await provider.getBooleanFlag("refunds_v2")).toMatchObject({
    value: false,
    source: "LaunchDarkly Fixture",
  });
});

it("handles concurrent refund retries without overspending or duplicate effects", async () => {
  const stripe = new FixtureStripeAdapter(heroPlan().stripeState);
  const input = {
    chargeId: "ch_demo_001",
    amount: 6000,
    idempotencyKey: "concurrent",
  };
  const results = await Promise.all([
    stripe.createRefund(input),
    stripe.createRefund(input),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect(await stripe.listRefundsForCharge(input.chargeId)).toHaveLength(2);
  await expect(
    stripe.createRefund({ ...input, idempotencyKey: "new" }),
  ).rejects.toThrow("amount");
});
