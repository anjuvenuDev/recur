import "dotenv/config";
import express from "express";
import { heroPlan } from "../../../packages/core/src/fixtures";
import { RequestSchema } from "../../../packages/core/src/domain";
import { executePlan } from "./replay";
const app = express();
app.use(express.json({ limit: "16kb" }));
app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "recur-demo" }),
);
app.get("/debug/demo-state", (_req, res) =>
  res.json({
    state: heroPlan(),
    isolation: "Each request receives disposable state",
  }),
);
app.post("/api/refunds/remaining", async (req, res) => {
  const body = RequestSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid refund request" });
    return;
  }
  try {
    const plan = heroPlan();
    plan.replayRequest.body = body.data;
    plan.codeMode = process.env.DEMO_CODE_MODE === "fixed" ? "fixed" : "buggy";
    const { result } = await executePlan(plan);
    res.status(result.status).json(result.body);
  } catch {
    res.status(502).json({ error: "Demo environment unavailable" });
  }
});
app.listen(4001, "127.0.0.1", () =>
  console.log("Demo service: http://localhost:4001"),
);
