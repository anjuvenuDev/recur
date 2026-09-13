import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Store } from "./client";
import { digest } from "../../core/src/integrity";
export const JobKindSchema = z.enum([
  "reproduce",
  "verify-fix",
  "generate-test",
  "ablate",
  "reset",
  "seed",
  "evals",
]);
export const JobSchema = z.object({
  id: z.string(),
  incidentId: z.string(),
  kind: JobKindSchema,
  status: z.enum(["queued", "running", "succeeded", "failed", "interrupted"]),
  input: z.unknown(),
  result: z.unknown().nullable(),
  error: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  owner: z.string().nullable(),
  leaseUntil: z.number().nullable(),
  requestKey: z.string(),
  inputDigest: z.string(),
});
export type Job = z.infer<typeof JobSchema>;
export const jobDdl = [
  `CREATE TABLE IF NOT EXISTS worker_heartbeats (id TEXT PRIMARY KEY, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS run_jobs (id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, input TEXT NOT NULL, result TEXT, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, owner TEXT, lease_until INTEGER, request_key TEXT NOT NULL UNIQUE, input_digest TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS one_active_job ON run_jobs(incident_id) WHERE status IN ('queued','running')`,
];
function decode(row: Record<string, unknown>): Job {
  return JobSchema.parse({
    id: row.id,
    incidentId: row.incident_id,
    kind: row.kind,
    status: row.status,
    input: JSON.parse(String(row.input)),
    result: row.result ? JSON.parse(String(row.result)) : null,
    error: row.error ?? null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    owner: row.owner ?? null,
    leaseUntil: row.lease_until ?? null,
    requestKey: row.request_key,
    inputDigest: row.input_digest,
  });
}
export class JobConflict extends Error {}
export async function enqueue(
  store: Store,
  kind: Job["kind"],
  incidentId: string,
  input: unknown,
  requestKey: string,
) {
  await store.ready();
  const contentDigest = digest({ kind, incidentId, input });
  const tx = await store.client.transaction("write");
  try {
    const existing = await tx.execute({
      sql: "SELECT * FROM run_jobs WHERE request_key=?",
      args: [requestKey],
    });
    if (existing.rows[0]) {
      const job = decode(existing.rows[0]);
      if (job.inputDigest !== contentDigest)
        throw new JobConflict("Idempotency key reused with different input");
      await tx.commit();
      return job;
    }
    const active = await tx.execute(
      "SELECT incident_id FROM run_jobs WHERE status IN ('queued','running')",
    );
    if (
      active.rows.some(
        (r) =>
          r.incident_id === incidentId ||
          r.incident_id === "__global__" ||
          incidentId === "__global__",
      )
    )
      throw new JobConflict("A conflicting job is already active");
    const id = randomUUID(),
      now = Date.now();
    await tx.execute({
      sql: "INSERT INTO run_jobs(id,incident_id,kind,status,input,created_at,updated_at,request_key,input_digest) VALUES(?,?,?,'queued',?,?,?,?,?)",
      args: [
        id,
        incidentId,
        kind,
        JSON.stringify(input),
        now,
        now,
        requestKey,
        contentDigest,
      ],
    });
    await tx.commit();
    return (await getJob(store, id))!;
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }
}
export async function getJob(store: Store, id: string) {
  await store.ready();
  const result = await store.client.execute({
    sql: "SELECT * FROM run_jobs WHERE id=?",
    args: [id],
  });
  return result.rows[0] ? decode(result.rows[0]) : null;
}
export async function activeJobs(store: Store, incidentId?: string) {
  await store.ready();
  const result = await store.client.execute(
    incidentId
      ? {
          sql: "SELECT * FROM run_jobs WHERE status IN ('queued','running') AND (incident_id=? OR incident_id='__global__')",
          args: [incidentId],
        }
      : "SELECT * FROM run_jobs WHERE status IN ('queued','running')",
  );
  return result.rows.map(decode);
}
export async function claimNext(
  store: Store,
  owner: string,
  now = Date.now(),
  leaseMs = 15000,
) {
  await store.ready();
  const r = await store.client.execute({
    sql: "UPDATE run_jobs SET status='running',owner=?,lease_until=?,updated_at=? WHERE id=(SELECT id FROM run_jobs WHERE status='queued' ORDER BY created_at,id LIMIT 1) AND status='queued' RETURNING *",
    args: [owner, now + leaseMs, now],
  });
  return r.rows[0] ? decode(r.rows[0]) : null;
}
export async function heartbeat(
  store: Store,
  id: string,
  owner: string,
  now = Date.now(),
  leaseMs = 15000,
) {
  const r = await store.client.execute({
    sql: "UPDATE run_jobs SET lease_until=?,updated_at=? WHERE id=? AND owner=? AND status='running' AND lease_until>?",
    args: [now + leaseMs, now, id, owner, now],
  });
  return r.rowsAffected === 1;
}
export async function finishJob(
  store: Store,
  id: string,
  owner: string,
  result: unknown,
  error: string | null = null,
) {
  const now = Date.now();
  const r = await store.client.execute({
    sql: "UPDATE run_jobs SET status=?,result=?,error=?,updated_at=?,lease_until=NULL WHERE id=? AND owner=? AND status='running' AND lease_until>?",
    args: [
      error ? "failed" : "succeeded",
      result === undefined ? null : JSON.stringify(result),
      error,
      now,
      id,
      owner,
      now,
    ],
  });
  if (r.rowsAffected !== 1)
    throw new Error("Job lease was lost; result was not committed");
}
export async function recoverExpired(store: Store, now = Date.now()) {
  await store.ready();
  const result = await store.client.execute({
    sql: "UPDATE run_jobs SET status='interrupted',error='Worker interrupted. Outcome may be incomplete; inspect the run before explicitly retrying.',updated_at=?,lease_until=NULL WHERE status='running' AND lease_until<=? RETURNING *",
    args: [now, now],
  });
  return result.rows.map(decode);
}

export async function workerPulse(store: Store, id: string) {
  await store.ready();
  await store.client.execute({
    sql: "INSERT INTO worker_heartbeats(id,updated_at) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at",
    args: [id, Date.now()],
  });
}
export async function workerReady(store: Store) {
  await store.ready();
  const r = await store.client.execute({
    sql: "SELECT id FROM worker_heartbeats WHERE updated_at>? LIMIT 1",
    args: [Date.now() - 12000],
  });
  return r.rows.length > 0;
}
