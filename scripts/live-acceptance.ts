import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { createStore } from "../packages/db/src/client";
import { seedIncident } from "../packages/db/src/seed";
import { reproduce } from "../packages/agents/src/workflow";
import {
  verifyFix,
  generateRegression,
} from "../packages/agents/src/regression";
import { publishOutcome } from "../packages/integrations/src/userlens";
import { initializeLemma } from "../packages/integrations/src/lemma";
import { closeFlags } from "../packages/integrations/src/flags";
import { randomUUID } from "node:crypto";
const required = [
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "GITHUB_OWNER",
  "GITHUB_REPO",
  "GITHUB_DEMO_COMMIT_SHA",
  "LAUNCHDARKLY_SDK_KEY",
];
const missing = required.filter((k) => !process.env[k]);
if (process.env.ARGA_ENABLED !== "true") missing.push("ARGA_ENABLED=true");
if (missing.length)
  throw new Error(
    `Live acceptance requires: ${missing.join(", ")}. No external requests made.`,
  );
await mkdir("artifacts", { recursive: true });
const store = createStore(`file:./artifacts/live-${randomUUID()}.db`);
const lemma = initializeLemma(randomUUID(), "inc_refund_001");
try {
  const incident = await seedIncident(store);
  const capsule = await reproduce(store, incident.id, { teaching: true });
  if (
    !capsule?.provenance.argaTwinUsed ||
    !capsule.provenance.generatedByModel ||
    !capsule.provenance.launchDarklyUsed ||
    incident.git.source !== "GitHub Live"
  )
    throw new Error("Live provenance incomplete");
  const verification = await verifyFix(capsule);
  const regression = await generateRegression(capsule);
  if (
    !verification.passed ||
    !verification.originalFailureGone ||
    !regression.valid
  )
    throw new Error("Live fix or regression failed");
  await publishOutcome(store, {
    incidentId: incident.id,
    capsuleId: capsule.id,
    event: "recur.fix_verified",
    fidelity: capsule.reproduction.fidelityScore,
    remainingAmount: 6000,
  });
  await lemma.flush(store);
  const receipts = await store.list("integration_receipts");
  await writeFile(
    "artifacts/live-acceptance.json",
    JSON.stringify(
      {
        passed: true,
        createdAt: new Date().toISOString(),
        capsule,
        verification,
        regression,
        receipts,
      },
      null,
      2,
    ),
  );
  console.log(
    "LIVE ACCEPTANCE PASSED. Proof saved to artifacts/live-acceptance.json. Review optional integration receipts separately.",
  );
} finally {
  closeFlags();
  store.close();
}
