# Recur

**Capture the conditions. Recreate the bug. Prove the fix.**

Production failures often depend on external state that no longer exists by the time an engineer investigates. Recur reconstructs the minimal code, data, feature-flag, and SaaS state behind a failed request, recreates it in safe sandboxes, and emits a reusable Reproduction Capsule plus a regression test.

- ✓ Cross-system evidence reconstruction
- ✓ Arga Stripe digital-twin adapter (credential smoke test pending)
- ✓ GitHub commit/source evidence adapter and local source fallback
- ✓ LaunchDarkly feature-state capture adapter and frozen fixture flags
- ✓ OpenTelemetry trace evidence
- ✓ Deterministic failure fingerprints
- ✓ OpenAI Agents SDK manager/specialists with deterministic demo fallback
- ✓ Regression test generation and actual buggy/fixed Vitest execution
- ✓ Adversarial evaluation suite

## Why Recur

Replay tools replay the request. Recur reconstructs the state that made the request fail. Observability records the failure; Recur makes its causal conditions executable. Arga supplies a safe external environment; Recur selects and reconstructs the state in it.

## 60-second architecture

```text
Next.js dashboard → persisted incident + sanitized evidence
                 → bounded evidence analyst / state reconstructor
                 → deterministic state machine (maximum three attempts)
                 → fresh SQLite DB + Stripe fixture / Arga twin objects
                 → actual refund-service execution + OTel spans
                 → deterministic fingerprint comparator
                 → portable capsule → generated Vitest → fix verification
```

Runtime agents have no shell or financial write tools. Only the deterministic workflow provisions and replays. The local demo uses deterministic evidence selection; supplying OpenAI credentials enables the Agents SDK specialists. All reproduction decisions remain deterministic.

## Hero demo

A $100 charge already has a $40 refund. With `refunds_v2=true`, buggy code throws `InvalidRefundStateError` instead of refunding the remaining $60. A fully refunded charge gets a distinct `AlreadyRefundedError` before that branch.

1. Open <http://localhost:3000>.
2. Leave **Two-attempt teaching mode** enabled and click **Reproduce failure**.
3. Inspect the mismatch with the flag disabled, then the successful reconstruction with the observed flag restored.
4. Open **View capsule** and export its JSON.
5. Click **Verify fix**: fresh state is reconstructed, exactly one $60 refund is created, and the generated regression is executed against buggy and fixed implementations.
6. Click **Run ablation**: removing the flag, prior refund, buggy code, or refund-request row prevents the target failure.
7. Open **Evaluations** to execute ten adversarial scenarios.

The fixture demo requires no accounts or API keys. Replays run immediately; the timeline displays persisted execution events rather than timed animation.

## Setup

Node.js 20+ and pnpm 10 are required. This workspace was built on Node 25.9.0. Dependencies are locked in `pnpm-lock.yaml`.

```bash
cd /home/anj/recur
pnpm install
cp .env.example .env # only on a fresh checkout; preserve an existing .env
pnpm db:migrate
pnpm demo:reset
pnpm demo:seed
pnpm dev
```

Dashboard: <http://localhost:3000>. Demo HTTP service: <http://localhost:4001/health>. Both bind to loopback. Stop both with Ctrl+C. The checked-in build uses Next.js's supported Webpack compiler because this workstation restricted Turbopack's child-process socket.

**This workspace is already installed and seeded.** For account configuration and exact steps see [Your setup guide](docs/YOUR_SETUP.md).

## Environment variables

All credentials are server-only. `.env`, databases, and generated artifacts are ignored by Git. Do not paste keys into chat or commit them.

| Variables                                                                        | Purpose                                                                           |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`, `OPENAI_MODEL`                                                 | Enable live Agents SDK analysis; both required for live mode                      |
| `DATABASE_URL`                                                                   | Local SQLite URL; default `file:./recur.db`                                       |
| `RECUR_DEMO_FORCE_TWO_ATTEMPTS`                                                  | Teaching-mode default; UI can override                                            |
| `DEMO_CODE_MODE`                                                                 | HTTP demo service's `buggy` or `fixed` implementation                             |
| `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_DEMO_COMMIT_SHA`, optional `GITHUB_TOKEN` | Fetch commit and source at a specific GitHub ref                                  |
| `LAUNCHDARKLY_SDK_KEY`                                                           | Capture runtime flag evaluation when seeding                                      |
| `LAUNCHDARKLY_API_TOKEN`, `LAUNCHDARKLY_PROJECT_KEY`                             | Optional management metadata inspection                                           |
| `LAUNCHDARKLY_ENVIRONMENT_KEY`, `LAUNCHDARKLY_REFUNDS_FLAG_KEY`                  | Environment metadata and canonical flag name                                      |
| `ARGA_ENABLED`, `ARGA_STRIPE_BASE_URL`, `STRIPE_SECRET_KEY`                      | Enable safe twin reconstruction; synthetic `sk_test_` key only                    |
| `ARGA_API_KEY`                                                                   | Reserved for Arga CLI/control-plane setup; never sent to the Stripe data endpoint |

A configured live provider that fails returns an explicit error; it never silently earns a live badge. Historical LaunchDarkly values are frozen in the capsule, so replay does not consult today's flag state.

## Arga setup

Follow [Arga's twin quickstart](https://docs.argalabs.com/features/twins-quickstart). Create one disposable Stripe twin and supply its direct Stripe-compatible origin. Stripe twin resources start empty and accept synthetic `sk_test_` credentials. Recur seeds via Stripe-compatible customer, charge, and refund calls, and verifies the result with a read.

```bash
uv tool install arga-cli
arga login
arga whoami
arga wizard
```

Select only Stripe. Set the endpoint and test key in `.env`, then:

```bash
pnpm demo:seed:arga
pnpm demo:reset
pnpm demo:seed
pnpm dev
```

`demo:seed:arga` prints synthetic object IDs and writes `artifacts/arga-mapping.json`. Each replay creates fresh objects inside the same twin with unique idempotency keys. Recur does not provision paid Arga compute itself. The URL guard accepts loopback origins or HTTPS subdomains of `argalabs.com` / `arga.run`; other endpoint patterns need explicit adapter review, not a disabled safety guard. No credentialed twin smoke test has been performed in this checkout.

## Running locally and seeding

The seed invokes the actual refund function, captures its thrown stack and OTel spans, and persists the incident in SQLite through Drizzle. The Express endpoint delegates to that same function. Each replay reconstructs DB fixtures in a fresh in-memory SQLite database.

```bash
curl -X POST http://localhost:4001/api/refunds/remaining \
  -H 'Content-Type: application/json' \
  -d '{"customerId":"cust_demo_001","chargeId":"ch_demo_001"}'
