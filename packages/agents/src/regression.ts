import { randomUUID } from "node:crypto";
import { assertSourceVersion } from "../../integrations/src/source-version";
import { verifyCapsule } from "../../core/src/integrity";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ts from "typescript";
import type { Capsule } from "../../core/src/domain";
import { capsulePlan } from "../../core/src/capsule";
import { executePlan } from "../../../apps/demo-service/src/replay";
import { compareFingerprint } from "../../core/src/fingerprint";
import { authorRegression } from "./coordinator";
const exec = promisify(execFile);
export function regressionTemplate(capsule: Capsule) {
  return `import { expect, it } from 'vitest';
import { executePlan } from '../../apps/demo-service/src/replay';
import { capsulePlan } from '../../packages/core/src/capsule';
import { CapsuleSchema } from '../../packages/core/src/domain';
const capsule = CapsuleSchema.parse(${JSON.stringify(capsule, null, 2)});
it('refunds remaining balance after a partial refund with refunds_v2 enabled', async () => {
  const plan = capsulePlan(capsule, process.env.RECUR_REGRESSION_MODE === 'buggy' ? 'buggy' : 'fixed');
  const { result } = await executePlan(plan, { local: true });
  expect(result.status).toBe(200);
  expect(result.refunds.reduce((sum, refund) => sum + refund.amount, 0)).toBe(10000);
  expect(result.refunds).toHaveLength(2);
  expect(result.sideEffects).toEqual([{ operation: 'stripe.refund.create', amount: 6000 }]);
});
`;
}
export async function generateRegression(capsule: Capsule) {
  verifyCapsule(capsule);
  await assertSourceVersion(capsule.code.sourceDigest);
  const template = regressionTemplate(capsule);
  const authored = await authorRegression(template);
  // The author may explain, but executable text must match the bounded template before running.
  if (authored.code.trim() !== template.trim())
    throw new Error("Generated test exceeds approved template");
  const transpiled = ts.transpileModule(authored.code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
    reportDiagnostics: true,
  });
  if (transpiled.diagnostics?.length)
    throw new Error("Generated test failed TypeScript parsing");
  const root = process.env.RECUR_ROOT ?? process.cwd();
  const dir = resolve(root, "artifacts/regression");
  await mkdir(dir, { recursive: true });
  const file = resolve(dir, `${capsule.id}.test.ts`);
  await writeFile(file, authored.code);
  const run = async (mode: string) => {
    const reportFile = resolve(
      dir,
      `${capsule.id}-${mode}-${randomUUID()}.json`,
    );
    let passed = false;
    let output = "";
    try {
      const r = await exec(
        process.execPath,
        [
          resolve(root, "node_modules/vitest/vitest.mjs"),
          "run",
          "--config",
          resolve(root, "vitest.regression.config.ts"),
          file,
          "--reporter=json",
          `--outputFile=${reportFile}`,
        ],
        {
          cwd: root,
          env: {
            PATH: process.env.PATH,
            RECUR_ROOT: root,
            NODE_ENV: "test",
            RECUR_REGRESSION_MODE: mode,
            OPENAI_API_KEY: "",
            NO_COLOR: "1",
          },
          timeout: 45000,
          maxBuffer: 1000000,
        },
      );
      passed = true;
      output = r.stdout;
    } catch (error) {
      output = (error as Error).message;
    }
    try {
      output = await readFile(reportFile, "utf8");
    } catch {}
    let reportValid = false;
    try {
      const report = JSON.parse(output);
      reportValid =
        report.numTotalTests === 1 &&
        (report.numRuntimeErrorTestSuites ?? 0) === 0 &&
        report.testResults?.length === 1 &&
        report.testResults[0].assertionResults?.length === 1 &&
        (mode === "fixed"
          ? report.numPassedTests === 1
          : report.numFailedTests === 1);
    } catch {}
    return { passed, output, reportValid };
  };
  const buggy = await run("buggy");
  const fixed = await run("fixed");
  const valid =
    !buggy.passed &&
    fixed.passed &&
    buggy.reportValid &&
    fixed.reportValid &&
    buggy.output.includes("expected 500 to be 200");
  return {
    code: authored.code,
    explanation: authored.explanation,
    valid,
    buggyFails: !buggy.passed,
    fixedPasses: fixed.passed,
    buggyOutput: buggy.output,
    fixedOutput: fixed.output,
  };
}
export async function verifyFix(capsule: Capsule) {
  verifyCapsule(capsule);
  await assertSourceVersion(capsule.code.sourceDigest);
  const { result, stripeMode } = await executePlan(
    capsulePlan(capsule, "fixed"),
  );
  const comparison = compareFingerprint(
    capsule.productionFingerprint,
    result.fingerprint,
  );
  const passed =
    result.status === 200 &&
    result.refunds.length === 2 &&
    result.refunds.reduce((n, r) => n + r.amount, 0) === 10000 &&
    result.sideEffects.length === 1 &&
    result.sideEffects[0]?.amount === 6000;
  return {
    passed,
    originalFailureGone: !comparison.matched,
    result,
    stripeMode,
  };
}
export async function ablate(capsule: Capsule) {
  verifyCapsule(capsule);
  await assertSourceVersion(capsule.code.sourceDigest);
  return Promise.all(
    ["flag", "prior refund", "code", "DB refund request"].map(
      async (component) => {
        const plan = capsulePlan(capsule);
        if (component === "flag") plan.flagState.refunds_v2 = false;
        if (component === "prior refund") {
          plan.stripeState.refunds = [];
          plan.stripeState.charge.amount_refunded = 0;
        }
        if (component === "code") plan.codeMode = "fixed";
        if (component === "DB refund request")
          plan.dbFixtures = plan.dbFixtures.filter(
            (f) => f.table !== "demo_refund_requests",
          );
        const { result } = await executePlan(plan, { local: true });
        return {
          component,
          matched: compareFingerprint(
            capsule.productionFingerprint,
            result.fingerprint,
          ).matched,
          status: result.status,
          error: result.fingerprint?.errorClass ?? null,
        };
      },
    ),
  );
}
