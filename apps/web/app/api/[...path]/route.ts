import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { store, jobs, ensureSeed, clearSeed } from "../../../lib/server";
import {
  IncidentSchema,
  EvidenceSchema,
  AttemptSchema,
  CapsuleSchema,
  EventSchema,
} from "../../../../../packages/core/src/domain";
import { reproduce } from "../../../../../packages/agents/src/workflow";
import {
  generateRegression,
  verifyFix,
  ablate,
} from "../../../../../packages/agents/src/regression";
import { runEvals } from "../../../../../packages/evals/runner";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const path = (await params).path;
    const [resource, id, action] = path;
    if (req.method === "POST") {
      const origin = req.headers.get("origin");
      if (
        origin &&
        origin !== `${req.nextUrl.protocol}//${req.headers.get("host")}`
      )
        return NextResponse.json({ error: "Origin denied" }, { status: 403 });
    }
    await ensureSeed();
    if (resource === "incidents" && req.method === "GET") {
      if (!id)
        return NextResponse.json(
          (await store.list("incidents")).map((v) => IncidentSchema.parse(v)),
        );
      const raw = await store.get("incidents", id);
      if (!raw)
        return NextResponse.json(
          { error: "Incident not found" },
          { status: 404 },
        );
      const events = (await store.list("run_events", id))
        .map((v) => EventSchema.parse(v))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      if (action === "events") return NextResponse.json(events);
      return NextResponse.json({
        incident: IncidentSchema.parse(raw),
        evidence: (await store.list("evidence", id)).map((v) =>
          EvidenceSchema.parse(v),
        ),
        attempts: (await store.list("attempts", id)).map((v) =>
          AttemptSchema.parse(v),
        ),
        capsules: (await store.list("capsules", id)).map((v) =>
          CapsuleSchema.parse(v),
        ),
        events,
        busy: jobs.has(id),
      });
    }
    if (
      resource === "incidents" &&
      action === "reproduce" &&
      req.method === "POST"
    ) {
      if (!(await store.get("incidents", id!)))
        return NextResponse.json(
          { error: "Incident not found" },
          { status: 404 },
        );
      if (jobs.has(id!))
        return NextResponse.json(
          { error: "A run is already active" },
          { status: 409 },
        );
      const input = z
        .object({ teaching: z.boolean().optional() })
        .strict()
        .parse(await req.json());
      jobs.add(id!);
      after(async () => {
        try {
          await reproduce(store, id!, {
            teaching:
              input.teaching ??
              process.env.RECUR_DEMO_FORCE_TWO_ATTEMPTS === "true",
          });
        } finally {
          jobs.delete(id!);
        }
      });
      return NextResponse.json({ started: true }, { status: 202 });
    }
    if (resource === "capsules" && id) {
      const raw = await store.get("capsules", id);
      if (!raw)
        return NextResponse.json(
          { error: "Capsule not found" },
          { status: 404 },
        );
      const capsule = CapsuleSchema.parse(raw);
      if (req.method === "GET") return NextResponse.json(capsule);
      if (jobs.has(capsule.incidentId))
        return NextResponse.json(
          { error: "A run is already active" },
          { status: 409 },
        );
      jobs.add(capsule.incidentId);
      try {
        if (action === "generate-test")
          return NextResponse.json(await generateRegression(capsule));
        if (action === "verify-fix") {
          const verification = await verifyFix(capsule);
          const regression = await generateRegression(capsule);
          if (verification.passed && regression.valid) {
            const incident = IncidentSchema.parse(
              await store.get("incidents", capsule.incidentId),
            );
            incident.status = "fixed";
            await store.put("incidents", incident.id, incident.id, incident);
          }
          return NextResponse.json({ ...verification, regression });
        }
        if (action === "ablate")
          return NextResponse.json(await ablate(capsule));
      } finally {
        jobs.delete(capsule.incidentId);
      }
    }
    if (resource === "evals" && req.method === "GET")
      return NextResponse.json(await runEvals());
    if (
      resource === "demo" &&
      req.method === "POST" &&
      ["reset", "seed"].includes(id ?? "")
    ) {
      if (jobs.size)
        return NextResponse.json(
          { error: "Wait for active runs" },
          { status: 409 },
        );
      if (id === "reset") await store.clear();
      clearSeed();
      await ensureSeed();
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Route not found" }, { status: 404 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? "Invalid input"
            : error instanceof Error
              ? error.message
              : "Request failed",
      },
      { status: 400 },
    );
  }
}
export const GET = handle;
export const POST = handle;
