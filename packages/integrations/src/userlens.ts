import { z } from "zod";
import type { Store } from "../../db/src/client";
import { digest } from "../../core/src/integrity";
const EventInput = z
  .object({
    incidentId: z.string(),
    capsuleId: z.string(),
    event: z.enum(["recur.failure_reproduced", "recur.fix_verified"]),
    fidelity: z.number().min(0).max(1),
    remainingAmount: z.number().int().nonnegative(),
  })
  .strict();
export type OutcomeEvent = z.infer<typeof EventInput>;
/** Official Userlens REST contract. No automatic retry: the endpoint does not document idempotency. */
export async function publishOutcome(
  store: Store,
  raw: OutcomeEvent,
  options: { writeCode?: string; fetch?: typeof fetch } = {},
) {
  const input = EventInput.parse(raw);
  const id = `userlens_${digest(input)}`;
  const previous = await store.get("integration_receipts", id);
  if (previous) return previous;
  const writeCode = options.writeCode ?? process.env.USERLENS_WRITE_CODE;
  const receipt = {
    id,
    incidentId: input.incidentId,
    provider: "Userlens",
    event: input.event,
    createdAt: new Date().toISOString(),
    status: writeCode ? "PENDING" : "NOT CONNECTED",
    detail: writeCode
      ? "Delivery started"
      : "Configure USERLENS_WRITE_CODE to send this synthetic outcome.",
  };
  await store.put("integration_receipts", id, input.incidentId, receipt);
  if (!writeCode) return receipt;
  try {
    const response = await (options.fetch ?? fetch)(
      "https://events.userlens.io/event",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Basic ${Buffer.from(`${writeCode}:`).toString("base64")}`,
        },
        body: JSON.stringify({
          type: "track",
          userId: "recur-synthetic-demo-account",
          source: "userlens-restapi",
          event: input.event,
          properties: {
            incidentId: input.incidentId,
            capsuleId: input.capsuleId,
            fidelity: input.fidelity,
            remainingAmount: input.remainingAmount,
            currency: "usd",
            synthetic: true,
          },
        }),
        signal: AbortSignal.timeout(8000),
        redirect: "error",
      },
    );
    receipt.status = response.ok ? "DELIVERED" : "REJECTED";
    receipt.detail = `HTTP ${response.status}`;
  } catch {
    receipt.status = "UNKNOWN";
    receipt.detail = "Delivery outcome unknown. Not retried automatically.";
  }
  await store.put("integration_receipts", id, input.incidentId, receipt);
  return receipt;
}
