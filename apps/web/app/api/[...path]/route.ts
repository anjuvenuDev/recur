import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { store } from "../../../lib/server";
import {
  IncidentSchema,
  EvidenceSchema,
  AttemptSchema,
  CapsuleSchema,
  EventSchema,
  OpaqueIdSchema,
} from "../../../../../packages/core/src/domain";
import {
  authorize,
  readJson,
  HttpError,
  securityHeaders,
} from "../../../../../packages/core/src/http/security";
import {
  workerReady,
  enqueue,
  getJob,
  activeJobs,
  JobConflict,
  type Job,
} from "../../../../../packages/db/src/jobs";
import { verifyCapsule } from "../../../../../packages/core/src/integrity";
import { sanitize } from "../../../../../packages/core/src/evidence";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: {
      ...securityHeaders,
      ...(status === 401
        ? { "WWW-Authenticate": 'Basic realm="Recur", charset="UTF-8"' }
        : {}),
    },
  });
async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    authorize(req);
    const path = (await params).path;
    if (path.length > 3) throw new HttpError(404, "Route not found");
    const [resource, id, action] = path;
    if (id && !OpaqueIdSchema.safeParse(id).success)
      throw new HttpError(400, "Invalid resource identifier");
    if (["health", "ready"].includes(resource) && !id && req.method === "GET") {
      await store.ready();
      const worker = await workerReady(store);
      return reply(
        {
          ok: resource === "health" || worker,
          worker,
          service: "recur",
          execution: "durable-worker",
        },
        resource === "ready" && !worker ? 503 : 200,
      );
    }
    if (resource === "jobs" && id && !action && req.method === "GET") {
      const job = await getJob(store, id);
      if (!job) throw new HttpError(404, "Job not found");
      return reply({
        id: job.id,
        status: job.status,
        kind: job.kind,
        result: job.result,
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      });
    }
    if (resource === "incidents" && req.method === "GET") {
      if (!id)
        return reply(
          (await store.list("incidents")).map((v) => IncidentSchema.parse(v)),
        );
      const raw = await store.get("incidents", id);
      if (!raw)
        throw new HttpError(404, "Incident not found. Run pnpm demo:seed.");
      const [
        evidence,
        attempts,
        capsules,
        events,
        verifications,
        receipts,
        busy,
      ] = await Promise.all([
        store.list("evidence", id),
        store.list("attempts", id),
        store.list("capsules", id),
        store.list("run_events", id),
        store.list("verifications", id),
        store.list("integration_receipts", id),
        activeJobs(store, id),
      ]);
      const parsedEvents = events
        .map((v) => EventSchema.parse(v))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      if (action === "events") return reply(parsedEvents);
      if (action) throw new HttpError(404, "Route not found");
      return reply({
        incident: IncidentSchema.parse(raw),
        evidence: evidence.map((v) => EvidenceSchema.parse(v)),
        attempts: attempts
          .map((v) => AttemptSchema.parse(v))
          .sort(
            (a, b) =>
              a.startedAt.localeCompare(b.startedAt) ||
              a.attemptNumber - b.attemptNumber,
          ),
        capsules: capsules
          .map((v) => CapsuleSchema.parse(v))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        events: parsedEvents,
        verifications,
        receipts,
        busy: busy.length > 0,
        activeJob: busy[0]?.id ?? null,
      });
    }
    if (resource === "capsules" && id && !action && req.method === "GET") {
      const raw = await store.get("capsules", id);
      if (!raw) throw new HttpError(404, "Capsule not found");
      return reply(verifyCapsule(raw));
    }
    let kind: Job["kind"] | undefined,
      incidentId = id ?? "__global__",
      input: unknown;
    if (req.method === "POST") {
      const requestKey = req.headers.get("idempotency-key");
      if (!requestKey || !OpaqueIdSchema.safeParse(requestKey).success)
        throw new HttpError(400, "A valid Idempotency-Key header is required");
      if (resource === "incidents" && id && action === "reproduce") {
        if (!(await store.get("incidents", id)))
          throw new HttpError(404, "Incident not found");
        const body = await readJson(
          req,
          z.object({ teaching: z.boolean().optional() }).strict(),
        );
        kind = "reproduce";
        input = {
          teaching:
            body.teaching ??
            process.env.RECUR_DEMO_FORCE_TWO_ATTEMPTS === "true",
        };
      } else if (
        resource === "capsules" &&
        id &&
        ["verify-fix", "generate-test", "ablate"].includes(action ?? "")
      ) {
        await readJson(req, z.object({}).strict());
        const raw = await store.get("capsules", id);
        if (!raw) throw new HttpError(404, "Capsule not found");
        const capsule = verifyCapsule(raw);
        kind = action as Job["kind"];
        incidentId = capsule.incidentId;
        input = { capsuleId: id };
      } else if (
        resource === "demo" &&
        ["reset", "seed"].includes(id ?? "") &&
        !action
      ) {
        await readJson(req, z.object({}).strict());
        kind = id as "reset" | "seed";
        incidentId = "__global__";
        input = {};
      } else if (resource === "evals" && !id) {
        await readJson(req, z.object({}).strict());
        kind = "evals";
        incidentId = "__global__";
        input = {};
      }
      if (kind) {
        const job = await enqueue(store, kind, incidentId, input, requestKey);
        return reply({ jobId: job.id, status: job.status }, 202);
      }
    }
    throw new HttpError(404, "Route not found");
  } catch (error) {
    if (error instanceof HttpError)
      return reply({ error: error.message }, error.status);
    if (error instanceof JobConflict)
      return reply({ error: error.message }, 409);
    if (error instanceof z.ZodError)
      return reply(
        { error: "Stored data is incompatible. Capture a new incident." },
        409,
      );
    return reply(
      {
        error: String(
          sanitize(error instanceof Error ? error.message : "Request failed"),
        ),
      },
      500,
    );
  }
}
export const GET = handle;
export const POST = handle;
