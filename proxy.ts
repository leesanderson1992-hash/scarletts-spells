import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { shouldPreAuthNotFoundDynamicPrefixQa } from "@/lib/adle/morphology/dynamic-prefix-qa-policy";
import { readSupabaseEnv } from "@/lib/supabase/env";

import { authCheckOutcome, authFetch, reportAuthUnavailable } from "@/lib/supabase/auth-check";
import { authCheckProofFetch } from "@/lib/supabase/auth-check-proof";
import { authRetryResponse } from "@/lib/supabase/auth-retry-response";

const protectedRoutes = [
  "/admin",
  "/dashboard",
  "/children",
  "/analyse",
  "/review",
  "/insights",
  "/settings",
];

function isProtectedPath(pathname: string) {
  return protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function copyResponseState(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });

  // NextResponse.next() carries internal request-override headers. They must
  // never be copied onto a redirect or a retry response.
  for (const name of ["cache-control", "pragma", "expires"]) {
    const value = from.headers.get(name);
    if (value) to.headers.set(name, value);
  }
}

function requestHeadersWithPath(request: NextRequest, pathname: string) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-scarletts-pathname", pathname);
  return requestHeaders;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (shouldPreAuthNotFoundDynamicPrefixQa(pathname, process.env)) {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const env = readSupabaseEnv();
  const requestHeaders = requestHeadersWithPath(request, pathname);

  if (!env) {
    if (isProtectedPath(pathname)) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set(
        "error",
        "This deployment is missing Supabase environment variables in Vercel.",
      );
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  const { url, anonKey } = env;
  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (pathname === "/login") {
    return response;
  }

  const cookieChanges = new Map<string, { name: string; value: string; options?: import("@supabase/ssr").CookieOptions }>();
  const supabase = createServerClient(url, anonKey, {
    global: { fetch: authFetch(authCheckProofFetch(request.nextUrl, process.env)) },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const cookie of cookiesToSet) cookieChanges.set(cookie.name, cookie);
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request: { headers: requestHeadersWithPath(request, pathname) },
        });

        cookieChanges.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });

        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  let outcome: ReturnType<typeof authCheckOutcome>;
  try { outcome = authCheckOutcome(await supabase.auth.getUser()); }
  catch { outcome = "unavailable"; }
  if (outcome === "unavailable") {
    reportAuthUnavailable("proxy");
    const retryTarget = request.nextUrl.clone();
    retryTarget.searchParams.delete("__auth_check_proof");
    const retry = authRetryResponse(retryTarget);
    const refreshed = [...cookieChanges.values()].some(cookie =>
      /-auth-token(?:\.\d+)?$/.test(cookie.name) && cookie.value);
    for (const cookie of cookieChanges.values()) {
      // A transient failure must not clear the original session. Successful
      // rotation (including chunk cleanup) still reaches the browser.
      if (!refreshed && /-auth-token(?:\.\d+)?$/.test(cookie.name) && !cookie.value) continue;
      retry.cookies.set(cookie.name, cookie.value, cookie.options);
    }
    return retry;
  }
  const user = outcome === "authenticated";

  if (!user && isProtectedPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    const redirectResponse = NextResponse.redirect(loginUrl);
    copyResponseState(response, redirectResponse);
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/children/:path*", "/analyse/:path*", "/review/:path*", "/insights/:path*", "/settings/:path*", "/learn/:path*", "/courses/:path*", "/practice/:path*", "/assignments/:path*"],
};
