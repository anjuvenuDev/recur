# RECUR — MASTER BUILD SPEC FOR CODEX ASTRA

> **Product:** Recur  
> **Tagline:** **Capture the conditions. Recreate the bug. Prove the fix.**  
> **Core idea:** A production error is not just a request and stack trace. It happened against a particular commit, feature-flag configuration, database state, and external SaaS state. Recur reconstructs the minimum behaviorally relevant state behind a production failure, recreates that state in safe disposable environments, iterates until the same failure fingerprint recurs, and emits a portable **Reproduction Capsule** plus a regression test.

---

# 0. OPERATING INSTRUCTIONS FOR THE CODING AGENT

You are the principal engineer responsible for building this project end-to-end. Treat this document as the authoritative product and engineering specification.

## 0.1 Do not ask the user questions unless absolutely blocked

Resolve minor ambiguity yourself using the priorities in this document.

If an external credential is missing:
1. implement the real adapter,
2. provide a deterministic local fallback,
3. make the UI clearly label whether the run used **LIVE/TWIN** or **SIMULATED** state,
4. continue building.

Do not stop implementation merely because Stripe/Arga/LaunchDarkly/GitHub credentials are absent.

## 0.2 Token-efficiency rules

The build is being performed under a limited coding-model token budget. Optimize implementation behavior accordingly.

- Read this file fully once.
- Create a checklist from the phases below.
- Do not repeatedly re-read the entire repository.
- Do not research competing architectures after the architecture in this document has been accepted.
- Prefer small, explicit TypeScript modules over abstractions that require extensive explanation.
- Do not introduce a library unless it removes more complexity than it adds.
- Do not create generic platform abstractions for hypothetical future integrations.
- Do not redesign working code for aesthetic reasons.
- Do not generate excessive comments. Comment only non-obvious invariants and safety behavior.
- Run targeted tests after each subsystem rather than the full suite after every file change.
- Use deterministic fixtures and schemas wherever possible.
- Keep prompts for runtime agents short and structured.
- Never make the runtime LLM responsible for numeric calculations, side-effect safety, or final reproduction equality.
- Do not implement Kubernetes, Docker orchestration, distributed queues, Kafka, Redis, GraphQL, microservices, or an auth platform unless absolutely required.
- Prefer a monorepo with a small number of packages and local processes.

## 0.3 Definition of done

The project is done only when a judge can perform this exact flow:

1. Open Recur dashboard.
2. See a seeded production incident for `POST /api/refunds/remaining`.
3. See the original production evidence:
   - Git commit SHA,
   - stack trace,
   - request payload,
   - database fixture IDs,
   - Stripe charge/refund state,
   - LaunchDarkly feature-flag state.
4. Click **Reproduce**.
5. Watch Recur:
   - inspect evidence,
   - form a candidate state hypothesis,
   - provision/seed or connect to the Stripe twin,
   - reconstruct DB fixture and flag state,
   - replay the failing request,
   - compare the result with the production failure fingerprint,
   - iterate if the first attempt is incomplete.
6. End with a large **BUG REPRODUCED** state and a fidelity score.
7. Show the generated **Reproduction Capsule**.
8. Show the generated regression test.
9. Click **Verify Fix** using a patched implementation or fix-mode toggle.
10. Show that the old capsule no longer reproduces the failure and the regression assertion now passes.
11. Demonstrate one adversarial case where removing a required state element causes reproduction to fail.
12. Show the evidence graph explaining why each piece of state was included.
13. If Arga credentials are available, prove that the reconstructed Stripe side effects live inside an Arga digital twin rather than real Stripe.

The entire happy-path judge demo should be possible in under 2 minutes.

---

# 1. PRODUCT POSITIONING

## 1.1 Problem statement

Modern applications depend heavily on external APIs, feature flags, managed services, mutable database state, and environment configuration.

When a production bug depends on that external state, an error trace and original HTTP request are insufficient to reproduce it.

By the time an engineer investigates:
- external SaaS objects may have changed,
- feature flags may have changed,
- database rows may have changed,
- a different commit may be deployed,
- the external provider may behave differently,
- the engineer no longer knows which pieces of state actually influenced the failure.

Engineers therefore spend significant time manually reconstructing the conditions behind a failure, often failing to reproduce it.

## 1.2 Recur's solution

Recur observes the evidence surrounding a failed execution and reconstructs the **minimum relevant execution state** required to cause the same failure again.

The loop is:

```text
PRODUCTION FAILURE
        ↓
COLLECT EVIDENCE
        ↓
INFER RELEVANT STATE
        ↓
BUILD CANDIDATE REPRODUCTION CAPSULE
        ↓
RECONSTRUCT SAFE ENVIRONMENT
        ↓
REPLAY REQUEST
        ↓
COMPARE FAILURE FINGERPRINT
   ┌───────────────┴──────────────┐
   │                              │
 MATCH                          NO MATCH
   │                              │
   ↓                              ↓
CAPSULE COMPLETE            IDENTIFY MISSING STATE
   │                              │
   ↓                              └──────→ ITERATE
GENERATE REGRESSION TEST
```

## 1.3 Differentiation

Never describe Recur as:
- an AI log analyzer,
- an incident summarizer,
- a coding agent,
- request replay,
- an observability dashboard,
- a Stripe mock,
- an Arga wrapper.

The canonical differentiation sentence is:

> **Replay tools replay the request. Recur reconstructs the state that made the request fail.**

The strongest demo line is:

> **A stack trace tells you where the application failed. Recur reconstructs the conditions that made it fail.**

## 1.4 Scope

The hackathon MVP targets only:

> **Application failures caused by combinations of code version, application database state, feature flags/configuration, and external SaaS state.**

Explicitly out of scope:
- memory leaks,
- kernel failures,
- packet loss,
- arbitrary distributed races,
- CPU saturation,
- arbitrary browser bugs,
- arbitrary production environment cloning,
- full deterministic replay of all software,
- production PII cloning.

---

# 2. HERO DEMO SCENARIO

Build the product around exactly one canonical bug.

## 2.1 Demo business behavior

A demo application exposes:

```http
POST /api/refunds/remaining
Content-Type: application/json

{
  "customerId": "cust_demo_001",
  "chargeId": "ch_demo_001"
}
```

The customer originally paid **$100.00**.

A previous partial refund of **$40.00** exists.

The request asks the service to refund the remaining **$60.00**.

Feature flag:

```text
refunds_v2 = true
```

## 2.2 Intentional bug

The buggy implementation incorrectly treats a charge with any prior refund as invalid when `refunds_v2=true`.

Illustrative logic:

