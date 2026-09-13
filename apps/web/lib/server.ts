import { resolve } from "node:path";
import { config } from "dotenv";
import { createStore } from "../../../packages/db/src/client";
import { seedIncident } from "../../../packages/db/src/seed";
const root = process.env.RECUR_ROOT ?? resolve(process.cwd(), "../..");
config({ path: resolve(root, ".env"), quiet: true });
process.env.RECUR_ROOT = root;
if (!process.env.DATABASE_URL?.startsWith("file:/"))
  process.env.DATABASE_URL = `file:${resolve(root, (process.env.DATABASE_URL ?? "file:./recur.db").replace(/^file:/, ""))}`;
const globalStore = globalThis as typeof globalThis & {
  recurStore?: ReturnType<typeof createStore>;
  recurJobs?: Set<string>;
  recurSeed?: Promise<unknown>;
};
export const store = (globalStore.recurStore ??= createStore());
export const jobs = (globalStore.recurJobs ??= new Set());
export async function ensureSeed() {
  globalStore.recurSeed ??= seedIncident(store).catch((e) => {
    globalStore.recurSeed = undefined;
    throw e;
  });
  await globalStore.recurSeed;
}
export function clearSeed() {
  globalStore.recurSeed = undefined;
}
