import { AsyncLocalStorage } from "node:async_hooks";

type TableMetric = { queries: number; rows: number; jsonPayloadBytes: number; durationMs: number };
type ReadMetric = { operation: string; tables: Record<string, TableMetric>; parent?: ReadMetric };

const storage = new AsyncLocalStorage<ReadMetric>();
const rounded = (value: number) => Math.round(value * 10) / 10;

/** Opt-in, aggregate measurements. JSON size is an application payload proxy,
 * never a claim about HTTP transfer or Supabase billed egress. */
export async function withAdleReadMetrics<T>(operation: string, run: () => Promise<T>): Promise<T> {
  if (process.env.ADLE_READ_METRICS_ENABLED !== "1") return run();
  const metric: ReadMetric = { operation, tables: {}, parent: storage.getStore() };
  const started = performance.now();
  let status: "ok" | "error" = "ok";
  try {
    return await storage.run(metric, run);
  } catch (error) {
    status = "error";
    throw error;
  } finally {
    const tables = Object.fromEntries(Object.entries(metric.tables).sort(([a], [b]) => a.localeCompare(b)));
    const values = Object.values(tables);
    console.info(JSON.stringify({
      event: "adle_read_metrics_v1",
      operation,
      parentOperation: metric.parent?.operation ?? null,
      status,
      durationMs: rounded(performance.now() - started),
      instrumentedQueryCount: values.reduce((sum, item) => sum + item.queries, 0),
      instrumentedRows: values.reduce((sum, item) => sum + item.rows, 0),
      instrumentedJsonPayloadBytes: values.reduce((sum, item) => sum + item.jsonPayloadBytes, 0),
      tables,
    }));
  }
}

export function recordAdleReadPage(table: string, rows: readonly unknown[], durationMs: number): void {
  const context = storage.getStore();
  if (!context) return;
  const jsonPayloadBytes = Buffer.byteLength(JSON.stringify(rows));
  for (let metric: ReadMetric | undefined = context; metric; metric = metric.parent) {
    const current = metric.tables[table] ?? { queries: 0, rows: 0, jsonPayloadBytes: 0, durationMs: 0 };
    current.queries += 1;
    current.rows += rows.length;
    current.jsonPayloadBytes += jsonPayloadBytes;
    current.durationMs = rounded(current.durationMs + durationMs);
    metric.tables[table] = current;
  }
}