```ts
if (refundsV2 && charge.amount_refunded > 0) {
  throw new InvalidRefundStateError(
    "V2 refund flow cannot process an already partially refunded charge"
  );
}
```

Correct behavior should instead calculate:

```text
remaining = charge.amount - charge.amount_refunded
```

and allow a refund up to `remaining`.

## 2.3 Production failure

The seeded production incident should contain:

```text
Route:
POST /api/refunds/remaining

Commit:
buggy commit SHA

Feature flag:
refunds_v2=true

Stripe state:
charge amount = 10000 cents
amount refunded = 4000 cents
remaining = 6000 cents

Database:
customer cust_demo_001
refund request rr_demo_001

Expected:
remaining $60 refunded

Actual:
HTTP 500
InvalidRefundStateError
```

## 2.4 Failure fingerprint

A reproduction does **not** count as successful merely because it returns HTTP 500.

Use a deterministic fingerprint:

```ts
type FailureFingerprint = {
  errorClass: string;
  normalizedMessage: string;
  topApplicationFrame: {
    file: string;
    function?: string;
    line?: number;
  };
  route: string;
  statusCode: number;
  relevantSpanNames: string[];
  relevantSideEffects: SideEffectFingerprint[];
};
```

For the seeded bug:

```json
{
  "errorClass": "InvalidRefundStateError",
  "normalizedMessage": "V2 refund flow cannot process an already partially refunded charge",
  "topApplicationFrame": {
    "file": "refund-service.ts",
    "function": "refundRemaining"
  },
  "route": "POST /api/refunds/remaining",
  "statusCode": 500,
  "relevantSpanNames": [
    "feature_flag.read.refunds_v2",
    "stripe.charge.retrieve",
    "refund.calculate_remaining"
  ],
  "relevantSideEffects": []
}
```

Line numbers may vary; line number must not be a strict equality requirement.

## 2.5 Reproduction success criteria

Reproduced only if:
- error class matches,
- normalized error message matches,
- route matches,
- status code matches,
- top application file/function match,
- required causal spans are present.

Compute a visible fidelity score, but final state is boolean:

```text
>= 0.90 fidelity AND all critical fields matched → REPRODUCED
otherwise → NOT REPRODUCED
```

Never let the LLM decide this boolean.

---

# 3. TECH STACK

Use TypeScript end-to-end.

## 3.1 Runtime requirements

- Node.js 20+
- pnpm workspaces
- TypeScript strict mode
- Next.js App Router for the dashboard
- React
- Tailwind CSS
- shadcn/ui-compatible component approach
- Zod v4 schemas
- Vitest for tests
- OpenTelemetry JS for evidence capture
- OpenAI Agents SDK for agent orchestration
- SQLite for zero-friction local state using Drizzle ORM
- optional Postgres adapter is not required for hackathon
- Vercel is the preferred dashboard deployment target if deployment is needed
- the demo service may run as a Node process / Vercel-compatible API if feasible

## 3.2 Runtime AI framework

Use:

```bash
pnpm add @openai/agents zod
```

Use the **OpenAI Agents SDK for TypeScript**.

Do **not** use:
- LangChain,
- LangGraph,
- CrewAI,
- AutoGen,
- custom swarm frameworks.

Reason:
- Agents SDK already provides tools, manager-style agent orchestration, guardrails, tracing, sessions, and human-in-the-loop.
- Fewer dependencies means less agent-build complexity and lower token overhead.

## 3.3 Multi-agent pattern

Use **manager + specialists as tools**, not free-form handoffs.

The deterministic workflow owns the phase transitions. Agents solve bounded reasoning tasks.

Agents:

1. `RecurCoordinator`
2. `EvidenceAnalyst`
3. `StateReconstructor`
4. `RegressionAuthor`

Do not let agents recursively delegate without limits.

### RecurCoordinator

Responsibility:
- summarize current reproduction state,
- call specialists when deterministic workflow requests them,
- never execute external writes directly.

### EvidenceAnalyst

Input:
- production trace bundle,
- source-code excerpt metadata,
- external-read observations.

Output:
```ts
type EvidenceAnalysis = {
  candidateDependencies: CandidateDependency[];
  requiredEvidenceIds: string[];
  ignoredEvidenceIds: string[];
  rationaleByEvidenceId: Record<string, string>;
  uncertainty: string[];
};
```

### StateReconstructor

Input:
- evidence analysis,
- prior reproduction attempts,
- mismatch report.

Output:
```ts
type ReconstructionPlan = {
  dbFixtures: FixtureSpec[];
  stripeState: StripeStateSpec;
  flagState: FlagStateSpec;
  environmentState: Record<string, string>;
  replayRequest: ReplayRequest;
  expectedFailure: FailureFingerprint;
  confidence: number;
  missingEvidenceRequests: MissingEvidenceRequest[];
};
```

### RegressionAuthor

Input:
- successful capsule,
- source route,
- fingerprint.

Output:
- a Vitest regression-test file,
- expected fixture description,
- human-readable explanation.

The generated test must still be parsed/validated by deterministic code before displaying it as valid.

## 3.4 Orchestration model

Use a deterministic state machine:

```text
INGESTED
  ↓
ANALYZING
  ↓
PLANNED
  ↓
PROVISIONING
  ↓
REPLAYING
  ↓
COMPARING
  ├── MATCH → REPRODUCED
  └── NO_MATCH → REFINING
                     ↓
                  PLANNED
```

Hard cap:

```text
MAX_REPRO_ATTEMPTS = 3
```

If no match after 3 attempts:

```text
NOT_REPRODUCED
```

with an explicit unresolved-dependencies report.

Do not let the agent loop forever.

---

# 4. MONOREPO STRUCTURE

Create:

