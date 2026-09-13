import "dotenv/config";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ArgaControlPlane } from "../packages/integrations/src/arga";
import { validateTwinUrl } from "../packages/integrations/src/stripe";
const root = process.env.RECUR_ROOT ?? process.cwd();
const directory = resolve(root, ".recur");
const file = resolve(directory, "twin.json");
const control = new ArgaControlPlane(process.env.ARGA_API_KEY ?? "");
const command = process.argv[2] ?? "status";
if (command === "provision") {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const { run_id } = await control.provision();
  await writeFile(
    file,
    JSON.stringify({ run_id, status: "provisioning" }, null, 2),
    { mode: 0o600 },
  );
  console.log(`Arga run ${run_id}: provisioning one Stripe twin`);
  for (let count = 0; count < 90; count++) {
    const status = await control.status(run_id);
    await writeFile(file, JSON.stringify(status, null, 2), { mode: 0o600 });
    if (status.status === "ready") {
      const base = status.twins?.stripe?.base_url;
      if (!base) throw new Error("Ready response has no Stripe endpoint");
      validateTwinUrl(base, "sk_test_recur_twin");
      console.log(
        `Ready. Expires ${status.expires_at}. Private configuration saved to .recur/twin.json. Restart pnpm dev with ARGA_ENABLED=true.`,
      );
      break;
    }
    if (["failed", "expired", "cancelled"].includes(status.status))
      throw new Error(`Provisioning ended: ${status.status}`);
    if (count === 89)
      throw new Error(
        `Provisioning timed out. Run pnpm arga:status to inspect ${run_id}; do not provision again blindly.`,
      );
    await delay(2000);
  }
} else {
  const saved = JSON.parse(await readFile(file, "utf8"));
  if (command === "teardown") {
    await control.teardown(saved.run_id);
    console.log(`Teardown requested for ${saved.run_id}`);
  } else {
    const s = await control.status(saved.run_id);
    console.log(
      JSON.stringify(
        { runId: s.run_id, status: s.status, expiresAt: s.expires_at },
        null,
        2,
      ),
    );
  }
}
