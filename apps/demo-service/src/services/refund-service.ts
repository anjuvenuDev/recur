import type { Plan, ReplayResult } from "../../../../packages/core/src/domain";
import { RequestSchema } from "../../../../packages/core/src/domain";
import type { StripeAdapter } from "../../../../packages/integrations/src/stripe";
import type { FeatureFlagProvider } from "../../../../packages/integrations/src/flags";
import { capture } from "../../../../packages/telemetry/src/otel";
import type { Store } from "../../../../packages/db/src/client";
class BusinessError extends Error {
  constructor(
    public name: string,
    message: string,
  ) {
    super(message);
  }
}
export async function refundRemaining(input: {
  plan: Plan;
  stripe: StripeAdapter;
  flags: FeatureFlagProvider;
  db: Store;
  incidentId: string;
  idempotencyKey: string;
}) {
  const { plan, stripe, flags, db } = input;
  const trace = capture(input.incidentId);
  const spans: string[] = [];
  const sideEffects: ReplayResult["sideEffects"] = [];
  const span = async <T>(name: string, fn: () => Promise<T>) => {
    spans.push(name);
    return trace.span(
      name,
      {
        "recur.resource_id": plan.replayRequest.body.chargeId,
        "recur.resource_type": name.startsWith("stripe.")
          ? "stripe.charge"
          : "refund.request",
        "recur.fields_read":
          name === "stripe.charge.retrieve" ||
          name === "refund.calculate_remaining"
            ? ["amount", "amount_refunded", "currency"]
            : [],
      },
      fn,
    );
  };
  let status = 200;
  let body: unknown;
  let fingerprint: ReplayResult["fingerprint"] = null;
  let stack: string | null = null;
  try {
    const request = RequestSchema.parse(plan.replayRequest.body);
    trace.observe(
      "http_request",
      "demo-service",
      "POST /api/refunds/remaining",
      request,
    );
    const customer = await db.get("demo_customers", request.customerId);
    const rows = await db.list("demo_refund_requests");
    trace.observe("db_read", "database", "refund.fixtures", plan.dbFixtures);
    if (
      !customer ||
      !rows.some((v) => {
        const r = v as { values?: Record<string, unknown> };
        return (
          r.values?.customerId === request.customerId &&
          r.values?.chargeId === request.chargeId
        );
      })
    )
      throw new BusinessError(
        "MissingRefundRequestError",
        "Customer or refund request fixture missing",
      );
    const flag = await span("feature_flag.read.refunds_v2", () =>
      flags.getBooleanFlag("refunds_v2", { key: request.customerId }, false),
    );
    trace.observe("feature_flag_read", "launchdarkly", "refunds_v2", flag);
    const charge = await span("stripe.charge.retrieve", () =>
      stripe.retrieveCharge(request.chargeId),
    );
    trace.observe("stripe_read", "stripe", "stripe.charge.retrieve", charge);
    const refunds = await span("stripe.refund.list", () =>
      stripe.listRefundsForCharge(request.chargeId),
    );
    trace.observe("stripe_read", "stripe", "stripe.refund.list", refunds);
    const remaining = await span(
      "refund.calculate_remaining",
      async () => charge.amount - charge.amount_refunded,
    );
    if (remaining <= 0)
      throw new BusinessError(
        "AlreadyRefundedError",
        "Charge has no refundable balance",
      );
    if (plan.codeMode === "buggy" && flag.value && charge.amount_refunded > 0) {
      throw new BusinessError(
        "InvalidRefundStateError",
        "V2 refund flow cannot process an already partially refunded charge",
      );
    }
    const refund = await span("stripe.refund.create", () =>
      stripe.createRefund({
        chargeId: charge.id,
        amount: remaining,
        idempotencyKey: input.idempotencyKey,
      }),
    );
    sideEffects.push({
      operation: "stripe.refund.create",
      amount: refund.amount,
    });
    trace.observe("stripe_write", "stripe", "stripe.refund.create", refund);
    body = {
      refundId: refund.id,
      refunded: refund.amount,
      currency: charge.currency,
    };
  } catch (error) {
    const e =
      error instanceof Error ? error : new Error("Unknown execution failure");
    status = 500;
    body = { error: e.name, message: e.message };
    stack = e.stack ?? null;
    const frame = stack
      ?.split("\n")
      .find(
        (line) =>
          line.includes("refundRemaining") && line.includes("refund-service"),
      );
    fingerprint = {
      errorClass: e.name,
      normalizedMessage: e.message,
      topApplicationFrame: {
        file: frame ? "refund-service.ts" : "unknown",
        function: frame ? "refundRemaining" : "unknown",
      },
      route: "POST /api/refunds/remaining",
      statusCode: 500,
      relevantSpanNames: [...spans],
      relevantSideEffects: [...sideEffects],
    };
    trace.observe("application_error", "demo-service", "refund.error", {
      name: e.name,
      message: e.message,
      stack,
    });
  }
  await span("refund.response", async () => {
    trace.observe("http_response", "demo-service", "refund.response", {
      status,
      body,
    });
  });
  const evidence = await trace.finish();
  const refunds = await stripe
    .listRefundsForCharge(plan.stripeState.charge.id)
    .catch(() => []);
  return {
    result: {
      status,
      body,
      fingerprint,
      spans,
      sideEffects,
      refunds,
      stack,
    } satisfies ReplayResult,
    evidence,
  };
}