```text
recur/
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
├── .gitignore
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── page.tsx
│   │   │   ├── incidents/[id]/page.tsx
│   │   │   ├── capsules/[id]/page.tsx
│   │   │   └── api/
│   │   │       ├── incidents/
│   │   │       ├── reproduce/
│   │   │       ├── verify-fix/
│   │   │       └── demo/
│   │   ├── components/
│   │   └── lib/
│   └── demo-service/
│       ├── src/
│       │   ├── server.ts
│       │   ├── routes/refunds.ts
│       │   ├── services/refund-service.ts
│       │   ├── services/stripe.ts
│       │   ├── services/flags.ts
│       │   ├── db/
│       │   ├── telemetry/
│       │   └── errors/
│       └── tests/
├── packages/
│   ├── core/
│   │   ├── src/domain/
│   │   ├── src/state-machine/
│   │   ├── src/fingerprint/
│   │   └── src/capsule/
│   ├── agents/
│   │   ├── src/coordinator.ts
│   │   ├── src/evidence-analyst.ts
│   │   ├── src/state-reconstructor.ts
│   │   ├── src/regression-author.ts
│   │   ├── src/tools/
│   │   └── src/prompts/
│   ├── integrations/
│   │   ├── src/github/
│   │   ├── src/launchdarkly/
│   │   ├── src/arga/
│   │   ├── src/stripe/
│   │   └── src/fallback/
│   ├── telemetry/
│   │   ├── src/otel.ts
│   │   ├── src/trace-store.ts
│   │   └── src/evidence-normalizer.ts
│   ├── db/
│   │   ├── src/schema.ts
│   │   ├── src/client.ts
│   │   └── src/seed.ts
│   └── evals/
│       ├── scenarios/
│       ├── runner.ts
│       ├── metrics.ts
│       └── expected/
└── scripts/
    ├── setup-demo.ts
    ├── seed-incident.ts
    ├── seed-arga-stripe.ts
    ├── reset-demo.ts
    └── run-evals.ts
```

Do not create more packages unless necessary.

---

# 5. DOMAIN MODELS

All models must be Zod-backed.

## 5.1 Incident

```ts
type Incident = {
  id: string;
  title: string;
  description: string;
  status: "open" | "reproducing" | "reproduced" | "failed" | "fixed";
  occurredAt: string;
  route: string;
  requestMethod: string;
  requestBody: unknown;
  responseStatus: number;
  productionFingerprint: FailureFingerprint;
  git: GitEvidence;
  evidenceIds: string[];
};
```

## 5.2 Evidence

```ts
type EvidenceKind =
  | "http_request"
  | "http_response"
  | "application_error"
  | "otel_span"
  | "db_read"
  | "db_write"
  | "stripe_read"
  | "stripe_write"
  | "feature_flag_read"
  | "git_commit"
  | "environment";

type EvidenceRecord = {
  id: string;
  incidentId: string;
  kind: EvidenceKind;
  source: "demo-service" | "github" | "stripe" | "launchdarkly" | "database" | "system";
  timestamp: string;
  traceId?: string;
  spanId?: string;
  operation: string;
  payload: unknown;
  sanitized: boolean;
  relevance?: number;
};
```

## 5.3 Candidate dependency

```ts
type CandidateDependency = {
  id: string;
  sourceEvidenceId: string;
  category: "code" | "database" | "external_api" | "feature_flag" | "environment";
  resourceType: string;
  resourceId?: string;
  requiredFields?: string[];
  reason: string;
  confidence: number;
};
```

## 5.4 Reproduction attempt

```ts
type ReproductionAttempt = {
  id: string;
  incidentId: string;
  attemptNumber: number;
  status: "planned" | "running" | "match" | "mismatch" | "error";
  plan: ReconstructionPlan;
  replayResult?: ReplayResult;
  comparison?: FingerprintComparison;
  startedAt: string;
  finishedAt?: string;
};
```

## 5.5 Reproduction Capsule

This is the flagship product artifact.

```ts
type ReproductionCapsule = {
  version: "1";
  id: string;
  incidentId: string;
  createdAt: string;

  code: {
    repository: string;
    commitSha: string;
    relevantFiles: string[];
  };

  request: ReplayRequest;

  database: {
    fixtures: FixtureSpec[];
  };

  externalState: {
    stripe: StripeStateSpec;
  };

  featureFlags: FlagStateSpec;

  environment: Record<string, string>;

  productionFingerprint: FailureFingerprint;

  reproduction: {
    attemptId: string;
    fidelityScore: number;
    matched: boolean;
  };

  provenance: {
    evidenceIds: string[];
    generatedByModel?: string;
    argaTwinUsed: boolean;
    launchDarklyUsed: boolean;
  };
};
```

Capsule must be exportable as formatted JSON.

---

# 6. DATABASE

Use SQLite + Drizzle.

Tables:
- `incidents`
- `evidence`
- `attempts`
- `capsules`
- `demo_customers`
- `demo_refund_requests`
- `run_events`

Keep JSON-heavy objects in JSON/text columns where appropriate.

## 6.1 Demo records

Seed:

```text
Customer:
cust_demo_001

Charge:
ch_demo_001
amount = 10000
currency = usd

Prior refund:
re_demo_001
amount = 4000

Refund request:
rr_demo_001
requested mode = remaining

Flag:
refunds_v2 = true
```

Do not store real PII.

---

# 7. OPENTELEMETRY INSTRUMENTATION

Use official OpenTelemetry JS SDK.

Required packages should include the stable equivalents of:

```bash
@opentelemetry/api
@opentelemetry/sdk-node
@opentelemetry/resources
@opentelemetry/semantic-conventions
@opentelemetry/instrumentation-http
@opentelemetry/instrumentation-express
```

A custom in-process exporter is acceptable for the hackathon. It should persist spans to the Recur evidence store.

## 7.1 Required spans

Create explicit spans:

```text
refund.request
feature_flag.read.refunds_v2
stripe.charge.retrieve
stripe.refund.list
refund.calculate_remaining
stripe.refund.create
refund.response
```

Attach only sanitized attributes.

Examples:

```text
recur.resource_type = "stripe.charge"
recur.resource_id = "ch_demo_001"
recur.fields_read = ["amount", "amount_refunded", "currency"]
feature_flag.key = "refunds_v2"
feature_flag.value = true
```

Never store:
- Stripe secret keys,
- OpenAI API keys,
- GitHub tokens,
- LaunchDarkly tokens,
- Arga keys.

## 7.2 Causal evidence strategy

The MVP does not need full dynamic taint tracking.

Use this pragmatic rule:

1. any external/database value read inside the failing trace is a candidate dependency;
2. explicit custom spans mark which fields influenced branching/calculation;
3. EvidenceAnalyst ranks those candidates;
4. the deterministic reconstructor keeps high-confidence candidates and feeds them into the candidate capsule;
5. ablation evals verify that required elements matter.

---

# 8. GITHUB INTEGRATION

This is a real external integration.

Use GitHub REST API.

Environment:

```env
GITHUB_TOKEN=
GITHUB_OWNER=
GITHUB_REPO=
```

Use API version headers where appropriate.

Required capabilities:
- get commit metadata,
- get changed files or repository contents for the relevant SHA,
- retrieve a small relevant source file or source excerpt.

Preferred endpoints include:
- repository contents endpoint,
- commit endpoints,
- optionally compare endpoint.

Do not clone large repositories during runtime.

Create `GitHubAdapter`:

