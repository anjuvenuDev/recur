import { mkdir, writeFile } from "node:fs/promises";
import { stressEvals } from "../packages/evals/stress";
const report = await stressEvals(Number(process.argv[2] ?? 200));
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/stress-evals.json", JSON.stringify(report, null, 2));
const { results, ...summary } = report;
console.log(JSON.stringify(summary, null, 2));
if (report.passed !== report.count) process.exitCode = 1;
