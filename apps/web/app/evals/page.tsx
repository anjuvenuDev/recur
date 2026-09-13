"use client";
import { useEffect, useState } from "react";
import { Shell, api } from "../../components/shared";
type Report = {
  results: {
    name: string;
    expected: boolean;
    matched: boolean;
    status: number;
    unresolved: string | null;
    correct: boolean;
  }[];
  metrics: {
    scenarios: number;
    correct: number;
    falseReproductionRate: number;
    safeUnresolved: number;
  };
  note: string;
};
export default function Page() {
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    setError("");
    try {
      setReport(await api<Report>("evals", {}));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void run();
  }, []);
  return (
    <Shell>
      <div className="eyebrow">DETERMINISTIC EVALUATION / LOCAL SIMULATION</div>
      <section className="page-title">
        <div>
          <h1>Prove it’s the same bug.</h1>
          <p>
            Adversarial state changes, missing evidence, and the patched
            implementation.
          </p>
        </div>
        <button onClick={() => void run()} disabled={busy}>
          {busy ? "Executing scenarios…" : "Run evaluations"}
        </button>
      </section>
      {error && <div className="error">{error}</div>}
      {report && (
        <>
          <div className="eval-metrics">
            <div className="panel panel-body">
              <small>SCENARIOS CORRECT</small>
              <h1>
                {report.metrics.correct}/{report.metrics.scenarios}
              </h1>
            </div>
            <div className="panel panel-body">
              <small>FALSE REPRODUCTION RATE</small>
              <h1 className="green-text">
                {report.metrics.falseReproductionRate * 100}%
              </h1>
            </div>
            <div className="panel panel-body">
              <small>SAFE UNRESOLVED CASES</small>
              <h1>{report.metrics.safeUnresolved}</h1>
            </div>
          </div>
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Expected</th>
                  <th>Observed</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {report.results.map((r) => (
                  <tr key={r.name}>
                    <td>
                      {r.name}
                      {r.unresolved && <small>{r.unresolved}</small>}
                    </td>
                    <td>{r.expected ? "Reproduce" : "No target failure"}</td>
                    <td>
                      {r.unresolved
                        ? "Insufficient evidence"
                        : r.matched
                          ? "Reproduced"
                          : `No match · HTTP ${r.status}`}
                    </td>
                    <td className={r.correct ? "green-text" : "red-text"}>
                      {r.correct ? "PASS" : "FAIL"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>{report.note}</p>
        </>
      )}
    </Shell>
  );
}
