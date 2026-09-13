import { Agent, Runner } from "@openai/agents";
import { z } from "zod";
import {
  AnalysisSchema,
  PlanSchema,
  type Evidence,
  type Incident,
  type Analysis,
} from "../../core/src/domain";
import { deduplicate } from "../../core/src/evidence";
export function fixtureAnalysis(records: Evidence[]): Analysis {
  const evidence = deduplicate(records);
  const selected = evidence.filter((e) =>
    ["db_read", "stripe_read", "feature_flag_read", "git_commit"].includes(
      e.kind,
    ),
  );
  const reasons: Record<string, string> = {
    db_read:
      "The request must resolve to its customer and refund-request rows.",
    "stripe.charge.retrieve":
      "The original amount and refunded amount determine the remaining balance.",
    "stripe.refund.list":
      "A prior partial refund activates the failing branch.",
    refunds_v2: "The enabled V2 flag selects the failing branch.",
    "git.commit": "The buggy implementation must be selected.",
  };
  return AnalysisSchema.parse({
    candidateDependencies: selected.map((e) => ({
      id: e.id,
      sourceEvidenceId: e.id,
      category:
        e.kind === "db_read"
          ? "database"
          : e.kind === "feature_flag_read"
            ? "feature_flag"
            : e.kind === "git_commit"
              ? "code"
              : "external_api",
      resourceType: e.operation,
      resourceId: null,
      requiredFields: [],
      reason:
        reasons[e.operation] ??
        reasons[e.kind] ??
        "Observed read in failing execution",
      confidence: 1,
    })),
    requiredEvidenceIds: selected.map((e) => e.id),
    ignoredEvidenceIds: evidence
      .filter((e) => !selected.includes(e))
      .map((e) => e.id),
    rationaleByEvidenceId: selected.map((e) => ({
      id: e.id,
      reason: reasons[e.operation] ?? reasons[e.kind] ?? "Observed causal read",
    })),
    uncertainty: [],
  });
}
export async function analyze(incident: Incident, evidence: Evidence[]) {
  if (!process.env.OPENAI_API_KEY)
    return { analysis: fixtureAnalysis(evidence), mode: "DEMO FIXTURE" };
  if (!process.env.OPENAI_MODEL)
    throw new Error("Set OPENAI_MODEL to use live analysis");
  const specialist = new Agent({
    name: "EvidenceAnalyst",
    model: process.env.OPENAI_MODEL,
    instructions:
      "Select only supplied evidence IDs. Prioritize code, database, charge, refund and feature flag reads. Explain causal relevance. Never invent facts. No writes.",
    outputType: AnalysisSchema,
  });
  const coordinator = new Agent({
    name: "RecurCoordinator",
    model: process.env.OPENAI_MODEL,
    instructions:
      "Call analyze_evidence once with the supplied evidence, then return its structured analysis. You cannot decide reproduction or perform writes.",
    tools: [
      specialist.asTool({
        toolName: "analyze_evidence",
        toolDescription: "Analyze sanitized incident evidence",
        runOptions: { maxTurns: 2 },
      }),
    ],
    outputType: AnalysisSchema,
  });
  const runner = new Runner({
    tracingDisabled: process.env.NODE_ENV === "test",
    traceIncludeSensitiveData: false,
  });
  for (let retry = 0; retry < 2; retry++) {
    try {
      const r = await runner.run(
        coordinator,
        JSON.stringify({
          incident: {
            id: incident.id,
            route: incident.route,
            source: incident.git.excerpt,
          },
          evidence: deduplicate(evidence).filter((e) => e.kind !== "otel_span"),
          retry,
        }),
        { maxTurns: 3, signal: AbortSignal.timeout(30000) },
      );
      const analysis = AnalysisSchema.parse(r.finalOutput);
      const ids = new Set(evidence.map((e) => e.id));
      if (
        [
          ...analysis.requiredEvidenceIds,
          ...analysis.candidateDependencies.map((d) => d.sourceEvidenceId),
        ].some((id) => !ids.has(id))
      )
        throw new Error("Agent invented evidence");
      return { analysis, mode: "CONNECTED" };
    } catch {
      if (retry === 1)
        throw new Error(
          "Agent analysis unavailable or invalid after one retry",
        );
    }
  }
  throw new Error("Analysis failed");
}
const ReconstructionOutputSchema = z.object({
  refundsV2: z.boolean(),
  chargeAmount: z.number().int(),
  priorRefundAmounts: z.array(z.number().int()),
  fixtureIds: z.array(z.string()),
  codeMode: z.enum(["buggy", "fixed"]),
  missingEvidenceRequests: z.array(z.string()),
});
export async function refinePlan(plan: unknown, mismatches: string[]) {
  const baseline = PlanSchema.parse(plan);
  if (!process.env.OPENAI_API_KEY) return baseline;
  const specialist = new Agent({
    name: "StateReconstructor",
    model: process.env.OPENAI_MODEL,
    instructions:
      "Infer required reconstruction fields from supplied observed plan and mismatch context. Preserve observed amounts, fixture IDs, flag value, and code mode. Never invent values. Request missing evidence if necessary.",
    outputType: ReconstructionOutputSchema,
  });
  const coordinator = new Agent({
    name: "RecurCoordinator",
    model: process.env.OPENAI_MODEL,
    instructions:
      "Call reconstruct_state with supplied observations and return its structured proposal.",
    tools: [
      specialist.asTool({
        toolName: "reconstruct_state",
        toolDescription: "Propose state from observed evidence",
        runOptions: { maxTurns: 2 },
      }),
    ],
    outputType: ReconstructionOutputSchema,
  });
  for (let retry = 0; retry < 2; retry++) {
    try {
      const r = await new Runner({ traceIncludeSensitiveData: false }).run(
        coordinator,
        JSON.stringify({ plan: baseline, mismatches, retry }),
        { maxTurns: 3, signal: AbortSignal.timeout(30000) },
      );
      const candidate = ReconstructionOutputSchema.parse(r.finalOutput);
      if (
        candidate.refundsV2 !== baseline.flagState.refunds_v2 ||
        candidate.chargeAmount !== baseline.stripeState.charge.amount ||
        candidate.codeMode !== baseline.codeMode ||
        JSON.stringify(candidate.priorRefundAmounts) !==
          JSON.stringify(baseline.stripeState.refunds.map((r) => r.amount)) ||
        JSON.stringify([...candidate.fixtureIds].sort()) !==
          JSON.stringify(baseline.dbFixtures.map((f) => f.id).sort()) ||
        candidate.missingEvidenceRequests.length
      )
        throw new Error("Agent plan differs from observed state");
      return baseline;
    } catch {
      if (retry === 1)
        throw new Error(
          "State reconstruction invalid or unavailable after one retry",
        );
    }
  }
  throw new Error("Reconstruction failed");
}
export const RegressionOutputSchema = z.object({
  code: z.string(),
  explanation: z.string(),
});
export async function authorRegression(template: string) {
  if (!process.env.OPENAI_API_KEY)
    return {
      code: template,
      explanation:
        "Deterministic fixture author; asserts remaining refund and provider state.",
    };
  const specialist = new Agent({
    name: "RegressionAuthor",
    model: process.env.OPENAI_MODEL,
    instructions:
      "Return the supplied executable test exactly as code, plus a short explanation. No additional imports, APIs, or side effects.",
    outputType: RegressionOutputSchema,
  });
  const coordinator = new Agent({
    name: "RecurCoordinator",
    model: process.env.OPENAI_MODEL,
    instructions: "Call author_regression and return its code and explanation.",
    tools: [
      specialist.asTool({
        toolName: "author_regression",
        toolDescription: "Author a regression from a verified template",
        runOptions: { maxTurns: 2 },
      }),
    ],
    outputType: RegressionOutputSchema,
  });
  const r = await new Runner({ traceIncludeSensitiveData: false }).run(
    coordinator,
    template,
    { maxTurns: 3, signal: AbortSignal.timeout(30000) },
  );
  return RegressionOutputSchema.parse(r.finalOutput);
}
