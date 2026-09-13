import { createClient, type Client } from "@libsql/client";
import { retryBusy } from "./retry";
// Serialize connections to the same file inside one event loop. A synchronous
// native busy timeout must never block the JS task that owns an open transaction.
const queues = new Map<string, Promise<void>>();
async function acquire(key: string) {
  const prior = queues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => {
    release = r;
  });
  queues.set(key, next);
  await prior;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    release();
    if (queues.get(key) === next) queues.delete(key);
  };
}
export function localClient(url: string): Client {
  const raw = createClient({ url, timeout: 3000, concurrency: 1 });
  const key = url.includes(":memory:") ? `${url}:${Math.random()}` : url;
  return new Proxy(raw, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      if (property === "transaction")
        return async (...args: unknown[]) => {
          const release = await acquire(key);
          try {
            const tx = await retryBusy(async () =>
              Reflect.apply(value, target, args),
            );
            return new Proxy(tx as object, {
              get(transaction, name) {
                const fn = Reflect.get(transaction, name, transaction);
                if (typeof fn !== "function") return fn;
                if (name === "close")
                  return () => {
                    try {
                      return Reflect.apply(fn, transaction, []);
                    } finally {
                      release();
                    }
                  };
                if (name === "commit" || name === "rollback")
                  return async () => {
                    try {
                      return await Reflect.apply(fn, transaction, []);
                    } finally {
                      release();
                    }
                  };
                return fn.bind(transaction);
              },
            });
          } catch (e) {
            release();
            throw e;
          }
        };
      if (["execute", "batch", "executeMultiple"].includes(String(property)))
        return async (...args: unknown[]) => {
          const release = await acquire(key);
          try {
            return await retryBusy(async () =>
              Reflect.apply(value, target, args),
            );
          } finally {
            release();
          }
        };
      return value.bind(target);
    },
  });
}
