import { sqliteTable, text } from "drizzle-orm/sqlite-core";
const entity = (name: string) =>
  sqliteTable(name, {
    id: text("id").primaryKey(),
    incidentId: text("incident_id").notNull(),
    data: text("data", { mode: "json" }).$type<unknown>().notNull(),
  });
export const incidents = entity("incidents");
export const evidence = entity("evidence");
export const attempts = entity("attempts");
export const capsules = entity("capsules");
export const run_events = entity("run_events");
export const demo_customers = entity("demo_customers");
export const demo_refund_requests = entity("demo_refund_requests");
export const tables = {
  incidents,
  evidence,
  attempts,
  capsules,
  run_events,
  demo_customers,
  demo_refund_requests,
};
