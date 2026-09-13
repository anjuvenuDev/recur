import "dotenv/config";
import { createStore } from "../packages/db/src/client";
const store = createStore();
await store.clear();
store.close();
console.log("Demo DB cleared. Run pnpm demo:seed.");
