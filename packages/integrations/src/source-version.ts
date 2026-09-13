import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sourceDigest } from "../../core/src/integrity";
export async function assertSourceVersion(expected: string) {
  const root = process.env.RECUR_ROOT ?? process.cwd();
  const source = await readFile(
    resolve(root, "apps/demo-service/src/services/refund-service.ts"),
    "utf8",
  );
  if (sourceDigest(source) !== expected)
    throw new Error(
      "Source version mismatch: checkout the capsule code version or capture a new incident",
    );
}