```

Buggy mode returns HTTP 500 and the target error. Set `DEMO_CODE_MODE=fixed` and restart for HTTP 200. Requests to the standalone demo use fresh state; this endpoint is a demonstration, not a persistent payment API.

`pnpm demo:seed` is idempotent. `pnpm demo:reset` clears local demo records; it does not delete remote twin objects. The dashboard Reset button clears and reseeds local records. Stop the server before running CLI reset commands.

## Running reproduction and regression

Use the dashboard or `POST /api/incidents/inc_refund_001/reproduce` with `{"teaching":true}`. Poll the incident/events endpoints for completion. The server persists attempts and events before claiming success.

Export a capsule and replay it on another checkout of this code:

```bash
pnpm capsule:replay ./path/to/capsule.json
pnpm capsule:replay ./path/to/capsule.json fixed
```

CLI capsule replay always uses local simulation. The generated Vitest file lives in `artifacts/regression/` and uses real, checked-in fixture helpers. Execution is permitted only after the generated text matches the deterministic allowed template and passes TypeScript parsing. JSON test reports verify the buggy assertion failure and fixed pass. The artifact can be saved at the same relative path in another checkout.

## Tests and evals

```bash
pnpm test
pnpm test:integration
pnpm evals
pnpm typecheck
pnpm lint
pnpm build
```

Evals always use local fixtures even if live credentials exist. Reports are written to `artifacts/evals.json`. Missing Stripe/flag evidence fails closed. Changing the charge from $100 to $120 while retaining a partial refund still triggers the same buggy branch, so that scenario is correctly a behavioral match; a fingerprint cannot claim numeric-state identity. Fully refunded state triggers a different failure.

## Safety and privacy

- All demo identities are synthetic. Secret/identity fields are recursively redacted before evidence persistence.
- All financial writes go to fixture memory or a guarded twin origin. Live Stripe keys and production hosts are rejected.
- Capsule input, provider normalization, and agent output use Zod. Provider SDKs never enter the core package.
- Amounts use integer cents. Inconsistent charge/refund totals are rejected.
- Every attempt gets fresh state. Repeated adapter writes use an idempotency key and reject amount conflicts.
- Agent outputs cannot change observed state, expected fingerprints, or the three-attempt cap.
- This local application has no authentication platform. Do not expose it publicly without adding authentication, request limits, and a durable background runner.

## Architecture decisions

- Small pnpm workspace; Next.js dashboard and Express demo service, no distributed queue.
- SQLite/Drizzle for zero-account local persistence; JSON-heavy records remain schema-validated at boundaries.
- OTel in-process exporter captures spans from the same service used by replay.
- Agents SDK specialists are tools of a coordinator; bounded structured proposals pass deterministic validation. Fixture analysis supports an offline demo.
- Fingerprint matching requires error class, message, route, status, file/function, required spans, and expected side effects. Line numbers and absolute path prefixes are ignored. Failure equality never depends on a model.
- The numeric fidelity score is computed, not hardcoded to the illustrative 98% in the spec.

## Limitations

The MVP targets the one specified refund bug. GitHub commit/source is evidence: replay uses bundled buggy/fixed functions and **does not check out and execute arbitrary commits**. The local Git SHA identifies the checkout used for capture. Live GitHub source must refer to this same implementation for meaningful provenance.

LaunchDarkly and Arga adapters are implemented but await your credentials and external smoke tests. OpenAI specialists compile against the installed SDK but have not been exercised with a paid model. Regression code generation is intentionally constrained to a validated template. There is no generic dynamic dependency inference, production ingestion, or arbitrary environment cloning.

Workflow jobs run in the local Next.js process. Events persist, but a process crash interrupts active work; restart and retry the reproduction. Serverless deployment is not configured: local SQLite and Vitest subprocesses require a persistent Node environment. Saved artifacts and twin objects are not automatically garbage-collected.

## Future roadmap (not implemented)

Sentry/Datadog ingestion; additional SaaS twins; minimal Postgres fixture extraction; webhook ordering; provider API snapshots; coding-agent fix/PR integration; CI capsule regression gates; team libraries; structural privacy policies. Lemma could inspect reasoning traces, but deterministic comparison already prevents fabricated reproduction claims.
