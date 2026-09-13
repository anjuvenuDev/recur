export const MAX_REPRO_ATTEMPTS = 3;
export type Phase =
  | "INGESTED"
  | "ANALYZING"
  | "PLANNED"
  | "PROVISIONING"
  | "REPLAYING"
  | "COMPARING"
  | "REFINING"
  | "REPRODUCED"
  | "NOT_REPRODUCED";
const edges: Record<Phase, Phase[]> = {
  INGESTED: ["ANALYZING"],
  ANALYZING: ["PLANNED", "NOT_REPRODUCED"],
  PLANNED: ["PROVISIONING", "NOT_REPRODUCED"],
  PROVISIONING: ["REPLAYING", "NOT_REPRODUCED"],
  REPLAYING: ["COMPARING", "NOT_REPRODUCED"],
  COMPARING: ["REPRODUCED", "REFINING", "NOT_REPRODUCED"],
  REFINING: ["PLANNED", "NOT_REPRODUCED"],
  REPRODUCED: [],
  NOT_REPRODUCED: [],
};
export function transition(from: Phase, to: Phase) {
  if (!edges[from].includes(to))
    throw new Error(`Invalid transition ${from} → ${to}`);
  return to;
}
export function idempotencyKey(incidentId: string, attemptId: string) {
  return `recur:${incidentId}:${attemptId}:refund`;
}
