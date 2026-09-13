import Stripe from "stripe";
import { it, expect } from "vitest";
import { ArgaStripeAdapter } from "./stripe";
it("normalizes real Stripe SDK HTTP responses and sends idempotency headers to the twin", async () => {
  const calls: {
    path: string;
    method: string;
    body: string;
    headers: Record<string, string>;
  }[] = [];
  const fakeFetch: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    calls.push({
      path,
      method: init?.method ?? "GET",
      body: String(init?.body ?? ""),
      headers: init?.headers as Record<string, string>,
    });
    return Response.json(
      path.includes("charges")
        ? {
            id: "ch_physical",
            amount: 10000,
            amount_refunded: 4000,
            currency: "usd",
          }
        : init?.method === "POST"
          ? { id: "re_created", charge: "ch_physical", amount: 6000 }
          : {
              data: [{ id: "re_prior", charge: "ch_physical", amount: 4000 }],
              has_more: false,
            },
    );
  };
  const sdk = new Stripe("sk_test_contract", {
    host: "stripe.test.argalabs.com",
    httpClient: Stripe.createFetchHttpClient(fakeFetch),
    maxNetworkRetries: 0,
  });
  const adapter = new ArgaStripeAdapter(sdk, "ch_logical", "ch_physical");
  expect(await adapter.retrieveCharge("ch_logical")).toMatchObject({
    id: "ch_logical",
    amount: 10000,
  });
  expect(await adapter.listRefundsForCharge("ch_logical")).toEqual([
    { id: "re_prior", chargeId: "ch_logical", amount: 4000 },
  ]);
  expect(
    await adapter.createRefund({
      chargeId: "ch_logical",
      amount: 6000,
      idempotencyKey: "retry-safe",
    }),
  ).toMatchObject({ chargeId: "ch_logical", amount: 6000 });
  expect(calls[2]?.body).toContain("charge=ch_physical");
  expect(new Headers(calls[2]?.headers).get("Idempotency-Key")).toBe(
    "retry-safe",
  );
  await expect(adapter.retrieveCharge("wrong")).rejects.toThrow();
  await expect(adapter.listRefundsForCharge("wrong")).rejects.toThrow();
  await expect(
    adapter.createRefund({ chargeId: "wrong", amount: 1, idempotencyKey: "x" }),
  ).rejects.toThrow();
});
it("fails closed when provider refund pagination is incomplete", async () => {
  const sdk = new Stripe("sk_test_contract", {
    httpClient: Stripe.createFetchHttpClient(async () =>
      Response.json({ has_more: true, data: [] }),
    ),
    maxNetworkRetries: 0,
  });
  await expect(
    new ArgaStripeAdapter(sdk, "logical", "physical").listRefundsForCharge(
      "logical",
    ),
  ).rejects.toThrow("too many");
});