```ts
interface GitHubAdapter {
  getCommit(sha: string): Promise<GitCommitEvidence>;
  getFileAtRef(path: string, ref: string): Promise<string>;
  getRelevantSource(input: {
    sha: string;
    file: string;
    lineHint?: number;
  }): Promise<SourceExcerpt>;
}
```

Add a fallback adapter backed by local fixture files.

The UI must badge evidence as:
- `GitHub Live`
- or `GitHub Fixture`

---

# 9. LAUNCHDARKLY INTEGRATION

This is the third external-system dimension: mutable feature configuration.

Environment:

```env
LAUNCHDARKLY_API_TOKEN=
LAUNCHDARKLY_PROJECT_KEY=
LAUNCHDARKLY_ENVIRONMENT_KEY=production
LAUNCHDARKLY_REFUNDS_FLAG_KEY=refunds_v2
```

Use the official LaunchDarkly server-side SDK for application flag evaluation if credentials are available.

Use REST API only for management/inspection metadata where useful.

Important:
- application flag evaluation should use the SDK, not REST polling;
- REST can retrieve feature-flag configuration metadata.

Implement:

```ts
interface FeatureFlagProvider {
  getBooleanFlag(key: string, context: FlagContext, defaultValue: boolean): Promise<FlagRead>;
  describeFlag(key: string): Promise<FlagMetadata>;
}
```

Fallback:

`FixtureFeatureFlagProvider`

It must produce the same interface and record evidence exactly as the live provider does.

The seeded demo must return:

```text
refunds_v2 = true
```

During adversarial demonstration, allow the dashboard to toggle reconstructed flag state false to show reproduction failure.

---

# 10. ARGA + STRIPE TWIN INTEGRATION

Arga is not the product. Arga is the safe external-state substrate.

Canonical conceptual separation:

```text
Recur = determines what state is needed to recreate a failure
Arga  = safely instantiates realistic external service state
```

## 10.1 Arga CLI setup

Document and support:

```bash
uv tool install arga-cli
arga login
arga whoami
```

or quickstart signup API key.

Use:

```bash
arga wizard
```

when appropriate.

Arga free-plan constraint:
- assume **1 digital twin per test-runner run**;
- therefore use only a **Stripe twin** in the judged integration path;
- GitHub and LaunchDarkly are direct real integrations or local deterministic fallbacks.

Support manually supplied twin config:

```env
ARGA_ENABLED=true
ARGA_API_KEY=
ARGA_STRIPE_BASE_URL=
STRIPE_SECRET_KEY=
```

The runtime adapter must allow overriding Stripe's base URL.

## 10.2 Stripe adapter

Use official Stripe Node SDK if possible.

Implement:

```ts
interface StripeAdapter {
  retrieveCharge(chargeId: string): Promise<NormalizedCharge>;
  listRefundsForCharge(chargeId: string): Promise<NormalizedRefund[]>;
  createRefund(input: {
    chargeId: string;
    amount: number;
    idempotencyKey: string;
  }): Promise<NormalizedRefund>;
}
```

Normalize provider response before it reaches the core.

Never let OpenAI agent directly hold or receive Stripe secret keys.

## 10.3 Twin seeding

Create script:

```bash
pnpm demo:seed:arga
```

It should:
- validate required Arga/Stripe twin environment variables,
- create or ensure one synthetic customer/payment/charge,
- create one partial refund of 4000 cents,
- print resulting object IDs,
- persist a local mapping to demo fixture IDs.

If Arga's current twin seeding API/CLI differs, inspect the current Arga docs and adapt the script, but preserve the normalized interface.

## 10.4 Safety

All financial writes in the judged demo must target:
- Arga Stripe twin, OR
- local Stripe fixture adapter.

Never target real live Stripe.

The UI must show a strong environment badge:

```text
STRIPE: ARGA TWIN
```

or

```text
STRIPE: LOCAL SIMULATION
```

---

# 11. DEMO SERVICE

Build a deliberately small Express/Node application.

Endpoints:

```http
POST /api/refunds/remaining
GET  /health
GET  /debug/demo-state
```

## 11.1 Buggy implementation mode

Environment:

```env
DEMO_CODE_MODE=buggy
```

## 11.2 Fixed implementation mode

Environment:

```env
DEMO_CODE_MODE=fixed
```

or implement two functions and allow the replay runner to choose a mode.

The **buggy mode** throws when partial refund exists and flag is true.

The **fixed mode** computes and refunds remaining amount.

## 11.3 Deterministic side effects

Use an idempotency key:

```text
recur:<incidentId>:<attemptId>:refund
```

Never create duplicate refunds from retrying the same attempt.

The production failing scenario must fail before a refund write, so the initial fingerprint has no refund side effect.

The fixed verification run should create exactly one $60 refund in the safe environment.

---

# 12. EVIDENCE INGESTION

The seed script must create one synthetic "production incident" from a real execution of the buggy service.

Recommended process:

1. reset demo DB,
2. seed local customer/refund request,
3. ensure Stripe twin/local fixture has $100 charge + $40 previous refund,
4. set `refunds_v2=true`,
5. run the buggy endpoint,
6. capture OTel spans,
7. capture error stack,
8. persist sanitized external reads,
9. capture Git commit/ref,
10. construct production fingerprint,
11. save incident.

Command:

```bash
pnpm demo:seed
```

The seed should be repeatable.

---

# 13. AGENT TOOLS

The runtime agents must not have raw shell access.

Expose bounded function tools.

## 13.1 Evidence tools

```ts
listIncidentEvidence(incidentId)
getEvidence(evidenceId)
getTraceGraph(incidentId)
getSourceExcerpt(...)
```

## 13.2 External-state tools

Read-only for analysis:

```ts
readStripeCharge(chargeId)
readStripeRefunds(chargeId)
readFeatureFlag(flagKey)
readDemoDbFixture(resourceType, resourceId)
```

## 13.3 Reconstruction tools

Only deterministic coordinator calls these, not arbitrary LLM tool loops:

```ts
provisionCandidateState(plan)
replayCandidate(plan)
compareFingerprint(...)
```

## 13.4 Guardrails

All tool inputs use Zod.

Tool guardrails must reject:
- unknown incident IDs,
- arbitrary filesystem paths,
- unapproved external URLs,
- real Stripe keys,
- attempts to create financial writes during analysis,
- attempts to exceed 3 reproduction attempts.

---

# 14. AGENT PROMPTS

Keep prompts terse and schema-driven.

## 14.1 EvidenceAnalyst system intent

Conceptual prompt:

