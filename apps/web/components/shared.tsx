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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}
