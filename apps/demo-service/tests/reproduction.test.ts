import { describe, it, expect } from "vitest";
import { executePlan } from "../src/replay";
import { heroPlan, target } from "../../../packages/core/src/fixtures";
import { compareFingerprint } from "../../../packages/core/src/fingerprint";
import { createStore } from "../../../packages/db/src/client";
import { seedIncident } from "../../../packages/db/src/seed";
import { reproduce } from "../../../packages/agents/src/workflow";
import {
  generateRegression,
  verifyFix,
  ablate,
} from "../../../packages/agents/src/regression";
import {
  AttemptSchema,
  CapsuleSchema,
  EventSchema,
} from "../../../packages/core/src/domain";
import { runEvals } from "../../../packages/evals/runner";
describe("real replay and artifacts", () => {
  it("captures the target bug and changes behavior with the flag", async () => {
    const plan = heroPlan();
    const buggy = await executePlan(plan, { local: true });
    expect(compareFingerprint(target, buggy.result.fingerprint).matched).toBe(
      true,
    );
    expect(buggy.evidence.some((e) => e.kind === "otel_span" && e.spanId)).toBe(
      true,
    );
    expect(buggy.result.sideEffects).toEqual([]);
    plan.flagState.refunds_v2 = false;
    const other = await executePlan(plan, { local: true });
    expect(other.result.status).toBe(200);
    expect(compareFingerprint(target, other.result.fingerprint).matched).toBe(
      false,
    );
  });
  it("refines once, exports a valid capsule, validates regression, verifies fix and ablates all causal state", async () => {
    const db = createStore(":memory:");
    try {
      const incident = await seedIncident(db);
      const capsule = await reproduce(db, incident.id, {
        teaching: true,
        local: true,
      });
      expect(capsule).not.toBeNull();
      CapsuleSchema.parse(capsule);
      const attempts = (await db.list("attempts")).map((a) =>
        AttemptSchema.parse(a),
      );
      expect(attempts.map((a) => a.status)).toEqual(["mismatch", "match"]);
      const events = (await db.list("run_events")).map((e) =>
        EventSchema.parse(e),
      );
      expect(events.some((e) => e.phase === "REFINING")).toBe(true);
      const test = await generateRegression(capsule!);
      expect(test.valid, test.buggyOutput + test.fixedOutput).toBe(true);
      expect((await verifyFix(capsule!)).passed).toBe(true);
      expect((await ablate(capsule!)).every((a) => !a.matched)).toBe(true);
    } finally {
      db.close();
    }
  }, 60000);
  it("fails safely with missing flag evidence", async () => {
    const db = createStore(":memory:");
    try {
      const incident = await seedIncident(db);
      await db.deleteFor("evidence", incident.id);
      const result = await reproduce(db, incident.id, { local: true });
      expect(result).toBeNull();
      expect(await db.list("capsules")).toHaveLength(0);
      expect(JSON.stringify(await db.list("run_events"))).toContain(
        "Insufficient evidence",
      );
    } finally {
      db.close();
    }
  });
  it("meets all ten deterministic eval expectations", async () => {
    const report = await runEvals();
    expect(report.metrics.correct).toBe(10);
    expect(report.metrics.falseReproductionRate).toBe(0);
  });
});

it("stops at three attempts when the target cannot match", async () => {
  const db = createStore(":memory:");
  try {
    const incident = await seedIncident(db, true);
    incident.productionFingerprint.normalizedMessage =
      "A different production error";
    await db.put("incidents", incident.id, incident.id, incident);
    expect(await reproduce(db, incident.id, { local: true })).toBeNull();
    expect(await db.list("attempts")).toHaveLength(3);
    expect(await db.list("capsules")).toHaveLength(0);
  } finally {
    db.close();
  }
});
