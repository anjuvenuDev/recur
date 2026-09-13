import {
  BasicTracerProvider,
  SimpleSpanProcessor,
  InMemorySpanExporter,
} from "@opentelemetry/sdk-trace-base";
import {
  SpanStatusCode,
  ROOT_CONTEXT,
  trace as otelTrace,
  type Attributes,
} from "@opentelemetry/api";
import { randomUUID } from "node:crypto";
import { EvidenceSchema, type Evidence } from "../../core/src/domain";
import { sanitize } from "../../core/src/evidence";
export function capture(incidentId: string) {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const tracer = provider.getTracer("recur-refund-service");
  const records: Evidence[] = [];
  const observe = (
    kind: Evidence["kind"],
    source: Evidence["source"],
    operation: string,
    payload: unknown,
  ) => {
    records.push(
      EvidenceSchema.parse({
        id: randomUUID(),
        incidentId,
        kind,
        source,
        operation,
        payload: sanitize(payload),
        traceId: root.spanContext().traceId,
        timestamp: new Date().toISOString(),
        sanitized: true,
      }),
    );
  };
  const root = tracer.startSpan("refund.request");
  return {
    records,
    observe,
    async span<T>(name: string, attributes: Attributes, fn: () => Promise<T>) {
      const s = tracer.startSpan(
        name,
        { attributes },
        otelTrace.setSpan(ROOT_CONTEXT, root),
      );
      try {
        const value = await fn();
        if (
          name === "feature_flag.read.refunds_v2" &&
          value &&
          typeof value === "object" &&
          "value" in value &&
          typeof value.value === "boolean"
        ) {
          s.setAttributes({
            "feature_flag.key": "refunds_v2",
            "feature_flag.value": value.value,
          });
        }
        return value;
      } catch (e) {
        s.setStatus({ code: SpanStatusCode.ERROR });
        throw e;
      } finally {
        s.end();
      }
    },
    async finish() {
      root.end();
      await provider.forceFlush();
      for (const s of exporter.getFinishedSpans()) {
        const context = s.spanContext();
        records.push(
          EvidenceSchema.parse({
            id: randomUUID(),
            incidentId,
            kind: "otel_span",
            source: "demo-service",
            operation: s.name,
            payload: sanitize(s.attributes),
            timestamp: new Date(
              s.startTime[0] * 1000 + s.startTime[1] / 1e6,
            ).toISOString(),
            traceId: context.traceId,
            spanId: context.spanId,
            sanitized: true,
          }),
        );
      }
      await provider.shutdown();
      return records;
    },
  };
}
