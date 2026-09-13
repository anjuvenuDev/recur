import { it, expect } from "vitest";
import { ArgaControlPlane, assertTwinNotExpired } from "./arga";
const id = "00000000-0000-4000-8000-000000000001";
it("uses the documented Arga lifecycle contract without implicit provision retries", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const request: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json(
      init?.method === "POST"
        ? { run_id: id, status: "cleaning_up" }
        : {
            run_id: id,
            status: "ready",
            expires_at: "2099-01-01T00:00:00Z",
            twins: { stripe: { base_url: "https://stripe.arga.run" } },
          },
    );
  };
  const control = new ArgaControlPlane("synthetic", request);
  expect(await control.provision()).toEqual({ run_id: id });
  expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
    twins: ["stripe"],
    ttl_minutes: 60,
    public: true,
  });
  expect((await control.status(id)).status).toBe("ready");
  await control.teardown(id);
  expect(calls.map((c) => c.url)).toEqual([
    "https://api.argalabs.com/validate/twins/provision",
    `https://api.argalabs.com/validate/twins/provision/${id}/status`,
    `https://api.argalabs.com/validate/twins/provision/${id}/teardown`,
  ]);
  await expect(control.status("../evil")).rejects.toThrow();
});
it("fails closed on expired twins, absent credentials, HTTP failures and invalid responses", async () => {
  expect(() => new ArgaControlPlane("")).toThrow();
  expect(() => assertTwinNotExpired("2000-01-01")).toThrow("expired");
  expect(() => assertTwinNotExpired("bad")).toThrow();
  expect(() => assertTwinNotExpired("2099-01-01")).not.toThrow();
  await expect(
    new ArgaControlPlane(
      "x",
      async () => new Response("", { status: 401 }),
    ).provision(),
  ).rejects.toThrow("HTTP 401");
  await expect(
    new ArgaControlPlane("x", async () =>
      Response.json({ status: "ready" }),
    ).status(id),
  ).rejects.toThrow();
});
