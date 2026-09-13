# Your setup and testing steps

## Ready now: no account setup needed

The repository is at `/home/anj/recur`. Node was already installed. pnpm, dependencies, SQLite schema, synthetic incident, Arga CLI, and browser-testing dependencies have been set up locally. `.env` already exists with empty credentials and local simulation enabled.

```bash
cd /home/anj/recur
pnpm dev
```

Open <http://localhost:3000>. If the server is already running, just open the URL. The demo HTTP service is at <http://localhost:4001/health>.

1. Click **Reproduce failure** with teaching mode checked.
2. Confirm attempt 1 returns 200 and mismatches; attempt 2 returns the target 500 and shows **BUG REPRODUCED**.
3. Click **View capsule**, then **Export JSON**. Click **Generate regression test** to see the actual test and validation results.
4. Return to the incident and click **Verify fix**. Confirm the old failure is absent, the fixed response is 200, and the generated test reports buggy FAIL / fixed PASS.
5. Click **Run ablation**. All four cases should show **NO TARGET FAILURE**.
6. Open **Evaluations**. All ten scenario expectations should pass, with zero false reproductions and two safe unresolved cases.
7. Reset through **Reset demo** to prepare the judge presentation again.

For command-line validation:

```bash
pnpm test
pnpm evals
pnpm typecheck
pnpm lint
pnpm build
```

## Optional: enable actual OpenAI specialists

You need an OpenAI Platform account, an API project with billing/credits, and access to a model supporting function tools and structured output. A ChatGPT subscription does not configure this project's API credentials.

1. Open [OpenAI Platform](https://platform.openai.com/) and select or create your API project.
2. Configure billing/credits for that project if needed.
3. Create a project API key from the project's API keys page.
4. Open `/home/anj/recur/.env` in your editor. Set `OPENAI_API_KEY` locally. Do not paste the key into chat.
5. Set `OPENAI_MODEL` to a model ID available to that API project. The app deliberately has no hardcoded model default.
6. Restart `pnpm dev`. Reproduce the incident again. The timeline reports connected analysis after a real successful model call; a successful capsule records the model ID.
7. If the model is unavailable, the run fails safely with an explicit event. Clear the key to return to deterministic demo mode.

Live model requests incur your API usage charges. I have not made a live model request or created an API key for you. Credential creation/reuse stays under your control.

## Optional: GitHub remote and live source evidence

A local Git repository is created. GitHub CLI is not installed and the connected GitHub toolset has no repository-creation operation, so there is no hosted GitHub repository yet.

1. Sign in to GitHub and create an **empty private repository** named `recur`. Do not initialize it with a README, license, or gitignore.
2. In your terminal, run (replace `YOUR_USERNAME`):

```bash
cd /home/anj/recur
git remote add origin https://github.com/YOUR_USERNAME/recur.git
git push -u origin main
git rev-parse HEAD
```

3. Set `GITHUB_OWNER=YOUR_USERNAME`, `GITHUB_REPO=recur`, and `GITHUB_DEMO_COMMIT_SHA` to that full SHA in `.env`.
4. For a private repo, create a fine-grained token limited to this repository with **Contents: Read-only**. Put it in `GITHUB_TOKEN`. A public repo can use unauthenticated reads subject to GitHub rate limits.
5. Stop the app. Run `pnpm demo:reset`, `pnpm demo:seed`, then `pnpm dev`.
6. Confirm **GitHub LIVE** and open the source excerpt. The source file must be `apps/demo-service/src/services/refund-service.ts` at the selected SHA.

GitHub is a source-evidence integration. The MVP replays its bundled functions; it does not run arbitrary remote repositories.

## Optional: LaunchDarkly feature-state capture

1. Create/sign in to a LaunchDarkly account and create a project/environment for this synthetic demo.
2. Create a **boolean** flag with the exact key `refunds_v2`.
3. Turn targeting on and serve **true** for the synthetic context key `cust_demo_001` (or use true as the default variation in this demo environment).
4. Copy the environment's **server-side SDK key** into `LAUNCHDARKLY_SDK_KEY` in `.env`. This is not the client-side ID or REST token.
5. Set `LAUNCHDARKLY_PROJECT_KEY` and `LAUNCHDARKLY_ENVIRONMENT_KEY` for your environment. Leave `LAUNCHDARKLY_REFUNDS_FLAG_KEY=refunds_v2`.
6. Optionally create a read-only REST API access token and put it in `LAUNCHDARKLY_API_TOKEN` for metadata inspection; runtime evaluation uses the SDK.
7. Stop the app, reset and reseed, then restart. The seed must fail with the target error; if the flag is false or cannot evaluate, seeding reports a failure.
8. Confirm **LaunchDarkly LIVE CAPTURE**. The capsule freezes the captured value; changing the live flag later must not change that reproduction.

Official reference: [LaunchDarkly server-side Node SDK](https://launchdarkly.com/docs/sdk/server-side/node-js).

## Optional: Arga Stripe digital twin

This is the account-dependent step needed for the judged Arga integration. Local tests do not require it.

1. The Arga CLI is already installed at `~/.local/bin/arga` in this workspace. Complete account login and twin creation in your terminal:

```bash
arga login
arga whoami
arga wizard
```

On another machine, install with `uv tool install arga-cli` first. Complete browser login yourself; I have not created an account or provisioned paid resources.

2. Create a disposable run with **one Stripe twin**. Obtain the twin's direct Stripe-compatible API origin. The dashboard URL is not necessarily the API origin.
3. Set these values in `.env`:

```dotenv
ARGA_ENABLED=true
ARGA_STRIPE_BASE_URL=https://YOUR-TWIN-API-ORIGIN
STRIPE_SECRET_KEY=sk_test_recur_twin
```

Use a synthetic twin key, never a real Stripe live secret. Arga documents that Stripe twins accept `sk_test_` prefixes. Keep Arga's control-plane API key in the CLI's credential store or `ARGA_API_KEY` if needed; the Stripe SDK does not send that key.

4. Run `pnpm demo:seed:arga`. It creates a synthetic customer, a $100 charge, and a $40 partial refund, then reads back and checks the amounts. It prints object IDs and saves a mapping to `artifacts/arga-mapping.json`.
5. Stop the app, reset/reseed, and restart. Reproduce the incident. The timeline and successful capsule must say **ARGA TWIN** and `argaTwinUsed: true`.
6. Open the twin's own dashboard. Verify the reconstructed charge/refund objects. Click **Verify fix** in Recur and inspect its fresh twin objects: $40 prior refund plus one $60 refund.
7. When finished, stop/delete the run in Arga to release its resources. Recur creates fresh objects inside the one twin for each attempt and does not auto-delete the run.

The adapter accepts loopback origins and HTTPS Arga domains (`*.argalabs.com`, `*.arga.run`). If your assigned endpoint uses another hostname or a path prefix, share only the public endpoint shape so the adapter can be reviewed. Do not bypass the host guard or substitute `api.stripe.com`.

Official reference: [Arga twins quickstart](https://docs.argalabs.com/features/twins-quickstart). Provisioning details and account quotas are controlled by Arga; no quota assumptions are needed for the local demo.

## What still requires live verification

The local system and adapter contracts are testable now. OpenAI model access, GitHub authentication, LaunchDarkly evaluation, and an actual Arga twin require your accounts. After adding credentials, run the steps above one integration at a time. Do not present fixture badges as live integration proof.

Deployment is intentionally local for this first build. SQLite persistence and spawned Vitest runs need a persistent Node process; publishing the dashboard on Vercel would require adapting those two parts and adding access control.
