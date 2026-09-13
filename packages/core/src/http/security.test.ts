import { it, expect } from "vitest";
import { z } from "zod";
import { authorize, readJson } from "./security";
const request = (headers: Record<string, string> = {}, body = "{}") =>
  new Request("http://localhost:3000/api/demo/reset", {
    method: "POST",
    headers: {
      host: "localhost:3000",
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
it("allows loopback and rejects unconfigured shared access", () => {
  expect(() => authorize(request(), undefined)).not.toThrow();
  expect(() =>
    authorize(request({ host: "public.example.com" }), undefined),
  ).toThrow("requires");
});
it("enforces strong tokens with bearer and browser basic auth", () => {
  const token = "x".repeat(32);
  expect(() => authorize(request(), token)).toThrow("Authentication");
  expect(() =>
    authorize(request({ authorization: `Bearer ${token}` }), token),
  ).not.toThrow();
  expect(() =>
    authorize(
      request({
        authorization: `Basic ${Buffer.from(`recur:${token}`).toString("base64")}`,
      }),
      token,
    ),
  ).not.toThrow();
  expect(() => authorize(request(), "weak")).toThrow("at least");
});
it("blocks cross-site writes, malformed JSON, unknown fields and oversized bodies", async () => {
  expect(() =>
    authorize(request({ origin: "https://attacker.example" })),
  ).toThrow("Origin");
  expect(() => authorize(request({ "sec-fetch-site": "cross-site" }))).toThrow(
    "Cross-site",
  );
  await expect(
    readJson(request({}, "{"), z.object({}).strict()),
  ).rejects.toThrow("Malformed");
  await expect(
    readJson(request({}, '{"shell":"rm"}'), z.object({}).strict()),
  ).rejects.toThrow("Invalid request");
  await expect(
    readJson(request({}, " ".repeat(200)), z.unknown(), 100),
  ).rejects.toThrow("too large");
  await expect(
    readJson(request({ "content-type": "text/plain" }), z.unknown()),
  ).rejects.toThrow("application/json");
});
