import type { Evidence } from "./domain";
export function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /secret|token|authorization|password|api.?key|email|phone|address/i.test(
          k,
        )
          ? "[REDACTED]"
          : sanitize(v),
      ]),
    );
  if (typeof value === "string")
    return value
      .replace(
        /(?:sk_(?:live|test|proj)_|Bearer\s+)[A-Za-z0-9_-]+/g,
        "[REDACTED]",
      )
      .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[REDACTED]");
  return value;
}
export function deduplicate(records: Evidence[]) {
  const seen = new Set<string>();
  return records.filter((e) => {
    const key = JSON.stringify([e.kind, e.source, e.operation, e.payload]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
