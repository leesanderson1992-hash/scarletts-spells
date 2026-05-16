import Link from "next/link";
import { redirect } from "next/navigation";

import { readSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const isSupabaseConfigured = Boolean(readSupabaseEnv());

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      redirect("/dashboard");
    }
  }

  return (
    <main className="brand-page flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="brand-eyebrow">
            Scarlett&apos;s Spells
          </p>
          <h1 className="brand-title mt-3 text-4xl font-semibold tracking-tight">
            Parent login
          </h1>
          <p className="brand-copy mt-3 text-sm leading-6">
            Enter your email and password to continue to your dashboard.
          </p>
        </div>

        {isSupabaseConfigured ? (
          <LoginForm />
        ) : (
          <div className="brand-card rounded-3xl p-6">
            <h2 className="brand-title text-2xl font-semibold">Site setup needed</h2>
            <p className="brand-copy mt-3 text-sm leading-6">
              This deployment is missing `NEXT_PUBLIC_SUPABASE_URL` and/or
              `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel.
            </p>
            <p className="brand-copy mt-3 text-sm leading-6">
              Add both environment variables in the Vercel project settings, then
              redeploy.
            </p>
          </div>
        )}

        {resolvedSearchParams?.error ? (
          <p className="mt-4 text-center text-sm text-rose-600">
            {resolvedSearchParams.error}
          </p>
        ) : null}

        {isSupabaseConfigured ? (
          <p className="brand-copy mt-6 text-center text-sm">
            Signed in already?{" "}
            <Link href="/dashboard" className="brand-link font-medium">
              Go to dashboard
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}
