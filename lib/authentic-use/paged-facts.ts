type Result = { data: unknown; error: { message: string } | null };
export type FactQuery = PromiseLike<Result>;
type PagedQuery = FactQuery & { order(column: string): PagedQuery; range(from: number, to: number): PagedQuery };

/** Avoid silently truncating retained evidence at PostgREST's page limit. */
export async function readProficiencyFactRows<T>(query: FactQuery, context: string, order = ["id"]): Promise<T[]> {
  let ordered = query as PagedQuery;
  for (const key of order) ordered = ordered.order(key);
  const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const response = await ordered.range(offset, offset + 499);
    if (response.error) throw new Error(`${context}: ${response.error.message}`);
    const page = (response.data ?? []) as T[];
    result.push(...page);
    if (page.length < 500) return result;
  }
}
