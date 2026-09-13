import { setTimeout as delay } from "node:timers/promises";
/** SQLITE_BUSY means the statement/transaction could not acquire its lock. Never use this for external calls. */
export async function retryBusy<T>(
  operation: () => Promise<T>,
  deadlineMs = 3000,
): Promise<T> {
  const deadline = Date.now() + deadlineMs;
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (
        !["SQLITE_BUSY", "TRANSACTION_ACTIVE"].includes(
          (error as { code?: string })?.code ?? "",
        ) ||
        Date.now() >= deadline
      )
        throw error;
      await delay(Math.min(10 * 2 ** attempt++, 100));
    }
  }
}
