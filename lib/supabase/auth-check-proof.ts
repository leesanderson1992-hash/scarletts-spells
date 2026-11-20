/** Fault injection only on a pinned staging Preview. It can delay or reject an
 * auth check; it can never supply a user or bypass authentication. */
export function authCheckProofFetch(target: URL, environment: Record<string, string | undefined>, fetcher: typeof fetch = fetch): typeof fetch {
  if (environment.AUTH_SESSION_PROOF_ENABLED !== "enabled" || environment.VERCEL_ENV !== "preview" ||
    environment.ADLE_ROUTE_ACTIVATION_ENVIRONMENT !== "staging" ||
    environment.NEXT_PUBLIC_SUPABASE_URL !== "https://qkpjbajicacbrphthibk.supabase.co") return fetcher;
  const mode = target.searchParams.get("__auth_check_proof");
  if (mode !== "slow" && mode !== "unavailable") return fetcher;
  return async (input, init) => {
    const address = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (new URL(address).pathname === "/auth/v1/user") {
      if (mode === "unavailable") return new Response(JSON.stringify({ message: "Staging authentication availability proof" }),
        { status: 503, headers: { "content-type": "application/json" } });
      await new Promise(resolve => setTimeout(resolve, 3200));
    }
    return fetcher(input, init);
  };
}
