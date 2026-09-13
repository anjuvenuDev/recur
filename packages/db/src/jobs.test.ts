import { it, expect } from "vitest";
import { createStore } from "./client";
import {
  enqueue,
  claimNext,
  finishJob,
  getJob,
  heartbeat,
  recoverExpired,
  activeJobs,
} from "./jobs";
it("deduplicates request keys and rejects conflicting inputs and parallel incident jobs", async () => {
  const db = createStore(":memory:");
  try {
    const first = await enqueue(
      db,
      "reproduce",
      "inc",
      { teaching: true },
      "request1",
    );
    expect(
      (await enqueue(db, "reproduce", "inc", { teaching: true }, "request1"))
        .id,
    ).toBe(first.id);
    await expect(
      enqueue(db, "reproduce", "inc", { teaching: false }, "request1"),
    ).rejects.toThrow("different input");
    await expect(
      enqueue(db, "reproduce", "inc", {}, "request2"),
    ).rejects.toThrow("active");
    await expect(
      enqueue(db, "reset", "__global__", {}, "reset1"),
    ).rejects.toThrow("active");
  } finally {
    db.close();
  }
});
it("leases jobs atomically and only permits the owner to finish", async () => {
  const db = createStore(":memory:");
  try {
    const queued = await enqueue(db, "reproduce", "inc", {}, "r");
    const claims = await Promise.all([claimNext(db, "a"), claimNext(db, "b")]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const claimed = claims.find(Boolean)!;
    await expect(finishJob(db, queued.id, "wrong", {})).rejects.toThrow(
      "lease",
    );
    expect(await heartbeat(db, queued.id, claimed.owner!)).toBe(true);
    await finishJob(db, queued.id, claimed.owner!, { matched: true });
    expect((await getJob(db, queued.id))?.status).toBe("succeeded");
    expect(await activeJobs(db)).toHaveLength(0);
  } finally {
    db.close();
  }
});
it("never automatically retries a job with an unknown interrupted outcome", async () => {
  const db = createStore(":memory:");
  try {
    const queued = await enqueue(db, "verify-fix", "inc", {}, "verify");
    await claimNext(db, "dead", 100, 10);
    const recovered = await recoverExpired(db, 111);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.status).toBe("interrupted");
    expect(await claimNext(db, "new")).toBeNull();
    expect(await heartbeat(db, queued.id, "dead", 112)).toBe(false);
    await expect(
      finishJob(db, queued.id, "dead", { passed: true }),
    ).rejects.toThrow("lease");
  } finally {
    db.close();
  }
});
it("persists a queued job across database connections", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "recur-jobs-"));
  const url = `file:${join(dir, "test.db")}`;
  try {
    const first = createStore(url);
    const queued = await enqueue(first, "ablate", "inc", {}, "persist");
    first.close();
    const second = createStore(url);
    expect((await claimNext(second, "new"))?.id).toBe(queued.id);
    second.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("fences all entity writes after ownership expires, not just final job status", async () => {
  const store = createStore("file::memory:");
  try {
    const job = await enqueue(
      store,
      "reproduce",
      "incident",
      { teaching: false },
      "fence",
    );
    await claimNext(store, "owner");
    store.guardJob(job.id, "owner");
    await store.put("incidents", "incident", "incident", { status: "running" });
    await store.client.execute({
      sql: "UPDATE run_jobs SET lease_until=0 WHERE id=?",
      args: [job.id],
    });
    await expect(
      store.put("incidents", "incident", "incident", { status: "fixed" }),
    ).rejects.toThrow("lease");
    await expect(store.deleteFor("incidents", "incident")).rejects.toThrow(
      "lease",
    );
    expect(await store.get("incidents", "incident")).toEqual({
      status: "running",
    });
  } finally {
    store.close();
  }
});
