import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readSupabaseEnv } from "@/lib/supabase/env";

const protectedRoutes = [
  "/admin",
  "/dashboard",
  "/assignments",
  "/children",
  "/analyse",
  "/practice",
  "/review",
  "/insights",
  "/settings",
];

async function withAuthTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function isProtectedPath(pathname: string) {
  return protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function copyResponseState(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });

  from.headers.forEach((value, key) => {
    to.headers.set(key, value);
  });
}

export async function proxy(request: NextRequest) {
  const env = readSupabaseEnv();
  const { pathname } = request.nextUrl;

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
      request,
    });
  }

  const { url, anonKey } = env;
  let response = NextResponse.next({
    request,
  });

  if (pathname === "/login") {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });

        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  const authResult = await withAuthTimeout(supabase.auth.getUser(), 2500);
  const user = authResult?.data.user ?? null;

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
  matcher: ["/admin/:path*", "/dashboard/:path*", "/assignments/:path*", "/children/:path*", "/analyse/:path*", "/practice/:path*", "/review/:path*", "/insights/:path*", "/settings/:path*"],
};
