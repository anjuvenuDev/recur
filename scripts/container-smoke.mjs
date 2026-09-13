import { randomUUID } from "node:crypto";
const base = "http://127.0.0.1:3000/api";
const headers = {
  Authorization: `Bearer ${process.env.RECUR_ACCESS_TOKEN}`,
  "Content-Type": "application/json",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!process.env.RECUR_ACCESS_TOKEN)
  throw new Error("Test requires authentication");
if ((await fetch(`${base}/health`)).status !== 401)
  throw new Error("Anonymous access was not rejected");
const ready = await fetch(`${base}/ready`, { headers });
if (!ready.ok) throw new Error("Worker is not ready");
async function job(path, body = {}) {
  const r = await fetch(`${base}/${path}`, {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": randomUUID() },
    body: JSON.stringify(body),
  });
  if (r.status !== 202) throw new Error(`Enqueue failed ${r.status}`);
  const { jobId } = await r.json();
  for (let n = 0; n < 180; n++) {
    const value = await (
      await fetch(`${base}/jobs/${jobId}`, { headers })
    ).json();
    if (value.status === "succeeded") return value.result;
    if (["failed", "interrupted"].includes(value.status))
      throw new Error(value.error);
    await sleep(500);
  }
  throw new Error("Job timed out");
}
await job("demo/reset");
const capsule = await job("incidents/inc_refund_001/reproduce", {
  teaching: true,
});
const proof = await job(`capsules/${capsule.id}/verify-fix`);
if (!proof.passed || !proof.originalFailureGone || !proof.regression.valid)
  throw new Error("Fix proof failed");
const detail = await (
  await fetch(`${base}/incidents/inc_refund_001`, { headers })
).json();
if (
  detail.incident.status !== "fixed" ||
  detail.verifications.length !== 1 ||
  detail.attempts.length !== 2
)
  throw new Error("Persisted state incorrect");
console.log(
  JSON.stringify(
    {
      passed: true,
      node: process.version,
      authenticated: true,
      anonymousStatus: 401,
      attempts: detail.attempts.length,
      fixVerified: proof.passed,
      regressionValid: proof.regression.valid,
      receipts: detail.receipts.map((r) => ({
        provider: r.provider,
        status: r.status,
      })),
      verifiedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
