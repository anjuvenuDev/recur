# Verification record — September 13, 2026

[Machine-readable validation summary](validation.json)

## What these results establish

The local path executes the real refund service, SQLite persistence, worker processes, browser application, and generated Vitest tests. Provider contract tests use controlled responses; Agents SDK tests use a scripted model through the actual SDK. **These results do not establish live model quality, credential validity, or external-provider reliability.**

| Check                  | Observed result                                                         | Scope                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Local validation gate  | Passed                                                                  | Format, strict TypeScript, unit/integration coverage, evals, restart, production build                  |
| Unit/integration suite | 40 tests passed                                                         | Fingerprints, integrity, money, SDK orchestration, provider contracts, jobs, access control, contention |
| Named evals            | 10/10 correct; 0 false matches in 6 negative cases; 2 safely unresolved | Synthetic refund scenarios                                                                              |
| Seeded state sweep     | 200/200 passed; 0 false matches among 100 negative cases                | Amount and branch variation; exact financial postconditions                                             |
| Worker restart checks  | 3 passed                                                                | Queued work persists, attempts/capsule survive, expired job is interrupted without replay               |
| Browser suite          | 3/3 passed on the hardened worker                                       | Real UI/API/queue/DB flow, reload persistence, origins/idempotency, 390px layout                        |
| Production build       | Passed on host and Node 22 container                                    | Next.js Webpack production compilation                                                                  |
| Container acceptance   | Passed on Node v22.23.2 after native config-loader fix                  | Anonymous 401; authenticated worker ready; two attempts; persisted fix; actual regression valid         |
| Demo recording         | 120 seconds, 1920×1080 H.264, captioned                                 | Actual local fixture workflow; no live-provider claim                                                   |

The 200-case sweep uses seed `20260913`. Its zero-failure one-sided 95% binomial upper bound is approximately 2.95% **conditional on the sampled synthetic scenarios**. This is not a production incident-rate estimate. Timing varies with the machine and instrumentation load.

Measured backend coverage: **83.45% statements, 84.29% lines, 85.80% functions, 74.80% branches**.

## Bugs caught during validation

1. **Concurrent fixture refunds:** an asynchronous gap could admit duplicate writes. The mutation now completes before yielding and repeated keys are checked against their original amount.
2. **Source drift and modified capsules:** source-file SHA-256 and canonical capsule integrity are verified before execution.
3. **Process-local jobs:** replaced with a persistent queue, leases, explicit interruption, and transactional fencing of entity writes.
4. **SQLite contention under dashboard polling:** native lock waits could block a writer in the same event loop. Access is serialized per file within a process, with WAL and bounded lock handling across processes. Four independent clients now complete 120 concurrent write/read cycles without data loss.
5. **Regression report compatibility:** validity now requires a single actual test result, the expected buggy assertion failure, and a fixed pass, rather than exit status alone.
6. **Read-only container filesystem:** Vitest's bundled config loader attempted a temporary write beside application code. A native `.mjs` configuration and writable artifact cache pass the same proof under a non-root container user.

## Reproduce the checks

```bash
pnpm validate
pnpm exec playwright install chromium
pnpm test:e2e
```

Coverage thresholds are enforced at 80% statements, lines, and functions, and 70% branches across the configured backend source scope. Coverage is not an assertion that every live path is exercised. Browser and worker subprocess coverage is separate from the unit coverage report.

Reports are generated under `artifacts/`, `coverage/`, and `playwright-report/`. The GitHub Actions workflow uploads those outputs. A configured workflow is not a claim that GitHub-hosted CI has already run; the repository still needs a remote and push.

## Live acceptance remains required

Configure accounts using [YOUR_SETUP.md](YOUR_SETUP.md), then run:

```bash
pnpm run doctor
pnpm test:live
```

This acceptance path refuses incomplete core configuration, captures GitHub and LaunchDarkly evidence, invokes the actual OpenAI specialists, reconstructs in Arga, and verifies the fix and generated test. Inspect Userlens/Lemma delivery receipts separately. No live model requests, paid Arga provisioning, or external analytics delivery were used to obtain the local results above.
