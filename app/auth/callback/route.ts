import { createServerClient } from "@supabase/ssr";
import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getSupabaseEnv, readSupabaseEnv } from "@/lib/supabase/env";

function getSafeNextPath(next: string | null) {
  if (!next || !next.startsWith("/")) {
    return "/dashboard";
  }

  if (next.startsWith("//")) {
    return "/dashboard";
  }

  return next;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const next = getSafeNextPath(requestUrl.searchParams.get("next"));
  const loginUrl = new URL("/login", request.url);

  if (!readSupabaseEnv()) {
    loginUrl.searchParams.set(
      "error",
      "This deployment is missing Supabase environment variables in Vercel.",
    );
    return NextResponse.redirect(loginUrl);
  }

  const { url, anonKey } = getSupabaseEnv();

  // The callback needs to attach any session cookies to the same response
  // object that performs the redirect, otherwise production can appear to
  // "forget" the login immediately after a magic link is opened.
  let response = NextResponse.redirect(new URL(next, request.url));

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return response;
    }
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!error) {
      return response;
    }
  }

  loginUrl.searchParams.set("error", "We could not complete sign in. Please try again.");
  return NextResponse.redirect(loginUrl);
}
