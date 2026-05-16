"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }

    if (!trimmedPassword) {
      setError("Please enter your password.");
      return;
    }

    startTransition(async () => {
      let supabase;

      try {
        supabase = createClient();
      } catch (clientError) {
        setError(
          clientError instanceof Error
            ? clientError.message
            : "This deployment is missing its Supabase configuration.",
        );
        return;
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: trimmedPassword,
      });

      if (authError) {
        setError(
          authError.message === "Invalid login credentials"
            ? "Invalid email or password."
            : authError.message,
        );
        return;
      }

      router.push("/dashboard");
      router.refresh();
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
          Enter your email and password to continue to your dashboard.
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

        <label className="grid gap-2 text-sm font-medium text-[color:var(--mid)]">
          Password
          <input
            type="password"
            name="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="brand-input h-11 rounded-2xl px-4 text-sm transition"
            placeholder="Enter your password"
          />
        </label>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        <button
          type="submit"
          disabled={isPending}
          className="brand-primary-btn disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Signing in..." : "Sign in"}
        </button>
      </div>
    </form>
  );
}
