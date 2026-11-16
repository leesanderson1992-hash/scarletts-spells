export const CATALOGUE_PATH = "/admin/teaching-dictionary";
export const CATALOGUE_PAGE_SIZE = 50;

export const CATALOGUE_FILTERS = {
  all: "All active words",
  missing_metadata: "Missing core facts or dictation",
  evidence_approved: "Evidence approved",
  route_blocked: "Prefix, suffix or base member missing",
  awaiting_british_recording: "Awaiting British recording (device voice)",
} as const;

type CatalogueFilter = keyof typeof CATALOGUE_FILTERS;
export type CatalogueQuery = { q?: string; filter?: string; page?: string; child?: string; from?: string };

export function readCatalogueQuery(params: CatalogueQuery) {
  const requestedFilter = params.filter === "device_voice" ? "awaiting_british_recording"
    : typeof params.filter === "string" ? params.filter : "all";
  const filter = Object.hasOwn(CATALOGUE_FILTERS, requestedFilter) ? requestedFilter as CatalogueFilter : "all";
  const requestedPage = typeof params.page === "string" ? Number.parseInt(params.page, 10) : 1;
  // The paging RPC takes a PostgreSQL integer offset.
  const page = requestedPage > 0 && requestedPage <= Math.floor(2_147_483_647 / CATALOGUE_PAGE_SIZE)
    ? requestedPage : 1;
  return {
    q: typeof params.q === "string" ? params.q.trim().toLocaleLowerCase("en-GB").slice(0, 100) : "",
    filter,
    page,
    child: typeof params.child === "string" && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(params.child)
      ? params.child : undefined,
  };
}

type CatalogueLocation = ReturnType<typeof readCatalogueQuery>;

function catalogueParams({ q, filter, page, child }: CatalogueLocation) {
  const params = new URLSearchParams({ q, filter, page: String(page) });
  if (child) params.set("child", child);
  return params;
}

export function catalogueHref(location: CatalogueLocation, wordId?: string) {
  const params = catalogueParams(location);
  if (wordId) params.set("resume", wordId);
  return `${CATALOGUE_PATH}?${params}#${wordId ? `catalogue-word-${wordId}` : "dictionary-word-search"}`;
}

export function catalogueWordHref(wordId: string, location: CatalogueLocation, section = "") {
  const params = catalogueParams(location);
  params.set("from", "catalogue");
  return `${CATALOGUE_PATH}/${wordId}?${params}${section}`;
}

export function withCatalogueOrigin(params: CatalogueQuery, target: URLSearchParams) {
  if (params.from !== "catalogue") return target;
  for (const [key, value] of catalogueParams(readCatalogueQuery(params))) target.set(key, value);
  target.set("from", "catalogue");
  return target;
}
