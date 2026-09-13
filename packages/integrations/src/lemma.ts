import { addTraceProcessor } from "@openai/agents";
import { openAIAgents } from "@uselemma/tracing";
import type { Store } from "../../db/src/client";
/** Register once in each isolated job process. Never send unsanitized source or evidence to agents. */
export function initializeLemma(jobId: string, incidentId: string) {
  const apiKey = process.env.LEMMA_API_KEY;
  const projectId = process.env.LEMMA_PROJECT_ID;
  let delivered = 0,
    failed = 0;
  const processor =
    apiKey && projectId
      ? openAIAgents({
          apiKey,
          projectId,
          release: process.env.RECUR_RELEASE ?? "0.1.0",
          metadata: { service: "recur", jobId, incidentId },
          fetch: async (input, init) => {
            try {
              const response = await fetch(input, {
                ...init,
                signal: AbortSignal.timeout(8000),
              });
              if (response.ok) delivered++;
              else failed++;
              return response;
            } catch (error) {
              failed++;
              throw error;
            }
          },
        })
      : null;
  if (processor) addTraceProcessor(processor);
  return {
    async flush(store: Store) {
      if (processor) {
        try {
          await processor.forceFlush();
          await processor.shutdown(10000);
        } catch {
          failed++;
        }
      }
      const id = `lemma_${jobId}`;
      await store.put("integration_receipts", id, incidentId, {
        id,
        incidentId,
        provider: "Lemma",
        createdAt: new Date().toISOString(),
        status: !processor
          ? "NOT CONNECTED"
          : failed
            ? "DELIVERY FAILED"
            : delivered
              ? "DELIVERED"
              : "NO SPANS",
        detail: !processor
          ? "Configure LEMMA_API_KEY and LEMMA_PROJECT_ID for agent traces."
          : `${delivered} successful trace requests; ${failed} failed requests.`,
        jobId,
      });
    },
  };
}
