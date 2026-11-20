/** Authentication can be unavailable without the session being invalid. */
type AuthResult = { data: { user: unknown | null }; error: { name?: string; status?: number; code?: string } | null };
export function authCheckOutcome(result: AuthResult): "authenticated" | "anonymous" | "unavailable" {
  if (result.error) {
    const error = result.error;
    if (error.name === "AuthRetryableFetchError" || error.status === 0 ||
      error.status === 429 || (error.status ?? 0) >= 500) return "unavailable";
    if (error.name === "AuthSessionMissingError" ||
      ["bad_jwt", "user_not_found", "user_banned", "session_not_found", "session_expired",
        "refresh_token_not_found", "refresh_token_already_used"].includes(error.code ?? "") ||
      error.status === 401 || error.status === 403) return "anonymous";
    return "unavailable";
  }
  return result.data.user ? "authenticated" : "anonymous";
}

/** Abort the transport, never race a still-running token refresh against a
 * redirect. The SDK receives a retryable fetch error and keeps its session. */
export function authFetch(fetcher: typeof fetch = fetch, timeoutMs = 8000): typeof fetch {
  return async (input, init) => {
    const address = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!new URL(address).pathname.startsWith("/auth/v1/")) return fetcher(input, init);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    try {
      return await fetcher(input, { ...init, signal: signal
        ? AbortSignal.any([signal, controller.signal]) : controller.signal });
    } finally { clearTimeout(timer); }
  };
}

export class AuthCheckUnavailableError extends Error {
  constructor() { super("Authentication is temporarily unavailable. Retry this page."); this.name = "AuthCheckUnavailableError"; }
}

export function reportAuthUnavailable(layer: "proxy" | "server") {
  // No URL, account identifier, cookie, token or provider error text in logs.
  console.warn("auth_check_unavailable", { layer });
}
