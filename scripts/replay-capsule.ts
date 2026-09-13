import { assertSourceVersion } from "../packages/integrations/src/source-version";
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { CapsuleSchema } from "../packages/core/src/domain";
import { capsulePlan } from "../packages/core/src/capsule";
import { compareFingerprint } from "../packages/core/src/fingerprint";
import { executePlan } from "../apps/demo-service/src/replay";
const file = process.argv[2];
if (!file) throw new Error("Usage: pnpm capsule:replay <capsule.json> [fixed]");
const capsule = CapsuleSchema.parse(JSON.parse(await readFile(file, "utf8")));
await assertSourceVersion(capsule.code.sourceDigest);
const mode = process.argv[3] === "fixed" ? "fixed" : "buggy";
const { result } = await executePlan(capsulePlan(capsule, mode), {
  local: true,
});
const comparison = compareFingerprint(
  capsule.productionFingerprint,
  result.fingerprint,
);
console.log(JSON.stringify({ mode, result, comparison }, null, 2));
if (mode === "buggy" ? !comparison.matched : result.status !== 200)
  process.exitCode = 1;
