import { ComparisonSchema, type Fingerprint } from "./domain";
export const normalizeMessage = (s: string) => s.trim();
export const normalizeFile = (s: string) =>
  s.replaceAll("\\", "/").split("/").at(-1) ?? s;
export function compareFingerprint(
  expected: Fingerprint,
  actual: Fingerprint | null,
) {
  const checks = [
    ["errorClass", expected.errorClass === actual?.errorClass],
    [
      "normalizedMessage",
      normalizeMessage(expected.normalizedMessage) ===
        normalizeMessage(actual?.normalizedMessage ?? ""),
    ],
    ["route", expected.route === actual?.route],
    ["statusCode", expected.statusCode === actual?.statusCode],
    [
      "file",
      normalizeFile(expected.topApplicationFrame.file) ===
        normalizeFile(actual?.topApplicationFrame.file ?? ""),
    ],
    [
      "function",
      expected.topApplicationFrame.function ===
        actual?.topApplicationFrame.function,
    ],
  ].map(([field, matched]) => ({
    field: String(field),
    matched: Boolean(matched),
    critical: true,
  }));
  const spans = expected.relevantSpanNames.every((n) =>
    actual?.relevantSpanNames.includes(n),
  );
  const effects =
    JSON.stringify(expected.relevantSideEffects) ===
    JSON.stringify(actual?.relevantSideEffects);
  const criticalMatched = checks.every((c) => c.matched) && spans;
  const fidelityScore =
    Math.round(
      ((checks.filter((c) => c.matched).length / 6) * 0.8 +
        (spans ? 0.1 : 0) +
        (effects ? 0.1 : 0)) *
        100,
    ) / 100;
  checks.push(
    { field: "causal spans", matched: spans, critical: true },
    { field: "side effects", matched: effects, critical: false },
  );
  return ComparisonSchema.parse({
    matched: criticalMatched && fidelityScore >= 0.9 && effects,
    fidelityScore,
    criticalMatched,
    checks,
    mismatches: checks.filter((c) => !c.matched).map((c) => c.field),
  });
}
