import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const resolvedSearchParams = await searchParams;

  if (user) {
    redirect("/dashboard");
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
            Enter your email to get a magic link and continue to your dashboard.
          </p>
        </div>

        <LoginForm />

        {resolvedSearchParams?.error ? (
          <p className="mt-4 text-center text-sm text-rose-600">
            {resolvedSearchParams.error}
          </p>
        ) : null}

        <p className="brand-copy mt-6 text-center text-sm">
          Signed in already?{" "}
          <Link href="/dashboard" className="brand-link font-medium">
            Go to dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}
