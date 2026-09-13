import { init, type LDClient } from "@launchdarkly/node-server-sdk";
import { z } from "zod";
export const FlagReadSchema = z.object({
  key: z.string(),
  value: z.boolean(),
  source: z.enum(["LaunchDarkly Live", "LaunchDarkly Fixture"]),
  reason: z.string(),
});
export interface FeatureFlagProvider {
  getBooleanFlag(
    key: string,
    context: { key: string },
    defaultValue: boolean,
  ): Promise<z.infer<typeof FlagReadSchema>>;
  describeFlag(key: string): Promise<unknown>;
}
export class FixtureFeatureFlagProvider implements FeatureFlagProvider {
  constructor(private value = true) {}
  async getBooleanFlag(key: string) {
    return FlagReadSchema.parse({
      key,
      value: this.value,
      source: "LaunchDarkly Fixture",
      reason: "Frozen reconstructed state",
    });
  }
  async describeFlag(key: string) {
    return { key, value: this.value, source: "LaunchDarkly Fixture" };
  }
}
let client: LDClient | undefined;
export class LiveFeatureFlagProvider implements FeatureFlagProvider {
  async getBooleanFlag(
    key: string,
    context: { key: string },
    defaultValue: boolean,
  ) {
    client ??= init(process.env.LAUNCHDARKLY_SDK_KEY!, {
      sendEvents: false,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    });
    await client.waitForInitialization({ timeout: 8 });
    const d = await client.variationDetail(
      key,
      { kind: "user", key: context.key },
      defaultValue,
    );
    if (d.reason.kind === "ERROR")
      throw new Error("LaunchDarkly evaluation failed");
    return FlagReadSchema.parse({
      key,
      value: d.value,
      source: "LaunchDarkly Live",
      reason: d.reason.kind,
    });
  }
  async describeFlag(key: string) {
    const project = process.env.LAUNCHDARKLY_PROJECT_KEY;
    if (!project || !process.env.LAUNCHDARKLY_API_TOKEN)
      throw new Error("LaunchDarkly inspection credentials missing");
    const r = await fetch(
      `https://app.launchdarkly.com/api/v2/flags/${encodeURIComponent(project)}/${encodeURIComponent(key)}`,
      {
        headers: { Authorization: process.env.LAUNCHDARKLY_API_TOKEN },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!r.ok) throw new Error(`LaunchDarkly inspection HTTP ${r.status}`);
    return z
      .object({ key: z.string(), name: z.string() })
      .parse(await r.json());
  }
}
export const flagProvider = (): FeatureFlagProvider =>
  process.env.LAUNCHDARKLY_SDK_KEY
    ? new LiveFeatureFlagProvider()
    : new FixtureFeatureFlagProvider();
export function closeFlags() {
  client?.close();
  client = undefined;
}
