import { randomUUID } from "node:crypto";
import { PlanSchema, type Plan } from "../../../packages/core/src/domain";
import { createStore } from "../../../packages/db/src/client";
import {
  FixtureFeatureFlagProvider,
  type FeatureFlagProvider,
} from "../../../packages/integrations/src/flags";
import {
  provisionStripe,
  type StripeAdapter,
} from "../../../packages/integrations/src/stripe";
import { idempotencyKey } from "../../../packages/core/src/state-machine";
import { refundRemaining } from "./services/refund-service";
export async function executePlan(
  raw: Plan,
  options: {
    incidentId?: string;
    attemptId?: string;
    local?: boolean;
    stripe?: StripeAdapter;
    flags?: FeatureFlagProvider;
  } = {},
) {
  const plan = PlanSchema.parse(raw);
  const attemptId = options.attemptId ?? randomUUID();
  const incidentId = options.incidentId ?? "eval";
  const db = createStore(":memory:");
  try {
    for (const fixture of plan.dbFixtures)
      await db.put(fixture.table, fixture.id, incidentId, fixture);
    const stripe =
      options.stripe ??
      (await provisionStripe(plan.stripeState, attemptId, options.local));
    const output = await refundRemaining({
      plan,
      stripe,
      flags:
        options.flags ??
        new FixtureFeatureFlagProvider(plan.flagState.refunds_v2),
      db,
      incidentId,
      idempotencyKey: idempotencyKey(incidentId, attemptId),
    });
    return { ...output, stripeMode: stripe.mode };
  } finally {
    db.close();
  }
}
