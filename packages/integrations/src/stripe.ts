import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { assertTwinNotExpired } from "./arga";
import Stripe from "stripe";
import {
  ChargeSchema,
  RefundSchema,
  StripeStateSchema,
  type Charge,
  type Refund,
  type StripeState,
} from "../../core/src/domain";
export interface StripeAdapter {
  mode: "LOCAL SIMULATION" | "ARGA TWIN";
  retrieveCharge(id: string): Promise<Charge>;
  listRefundsForCharge(id: string): Promise<Refund[]>;
  createRefund(input: {
    chargeId: string;
    amount: number;
    idempotencyKey: string;
  }): Promise<Refund>;
}
export class FixtureStripeAdapter implements StripeAdapter {
  mode = "LOCAL SIMULATION" as const;
  private state: StripeState;
  private keys = new Map<string, Refund>();
  constructor(state: StripeState) {
    this.state = structuredClone(StripeStateSchema.parse(state));
  }
  async retrieveCharge(id: string) {
    if (id !== this.state.charge.id) throw new Error("Charge not found");
    return structuredClone(this.state.charge);
  }
  async listRefundsForCharge(id: string) {
    await this.retrieveCharge(id);
    return structuredClone(this.state.refunds);
  }
  async createRefund(input: {
    chargeId: string;
    amount: number;
    idempotencyKey: string;
  }) {
    const old = this.keys.get(input.idempotencyKey);
    if (old) {
      if (old.amount !== input.amount || old.chargeId !== input.chargeId)
        throw new Error("Idempotency conflict");
      return structuredClone(old);
    }
    if (input.chargeId !== this.state.charge.id)
      throw new Error("Charge not found");
    const charge = this.state.charge;
    if (
      !Number.isSafeInteger(input.amount) ||
      input.amount <= 0 ||
      input.amount > charge.amount - charge.amount_refunded
    )
      throw new Error("Invalid refund amount");
    const refund = RefundSchema.parse({
      id: `re_${this.state.refunds.length + 1}`,
      chargeId: charge.id,
      amount: input.amount,
    });
    this.state.refunds.push(refund);
    this.state.charge.amount_refunded += input.amount;
    this.keys.set(input.idempotencyKey, refund);
    return structuredClone(refund);
  }
}
export function validateTwinUrl(base: string, key: string) {
  const url = new URL(base);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const arga =
    url.hostname.endsWith(".argalabs.com") ||
    url.hostname.endsWith(".arga.run");
  if (
    (!local && !arga) ||
    (!local && url.protocol !== "https:") ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error(
      "Twin URL must be a local or Arga HTTPS origin; Stripe production hosts are forbidden",
    );
  if (!key.startsWith("sk_test_"))
    throw new Error("Only synthetic sk_test_ twin credentials are allowed");
  return url;
}
export function twinClient() {
  const file = resolve(
    process.env.RECUR_ROOT ?? process.cwd(),
    ".recur/twin.json",
  );
  if (existsSync(file)) {
    const twin = JSON.parse(readFileSync(file, "utf8"));
    process.env.ARGA_STRIPE_BASE_URL ||= twin.twins?.stripe?.base_url;
    process.env.ARGA_RUN_ID ||= twin.run_id;
    process.env.ARGA_EXPIRES_AT ||= twin.expires_at;
  }
  assertTwinNotExpired();
  const key = process.env.STRIPE_SECRET_KEY || "sk_test_recur_twin";
  const url = validateTwinUrl(process.env.ARGA_STRIPE_BASE_URL ?? "", key);
  return new Stripe(key, {
    host: url.hostname,
    port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
    protocol: url.protocol === "https:" ? "https" : "http",
    maxNetworkRetries: 1,
    timeout: 10000,
  });
}
export class ArgaStripeAdapter implements StripeAdapter {
  mode = "ARGA TWIN" as const;
  constructor(
    private sdk: Stripe,
    private logicalId: string,
    readonly physicalId: string,
  ) {}
  async retrieveCharge(id: string) {
    if (id !== this.logicalId) throw new Error("Unknown charge");
    const c = await this.sdk.charges.retrieve(this.physicalId);
    return ChargeSchema.parse({
      id,
      amount: c.amount,
      amount_refunded: c.amount_refunded,
      currency: c.currency,
    });
  }
  async listRefundsForCharge(id: string) {
    if (id !== this.logicalId) throw new Error("Unknown charge");
    const result = await this.sdk.refunds.list({
      charge: this.physicalId,
      limit: 100,
    });
    if (result.has_more) throw new Error("Twin has too many refunds");
    return result.data.map((r) =>
      RefundSchema.parse({ id: r.id, chargeId: id, amount: r.amount }),
    );
  }
  async createRefund(input: {
    chargeId: string;
    amount: number;
    idempotencyKey: string;
  }) {
    if (input.chargeId !== this.logicalId) throw new Error("Unknown charge");
    const r = await this.sdk.refunds.create(
      { charge: this.physicalId, amount: input.amount },
      { idempotencyKey: input.idempotencyKey },
    );
    return RefundSchema.parse({
      id: r.id,
      chargeId: input.chargeId,
      amount: r.amount,
    });
  }
}
export async function provisionStripe(
  state: StripeState,
  runId: string,
  forceLocal = false,
): Promise<StripeAdapter> {
  StripeStateSchema.parse(state);
  if (forceLocal || process.env.ARGA_ENABLED !== "true")
    return new FixtureStripeAdapter(state);
  const sdk = twinClient();
  const customer = await sdk.customers.create(
    { metadata: { recur_run: runId } },
    { idempotencyKey: `${runId}:customer` },
  );
  const charge = await sdk.charges.create(
    {
      amount: state.charge.amount,
      currency: "usd",
      source: "tok_visa",
      customer: customer.id,
      metadata: { recur_run: runId },
    },
    { idempotencyKey: `${runId}:charge` },
  );
  const adapter = new ArgaStripeAdapter(sdk, state.charge.id, charge.id);
  for (const [i, r] of state.refunds.entries())
    await adapter.createRefund({
      chargeId: state.charge.id,
      amount: r.amount,
      idempotencyKey: `${runId}:prior:${i}`,
    });
  const observed = await adapter.retrieveCharge(state.charge.id);
  if (
    observed.amount !== state.charge.amount ||
    observed.amount_refunded !== state.charge.amount_refunded
  )
    throw new Error("Twin seed verification failed");
  return adapter;
}
