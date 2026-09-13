"use client";
import { useEffect, useState } from "react";
import type { Capsule } from "../../../packages/core/src/domain";
import { Shell, Json, api } from "./shared";
export default function CapsuleView({ id }: { id: string }) {
  const [capsule, setCapsule] = useState<Capsule>();
  const [tab, setTab] = useState("Summary");
  const [error, setError] = useState("");
  const [test, setTest] = useState<{
    code: string;
    valid: boolean;
    buggyFails: boolean;
    fixedPasses: boolean;
  }>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Capsule>(`capsules/${id}`)
      .then(setCapsule)
      .catch((e) => setError(e.message));
  }, [id]);
  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      setTest(await api(`capsules/${id}/generate-test`, {}));
      setTab("Regression test");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(capsule, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Shell>
      <div className="eyebrow">PORTABLE ARTIFACT / REPRODUCTION CAPSULE</div>
      <section className="page-title">
        <div>
          <h1>The failure, reconstructed.</h1>
          <p className="mono">{id}</p>
        </div>
        <div className="actions">
          <button className="secondary" disabled={!capsule} onClick={download}>
            ↓ Export JSON
          </button>
          <button disabled={busy || !capsule} onClick={() => void generate()}>
            {busy ? "Executing generated test…" : "Generate regression test"}
          </button>
        </div>
      </section>
      {error && <div className="error">{error}</div>}
      {capsule ? (
        <div className="panel">
          <div className="tabs">
            {[
              "Summary",
              "JSON",
              "Evidence provenance",
              "Regression test",
              "Replay history",
            ].map((t) => (
              <button
                key={t}
                className={t === tab ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="panel-body">
            {tab === "Summary" && (
              <>
                <span className="tag green">
                  VERIFIED · {capsule.reproduction.fidelityScore * 100}%
                  FIDELITY
                </span>
                <div className="capsule-grid">
                  {Object.entries({
                    Commit: capsule.code,
                    Request: capsule.request,
                    "Database fixtures": capsule.database,
                    "Stripe state": capsule.externalState,
                    "Feature flags": capsule.featureFlags,
                    "Expected failure": capsule.productionFingerprint,
                  }).map(([name, value]) => (
                    <section key={name}>
                      <h3>{name}</h3>
                      <Json value={value} />
                    </section>
                  ))}
                </div>
              </>
            )}
            {tab === "JSON" && <Json value={capsule} />}{" "}
            {tab === "Evidence provenance" && (
              <Json value={capsule.provenance} />
            )}{" "}
            {tab === "Regression test" &&
              (test ? (
                <>
                  <div
                    className={`result-${test.valid ? "success" : "failure"}`}
                  >
                    <h3>
                      {test.valid
                        ? "REGRESSION VALIDATED"
                        : "VALIDATION FAILED"}
                    </h3>
                    <p>
                      Buggy mode: {test.buggyFails ? "FAIL (expected)" : "PASS"}{" "}
                      · Fixed mode: {test.fixedPasses ? "PASS" : "FAIL"}
                    </p>
                  </div>
                  <pre>{test.code}</pre>
                </>
              ) : (
                <p>
                  Generate the regression test to parse it and execute it
                  against both code modes.
                </p>
              ))}
            {tab === "Replay history" && (
              <>
                <Json value={capsule.reproduction} />
                <a href={`/incidents/${capsule.incidentId}`}>
                  Open full execution timeline →
                </a>
              </>
            )}
          </div>
        </div>
      ) : (
        <p>Loading capsule…</p>
      )}
    </Shell>
  );
}
