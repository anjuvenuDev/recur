# Two-minute demo

The video is a screen recording of the running application in **local demo mode**, with simulated Stripe state. It demonstrates actual service execution and regression validation. Live integration acceptance is a separate check.

## Narration

**0:00–0:14 — The problem.** “A hundred-dollar charge has already been refunded forty dollars. The remaining refund fails, but replaying the request alone can miss the bug. Recur captures the code, database reads, Stripe state, and feature flag behind that failure.”

**0:14–0:25 — Reconstruction.** “Recur executes the service against reconstructed state. Only the deterministic fingerprint comparator can declare reproduction.”

**0:25–0:40 — Reject false success.** “Teaching mode first disables the flag. The request returns two hundred, so Recur rejects the match. Restoring the observed flag reproduces the exact original error, including its causal spans and lack of side effects.”

**0:40–0:55 — Portable proof.** “The capsule packages the request, fixtures, external state, frozen flags, source hash, and expected failure. Export it and replay the same case from the matching checkout.”

**0:55–1:24 — Prove the fix.** “Fresh state is reconstructed for verification. The fixed service issues exactly one sixty-dollar refund. Recur executes the generated regression twice: it fails against the buggy implementation and passes against the fixed one.”

**1:24–1:39 — Causal checks.** “Remove the flag, prior refund, buggy branch, or database request. Each ablation prevents the target failure.”

**1:39–1:52 — Reliability.** “Ten named scenarios include missing evidence and similar-but-different failures. Separate tests cover worker restarts, concurrent writes, capsule tampering, and two hundred seeded financial states.”

**1:52–2:00 — Close.** “Recur turns one-off failures into executable test cases that developers and coding agents can actually fix.”

## Record again

Install `agent-browser` and Chromium using that tool's setup instructions, and have `ffmpeg` on PATH. Start `pnpm start` after building. With the app open locally:

```bash
AGENT_BROWSER_BIN=agent-browser node --import tsx scripts/record-demo.ts
```

Raw footage and timing markers are written to `artifacts/demo/`. The script resets the synthetic incident first. Run it against your local workspace, not a shared incident collection. The narration above is ready for your own recording.

Before the final hackathon take, configure the core live integrations and run `pnpm test:live`. Inspect the Arga objects and optional Userlens/Lemma receipts. Re-record with genuine connected badges, then upload the video to an accessible host and replace the README demo link with that share URL. Test the share link in a signed-out browser. The checked-in local demo remains a fallback that judges can reproduce without accounts.
