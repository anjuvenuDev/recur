import { it, expect } from "vitest";
import { retryBusy } from "./retry";
import { createStore } from "./client";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
it("retries only lock-acquisition failure with a bounded deadline", async () => {
  let calls = 0;
  expect(
    await retryBusy(async () => {
      if (calls++ < 2)
        throw Object.assign(new Error("locked"), { code: "SQLITE_BUSY" });
      return 1;
    }),
  ).toBe(1);
  expect(calls).toBe(3);
  calls = 0;
  await expect(
    retryBusy(async () => {
      calls++;
      throw new Error("not a lock");
    }),
  ).rejects.toThrow("not a lock");
  expect(calls).toBe(1);
  await expect(
    retryBusy(async () => {
      throw Object.assign(new Error("locked"), { code: "SQLITE_BUSY" });
    }, 0),
  ).rejects.toThrow("locked");
});
it("sustains concurrent readers and writers across independent SQLite clients", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "recur-contention-"));
  const url = `file:${resolve(dir, "state.db")}`;
  const stores = Array.from({ length: 4 }, () => createStore(url));
  try {
    await Promise.all(stores.map((s) => s.ready()));
    await Promise.all(
      stores.map(async (s, n) => {
        for (let i = 0; i < 30; i++) {
          await s.put("incidents", `${n}-${i}`, "i", { n, i });
          await s.list("incidents");
        }
      }),
    );
    expect(await stores[0]!.list("incidents")).toHaveLength(120);
  } finally {
    stores.forEach((s) => s.close());
    await rm(dir, { recursive: true, force: true });
  }
});
