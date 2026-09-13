"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  Incident,
  Evidence,
  Attempt,
  Capsule,
  RunEvent,
  Analysis,
} from "../../../packages/core/src/domain";
import { Shell, Json, api } from "./shared";
type Detail = {
  incident: Incident;
  evidence: Evidence[];
  attempts: Attempt[];
  capsules: Capsule[];
  events: RunEvent[];
  busy: boolean;
  verifications?: Verification[];
  receipts?: { id: string; provider: string; status: string; detail: string }[];
};
type Verification = {
  passed: boolean;
  originalFailureGone: boolean;
  result: { status: number; sideEffects: unknown[] };
  regression: {
    valid: boolean;
    buggyFails: boolean;
    fixedPasses: boolean;
    code: string;
  };
};
type Ablation = {
  component: string;
  matched: boolean;
  status: number;
  error: string | null;
}[];
export default function Dashboard({
  incidentId = "inc_refund_001",
}: {
  incidentId?: string;
}) {
  const [data, setData] = useState<Detail>();
  const [error, setError] = useState("");
  const [working, setWorking] = useState("");
  const [teaching, setTeaching] = useState(true);
  const [verification, setVerification] = useState<Verification>();
  const [ablation, setAblation] = useState<Ablation>();
  const [selected, setSelected] = useState<Evidence>();
  const [tab, setTab] = useState("Evidence graph");
  const load = useCallback(async () => {
    try {
      setData(await api<Detail>(`incidents/${incidentId}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [incidentId]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 1000);
    return () => clearInterval(timer);
  }, [load]);
  const action = async (name: string, fn: () => Promise<void>) => {
    setError("");
    setWorking(name);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking("");
    }
  };
  const capsule = data?.capsules.at(-1);
  const displayedVerification = verification ?? data?.verifications?.at(-1);
  const busy = !!working || !!data?.busy;
  const incident = data?.incident;
  const latest = data?.attempts.at(-1);
  const reproduced =
    incident?.status === "reproduced" || incident?.status === "fixed";
  const analysis = data?.events
    .filter((e) => e.type === "evidence_selected")
    .at(-1)?.data as Analysis | undefined;
  const nodes =
    data?.evidence.filter((e) =>
      ["git_commit", "feature_flag_read", "db_read", "stripe_read"].includes(
        e.kind,
      ),
    ) ?? [];
  const flagLive = data?.evidence.some(
    (e) =>
      e.kind === "feature_flag_read" &&
      JSON.stringify(e.payload).includes("LaunchDarkly Live"),
  );
  const start = () =>
    action("Reproducing", async () => {
      setVerification(undefined);
      setAblation(undefined);
      await api(`incidents/${incidentId}/reproduce`, { teaching });
    });
  return (
    <Shell>
      <div className="eyebrow">
        INCIDENT WORKSPACE <span className="dot" /> SYNTHETIC PRODUCTION FAILURE
      </div>
      <section className="page-title">
        <div>
          <h1>Reconstruct the failure.</h1>
          <p>
            Replay tools replay the request. Recur reconstructs the state that
            made it fail.
          </p>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            void action("Resetting", async () => {
              await api("demo/reset", {});
              setVerification(undefined);
              setAblation(undefined);
              setSelected(undefined);
            })
          }
        >
          ↺ Reset demo
        </button>
      </section>
      <div className="integrations">
        <span>ENVIRONMENT</span>
        <b>
          Stripe ·{" "}
          {capsule?.provenance.argaTwinUsed ? "ARGA TWIN" : "LOCAL SIMULATION"}
        </b>
        <b>
          GitHub · {incident?.git.source === "GitHub Live" ? "LIVE" : "FIXTURE"}
        </b>
        <b>LaunchDarkly · {flagLive ? "LIVE CAPTURE" : "FIXTURE"}</b>
        <b>
          AI ·{" "}
          {capsule?.provenance.generatedByModel ? "CONNECTED" : "DEMO FIXTURE"}
        </b>
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {!data ? (
        <div className="panel loading">
          Loading incident and captured evidence…
        </div>
      ) : (
        <>
          <section className="incident-bar">
            <div className="incident-symbol">!</div>
            <div>
              <div className="eyebrow">
                {incidentId} <span className="tag red">HTTP 500</span>
              </div>
              <h2>{incident?.title}</h2>
              <code>POST /api/refunds/remaining</code>
            </div>
            <div className="incident-action">
              <label>
                <input
                  type="checkbox"
                  checked={teaching}
                  disabled={busy}
                  onChange={(e) => setTeaching(e.target.checked)}
                />{" "}
                Two-attempt teaching mode
              </label>
              <button disabled={busy} onClick={() => void start()}>
                {busy ? `${working || "Reproducing"}…` : "↻ Reproduce failure"}
              </button>
            </div>
          </section>
          {reproduced && (
            <section className="success-banner">
              <div>
                <div className="eyebrow">
                  {incident?.status === "fixed"
                    ? "FIX VERIFIED"
                    : "DETERMINISTIC FINGERPRINT MATCH"}
                </div>
                <h2>
                  {incident?.status === "fixed"
                    ? "REGRESSION PASSES"
                    : "BUG REPRODUCED"}
                </h2>
                <p>
                  {incident?.status === "fixed"
                    ? "Original failure gone. Exactly one $60 refund created."
                    : "Critical fields, causal spans, and side effects match the original failure."}
                </p>
              </div>
              <div className="score">
                {Math.round((capsule?.reproduction.fidelityScore ?? 0) * 100)}
                <span>
                  %<small>fidelity</small>
                </span>
              </div>
            </section>
          )}
          <div className="workspace-grid">
            <aside className="panel">
              <div className="panel-heading">
                <span>01</span>
                <h3>Production evidence</h3>
              </div>
              <div className="panel-body">
                <div className="field">
                  <label>ERROR CLASS</label>
                  <strong className="red-text">
                    {incident?.productionFingerprint.errorClass}
                  </strong>
                </div>
                <div className="field">
                  <label>APPLICATION FRAME</label>
                  <code>
                    refund-service.ts
                    <br />↳ refundRemaining()
                  </code>
                </div>
                <div className="field">
                  <label>CODE COMMIT · {incident?.git.source}</label>
                  <code className="wrap">{incident?.git.commitSha}</code>
                  <small>Replay requires the captured source hash.</small>
                </div>
                <div className="field">
                  <label>SOURCE SHA-256</label>
                  <code className="wrap">{incident?.git.sourceDigest}</code>
                </div>
                <div className="field">
                  <label>CAPTURED AT</label>
                  <code>
                    {incident?.occurredAt.replace("T", " ").slice(0, 19)} UTC
                  </code>
                </div>
                <div className="field">
                  <label>REQUEST BODY</label>
                  <Json value={incident?.requestBody} />
                </div>
                <details>
                  <summary>Full failure fingerprint</summary>
                  <Json value={incident?.productionFingerprint} />
                </details>
                <details>
                  <summary>Captured stack trace</summary>
                  <Json
                    value={
                      data.evidence.find((e) => e.kind === "application_error")
                        ?.payload
                    }
                  />
                </details>
                <details>
                  <summary>Source excerpt</summary>
                  <pre>{incident?.git.excerpt}</pre>
                </details>
              </div>
            </aside>
            <section className="panel graph-panel">
              <div className="panel-heading">
                <span>02</span>
                <h3>Conditions behind the failure</h3>
                <span className="tag">{nodes.length} observations</span>
              </div>
              <div className="tabs">
                {["Evidence graph", "Replay attempts"].map((t) => (
                  <button
                    key={t}
                    className={tab === t ? "active" : ""}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {tab === "Evidence graph" ? (
                <div className="panel-body">
                  <div className="graph-root">
                    <span className="node-icon">↗</span>
                    <div>
                      <small>HTTP REQUEST</small>
                      <strong>Refund remaining balance</strong>
                      <code>cust_demo_001 → ch_demo_001</code>
                    </div>
                  </div>
                  <div className="graph-branches">
                    {nodes.map((e) => {
                      const reason = analysis?.rationaleByEvidenceId.find(
                        (r) => r.id === e.id,
                      )?.reason;
                      const label =
                        e.kind === "git_commit"
                          ? "Buggy code version"
                          : e.kind === "feature_flag_read"
                            ? "refunds_v2 = true"
                            : e.kind === "db_read"
                              ? "Customer + refund request"
                              : e.operation === "stripe.charge.retrieve"
                                ? "Charge: $100.00"
                                : "Prior refund: $40.00";
                      return (
                        <button
                          key={e.id}
                          className={`graph-node ${selected?.id === e.id ? "selected" : ""}`}
                          onClick={() => setSelected(e)}
                        >
                          <span
                            className={`node-icon ${e.kind === "stripe_read" ? "purple" : ""}`}
                          >
                            {e.kind === "git_commit"
                              ? "⑂"
                              : e.kind === "feature_flag_read"
                                ? "⚑"
                                : e.kind === "db_read"
                                  ? "▤"
                                  : "$"}
                          </span>
                          <span>
                            <small>{e.source.toUpperCase()}</small>
                            <strong>{label}</strong>
                            <small className="reason">
                              {reason ??
                                (e.kind === "feature_flag_read"
                                  ? "Selects the failing V2 branch"
                                  : e.kind === "stripe_read"
                                    ? "Observed during balance calculation"
                                    : "Observed in the failed execution")}
                            </small>
                          </span>
                          <span className="node-dot" />
                        </button>
                      );
                    })}
                  </div>
                  {selected && (
                    <div className="selected-evidence">
                      <div className="eyebrow">{selected.operation}</div>
                      <Json value={selected.payload} />
                      <small>Evidence ID: {selected.id}</small>
                    </div>
                  )}
                  <div className="state-equation">
                    <span>
                      $100<small>charge</small>
                    </span>
                    <b>−</b>
                    <span>
                      $40<small>prior refund</small>
                    </span>
                    <b>=</b>
                    <span className="green-text">
                      $60<small>expected refund</small>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="panel-body">
                  {!data.attempts.length && (
                    <p>
                      No replay yet. Reproduce the incident to compare results.
                    </p>
                  )}
                  {data.attempts.map((a) => (
                    <details key={a.id} open>
                      <summary>
                        Attempt {a.attemptNumber} · {a.status.toUpperCase()} ·
                        HTTP {a.replayResult?.status ?? "—"}
                      </summary>
                      <p>
                        Flag: {String(a.plan.flagState.refunds_v2)} ·{" "}
                        {Math.round((a.comparison?.fidelityScore ?? 0) * 100)}%
                        fidelity
                      </p>
                      {a.comparison?.checks.map((c) => (
                        <div className="check" key={c.field}>
                          <span>{c.field}</span>
                          <b className={c.matched ? "green-text" : "red-text"}>
                            {c.matched ? "MATCH" : "MISMATCH"}
                          </b>
                        </div>
                      ))}
                    </details>
                  ))}
                </div>
              )}
            </section>
            <aside className="panel">
              <div className="panel-heading">
                <span>03</span>
                <h3>Reconstruction timeline</h3>
              </div>
              <div className="panel-body timeline">
                {!data.events.length ? (
                  <div className="empty">
                    <span>↻</span>
                    <h3>Ready to reconstruct</h3>
                    <p>
                      Each step below will come from a persisted workflow event
                      and an executed replay.
                    </p>
                  </div>
                ) : (
                  data.events.map((e, i) => (
                    <div
                      className={`event ${e.type === "reproduced" ? "matched" : e.type === "failed" ? "failed" : ""}`}
                      key={e.id}
                    >
                      <span className="event-dot" />
                      <small>
                        {String(i + 1).padStart(2, "0")} / {e.phase}
                      </small>
                      <p>{e.message}</p>
                      <time>{e.timestamp.slice(11, 19)}</time>
                    </div>
                  ))
                )}
                {busy && <div className="running">● Working…</div>}
              </div>
            </aside>
          </div>
          <section className="bottom-grid">
            <div className="panel panel-body">
              <div className="eyebrow">REPRODUCTION CAPSULE</div>
              <h3>One failure. An executable test case.</h3>
              <p>
                Code, request, DB fixtures, external state, flags, and the
                expected failure — together, with evidence provenance.
              </p>
              <div className="actions">
                {capsule ? (
                  <>
                    <Link
                      className="button secondary"
                      href={`/capsules/${capsule.id}`}
                    >
                      View capsule ↗
                    </Link>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action("Verifying fix", async () =>
                          setVerification(
                            await api<Verification>(
                              `capsules/${capsule.id}/verify-fix`,
                              {},
                            ),
                          ),
                        )
                      }
                    >
                      Verify fix
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void action("Running ablations", async () =>
                          setAblation(
                            await api<Ablation>(
                              `capsules/${capsule.id}/ablate`,
                              {},
                            ),
                          ),
                        )
                      }
                    >
                      Run ablation
                    </button>
                  </>
                ) : (
                  <span className="muted">
                    Available after a verified reproduction
                  </span>
                )}
              </div>
              {displayedVerification && (
                <div
                  className={
                    displayedVerification.passed &&
                    displayedVerification.regression.valid
                      ? "result-success"
                      : "error"
                  }
                >
                  <h3>
                    {displayedVerification.passed &&
                    displayedVerification.regression.valid
                      ? "FIX VERIFIED"
                      : "VERIFICATION FAILED"}
                  </h3>
                  <p>
                    HTTP {displayedVerification.result.status} · Original
                    fingerprint{" "}
                    {displayedVerification.originalFailureGone
                      ? "absent"
                      : "still present"}
                  </p>
                  <p>
                    Generated test: buggy{" "}
                    {displayedVerification.regression.buggyFails
                      ? "FAIL (expected)"
                      : "unexpected PASS"}{" "}
                    / fixed{" "}
                    {displayedVerification.regression.fixedPasses
                      ? "PASS"
                      : "FAIL"}
                  </p>
                </div>
              )}
              {ablation && (
                <div className="ablation">
                  <h3>Required-state ablation · local simulation</h3>
                  {ablation.map((a) => (
                    <div className="check" key={a.component}>
                      <span>Remove {a.component}</span>
                      <b className={a.matched ? "red-text" : "green-text"}>
                        {a.matched ? "STILL REPRODUCES" : "NO TARGET FAILURE"}
                      </b>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="panel panel-body">
              <div className="eyebrow">STATE SAFETY</div>
              <h3>Behavior preserved. Identity protected.</h3>
              <div className="check">
                <span>Production identities copied</span>
                <b>0</b>
              </div>
              <div className="check">
                <span>Secrets copied</span>
                <b>0</b>
              </div>
              <div className="check">
                <span>Source data</span>
                <b>Synthetic fixtures</b>
              </div>
              <div className="check">
                <span>Financial write destination</span>
                <b>
                  {capsule?.provenance.argaTwinUsed
                    ? "Arga twin"
                    : "Local memory"}
                </b>
              </div>
              {data.receipts?.length ? (
                <details>
                  <summary>Integration delivery receipts</summary>
                  {data.receipts.map((r) => (
                    <div key={r.id} className="field">
                      <strong>
                        {r.provider} · {r.status}
                      </strong>
                      <small>{r.detail}</small>
                    </div>
                  ))}
                </details>
              ) : null}
              <p className="small">
                No production cloning. Every replay receives fresh state.
                Captured flags are frozen for reproduction.
              </p>
            </div>
          </section>
          {latest?.status === "error" && (
            <div className="error">
              The last attempt failed safely. See the timeline for the
              unresolved dependency.
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
