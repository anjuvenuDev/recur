import { z } from "zod";
export const money = z.number().int().nonnegative();
export const RequestSchema = z
  .object({ customerId: z.string().min(1), chargeId: z.string().min(1) })
  .strict();
export const ReplayRequestSchema = z.object({
  method: z.literal("POST"),
  path: z.literal("/api/refunds/remaining"),
  body: RequestSchema,
});
export const RefundSchema = z.object({
  id: z.string(),
  chargeId: z.string(),
  amount: money,
});
export const ChargeSchema = z.object({
  id: z.string(),
  amount: money,
  currency: z.literal("usd"),
  amount_refunded: money,
});
export const StripeStateSchema = z
  .object({ charge: ChargeSchema, refunds: z.array(RefundSchema) })
  .refine(
    (s) =>
      s.refunds.reduce((n, r) => n + r.amount, 0) ===
        s.charge.amount_refunded &&
      s.charge.amount_refunded <= s.charge.amount &&
      s.refunds.every((r) => r.chargeId === s.charge.id),
    "Inconsistent charge/refund state",
  );
export const FixtureSchema = z.object({
  table: z.enum(["demo_customers", "demo_refund_requests"]),
  id: z.string(),
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});
export const FlagSchema = z.object({ refunds_v2: z.boolean() });
export const SideEffectSchema = z.object({
  operation: z.string(),
  amount: money,
});
export const FingerprintSchema = z.object({
  errorClass: z.string(),
  normalizedMessage: z.string(),
  topApplicationFrame: z.object({
    file: z.string(),
    function: z.string().optional(),
    line: z.number().optional(),
  }),
  route: z.string(),
  statusCode: z.number().int(),
  relevantSpanNames: z.array(z.string()),
  relevantSideEffects: z.array(SideEffectSchema),
});
export const EvidenceSchema = z.object({
  id: z.string(),
  incidentId: z.string(),
  kind: z.enum([
    "http_request",
    "http_response",
    "application_error",
    "otel_span",
    "db_read",
    "db_write",
    "stripe_read",
    "stripe_write",
    "feature_flag_read",
    "git_commit",
    "environment",
  ]),
  source: z.enum([
    "demo-service",
    "github",
    "stripe",
    "launchdarkly",
    "database",
    "system",
  ]),
  timestamp: z.iso.datetime(),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  operation: z.string(),
  payload: z.unknown(),
  sanitized: z.literal(true),
  relevance: z.number().optional(),
});
export const GitSchema = z.object({
  repository: z.string(),
  commitSha: z.string(),
  relevantFiles: z.array(z.string()),
  source: z.enum(["GitHub Live", "GitHub Fixture"]),
  excerpt: z.string(),
});
export const IncidentSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(["open", "reproducing", "reproduced", "failed", "fixed"]),
  occurredAt: z.iso.datetime(),
  route: z.string(),
  requestMethod: z.string(),
  requestBody: RequestSchema,
  responseStatus: z.number(),
  productionFingerprint: FingerprintSchema,
  git: GitSchema,
  evidenceIds: z.array(z.string()),
});
export const DependencySchema = z.object({
  id: z.string(),
  sourceEvidenceId: z.string(),
  category: z.enum([
    "code",
    "database",
    "external_api",
    "feature_flag",
    "environment",
  ]),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  requiredFields: z.array(z.string()),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
});
export const AnalysisSchema = z.object({
  candidateDependencies: z.array(DependencySchema),
  requiredEvidenceIds: z.array(z.string()),
  ignoredEvidenceIds: z.array(z.string()),
  rationaleByEvidenceId: z.array(
    z.object({ id: z.string(), reason: z.string() }),
  ),
  uncertainty: z.array(z.string()),
});
export const PlanSchema = z.object({
  dbFixtures: z.array(FixtureSchema),
  stripeState: StripeStateSchema,
  flagState: FlagSchema,
  environmentState: z.record(z.string(), z.string()),
  replayRequest: ReplayRequestSchema,
  expectedFailure: FingerprintSchema,
  confidence: z.number().min(0).max(1),
  missingEvidenceRequests: z.array(z.string()),
  codeMode: z.enum(["buggy", "fixed"]),
});
export const ReplayResultSchema = z.object({
  status: z.number(),
  body: z.unknown(),
  fingerprint: FingerprintSchema.nullable(),
  spans: z.array(z.string()),
  sideEffects: z.array(SideEffectSchema),
  refunds: z.array(RefundSchema),
  stack: z.string().nullable(),
});
export const ComparisonSchema = z.object({
  matched: z.boolean(),
  fidelityScore: z.number(),
  criticalMatched: z.boolean(),
  checks: z.array(
    z.object({
      field: z.string(),
      matched: z.boolean(),
      critical: z.boolean(),
    }),
  ),
  mismatches: z.array(z.string()),
});
export const AttemptSchema = z.object({
  id: z.string(),
  incidentId: z.string(),
  attemptNumber: z.number().int().min(1).max(3),
  status: z.enum(["planned", "running", "match", "mismatch", "error"]),
  plan: PlanSchema,
  replayResult: ReplayResultSchema.optional(),
  comparison: ComparisonSchema.optional(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().optional(),
});
export const CapsuleSchema = z.object({
  version: z.literal("1"),
  id: z.string(),
  incidentId: z.string(),
  createdAt: z.iso.datetime(),
  code: z.object({
    repository: z.string(),
    commitSha: z.string(),
    relevantFiles: z.array(z.string()),
  }),
  request: ReplayRequestSchema,
  database: z.object({ fixtures: z.array(FixtureSchema) }),
  externalState: z.object({ stripe: StripeStateSchema }),
  featureFlags: FlagSchema,
  environment: z.record(z.string(), z.string()),
  productionFingerprint: FingerprintSchema,
  reproduction: z.object({
    attemptId: z.string(),
    fidelityScore: z.number(),
    matched: z.literal(true),
  }),
  provenance: z.object({
    evidenceIds: z.array(z.string()),
    generatedByModel: z.string().optional(),
    argaTwinUsed: z.boolean(),
    launchDarklyUsed: z.boolean(),
  }),
});
export const EventSchema = z.object({
  id: z.string(),
  incidentId: z.string(),
  attemptId: z.string().optional(),
  timestamp: z.iso.datetime(),
  type: z.enum([
    "analysis_started",
    "evidence_selected",
    "plan_created",
    "provision_started",
    "provision_completed",
    "replay_started",
    "replay_completed",
    "fingerprint_compared",
    "refinement_requested",
    "reproduced",
    "failed",
  ]),
  phase: z.string(),
  message: z.string(),
  data: z.unknown().optional(),
});
export type Fingerprint = z.infer<typeof FingerprintSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Incident = z.infer<typeof IncidentSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Capsule = z.infer<typeof CapsuleSchema>;
export type Attempt = z.infer<typeof AttemptSchema>;
export type RunEvent = z.infer<typeof EventSchema>;
export type ReplayResult = z.infer<typeof ReplayResultSchema>;
export type StripeState = z.infer<typeof StripeStateSchema>;
export type Refund = z.infer<typeof RefundSchema>;
export type Charge = z.infer<typeof ChargeSchema>;
export type Analysis = z.infer<typeof AnalysisSchema>;
