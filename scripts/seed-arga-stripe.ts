import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { heroPlan } from "../packages/core/src/fixtures";
import {
  provisionStripe,
  ArgaStripeAdapter,
} from "../packages/integrations/src/stripe";
if (process.env.ARGA_ENABLED !== "true")
  throw new Error(
    "Set ARGA_ENABLED=true and ARGA_STRIPE_BASE_URL to your disposable twin origin",
  );
const adapter = await provisionStripe(
  heroPlan().stripeState,
  `manual-${randomUUID()}`,
);
if (!(adapter instanceof ArgaStripeAdapter))
  throw new Error("Expected Arga adapter");
const mapping = {
  logicalCharge: "ch_demo_001",
  physicalCharge: adapter.physicalId,
  charge: await adapter.retrieveCharge("ch_demo_001"),
  refunds: await adapter.listRefundsForCharge("ch_demo_001"),
};
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/arga-mapping.json",
  JSON.stringify(mapping, null, 2),
);
console.log(JSON.stringify(mapping, null, 2));