```text
You analyze evidence from one failed application request.
Your job is to identify the smallest set of code/config/database/external state that plausibly influenced the observed failure.

Rules:
- Use only supplied evidence.
- Never invent IDs or values.
- Distinguish observed facts from hypotheses.
- Prefer branch-influencing reads over unrelated telemetry.
- Ignore PII.
- If evidence is insufficient, request specific missing evidence.
- Output only the required structured schema.
```

## 14.2 StateReconstructor

```text
You construct a candidate reproduction plan from observed evidence and prior failed reproduction attempts.

Rules:
- Never fabricate provider objects.
- Preserve behaviorally relevant values.
- Replace identity-only values with synthetic values.
- Include only dependencies supported by evidence.
- If a prior replay mismatched, use the mismatch report to propose the smallest incremental change.
- Never change the target production fingerprint.
- Output only the structured ReconstructionPlan schema.
```

## 14.3 RegressionAuthor

```text
You generate a focused Vitest regression test for an already-verified Reproduction Capsule.

Rules:
- Test the externally visible behavior.
- Use provided fixture helpers.
- Do not use live APIs.
- Assert the intended fixed behavior.
- Do not snapshot large objects.
- Do not invent helper APIs.
- Output code plus required metadata schema.
```

---

# 15. RECONSTRUCTION LOGIC

Agent reasoning should produce a candidate plan, but deterministic code performs reconstruction.

## 15.1 First attempt

For the hero incident, expected plan includes:

```text
code:
buggy refund service / relevant commit

DB:
cust_demo_001
rr_demo_001

Stripe:
charge amount 10000
prior refund 4000

Flag:
refunds_v2=true

Request:
POST /api/refunds/remaining
cust_demo_001
ch_demo_001
```

## 15.2 Iterative refinement

To visibly demonstrate agentic iteration, make the first demo reproduction optionally omit one dependency in "teaching mode".

Preferred teaching-mode first attempt:
- omit `refunds_v2=true`,
- replay returns 200 / no target error,
- mismatch report says expected error did not occur,
- StateReconstructor inspects evidence and adds the observed flag state,
- second attempt reproduces the bug.

This is more impressive than a single-shot deterministic fixture copy.

Provide configuration:

```env
RECUR_DEMO_FORCE_TWO_ATTEMPTS=true
```

In normal/eval mode, do not intentionally sabotage the first attempt.

---

# 16. FINGERPRINT COMPARISON

Implement deterministic comparator.

Example weighting:

```text
errorClass                critical
normalizedMessage         critical
route                     critical
statusCode                critical
topApplicationFrame.file  critical
topApplicationFrame.func  critical
relevant spans            weighted
side effects              weighted
```

If any critical field mismatches:
```text
matched = false
```

Fidelity score can be:

```text
critical fields: 80%
supporting fields: 20%
```

Do not use embeddings or LLM semantic similarity for the canonical demo fingerprint.

Normalize only:
- absolute paths,
- volatile IDs if explicitly mapped,
- line numbers,
- timestamps.

---

# 17. PRIVACY / STRUCTURAL STATE TRANSFORMATION

Do not claim to clone production.

Use term:

> **behaviorally relevant structural state**

Classify fields:

```text
identity-only → synthesize/redact
behavioral    → preserve
secret        → never capture
unknown       → preserve type/shape, synthesize value if identity-bearing
```

For the demo data, all values are already synthetic.

Include a UI panel:

```text
STATE SAFETY

Production identity copied: 0
Secrets copied:             0
Behavioral fields preserved: 7
Synthetic IDs generated:     4
```

---

# 18. REGRESSION TEST GENERATION

After successful reproduction, generate a test file conceptually like:

```ts
it("refunds the remaining balance after a prior partial refund when refunds_v2 is enabled", async () => {
  const env = await setupReproductionCapsule(capsule);

  const response = await env.request
    .post("/api/refunds/remaining")
    .send({
      customerId: env.ids.customer,
      chargeId: env.ids.charge,
    });

  expect(response.status).toBe(200);

  const refunds = await env.stripe.listRefundsForCharge(env.ids.charge);
  expect(sumRefundAmounts(refunds)).toBe(10000);
  expect(refunds).toHaveLength(2);
});
```

The exact helper API must correspond to code actually built.

Validate generated test:
- TypeScript parses,
- imports exist,
- can run against local fixture adapter,
- passes against fixed implementation,
- fails against buggy implementation.

This is a major acceptance criterion.

---

# 19. UI / UX

Design for a technical judging panel.

Do not make the main UI a chatbot.

The central visualization is an evidence/reproduction workflow.

## 19.1 Home page

Header:

```text
Recur
Capture the conditions. Recreate the bug. Prove the fix.
```

Cards:
- seeded incident,
- reproduction status,
- integration status.

Primary CTA:

```text
Reproduce failure
```

## 19.2 Incident page

Three-column or responsive equivalent:

### Left: Production failure

Show:
- route,
- timestamp,
- error class,
- stack frame,
- commit,
- request body,
- failure fingerprint.

### Center: Evidence graph

Nodes:

```text
HTTP Request
     │
     ├── Git commit
     ├── refunds_v2=true
     ├── DB refund request
     └── Stripe charge
              │
              └── prior partial refund
```

Each node displays:
- source,
- observed value,
- why it matters,
- confidence.

### Right: Reconstruction timeline

Event rows:

```text
Analyzing trace
Found Stripe charge read
Found prior refund state
Found feature flag dependency
Building candidate capsule
Provisioning Stripe twin
Replay attempt #1
Mismatch: flag state absent
Refining capsule
Replay attempt #2
Failure fingerprint matched
BUG REPRODUCED
```

## 19.3 Reproduced state

Large visual state:

```text
BUG REPRODUCED
98% fidelity
```

Actions:
- View Capsule
- Generate Regression Test
- Verify Fix
- Run Ablation

## 19.4 Capsule page

Tabs:
- Summary
- JSON
- Evidence provenance
- Regression test
- Replay history

## 19.5 Integration badges

Always visibly show:

```text
GitHub       LIVE / FIXTURE
LaunchDarkly LIVE / FIXTURE
Stripe       ARGA TWIN / FIXTURE
OpenAI       CONNECTED / DEMO MODE
```

Do not pretend fallback integrations are live.

## 19.6 Visual style

- dark technical interface,
- high information density,
- restrained use of accent colors,
- no excessive gradients,
- no cartoon illustrations,
- monospace for identifiers/code,
- clear green/red/amber states,
- graph/timeline should be readable on projector.

---

# 20. API ROUTES

Dashboard backend routes should include:

