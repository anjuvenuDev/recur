import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function authorize(
  request: Request,
  token = process.env.RECUR_ACCESS_TOKEN,
) {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  let hostname: string;
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    throw new HttpError(400, "Invalid host");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  if (!local && !token)
    throw new HttpError(503, "Shared access requires RECUR_ACCESS_TOKEN");
  if (token) {
    if (token.length < 24)
      throw new HttpError(503, "Access token must have at least 24 characters");
    const authorization = request.headers.get("authorization") ?? "";
    let supplied = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";
    if (authorization.startsWith("Basic ")) {
      try {
        const basic = Buffer.from(authorization.slice(6), "base64").toString(
          "utf8",
        );
        supplied = basic.slice(basic.indexOf(":") + 1);
      } catch {}
    }
    const a = Buffer.from(supplied),
      b = Buffer.from(token);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      throw new HttpError(401, "Authentication required");
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin && origin !== `${url.protocol}//${host}`)
      throw new HttpError(403, "Origin denied");
    if (request.headers.get("sec-fetch-site") === "cross-site")
      throw new HttpError(403, "Cross-site request denied");
  }
}
export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  limit = 16384,
): Promise<T> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    throw new HttpError(415, "Use application/json");
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared > limit)
    throw new HttpError(413, "Request body too large");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "JSON body required");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > limit) {
        await reader.cancel();
        throw new HttpError(413, "Request body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let data: unknown;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Malformed JSON");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new HttpError(400, "Invalid request fields");
  return parsed.data;
}
export const securityHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};
