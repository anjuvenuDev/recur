# Three-hour implementation priorities

1. Correctness and provenance: source hashes, immutable target fingerprint, evidence consistency, capsule integrity, honest outcome records.
2. Durable execution: persisted jobs, atomic leases, concurrent-request exclusion, explicit crash recovery, bounded work, no financial retry after an unknown outcome.
3. Security: local-only defaults, authentication for shared deployment, origin/body/ID validation, redaction, least-privilege provider clients.
4. Useful integrations: actual Arga lifecycle and proof, Lemma trace integration, Userlens verified recovery events with delivery records. Never claim connection from credentials alone.
5. Enforced validation: automated HTTP/browser flows, contract/fault/concurrency tests, repeated seeded evals, coverage thresholds, CI and one-command release gate.
6. Presentation: professional README with running-agent instructions, architecture and trust boundaries, judge-ready proof artifacts, two-minute demo script and recording.

Live credentials are the only intended remaining user setup. No external message sending, public publishing, or paid provisioning occurs without existing authorization and configured credentials.

Implementation status and observed checks are maintained in [BUILD_CHECKLIST.md](BUILD_CHECKLIST.md) and [VERIFICATION.md](VERIFICATION.md). The remaining external steps are account configuration, a hosted GitHub remote, and live acceptance.
