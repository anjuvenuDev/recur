import { createHash, timingSafeEqual } from "node:crypto";
import { CapsuleSchema, type Capsule } from "./domain";
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
    .join(",")}}`;
}
export const digest = (value: unknown) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");
export const sourceDigest = (source: string) =>
  createHash("sha256").update(source.replaceAll("\r\n", "\n")).digest("hex");
export function sealCapsule(raw: unknown): Capsule {
  const object = raw as Record<string, unknown>;
  const { integrity: _, ...payload } = object;
  const parsed = CapsuleSchema.omit({ integrity: true }).parse(payload);
  return CapsuleSchema.parse({
    ...parsed,
    integrity: { algorithm: "sha256", digest: digest(parsed) },
  });
}
export function verifyCapsule(raw: unknown): Capsule {
  const capsule = CapsuleSchema.parse(raw);
  const { integrity, ...payload } = capsule;
  const actual = digest(payload);
  if (
    !timingSafeEqual(
      Buffer.from(actual, "hex"),
      Buffer.from(integrity.digest, "hex"),
    )
  )
    throw new Error("Capsule integrity mismatch: exported state has changed");
  return capsule;
}
