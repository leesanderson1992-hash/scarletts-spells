export const ENRICHMENT_READ_PAGE_SIZE = 500;

export async function collectEnrichmentPages<T>(
  readPage: (offset: number, endInclusive: number) => Promise<readonly T[]>,
  pageSize = ENRICHMENT_READ_PAGE_SIZE,
) {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("ENRICHMENT_PAGE_SIZE_INVALID");
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await readPage(offset, offset + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
