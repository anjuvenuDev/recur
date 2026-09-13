import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { runEvals } from "../packages/evals/runner";
import { createStore } from "../packages/db/src/client";
import { seedIncident } from "../packages/db/src/seed";
import { reproduce } from "../packages/agents/src/workflow";
import { fixtureAnalysis } from "../packages/agents/src/coordinator";
import { generateRegression, ablate } from "../packages/agents/src/regression";
import { EvidenceSchema } from "../packages/core/src/domain";
process.env.OPENAI_API_KEY = "";
process.env.ARGA_ENABLED = "false";
process.env.LAUNCHDARKLY_SDK_KEY = "";
process.env.GITHUB_DEMO_COMMIT_SHA = "";
const scenarios = await runEvals();
const store = createStore(":memory:");
try {
  const incident = await seedIncident(store, true);
  const capsule = await reproduce(store, incident.id, {
    local: true,
    teaching: true,
  });
  if (!capsule) throw new Error("Hero workflow did not produce a capsule");
  const regression = await generateRegression(capsule);
  const ablations = await ablate(capsule);
  const evidence = (await store.list("evidence", incident.id)).map((e) =>
    EvidenceSchema.parse(e),
  );
  const selected = fixtureAnalysis(evidence).requiredEvidenceIds;
  const causalIds = evidence
    .filter((e) =>
      ["db_read", "stripe_read", "feature_flag_read", "git_commit"].includes(
        e.kind,
      ),
    )
    .map((e) => e.id);
  const report = {
    ...scenarios,
    metricScope:
      "Scenario correctness covers ten cases; average attempts, evidence precision, ablation and regression validity cover the hero teaching-mode workflow.",
    metrics: {
      ...scenarios.metrics,
      averageAttempts: (await store.list("attempts", incident.id)).length,
      evidencePrecision:
        selected.filter((id) => causalIds.includes(id)).length /
        selected.length,
      ablationSensitivity:
        ablations.filter((a) => !a.matched).length / ablations.length,
      regressionTestValidity: Number(regression.valid),
    },
    ablations,
  };
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/evals.json", JSON.stringify(report, null, 2));
  console.table(
    report.results.map(({ name, correct, matched, unresolved }) => ({
      name,
      correct,
      matched,
      unresolved: unresolved ?? "—",
    })),
  );
  console.log(report.metrics);
  if (
    report.metrics.correct !== 10 ||
    !regression.valid ||
    report.metrics.ablationSensitivity !== 1
  )
    process.exitCode = 1;
} finally {
  store.close();
}