```http
GET  /api/incidents
GET  /api/incidents/:id

POST /api/incidents/:id/reproduce
GET  /api/incidents/:id/events

GET  /api/capsules/:id
POST /api/capsules/:id/generate-test

POST /api/capsules/:id/verify-fix
POST /api/capsules/:id/ablate

POST /api/demo/reset
POST /api/demo/seed
```

For reproduction, use server-sent events or polling. Prefer SSE if easy; otherwise simple polling is acceptable.

Do not introduce WebSockets unless necessary.

---

# 21. RUN EVENT LOG

Persist all workflow events.

```ts
type RunEvent = {
  id: string;
  incidentId: string;
  attemptId?: string;
  timestamp: string;
  type:
    | "analysis_started"
    | "evidence_selected"
    | "plan_created"
    | "provision_started"
    | "provision_completed"
    | "replay_started"
    | "replay_completed"
    | "fingerprint_compared"
    | "refinement_requested"
    | "reproduced"
    | "failed";
  message: string;
  data?: unknown;
};
```

This powers the UI timeline.

---

# 22. EVALUATION HARNESS

The hackathon rewards reliability. Evals are a first-class deliverable.

Create at least 10 deterministic scenarios.

## 22.1 Required scenarios

1. **Hero partial-refund + flag true**
   - should reproduce.

2. **Same request, flag false**
   - target production failure should not reproduce.

3. **No prior refund**
   - target failure should not reproduce.

4. **Prior full refund**
   - should produce a different provider/business failure; must not be incorrectly marked as target reproduction.

5. **Wrong charge amount**
   - should not count as exact state match if resulting behavior differs.

6. **Missing Stripe evidence**
   - should return insufficient evidence / no hallucinated Stripe state.

7. **Missing flag evidence**
   - should request/identify missing flag state.

8. **Duplicate evidence objects**
   - deduplicate by provenance/resource identity.

9. **Redacted identity fields**
   - reproduction should still work if behaviorally irrelevant IDs are remapped.

10. **Fixed implementation**
    - capsule should no longer reproduce the bug; regression test should pass.

## 22.2 Ablation eval

For the successfully reproduced capsule, remove one component at a time:

```text
remove flag
remove prior refund
change commit/code mode
remove DB refund request
```

Record whether the failure still reproduces.

Use this to show the capsule is not just copying everything.

## 22.3 Metrics

Calculate:

```text
Reproduction Rate
False Reproduction Rate
Critical Fingerprint Accuracy
Average Attempts
Evidence Precision
Ablation Sensitivity
Regression Test Validity
```

For the seeded deterministic suite, target:
- false reproduction rate: 0%
- critical fingerprint accuracy: 100%
- regression test validity: 100%
- hero reproduction: success <= 2 attempts in demo mode
- no scenario > 3 attempts

## 22.4 Evaluation UI

Include a compact `/evals` page or panel:

```text
10 scenarios

9 expected reproductions/non-reproductions correct
0 false reproductions
1 safe unresolved case

False reproduction rate: 0%
Regression test validity: 100%
```

Safe unresolved is better than fabricated success.

---

# 23. FAILURE HANDLING

Explicitly support:

## 23.1 LLM unavailable

If `OPENAI_API_KEY` absent:
- use deterministic seeded analysis fixture for hero demo,
- label `AI: DEMO FIXTURE`,
- all other system behavior remains testable.

## 23.2 Arga unavailable

Use local Stripe fixture adapter.
Label clearly.

## 23.3 GitHub unavailable

Use fixture commit/source excerpt.

## 23.4 LaunchDarkly unavailable

Use fixture flag provider.

## 23.5 Replay failure

Store:
- request,
- response,
- thrown error,
- sanitized logs.

Do not crash the dashboard.

## 23.6 Agent malformed output

Zod parse fails:
- retry model once with schema-error summary,
- if still invalid, fail safely.

## 23.7 Token/cost safety

Runtime agent should receive:
- only the incident's selected evidence,
- short source excerpts,
- summaries of prior attempts.

Never dump full logs or whole repositories into the model.

---

# 24. OPENAI AGENTS SDK DETAILS

Environment:

```env
OPENAI_API_KEY=
OPENAI_MODEL=
```

Do not hardcode a model name in core logic. Use environment-driven configuration.

Reasonable default in example config may be a current broadly available model, but implementation must tolerate user override.

Use:
- structured outputs / Zod-compatible output types,
- agents as tools for specialists,
- built-in tracing,
- tool guardrails.

Do not use conversational memory for incident facts. Facts live in the database/capsule and are reloaded deterministically.

OpenAI Agents tracing may remain enabled in server runtime unless test mode or privacy configuration disables it.

---

# 25. OPTIONAL LEMMA INTEGRATION

This is optional and must not block the MVP.

If Lemma's current public API/tracing onboarding can be integrated cheaply, create an adapter that exports agent traces for semantic-failure inspection.

Use case:
- detect if an agent claims "bug reproduced" despite deterministic fingerprint mismatch.

However:
- deterministic Recur code must already prevent this;
- Lemma is supplementary observability, not source of truth.

If integration requires substantial undocumented setup, omit it and document how it would fit.

Do not burn build time on this before core demo works.

---

# 26. TEST STRATEGY

## 26.1 Unit tests

Must cover:
- fingerprint normalization,
- fingerprint comparison,
- capsule schema validation,
- evidence sanitization,
- evidence deduplication,
- state-machine transitions,
- idempotency key generation,
- normalization of Stripe objects,
- flag provider normalization.

## 26.2 Integration tests

Use fixture adapters to test:
- buggy service fails with correct state,
- changing flag prevents target failure,
- changing prior refund state prevents target failure,
- fixed service succeeds,
- successful reproduction creates capsule,
- generated regression test behaves correctly.

## 26.3 External smoke tests

Only when credentials present:
- GitHub read,
- LaunchDarkly flag read,
- Arga Stripe twin read/write.

Never run dangerous live financial smoke tests.

---

# 27. README REQUIREMENTS

README opening:

```md
# Recur

**Capture the conditions. Recreate the bug. Prove the fix.**

Production failures often depend on external state that no longer exists by the time an engineer investigates. Recur reconstructs the minimal code, data, feature-flag, and SaaS state behind a failed request, recreates it in safe sandboxes, and emits a reusable Reproduction Capsule plus a regression test.
```

Then immediately include:

```text
✓ Cross-system evidence reconstruction
✓ Arga Stripe digital-twin support
✓ GitHub commit/source evidence
✓ LaunchDarkly feature-state capture
✓ OpenTelemetry trace evidence
✓ Deterministic failure fingerprints
✓ Multi-agent state reconstruction
✓ Regression test generation
✓ Adversarial evaluation suite
```

