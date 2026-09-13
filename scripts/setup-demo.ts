import "dotenv/config";
import { createStore } from "../packages/db/src/client";
const store = createStore();
await store.ready();
store.close();
console.log("SQLite schema ready");
