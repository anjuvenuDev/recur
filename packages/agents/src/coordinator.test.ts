import { it, expect } from "vitest";
import {
  Usage,
  type Model,
  type ModelRequest,
  type ModelResponse,
} from "@openai/agents";
import {
  analyze,
  fixtureAnalysis,
  refinePlan,
  authorRegression,
} from "./coordinator";
import { heroPlan } from "../../core/src/fixtures";
import { createStore } from "../../db/src/client";
import { seedIncident } from "../../db/src/seed";
import { EvidenceSchema } from "../../core/src/domain";
class ScriptedModel implements Model {
  calls: ModelRequest[] = [];
  constructor(
    private answer: unknown,
    private skipTool = false,
  ) {}
  async getResponse(request: ModelRequest): Promise<ModelResponse> {
    this.calls.push(request);
    const hasResult =
      Array.isArray(request.input) &&
      request.input.some((i) => i.type === "function_call_result");
    const tool = request.tools[0];
    if (tool?.type === "function" && !hasResult && !this.skipTool)
      return {
        usage: new Usage(),
        output: [
          {
            type: "function_call",
            name: tool.name,
            callId: "test-call",
            arguments: JSON.stringify({
              input: "Use the supplied observations.",
            }),
          },
        ],
      };
    return {
      usage: new Usage(),
      output: [
        {
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: JSON.stringify(this.answer) }],
        },
      ],
    };
  }
  async *getStreamedResponse(): AsyncIterable<never> {
    throw new Error("Streaming not used");
  }
}
it("executes manager → specialist → manager through the actual Agents SDK", async () => {
  const store = createStore("file::memory:");
  try {
    const incident = await seedIncident(store, true);
    const evidence = (await store.list("evidence")).map((e) =>
      EvidenceSchema.parse(e),
    );
    const expected = fixtureAnalysis(evidence);
    const model = new ScriptedModel(expected);
    expect(await analyze(incident, evidence, model)).toMatchObject({
      mode: "CONNECTED",
      analysis: expected,
    });
    expect(model.calls).toHaveLength(3);
  } finally {
    store.close();
  }
});
it("rejects invented evidence and a coordinator that skips its specialist after one retry", async () => {
  const store = createStore("file::memory:");
  try {
    const incident = await seedIncident(store, true);
    const evidence = (await store.list("evidence")).map((e) =>
      EvidenceSchema.parse(e),
    );
    const expected = fixtureAnalysis(evidence);
    const invented = new ScriptedModel({
      ...expected,
      requiredEvidenceIds: ["invented"],
    });
    await expect(analyze(incident, evidence, invented)).rejects.toThrow(
      "after one retry",
    );
    expect(invented.calls).toHaveLength(6);
    const skipped = new ScriptedModel(expected, true);
    await expect(analyze(incident, evidence, skipped)).rejects.toThrow(
      "after one retry",
    );
    expect(skipped.calls).toHaveLength(2);
  } finally {
    store.close();
  }
});
it("accepts observed reconstruction but rejects invented financial state", async () => {
  const plan = heroPlan();
  const output = {
    refundsV2: true,
    chargeAmount: 10000,
    priorRefundAmounts: [4000],
    fixtureIds: plan.dbFixtures.map((f) => f.id),
    codeMode: "buggy",
    missingEvidenceRequests: [],
  };
  expect(await refinePlan(plan, ["flag"], new ScriptedModel(output))).toEqual(
    plan,
  );
  await expect(
    refinePlan(
      plan,
      [],
      new ScriptedModel({ ...output, chargeAmount: 1000000 }),
    ),
  ).rejects.toThrow("after one retry");
});
it("compiles only a complete regression assertion proposal", async () => {
  const proposal = {
    assertions: [
      "http_200",
      "total_refunded_10000",
      "two_refunds",
      "single_remaining_refund_6000",
    ],
    explanation:
      "Every postcondition prevents a superficially successful but financially incorrect fix.",
  };
  expect(
    await authorRegression("trusted template", new ScriptedModel(proposal)),
  ).toMatchObject({ code: "trusted template" });
  await expect(
    authorRegression(
      "trusted template",
      new ScriptedModel({ ...proposal, assertions: ["http_200"] }),
    ),
  ).rejects.toThrow("omitted");
});
