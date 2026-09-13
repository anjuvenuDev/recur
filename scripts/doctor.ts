import "dotenv/config";
import { existsSync } from "node:fs";
import { createStore } from "../packages/db/src/client";
import { workerReady } from "../packages/db/src/jobs";
const store = createStore();
try {
  await store.ready();
  const configured = (...keys: string[]) => keys.every((k) => !!process.env[k]);
  const status = {
    node: process.version,
    database: "ready",
    worker: (await workerReady(store)) ? "ready" : "not running",
    incidentCount: (await store.list("incidents")).length,
    integrations: {
      OpenAI: configured("OPENAI_API_KEY", "OPENAI_MODEL")
        ? "configured; run live acceptance"
        : "fixture mode",
      GitHub: configured(
        "GITHUB_OWNER",
        "GITHUB_REPO",
        "GITHUB_DEMO_COMMIT_SHA",
      )
        ? "configured; run live acceptance"
        : "fixture mode",
      LaunchDarkly: configured("LAUNCHDARKLY_SDK_KEY")
        ? "configured; run live acceptance"
        : "fixture mode",
      Arga:
        process.env.ARGA_ENABLED === "true" &&
        (configured("ARGA_STRIPE_BASE_URL") || existsSync(".recur/twin.json"))
          ? "configured; run live acceptance"
          : "local simulation",
      Userlens: configured("USERLENS_WRITE_CODE")
        ? "configured; inspect delivery receipt"
        : "not connected",
      Lemma: configured("LEMMA_API_KEY", "LEMMA_PROJECT_ID")
        ? "configured; inspect delivery receipt"
        : "not connected",
    },
    accessControl:
      process.env.RECUR_ACCESS_TOKEN?.length! >= 24
        ? "token configured"
        : "loopback only",
  };
  console.log(JSON.stringify(status, null, 2));
} finally {
  store.close();
}
