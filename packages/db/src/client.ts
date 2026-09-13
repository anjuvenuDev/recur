import { localClient } from "./connection";

import { createClient, type InStatement } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { resolve } from "node:path";
import { jobDdl } from "./jobs";
import { tables } from "./schema";
export type Table = keyof typeof tables;
export function createStore(
  url = process.env.DATABASE_URL ??
    `file:${resolve(process.env.RECUR_ROOT ?? process.cwd(), "recur.db")}`,
) {
  const client = localClient(url);
  const db = drizzle(client);
  let guard: { id: string; owner: string } | undefined;
  async function guardedWrite(statements: InStatement[]) {
    await ready;
    const tx = await client.transaction("write");
    try {
      if (guard) {
        const current = await tx.execute({
          sql: "SELECT id FROM run_jobs WHERE id=? AND owner=? AND status='running' AND lease_until>?",
          args: [guard.id, guard.owner, Date.now()],
        });
        if (!current.rows.length)
          throw new Error("Job lease was lost; state mutation rejected");
      }
      for (const statement of statements) await tx.execute(statement);
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    } finally {
      tx.close();
    }
  }
  const ready = (async () => {
    if (url !== ":memory:" && !url.includes(":memory:"))
      await client.execute("PRAGMA journal_mode=WAL");
    await client.batch(
      [
        ...Object.keys(tables).flatMap((name) => [
          `CREATE TABLE IF NOT EXISTS ${name} (id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, data TEXT NOT NULL)`,
          `CREATE INDEX IF NOT EXISTS idx_${name}_incident ON ${name}(incident_id)`,
        ]),
        ...jobDdl,
      ],
      "write",
    );
  })();
  void ready.catch(() => {});
  return {
    client,
    guardJob(id: string, owner: string) {
      guard = { id, owner };
    },
    async put(table: Table, id: string, incidentId: string, data: unknown) {
      await guardedWrite([
        {
          sql: `INSERT INTO ${table}(id,incident_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET incident_id=excluded.incident_id,data=excluded.data`,
          args: [id, incidentId, JSON.stringify(data)],
        },
      ]);
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
    async clear(options: { keepJobs?: boolean } = {}) {
      await ready;
      await guardedWrite([
        ...Object.keys(tables).map((n) => `DELETE FROM ${n}`),
        ...(!options.keepJobs ? ["DELETE FROM run_jobs"] : []),
      ]);
    },
    async deleteFor(table: Table, incidentId: string) {
      await guardedWrite([
        { sql: `DELETE FROM ${table} WHERE incident_id=?`, args: [incidentId] },
      ]);
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
