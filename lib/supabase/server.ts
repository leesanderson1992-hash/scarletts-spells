import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authCheckOutcome, authFetch, AuthCheckUnavailableError, reportAuthUnavailable } from "./auth-check";
import { getSupabaseEnv } from "./env";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  const client = createServerClient(url, anonKey, {
    global: { fetch: authFetch() },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Ignore cookie writes when called from a Server Component.
        }
      },
    },
  });
  const getUser = client.auth.getUser.bind(client.auth);
  client.auth.getUser = async (...args: Parameters<typeof getUser>) => {
    const result = await getUser(...args);
    if (authCheckOutcome(result) === "unavailable") {
      reportAuthUnavailable("server");
      throw new AuthCheckUnavailableError();
    }
    return result;
  };
  return client;
}
