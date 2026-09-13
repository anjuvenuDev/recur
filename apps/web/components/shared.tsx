"use client";
import Link from "next/link";
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header>
        <Link href="/" className="brand">
          <span className="brandmark">↻</span> recur
          <span className="workspace">/ local workspace</span>
        </Link>
        <nav>
          <Link href="/">Incidents</Link>
          <Link href="/evals">Evaluations</Link>
          <span className="muted">v0.1</span>
        </nav>
      </header>
      <main>{children}</main>
      <footer>
        <span>RECUR / EVIDENCE-BACKED REPRODUCTION</span>
        <span>Capture the conditions. Recreate the bug. Prove the fix.</span>
      </footer>
    </>
  );
}
export function Json({ value }: { value: unknown }) {
  return <pre>{JSON.stringify(value, null, 2)}</pre>;
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `/api/${path}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  if (response.status === 202 && data.jobId) {
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const poll = await fetch(`/api/jobs/${data.jobId}`, {
        cache: "no-store",
      });
      if (!poll.ok)
        throw new Error(
          "Cannot read job status. Refresh to inspect the persisted run.",
        );
      const job = await poll.json();
      if (job.status === "succeeded") return job.result as T;
      if (["failed", "interrupted"].includes(job.status))
        throw new Error(job.error ?? "Job did not complete");
    }
    throw new Error(
      "Job is still pending. Ensure pnpm worker is running, then refresh.",
    );
  }
  return data as T;
}
