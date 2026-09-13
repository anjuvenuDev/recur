# Judging fit and integration rationale

The user-supplied rubric prioritizes technical execution (30%) and reliability/evaluation (25%), followed by usefulness (20%), originality (15%), and demo clarity (10%). The implementation therefore prioritizes an executed failure, inspected external state, deterministic verdicts, and independently rerunnable proof.

| Criterion                | Evidence in Recur                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Technical execution      | Agents SDK manager/specialists, real service/OTel capture, typed provider adapters, durable worker, portable artifacts                                                    |
| Reliability & evaluation | Negative cases, missing/conflicting evidence, actual buggy/fixed regression runs, concurrency tests, restart tests, browser tests, seeded financial-state sweep, CI gates |
| Usefulness               | A developer receives a replayable failure and regression instead of another speculative root-cause paragraph                                                              |
| Originality              | Reconstruction of state across code, DB, flags, and SaaS; explicit ablation and portable capsule                                                                          |
| Demo clarity             | Visible mismatch → reconstructed failure → fixed behavior, with truthful environment badges                                                                               |

## Panel and products

The [official panel page](https://multiappagenthackathon.com/judges/) lists Ankur Dahama and Hai Ta from Userlens, Phillip Li and Akira Tong from Arga Labs, and Shlok Mundhra from Clera. This was checked on September 13, 2026. The [event](https://multiappagenthackathon.com/) emphasizes useful multi-step agents spanning external applications.

- **Arga:** a direct functional fit. Recur reconstructs the Stripe state needed to make a captured bug executable. The integration includes provisioning, status/expiry, teardown, isolated object creation, and read-back verification. [Official twin documentation](https://docs.argalabs.com/llms.txt).
- **Userlens:** a useful outcome integration. Recur emits synthetic account-level `recur.failure_reproduced` and `recur.fix_verified` events only after deterministic proof. It provides an adoption/operational signal without inventing customer impact. The adapter follows the official `POST https://events.userlens.io/event` track envelope and Basic authentication with the write code followed by a colon. [Official REST reference](https://userlens.gitbook.io/userlens-analytics/guides/api-reference).
- **Lemma:** relevant agent observability. Recur installs the official OpenAI Agents tracing processor, flushes at job completion, and reports transport outcomes separately. This helps inspect reasoning and specialist tool use. [Official Agents SDK integration](https://docs.uselemma.ai/integrations/openai-agents).
- **Clera:** recruiting is not a natural dependency of refund reconstruction. No recruiting workflow or artificial integration has been added. [Clera](https://getclera.com/).

GitHub, LaunchDarkly, and Arga are the primary external-system path. Userlens and Lemma extend it with measured outcomes and agent observability. Adapter contract tests are not a substitute for credentialed live proof: run `pnpm test:live` and inspect optional integration receipts before recording the submission.

The panel association is context, not endorsement. No messages have been sent to judges, and no usage or production deployment is implied.
