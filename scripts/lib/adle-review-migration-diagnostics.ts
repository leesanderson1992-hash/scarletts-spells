type PostgreSqlError = {
  code?: unknown;
  message?: unknown;
  position?: unknown;
};

const MAX_CONTEXT_CHARACTERS = 900;
const CONTEXT_RADIUS = Math.floor(MAX_CONTEXT_CHARACTERS / 2);

function diagnosticValue(value: unknown, fallback = "unavailable"): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function boundedMigrationSqlContext(sql: string, rawPosition: unknown): {
  column: number | null;
  context: string;
  line: number | null;
  position: number | null;
} {
  const parsed = typeof rawPosition === "string" || typeof rawPosition === "number"
    ? Number.parseInt(String(rawPosition), 10)
    : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > sql.length) {
    return { column: null, context: sql.slice(0, MAX_CONTEXT_CHARACTERS).trim(), line: null, position: null };
  }

  const offset = parsed - 1;
  const prefix = sql.slice(0, offset);
  const line = prefix.split("\n").length;
  const previousNewline = sql.lastIndexOf("\n", offset - 1);
  const column = offset - previousNewline;
  const start = Math.max(0, offset - CONTEXT_RADIUS);
  const end = Math.min(sql.length, offset + CONTEXT_RADIUS);
  const context = `${start > 0 ? "…" : ""}${sql.slice(start, end).trim()}${end < sql.length ? "…" : ""}`;
  return { column, context, line, position: parsed };
}

export function formatMigrationFailureDiagnostic(
  filename: string,
  sql: string,
  error: unknown,
): string {
  const diagnostic = error && typeof error === "object" ? error as PostgreSqlError : {};
  const location = boundedMigrationSqlContext(sql, diagnostic.position);
  return [
    `Migration failed: ${filename}`,
    `Migration version: ${filename.slice(0, 14)}`,
    `PostgreSQL SQLSTATE: ${diagnosticValue(diagnostic.code)}`,
    `PostgreSQL message: ${diagnosticValue(diagnostic.message, String(error))}`,
    `PostgreSQL position: ${location.position ?? "unavailable"}`,
    `SQL location: ${location.line === null ? "unavailable" : `line ${location.line}, column ${location.column}`}`,
    "Bounded SQL context:",
    location.context || "unavailable",
  ].join("\n");
}
