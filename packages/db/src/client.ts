import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { resolve } from "node:path";
import { tables } from "./schema";
export type Table = keyof typeof tables;
export function createStore(
  url = process.env.DATABASE_URL ??
    `file:${resolve(process.env.RECUR_ROOT ?? process.cwd(), "recur.db")}`,
) {
  const client = createClient({ url });
  const db = drizzle(client);
  const ready = client.batch(
    Object.keys(tables).map(
      (name) =>
        `CREATE TABLE IF NOT EXISTS ${name} (id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, data TEXT NOT NULL)`,
    ),
    "write",
  );
  return {
    client,
    async put(table: Table, id: string, incidentId: string, data: unknown) {
      await ready;
      await db
        .insert(tables[table])
        .values({ id, incidentId, data })
        .onConflictDoUpdate({
          target: tables[table].id,
          set: { data, incidentId },
        });
    },
    async get(table: Table, id: string) {
      await ready;
      return (
        await db.select().from(tables[table]).where(eq(tables[table].id, id))
      )[0]?.data;
    },
    async list(table: Table, incidentId?: string) {
      await ready;
      const query = db.select().from(tables[table]);
      return (
        await (incidentId
          ? query.where(eq(tables[table].incidentId, incidentId))
          : query)
      ).map((r) => r.data);
    },
    async clear() {
      await ready;
      await client.batch(
        Object.keys(tables).map((n) => `DELETE FROM ${n}`),
        "write",
      );
    },
    async deleteFor(table: Table, incidentId: string) {
      await ready;
      await db
        .delete(tables[table])
        .where(eq(tables[table].incidentId, incidentId));
    },
    async ready() {
      await ready;
    },
    close() {
      client.close();
    },
  };
}
export type Store = ReturnType<typeof createStore>;
