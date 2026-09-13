import "dotenv/config";
import { createStore } from "../packages/db/src/client";
import { seedIncident } from "../packages/db/src/seed";
import { closeFlags } from "../packages/integrations/src/flags";
const store = createStore();
try {
  const incident = await seedIncident(store);
  console.log(
    `Seeded ${incident.id} from an executed ${incident.productionFingerprint.errorClass}`,
  );
} finally {
  store.close();
  closeFlags();
}
