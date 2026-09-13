import { it, expect } from "vitest";
import { createStore } from "../../db/src/client";
import { seedIncident } from "../../db/src/seed";
import { EvidenceSchema } from "./domain";
import { reconstruct } from "./reconstruct";
it("rejects contradictory observations and cross-incident evidence", async () => {
  const store = createStore("file::memory:");
  try {
    const incident = await seedIncident(store, true);
    const evidence = (await store.list("evidence")).map((e) =>
      EvidenceSchema.parse(e),
    );
    const flag = evidence.find((e) => e.kind === "feature_flag_read")!;
    expect(() =>
      reconstruct(incident, [
        ...evidence,
        { ...flag, id: "conflict", payload: { value: false } },
      ]),
    ).toThrow("Conflicting evidence");
    expect(() =>
      reconstruct(
        incident,
        evidence.map((e) => ({ ...e, incidentId: "other" })),
      ),
    ).toThrow("different incident");
    expect(reconstruct(incident, [...evidence, ...evidence])).toMatchObject({
      flagState: { refunds_v2: true },
    });
  } finally {
    store.close();
  }
});
