"use client";

import { useState, useTransition } from "react";

import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=/dashboard`;
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: false,
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      setMessage("Check your email for the magic link.");
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="brand-card rounded-3xl p-6"
    >
      <div className="mb-5">
        <h2 className="brand-title text-2xl font-semibold">Email login</h2>
        <p className="brand-copy mt-1 text-sm">
          Enter your email and we&apos;ll send you a secure sign-in link.
        </p>
      </div>

      <div className="grid gap-4">
        <label className="grid gap-2 text-sm font-medium text-[color:var(--mid)]">
          Email
          <input
            type="email"
            name="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="brand-input h-11 rounded-2xl px-4 text-sm transition"
            placeholder="parent@example.com"
          />
        </label>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-600">{message}</p> : null}

        <button
          type="submit"
          disabled={isPending}
          className="brand-primary-btn disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Sending..." : "Send magic link"}
        </button>
      </div>
    </form>
  );
}