README sections:
1. Why Recur
2. 60-second architecture
3. Hero demo
4. Setup
5. Environment variables
6. Arga setup
7. Running locally
8. Seeding incident
9. Running reproduction
10. Running evals
11. Safety/privacy model
12. Architecture decisions
13. Limitations
14. Future roadmap

---

# 28. EXACT LOCAL COMMAND EXPERIENCE

Target commands:

```bash
pnpm install

cp .env.example .env

pnpm db:migrate
pnpm demo:reset
pnpm demo:seed

pnpm dev
```

Additional:

```bash
pnpm test
pnpm test:integration
pnpm evals
pnpm demo:seed:arga
pnpm lint
pnpm typecheck
```

`pnpm dev` should run the dashboard and demo service concurrently.

Use a lightweight workspace task runner only if needed; do not introduce Turborepo merely for branding.

---

# 29. ENVIRONMENT FILE

Create `.env.example` with:

```env
# OpenAI
OPENAI_API_KEY=
OPENAI_MODEL=

# App
DATABASE_URL=file:./recur.db
RECUR_DEMO_FORCE_TWO_ATTEMPTS=true

# Demo service
DEMO_SERVICE_URL=http://localhost:4001
DEMO_CODE_MODE=buggy

# GitHub
GITHUB_TOKEN=
GITHUB_OWNER=
GITHUB_REPO=
GITHUB_DEMO_COMMIT_SHA=

# LaunchDarkly
LAUNCHDARKLY_API_TOKEN=
LAUNCHDARKLY_SDK_KEY=
LAUNCHDARKLY_PROJECT_KEY=
LAUNCHDARKLY_ENVIRONMENT_KEY=production
LAUNCHDARKLY_REFUNDS_FLAG_KEY=refunds_v2

# Arga
ARGA_ENABLED=false
ARGA_API_KEY=
ARGA_STRIPE_BASE_URL=

# Stripe twin credentials only
STRIPE_SECRET_KEY=

# Optional
LEMMA_API_KEY=
```

Do not commit secrets.

---

# 30. IMPLEMENTATION ORDER

Follow this order.

## Phase 1 — Skeleton
- workspace
- web app
- demo service
- shared core schemas
- SQLite/Drizzle
- seed command

Acceptance:
- dashboard loads,
- demo service health check works,
- seeded incident appears.

## Phase 2 — Deterministic bug
- local Stripe fixture adapter
- local flag fixture
- buggy/fixed refund service
- failure fingerprint logic

Acceptance:
- hero bug reproducibly fails locally,
- fixed mode succeeds,
- comparator distinguishes them.

## Phase 3 — Telemetry/evidence
- OpenTelemetry
- custom evidence records
- incident seeding from real failed execution

Acceptance:
- incident page shows trace/evidence graph.

## Phase 4 — Reproduction engine
- state machine
- candidate provisioning
- replay runner
- fingerprint comparison
- attempt persistence

Acceptance:
- deterministic fixture plan reproduces bug.

## Phase 5 — AI reasoning
- Agents SDK
- EvidenceAnalyst
- StateReconstructor
- bounded tools
- 3-attempt cap

Acceptance:
- hero incident produces valid plan from evidence,
- forced first mismatch is corrected on second attempt.

## Phase 6 — Reproduction Capsule
- capsule persistence/export
- provenance
- UI page

Acceptance:
- capsule can rerun independently of the original incident page.

## Phase 7 — Regression generation
- RegressionAuthor
- schema validation
- test execution

Acceptance:
- generated test fails on buggy mode,
- passes on fixed mode.

## Phase 8 — GitHub
- live adapter + fixture fallback
- commit/source evidence

Acceptance:
- integration badge and evidence source work.

## Phase 9 — LaunchDarkly
- live provider + fixture fallback
- flag evidence

Acceptance:
- feature flag is one real causal dimension.

## Phase 10 — Arga Stripe twin
- base URL override
- seeding script
- safe replay

Acceptance:
- hero capsule can replay against an Arga Stripe twin when configured.

## Phase 11 — Eval suite
- 10 scenarios
- metrics
- ablation

Acceptance:
- false reproduction rate 0 in seeded suite.

## Phase 12 — Polish
- timeline
- graph
- projector-readable UI
- README
- demo reset
- final verification

Do not polish before Phase 7 works.

---

# 31. ACCEPTANCE TEST MATRIX

| Capability | Required |
|---|---|
| Seed deterministic production incident | Yes |
| Observe causal external reads | Yes |
| Git commit/source evidence | Yes |
| Feature flag evidence | Yes |
| Stripe external-state evidence | Yes |
| Multi-agent evidence analysis | Yes |
| Deterministic workflow state machine | Yes |
| Max 3 reproduction attempts | Yes |
| Safe failure if unresolved | Yes |
| Deterministic fingerprint match | Yes |
| Reproduction Capsule export | Yes |
| Regression test generation | Yes |
| Buggy test fails | Yes |
| Fixed test passes | Yes |
| Arga twin support | Yes |
| Arga required for local dev | No |
| LaunchDarkly required for local dev | No |
| GitHub required for local dev | No |
| Full production cloning | No |
| Kubernetes | No |
| Generic incident ingestion platform | No |
| Chat-first UI | No |

---

# 32. DEMO SCRIPT TO DESIGN AROUND

The application should make this narration visually natural.

### 0–15 sec

> "A customer hit this refund bug in production. We have the request and stack trace, but replaying the request locally doesn't reproduce it."

Show failure incident.

### 15–30 sec

> "That's because the request isn't the whole test case. The bug also depended on a partial refund in Stripe and a feature flag that was enabled at that moment."

Show evidence graph.

### 30–70 sec

Click **Reproduce**.

Timeline:
- inspect trace,
- retrieve code state,
- identify Stripe charge/refund,
- identify flag,
- build candidate,
- first replay mismatch if two-attempt demo enabled,
- refine,
- second replay.

### 70–85 sec

Huge:

```text
BUG REPRODUCED
98% fidelity
```

Say:

> "Recur didn't replay the request. It reconstructed the state that made the request fail."

### 85–105 sec

Show capsule:

```text
Commit
Request
DB fixtures
Stripe state
Feature flags
Expected failure
```

### 105–120 sec

Show generated regression test and **Verify Fix**.

Result:

```text
Original capsule: no longer fails
Regression test: PASS
```

Finish:

> **"Recur turns one-off production failures into reproducible test cases that humans and coding agents can actually fix."**

---

