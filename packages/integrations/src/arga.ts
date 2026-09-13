import { z } from "zod";
const RunId = z.string().uuid();
export const ProvisionStatus = z.object({
  run_id: RunId,
  status: z.string(),
  expires_at: z.string().nullable().optional(),
  twins: z
    .record(
      z.string(),
      z
        .object({
          base_url: z.string().url().optional(),
          admin_url: z.string().url().optional(),
          env_vars: z.record(z.string(), z.string()).optional(),
        })
        .passthrough(),
    )
    .optional(),
  proxy_token: z.string().nullable().optional(),
  is_public: z.boolean().optional(),
});
export class ArgaControlPlane {
  constructor(
    private apiKey: string,
    private request: typeof fetch = fetch,
  ) {
    if (!apiKey) throw new Error("ARGA_API_KEY is required");
  }
  private async call(path: string, method = "GET", body?: unknown) {
    const response = await this.request(`https://api.argalabs.com${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(`Arga control plane returned HTTP ${response.status}`);
    return response.json();
  }
  async provision() {
    return z.object({ run_id: RunId }).parse(
      await this.call("/validate/twins/provision", "POST", {
        twins: ["stripe"],
        ttl_minutes: 60,
        public: true,
      }),
    );
  }
  async status(id: string) {
    return ProvisionStatus.parse(
      await this.call(`/validate/twins/provision/${RunId.parse(id)}/status`),
    );
  }
  async teardown(id: string) {
    return this.call(
      `/validate/twins/provision/${RunId.parse(id)}/teardown`,
      "POST",
    );
  }
}
export function assertTwinNotExpired(expiresAt = process.env.ARGA_EXPIRES_AT) {
  if (
    expiresAt &&
    (!Number.isFinite(Date.parse(expiresAt)) ||
      Date.parse(expiresAt) <= Date.now())
  )
    throw new Error(
      "Arga twin expired. Provision or configure a fresh environment before replaying.",
    );
}
