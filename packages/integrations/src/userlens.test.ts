import { it, expect } from "vitest";
import { createStore } from "../../db/src/client";
import { publishOutcome } from "./userlens";
const event = {
  incidentId: "inc_test",
  capsuleId: "cap_test",
  event: "recur.fix_verified" as const,
  fidelity: 1,
  remainingAmount: 6000,
};
it("sends the documented Userlens envelope once and persists delivery proof", async () => {
  const store = createStore("file::memory:");
  let calls = 0;
  try {
    const request: typeof fetch = async (url, init) => {
      calls++;
      expect(url).toBe("https://events.userlens.io/event");
      expect((init?.headers as Record<string, string>).authorization).toBe(
        `Basic ${Buffer.from("write-code:").toString("base64")}`,
      );
      expect(JSON.parse(String(init?.body))).toMatchObject({
        type: "track",
        source: "userlens-restapi",
        properties: { synthetic: true, remainingAmount: 6000 },
      });
      return new Response("", { status: 200 });
    };
    expect(
      await publishOutcome(store, event, {
        writeCode: "write-code",
        fetch: request,
      }),
    ).toMatchObject({ status: "DELIVERED" });
    await publishOutcome(store, event, {
      writeCode: "write-code",
      fetch: request,
    });
    expect(calls).toBe(1);
  } finally {
    store.close();
  }
});
it("reports ambiguous network failure without retry or fake delivery", async () => {
  const store = createStore("file::memory:");
  let calls = 0;
  try {
    const request: typeof fetch = async () => {
      calls++;
      throw new Error("timeout");
    };
    expect(
      await publishOutcome(store, event, { writeCode: "test", fetch: request }),
    ).toMatchObject({ status: "UNKNOWN" });
    await publishOutcome(store, event, { writeCode: "test", fetch: request });
    expect(calls).toBe(1);
  } finally {
    store.close();
  }
});
it("shows missing credentials explicitly", async () => {
  const store = createStore("file::memory:");
  try {
    expect(await publishOutcome(store, event, { writeCode: "" })).toMatchObject(
      { status: "NOT CONNECTED" },
    );
  } finally {
    store.close();
  }
});
