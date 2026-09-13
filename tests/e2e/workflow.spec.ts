import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
async function job(request: APIRequestContext, path: string, body = {}) {
  const response = await request.post(`/api/${path}`, {
    data: body,
    headers: { "Idempotency-Key": randomUUID() },
  });
  expect(response.status()).toBe(202);
  const { jobId } = await response.json();
  let result: any;
  await expect
    .poll(
      async () => {
        result = await (await request.get(`/api/jobs/${jobId}`)).json();
        return result.status;
      },
      { timeout: 90000 },
    )
    .toBe("succeeded");
  return result.result;
}
test("full story: mismatch, evidence repair, capsule, fix proof, refresh, ablation and evals", async ({
  page,
  request,
}) => {
  await job(request, "demo/reset");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Reconstruct the failure." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reproduce failure" }).click();
  await expect(
    page.getByRole("heading", { name: "BUG REPRODUCED", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Replay attempts", exact: true })
    .click();
  await expect(page.getByText("Attempt 1 · MISMATCH · HTTP 200")).toBeVisible();
  await expect(page.getByText("Attempt 2 · MATCH · HTTP 500")).toBeVisible();
  const detail = await (
    await request.get("/api/incidents/inc_refund_001")
  ).json();
  expect(detail.attempts).toHaveLength(2);
  const capsule = detail.capsules[0];
  expect(capsule.integrity.digest).toMatch(/^[a-f0-9]{64}$/);
  await page.getByRole("button", { name: "Verify fix", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "REGRESSION PASSES", exact: true }),
  ).toBeVisible({ timeout: 90000 });
  await page.reload();
  await expect(
    page.getByText("Generated test: buggy FAIL (expected) / fixed PASS"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run ablation", exact: true }).click();
  await expect(
    page.getByText("NO TARGET FAILURE", { exact: true }),
  ).toHaveCount(4);
  await page.getByRole("link", { name: "View capsule" }).click();
  await expect(
    page.getByRole("heading", { name: "The failure, reconstructed." }).first(),
  ).toBeVisible();
  const exported = await (
    await request.get(`/api/capsules/${capsule.id}`)
  ).json();
  expect(exported.id).toBe(capsule.id);
  expect(JSON.stringify(exported)).not.toContain("sk_live_");
  const report = await job(request, "evals");
  expect(report.metrics.correct).toBe(10);
  expect(errors).toEqual([]);
});
test("API rejects cross-origin writes, invalid bodies and key conflicts", async ({
  request,
}) => {
  expect(
    (
      await request.post("/api/demo/reset", {
        data: {},
        headers: {
          Origin: "https://evil.example",
          "Idempotency-Key": randomUUID(),
        },
      })
    ).status(),
  ).toBe(403);
  expect((await request.post("/api/demo/reset", { data: {} })).status()).toBe(
    400,
  );
  expect(
    (
      await request.post("/api/demo/reset", {
        data: { unexpected: true },
        headers: { "Idempotency-Key": randomUUID() },
      })
    ).status(),
  ).toBe(400);
  const key = randomUUID();
  const first = await request.post("/api/demo/seed", {
    data: {},
    headers: { "Idempotency-Key": key },
  });
  const repeat = await request.post("/api/demo/seed", {
    data: {},
    headers: { "Idempotency-Key": key },
  });
  expect((await repeat.json()).jobId).toBe((await first.json()).jobId);
  expect(
    (
      await request.post("/api/evals", {
        data: {},
        headers: { "Idempotency-Key": key },
      })
    ).status(),
  ).toBe(409);
  expect((await request.get("/api/evals")).status()).toBe(404);
});
test("mobile layout remains usable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Reconstruct the failure." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
