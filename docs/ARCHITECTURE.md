# Architecture and operations

## Execution boundary

Recur implements one complete remaining-refund failure. The seed runs the real TypeScript service and captures its stack, reads, response, and OpenTelemetry spans. Reconstruction creates fresh in-memory SQLite fixtures and a fresh Stripe adapter or new objects inside one Arga twin. The original request is executed through the same service.

The OpenAI Agents SDK coordinator uses three specialists as tools. EvidenceAnalyst chooses observed IDs and causal explanations. StateReconstructor proposes bounded state fields checked against observations. RegressionAuthor selects required assertions; trusted code compiles the test. The coordinator is required to invoke the specialist. Calls have turn limits and timeouts; analysis/reconstruction allow one bounded retry. Invalid live output fails the run; it is never silently replaced with fixture success.

The application determines reproduction using critical fingerprint fields, supporting spans, and side effects. Absolute path prefixes and line numbers are normalized. Numeric fidelity describes behavior, not exact numerical-state equivalence. Four ablations establish the importance of selected components within this scenario, not a universal causal proof.

## Persistence and concurrency

SQLite stores incidents, evidence, attempts, capsules, events, fix verifications, integration receipts, and jobs. WAL permits concurrent reads. Bounded retry applies only to `SQLITE_BUSY` lock acquisition, never to arbitrary errors or provider calls. Entity records are validated at their boundaries; table names are internal constants.

POST requests enqueue work and return 202. A unique idempotency key binds kind, incident, and input hash. An active per-incident job excludes conflicting work; reset/eval jobs hold a global exclusion. The worker claims jobs atomically, uses a 15-second lease, and pulses every four seconds. Each job runs in a separate process with a three-minute deadline. Entity writes check the same job lease inside their write transaction, so stale ownership cannot publish a success artifact.

Expired jobs become `interrupted`, never automatically queued again. The UI retains events and financial evidence for inspection before an explicit new request. Queued work survives restarts. `/api/ready` requires a worker pulse within 12 seconds. The process supervisor stops all services if a child exits.

This is a single-host design. SQLite plus local subprocesses is intentionally simpler than a distributed queue. It is not an exactly-once distributed payment system. A provider may accept a request immediately before a process dies; automatic re-execution would be unsafe. The explicit interrupted state preserves that uncertainty.

## External state

GitHub reads are restricted to the allowlisted refund-service file. The full file digest must equal the executing checkout's file. A capsule checks both canonical JSON SHA-256 and that source digest before replay. The digest does not authenticate authorship and does not cover the entire dependency graph.

LaunchDarkly evaluates the flag during capture; historical replay uses its frozen observed value. SDK evaluation errors fail capture. Arga creates one Stripe twin through the documented control plane. Each attempt creates fresh customer/charge/refund objects with idempotency keys; amounts are read back. Expiry stops further use. Real Stripe hosts and live keys are rejected. Twin runtime configuration is private in `.recur/twin.json`.

Userlens receives synthetic outcome events only after deterministic success. A receipt is written before delivery; ambiguous transport outcomes are not retried automatically because the endpoint does not document idempotency. Lemma receives sanitized Agents SDK inputs and trace events. A successful trace transport is reported separately from the correctness of the run.

## Operations

For a persistent local deployment:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm demo:seed
pnpm build
pnpm start
```

`pnpm dev` uses the development server; `pnpm start` uses the built production server. Both start the worker and demo service. Default web binding is loopback. To bind another interface, set `WEB_HOST` and a `RECUR_ACCESS_TOKEN` of at least 24 characters. The HTTP boundary requires that token whenever configured, including loopback. Browser Basic authentication accepts any username and the token as password; API Bearer authentication uses the same token. Use TLS and a reverse proxy for shared access. This shared token is not user-level authorization or tenant isolation.

Container startup:

```bash
# Set RECUR_ACCESS_TOKEN in your local .env first; do not use an example token.
docker compose up --build -d
docker compose exec recur pnpm db:migrate
docker compose exec recur pnpm demo:seed
```

Open localhost:3000 and enter the token when prompted. Named volumes preserve DB and artifacts. Compose binds the published port to host loopback. To use live accounts, explicitly pass the required server-side environment variables and twin configuration to the container. They are not baked into the image.

Back up the DB using SQLite's backup mechanism, or stop the services and copy the DB along with any WAL/SHM files. Retain capsule JSON and generated regression artifacts with the source checkout. Do not copy a live DB file alone and assume its latest WAL changes are present.

CLI reset clears the local demo DB; stop the server first. The dashboard reset uses the queue's global exclusion and reseeds. Reset does not tear down Arga or remove its objects. `pnpm arga:teardown` explicitly requests cleanup of the saved run.

## Non-goals and next steps

Generic production ingestion, arbitrary source checkout/execution, a multi-tenant authorization model, scalable distributed scheduling, encrypted evidence retention, and automated patch authoring are not implemented. Before real production ingestion, define a data-specific redaction policy, retention controls, tenant boundaries, and adversarial live-model evaluation. The current demo uses synthetic identities and one bounded source file.
