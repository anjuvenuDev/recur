# Build checklist

- [x] Phase 1 — Workspace, Next.js, Express, Zod, SQLite/Drizzle, seed
- [x] Phase 2 — Buggy/fixed service, isolated Stripe and flag fixtures, strict comparator
- [x] Phase 3 — OTel spans, sanitized records, actual execution seed, evidence graph
- [x] Phase 4 — Persisted state machine, replay, mismatch refinement, three-attempt cap
- [x] Phase 5 — Agents SDK coordinator and specialists, bounded outputs, fixture fallback
- [x] Phase 6 — Capsule persistence, provenance, JSON export, independent replay CLI
- [x] Phase 7 — Regression author, bounded template, TypeScript parsing, buggy/fixed Vitest execution
- [x] Phase 8 — GitHub commit/source adapter and local fixture evidence
- [x] Phase 9 — LaunchDarkly SDK/inspection adapter and frozen captured flag provider
- [x] Phase 10 — Guarded Stripe twin origin, seeding, verification, object mapping, idempotent writes
- [x] Phase 11 — Ten eval scenarios, metrics, four ablations, regression validation
- [x] Phase 12 — Dashboard, timeline, capsule views, reset, README and user setup guide

## Credential-dependent verification remains

- [ ] Run the OpenAI specialists against an accessible model
- [ ] Fetch this repo's commit/source using a GitHub remote
- [ ] Capture a real LaunchDarkly SDK evaluation
- [ ] Seed and replay against a provisioned Arga Stripe twin

These are untested external paths, not evidence of live integration. Local-mode behavior is executable without them.

## Deliberate scope limits

- Bundled buggy/fixed implementations; no arbitrary commit checkout/execution.
- No production ingestion, multi-tenant authentication platform, or generic environment cloning. Shared-token authentication and a persistent container layout are implemented.
- Constrained regression templates; no untrusted generated code execution.
- Durable job leases and transactional entity-write fencing; interrupted runs require inspection and an explicit new request.

## Hardening and presentation

- [x] Durable queue, idempotency, global exclusion, restart recovery, deadlines
- [x] Capsule integrity and source hashes; unsafe artifact IDs rejected
- [x] WAL, process-local access serialization, and contention tests
- [x] Authentication, origin validation, bounded strict JSON
- [x] Actual Agents SDK tests with scripted model and rejected invalid proposals
- [x] Arga lifecycle and Userlens REST contracts; Lemma trace processor
- [x] Browser suite, seeded financial-state sweep, coverage gates, CI workflow
- [x] Production build and authenticated Node 22 container acceptance
- [x] Professional README, architecture graphic, actual screenshot, captioned two-minute demo
- [ ] Hosted GitHub repository and pushed CI run
- [ ] Credentialed live acceptance and final connected demo take
