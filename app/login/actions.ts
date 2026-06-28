"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function loginRedirectWithError(message: string) {
  const params = new URLSearchParams({ error: message });
  return `/login?${params.toString()}`;
}

export async function signInWithPasswordAction(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  const trimmedEmail = typeof email === "string" ? email.trim() : "";
  const trimmedPassword = typeof password === "string" ? password.trim() : "";

  if (!trimmedEmail) {
    redirect(loginRedirectWithError("Please enter your email address."));
  }

  if (!trimmedPassword) {
    redirect(loginRedirectWithError("Please enter your password."));
  }

  let supabase;

  try {
    supabase = await createClient();
  } catch (clientError) {
    redirect(
      loginRedirectWithError(
        clientError instanceof Error
          ? clientError.message
          : "This deployment is missing its Supabase configuration.",
      ),
    );
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: trimmedEmail,
    password: trimmedPassword,
  });

  if (error) {
    redirect(
      loginRedirectWithError(
        error.message === "Invalid login credentials"
          ? "Invalid email or password."
          : error.message,
      ),
    );
  }

  redirect("/dashboard");
}
