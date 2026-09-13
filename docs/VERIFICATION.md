# Local verification — 2026-09-13

- `pnpm test`: 12 tests pass, including the real service, capsule schema, critical fingerprint mismatch cases, privacy redaction, deduplication, idempotent refunds, safety guards, two-attempt refinement, three-attempt termination, regression execution, and ablations.
- `pnpm evals`: 10/10 scenario expectations correct; zero false reproductions; two safe unresolved cases. The hero teaching workflow uses two attempts. Its evidence precision, four-case ablation sensitivity, and generated regression validity are 100%.
- `pnpm typecheck`: passes with strict TypeScript.
- `pnpm lint`: formatting check passes.
- `pnpm build`: optimized Next.js production build passes using Webpack.
- Independent exported capsule replay: buggy mode returns HTTP 500 with the matching fingerprint; fixed mode returns HTTP 200 and a single 6000-cent refund, with two refunds totaling 10000 cents.

Browser checks exercised the real localhost dashboard:

1. Seeded incident and original evidence load.
2. Reproduce executes the two-attempt path and displays BUG REPRODUCED.
3. Verify fix displays REGRESSION PASSES and FIX VERIFIED.
4. All four ablations display NO TARGET FAILURE.
5. Capsule summary, export control, regression generation and validation work.
6. Evaluation page displays the scenario results.
7. No browser JavaScript errors were reported.
8. Desktop layout inspected visually; mobile at 390px has a 390px document width and no horizontal overflow.

Screenshots and generated test/evaluation artifacts are under ignored `artifacts/`. The local database is also ignored. External credentialed smoke tests remain pending; see YOUR_SETUP.md. A successful build does not imply these external integrations have been exercised.