# 33. ADVERSARIAL JUDGE QUESTIONS THE PRODUCT MUST ANSWER

## "Isn't this request replay?"
Answer in README/UI architecture:
- request replay reproduces input,
- Recur reconstructs cross-system state.

## "Isn't this just Arga?"
- Arga provides safe service twins,
- Recur infers the state the twins must contain from a real failure.

## "Isn't this just Sentry?"
- observability records what happened,
- Recur converts observed evidence into executable reproduction state.

## "Why AI?"
- selecting relevant cross-system state and iteratively refining missing state is semantic/reasoning work;
- calculations, fingerprints, safety, and state transitions stay deterministic.

## "What if it cannot reproduce?"
- explicit `NOT_REPRODUCED` with unresolved dependency report;
- no hallucinated success.

## "How do you prove it's the same bug?"
- deterministic failure fingerprint, not HTTP status alone.

## "What about sensitive production data?"
- demo uses synthetic data;
- architecture preserves behaviorally relevant structure and redacts identity/secrets;
- does not clone arbitrary production.

## "Does this work for every bug?"
- no;
- MVP targets application failures dependent on external SaaS/config/data state.

---

# 34. FUTURE ROADMAP — DO NOT IMPLEMENT

Document only:

1. Sentry/Datadog incident ingestion.
2. More Arga twins: Slack, GitHub, Notion, Google services.
3. Postgres minimal fixture extraction from query traces.
4. Event ordering / webhook reproduction.
5. Snapshotting API versions.
6. Coding-agent integration:
   - reproduce,
   - generate fix,
   - replay capsule,
   - verify regression,
   - open PR.
7. CI integration:
   - every fixed production incident becomes a permanent capsule test.
8. Team capsule library.
9. Privacy policy engine for structural state transformation.

Do not build these during hackathon.

---

# 35. OFFICIAL DOCUMENTATION REFERENCES

When an API shape differs from assumptions in this spec, consult the official source and adapt the adapter without changing product behavior.

## OpenAI Agents SDK
- https://openai.github.io/openai-agents-js/
- https://openai.github.io/openai-agents-js/guides/multi-agent/
- https://openai.github.io/openai-agents-js/guides/guardrails/
- https://openai.github.io/openai-agents-js/guides/tracing/
- https://openai.github.io/openai-agents-js/guides/human-in-the-loop/

## Arga
- https://docs.argalabs.com/
- https://docs.argalabs.com/quickstart
- https://docs.argalabs.com/cli-and-mcp
- https://docs.argalabs.com/features/twins-quickstart
- https://docs.argalabs.com/concepts/digital-twins
- https://docs.argalabs.com/api-reference
- https://docs.argalabs.com/plans

Important current constraints to preserve:
- Arga CLI supports digital twin workflows.
- Free plan currently supports 10 test-runner runs/month and 1 twin per run.
- Quickstart keys may have limited provisions.
- Stripe is a supported twin.
- Use only one Arga twin in the public-free-tier design.

## LaunchDarkly
- https://launchdarkly.com/docs/guides/api/rest-api
- https://launchdarkly.com/docs/api/feature-flags/get-feature-flag
- https://launchdarkly.com/docs/home/infrastructure/api

Important:
- use SDKs for runtime flag evaluation;
- use REST API for management/inspection.

## OpenTelemetry JS
- https://opentelemetry.io/docs/languages/js/instrumentation/
- https://opentelemetry.io/docs/languages/js/libraries/

## GitHub REST API
- https://docs.github.com/en/rest/repos/contents
- https://docs.github.com/en/rest/pulls
- https://docs.github.com/en/rest/git/commits

## Stripe
- https://docs.stripe.com/api/refunds/create

---

# 36. CODING-AGENT TOOL POLICY

While implementing:

## Use shell for
- project scaffolding,
- package installation,
- migrations,
- tests,
- typecheck,
- lint,
- local server launch.

## Use official documentation lookup only when
- an API signature has changed,
- Arga twin provisioning details need current confirmation,
- LaunchDarkly SDK initialization needs exact current syntax,
- OpenAI Agents SDK exact TypeScript signatures need confirmation.

Do not browse for alternative stacks.

## Use browser automation / visual verification if available
After the dashboard is functional:
1. launch app,
2. open home page,
3. verify no console errors,
4. execute hero flow,
5. visually verify incident page, timeline, reproduced state, capsule page,
6. verify mobile responsiveness only enough to avoid broken layout.

## Use GitHub tooling if connected
Only for:
- current repository operations,
- creating branch/commit if explicitly desired,
- checking source state.
Do not require connected GitHub tooling for local build.

---

# 37. CODE QUALITY RULES

- TypeScript `strict: true`.
- No `any` except at unavoidable external boundaries; normalize immediately.
- No API keys exposed to browser.
- Server-only external adapters.
- Zod on all external/agent input-output boundaries.
- Functional core where practical.
- Side effects isolated in adapters.
- Core package must not import provider SDKs.
- Integration provider objects must be normalized.
- All money represented in integer smallest currency units.
- All timestamps ISO-8601.
- IDs treated as opaque strings.
- Never log secrets.
- External writes carry idempotency keys where supported.
- Runtime agent cannot directly issue provider writes.
- Every reproduction claim is backed by deterministic comparator.
- Every UI "LIVE" badge must be truthful.

---

# 38. STOP CONDITIONS

Do not keep expanding the project once these are true:

- hero bug reproducible,
- evidence graph works,
- 2-attempt demo works,
- capsule generated,
- regression test generated,
- fix verified,
- GitHub adapter works,
- LaunchDarkly adapter works or is ready with credentials,
- Arga Stripe adapter works or is ready with credentials,
- 10 eval scenarios execute,
- README complete,
- no major UI errors.

At that point, spend remaining effort only on:
- demo reliability,
- startup/reset scripts,
- loading/error states,
- visual clarity,
- fixing flaky tests.

---

# 39. FINAL BUILD STANDARD

The project should leave a technical judge with the following mental model:

```text
Sentry/OTel tells me what happened.
Arga gives me a safe external environment.
Recur determines the smallest cross-system state that must be reconstructed
for the exact production failure to happen again.
```

The judge should be able to see that:
- AI is used where semantic reasoning is needed,
- deterministic code controls correctness,
- the system is multi-app by necessity rather than decoration,
- organizer infrastructure is used naturally,
- reproduction can be objectively evaluated,
- failure is safe,
- the MVP is technically plausible.

Do not substitute a polished fake animation for the actual reconstruction/replay logic.

The central product truth must remain:

> **Recur converts a production failure into an executable, evidence-backed Reproduction Capsule.**
